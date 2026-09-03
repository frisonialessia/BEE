"""JiraApiClient — the thin Jira Cloud REST v3 wrapper behind
opportunity-stage sync (see
``app.services.workflow_orchestrator.handlers.JiraSyncHandler``).

Every call targets ``https://api.atlassian.com/ex/jira/{cloud_id}/...`` —
Jira Cloud's app-proxy host, not a customer's own ``*.atlassian.net``
domain directly (that only works for Basic Auth / API tokens, not OAuth
2.0 (3LO) app access — see jira_oauth.py's module docstring on why
``cloud_id`` has to be resolved separately in the first place).

Two write operations only, both one-way (BEE never reads Jira issues
back): create an issue, add a comment. No workflow transitions — a
project's transition IDs are configured per-project and guessing wrong
would either silently no-op or move the issue somewhere the team didn't
intend, so this deliberately never attempts one (see JiraSyncHandler's
own docstring for the full reasoning).
"""

from __future__ import annotations

from typing import Any

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)

API_BASE = "https://api.atlassian.com/ex/jira"


class JiraApiError(Exception):
    """Raised when Jira rejects a create-issue or add-comment call."""


def _adf_paragraph(text: str) -> dict[str, Any]:
    """Wrap plain text in the Atlassian Document Format the v3 API
    requires for ``description``/comment bodies — Jira Cloud stopped
    accepting a bare string for these fields some time ago."""
    return {
        "type": "doc",
        "version": 1,
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


class JiraApiClient:
    def __init__(self, *, access_token: str, cloud_id: str) -> None:
        self._headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        self._base = f"{API_BASE}/{cloud_id}/rest/api/3"

    def create_issue(
        self, *, project_key: str, summary: str, description: str, issue_type: str = "Task"
    ) -> str:
        """Returns the created issue's key (e.g. ``"SALES-123"``)."""
        try:
            resp = httpx.post(
                f"{self._base}/issue",
                headers=self._headers,
                json={
                    "fields": {
                        "project": {"key": project_key},
                        "summary": summary,
                        "issuetype": {"name": issue_type},
                        "description": _adf_paragraph(description),
                    }
                },
                timeout=15.0,
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("Jira create-issue failed (project=%s): %s", project_key, exc)
            raise JiraApiError(f"Jira rejected the issue creation: {exc}") from exc
        key = resp.json().get("key")
        if not key:
            raise JiraApiError("Jira accepted the request but returned no issue key.")
        return str(key)

    def add_comment(self, *, issue_key: str, text: str) -> None:
        try:
            resp = httpx.post(
                f"{self._base}/issue/{issue_key}/comment",
                headers=self._headers,
                json={"body": _adf_paragraph(text)},
                timeout=15.0,
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("Jira add-comment failed (issue=%s): %s", issue_key, exc)
            raise JiraApiError(f"Jira rejected the comment: {exc}") from exc
