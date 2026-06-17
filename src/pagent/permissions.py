"""Role-based access control for show documents.

Crew roles are grouped into three tiers:

- PRODUCTION (producer-line): sees every document, including restricted
  contact sheets and every personal document.
- HEADS (department heads): sees common documents plus head-level
  documents such as the budget.
- CREW (general crew): sees common documents only.

Each document in a show bundle carries an access tag (``common``,
``heads``, ``production``, or ``personal``) declared in the bundle's
``show.yaml``. A ``personal`` document also declares an owning ``role``
and is readable only by that role plus the producer line, who administer
agreements. Unknown roles are denied by default.
"""

from __future__ import annotations

from enum import IntEnum
from typing import Mapping


class AccessTier(IntEnum):
    """Access tiers ordered by privilege; higher values see more."""

    CREW = 0
    HEADS = 1
    PRODUCTION = 2


#: Document access tags mapped to the minimum tier that may read them.
DOC_ACCESS_LEVELS: dict[str, AccessTier] = {
    "common": AccessTier.CREW,
    "heads": AccessTier.HEADS,
    "production": AccessTier.PRODUCTION,
}

#: Known crew roles (normalized) mapped to their access tier.
ROLE_TIERS: dict[str, AccessTier] = {
    # Producer line: full access.
    "executive producer": AccessTier.PRODUCTION,
    "ep": AccessTier.PRODUCTION,
    "producer": AccessTier.PRODUCTION,
    "line producer": AccessTier.PRODUCTION,
    "production manager": AccessTier.PRODUCTION,
    "production coordinator": AccessTier.PRODUCTION,
    "production assistant": AccessTier.PRODUCTION,
    "pa": AccessTier.PRODUCTION,
    "director": AccessTier.PRODUCTION,
    # Department heads: common plus head-level documents.
    "technical director": AccessTier.HEADS,
    "td": AccessTier.HEADS,
    "engineer in charge": AccessTier.HEADS,
    "eic": AccessTier.HEADS,
    "a1": AccessTier.HEADS,
    "v1": AccessTier.HEADS,
    "stage manager": AccessTier.HEADS,
    "lighting director": AccessTier.HEADS,
    "ld": AccessTier.HEADS,
    # General crew: common documents only.
    "camera operator": AccessTier.CREW,
    "camera utility": AccessTier.CREW,
    "utility": AccessTier.CREW,
    "a2": AccessTier.CREW,
    "comms tech": AccessTier.CREW,
    "grip": AccessTier.CREW,
    "stagehand": AccessTier.CREW,
    "runner": AccessTier.CREW,
}


def normalize_role(role: str) -> str:
    """Normalize a role string for lookup: lowercase, single spaces."""
    return " ".join(role.replace("-", " ").replace("_", " ").lower().split())


def role_tier(role: str) -> AccessTier | None:
    """Return the access tier for a role, or None if the role is unknown."""
    return ROLE_TIERS.get(normalize_role(role))


def can_access(role: str, doc_access: str, doc_owner: str | None = None) -> bool:
    """Return True if `role` may read a document tagged `doc_access`.

    A ``personal`` document is readable by its owning role (`doc_owner`)
    and by the producer line, who administer agreements. Unknown roles
    and unknown access tags are denied.
    """
    tier = role_tier(role)
    if tier is None:
        return False
    if doc_access == "personal":
        if tier >= AccessTier.PRODUCTION:
            return True
        return doc_owner is not None and normalize_role(role) == normalize_role(doc_owner)
    required = DOC_ACCESS_LEVELS.get(doc_access)
    if required is None:
        return False
    return tier >= required


def accessible_docs(
    role: str,
    doc_manifest: Mapping[str, str],
    doc_owners: Mapping[str, str] | None = None,
) -> list[str]:
    """Return the documents in `doc_manifest` that `role` may read.

    `doc_manifest` maps document name to its access tag. `doc_owners`
    maps a personal document name to its owning role. Unknown roles get
    an empty list.
    """
    owners = doc_owners or {}
    return [
        doc for doc, access in doc_manifest.items() if can_access(role, access, owners.get(doc))
    ]
