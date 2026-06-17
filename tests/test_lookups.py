"""Structured lookups: call times, rundown, and crew contact gating."""

from pagent import tools
from pagent.bundle import ShowBundle


class TestGetCallTime:
    def test_department_lookup(self, bundle: ShowBundle) -> None:
        response = tools.get_call_time(bundle, "camera", "camera operator")
        assert response["call"] == "09:00"
        assert response["department"] == "camera"

    def test_name_lookup_resolves_department(self, bundle: ShowBundle) -> None:
        response = tools.get_call_time(bundle, "Lena Brooks", "a2")
        assert response["department"] == "audio"
        assert response["call"] == "08:00"
        assert response["crew_member"] == "Lena Brooks"

    def test_name_lookup_returns_no_contact_info(self, bundle: ShowBundle) -> None:
        response = tools.get_call_time(bundle, "Lena Brooks", "a2")
        assert "email" not in response
        assert "phone" not in response

    def test_unknown_target_lists_departments(self, bundle: ShowBundle) -> None:
        response = tools.get_call_time(bundle, "catering", "producer")
        assert response["error"] == "not_found"
        assert "camera" in response["departments"]

    def test_unknown_role_is_denied(self, bundle: ShowBundle) -> None:
        response = tools.get_call_time(bundle, "camera", "paparazzi")
        assert response["error"] == "permission_denied"


class TestGetRundown:
    def test_full_summary_has_all_segments(self, bundle: ShowBundle) -> None:
        response = tools.get_rundown(bundle, "utility")
        assert len(response["segments"]) == 12
        assert {"item", "front_time", "title", "duration", "talent"} == set(
            response["segments"][0]
        )

    def test_front_times_compute_from_start(self, bundle: ShowBundle) -> None:
        response = tools.get_rundown(bundle, "utility")
        assert response["start"] == "19:00"
        assert response["timezone"] == "PT"
        # First segment starts at the on-air time; the second follows the
        # first segment's 01:30 duration.
        assert response["segments"][0]["front_time"] == "19:00:00"
        assert response["segments"][1]["front_time"] == "19:01:30"

    def test_segment_by_item_number(self, bundle: ShowBundle) -> None:
        response = tools.get_rundown(bundle, "camera operator", "180")
        assert response["segment"]["item"] == 180
        assert response["segment"]["front_time"] == "20:01:00"
        assert "camera_notes" in response["segment"]

    def test_segment_by_title_substring(self, bundle: ShowBundle) -> None:
        response = tools.get_rundown(bundle, "td", "finale")
        assert response["segment"]["item"] == 200

    def test_unknown_segment_lists_items(self, bundle: ShowBundle) -> None:
        response = tools.get_rundown(bundle, "producer", "encore")
        assert response["error"] == "not_found"
        assert response["items"]


class TestListCrew:
    def test_producer_line_gets_full_contacts(self, bundle: ShowBundle) -> None:
        response = tools.list_crew(bundle, "production assistant")
        assert response["contacts_included"] is True
        member = response["crew"][0]
        assert member["email"].endswith("@example.com")
        assert member["phone"].startswith("555")

    def test_general_crew_gets_names_and_roles_only(self, bundle: ShowBundle) -> None:
        response = tools.list_crew(bundle, "camera utility")
        assert response["contacts_included"] is False
        for member in response["crew"]:
            assert "email" not in member
            assert "phone" not in member
            assert member["name"] and member["role"]

    def test_department_head_gets_no_contacts(self, bundle: ShowBundle) -> None:
        response = tools.list_crew(bundle, "technical director")
        assert response["contacts_included"] is False

    def test_department_filter(self, bundle: ShowBundle) -> None:
        response = tools.list_crew(bundle, "producer", department="audio")
        assert {m["role"] for m in response["crew"]} == {"A1", "A2"}

    def test_unknown_role_is_denied(self, bundle: ShowBundle) -> None:
        response = tools.list_crew(bundle, "tour manager")
        assert response["error"] == "permission_denied"
