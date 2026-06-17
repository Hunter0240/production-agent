"""Tool implementations behind the MCP server.

Every function takes the requesting crew member's role and filters its
answer through the permission model. These are plain functions so they
can be tested without a running MCP server; ``pagent.server`` registers
them as MCP tools.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from pagent.bundle import ShowBundle
from pagent.permissions import AccessTier, accessible_docs, can_access, normalize_role, role_tier
from pagent.retrieval import search

CALLSHEET = "callsheet.yaml"
RUNDOWN = "rundown.yaml"
DEFAULT_TIMEZONE = "PT"


def _duration_seconds(value: str) -> int:
    """Parse a MM:SS (or HH:MM:SS) duration into seconds."""
    parts = [int(p) for p in str(value).split(":")]
    seconds = 0
    for part in parts:
        seconds = seconds * 60 + part
    return seconds


def _time_of_day_seconds(value: str) -> int:
    """Parse a HH:MM (or HH:MM:SS) wall-clock time into seconds since midnight."""
    parts = [int(p) for p in str(value).split(":")]
    h = parts[0] if len(parts) > 0 else 0
    m = parts[1] if len(parts) > 1 else 0
    s = parts[2] if len(parts) > 2 else 0
    return h * 3600 + m * 60 + s


def _clock(seconds: int) -> str:
    """Format a seconds-since-midnight offset as HH:MM:SS."""
    seconds %= 24 * 3600
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _front_times(start: str, segments: list[dict[str, Any]]) -> list[str]:
    """Time-of-day start for each segment: `start` plus cumulative durations."""
    cursor = _time_of_day_seconds(start) if start else 0
    fronts: list[str] = []
    for seg in segments:
        fronts.append(_clock(cursor))
        cursor += _duration_seconds(seg.get("duration", "00:00"))
    return fronts


def _denied(role: str, detail: str) -> dict[str, Any]:
    """Structured permission-denied response."""
    if role_tier(role) is None:
        detail = f"Unknown role '{role}'. Access is denied by default. {detail}".strip()
    return {"error": "permission_denied", "role": role, "detail": detail}


def list_documents(bundle: ShowBundle, role: str) -> dict[str, Any]:
    """Documents this role can read, with one-line descriptions."""
    docs = accessible_docs(role, bundle.doc_manifest, bundle.doc_owners)
    if not docs:
        return _denied(role, "No documents are visible to this role.")
    return {
        "role": role,
        "documents": [
            {"name": name, "description": bundle.descriptions.get(name, "")} for name in docs
        ],
    }


def get_document(bundle: ShowBundle, doc_name: str, role: str) -> dict[str, Any]:
    """Full text of one document, if the role is permitted to read it."""
    access = bundle.doc_manifest.get(doc_name)
    if access is None:
        return {
            "error": "not_found",
            "detail": f"No document named '{doc_name}'. Use list_documents to see what exists.",
        }
    if not can_access(role, access, bundle.doc_owners.get(doc_name)):
        return _denied(
            role,
            f"'{doc_name}' requires '{access}' access. "
            "Ask a producer-line crew member if you need its contents.",
        )
    return {"doc": doc_name, "access": access, "content": bundle.document_text(doc_name)}


def search_docs(bundle: ShowBundle, query: str, role: str, top_k: int = 5) -> dict[str, Any]:
    """Keyword search over the documents this role can read."""
    docs = accessible_docs(role, bundle.doc_manifest, bundle.doc_owners)
    if not docs:
        return _denied(role, "No documents are searchable for this role.")
    results = search(bundle.chunks(docs), query, top_k=top_k)
    return {
        "query": query,
        "role": role,
        "searched_documents": docs,
        "results": [asdict(result) for result in results],
    }


def get_call_time(bundle: ShowBundle, department_or_name: str, role: str) -> dict[str, Any]:
    """Call time for a department, or for a crew member via their department.

    Name lookups resolve the person's department from the crew list and
    return only the department call time; contact details stay gated
    behind list_crew and the crew.csv document permission.
    """
    if not can_access(role, bundle.doc_manifest.get(CALLSHEET, "production")):
        return _denied(role, "The callsheet is not visible to this role.")
    callsheet = bundle.document_data(CALLSHEET)
    departments = {entry["department"].lower(): entry for entry in callsheet.get("departments", [])}
    wanted = department_or_name.strip().lower()

    entry = departments.get(wanted)
    matched_name: str | None = None
    if entry is None:
        for member in bundle.crew():
            if member["name"].lower() == wanted:
                matched_name = member["name"]
                entry = departments.get(member["department"].lower())
                break
    if entry is None:
        return {
            "error": "not_found",
            "detail": f"No department or crew member matching '{department_or_name}'.",
            "departments": sorted(departments),
        }
    result: dict[str, Any] = {
        "department": entry["department"],
        "call": entry["call"],
        "timezone": callsheet.get("timezone", DEFAULT_TIMEZONE),
        "note": entry.get("note", ""),
        "date": str(callsheet.get("date", "")),
        "location": callsheet.get("location", {}).get("venue", ""),
    }
    if matched_name is not None:
        result["crew_member"] = matched_name
    return result


def get_rundown(bundle: ShowBundle, role: str, segment: str | None = None) -> dict[str, Any]:
    """One rundown segment by item number or title, or a full summary."""
    if not can_access(role, bundle.doc_manifest.get(RUNDOWN, "production")):
        return _denied(role, "The rundown is not visible to this role.")
    rundown = bundle.document_data(RUNDOWN)
    segments: list[dict[str, Any]] = rundown.get("segments", [])
    start = str(rundown.get("start", ""))
    timezone = rundown.get("timezone", DEFAULT_TIMEZONE)
    fronts = _front_times(start, segments)
    if segment is None or not segment.strip():
        return {
            "start": start,
            "timezone": timezone,
            "segments": [
                {
                    "item": s["item"],
                    "front_time": fronts[i],
                    "title": s["title"],
                    "duration": s["duration"],
                    "talent": s.get("talent", ""),
                }
                for i, s in enumerate(segments)
            ],
        }
    wanted = segment.strip().lower()
    for i, entry in enumerate(segments):
        if wanted == str(entry["item"]) or wanted in entry["title"].lower():
            return {
                "timezone": timezone,
                "segment": {"front_time": fronts[i], **entry},
            }
    return {
        "error": "not_found",
        "detail": f"No rundown segment matching '{segment}'.",
        "items": [{"item": s["item"], "title": s["title"]} for s in segments],
    }


def list_crew(bundle: ShowBundle, role: str, department: str | None = None) -> dict[str, Any]:
    """Crew list. Producer-line roles see contacts; others see name and role."""
    tier = role_tier(role)
    if tier is None:
        return _denied(role, "The crew list is not visible to unknown roles.")
    members = bundle.crew()
    if department:
        wanted = normalize_role(department)
        members = [m for m in members if normalize_role(m["department"]) == wanted]
    include_contacts = tier >= AccessTier.PRODUCTION
    crew = [
        {
            "name": m["name"],
            "role": m["role"],
            "department": m["department"],
            **({"email": m["email"], "phone": m["phone"]} if include_contacts else {}),
        }
        for m in members
    ]
    return {"role": role, "contacts_included": include_contacts, "crew": crew}
