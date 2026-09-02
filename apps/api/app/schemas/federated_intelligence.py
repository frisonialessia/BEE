"""Schemas for Organization.federated_intelligence_opt_in — see
app.services.federated_intelligence for the full privacy model.
"""

from __future__ import annotations

from pydantic import BaseModel


class FederatedIntelligenceConfigIn(BaseModel):
    """Toggles this organization's participation. Opting in has two
    symmetric effects: this org's own closed-deal history becomes eligible
    to be counted, anonymized and aggregate-only, toward every other
    opted-in organization's cross-tenant priors — and this org's own
    signal confidence becomes eligible to be calibrated the same way."""

    opt_in: bool = False


class FederatedIntelligenceConfigOut(BaseModel):
    opt_in: bool
