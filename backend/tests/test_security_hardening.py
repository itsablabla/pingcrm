"""Security regressions found in the 2026-07-20 audit.

Three distinct issues, all previously exploitable or latent:

1. ``client_ip`` read the left-most X-Forwarded-For hop. Caddy *appends* the
   real peer to whatever the client sent, so the left-most value was fully
   attacker-controlled — every login attempt could claim a fresh IP and land in
   its own Redis bucket, defeating the throttle entirely.
2. JWTs carried no version, so changing a password did not invalidate tokens
   already issued. A stolen token stayed valid for up to 30 days.
3. The WhatsApp webhook skipped HMAC verification whenever the secret was
   unset, and it takes ``user_id`` from the request body — an unset env var
   would have turned it into an unauthenticated cross-account write.
"""
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import fakeredis.aioredis
import jwt
import pytest
from httpx import AsyncClient

from app.core.auth import token_version_matches
from app.core.config import settings
from app.core.rate_limit import client_ip


@pytest.fixture
def fake_redis():
    fr = fakeredis.aioredis.FakeRedis(decode_responses=True)
    with patch("app.core.redis.get_redis", return_value=fr), \
         patch("app.core.rate_limit.get_redis", return_value=fr):
        yield fr


def _request(xff: str | None, peer: str = "172.18.0.8"):
    """Minimal stand-in for a Starlette Request as client_ip uses it."""
    headers = {"x-forwarded-for": xff} if xff is not None else {}
    return SimpleNamespace(
        headers=headers,
        client=SimpleNamespace(host=peer),
    )


# ---------------------------------------------------------------------------
# 1. X-Forwarded-For spoofing
# ---------------------------------------------------------------------------


def test_client_ip_ignores_spoofed_leftmost_hop():
    """The attacker-supplied left-most entry must never be used as the key."""
    # Caddy appended 203.0.113.7; the client claimed to be 1.2.3.4.
    req = _request("1.2.3.4, 203.0.113.7")
    assert client_ip(req) == "203.0.113.7"


def test_client_ip_spoof_cannot_shard_the_bucket():
    """Distinct spoofed prefixes must all resolve to the same real client."""
    resolved = {
        client_ip(_request(f"10.0.0.{n}, 203.0.113.7"))
        for n in range(1, 20)
    }
    assert resolved == {"203.0.113.7"}


def test_client_ip_single_hop_is_the_proxy_appended_one():
    assert client_ip(_request("203.0.113.7")) == "203.0.113.7"


def test_client_ip_falls_back_to_peer_when_header_absent():
    assert client_ip(_request(None, peer="198.51.100.2")) == "198.51.100.2"


def test_client_ip_falls_back_when_chain_shorter_than_expected():
    """Fewer hops than configured means the header skipped our proxy chain."""
    with patch.object(settings, "TRUSTED_PROXY_HOPS", 2):
        # Only one hop present but two expected — nothing here is trustworthy.
        assert client_ip(_request("1.2.3.4", peer="198.51.100.2")) == "198.51.100.2"


def test_client_ip_respects_additional_trusted_hop():
    """With two proxies, the client is second from the right."""
    with patch.object(settings, "TRUSTED_PROXY_HOPS", 2):
        req = _request("1.2.3.4, 203.0.113.7, 172.18.0.8")
        assert client_ip(req) == "203.0.113.7"


@pytest.mark.asyncio
async def test_login_throttle_survives_xff_spoofing(client: AsyncClient, fake_redis):
    """Rotating X-Forwarded-For must not buy extra login attempts."""
    prev = settings.AUTH_RATE_LIMIT_ENABLED
    settings.AUTH_RATE_LIMIT_ENABLED = True
    try:
        statuses = []
        for n in range(settings.LOGIN_RATE_LIMIT_ATTEMPTS + 4):
            resp = await client.post(
                "/api/v1/auth/login",
                data={"username": "nobody@test.com", "password": "wrong"},
                headers={"X-Forwarded-For": f"1.2.3.{n}, 203.0.113.7"},
            )
            statuses.append(resp.status_code)
        assert 429 in statuses, (
            "throttle never fired despite a rotating X-Forwarded-For — "
            f"saw {statuses}"
        )
    finally:
        settings.AUTH_RATE_LIMIT_ENABLED = prev


# ---------------------------------------------------------------------------
# 2. Token revocation
# ---------------------------------------------------------------------------


def test_token_version_matches_on_equal_versions():
    assert token_version_matches({"tv": 3}, SimpleNamespace(token_version=3))


def test_token_version_rejects_stale_token():
    """A token minted before a password change must not validate."""
    assert not token_version_matches({"tv": 0}, SimpleNamespace(token_version=1))


def test_legacy_token_without_tv_treated_as_version_zero():
    """Tokens predating the claim keep working until the first bump."""
    assert token_version_matches({}, SimpleNamespace(token_version=0))
    assert not token_version_matches({}, SimpleNamespace(token_version=1))


@pytest.mark.asyncio
async def test_password_change_invalidates_existing_token(
    client: AsyncClient, auth_headers, test_user
):
    """The core of the fix: the old token stops working after a change."""
    old_headers = dict(auth_headers)

    resp = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "testpass123", "new_password": "newpassword123"},
        headers=old_headers,
    )
    assert resp.status_code == 200, resp.text

    # The caller gets a replacement so they are not logged out by their own change.
    new_token = resp.json()["data"].get("access_token")
    assert new_token, "change-password must return a replacement token"

    # The pre-change token is now dead.
    stale = await client.get("/api/v1/auth/me", headers=old_headers)
    assert stale.status_code == 401, (
        "token issued before the password change still validates — "
        "a stolen token would survive the user's attempt to evict it"
    )

    # The replacement works.
    fresh = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {new_token}"}
    )
    assert fresh.status_code == 200


@pytest.mark.asyncio
async def test_extension_refresh_rejects_stale_version(client: AsyncClient, test_user):
    """The 90-day refresh grace must not resurrect a revoked session."""
    stale = jwt.encode(
        {
            "sub": str(test_user.id),
            "aud": "pingcrm-extension",
            "tv": (test_user.token_version or 0) + 1,  # user is behind this token
            "exp": datetime.now(UTC) - timedelta(days=1),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    resp = await client.post("/api/v1/extension/refresh", json={"token": stale})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 3. WhatsApp webhook fail-closed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_webhook_rejects_unsigned_request(client: AsyncClient):
    prev = settings.WHATSAPP_WEBHOOK_SECRET
    settings.WHATSAPP_WEBHOOK_SECRET = "a" * 64
    try:
        resp = await client.post(
            "/api/v1/webhooks/whatsapp",
            json={"type": "session_disconnected", "user_id": "x"},
        )
        assert resp.status_code == 401
    finally:
        settings.WHATSAPP_WEBHOOK_SECRET = prev


@pytest.mark.asyncio
async def test_webhook_refuses_traffic_when_secret_unset(client: AsyncClient):
    """Previously this skipped verification entirely and accepted the write."""
    prev = settings.WHATSAPP_WEBHOOK_SECRET
    settings.WHATSAPP_WEBHOOK_SECRET = ""
    try:
        resp = await client.post(
            "/api/v1/webhooks/whatsapp",
            json={"type": "session_disconnected", "user_id": "x"},
        )
        assert resp.status_code == 503, (
            "webhook accepted an unsigned request with no secret configured — "
            "this is an unauthenticated cross-account write"
        )
    finally:
        settings.WHATSAPP_WEBHOOK_SECRET = prev
