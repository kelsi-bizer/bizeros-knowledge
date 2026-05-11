"""Reference implementation of the four BizerBrain skill tools.

Drop into any Python-based agent harness (Hermes, OpenClaw, custom).
Register the four functions against the JSON Schema definitions in
tools/definitions.json. Reads BRAIN_DIR from the environment; defaults
to /srv/bizerbrain/brain.

These tools talk to the filesystem directly. They do NOT go through the
notes-app's HTTP file-api. That makes them simpler and lower-latency
when the agent runs on the same VM as the brain folder, and it removes
any need for auth or network setup.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

BRAIN_DIR = Path(os.environ.get("BRAIN_DIR", "/srv/bizerbrain/brain")).resolve()

ALLOWED_EXTENSIONS = {".md"}


class BrainPathError(ValueError):
    """Raised when a path is outside the brain folder or otherwise invalid."""


def _safe_path(rel: str) -> Path:
    """Resolve `rel` against BRAIN_DIR, rejecting traversal and null bytes."""
    if not isinstance(rel, str) or not rel:
        raise BrainPathError("path is required")
    if "\0" in rel:
        raise BrainPathError("path contains null byte")
    candidate = (BRAIN_DIR / rel.lstrip("/")).resolve()
    try:
        candidate.relative_to(BRAIN_DIR)
    except ValueError as exc:
        raise BrainPathError(f"path escapes brain root: {rel}") from exc
    return candidate


def _ensure_md(path: str) -> str:
    return path if path.endswith(".md") else f"{path}.md"


# ── Tools ────────────────────────────────────────────────────────────────────

def list_notes() -> dict:
    """Return every .md path under BRAIN_DIR, sorted alphabetically."""
    if not BRAIN_DIR.exists():
        return {"ok": True, "notes": []}
    notes = []
    for root, _dirs, files in os.walk(BRAIN_DIR):
        for name in files:
            if not name.lower().endswith(".md"):
                continue
            full = Path(root) / name
            try:
                rel = full.relative_to(BRAIN_DIR).as_posix()
            except ValueError:
                continue
            notes.append(rel)
    notes.sort()
    return {"ok": True, "notes": notes}


def search_notes(query: str, limit: int = 50) -> dict:
    """Case-insensitive substring search across paths and contents."""
    if not isinstance(query, str) or not query:
        return {"ok": False, "error": "query is required"}
    limit = max(1, min(int(limit), 200))
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    hits: list[dict] = []
    if not BRAIN_DIR.exists():
        return {"ok": True, "hits": hits}
    for root, _dirs, files in os.walk(BRAIN_DIR):
        for name in files:
            if not name.lower().endswith(".md"):
                continue
            full = Path(root) / name
            try:
                rel = full.relative_to(BRAIN_DIR).as_posix()
                text = full.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            if pattern.search(rel) or pattern.search(text):
                snippet = ""
                for line in text.splitlines():
                    if pattern.search(line):
                        snippet = line.strip()[:200]
                        break
                hits.append({"path": rel, "snippet": snippet})
                if len(hits) >= limit:
                    return {"ok": True, "hits": hits}
    return {"ok": True, "hits": hits}


def read_note(path: str) -> dict:
    try:
        full = _safe_path(_ensure_md(path))
    except BrainPathError as err:
        return {"ok": False, "error": str(err)}
    if not full.is_file():
        return {"ok": False, "error": "not_found", "path": path}
    try:
        content = full.read_text(encoding="utf-8")
    except OSError as err:
        return {"ok": False, "error": f"read failed: {err}"}
    return {"ok": True, "path": path, "content": content}


def write_note(path: str, content: str) -> dict:
    if not isinstance(content, str):
        return {"ok": False, "error": "content must be a string"}
    safe_path = _ensure_md(path)
    try:
        full = _safe_path(safe_path)
    except BrainPathError as err:
        return {"ok": False, "error": str(err)}
    full.parent.mkdir(parents=True, exist_ok=True)
    # Atomic write: tmp + replace, so a half-finished write never appears.
    tmp = full.with_suffix(full.suffix + f".tmp.{os.getpid()}")
    try:
        tmp.write_text(content, encoding="utf-8")
        tmp.replace(full)
    except OSError as err:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
        return {"ok": False, "error": f"write failed: {err}"}
    return {
        "ok": True,
        "path": safe_path,
        "bytes": len(content.encode("utf-8")),
    }


# ── Tool registry ────────────────────────────────────────────────────────────

TOOLS = {
    "list_notes": list_notes,
    "search_notes": search_notes,
    "read_note": read_note,
    "write_note": write_note,
}


def call(name: str, arguments: dict) -> dict:
    """Dispatch a tool call by name. Convenience for harnesses that prefer a
    single entry point."""
    fn = TOOLS.get(name)
    if not fn:
        return {"ok": False, "error": f"unknown tool: {name}"}
    try:
        return fn(**(arguments or {}))
    except TypeError as err:
        return {"ok": False, "error": f"bad arguments for {name}: {err}"}


__all__ = [
    "BRAIN_DIR",
    "BrainPathError",
    "list_notes",
    "search_notes",
    "read_note",
    "write_note",
    "TOOLS",
    "call",
]
