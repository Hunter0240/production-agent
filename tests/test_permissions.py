"""Permission model: tiers, deny-by-default, and document filtering."""

from pagent import tools
from pagent.bundle import ShowBundle
from pagent.permissions import accessible_docs, can_access, role_tier


class TestRoleTiers:
    def test_producer_line_roles_resolve(self) -> None:
        for role in ("Executive Producer", "producer", "PA", "Production Assistant"):
            assert role_tier(role) is not None

    def test_role_lookup_is_case_and_separator_insensitive(self) -> None:
        assert role_tier("Technical Director") == role_tier("technical-director")

    def test_unknown_role_has_no_tier(self) -> None:
        assert role_tier("craft services intern") is None


class TestAccessibleDocs:
    def test_restricted_doc_invisible_to_utility(self, bundle: ShowBundle) -> None:
        docs = accessible_docs("utility", bundle.doc_manifest)
        assert "talent-contacts.yaml" not in docs

    def test_restricted_doc_visible_to_producer(self, bundle: ShowBundle) -> None:
        docs = accessible_docs("producer", bundle.doc_manifest)
        assert "talent-contacts.yaml" in docs
        assert set(docs) == set(bundle.doc_manifest)

    def test_department_head_sees_heads_docs_not_production_docs(self, bundle: ShowBundle) -> None:
        docs = accessible_docs("A1", bundle.doc_manifest, bundle.doc_owners)
        assert "budget.yaml" in docs
        assert "rundown.yaml" in docs
        assert "talent-contacts.yaml" not in docs

    def test_budget_is_heads_only(self, bundle: ShowBundle) -> None:
        assert "budget.yaml" in accessible_docs(
            "technical director", bundle.doc_manifest, bundle.doc_owners
        )
        assert "budget.yaml" not in accessible_docs(
            "camera operator", bundle.doc_manifest, bundle.doc_owners
        )

    def test_general_crew_sees_common_docs_only(self, bundle: ShowBundle) -> None:
        docs = accessible_docs("camera operator", bundle.doc_manifest)
        assert "rundown.yaml" in docs
        # crew list and gear manifest are common: visible to all crew.
        assert "crew.csv" in docs
        assert "gear-manifest.yaml" in docs
        # production-tier contact sheet stays restricted.
        assert "talent-contacts.yaml" not in docs

    def test_unknown_role_gets_nothing(self, bundle: ShowBundle) -> None:
        assert accessible_docs("vibes coordinator", bundle.doc_manifest) == []

    def test_unknown_access_tag_is_denied(self) -> None:
        assert can_access("producer", "made-up-tier") is False


class TestPersonalDocs:
    def test_owner_role_sees_own_contract(self, bundle: ShowBundle) -> None:
        docs = accessible_docs("camera operator", bundle.doc_manifest, bundle.doc_owners)
        assert "contract-camera-operator.yaml" in docs

    def test_crew_cannot_see_another_roles_contract(self, bundle: ShowBundle) -> None:
        docs = accessible_docs("camera operator", bundle.doc_manifest, bundle.doc_owners)
        assert "contract-a1.yaml" not in docs

    def test_head_sees_own_contract_not_a_crew_contract(self, bundle: ShowBundle) -> None:
        docs = accessible_docs("a1", bundle.doc_manifest, bundle.doc_owners)
        assert "contract-a1.yaml" in docs
        assert "contract-camera-operator.yaml" not in docs

    def test_production_line_administers_all_contracts(self, bundle: ShowBundle) -> None:
        docs = accessible_docs("producer", bundle.doc_manifest, bundle.doc_owners)
        assert "contract-camera-operator.yaml" in docs
        assert "contract-a1.yaml" in docs
        assert set(docs) == set(bundle.doc_manifest)

    def test_get_document_enforces_personal_scope(self, bundle: ShowBundle) -> None:
        denied = tools.get_document(bundle, "contract-a1.yaml", "camera operator")
        assert denied["error"] == "permission_denied"
        ok = tools.get_document(bundle, "contract-a1.yaml", "a1")
        assert "Lena Brooks" in ok["content"]


class TestGetDocument:
    def test_denied_response_is_structured(self, bundle: ShowBundle) -> None:
        response = tools.get_document(bundle, "talent-contacts.yaml", "camera utility")
        assert response["error"] == "permission_denied"
        assert "talent-contacts.yaml" in response["detail"]

    def test_permitted_doc_returns_content(self, bundle: ShowBundle) -> None:
        response = tools.get_document(bundle, "talent-contacts.yaml", "executive producer")
        assert "Mara Velasco" in response["content"]

    def test_missing_doc_is_not_found(self, bundle: ShowBundle) -> None:
        response = tools.get_document(bundle, "budget.xlsx", "producer")
        assert response["error"] == "not_found"


class TestListDocuments:
    def test_unknown_role_is_denied(self, bundle: ShowBundle) -> None:
        response = tools.list_documents(bundle, "superfan")
        assert response["error"] == "permission_denied"

    def test_descriptions_included(self, bundle: ShowBundle) -> None:
        response = tools.list_documents(bundle, "stage manager")
        names = {doc["name"] for doc in response["documents"]}
        assert "gear-manifest.yaml" in names
        assert all(doc["description"] for doc in response["documents"])
