"""Beeper integration — HTTP client for the Beeper unified messaging API.

Beeper bridges WhatsApp/Telegram/Slack/Discord/Signal/iMessage behind one
REST API (spec at ``/v1/spec``).  This client covers the surface PingCRM
needs: server info, account discovery, cursor-paginated chat/message listing,
message search with date filters, and sends (which return a
``pendingMessageID`` that is later resolved to the real message ID).

Authentication is a deployment-level bearer token (``BEEPER_API_TOKEN``);
per-user enablement is tracked on the user row.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 30.0
BACKFILL_TIMEOUT = 120.0

# Retry/backoff: transient server errors and rate limits.
_RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 1.0  # seconds; doubled each attempt


class BeeperError(Exception):
    """Base error for Beeper API failures."""


class BeeperAuthError(BeeperError):
    """Token missing, invalid, or revoked (401/403)."""


class BeeperNotFoundError(BeeperError):
    """Requested chat/message does not exist (404)."""


class BeeperUnavailableError(BeeperError):
    """Non-retryable client error or retries exhausted (4xx/5xx)."""


def _exc_for_status(status_code: int, url: str, body: str) -> BeeperError:
    snippet = body[:200] if body else ""
    if status_code in (401, 403):
        return BeeperAuthError(f"Beeper API rejected credentials ({status_code}) at {url}: {snippet}")
    if status_code == 404:
        return BeeperNotFoundError(f"Beeper API resource not found at {url}: {snippet}")
    return BeeperUnavailableError(
        f"Beeper API request failed ({status_code}) at {url}: {snippet}"
    )


class BeeperClient:
    """Thin async wrapper around the Beeper Client API.

    All list endpoints use opaque cursors: responses carry ``items`` plus
    ``oldestCursor``/``newestCursor``/``hasMore``; pagination requests pass
    ``cursor`` + ``direction`` (``before`` → older, ``after`` → newer).
    """

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.base_url = (base_url or settings.BEEPER_API_BASE_URL).rstrip("/")
        self.token = token if token is not None else settings.BEEPER_API_TOKEN
        self.timeout = timeout

    @property
    def is_configured(self) -> bool:
        return bool(self.token)

    # ------------------------------------------------------------------
    # Request plumbing
    # ------------------------------------------------------------------

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> Any:
        if not self.token:
            raise BeeperAuthError(
                "BEEPER_API_TOKEN is not configured — set it to enable the Beeper channel"
            )
        headers = {"Authorization": f"Bearer {self.token}"}
        url = f"{self.base_url}{path}"

        last_error: BeeperError | None = None
        for attempt in range(_MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout or self.timeout) as client:
                    resp = await client.request(
                        method, url, headers=headers, params=params, json=json
                    )
            except httpx.HTTPError as exc:
                last_error = BeeperUnavailableError(f"Beeper API transport error at {url}: {exc}")
            else:
                if resp.status_code in _RETRYABLE_STATUS:
                    last_error = _exc_for_status(resp.status_code, url, resp.text)
                elif resp.status_code >= 400:
                    # Non-retryable client error — fail immediately.
                    raise _exc_for_status(resp.status_code, url, resp.text)
                else:
                    if not resp.content:
                        return None
                    try:
                        return resp.json()
                    except ValueError as exc:
                        raise BeeperUnavailableError(
                            f"Beeper API returned invalid JSON at {url}: {exc}"
                        ) from exc

            if attempt < _MAX_RETRIES:
                # 429 responses may carry Retry-After; honor it when sane.
                delay = _RETRY_BASE_DELAY * (2**attempt)
                logger.warning(
                    "Beeper API retryable failure (attempt %d/%d) at %s — retrying in %.1fs",
                    attempt + 1, _MAX_RETRIES + 1, url, delay,
                )
                await asyncio.sleep(delay)

        raise last_error or BeeperUnavailableError(f"Beeper API request failed at {url}")

    # ------------------------------------------------------------------
    # Server / accounts
    # ------------------------------------------------------------------

    async def get_info(self) -> dict:
        """GET /v1/info — server/app info; doubles as a token health check."""
        data = await self._request("GET", "/v1/info")
        return data or {}

    async def list_accounts(self) -> list[dict]:
        """GET /v1/accounts — bridged accounts (one per network login)."""
        data = await self._request("GET", "/v1/accounts")
        if isinstance(data, list):
            return data
        return list((data or {}).get("items", []))

    # ------------------------------------------------------------------
    # Chats
    # ------------------------------------------------------------------

    async def list_chats(
        self,
        *,
        cursor: str | None = None,
        direction: str | None = None,
        account_ids: list[str] | None = None,
    ) -> dict:
        """GET /v1/chats — one page of chats ordered by last activity.

        Returns ``{items, hasMore, oldestCursor, newestCursor}``.
        """
        params: dict[str, Any] = {}
        if cursor:
            params["cursor"] = cursor
        if direction:
            params["direction"] = direction
        if account_ids:
            params["accountIDs"] = account_ids
        data = await self._request("GET", "/v1/chats", params=params)
        return data or {}

    async def get_chat(self, chat_id: str) -> dict:
        """GET /v1/chats/{chatID} — chat details incl. participants."""
        data = await self._request("GET", f"/v1/chats/{chat_id}")
        return data or {}

    # ------------------------------------------------------------------
    # Messages
    # ------------------------------------------------------------------

    async def list_messages(
        self,
        chat_id: str,
        *,
        cursor: str | None = None,
        direction: str | None = None,
    ) -> dict:
        """GET /v1/chats/{chatID}/messages — one page of messages.

        Returns ``{items, hasMore, oldestCursor, newestCursor}``.
        """
        params: dict[str, Any] = {}
        if cursor:
            params["cursor"] = cursor
        if direction:
            params["direction"] = direction
        data = await self._request("GET", f"/v1/chats/{chat_id}/messages", params=params)
        return data or {}

    async def search_messages(
        self,
        *,
        chat_ids: list[str] | None = None,
        account_ids: list[str] | None = None,
        sender: str | None = None,
        date_after: str | None = None,
        date_before: str | None = None,
        limit: int | None = None,
        cursor: str | None = None,
        direction: str | None = None,
    ) -> dict:
        """GET /v1/messages/search — filtered message search across chats.

        ``date_after``/``date_before`` are ISO 8601 timestamps.  Returns
        ``{items, hasMore, oldestCursor, newestCursor, chats}``.
        """
        params: dict[str, Any] = {}
        if chat_ids:
            params["chatIDs"] = chat_ids
        if account_ids:
            params["accountIDs"] = account_ids
        if sender:
            params["sender"] = sender
        if date_after:
            params["dateAfter"] = date_after
        if date_before:
            params["dateBefore"] = date_before
        if limit is not None:
            params["limit"] = limit
        if cursor:
            params["cursor"] = cursor
        if direction:
            params["direction"] = direction
        data = await self._request("GET", "/v1/messages/search", params=params)
        return data or {}

    async def get_message(self, chat_id: str, message_id: str) -> dict:
        """GET /v1/chats/{chatID}/messages/{messageID} — single message."""
        data = await self._request("GET", f"/v1/chats/{chat_id}/messages/{message_id}")
        return data or {}

    async def send_message(self, chat_id: str, text: str) -> dict:
        """POST /v1/chats/{chatID}/messages — send a text message.

        Returns ``{chatID, pendingMessageID}``.  The pending ID resolves to
        the network message ID once the bridge confirms delivery; poll
        :meth:`get_message` to track it.
        """
        data = await self._request(
            "POST", f"/v1/chats/{chat_id}/messages", json={"text": text}
        )
        return data or {}
