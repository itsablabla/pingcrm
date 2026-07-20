"""Fixed-window rate limiting for unauthenticated endpoints.

Backed by Redis so the counter is shared across backend replicas. The window is
a plain ``INCR`` + ``EXPIRE`` on first hit, which is coarse (a burst can straddle
two windows) but is the right trade for auth throttling: it costs one round-trip
and needs no Lua.

Fails **open** on Redis errors. A Redis outage must not lock every user out of
login — the throttle is a brute-force speed bump, not an authorization control.
"""
from __future__ import annotations

import logging

from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.redis import get_redis

logger = logging.getLogger(__name__)


def client_ip(request: Request) -> str:
    """Best-effort client IP, resistant to X-Forwarded-For spoofing.

    Caddy terminates TLS and *appends* the peer address to any client-supplied
    ``X-Forwarded-For`` rather than replacing it. The left-most hop is therefore
    fully attacker-controlled: a caller sending ``X-Forwarded-For: 1.2.3.4``
    lands in a bucket of their choosing and defeats the throttle entirely.

    Only the right-most entries are trustworthy — those were appended by our own
    proxies. We skip ``TRUSTED_PROXY_HOPS - 1`` trailing hops and take the next
    one, which is the address our outermost trusted proxy observed.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        hops = [h.strip() for h in forwarded.split(",") if h.strip()]
        trusted = max(1, settings.TRUSTED_PROXY_HOPS)
        if len(hops) >= trusted:
            return hops[-trusted]
        # Fewer hops than configured: the header did not traverse the expected
        # proxy chain, so nothing in it is trustworthy. Fall through to the peer.
    return request.client.host if request.client else "unknown"


async def enforce_llm_rate_limit(user_id: str) -> None:
    """Throttle per-user calls to endpoints that hit the Anthropic API.

    These endpoints are authenticated and user-scoped, so this is not an
    anti-abuse control against anonymous traffic — it caps the damage a single
    stolen token can do to the API bill.
    """
    if not settings.LLM_RATE_LIMIT_ENABLED:
        return
    await _enforce(
        key=f"ratelimit:llm:{user_id}",
        bucket="llm",
        subject=user_id,
        limit=settings.LLM_RATE_LIMIT_ATTEMPTS,
        window_seconds=settings.LLM_RATE_LIMIT_WINDOW_SECONDS,
    )


async def _enforce(
    *, key: str, bucket: str, subject: str, limit: int, window_seconds: int
) -> None:
    """Shared fixed-window INCR/EXPIRE. Fails open on Redis errors."""
    try:
        r = get_redis()
        count = await r.incr(key)
        if count == 1:
            await r.expire(key, window_seconds)
    except Exception:
        logger.warning(
            "rate limit check failed, allowing request",
            exc_info=True,
            extra={"operation": "enforce_rate_limit", "bucket": bucket, "subject": subject},
        )
        return

    if count > limit:
        logger.warning(
            "rate limit exceeded",
            extra={
                "operation": "enforce_rate_limit",
                "bucket": bucket,
                "subject": subject,
                "count": count,
                "limit": limit,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please try again later.",
            headers={"Retry-After": str(window_seconds)},
        )


async def enforce_rate_limit(
    request: Request, *, bucket: str, limit: int, window_seconds: int
) -> None:
    """Raise 429 when the caller has exceeded ``limit`` hits in ``window_seconds``.

    ``bucket`` namespaces the counter so login and register throttle independently.
    """
    if not settings.AUTH_RATE_LIMIT_ENABLED:
        return

    ip = client_ip(request)
    key = f"ratelimit:{bucket}:{ip}"

    try:
        r = get_redis()
        count = await r.incr(key)
        if count == 1:
            await r.expire(key, window_seconds)
    except Exception:
        logger.warning(
            "rate limit check failed, allowing request",
            exc_info=True,
            extra={"operation": "enforce_rate_limit", "bucket": bucket, "client_ip": ip},
        )
        return

    if count > limit:
        logger.warning(
            "rate limit exceeded",
            extra={
                "operation": "enforce_rate_limit",
                "bucket": bucket,
                "client_ip": ip,
                "count": count,
                "limit": limit,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please try again later.",
            headers={"Retry-After": str(window_seconds)},
        )
