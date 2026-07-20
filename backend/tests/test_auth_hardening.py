"""Registration gating and auth rate limiting.

Context: two accounts (attacker@test.com / attacker2@test.com) were created
against production through the open registration endpoint on 2026-04-16. They
were inert, but registration was public and unthrottled on a single-player app.
"""
from unittest.mock import patch

import fakeredis.aioredis
import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.fixture
def fake_redis():
    """Per-test Redis so rate-limit counters never leak between tests."""
    fr = fakeredis.aioredis.FakeRedis(decode_responses=True)
    with patch("app.core.redis.get_redis", return_value=fr), \
         patch("app.core.rate_limit.get_redis", return_value=fr):
        yield fr


@pytest.fixture
def registration_disabled():
    prev = settings.ALLOW_REGISTRATION
    settings.ALLOW_REGISTRATION = False
    yield
    settings.ALLOW_REGISTRATION = prev


@pytest.fixture
def throttling_enabled():
    prev = settings.AUTH_RATE_LIMIT_ENABLED
    settings.AUTH_RATE_LIMIT_ENABLED = True
    yield
    settings.AUTH_RATE_LIMIT_ENABLED = prev


@pytest.mark.asyncio
async def test_register_forbidden_when_disabled(client: AsyncClient, registration_disabled):
    resp = await client.post("/api/v1/auth/register", json={
        "email": "attacker@test.com",
        "password": "password123",
        "full_name": "x",
    })
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Registration is disabled"


@pytest.mark.asyncio
async def test_register_disabled_creates_no_user(client: AsyncClient, registration_disabled):
    """The gate must reject before the INSERT, not merely hide the response."""
    await client.post("/api/v1/auth/register", json={
        "email": "attacker@test.com",
        "password": "password123",
        "full_name": "x",
    })

    settings.ALLOW_REGISTRATION = True
    login = await client.post("/api/v1/auth/login", data={
        "username": "attacker@test.com",
        "password": "password123",
    })
    assert login.status_code == 401


@pytest.mark.asyncio
async def test_register_allowed_when_enabled(client: AsyncClient):
    """The autouse test default enables registration, so this is the happy path."""
    resp = await client.post("/api/v1/auth/register", json={
        "email": "legit@example.com",
        "password": "password123",
        "full_name": "Legit",
    })
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_login_throttled_after_limit(client: AsyncClient, fake_redis, throttling_enabled):
    payload = {"username": "nobody@example.com", "password": "wrong-password"}

    for _ in range(settings.LOGIN_RATE_LIMIT_ATTEMPTS):
        resp = await client.post("/api/v1/auth/login", data=payload)
        assert resp.status_code == 401  # wrong creds, but not yet throttled

    resp = await client.post("/api/v1/auth/login", data=payload)
    assert resp.status_code == 429
    assert resp.headers["Retry-After"] == str(settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS)


@pytest.mark.asyncio
async def test_register_throttled_after_limit(client: AsyncClient, fake_redis, throttling_enabled):
    for i in range(settings.REGISTER_RATE_LIMIT_ATTEMPTS):
        resp = await client.post("/api/v1/auth/register", json={
            "email": f"user{i}@example.com",
            "password": "password123",
            "full_name": f"User {i}",
        })
        assert resp.status_code == 201

    resp = await client.post("/api/v1/auth/register", json={
        "email": "overflow@example.com",
        "password": "password123",
        "full_name": "Overflow",
    })
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_login_and_register_throttle_independently(
    client: AsyncClient, fake_redis, throttling_enabled
):
    """Exhausting the register bucket must not lock the legitimate user out of login."""
    for i in range(settings.REGISTER_RATE_LIMIT_ATTEMPTS + 1):
        await client.post("/api/v1/auth/register", json={
            "email": f"bucket{i}@example.com",
            "password": "password123",
            "full_name": f"Bucket {i}",
        })

    resp = await client.post("/api/v1/auth/login", data={
        "username": "bucket0@example.com",
        "password": "password123",
    })
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_rate_limit_fails_open_when_redis_down(client: AsyncClient, throttling_enabled):
    """A Redis outage must not lock users out of login."""
    with patch("app.core.rate_limit.get_redis", side_effect=ConnectionError("redis down")):
        resp = await client.post("/api/v1/auth/login", data={
            "username": "nobody@example.com",
            "password": "wrong-password",
        })
    assert resp.status_code == 401  # rejected on credentials, not on throttle
