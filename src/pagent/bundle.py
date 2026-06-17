"""Loading a show bundle from disk.

A show bundle is a directory of production documents. ``show.yaml``
holds show metadata plus the document manifest: each document's access
tag and a one-line description.
"""

from __future__ import annotations

import csv
from pathlib import Path

import yaml

from pagent.retrieval import Chunk, chunk_document

SHOW_FILE = "show.yaml"


class ShowBundle:
    """A loaded show bundle: metadata, document manifest, and file access."""

    def __init__(self, path: Path) -> None:
        self.path = path
        show_file = path / SHOW_FILE
        if not show_file.is_file():
            raise FileNotFoundError(f"Not a show bundle (missing {SHOW_FILE}): {path}")
        self.metadata: dict = yaml.safe_load(show_file.read_text(encoding="utf-8"))
        documents: dict[str, dict] = self.metadata.get("documents", {})
        #: Document name -> access tag (common | heads | production | personal).
        self.doc_manifest: dict[str, str] = {
            name: entry.get("access", "production") for name, entry in documents.items()
        }
        #: Document name -> owning role, for `personal` access docs only.
        self.doc_owners: dict[str, str] = {
            name: entry["role"]
            for name, entry in documents.items()
            if entry.get("access") == "personal" and "role" in entry
        }
        #: Document name -> one-line description.
        self.descriptions: dict[str, str] = {
            name: entry.get("description", "") for name, entry in documents.items()
        }

    def document_text(self, doc_name: str) -> str:
        """Raw text of a manifest document."""
        if doc_name not in self.doc_manifest:
            raise KeyError(doc_name)
        return (self.path / doc_name).read_text(encoding="utf-8")

    def document_data(self, doc_name: str) -> dict:
        """Parsed contents of a YAML manifest document."""
        return yaml.safe_load(self.document_text(doc_name))

    def crew(self) -> list[dict[str, str]]:
        """Crew rows from crew.csv."""
        with (self.path / "crew.csv").open(encoding="utf-8", newline="") as handle:
            return list(csv.DictReader(handle))

    def chunks(self, doc_names: list[str]) -> list[Chunk]:
        """Retrieval chunks for the given documents."""
        chunks: list[Chunk] = []
        for name in doc_names:
            chunks.extend(chunk_document(name, self.document_text(name)))
        return chunks


def load_bundle(path: str | Path) -> ShowBundle:
    """Load a show bundle from a directory path."""
    return ShowBundle(Path(path))
