"""Beeper Celery tasks — pull sync for all bridged chat networks.

The Celery entrypoints (``sync_beeper_for_user`` / ``sync_beeper_all``) are
thin wrappers around the ``_sync_beeper_for_user`` coroutine so the sync
logic is directly unit-testable against a real ``AsyncSession`` without a
Celery broker (same pattern as the WhatsApp/Telegram task modules).

Sync strategy (v1, scheduled pull — realtime WS is a later phase):

* Full backfill (first run): walk chats newest→older, import DM history
  bounded by ``BEEPER_BACKFILL_DAYS`` and per-chat page caps.
* Incremental (daily): re-walk the most recently active chats and stop each
  chat walk at the last sync timestamp (minus a safety overlap).

Dedup is by ``Interaction.raw_reference_id`` (Beeper message ID), so every
walk is idempotent — re-syncing a window never duplicates interactions.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from celery import shared_task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import Provider
from app.core.config import settings
from app.core.database import task_session
from app.integrations.beeper import BeeperAuthError, BeeperClient, BeeperError
from app.integrations.beeper_helpers import process_message
from app.models.user import User
from app.services.sync_history import (
    record_sync_complete,
    record_sync_failure,
    record_sync_start,
)
from app.services.task_jobs.common import _run, logger, notify_sync_failure

# Bounds — the Beeper API does not expose page sizes, so walks are capped by
# pages (each page is whatever the server returns) plus a time horizon.
MAX_CHATS_FULL = 200          # chats visited during first backfill
MAX_PAGES_PER_CHAT_FULL = 6   # history pages per chat during backfill
MAX_CHATS_INCREMENTAL = 40    # recently-active chats per incremental pass
MAX_PAGES_PER_CHAT_INCREMENTAL = 3
INCREMENTAL_OVERLAP = timedelta(hours=1)   # re-scan window safety margin
INCREMENTAL_MAX_AGE = timedelta(days=7)    # fallback when never synced


def _enabled_account_ids(accounts: list[dict]) -> list[str] | None:
    """Filter accounts by BEEPER_ENABLED_NETWORKS; None means all."""
    raw = (settings.BEEPER_ENABLED_NETWORKS or "").strip().lower()
    if not raw or raw == "all":
        return None
    wanted = {part.strip() for part in raw.split(",") if part.strip()}
    ids = [
        acc.get("accountID")
        for acc in accounts
        if (acc.get("network") or "").strip().lower() in wanted
    ]
    return ids or None


def _floor_for_walk(full: bool, last_synced: datetime | None) -> datetime:
    """Oldest message timestamp a walk will consider."""
    now = datetime.now(UTC)
    if full:
        return now - timedelta(days=settings.BEEPER_BACKFILL_DAYS)
    since = last_synced or (now - INCREMENTAL_MAX_AGE)
    if since.tzinfo is None:
        since = since.replace(tzinfo=UTC)
    # Resume from the last sync (minus safety overlap), but never reach back
    # further than INCREMENTAL_MAX_AGE — max() bounds the window on both sides.
    return max(since - INCREMENTAL_OVERLAP, now - INCREMENTAL_MAX_AGE)


async def _walk_chat(
    client: BeeperClient,
    chat: dict,
    *,
    floor: datetime,
    max_pages: int,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> dict:
    """Import one chat's messages newer than ``floor`` (bounded by pages)."""
    new_interactions = 0
    affected: set[str] = set()

    resp = await client.list_messages(chat["id"])
    pages = 1
    while True:
        items = resp.get("items") or []
        reached_floor = False
        for message in items:
            ts = message.get("timestamp")
            if ts:
                try:
                    occurred = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                    if occurred.tzinfo is None:
                        occurred = occurred.replace(tzinfo=UTC)
                    if occurred < floor:
                        reached_floor = True
                        continue
                except (ValueError, TypeError):
                    pass
            _interaction, contact, is_new = await process_message(
                message=message, chat=chat, user_id=user_id, db=db
            )
            if is_new and contact is not None:
                new_interactions += 1
                affected.add(str(contact.id))

        if (
            reached_floor
            or not resp.get("hasMore")
            or pages >= max_pages
            or not resp.get("oldestCursor")
        ):
            break
        resp = await client.list_messages(
            chat["id"], cursor=resp["oldestCursor"], direction="before"
        )
        pages += 1

    return {"new_interactions": new_interactions, "affected_contact_ids": sorted(affected)}


async def _sync_beeper_for_user(
    db: AsyncSession, uid: uuid.UUID, trigger: str = "manual"
) -> dict:
    """Pull-sync Beeper DMs for ``uid``; records a sync event either way."""
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if user is None:
        logger.warning("sync_beeper: user %s not found.", uid)
        return {"status": "user_not_found", "records_created": 0}
    if not user.beeper_connected:
        return {"status": "not_connected", "records_created": 0}

    client = BeeperClient()
    if not client.is_configured:
        logger.warning("sync_beeper: BEEPER_API_TOKEN not configured — skipping user %s.", uid)
        return {"status": "not_configured", "records_created": 0}

    full = not user.beeper_full_backfill_complete
    floor = _floor_for_walk(full, user.beeper_last_synced_at)
    sync_event = await record_sync_start(uid, Provider.BEEPER, trigger, db)

    try:
        accounts = await client.list_accounts()
        account_ids = _enabled_account_ids(accounts)

        chat_resp = await client.list_chats(account_ids=account_ids)
        chat_pages = 1
        max_chat_pages = 4 if full else 2
        total_new = 0
        affected: set[str] = set()
        chats_visited = 0

        while True:
            for chat in chat_resp.get("items") or []:
                if (chat.get("type") or "").lower() != "single":
                    continue  # v1 scopes to DMs; group chats are out
                if chats_visited >= (MAX_CHATS_FULL if full else MAX_CHATS_INCREMENTAL):
                    break
                chats_visited += 1
                walk = await _walk_chat(
                    client,
                    chat,
                    floor=floor,
                    max_pages=(
                        MAX_PAGES_PER_CHAT_FULL
                        if full
                        else MAX_PAGES_PER_CHAT_INCREMENTAL
                    ),
                    user_id=uid,
                    db=db,
                )
                total_new += walk["new_interactions"]
                affected.update(walk["affected_contact_ids"])

            if (
                chats_visited >= (MAX_CHATS_FULL if full else MAX_CHATS_INCREMENTAL)
                or not chat_resp.get("hasMore")
                or chat_pages >= max_chat_pages
                or not chat_resp.get("oldestCursor")
            ):
                break
            chat_resp = await client.list_chats(
                account_ids=account_ids, cursor=chat_resp["oldestCursor"], direction="before"
            )
            chat_pages += 1

        # Count contacts created in this session (source=beeper, created now).
        from sqlalchemy import func as sa_func
        from app.models.contact import Contact
        count_result = await db.execute(
            select(sa_func.count())
            .select_from(Contact)
            .where(Contact.user_id == uid, Contact.source == Provider.BEEPER)
        )
        beeper_contacts = count_result.scalar_one() or 0

        details = {
            "mode": "full" if full else "incremental",
            "chats_visited": chats_visited,
            "new_interactions": total_new,
            "beeper_contacts_total": beeper_contacts,
        }
        await record_sync_complete(
            sync_event, records_created=total_new, details=details, db=db
        )

        user.beeper_last_synced_at = datetime.now(UTC)
        if full:
            user.beeper_full_backfill_complete = True
        await db.commit()

        logger.info("sync_beeper: user %s %s sync done — %s", uid, details["mode"], details)

        return {
            "status": "ok",
            "mode": details["mode"],
            "new_interactions": total_new,
            "affected_contact_ids": sorted(affected),
        }

    except BeeperAuthError as exc:
        await record_sync_failure(sync_event, str(exc), db=db)
        await db.commit()
        logger.error("sync_beeper: auth failed for user %s — %s", uid, exc)
        return {"status": "auth_error", "error": str(exc), "records_created": 0}
    except BeeperError as exc:
        await record_sync_failure(sync_event, str(exc), db=db)
        await db.commit()
        raise
    except Exception as exc:
        await record_sync_failure(sync_event, str(exc), db=db)
        await db.commit()
        raise


async def _collect_beeper_user_ids(db: AsyncSession) -> list[str]:
    result = await db.execute(
        select(User.id).where(User.beeper_connected.is_(True))  # type: ignore[attr-defined]
    )
    return [str(row[0]) for row in result.all()]


@shared_task(name="app.services.tasks.sync_beeper_for_user", bind=True, max_retries=3, soft_time_limit=900, time_limit=1200)
def sync_beeper_for_user(self, user_id: str, trigger: str = "scheduled") -> dict:
    """Sync Beeper chats for a single user (full backfill or incremental)."""
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return {"status": "invalid_user_id"}

    async def _runner() -> dict:
        async with task_session() as db:
            return await _sync_beeper_for_user(db, uid, trigger)

    try:
        return _run(_runner())
    except Exception as exc:
        logger.exception("sync_beeper_for_user failed for %s", user_id)
        if self.request.retries >= self.max_retries:
            notify_sync_failure.delay(user_id, Provider.BEEPER, str(exc))
        raise self.retry(exc=exc, countdown=60) from exc


@shared_task(name="app.services.tasks.sync_beeper_all")
def sync_beeper_all() -> dict:
    """Beat task: queue a per-user sync for every user with Beeper enabled."""
    if not settings.BEEPER_API_TOKEN:
        return {"queued": 0, "skipped": "not_configured"}

    async def _runner() -> list[str]:
        async with task_session() as db:
            return await _collect_beeper_user_ids(db)

    user_ids = _run(_runner())
    for uid in user_ids:
        sync_beeper_for_user.delay(uid, trigger="scheduled")

    logger.info("sync_beeper_all: queued %d user(s).", len(user_ids))
    return {"queued": len(user_ids)}
