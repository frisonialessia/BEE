"""NetworkNavigator — warm introduction path finder.

Sales built on relationships outperform cold outreach by 5-10x in response rate
and significantly in deal velocity. This service maps the CEO's professional
network to identify the shortest, strongest paths to any target company contact.

Path finding algorithm
----------------------
Given a target company domain, the navigator:

1. **Direct match** (1st-degree, path_length=1):
   Find all connections where ``contact_domain == target_domain``.
   These contacts are directly in the CEO's network — no intro needed.

2. **2nd-degree warm intro** (path_length=2):
   Find connections that share ``mutual_connection_ids`` with known contacts
   at the target company. The CEO asks the mutual connection for an intro.
   Score = (CEO↔Connector strength + Connector↔Target estimate) / 2

3. **Alumni / community paths** (fallback, path_length=2-3):
   Connections with ``connection_type in (ALUMNI, COMMUNITY)`` who might
   know someone at the target company via shared background.

4. **Cold fallback** (path_length=∞):
   If no paths found, signal ``cold_outreach_fallback=True`` and recommend
   a cold outreach strategy using the DarkFunnelService intent signals as
   personalization context.

Score computation
-----------------
``strength_score = relationship_strength × (2.0 - (path_length - 1) × 0.4)``

A direct connection with strength 8 → score 8.
A 2nd-degree connection via a strength-8 connector → score ≈ 4.8.

The top-scored path becomes ``NetworkQueryResult.best_path``.

Draft intro request generation
-------------------------------
For 2nd-degree paths, the navigator generates a ``draft_ask`` — a natural-
language intro request the CEO can send to the connector. This is adapted
by the PsychographicAnalyzer (if the connector's style is known) before
presenting it to the CEO via the AgentOrchestrator.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.network import ConnectionType, NetworkConnection
from app.schemas.network import (
    IntroPath,
    IntroStep,
    NetworkConnectionCreate,
    NetworkQueryResult,
    NetworkStats,
)

logger = get_logger(__name__)

_PATH_SCORE_DECAY = 0.4  # Score decay per additional path hop


class NetworkNavigator:
    """Maps the CEO's professional network to find warm introduction paths."""

    def __init__(self, session: Session) -> None:
        self.session = session

    # ── Connection management ─────────────────────────────────────────────────

    def add_connection(self, data: NetworkConnectionCreate) -> NetworkConnection:
        """Add a new connection to the CEO's network."""
        conn = NetworkConnection(
            contact_name=data.contact_name,
            contact_company=data.contact_company,
            contact_domain=data.contact_domain.lower().strip(),
            contact_title=data.contact_title,
            contact_email=data.contact_email,
            contact_linkedin_url=data.contact_linkedin_url,
            connection_type=data.connection_type,
            relationship_strength=data.relationship_strength,
            notes=data.notes,
            tags=data.tags,
            industries=data.industries,
            source=data.source,
        )
        self.session.add(conn)
        self.session.flush()
        self.session.refresh(conn)
        logger.info(
            "NetworkConnection added: name=%s company=%s strength=%d",
            conn.contact_name, conn.contact_company, conn.relationship_strength,
        )
        return conn

    def get_connection(self, connection_id: uuid.UUID) -> NetworkConnection | None:
        return self.session.get(NetworkConnection, connection_id)

    def list_connections(
        self,
        connection_type: str | None = None,
        industry: str | None = None,  # noqa: ARG002
        min_strength: int = 1,
        limit: int = 100,
    ) -> list[NetworkConnection]:
        stmt = (
            select(NetworkConnection)
            .where(NetworkConnection.active)
            .where(NetworkConnection.relationship_strength >= min_strength)
            .order_by(NetworkConnection.relationship_strength.desc())
            .limit(limit)
        )
        if connection_type:
            stmt = stmt.where(NetworkConnection.connection_type == connection_type)
        return list(self.session.exec(stmt).all())

    def delete_connection(self, connection_id: uuid.UUID) -> bool:
        conn = self.session.get(NetworkConnection, connection_id)
        if not conn:
            return False
        conn.active = False
        self.session.add(conn)
        self.session.flush()
        return True

    # ── Path finding (the core intelligence method) ───────────────────────────

    def find_intro_paths(
        self,
        target_domain: str,
        target_company: str | None = None,
        target_name: str | None = None,
        top_k: int = 5,
    ) -> NetworkQueryResult:
        """Find warm introduction paths from the CEO to a target company.

        Args:
            target_domain:  Email domain of the target company (e.g. 'techcorp.com')
            target_company: Optional company name for display purposes.
            target_name:    Optional name of the specific person to reach.
            top_k:          Max number of paths to return.

        Returns:
            A :class:`NetworkQueryResult` with ranked intro paths.
        """
        domain = target_domain.lower().strip()
        company_label = target_company or domain

        paths: list[IntroPath] = []

        # ── Step 1: Direct connections at the target company ──────────────────
        direct = self._find_direct_connections(domain)
        for conn in direct:
            path = self._build_direct_path(conn, company_label, target_name)
            paths.append(path)

        # ── Step 2: 2nd-degree warm intro paths ───────────────────────────────
        if len(paths) < top_k:
            warm_paths = self._find_second_degree_paths(domain, company_label, target_name)
            paths.extend(warm_paths)

        # ── Step 3: Alumni / community paths ──────────────────────────────────
        if len(paths) < top_k:
            alumni_paths = self._find_alumni_paths(domain, company_label, target_name)
            paths.extend(alumni_paths)

        # Sort by strength score descending, take top_k
        paths.sort(key=lambda p: p.strength_score, reverse=True)
        paths = paths[:top_k]

        best = paths[0] if paths else None
        cold_fallback = len(paths) == 0
        coverage = self._coverage_label(paths)

        logger.info(
            "NetworkNavigator: domain=%s paths=%d best_type=%s",
            domain, len(paths), best.intro_type if best else "none",
        )

        return NetworkQueryResult(
            target_company=company_label,
            target_domain=domain,
            paths_found=paths,
            best_path=best,
            cold_outreach_fallback=cold_fallback,
            network_coverage=coverage,
        )

    def get_stats(self) -> NetworkStats:
        """Return summary statistics for the CEO's network."""
        all_conns = list(self.session.exec(
            select(NetworkConnection).where(NetworkConnection.active)
        ).all())

        if not all_conns:
            return NetworkStats(
                total_connections=0, first_degree_count=0, second_degree_count=0,
                top_industries=[], avg_relationship_strength=0.0, companies_covered=0,
            )

        industry_counts: dict[str, int] = {}
        for conn in all_conns:
            for ind in (conn.industries or []):
                industry_counts[ind] = industry_counts.get(ind, 0) + 1

        top_industries = sorted(industry_counts.keys(), key=lambda k: industry_counts[k], reverse=True)[:5]
        companies = {c.contact_domain for c in all_conns}

        return NetworkStats(
            total_connections=len(all_conns),
            first_degree_count=sum(1 for c in all_conns if c.connection_type == ConnectionType.FIRST_DEGREE),
            second_degree_count=sum(1 for c in all_conns if c.connection_type == ConnectionType.SECOND_DEGREE),
            top_industries=top_industries,
            avg_relationship_strength=round(sum(c.relationship_strength for c in all_conns) / len(all_conns), 1),
            companies_covered=len(companies),
        )

    # ── Private helpers ───────────────────────────────────────────────────────

    def _find_direct_connections(self, domain: str) -> list[NetworkConnection]:
        return list(
            self.session.exec(
                select(NetworkConnection)
                .where(NetworkConnection.contact_domain == domain)
                .where(NetworkConnection.active)
                .order_by(NetworkConnection.relationship_strength.desc())
            ).all()
        )

    def _build_direct_path(
        self,
        conn: NetworkConnection,
        company_label: str,
        target_name: str | None,
    ) -> IntroPath:
        strength = float(conn.relationship_strength)
        return IntroPath(
            target_name=target_name,
            target_company=company_label,
            target_domain=conn.contact_domain,
            path_length=1,
            intro_type="warm_intro",
            strength_score=strength,
            connector_name=conn.contact_name,
            connector_id=str(conn.id),
            steps=[
                IntroStep(
                    person="You (CEO)",
                    company="Your Company",
                    relationship_to_next=f"Direct connection ({conn.connection_type})",
                    strength=conn.relationship_strength,
                ),
                IntroStep(
                    person=conn.contact_name,
                    company=company_label,
                    relationship_to_next="Direct contact",
                    strength=conn.relationship_strength,
                ),
            ],
            action_recommendation=f"You're directly connected to {conn.contact_name} at {company_label}. Reach out personally — no intro needed.",
            draft_ask=None,  # Direct: no intro request needed
        )

    def _find_second_degree_paths(
        self,
        domain: str,
        company_label: str,
        target_name: str | None,
    ) -> list[IntroPath]:
        """Find 2nd-degree paths: CEO → Connector → Target Company."""
        paths: list[IntroPath] = []

        # All 1st-degree connections that have mutual_connection_ids listed
        connectors = list(
            self.session.exec(
                select(NetworkConnection)
                .where(NetworkConnection.active)
                .where(NetworkConnection.contact_domain != domain)
                .order_by(NetworkConnection.relationship_strength.desc())
                .limit(50)
            ).all()
        )

        for connector in connectors:
            mutual_ids = connector.mutual_connection_ids or []
            if not mutual_ids:
                continue

            # Check if any mutual connection is at the target domain
            for mutual_id_str in mutual_ids:
                try:
                    mutual_id = uuid.UUID(mutual_id_str)
                except ValueError:
                    continue

                target_conn = self.session.get(NetworkConnection, mutual_id)
                if not target_conn or target_conn.contact_domain != domain:
                    continue

                # Found a 2nd-degree path!
                connector_strength = connector.relationship_strength
                # Estimate target connection strength (unknown → assume moderate)
                target_strength = target_conn.relationship_strength if target_conn else 5

                composite_strength = (connector_strength + target_strength) / 2 * (1 - _PATH_SCORE_DECAY)

                draft_ask = self._generate_intro_ask(
                    connector.contact_name,
                    target_name or "the team",
                    company_label,
                )

                path = IntroPath(
                    target_name=target_name,
                    target_company=company_label,
                    target_domain=domain,
                    path_length=2,
                    intro_type="warm_intro",
                    strength_score=round(composite_strength, 2),
                    connector_name=connector.contact_name,
                    connector_id=str(connector.id),
                    steps=[
                        IntroStep(
                            person="You (CEO)",
                            company="Your Company",
                            relationship_to_next=f"Strong relationship (strength {connector_strength}/10)",
                            strength=connector_strength,
                        ),
                        IntroStep(
                            person=connector.contact_name,
                            company=connector.contact_company,
                            relationship_to_next="Mutual connection",
                            strength=target_strength,
                        ),
                        IntroStep(
                            person=target_name or f"Contact at {company_label}",
                            company=company_label,
                            relationship_to_next="Target",
                            strength=target_strength,
                        ),
                    ],
                    action_recommendation=f"Ask {connector.contact_name} to introduce you to {target_name or 'the team'} at {company_label}.",
                    draft_ask=draft_ask,
                )
                paths.append(path)

        return paths

    def _find_alumni_paths(
        self,
        domain: str,
        company_label: str,
        target_name: str | None,
    ) -> list[IntroPath]:
        """Find alumni/community-based paths as a weaker warm intro option."""
        paths: list[IntroPath] = []

        # Look for alumni/community connections who might know the target company
        alumni = list(
            self.session.exec(
                select(NetworkConnection)
                .where(NetworkConnection.active)
                .where(NetworkConnection.connection_type.in_([ConnectionType.ALUMNI, ConnectionType.COMMUNITY]))
                .order_by(NetworkConnection.relationship_strength.desc())
                .limit(10)
            ).all()
        )

        for conn in alumni:
            strength = conn.relationship_strength * (1 - _PATH_SCORE_DECAY * 1.5)
            paths.append(IntroPath(
                target_name=target_name,
                target_company=company_label,
                target_domain=domain,
                path_length=2,
                intro_type="referral",
                strength_score=round(max(0.5, strength), 2),
                connector_name=conn.contact_name,
                connector_id=str(conn.id),
                steps=[
                    IntroStep(person="You (CEO)", company="Your Company", relationship_to_next=f"{conn.connection_type} bond", strength=conn.relationship_strength),
                    IntroStep(person=conn.contact_name, company=conn.contact_company, relationship_to_next="May know contacts at target", strength=5),
                    IntroStep(person=target_name or f"Contact at {company_label}", company=company_label, relationship_to_next="Target", strength=5),
                ],
                action_recommendation=f"Ask your {conn.connection_type} {conn.contact_name} if they know anyone at {company_label}.",
                draft_ask=f"Hey {conn.contact_name}, I noticed I'm trying to connect with the team at {company_label}. Given our shared background, do you happen to know anyone there who might be open to a quick conversation?",
            ))

        return paths

    @staticmethod
    def _generate_intro_ask(connector: str, target: str, company: str) -> str:
        return (
            f"Hi {connector},\n\n"
            f"I noticed you might know {target} at {company}. "
            f"I've been following their work and believe there's a genuine fit between what we do and their current challenges.\n\n"
            f"Would you be open to making a brief introduction? I'd make it easy — happy to send you a quick blurb you can forward.\n\n"
            f"Thanks in advance!\n[Your Name]"
        )

    @staticmethod
    def _coverage_label(paths: list[IntroPath]) -> str:
        if not paths:
            return "none"
        best_score = paths[0].strength_score if paths else 0
        if best_score >= 7:
            return "strong"
        if best_score >= 4:
            return "moderate"
        return "weak"
