"""TacticVariant repository."""

from __future__ import annotations

import uuid

from sqlmodel import select

from app.models.base import VariantStatus
from app.models.tactic_variant import TacticVariant, VariantOutcome
from app.repositories.base import BaseRepository


class TacticVariantRepository(BaseRepository[TacticVariant]):
    model = TacticVariant

    def get_active_for_signal_type(
        self, signal_type: str, industry: str | None = None  # noqa: ARG002
    ) -> TacticVariant | None:
        """Return the first active variant for a given signal type."""
        stmt = (
            select(TacticVariant)
            .where(TacticVariant.signal_type == signal_type)
            .where(TacticVariant.status == VariantStatus.ACTIVE)
            .order_by(TacticVariant.created_at.desc())
            .limit(1)
        )
        return self.session.exec(stmt).first()

    def record_outcome(
        self,
        variant_id: uuid.UUID,
        strategy_outcome_id: uuid.UUID,
        arm: str,
        won: bool,
    ) -> VariantOutcome:
        """Log an outcome for a variant arm and update counters."""
        variant = self.get(variant_id)
        if variant:
            if arm == "a":
                variant.arm_a_total += 1
                if won:
                    variant.arm_a_wins += 1
            else:
                variant.arm_b_total += 1
                if won:
                    variant.arm_b_wins += 1
            self.session.add(variant)

        outcome = VariantOutcome(
            variant_id=variant_id,
            strategy_outcome_id=strategy_outcome_id,
            arm=arm,
            won=won,
        )
        self.session.add(outcome)
        self.session.flush()
        self.session.refresh(outcome)
        return outcome

    def conclude(self, variant_id: uuid.UUID) -> TacticVariant | None:
        """Mark a variant as concluded and set winner_arm."""
        variant = self.get(variant_id)
        if variant is None:
            return None
        variant.status = VariantStatus.CONCLUDED
        winner = "a" if variant.arm_a_win_rate >= variant.arm_b_win_rate else "b"
        variant.winner_arm = winner
        self.session.add(variant)
        return variant
