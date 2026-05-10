---
name: bizeros-knowledge
description: Capture, organize, and recall the user's personal knowledge as plain markdown files in a shared brain folder. Use when the user mentions their notes, knowledge base, daily journal, or asks you to remember, summarize, or look up something they've previously captured. Cross-link related notes with `[[Page Name]]` so the knowledge base becomes a navigable graph.
tags:
  - knowledge-management
  - notes
  - markdown
  - bizeros
metadata:
  openclaw:
    requires:
      env:
        - BRAIN_DIR
      bins: []
    primaryEnv: BRAIN_DIR
---

# BizerOS Knowledge

## When to Use

Use this skill any time the user:

- **Captures** something they want to remember (a meeting, a decision, a reading note, a thought)
- **Asks about prior context** ("what did we decide about X?", "what's the status of Y?", "who did I talk to about Z?")
- **Mentions a person, project, or topic recurrently** — even casually — and would benefit from those references being linked together
- **Asks for a summary** of recent activity, a person, a project, or a topic
- **Wants the brain updated** with new information (a name change, a corrected fact, a status update)

Skip this skill when the user is asking a one-off question that has nothing to do with their personal context (e.g., general programming help, generic explanations).

## Quick Reference

The brain lives at `$BRAIN_DIR` (default `/srv/bizeros/brain`). Four tools operate on it:

| Tool | Purpose |
|---|---|
| `list_notes()` | Enumerate every `.md` path. Use to discover before writing. |
| `search_notes(query)` | Substring search across paths and contents (case-insensitive, max 50 hits). |
| `read_note(path)` | Read the full contents of one note. Always read before updating. |
| `write_note(path, content)` | Replace the entire file at `path`. Creates parent folders if needed. |

### Folder conventions

- `daily/YYYY-MM-DD.md` — daily journal-style capture (one note per day)
- `pages/<Topic>.md` — topical or per-entity notes; one note per person, project, place, or recurring idea (e.g., `pages/Project Aurora.md`, `pages/Sarah Johnson.md`)

Use exact human-friendly filenames. `pages/Project Aurora.md`, not `pages/project-aurora.md`. The user reads these in a UI that links by exact name.

### Wiki links

Cross-link related notes with `[[Page Name]]`. The first time you reference a person, project, or recurring topic in a daily note, link it to its topical page. The link target is the basename of the file without the `.md` extension. The web UI auto-creates a stub note if the target doesn't exist yet.

Optional alias form: `[[Sarah Johnson|Sarah]]` displays as "Sarah" but links to `pages/Sarah Johnson.md`.

## Procedure

### Capturing from a conversation or event

1. Compute today's path: `daily/YYYY-MM-DD.md` (UTC or user's local; pick one and be consistent).
2. `read_note(today_path)` — if it returns `ok: false`, treat as empty.
3. **Identify entities** mentioned: people, projects, decisions, recurring topics.
4. Append a new section to the day's note with what was captured. Use `[[Page Name]]` for every entity.
5. `write_note(today_path, merged_content)` — pass the full file contents, never just the new section.
6. **For each new or significantly-updated entity**: ensure `pages/<Entity>.md` exists. If it doesn't, write a stub:

   ```
   # <Entity>

   First mentioned in [[YYYY-MM-DD]].
   ```

   If it already exists, optionally update it with what's new (use the "Updating" procedure below).

### Updating a topical page

1. `read_note('pages/<Entity>.md')` — preserve existing structure and content; do not paraphrase or rewrite what's already there unless the user asked.
2. Merge new context into the existing structure: extend lists, add subsections, update status lines, add a new dated entry under a "## History" or "## Updates" section.
3. `write_note('pages/<Entity>.md', merged_content)` — full content, never partial.

### Recalling for the user

1. `search_notes(query)` — start with the user's words. Try variants if the first miss returns nothing useful.
2. For the top 3-5 hits, `read_note(path)` to get the actual content.
3. **Synthesize the answer from the read contents** — quote or summarize what's actually in the user's notes, do not invent or fill in from your training data. If the brain is silent on the question, say so.
4. When citing, use the path: "From `daily/2026-04-12.md`: …"

### Cleaning up or restructuring

When the user asks you to merge duplicate notes, rename a topic, or reorganize:

1. `list_notes()` to see the current structure.
2. Use `read_note` to confirm what's in each affected file.
3. Plan the merge or move; explain it to the user before executing if it touches more than ~5 files.
4. Execute with `write_note` (and use the file-api `move` endpoint via the user if a true rename is needed — this skill does not include a delete or move tool by design).

## Pitfalls

- **`write_note` replaces the entire file.** Always `read_note` first when updating; never call `write_note` with only the new content. This is the #1 source of data loss.
- **Don't invent paths or filenames.** When unsure whether a note exists, `search_notes` or `list_notes` first. Creating `pages/sarah.md` when `pages/Sarah Johnson.md` already exists fragments the brain.
- **Preserve the user's words.** When updating an existing note, extend or annotate; don't rewrite. The user reads these in a web UI and notices when their phrasing changes.
- **The user may also be editing.** If they were typing in the UI when you write, the UI surfaces a conflict banner. Avoid spurious writes — only write when there's a real change to commit.
- **Markdown only.** Stick to plain markdown. No HTML unless the user has been using HTML in the brain already.
- **One topic, one note.** Don't create `pages/Aurora Launch.md` if `pages/Project Aurora.md` already covers it. Update the existing note.
- **Wiki-link the basename, not the path.** `[[Sarah Johnson]]`, not `[[pages/Sarah Johnson.md]]` or `[[Sarah Johnson.md]]`.
- **Date format.** Always `YYYY-MM-DD` for daily notes — sorts chronologically and matches the UI's "Today" button.

## Verification

After a capture or update, verify:

1. `read_note(path)` and confirm the content is what you intended (especially after a `write_note` that merged old + new).
2. For wiki links: each `[[Page]]` reference in a daily note should resolve to either an existing `pages/<Page>.md` or a freshly-created stub. `list_notes()` after the operation should show all referenced pages.
3. For recall: the answer to the user should be supportable by quoting from the notes you read. If you can't quote it, you're hallucinating — re-read or admit the gap.
