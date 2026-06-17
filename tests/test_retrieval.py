"""Retrieval: chunking, relevance, and permission-filtered search."""

from pagent import tools
from pagent.bundle import ShowBundle
from pagent.retrieval import chunk_markdown, chunk_yaml, search


class TestChunking:
    def test_markdown_chunks_by_heading(self) -> None:
        text = "# Title\nintro\n## Power\n400 amps\n## Safety\nhard hats\n"
        sections = [c.section for c in chunk_markdown("venue.md", text)]
        assert sections == ["Title", "Power", "Safety"]

    def test_yaml_chunks_by_top_level_key(self) -> None:
        text = "camera:\n  - item: lens\naudio:\n  - item: console\n"
        sections = [c.section for c in chunk_yaml("gear.yaml", text)]
        assert sections == ["camera", "audio"]


class TestRelevance:
    def test_lens_package_query_hits_gear_manifest(self, bundle: ShowBundle) -> None:
        # The gear manifest is common, so a camera operator's lens query lands on
        # the equipment list's camera section ahead of the tech-specs camera plan.
        response = tools.search_docs(bundle, "lens packages", "camera operator")
        top = response["results"][0]
        assert top["doc"] == "gear-manifest.yaml"
        assert top["section"] == "camera"

    def test_results_carry_provenance_and_scores(self, bundle: ShowBundle) -> None:
        response = tools.search_docs(bundle, "RF coordination frequencies", "a1")
        assert response["results"]
        for result in response["results"]:
            assert result["doc"] in response["searched_documents"]
            assert result["section"]
            assert result["score"] > 0

    def test_no_match_returns_empty_results(self, bundle: ShowBundle) -> None:
        response = tools.search_docs(bundle, "zzgrxq", "producer")
        assert response["results"] == []


class TestSearchPermissions:
    def test_crew_search_never_touches_restricted_docs(self, bundle: ShowBundle) -> None:
        response = tools.search_docs(bundle, "Mara Velasco agent phone", "camera utility")
        assert "talent-contacts.yaml" not in response["searched_documents"]
        assert all(r["doc"] != "talent-contacts.yaml" for r in response["results"])

    def test_producer_search_can_hit_restricted_docs(self, bundle: ShowBundle) -> None:
        response = tools.search_docs(bundle, "Mara Velasco agent phone", "producer")
        assert any(r["doc"] == "talent-contacts.yaml" for r in response["results"])

    def test_unknown_role_search_is_denied(self, bundle: ShowBundle) -> None:
        response = tools.search_docs(bundle, "call time", "mystery guest")
        assert response["error"] == "permission_denied"

    def test_empty_query_returns_no_results(self) -> None:
        assert search([], "lens") == []
