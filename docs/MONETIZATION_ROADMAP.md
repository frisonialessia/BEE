# BEE — Monetization Roadmap

> **Status: proposal, not implemented.** Nothing in this document describes
> current behavior — `Organization.plan` exists in the schema
> (`apps/api/app/models/organization.py`) but nothing reads or enforces it
> yet, and there is no billing integration anywhere in this codebase today.
>
> **This is also not BEE's own commercial offer.** BEE is published as an
> open-source MVP — a working reference architecture, not a product this
> project is selling. This document exists so that anyone who forks BEE to
> build their *own* commercial product has a concrete starting point for
> pricing it, mapped to the access-control primitives the codebase already
> has. See `/contacto`, `/quienes-somos`, `/terminos`, and `/privacidad` on
> the live site for the same disclaimer in user-facing language.

## 1. Why self-serve

A human sales team is the main fixed cost of a traditional SaaS go-to-market,
and it doesn't scale linearly with signups — every new logo needs a rep's
time whether the deal is $50/mo or $50k/year. Self-serve inverts that:
signup, trial, upgrade, downgrade, and cancellation all happen without a
human in the loop, funded by automated recurring billing (Stripe Billing +
Checkout). A sales *conversation* only re-enters the picture at the
Enterprise tier, where the deal size and custom terms justify it — see §2.3.

Mechanically, this means:

- **Checkout, not a contract.** A prospect goes from `/register` to a paid
  seat without ever talking to anyone. `POST /api/v1/auth/register`
  (`apps/api/app/api/v1/endpoints/auth.py`) already is this entry point for
  the product itself — the roadmap here is adding a paid step after it, not
  replacing it.
- **The org is the billing unit**, not the user. `Organization` is already
  the tenant boundary (`organization_id` on every domain table); a Stripe
  `Customer` and `Subscription` map one-to-one to an `Organization`, never
  to an individual `User`.
- **Plan changes are webhook-driven, not support tickets.** Stripe is the
  source of truth for "is this org paid and on which tier" — the backend
  reacts to `checkout.session.completed`, `customer.subscription.updated`,
  and `customer.subscription.deleted` webhooks and updates
  `Organization.plan` accordingly. The app never polls Stripe or trusts a
  client-supplied plan value.
- **Limits fail closed, gracefully.** Hitting a seat or usage limit should
  block the *specific action* (inviting a 6th user on Starter) with a clear
  upgrade prompt — never silently degrade data the org already has, and
  never take the product itself offline.

## 2. Tiers

Three tiers, mapped directly onto machinery that already exists in
`app/models/base.py::UserRole` and `app/services/permissions/service.py` —
this is deliberate: the tiers are a pricing wrapper around real access-control
boundaries, not a separate concept the backend has to learn.

### 2.1 Starter — individual, 1–10 seats

**Who it's for:** a single rep or a very small team, evaluating BEE or
running a lean pipeline without needing manager rollups.

- **Roles available:** `OWNER`, `MEMBER`. `MANAGER` is not selectable — a
  team of ≤10 with no manager tier keeps the plan easy to reason about, and
  removes the temptation to build out a `Team` tree that will just need
  flattening again if the org outgrows Starter.
- **Data isolation:** every `Lead`, `Opportunity`, and (once
  `docs/MONETIZATION_ROADMAP.md` §2 of the RBAC gap-fix ships —
  `Company.owner_user_id`) `Company` a `MEMBER` creates is visible only to
  them and the `OWNER`, via the existing `get_visible_user_ids()` /
  `user_can_view_assignment()` pair. No new backend logic — a `MEMBER` on
  Starter behaves exactly like a `MEMBER` behaves today.
- **Illustrative limits:** 10 seats, 1,000 tracked signals/month, 90-day
  signal retention, no outbound webhook integrations, community support only.
- **Price shape:** flat per-seat, billed monthly or annually, no minimum
  commitment — the plan a solo rep can put on a personal card without asking
  anyone.

### 2.2 Team — collaborative, ~11–99 seats

**Who it's for:** multiple reps under one or more managers, needing
pipeline visibility across people, not just per-person isolation.

- **Roles available:** adds `MANAGER`. This tier is the entire reason
  `Team.parent_team_id` exists as a *tree* and not a flat "team_id" — a
  Team-tier org can have regional sub-teams rolling up to a VP, and
  `get_descendant_team_ids()` already walks that correctly with zero
  tier-specific code.
- **Data isolation:** unchanged mechanism from Starter, wider blast radius —
  a `MANAGER`'s visibility now actually spans more than one person because
  there's a team tree under them to span.
- **Illustrative limits:** 99 seats, 25,000 tracked signals/month, 1-year
  signal retention, outbound webhook integrations unlocked (CRM sync,
  Slack), priority email support.
- **Price shape:** per-seat with a volume discount past ~20 seats, still
  self-serve — upgrading from Starter is "add a card, pick Team," not a
  new contract.

### 2.3 Enterprise — 100+ seats, multi-office

**Who it's for:** organizations large enough that "self-serve" gives way to
a real relationship — security review, procurement, a signed order form.
This is the one tier where a human conversation is expected, not a failure
of the self-serve model.

- **Roles available:** full set, including multiple `OWNER`-equivalent
  admins and org-wide `ADMIN`s across what is functionally several
  "offices" — modeled as top-level `Team` trees under one `Organization`
  (e.g. a `Team` named "EMEA" and one named "AMER", each with their own
  manager sub-trees), not as separate organizations, so cross-office
  reporting stays a single query instead of a cross-tenant join.
- **Data isolation:** same primitives, plus room for an
  Enterprise-only enforcement layer (e.g. mandatory `owner_user_id` on
  every record, SSO-provisioned role assignment instead of manual invites)
  that would be genuinely new backend work, not just a limits change.
- **Illustrative capabilities:** unlimited seats (contracted, not literally
  infinite), SSO/SAML, a real audit export (see the RBAC gap-fix proposal's
  §C, `AccountActivityEvent` — this is the tier that would actually
  consume that feed), dedicated support, custom data-retention terms,
  invoice billing as an alternative to a credit card on file.
- **Price shape:** custom, negotiated — Stripe still processes the
  resulting invoice/subscription once terms are agreed, but discovery and
  quoting happen through `/contacto`, not `/register` → checkout. This is
  the one deliberate seam in an otherwise fully self-serve funnel.

## 3. Technical mapping

### 3.1 Plan storage and enforcement

`Organization.plan` (`apps/api/app/models/organization.py:38`) already
exists as a free-text field defaulting to `"free"`. The roadmap:

```python
# app/core/plans.py — new module, single source of truth for limits
class PlanLimits(BaseModel):
    max_seats: int
    max_signals_per_month: int
    signal_retention_days: int
    manager_role_enabled: bool
    outbound_webhooks_enabled: bool

PLAN_LIMITS: dict[str, PlanLimits] = {
    "starter": PlanLimits(max_seats=10, max_signals_per_month=1_000, ...),
    "team": PlanLimits(max_seats=99, max_signals_per_month=25_000, ...),
    "enterprise": PlanLimits(max_seats=10_000, max_signals_per_month=-1, ...),  # -1 = unmetered
}
```

A single FastAPI dependency, `require_plan_capacity(resource: str)`, checked
at the specific mutation endpoints that need it — `POST /api/v1/users`
(seat count), signal ingestion (monthly volume), `create_team` when
`manager_role_enabled` is `False`. This is deliberately *not* a global
middleware: most endpoints (reading the dashboard, editing an existing
record) have nothing to do with plan limits, and gating them for no reason
just adds a Postgres round-trip to every request.

### 3.2 RBAC ↔ tier relationship

| Tier | `UserRole`s available | Team tree depth | Enforced by |
|---|---|---|---|
| Starter | `OWNER`, `MEMBER` | n/a (no `MANAGER`) | `UserCreate`/`UserUpdate` validation rejects `role=manager` when `organization.plan == "starter"` |
| Team | `OWNER`, `ADMIN`, `MANAGER`, `MEMBER` | unlimited | no new restriction — this is RBAC as it exists today |
| Enterprise | same roles, multiple `OWNER`-tier admins, multi-office `Team` roots | unlimited, multiple roots | same, plus SSO-provisioned role assignment (new work, not a limits check) |

The key point: **RBAC itself does not change per tier.** `UserRole` and the
visibility engine in `app/services/permissions/service.py` are
tier-agnostic — what changes per tier is which roles/features a plan is
*allowed to use*, checked at the handful of write endpoints where it
matters, never re-implemented per tier.

### 3.3 Billing lifecycle (Stripe)

```
/register (existing)
   → org created, plan="starter" (default), no Stripe customer yet
   → org can use BEE unmetered up to Starter's soft limits (see §3.1)
        ↓ user clicks "Upgrade" in Settings → Billing
   → POST /api/v1/billing/checkout-session
        creates a Stripe Checkout Session for the target price,
        Organization.stripe_customer_id set on first checkout
   → Stripe-hosted checkout (BEE never touches card details)
        ↓ webhook: checkout.session.completed
   → POST /api/v1/billing/webhook (signature-verified, like the existing
     outbound-webhook signing pattern in app.services.external_api)
        sets Organization.plan = <purchased tier>
        ↓ subscription lifecycle continues in Stripe
   → customer.subscription.updated / .deleted webhooks keep
     Organization.plan in sync (downgrade, cancellation, payment failure
     → grace period → downgrade to "starter" rather than locking the org out)
```

New models this implies: `Organization.stripe_customer_id: str | None` and
`Organization.stripe_subscription_id: str | None` (nullable, same
backward-compatibility posture as every other optional field on
`Organization`), plus a `BillingEvent` audit table (raw webhook payloads,
append-only) so a disputed charge or a support question about "why did we
get downgraded" has a real record — same rationale as `AuditEntry`, applied
to billing instead of agent decisions.

### 3.4 What this deliberately does not do

- **No usage-based line items in v1.** Per-seat + tiered signal caps are
  enough to launch; metered billing (charging per signal ingested past the
  cap, à la Twilio) is a real v2 feature, not a blocker for v1 self-serve.
- **No in-app card storage.** Stripe Checkout/Customer Portal handles the
  card; BEE never stores or even transits a PAN. Nothing in
  `app/core/security.py`'s threat model needs to change for this.
- **No proration logic to hand-build.** Stripe Billing computes proration
  on upgrade/downgrade natively — reimplementing that in FastAPI would be
  pure risk for no benefit.

## 4. Open questions for whoever builds this

1. Annual discount depth, and whether Team-tier volume pricing is a fixed
   per-seat curve or negotiated case by case.
2. Whether a downgrade that would put an org over the new tier's seat limit
   (e.g. Team → Starter with 15 active users) blocks the downgrade or
   force-deactivates the newest members — product decision, not a technical
   one.
3. Trial length and whether it requires a card upfront (higher-intent,
   lower-volume signups) or not (more signups, lower conversion) — this is
   the single biggest self-serve conversion lever and deserves real A/B
   data before committing either way.
