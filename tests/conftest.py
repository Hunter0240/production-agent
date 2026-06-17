"""Shared fixtures: the sample show bundle."""

from pathlib import Path

import pytest

from pagent.bundle import ShowBundle, load_bundle

SAMPLE_SHOW = Path(__file__).parent.parent / "shows" / "sample-show"


@pytest.fixture(scope="session")
def bundle() -> ShowBundle:
    return load_bundle(SAMPLE_SHOW)
