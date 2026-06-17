"""MCP server wiring: tool registration over the sample bundle."""

import asyncio
from pathlib import Path

from pagent.server import create_server

SAMPLE_SHOW = Path(__file__).parent.parent / "shows" / "sample-show"

EXPECTED_TOOLS = {
    "search_docs",
    "get_document",
    "get_call_time",
    "get_rundown",
    "list_crew",
    "list_documents",
}


def test_server_registers_all_tools() -> None:
    server = create_server(SAMPLE_SHOW)
    tool_names = {tool.name for tool in asyncio.run(server.list_tools())}
    assert tool_names == EXPECTED_TOOLS


def test_every_tool_requires_a_role() -> None:
    server = create_server(SAMPLE_SHOW)
    for tool in asyncio.run(server.list_tools()):
        assert "role" in tool.inputSchema["properties"], tool.name


def test_pinned_server_ignores_caller_supplied_role() -> None:
    server = create_server(SAMPLE_SHOW, pinned_role="utility")
    _, result = asyncio.run(
        server.call_tool("get_document", {"doc_name": "talent-contacts.yaml", "role": "producer"})
    )
    assert result["error"] == "permission_denied"
    assert result["role"] == "utility"


def test_pinned_producer_keeps_full_access() -> None:
    server = create_server(SAMPLE_SHOW, pinned_role="producer")
    _, result = asyncio.run(server.call_tool("list_crew", {"role": "utility"}))
    assert result["contacts_included"] is True
    _, result = asyncio.run(
        server.call_tool("get_document", {"doc_name": "talent-contacts.yaml", "role": "utility"})
    )
    assert result["doc"] == "talent-contacts.yaml"


def test_unpinned_server_uses_caller_supplied_role() -> None:
    server = create_server(SAMPLE_SHOW)
    _, result = asyncio.run(
        server.call_tool("get_document", {"doc_name": "talent-contacts.yaml", "role": "producer"})
    )
    assert result["doc"] == "talent-contacts.yaml"
    _, result = asyncio.run(
        server.call_tool("get_document", {"doc_name": "talent-contacts.yaml", "role": "utility"})
    )
    assert result["error"] == "permission_denied"
