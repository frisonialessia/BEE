"""Psychographic models for lead DISC communication style profiling.

DISC is a behavioural assessment framework that classifies communication
styles along four dimensions:

* **D — Dominance**: Direct, results-oriented, decisive. Prefers brevity,
  ROI, and bottom-line framing. Avoid pleasantries and lengthy explanations.

* **I — Influence**: Enthusiastic, people-oriented, persuasive. Responds to
  stories, social proof, excitement, and possibilities.

* **S — Steadiness**: Patient, process-oriented, dependable. Prefers step-by-
  step explanations, risk mitigation, stability, and a friendly, supportive tone.

* **C — Conscientiousness**: Analytical, quality-oriented, precise. Responds
  to data, logical arguments, detailed specs, and verifiable proof points.

Design note
-----------
``LeadPsychographic`` is a one-to-one relationship with ``Lead``. It is
computed lazily (on first request) and cached in the DB. Every content
generation pipeline reads this record via the ContentStyleMiddleware to
adapt message tone before finalisation.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class DISCDominant(str):
    """The dominant DISC quadrant — the primary communication style."""

    D = "D"  # Dominance
    I = "I"  # Influence  # noqa: E741
    S = "S"  # Steadiness
    C = "C"  # Conscientiousness
    UNKNOWN = "UNKNOWN"


class ClassificationSource(str):
    TITLE_HEURISTIC = "title_heuristic"      # Based on job title patterns
    BEHAVIORAL_SIGNALS = "behavioral_signals"  # Based on engagement patterns
    MANUAL = "manual"                          # CEO manually overrode
    LLM = "llm"                                # LLM-based classification (future)


class LeadPsychographic(TimestampMixin, table=True):
    """DISC communication style profile for a lead.

    Scores are raw weights (0.0 – 1.0 each, do NOT need to sum to 1).
    The dominant and secondary styles are the two highest-scoring dimensions.

    Classification is rule-based by default. The ``ClassificationSource``
    field records the method so callers can weight confidence accordingly.
    """

    __tablename__ = "lead_psychographics"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # Tenant boundary. Nullable for backward compatibility — see
    # app.models.organization's docstring.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    lead_id: uuid.UUID = Field(unique=True, index=True, nullable=False)

    # ── DISC dimension scores ─────────────────────────────────────────────────
    d_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Dominance score")
    i_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Influence score")
    s_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Steadiness score")
    c_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Conscientiousness score")

    # ── Resolved style ────────────────────────────────────────────────────────
    dominant_style: str = Field(default=DISCDominant.UNKNOWN, index=True)
    secondary_style: str | None = Field(default=None)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)

    # ── Provenance ────────────────────────────────────────────────────────────
    classification_source: str = Field(default=ClassificationSource.TITLE_HEURISTIC)
    classification_notes: str | None = Field(default=None)

    # ── Content preferences (derived from DISC) ───────────────────────────────
    preferred_message_length: str = Field(
        default="medium",
        description="short | medium | long — how much detail this person wants",
    )
    preferred_tone: str = Field(
        default="professional",
        description="direct | enthusiastic | warm | analytical",
    )
    avoid_phrases: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Phrases that clash with this style (populated by classifier)",
    )

    classified_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @property
    def style_label(self) -> str:
        """Human-readable style label."""
        labels = {
            "D": "Driver (Dominant)",
            "I": "Influencer",
            "S": "Supporter (Steady)",
            "C": "Analyst (Conscientious)",
            "UNKNOWN": "Unknown",
        }
        return labels.get(self.dominant_style, self.dominant_style)

    @property
    def disc_vector(self) -> dict[str, float]:
        return {"D": self.d_score, "I": self.i_score, "S": self.s_score, "C": self.c_score}
