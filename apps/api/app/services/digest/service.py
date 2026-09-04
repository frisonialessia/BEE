"""DailyDigestService — "La jugada de hoy", pushed to where the team already is.

The Bandeja de Decisiones only helps if someone opens the dashboard. This
service takes the same ranked feed (``build_today_feed``, org-wide view)
and posts it once a day to the organization's Slack/Teams incoming
webhook, so the three plays that matter land in the channel the team
reads at 8am — no login required, and a link back for each one.

Design notes
------------
* Plain incoming webhook, not a Slack app: an OWNER pastes a URL, nothing
  to install or OAuth. The payload is a single mrkdwn ``text`` field,
  which Slack and Microsoft Teams both render — no Block Kit, so the
  same message works in either without provider-specific branches.
* Sent from the hourly cron tick (``/internal/digest/tick``), gated per
  organization by ``digest_enabled`` + ``digest_hour_utc``, and at most
  once per UTC day (``digest_last_sent_at``) so a re-run tick or a slow
  hour never double-posts. ``send_now`` (the "Enviar ahora" button)
  bypasses the hour and the once-a-day guard on purpose — a person
  clicking wants it now.
* Server-side strings are the feed's own Spanish rendering (the same
  ``headline``/``reasoning`` the API returns); locale-aware rendering
  lives in the dashboard's reason-code translations, not here.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.organization import Organization
from app.schemas.priority import DecisionCard
from app.services.priority_feed import build_today_feed

logger = get_logger(__name__)

_MAX_CARDS = 5
_URGENCY_MARK = {"high": "🔴", "medium": "🟠", "low": "🔵"}
_ACTION_LABEL = {
    "call": "Llamar",
    "email": "Escribir",
    "review": "Revisar",
    "wait": "Mantener en radar",
    "pause": "Pausar",
}


@dataclass(slots=True)
class DigestSendResult:
    sent: bool
    # Why nothing went out: not_configured | disabled | already_sent_today |
    # not_the_hour | delivery_failed. ``None`` when sent.
    reason: str | None = None
    cards: int = 0


@dataclass(slots=True)
class DigestTickSummary:
    organizations_checked: int = 0
    sent: int = 0
    skipped: int = 0
    duration_ms: int = 0
    errors: list[dict[str, Any]] = field(default_factory=list)


def _card_line(card: DecisionCard, dashboard_url: str) -> str:
    mark = _URGENCY_MARK.get(card.urgency, "•")
    action = _ACTION_LABEL.get(card.recommended_action, card.recommended_action)
    link = f"{dashboard_url}/dashboard/priority"
    if card.opportunity_id is not None:
        link = f"{dashboard_url}/dashboard/crm?opportunity={card.opportunity_id}"
    elif card.kind == "anomaly":
        link = f"{dashboard_url}/dashboard/control?tab=resilience"
    return f"{mark} *{card.headline}*\n{card.reasoning}\n→ {action} · <{link}|Abrir en BEE>"


class DailyDigestService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.settings = get_settings()

    # ── Message ────────────────────────────────────────────────────────────

    def build_message(self, org: Organization) -> tuple[str, int]:
        """Return the mrkdwn text and how many cards it carries."""
        feed = build_today_feed(self.session, organization_id=org.id, visible_user_ids=None, team_id=None)
        cards = feed.cards[:_MAX_CARDS]
        dashboard_url = self.settings.FRONTEND_URL.rstrip("/")
        today = datetime.now(UTC).strftime("%d/%m/%Y")
        header = f"🐝 *La jugada de hoy — {org.name}* · {today}"
        if not cards:
            body = "Sin jugadas urgentes ahora mismo. Todo tranquilo."
        else:
            body = "\n\n".join(_card_line(card, dashboard_url) for card in cards)
        footer = f"<{dashboard_url}/dashboard|Ver el resumen completo en BEE>"
        return f"{header}\n\n{body}\n\n{footer}", len(cards)

    # ── Delivery ───────────────────────────────────────────────────────────

    def _deliver(self, webhook_url: str, text: str) -> bool:
        try:
            # Module-level httpx.post (not a Client) on purpose: the test
            # suite's TestClient is itself an httpx.Client, so patching the
            # class method would swallow the very request under test.
            resp = httpx.post(webhook_url, json={"text": text}, timeout=8.0)
            resp.raise_for_status()
            return True
        except Exception as exc:  # noqa: BLE001 — a dead webhook is a skipped digest, never a crashed tick
            logger.warning("DailyDigest: webhook delivery failed: %s", exc)
            return False

    def send_now(self, org: Organization, *, now: datetime | None = None) -> DigestSendResult:
        """"Enviar ahora" — ignores the schedule and the once-a-day guard.

        ``now`` is the clock the caller reasons with (the cron tick passes its
        own), so ``digest_last_sent_at`` and the once-a-day comparison in
        ``send_scheduled`` always speak about the same day.
        """
        if not org.digest_webhook_url:
            return DigestSendResult(sent=False, reason="not_configured")
        text, count = self.build_message(org)
        if not self._deliver(org.digest_webhook_url, text):
            return DigestSendResult(sent=False, reason="delivery_failed", cards=count)
        org.digest_last_sent_at = now or datetime.now(UTC)
        self.session.add(org)
        self.session.commit()
        return DigestSendResult(sent=True, cards=count)

    def send_scheduled(self, org: Organization, *, now: datetime | None = None) -> DigestSendResult:
        """The cron path: only at the organization's hour, only once per day."""
        now = now or datetime.now(UTC)
        if not org.digest_enabled:
            return DigestSendResult(sent=False, reason="disabled")
        if not org.digest_webhook_url:
            return DigestSendResult(sent=False, reason="not_configured")
        if now.hour != org.digest_hour_utc:
            return DigestSendResult(sent=False, reason="not_the_hour")
        last = org.digest_last_sent_at
        if last is not None:
            last_utc = last if last.tzinfo is not None else last.replace(tzinfo=UTC)
            if last_utc.date() == now.date():
                return DigestSendResult(sent=False, reason="already_sent_today")
        return self.send_now(org, now=now)

    def run_tick(self, *, now: datetime | None = None) -> DigestTickSummary:
        start = time.monotonic()
        summary = DigestTickSummary()
        orgs = self.session.exec(
            select(Organization).where(
                Organization.digest_enabled == True,  # noqa: E712 — SQLAlchemy needs the comparison
                Organization.is_active == True,  # noqa: E712
            )
        ).all()
        for org in orgs:
            summary.organizations_checked += 1
            try:
                result = self.send_scheduled(org, now=now)
            except Exception as exc:  # noqa: BLE001 — one organization must not abort the batch
                logger.exception("DailyDigest: tick failed for organization_id=%s", org.id)
                summary.errors.append({"organization_id": str(org.id), "error": str(exc)[:200]})
                continue
            if result.sent:
                summary.sent += 1
            else:
                summary.skipped += 1
        summary.duration_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "DailyDigest tick: checked=%d sent=%d skipped=%d errors=%d",
            summary.organizations_checked,
            summary.sent,
            summary.skipped,
            len(summary.errors),
        )
        return summary
