"""Reference implementation of the four BizerBrain skill tools.

Calls the BizerBrain file-api over HTTP. Configure with the
`BIZERBRAIN_API_URL` env var (default `http://bizerbrain:8080`).

Drop into any Python-based agent harness (Hermes, OpenClaw, custom).
Register the four functions against the JSON Schema definitions in
tools/definitions.json. The agent can run in its own container, on
its own VM, or anywhere with HTTP reach to the BizerBrain instance
— no filesystem mount required.
"""

from __future__ import annotations

import json
import os
from urllib import error, parse, request

API_URL = os.environ.get("BIZERBRAIN_API_URL", "http://bizerbrain:8080").rstrip("/")
HTTP_TIMEOUT = float(os.environ.get("BIZERBRAIN_HTTP_TIMEOUT", "10"))


def get_api_url() -> str:
    return API_URL


def _http(method: str, path_and_query: str,
          body: bytes | None = None,
          content_type: str | None = None) -> tuple[int, bytes]:
    url = f"{API_URL}{path_and_query}"
    req = request.Request(url, method=method, data=body)
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            return resp.status, resp.read()
    except error.HTTPError as exc:
        return exc.code, exc.read() or b""
    except (error.URLError, TimeoutError) as exc:
        return 0, str(exc).encode("utf-8")


def _ensure_md(path: str) -> str:
    return path if path.endswith(".md") else f"{path}.md"


def list_notes() -> dict:
    status, body = _http("GET", "/api/tree")
    if status != 200:
        return {"ok": False, "error": f"http {status}: {body.decode(errors='replace')}"}
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"invalid response: {exc}"}
    notes = sorted(
        e["path"] for e in data.get("entries", [])
        if not e.get("isDir") and e.get("path", "").endswith(".md")
    )
    return {"ok": True, "notes": notes}


def search_notes(query: str, limit: int = 50) -> dict:
    if not isinstance(query, str) or not query:
        return {"ok": False, "error": "query is required"}
    qs = parse.urlencode({"query": query, "limit": int(limit)})
    status, body = _http("GET", f"/api/search?{qs}")
    if status != 200:
        return {"ok": False, "error": f"http {status}: {body.decode(errors='replace')}"}
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"invalid response: {exc}"}
    return {"ok": True, "hits": data.get("hits", [])}


def read_note(path: str) -> dict:
    if not isinstance(path, str) or not path:
        return {"ok": False, "error": "path is required"}
    target = _ensure_md(path)
    qs = parse.urlencode({"path": target})
    status, body = _http("GET", f"/api/file?{qs}")
    if status == 404:
        return {"ok": False, "error": "not_found", "path": target}
    if status != 200:
        return {"ok": False, "error": f"http {status}: {body.decode(errors='replace')}"}
    return {"ok": True, "path": target, "content": body.decode("utf-8")}


def write_note(path: str, content: str) -> dict:
    if not isinstance(path, str) or not path:
        return {"ok": False, "error": "path is required"}
    if not isinstance(content, str):
        return {"ok": False, "error": "content must be a string"}
    target = _ensure_md(path)
    qs = parse.urlencode({"path": target})
    encoded = content.encode("utf-8")
    status, body = _http(
        "PUT", f"/api/file?{qs}",
        body=encoded,
        content_type="text/markdown"
    )
    if status != 200:
        return {"ok": False, "error": f"http {status}: {body.decode(errors='replace')}"}
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        data = {}
    return {"ok": True, "path": target, "bytes": data.get("size", len(encoded))}


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
    except TypeError as exc:
        return {"ok": False, "error": f"bad arguments for {name}: {exc}"}


__all__ = [
    "API_URL",
    "get_api_url",
    "list_notes",
    "search_notes",
    "read_note",
    "write_note",
    "TOOLS",
    "call",
]
