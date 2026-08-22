"""Organization/team-scoped visibility rules."""

from app.services.permissions.service import (
    get_descendant_team_ids,
    get_visible_user_ids,
)

__all__ = ["get_descendant_team_ids", "get_visible_user_ids"]
