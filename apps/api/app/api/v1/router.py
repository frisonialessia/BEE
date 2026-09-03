"""Aggregate router for API v1.

New endpoint modules are wired in here. Versioning the router (``/api/v1``) lets
the API evolve without breaking existing integrations.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    analytics,
    anomalies,
    api_keys,
    audit,
    auth,
    autopilot,
    bi_feed,
    billing,
    brand,
    companies,
    contact,
    corrections,
    dark_funnel,
    dead_letter,
    engagement,
    federated_intelligence,
    feedback,
    health,
    insights,
    integrations,
    internal_job_queue,
    internal_market_scan,
    internal_support,
    leads,
    meetings,
    ml_training,
    network,
    notifications_stream,
    opportunities,
    opportunity_tasks,
    orchestrator,
    organizations,
    outbound_webhooks,
    priority,
    psychographic,
    quotas,
    saved_views,
    scenarios,
    sequences,
    signals,
    sso,
    teams,
    templates,
    users,
    webhooks,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(sso.router)
api_router.include_router(autopilot.router)
api_router.include_router(federated_intelligence.router)
api_router.include_router(ml_training.router)
api_router.include_router(internal_support.router)
api_router.include_router(internal_market_scan.router)
api_router.include_router(internal_job_queue.router)
api_router.include_router(teams.router)
api_router.include_router(users.router)
api_router.include_router(api_keys.router)
api_router.include_router(signals.router)
api_router.include_router(leads.router)
api_router.include_router(meetings.router)
api_router.include_router(companies.router)
api_router.include_router(contact.router)
api_router.include_router(opportunities.router)
api_router.include_router(opportunity_tasks.router)
api_router.include_router(outbound_webhooks.router)
api_router.include_router(orchestrator.router)
api_router.include_router(priority.router)
api_router.include_router(insights.router)
api_router.include_router(feedback.router)
api_router.include_router(analytics.router)
api_router.include_router(bi_feed.router)
api_router.include_router(brand.router)
api_router.include_router(engagement.router)
api_router.include_router(sequences.router)
api_router.include_router(templates.router)
api_router.include_router(quotas.router)
api_router.include_router(saved_views.router)
api_router.include_router(organizations.router)
api_router.include_router(integrations.router)
api_router.include_router(psychographic.router)
api_router.include_router(dark_funnel.router)
api_router.include_router(network.router)
api_router.include_router(notifications_stream.router)
api_router.include_router(dead_letter.router)
api_router.include_router(audit.router)
api_router.include_router(corrections.router)
api_router.include_router(scenarios.router)
api_router.include_router(anomalies.router)
api_router.include_router(webhooks.router)
api_router.include_router(billing.router)
