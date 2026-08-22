"""Beeper unified-messaging API routes.

Deployment-level token (``BEEPER_API_TOKEN``) + per-user enablement flag
(``User.beeper_connected``).  Routes: connect/disconnect, status (bridged
accounts), manual sync trigger, and outbound message send.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import Provider
from app.core.auth import get_current_user
from app.core.database import get_db
from app.integrations.beeper import (
    BeeperAuthError,
    BeeperClient,
    BeeperError,
    BeeperNotFoundError,
)
from app.models.contact import Contact
from app.models.user import User
from app.schemas.responses import Envelope, SyncStartedData

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/beeper", tags=["beeper"])


class ConnectRequest(BaseModel):
    enabled: bool = True


class SendMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    chat_id: str | None = None
    contact_id: uuid.UUID | None = None


class BeeperAccountInfo(BaseModel):
    accountID: str | None = None
    network: str | None = None
    status: str | None = None
    username: str | None = None


class BeeperStatusData(BaseModel):
    configured: bool
    connected: bool
    last_synced_at: datetime | None = None
    full_backfill_complete: bool = False
    accounts: list[BeeperAccountInfo] = []
    error: str | None = None


class BeeperConnectedData(BaseModel):
    connected: bool


class BeeperSendData(BaseModel):
    chat_id: str
    pending_message_id: str | None = None
    interaction_id: str | None = None


@router.get(
    "/status",
    response_model=Envelope[BeeperStatusData],
)
async def beeper_status(
    current_user: User = Depends(get_current_user),
) -> Envelope[BeeperStatusData]:
    """Beeper connection state plus the bridged accounts the token can see."""
    client = BeeperClient()
    configured = client.is_configured
    accounts: list[dict] = []
    error: str | None = None
    if configured and current_user.beeper_connected:
        try:
            accounts = await client.list_accounts()
        except BeeperError as exc:
            # Surface degraded token/network state in-band so the settings
            # card can show it without a failed request.
            logger.warning(
                "beeper_status: listing accounts failed for user %s — %s",
                current_user.id, exc,
            )
            error = str(exc)

    return Envelope(
        data=BeeperStatusData(
            configured=configured,
            connected=bool(current_user.beeper_connected and configured),
            last_synced_at=current_user.beeper_last_synced_at,
            full_backfill_complete=bool(current_user.beeper_full_backfill_complete),
            accounts=[
                BeeperAccountInfo(
                    accountID=acc.get("accountID"),
                    network=acc.get("network"),
                    status=acc.get("status"),
                    username=(acc.get("user") or {}).get("username"),
                )
                for acc in accounts
            ],
            error=error,
        )
    )


@router.post(
    "/connect",
    response_model=Envelope[BeeperConnectedData],
)
async def beeper_connect(
    body: ConnectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Envelope[BeeperConnectedData]:
    """Enable/disable Beeper sync for the current user."""
    client = BeeperClient()
    if body.enabled:
        if not client.is_configured:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="BEEPER_API_TOKEN is not configured on this deployment",
            )
        # Validate the token before flipping the flag.
        try:
            await client.get_info()
        except BeeperAuthError as exc:
            logger.warning(
                "beeper_connect: token rejected for user %s — %s", current_user.id, exc
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        current_user.beeper_connected = True
    else:
        current_user.beeper_connected = False

    await db.flush()
    return Envelope(data=BeeperConnectedData(connected=current_user.beeper_connected))


@router.post(
    "/disconnect",
    response_model=Envelope[BeeperConnectedData],
)
async def beeper_disconnect(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Envelope[BeeperConnectedData]:
    """Disable Beeper sync for the current user (history is kept)."""
    current_user.beeper_connected = False
    await db.flush()
    return Envelope(data=BeeperConnectedData(connected=False))


@router.post(
    "/sync",
    response_model=Envelope[SyncStartedData],
)
async def beeper_sync(
    current_user: User = Depends(get_current_user),
) -> Envelope[SyncStartedData]:
    """Queue a manual Beeper sync for the current user."""
    if not current_user.beeper_connected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Beeper is not connected for this user",
        )
    if not BeeperClient().is_configured:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="BEEPER_API_TOKEN is not configured on this deployment",
        )

    from app.services.tasks import sync_beeper_for_user

    sync_beeper_for_user.delay(str(current_user.id), trigger="manual")
    return Envelope(data=SyncStartedData(status="started"))


@router.post(
    "/messages",
    response_model=Envelope[BeeperSendData],
)
async def beeper_send_message(
    body: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Envelope[BeeperSendData]:
    """Send a text message through Beeper and record it as an interaction.

    Provide either ``chat_id`` (a Beeper chat ID) or ``contact_id`` (resolves
    to the contact's ``beeper_chat_id`` saved during sync).
    """
    client = BeeperClient()
    if not client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="BEEPER_API_TOKEN is not configured on this deployment",
        )
    if not current_user.beeper_connected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Beeper is not connected for this user",
        )

    chat_id = body.chat_id
    contact: Contact | None = None
    if not chat_id and body.contact_id:
        result = await db.execute(
            select(Contact).where(
                Contact.id == body.contact_id, Contact.user_id == current_user.id
            )
        )
        contact = result.scalar_one_or_none()
        if contact is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found"
            )
        chat_id = contact.beeper_chat_id
        if not chat_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Contact has no known Beeper chat (sync first)",
            )
    if not chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either chat_id or contact_id",
        )

    try:
        sent = await client.send_message(chat_id, body.text.strip())
    except BeeperAuthError as exc:
        logger.error(
            "beeper_send_message: auth rejected for user %s — %s", current_user.id, exc
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except BeeperNotFoundError as exc:
        logger.warning(
            "beeper_send_message: chat %s not found for user %s — %s",
            chat_id, current_user.id, exc,
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except BeeperError as exc:
        logger.exception(
            "beeper_send_message: send failed for user %s to chat %s", current_user.id, chat_id
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send message via Beeper. Please try again.",
        ) from exc

    pending_id = sent.get("pendingMessageID") or ""

    # Resolve contact for chat_id-based sends so the interaction is linked.
    if contact is None:
        result = await db.execute(
            select(Contact).where(
                Contact.user_id == current_user.id,
                Contact.beeper_chat_id == chat_id,
            )
        )
        contact = result.scalar_one_or_none()

    interaction_id: str | None = None
    if contact is not None:
        from app.models.interaction import Interaction

        now = datetime.now(UTC)
        interaction = Interaction(
            id=uuid.uuid4(),
            contact_id=contact.id,
            user_id=current_user.id,
            platform=Provider.BEEPER,
            direction="outbound",
            content_preview=body.text.strip()[:500],
            # Pending marker: the next sync upgrades this row to the real
            # Beeper message ID once the bridge confirms delivery.
            raw_reference_id=f"pending:{pending_id}" if pending_id else None,
            occurred_at=now,
            is_read_by_recipient=None,
            extra_data={
                "beeper_network": contact.beeper_network,
                "beeper_chat_id": chat_id,
                "beeper_message_id": pending_id or None,
                "pending": bool(pending_id),
            },
        )
        db.add(interaction)
        contact.last_interaction_at = now
        contact.last_followup_at = now
        await db.flush()
        interaction_id = str(interaction.id)

    return Envelope(
        data=BeeperSendData(
            chat_id=chat_id,
            pending_message_id=pending_id or None,
            interaction_id=interaction_id,
        )
    )
