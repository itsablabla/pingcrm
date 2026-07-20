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
    """Best-effort client IP.

    Caddy terminates TLS and proxies to the backend, so ``request.client.host``
    is the proxy. Prefer the left-most X-Forwarded-For hop it sets.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


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
