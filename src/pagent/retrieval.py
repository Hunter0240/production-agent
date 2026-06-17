"""Document chunking and keyword retrieval.

Documents are split into chunks (markdown by heading, YAML by top-level
key) and scored against a query with TF-IDF computed over the chunk
corpus. No external search library; the corpus is a handful of show
documents, so a transparent implementation beats a dependency.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$", re.MULTILINE)
_YAML_TOP_KEY_RE = re.compile(r"^([A-Za-z0-9_-]+):", re.MULTILINE)


@dataclass(frozen=True)
class Chunk:
    """A scoreable slice of a document with provenance."""

    doc: str
    section: str
    text: str


@dataclass(frozen=True)
class SearchResult:
    """A chunk matched to a query, with its relevance score."""

    doc: str
    section: str
    score: float
    text: str


def tokenize(text: str) -> list[str]:
    """Lowercase alphanumeric tokens."""
    return _TOKEN_RE.findall(text.lower())


def chunk_markdown(doc: str, text: str) -> list[Chunk]:
    """Split markdown into one chunk per heading section.

    Text before the first heading becomes a "preamble" chunk.
    """
    chunks: list[Chunk] = []
    matches = list(_HEADING_RE.finditer(text))
    if not matches:
        return [Chunk(doc=doc, section="document", text=text.strip())] if text.strip() else []
    preamble = text[: matches[0].start()].strip()
    if preamble:
        chunks.append(Chunk(doc=doc, section="preamble", text=preamble))
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[match.start() : end].strip()
        chunks.append(Chunk(doc=doc, section=match.group(2).strip(), text=body))
    return chunks


def chunk_yaml(doc: str, text: str) -> list[Chunk]:
    """Split YAML into one chunk per top-level key, raw text preserved."""
    matches = [m for m in _YAML_TOP_KEY_RE.finditer(text)]
    if not matches:
        return [Chunk(doc=doc, section="document", text=text.strip())] if text.strip() else []
    chunks: list[Chunk] = []
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[match.start() : end].strip()
        chunks.append(Chunk(doc=doc, section=match.group(1), text=body))
    return chunks


def chunk_document(doc: str, text: str) -> list[Chunk]:
    """Chunk a document by its file type."""
    if doc.endswith(".md"):
        return chunk_markdown(doc, text)
    if doc.endswith((".yaml", ".yml")):
        return chunk_yaml(doc, text)
    # CSV and anything else: score the file as a single chunk.
    return [Chunk(doc=doc, section="document", text=text.strip())] if text.strip() else []


def search(chunks: list[Chunk], query: str, top_k: int = 5) -> list[SearchResult]:
    """Rank chunks against a query with TF-IDF and return the top matches.

    Chunk scores are length-normalized so short, dense sections are not
    drowned out by long ones. Chunks matching no query term are dropped.
    """
    query_terms = tokenize(query)
    if not query_terms or not chunks:
        return []

    chunk_tokens = [tokenize(chunk.text) for chunk in chunks]
    doc_freq: Counter[str] = Counter()
    for tokens in chunk_tokens:
        doc_freq.update(set(tokens))
    n_chunks = len(chunks)

    results: list[SearchResult] = []
    for chunk, tokens in zip(chunks, chunk_tokens):
        if not tokens:
            continue
        counts = Counter(tokens)
        score = 0.0
        for term in query_terms:
            tf = counts[term] / len(tokens)
            if tf == 0.0:
                continue
            idf = math.log((n_chunks + 1) / (doc_freq[term] + 1)) + 1.0
            score += tf * idf
        if score > 0.0:
            results.append(
                SearchResult(doc=chunk.doc, section=chunk.section, score=round(score, 6), text=chunk.text)
            )
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:top_k]
