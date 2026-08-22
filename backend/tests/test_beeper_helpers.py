"""Tests for Beeper helpers: identity normalization, contact resolution,
interaction upsert/dedupe, and the cursor-paginated sync walk.

All tests run without network access — API interactions are covered by a
fake client that returns canned cursor pages.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.beeper_helpers import (
    _counterpart_from_chat,
    _is_read_by_recipient,
    _parse_timestamp,
    normalize_phone,
    normalize_telegram_username,
    platform_for_network,
    process_message,
    resolve_contact,
    upsert_beeper_interaction,
)
from app.services.task_jobs.beeper import (
    INCREMENTAL_MAX_AGE,
    INCREMENTAL_OVERLAP,
    MAX_PAGES_PER_CHAT_FULL,
    _enabled_account_ids,
    _floor_for_walk,
    _walk_chat,
)
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.models.user import User


# ---------------------------------------------------------------------------
# Normalization / mapping (pure functions)
# ---------------------------------------------------------------------------


def test_normalize_phone_adds_plus_if_missing():
    assert normalize_phone("15551234567") == "+15551234567"


def test_normalize_phone_passes_through_e164():
    assert normalize_phone("+15551234567") == "+15551234567"


def test_normalize_telegram_username_strips_at():
    assert normalize_telegram_username("@alice") == "alice"


def test_normalize_telegram_username_passthrough():
    assert normalize_telegram_username("alice") == "alice"


def test_platform_for_network_maps_bridged_networks():
    assert platform_for_network("WhatsApp") == "whatsapp"
    assert platform_for_network("telegram") == "telegram"
    assert platform_for_network(" Slack ") == "slack"
    assert platform_for_network("Discord") == "discord"
    assert platform_for_network("signal") == "signal"


def test_platform_for_network_unknown_falls_back_to_beeper():
    assert platform_for_network("imessage") == "beeper"
    assert platform_for_network(None) == "beeper"
    assert platform_for_network("") == "beeper"


# ---------------------------------------------------------------------------
# Chat counterpart extraction + read receipts (pure functions)
# ---------------------------------------------------------------------------


def _single_chat(participants: list[dict]) -> dict:
    return {"id": "chat_1", "type": "single", "participants": {"items": participants}}


def test_counterpart_from_chat_returns_non_self_participant():
    chat = _single_chat(
        [
            {"id": "self_1", "isSelf": True},
            {"id": "other_1", "username": "alice", "fullName": "Alice"},
        ]
    )
    counterpart = _counterpart_from_chat(chat)
    assert counterpart is not None
    assert counterpart["id"] == "other_1"


def test_counterpart_from_chat_group_returns_none():
    assert _counterpart_from_chat({"id": "g", "type": "group"}) is None


def test_counterpart_from_chat_no_id_returns_none():
    chat = _single_chat([{"id": "self_1", "isSelf": True}, {"username": "x"}])
    assert _counterpart_from_chat(chat) is None


def test_read_receipt_inbound_is_none():
    assert _is_read_by_recipient({"isSender": False}) is None


def test_read_receipt_outbound_unseen_is_false():
    assert _is_read_by_recipient({"isSender": True, "seen": []}) is False


def test_read_receipt_outbound_seen_by_other_is_true():
    msg = {
        "isSender": True,
        "seen": [{"isSelf": True}, {"participantID": "other_1", "isSelf": False}],
    }
    assert _is_read_by_recipient(msg) is True


def test_read_receipt_outbound_only_self_seen_is_false():
    msg = {"isSender": True, "seen": [{"isSelf": True}]}
    assert _is_read_by_recipient(msg) is False


def test_parse_timestamp_z_suffix_and_naive():
    parsed = _parse_timestamp("2024-01-15T10:00:00Z")
    assert parsed.tzinfo is not None
    assert parsed.hour == 10 and parsed.day == 15


def test_parse_timestamp_invalid_falls_back_to_now():
    fallback = _parse_timestamp("not-a-date")
    assert fallback.tzinfo is not None
    assert abs((datetime.now(UTC) - fallback).total_seconds()) < 60


# ---------------------------------------------------------------------------
# DB-backed fixtures (same pattern as test_whatsapp_helpers)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(loop_scope="function")
async def user(db: AsyncSession) -> User:
    from app.core.auth import hash_password

    u = User(
        id=uuid.uuid4(),
        email="beeper_test@example.com",
        hashed_password=hash_password("pass"),
        full_name="Beeper Test User",
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


# ---------------------------------------------------------------------------
# resolve_contact
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_contact_creates_new(db: AsyncSession, user: User):
    counterpart = {
        "id": "bp_user_1",
        "username": "alice",
        "fullName": "Alice B",
        "phoneNumber": "+15551110000",
        "network": "WhatsApp",
    }
    contact, is_new = await resolve_contact(counterpart, user.id, db)
    await db.flush()

    assert is_new
    assert contact.source == "beeper"
    assert contact.beeper_user_id == "bp_user_1"
    assert contact.whatsapp_phone == "+15551110000"
    assert contact.full_name == "Alice B"


@pytest.mark.asyncio
async def test_resolve_contact_matches_existing_whatsapp_phone(
    db: AsyncSession, user: User
):
    existing = Contact(
        id=uuid.uuid4(),
        user_id=user.id,
        full_name="Existing Alice",
        whatsapp_phone="+15551110000",
        phones=["+15551110000"],
        source="whatsapp",
    )
    db.add(existing)
    await db.commit()

    counterpart = {
        "id": "bp_user_2",
        "fullName": "Alice B",
        "phoneNumber": "+15551110000",
    }
    contact, is_new = await resolve_contact(counterpart, user.id, db)

    assert not is_new
    assert contact.id == existing.id
    # Identity backfill on match.
    assert contact.beeper_user_id == "bp_user_2"


@pytest.mark.asyncio
async def test_resolve_contact_matches_existing_beeper_user_id_first(
    db: AsyncSession, user: User
):
    existing = Contact(
        id=uuid.uuid4(),
        user_id=user.id,
        full_name="Stable ID Match",
        beeper_user_id="bp_user_3",
        source="manual",
    )
    db.add(existing)
    await db.commit()

    counterpart = {"id": "bp_user_3", "fullName": "Whatever Name", "phoneNumber": "+19990000000"}
    contact, is_new = await resolve_contact(counterpart, user.id, db)

    assert not is_new
    assert contact.id == existing.id


@pytest.mark.asyncio
async def test_resolve_contact_matches_telegram_username(db: AsyncSession, user: User):
    existing = Contact(
        id=uuid.uuid4(),
        user_id=user.id,
        full_name="TG Bob",
        telegram_username="bob_tg",
        source="telegram",
    )
    db.add(existing)
    await db.commit()

    counterpart = {"id": "bp_user_4", "username": "@bob_tg", "network": "Telegram"}
    contact, is_new = await resolve_contact(counterpart, user.id, db)

    assert not is_new
    assert contact.id == existing.id
    assert contact.beeper_user_id == "bp_user_4"


# ---------------------------------------------------------------------------
# upsert_beeper_interaction — dedupe + pending upgrade
# ---------------------------------------------------------------------------


def _message(message_id: str, **overrides) -> dict:
    msg = {
        "id": message_id,
        "text": "Hello from Beeper!",
        "timestamp": "2024-01-15T10:00:00Z",
        "network": "WhatsApp",
        "chatID": "chat_1",
        "senderID": "bp_user_1",
        "isSender": False,
    }
    msg.update(overrides)
    return msg


@pytest.mark.asyncio
async def test_upsert_creates_new_with_mapped_platform(
    db: AsyncSession, user: User
):
    contact = Contact(
        id=uuid.uuid4(), user_id=user.id, full_name="A", source="beeper"
    )
    db.add(contact)
    await db.flush()

    interaction, is_new = await upsert_beeper_interaction(
        contact=contact, user_id=user.id, message=_message("m1"), db=db
    )
    await db.flush()

    assert is_new
    assert interaction.platform == "whatsapp"  # bridged network mapped
    assert interaction.direction == "inbound"
    assert interaction.raw_reference_id == "m1"
    assert interaction.occurred_at == datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_upsert_dedupes_same_message_id(db: AsyncSession, user: User):
    contact = Contact(
        id=uuid.uuid4(), user_id=user.id, full_name="A", source="beeper"
    )
    db.add(contact)
    await db.flush()

    kwargs = dict(contact=contact, user_id=user.id, message=_message("dup_1"), db=db)
    first, is_new_first = await upsert_beeper_interaction(**kwargs)
    await db.flush()
    second, is_new_second = await upsert_beeper_interaction(**kwargs)

    assert is_new_first is True
    assert is_new_second is False
    assert first.id == second.id


@pytest.mark.asyncio
async def test_upsert_truncates_long_preview(db: AsyncSession, user: User):
    contact = Contact(
        id=uuid.uuid4(), user_id=user.id, full_name="A", source="beeper"
    )
    db.add(contact)
    await db.flush()

    interaction, is_new = await upsert_beeper_interaction(
        contact=contact,
        user_id=user.id,
        message=_message("long_1", text="x" * 600),
        db=db,
    )
    assert is_new
    assert len(interaction.content_preview or "") == 500


@pytest.mark.asyncio
async def test_upsert_upgrades_pending_send_record(db: AsyncSession, user: User):
    """An outbound send recorded as pending:<id> becomes the real message."""
    contact = Contact(
        id=uuid.uuid4(), user_id=user.id, full_name="A", source="beeper"
    )
    db.add(contact)
    await db.flush()

    pending = Interaction(
        id=uuid.uuid4(),
        contact_id=contact.id,
        user_id=user.id,
        platform="beeper",
        direction="outbound",
        content_preview="Sent from PingCRM",
        raw_reference_id="pending:real_123",
        occurred_at=datetime.now(UTC) - timedelta(minutes=5),
        extra_data={"pending": True, "beeper_chat_id": "chat_1"},
    )
    db.add(pending)
    await db.flush()
    pending_id = pending.id

    upgraded, is_new = await upsert_beeper_interaction(
        contact=contact,
        user_id=user.id,
        message=_message("real_123", isSender=True),
        db=db,
    )

    assert is_new is False
    assert upgraded.id == pending_id
    assert upgraded.raw_reference_id == "real_123"
    assert upgraded.direction == "outbound"
    assert "pending" not in (upgraded.extra_data or {})
    assert upgraded.extra_data.get("beeper_message_id") == "real_123"


# ---------------------------------------------------------------------------
# process_message — skip rules + routing hints
# ---------------------------------------------------------------------------

_DM_CHAT = _single_chat(
    [
        {"id": "self_1", "isSelf": True},
        {"id": "bp_user_1", "username": "alice", "fullName": "Alice", "phoneNumber": "+15551110000"},
    ]
) | {"network": "WhatsApp"}


@pytest.mark.asyncio
async def test_process_message_inbound_creates_interaction_and_routes_chat(
    db: AsyncSession, user: User
):
    interaction, contact, is_new = await process_message(
        message=_message("in_1"), chat=_DM_CHAT, user_id=user.id, db=db
    )
    await db.flush()

    assert is_new
    assert interaction is not None
    assert contact is not None
    assert contact.beeper_chat_id == "chat_1"
    assert contact.beeper_network == "whatsapp"


@pytest.mark.asyncio
async def test_process_message_skips_deleted(db: AsyncSession, user: User):
    interaction, contact, is_new = await process_message(
        message=_message("del_1", isDeleted=True), chat=_DM_CHAT, user_id=user.id, db=db
    )
    assert interaction is None and contact is None and is_new is False


@pytest.mark.asyncio
async def test_process_message_skips_non_text(db: AsyncSession, user: User):
    interaction, contact, is_new = await process_message(
        message=_message("pic_1", type="image"), chat=_DM_CHAT, user_id=user.id, db=db
    )
    assert interaction is None and contact is None and is_new is False


@pytest.mark.asyncio
async def test_process_message_skips_group_chat_for_outbound(
    db: AsyncSession, user: User
):
    group = {"id": "g1", "type": "group", "network": "WhatsApp"}
    interaction, contact, is_new = await process_message(
        message=_message("out_1", isSender=True), chat=group, user_id=user.id, db=db
    )
    assert interaction is None and contact is None and is_new is False


# ---------------------------------------------------------------------------
# Sync walk — cursor pagination, floor stop, page cap, dedupe idempotence
# (no network: canned pages via a fake client)
# ---------------------------------------------------------------------------


class _FakeBeeperClient:
    """Returns canned pages; ``cursor`` values are page indexes as strings."""

    def __init__(self, pages_by_chat: dict[str, list[dict]]):
        self.pages = pages_by_chat
        self.calls: list[tuple[str, str | None, str | None]] = []

    async def list_messages(self, chat_id, cursor=None, direction=None):
        self.calls.append((chat_id, cursor, direction))
        seq = self.pages[chat_id]
        index = 0 if cursor is None else int(cursor)
        return seq[min(index, len(seq) - 1)]


def _page(items: list[dict], *, has_more: bool, oldest: str | None) -> dict:
    return {"items": items, "hasMore": has_more, "oldestCursor": oldest}


def _ts(minutes_ago: int) -> str:
    return (
        (datetime.now(UTC) - timedelta(minutes=minutes_ago))
        .isoformat()
        .replace("+00:00", "Z")
    )


@pytest.mark.asyncio
async def test_walk_chat_follows_cursor_until_has_more_false(
    db: AsyncSession, user: User
):
    client = _FakeBeeperClient(
        {
            "chat_1": [
                _page([_message("p1_a", timestamp=_ts(30)), _message("p1_b", timestamp=_ts(60))], has_more=True, oldest="1"),
                _page([_message("p2_a", timestamp=_ts(90))], has_more=False, oldest=None),
            ]
        }
    )
    result = await _walk_chat(
        client, _DM_CHAT, floor=datetime.now(UTC) - timedelta(days=1),
        max_pages=3, user_id=user.id, db=db,
    )
    await db.flush()

    assert len(client.calls) == 2
    assert client.calls[1] == ("chat_1", "1", "before")
    assert result["new_interactions"] == 3
    assert len(result["affected_contact_ids"]) == 1


@pytest.mark.asyncio
async def test_walk_chat_stops_when_floor_reached(db: AsyncSession, user: User):
    client = _FakeBeeperClient(
        {
            "chat_1": [
                _page([_message("new_1", timestamp=_ts(30)), _message("old_1", timestamp=_ts(60 * 24 * 30))], has_more=True, oldest="1"),
                _page([_message("never_1")], has_more=False, oldest=None),
            ]
        }
    )
    result = await _walk_chat(
        client, _DM_CHAT, floor=datetime.now(UTC) - timedelta(days=1),
        max_pages=3, user_id=user.id, db=db,
    )

    # Floor hit on page 1 → page 2 never fetched; only the fresh message imported.
    assert len(client.calls) == 1
    assert result["new_interactions"] == 1


@pytest.mark.asyncio
async def test_walk_chat_respects_page_cap(db: AsyncSession, user: User):
    pages = [
        _page([_message(f"c_{i}", timestamp=_ts(i + 5))], has_more=True, oldest=str(i + 1))
        for i in range(MAX_PAGES_PER_CHAT_FULL + 2)
    ]
    client = _FakeBeeperClient({"chat_1": pages})
    await _walk_chat(
        client, _DM_CHAT, floor=datetime.now(UTC) - timedelta(days=30),
        max_pages=MAX_PAGES_PER_CHAT_FULL, user_id=user.id, db=db,
    )

    assert len(client.calls) == MAX_PAGES_PER_CHAT_FULL


@pytest.mark.asyncio
async def test_walk_chat_is_idempotent_on_rewalk(db: AsyncSession, user: User):
    pages = [_page([_message("i_1", timestamp=_ts(10)), _message("i_2", timestamp=_ts(20))], has_more=False, oldest=None)]
    client = _FakeBeeperClient({"chat_1": pages})
    chat = _DM_CHAT
    floor = datetime.now(UTC) - timedelta(days=1)

    first = await _walk_chat(client, chat, floor=floor, max_pages=3, user_id=user.id, db=db)
    await db.flush()
    second = await _walk_chat(client, chat, floor=floor, max_pages=3, user_id=user.id, db=db)

    assert first["new_interactions"] == 2
    assert second["new_interactions"] == 0


# ---------------------------------------------------------------------------
# Account filtering + walk floor bounds
# ---------------------------------------------------------------------------


def test_enabled_account_ids_all(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "BEEPER_ENABLED_NETWORKS", "all")
    accounts = [{"accountID": "a1", "network": "WhatsApp"}]
    assert _enabled_account_ids(accounts) is None


def test_enabled_account_ids_filters_by_network(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "BEEPER_ENABLED_NETWORKS", "whatsapp, telegram")
    accounts = [
        {"accountID": "wa1", "network": "WhatsApp"},
        {"accountID": "tg1", "network": "telegram"},
        {"accountID": "sl1", "network": "Slack"},
    ]
    assert _enabled_account_ids(accounts) == ["wa1", "tg1"]


def test_floor_for_walk_full_backfills_horizon():
    from app.core.config import settings

    floor = _floor_for_walk(full=True, last_synced=None)
    expected = datetime.now(UTC) - timedelta(days=settings.BEEPER_BACKFILL_DAYS)
    assert abs((floor - expected).total_seconds()) < 60


def test_floor_for_walk_incremental_resumes_from_last_sync():
    now = datetime.now(UTC)
    last = now - timedelta(hours=2)
    floor = _floor_for_walk(full=False, last_synced=last)
    # Resumes at last sync minus overlap — NOT the full 7-day window.
    expected = last - INCREMENTAL_OVERLAP
    assert abs((floor - expected).total_seconds()) < 60


def test_floor_for_walk_incremental_caps_at_max_age():
    now = datetime.now(UTC)
    last = now - timedelta(days=30)
    floor = _floor_for_walk(full=False, last_synced=last)
    expected = now - INCREMENTAL_MAX_AGE
    assert abs((floor - expected).total_seconds()) < 60
