"""Hindsight long-term memory integration.

Talks to a Hindsight MCP server (streamable HTTP) from the backend so that:
  - drafted messages PULL relevant recalled memories as LLM context, and
  - messages sent through the CRM are RETAINED back into memory.

Every call is best-effort: if Hindsight is unreachable or misconfigured the
callers fall back cleanly (drafts degrade to no added context; sends still
record the Interaction just like before).
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(15.0, connect=8.0)
_DEFAULT_BANK = "pingcrm"


def is_configured() -> bool:
    """True when Hindsight credentials are configured."""
    return bool(settings.HINDSIGHT_MCP_URL and settings.HINDSIGHT_MCP_AUTH)


def contact_tag(contact: Any) -> str:
    """Stable Hindsight tag per contact, e.g. 'pingcrm:jane-doe'.

    Uses the DB id to stay stable even if the display name changes.
    """
    cid = getattr(contact, "id", None)
    slug = None
    name = (getattr(contact, "given_name", None) or getattr(contact, "full_name", None) or "")
    if name:
        slug = name.lower().replace(" ", "-")[:50]
    suffix = str(cid)[:8] if cid else slug or "unknown"
    if slug:
        return f"pingcrm:{slug}:{suffix}"
    return f"pingcrm:{suffix}"


def _bank() -> str:
    return settings.HINDSIGHT_MEMORY_BANK or _DEFAULT_BANK


class HindsightClient:
    """Minimal MCP streamable-HTTP client for the tools we need."""

    def __init__(self, url: str, auth_header: str) -> None:
        self._url = url
        self._headers = {
            "Authorization": auth_header,
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        self._session_id: str | None = None

    # ------------------------------------------------------------------ #
    # Protocol helpers
    # ------------------------------------------------------------------ #
    async def _post(self, payload: dict) -> dict:
        """Send one JSON-RPC message and return the 'result' (or raise)."""
        headers = dict(self._headers)
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(self._url, json=payload, headers=headers)
            resp.raise_for_status()
        sid = resp.headers.get("Mcp-Session-Id")
        if sid:
            self._session_id = sid
        # Handle SSE (streamable HTTP) payloads.
        body = resp.text
        if resp.headers.get("content-type", "").startswith("text/event-stream"):
            data_payload = _first_sse_data(body)
        else:
            data_payload = body
        obj = json.loads(data_payload)
        if "error" in obj:
            raise RuntimeError(obj["error"])
        return obj.get("result", {})

    async def initialize(self) -> dict:
        """Perform the MCP handshake so the server accepts tool calls."""
        return await self._post({
            "jsonrpc": "2.0",
            "id": 0,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "pingcrm-backend", "version": "1.0"},
            },
        })

    async def _call_tool(self, name: str, arguments: dict) -> dict:
        result = await self._post({
            "jsonrpc": "2.0",
            "id": uuid.uuid4().int & ((1 << 31) - 1),
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        })
        return result

    async def ensure_bank(self, bank_id: str | None = None) -> None:
        """Create the memory bank if it does not already exist (idempotent)."""
        bank = bank_id or _bank()
        try:
            await self._call_tool("create_bank", {"bank_id": bank, "name": bank})
        except Exception:
            logger.debug("hindsight ensure_bank %s: %s — assuming exists", bank, exc_info=True)

    # ------------------------------------------------------------------ #
    # Domain calls
    # ------------------------------------------------------------------ #
    async def recall(self, query: str, tags: list[str] | None = None, bank_id: str | None = None) -> str:
        """Search memory and return a compact text bundle for LLM context."""
        args: dict = {"query": query, "bank_id": bank_id or _bank()}
        if tags:
            args["tags"] = tags
            # "any" semantics: memories carry auto-generated tags alongside
            # ours, so strict "all" matching silently returns nothing.
            args["tags_match"] = "any"
        try:
            result = await self._call_tool("recall", args)
            return _text_from_tool_result(result)
        except Exception:
            logger.warning("hindsight recall failed: %s", exc_info=True)
            return ""

    async def retain(
        self,
        content: str,
        context: str | None = None,
        tags: list[str] | None = None,
        bank_id: str | None = None,
    ) -> bool:
        """Store a memory; best-effort, returns success."""
        args: dict = {"content": content, "bank_id": bank_id or _bank()}
        if context:
            args["context"] = context
        if tags:
            args["tags"] = tags
        try:
            await self._call_tool("retain", args)
            return True
        except Exception:
            logger.warning("hindsight retain failed: %s", exc_info=True)
            return False


def _first_sse_data(body: str) -> str:
    """Pull the first 'data: ' line out of an SSE response body."""
    for line in body.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            payload = line[len("data:"):].strip()
            return payload
    # Fallback: some servers send plain JSON even on the collection event.
    return body


def _text_from_tool_result(result: dict) -> str:
    """Extract a readable text summary from an MCP tools/call result."""
    try:
        content = result.get("content") or []
        pieces = []
        for item in content:
            if item.get("type") == "text":
                pieces.append(item.get("text", ""))
            elif item.get("type") == "resource":
                res = item.get("resource", {})
                pieces.append(str(res.get("text", "")))
        text = "\n".join(p for p in pieces if p)
        if text:
            return text
        # Structured result — dump as JSON.
        structured = result.get("structuredContent")
        return json.dumps(structured, ensure_ascii=False) if structured else ""
    except Exception:
        logger.warning("hindsight result parse failed: %s", exc_info=True)
        return ""


async def get_client() -> HindsightClient | None:
    """Return a handshaken client, or None if not configured."""
    if not is_configured():
        return None
    client = HindsightClient(settings.HINDSIGHT_MCP_URL, settings.HINDSIGHT_MCP_AUTH)
    try:
        await client.initialize()
        await client.ensure_bank()
    except Exception:
        logger.warning("hindsight init failed: %s", exc_info=True)
        return None
    return client
