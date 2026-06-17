"""Production Agent (PA) MCP server.

Exposes a show bundle's production documents as MCP tools over stdio.
Every tool takes the requesting crew member's role and answers only
from documents that role is permitted to read. With ``--role`` the
server is pinned to one role and the per-call role argument is ignored.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

from pagent import tools
from pagent.bundle import load_bundle

DEFAULT_SHOW = "shows/sample-show"

INSTRUCTIONS = (
    "The Production Agent (PA) serves a live broadcast show's production paperwork. "
    "Every tool requires the requesting crew member's role (for example "
    "'producer', 'technical director', 'camera operator') and only returns "
    "information that role is cleared to see. Start with list_documents to "
    "see what a role can access."
)


def create_server(show_path: str | Path, pinned_role: str | None = None) -> FastMCP:
    """Build the MCP server for one show bundle.

    When `pinned_role` is set the server runs role-pinned: the per-call
    `role` argument on every tool is overridden by the pinned role, so
    the caller cannot escalate beyond what the server config grants.
    """
    bundle = load_bundle(show_path)
    show_name = bundle.metadata.get("name", "show")
    instructions = f"{INSTRUCTIONS} Loaded show: {show_name}."
    if pinned_role is not None:
        instructions += (
            f" This server is pinned to the role '{pinned_role}'; the role "
            "argument on each tool is ignored."
        )
    mcp = FastMCP("pagent", instructions=instructions)

    def effective_role(role: str) -> str:
        """The role permissions are checked against; the pinned role wins."""
        return pinned_role if pinned_role is not None else role

    @mcp.tool()
    def search_docs(query: str, role: str) -> dict[str, Any]:
        """Keyword search over the show documents this role can read.

        Returns the best-matching sections with document and section
        provenance so answers can be cited back to the paperwork.
        """
        return tools.search_docs(bundle, query, effective_role(role))

    @mcp.tool()
    def get_document(doc_name: str, role: str) -> dict[str, Any]:
        """Full contents of one show document, if this role may read it."""
        return tools.get_document(bundle, doc_name, effective_role(role))

    @mcp.tool()
    def get_call_time(department_or_name: str, role: str) -> dict[str, Any]:
        """Call time for a department or a named crew member."""
        return tools.get_call_time(bundle, department_or_name, effective_role(role))

    @mcp.tool()
    def get_rundown(role: str, segment: str | None = None) -> dict[str, Any]:
        """One rundown segment (by item number or title), or the full summary."""
        return tools.get_rundown(bundle, effective_role(role), segment)

    @mcp.tool()
    def list_crew(role: str, department: str | None = None) -> dict[str, Any]:
        """Crew list, optionally for one department.

        Producer-line roles get full contact info; everyone else gets
        name, role, and department only.
        """
        return tools.list_crew(bundle, effective_role(role), department)

    @mcp.tool()
    def list_documents(role: str) -> dict[str, Any]:
        """The documents this role can read, with one-line descriptions."""
        return tools.list_documents(bundle, effective_role(role))

    return mcp


def main() -> None:
    """CLI entry point: run the server over stdio."""
    parser = argparse.ArgumentParser(
        prog="pagent",
        description="Production-docs MCP server with permission-aware retrieval.",
    )
    parser.add_argument(
        "--show",
        default=DEFAULT_SHOW,
        help=f"Path to a show bundle directory (default: {DEFAULT_SHOW})",
    )
    parser.add_argument(
        "--role",
        default=None,
        help=(
            "Pin the server to one crew role. When set, the per-call role "
            "argument on every tool is ignored and permissions are checked "
            "against this role instead."
        ),
    )
    args = parser.parse_args()
    create_server(args.show, pinned_role=args.role).run(transport="stdio")


if __name__ == "__main__":
    main()
