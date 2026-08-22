"""Canonical identifiers for the external platforms PingCRM integrates with.

Use `Provider` instead of bare string literals ("gmail", "telegram", ...)
anywhere a provider identity is stored, compared, or logged.

`Provider` is a `StrEnum`, so each member *is* a `str` equal to its value:

    Provider.GMAIL == "gmail"            # True
    json.dumps({"p": Provider.GMAIL})    # '{"p": "gmail"}'

That means existing database rows (`Interaction.platform`), JSON log fields,
and Celery task payloads are byte-for-byte unaffected by the switch — the enum
is purely a compile-time/grep-time aid, not a wire-format change.
"""

from enum import StrEnum


class Provider(StrEnum):
    """An external platform PingCRM syncs contacts and interactions from."""

    GMAIL = "gmail"
    TELEGRAM = "telegram"
    TWITTER = "twitter"
    LINKEDIN = "linkedin"
    WHATSAPP = "whatsapp"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    # Networks reachable through the Beeper unified-messaging connector.
    # Inbound Beeper messages store the bridged network as Interaction.platform
    # (e.g. a WhatsApp message synced via Beeper is platform="whatsapp") so the
    # existing per-channel filters and scoring breadth keep working.
    SLACK = "slack"
    DISCORD = "discord"
    SIGNAL = "signal"
    # The connector itself (settings, sync history, outbound sends).
    BEEPER = "beeper"
