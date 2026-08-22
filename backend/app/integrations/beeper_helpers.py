"""DB lookup/write helpers for the Beeper integration.

Beeper bridges several chat networks behind one API.  A synced message
carries the bridged ``network`` (e.g. "WhatsApp") which is mapped onto the
matching PingCRM platform string where one exists, so per-channel filters
and scoring breadth keep working.  The raw Beeper IDs always live in
``Interaction.extra_data`` for traceability.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import Provider
from app.models.contact import Contact
from app.models.interaction import Interaction

# Bridged network name (as reported by the Beeper API, lower-cased) →
# Interaction.platform. Unknown networks fall back to the beeper connector
# platform itself.
NETWORK_TO_PLATFORM: dict[str, str] = {
    "whatsapp": Provider.WHATSAPP,
    "telegram": Provider.TELEGRAM,
    "slack": Provider.SLACK,
    "discord": Provider.DISCORD,
    "signal": Provider.SIGNAL,
}


def platform_for_network(network: str | None) -> str:
    """Map a Beeper network name onto a PingCRM platform string."""
    if not network:
        return Provider.BEEPER
    return NETWORK_TO_PLATFORM.get(network.strip().lower(), Provider.BEEPER)


def normalize_phone(phone: str) -> str:
    """Normalize a phone number to E.164 (Beeper reports ``+``-prefixed)."""
    phone = phone.strip()
    if not phone.startswith("+"):
        phone = "+" + phone
    return phone


def normalize_telegram_username(username: str) -> str:
    """Strip a leading ``@`` from a Telegram handle."""
    username = username.strip()
    return username.lstrip("@")


def _counterpart_from_chat(chat: dict) -> dict | None:
    """Return the non-self participant of a ``single`` chat, if any.

    Beeper participants extend ``User`` (``id``, ``username``,
    ``phoneNumber``, ``fullName``, ``isSelf``) with chat-membership flags.
    Returns ``None`` for group chats or chats without participants.
    """
    if (chat.get("type") or "").lower() != "single":
        return None
    participants = (chat.get("participants") or {}).get("items") or []
    for participant in participants:
        if participant.get("isSelf"):
            continue
        if participant.get("id"):
            return participant
    return None


async def find_contact_by_beeper_user_id(
    beeper_user_id: str, user_id: uuid.UUID, db: AsyncSession
) -> Contact | None:
    """Find a contact by the stable cross-network beeper_user_id field."""
    result = await db.execute(
        select(Contact)
        .where(
            Contact.user_id == user_id,
            Contact.beeper_user_id == beeper_user_id,
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


async def resolve_contact(
    counterpart: dict,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> tuple[Contact, bool]:
    """Find or create a contact for a chat counterpart.

    Lookup order:
      1. ``beeper_user_id`` (stable across networks — the primary key)
      2. ``whatsapp_phone`` when a phone is derivable (E.164, with the
         whatsapp_helpers suffix-variant fallback handled upstream)
      3. ``telegram_username`` when a handle is derivable
      4. Create a new contact named from the Beeper display name

    Returns ``(contact, is_new)``.
    """
    beeper_user_id = counterpart.get("id") or ""

    # 1. Stable Beeper identity.
    if beeper_user_id:
        contact = await find_contact_by_beeper_user_id(beeper_user_id, user_id, db)
        if contact:
            _backfill_contact_fields(contact, counterpart)
            return contact, False

    phone = counterpart.get("phoneNumber") or ""
    if phone:
        phone = normalize_phone(phone)
        result = await db.execute(
            select(Contact)
            .where(
                Contact.user_id == user_id,
                Contact.whatsapp_phone == phone,
            )
            .limit(1)
        )
        contact = result.scalar_one_or_none()
        if contact:
            if beeper_user_id and not contact.beeper_user_id:
                contact.beeper_user_id = beeper_user_id
            _backfill_contact_fields(contact, counterpart)
            return contact, False

    username = counterpart.get("username") or ""
    tg_username = ""
    if username:
        # Beeper usernames are network-specific handles; only treat them as
        # Telegram handles when the network is telegram or they carry a
        # Telegram-style leading @.
        network = (counterpart.get("network") or "").strip().lower()
        if network == "telegram" or username.startswith("@"):
            tg_username = normalize_telegram_username(username)
    if tg_username:
        result = await db.execute(
            select(Contact)
            .where(
                Contact.user_id == user_id,
                Contact.telegram_username == tg_username,
            )
            .limit(1)
        )
        contact = result.scalar_one_or_none()
        if contact:
            if beeper_user_id and not contact.beeper_user_id:
                contact.beeper_user_id = beeper_user_id
            _backfill_contact_fields(contact, counterpart)
            return contact, False

    # 4. Create new contact.
    display_name = counterpart.get("fullName") or counterpart.get("username") or None
    contact = Contact(
        id=uuid.uuid4(),
        user_id=user_id,
        full_name=display_name,
        beeper_user_id=beeper_user_id or None,
        beeper_display_name=display_name,
        phones=[phone] if phone else None,
        source=Provider.BEEPER,
    )
    if phone:
        contact.whatsapp_phone = phone
    if tg_username:
        contact.telegram_username = tg_username
    db.add(contact)
    return contact, True


def _backfill_contact_fields(contact: Contact, counterpart: dict) -> None:
    """Fill any missing identity/display fields from a Beeper participant."""
    beeper_user_id = counterpart.get("id") or ""
    if beeper_user_id and not contact.beeper_user_id:
        contact.beeper_user_id = beeper_user_id
    display_name = counterpart.get("fullName") or counterpart.get("username") or None
    if display_name:
        if not contact.beeper_display_name:
            contact.beeper_display_name = display_name
        if not contact.full_name:
            contact.full_name = display_name
    phone = counterpart.get("phoneNumber") or ""
    if phone:
        phone = normalize_phone(phone)
        if not contact.whatsapp_phone:
            contact.whatsapp_phone = phone
        phones = contact.phones or []
        if phone not in phones:
            contact.phones = [*phones, phone]


def _is_read_by_recipient(message: dict) -> bool | None:
    """Read receipt for outbound messages: any non-self participant seen it.

    Beeper reports ``seen`` as a list of per-participant receipt objects.
    Only meaningful for messages the user sent (did the contact read them?);
    returns ``None`` for inbound messages.
    """
    if not message.get("isSender"):
        return None
    seen = message.get("seen") or []
    for entry in seen:
        if isinstance(entry, dict):
            if not entry.get("isSelf", False):
                return True
        else:
            # Non-dict entries mean at least one non-self participant saw it.
            return True
    return False


async def upsert_beeper_interaction(
    *,
    contact: Contact,
    user_id: uuid.UUID,
    message: dict,
    db: AsyncSession,
) -> tuple[Interaction, bool]:
    """Create a Beeper-sourced interaction if it does not already exist.

    Deduplication is by ``raw_reference_id`` (= the Beeper message ID) scoped
    to the contact and user.  ``platform`` is the bridged network mapped onto
    a PingCRM platform string; the raw network and Beeper IDs are preserved
    in ``extra_data``.  The preview is truncated to 500 characters.

    Returns ``(interaction, is_new)``.
    """
    message_id = message.get("id") or ""
    result = await db.execute(
        select(Interaction)
        .where(
            Interaction.raw_reference_id == message_id,
            Interaction.contact_id == contact.id,
            Interaction.user_id == user_id,
        )
        .limit(1)
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing, False

    # Second-chance dedup: an outbound message sent through PingCRM stores
    # ``pending:<pendingMessageID>`` until the bridge confirms the real
    # message ID.  When this synced message IS that confirmation, upgrade
    # the pending row in place instead of inserting a duplicate.
    if message_id:
        result = await db.execute(
            select(Interaction)
            .where(
                Interaction.raw_reference_id == f"pending:{message_id}",
                Interaction.contact_id == contact.id,
                Interaction.user_id == user_id,
            )
            .limit(1)
        )
        pending = result.scalar_one_or_none()
        if pending is not None:
            pending.raw_reference_id = message_id
            pending.occurred_at = _parse_timestamp(message.get("timestamp"))
            pending.is_read_by_recipient = _is_read_by_recipient(message)
            extra = dict(pending.extra_data or {})
            extra.update(
                {
                    "beeper_network": message.get("network"),
                    "beeper_chat_id": message.get("chatID"),
                    "beeper_message_id": message_id,
                    "beeper_sender_id": message.get("senderID"),
                }
            )
            extra.pop("pending", None)
            pending.extra_data = extra
            return pending, False

    text = message.get("text")
    interaction = Interaction(
        id=uuid.uuid4(),
        contact_id=contact.id,
        user_id=user_id,
        platform=platform_for_network(message.get("network")),
        direction="outbound" if message.get("isSender") else "inbound",
        content_preview=text[:500] if text else None,
        raw_reference_id=message_id,
        occurred_at=_parse_timestamp(message.get("timestamp")),
        is_read_by_recipient=_is_read_by_recipient(message),
        extra_data={
            "beeper_network": message.get("network"),
            "beeper_chat_id": message.get("chatID"),
            "beeper_message_id": message_id,
            "beeper_sender_id": message.get("senderID"),
        },
    )
    db.add(interaction)
    return interaction, True


def _parse_timestamp(value: str | None) -> datetime:
    """Parse a Beeper ISO timestamp; falls back to now (UTC)."""
    from datetime import UTC

    if value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return parsed
        except (ValueError, TypeError):
            pass
    return datetime.now(UTC)


async def process_message(
    *,
    message: dict,
    chat: dict,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> tuple[Interaction | None, Contact | None, bool]:
    """Resolve the chat counterpart and upsert the message as an interaction.

    Skips non-text message types and chats without a resolvable single
    counterpart (group chats are out of scope for v1).  Returns
    ``(interaction, contact, is_new)`` with ``interaction=None`` when skipped.
    """
    msg_type = (message.get("type") or "").lower()
    if msg_type and msg_type not in ("text", "chat", "message"):
        return None, None, False
    if message.get("isDeleted") or message.get("isHidden"):
        return None, None, False

    # Outbound messages are attributed to their single counterpart.
    if message.get("isSender"):
        counterpart = _counterpart_from_chat(chat)
        if counterpart is None:
            return None, None, False
    else:
        sender_id = message.get("senderID") or ""
        if not sender_id:
            return None, None, False
        counterpart = {
            "id": sender_id,
            "username": message.get("senderName") or "",
            "fullName": message.get("senderName") or "",
            "network": chat.get("network"),
        }

    contact, _contact_is_new = await resolve_contact(counterpart, user_id, db)

    # Outbound routing hint: remember which Beeper chat reaches this contact.
    chat_id = chat.get("id") or ""
    if chat_id and contact.beeper_chat_id != chat_id:
        contact.beeper_chat_id = chat_id
    network = (chat.get("network") or "").strip().lower()
    if network and not contact.beeper_network:
        contact.beeper_network = network

    # Inherit the network from the chat when the message lacks one.
    if not message.get("network"):
        message = {**message, "network": chat.get("network")}

    interaction, is_new = await upsert_beeper_interaction(
        contact=contact,
        user_id=user_id,
        message=message,
        db=db,
    )
    return interaction, contact, is_new
