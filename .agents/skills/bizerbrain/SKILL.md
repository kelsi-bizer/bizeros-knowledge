---
name: bizerbrain
description: Capture, organize, and recall the user's personal knowledge as plain markdown files in a shared brain folder. Use when the user mentions their notes, knowledge base, daily journal, or asks you to remember, summarize, or look up something they've previously captured. Cross-link related notes with `[[Page Name]]` so the knowledge base becomes a navigable graph.
tags:
  - knowledge-management
  - notes
  - markdown
  - bizerbrain
metadata:
  openclaw:
    requires:
      env:
        - BIZERBRAIN_API_URL
      bins: []
    primaryEnv: BIZERBRAIN_API_URL
---

# BizerBrain

## When to Use

Use this skill any time the user:

- **Captures** something they want to remember (a meeting, a decision, a reading note, a thought)
- **Drops in a raw source** (a transcript, an article, an email thread) and wants it filed into the brain
- **Asks about prior context** ("what did we decide about X?", "what's the status of Y?", "who did I talk to about Z?")
- **Mentions a person, project, or topic recurrently** — even casually — and would benefit from those references being linked together
- **Asks for a summary** of recent activity, a person, a project, or a topic
- **Wants the brain updated** with new information (a name change, a corrected fact, a status update)

Skip this skill when the user is asking a one-off question that has nothing to do with their personal context (e.g., general programming help, generic explanations).

## Quick Reference

The brain is served by the BizerBrain HTTP API at `$BIZERBRAIN_API_URL` (default `http://bizerbrain:8080`). Four tools operate on it:

| Tool | Purpose |
|---|---|
| `list_notes()` | Enumerate every `.md` path. Use to discover before writing. |
| `search_notes(query)` | Substring search across paths and contents (case-insensitive, max 50 hits). |
| `read_note(path)` | Read the full contents of one note. Always read before updating. |
| `write_note(path, content)` | Replace the entire file at `path`. Creates parent folders if needed. |

### Folder conventions

Three folders, three jobs:

- **`sources/`** — **raw, immutable inputs.** Transcripts, articles, email dumps, dictated notes, anything the user drops in for you to process. **Treat as append-only.** Never rewrite the body of a source file. You may add a small `<!-- ingested: YYYY-MM-DD -->` HTML comment at the top, but do not edit the content.
- **`pages/`** — **the wiki: synthesized topical or per-entity notes.** One note per person, project, place, recurring idea (e.g., `pages/Project Aurora.md`, `pages/Sarah Johnson.md`). You own these — create them, maintain them, merge as needed.
- **`daily/`** — **the human's journal.** One note per day, named `daily/YYYY-MM-DD.md`. The user may write here directly. You may append, but be conservative — preserve their voice.

The boundary that matters most: **`sources/` is read-only for you; `pages/` is yours to maintain; `daily/` is the user's home turf.**

Use exact human-friendly filenames in `pages/`. `pages/Project Aurora.md`, not `pages/project-aurora.md`. The user reads these in a UI that links by exact name.

### Wiki links

Cross-link related notes with `[[Page Name]]`. The first time you reference a person, project, or recurring topic in a daily note or a source, link it to its topical page in `pages/`. The link target is the basename of the file without the `.md` extension. The web UI auto-creates a stub note if the target doesn't exist yet.

Optional alias form: `[[Sarah Johnson|Sarah]]` displays as "Sarah" but links to `pages/Sarah Johnson.md`.

### Page structure: compiled truth + timeline

Every note in `pages/` follows this structure:

```markdown
# <Entity name>

<Compiled truth — a concise, current, rewritable summary of what is
known. 1–6 paragraphs or a few bullet points. This is what you'd
tell someone who asked "who/what is X?" in a sentence or two.>

---

## Timeline

- YYYY-MM-DD — <event or fact> ([[daily/YYYY-MM-DD]] or [[sources/...]])
- YYYY-MM-DD — <earlier event>
- ...
```

The **compiled truth** above the `---` separator is rewritable: you keep it current as new information arrives. The **timeline** below is **append-only**: every meaningful piece of evidence gets a new dated entry with a back-link to where it came from. Never delete or rewrite timeline entries; only add to them.

This gives the user two things in one file: the current understanding (truth), and the provenance trail (timeline) they can audit if they ever doubt something you wrote.

`sources/` files do not follow this structure — they're raw input. `daily/` files do not follow this structure — they're the user's journal.

## Procedure

### Capturing from a conversation or event (daily note)

1. Compute today's path: `daily/YYYY-MM-DD.md`.
2. `read_note(today_path)` — if it returns `ok: false`, treat as empty.
3. **Identify entities** mentioned: people, projects, decisions, recurring topics.
4. Append a new section to the day's note with what was captured. Use `[[Page Name]]` for every entity.
5. `write_note(today_path, merged_content)` — pass the full file contents, never just the new section.
6. **For each entity referenced**: update or stub the topical page in `pages/` using the "Update a topical page" procedure below.

### Ingesting a source (transcript, article, email)

1. Pick a clear filename under `sources/`, dated and descriptive: `sources/2026-05-09 product review transcript.md`.
2. `read_note(path)` to confirm it's not already filed. If the user pasted content but didn't pick a path, choose one and tell them.
3. `write_note(path, content)` — write the raw source verbatim. Optionally add a one-line HTML comment with the date you ingested it.
4. **Extract entities** from the source: people, projects, decisions, dates, claims.
5. For each entity, **update its topical page** (see below). Link the new timeline entries back to `[[sources/<filename>]]`.
6. **Do not** synthesize the source into `pages/` so heavily that you replace it. The source is the receipt; the wiki is the synthesis.

### Updating a topical page (the truth + timeline pattern)

1. `read_note('pages/<Entity>.md')`. If `ok: false`, create with a stub (see "Stubbing a new entity" below).
2. **Decide if the compiled truth needs to change.** New information may:
   - Add a fact ("Sarah is now the launch lead") → update truth
   - Correct a fact ("Sarah moved to Berlin in March, not February") → update truth
   - Add a one-time event with no lasting effect ("Sarah was on PTO last week") → timeline only
3. Update the compiled-truth section above the `---` separator to reflect the current state.
4. **Append** a new timeline entry below the `---` with the date and a back-link. Never edit or remove existing timeline entries.
5. `write_note('pages/<Entity>.md', merged_content)` with the full file contents.

### Stubbing a new entity

When you reference `[[Name]]` for the first time and the file doesn't exist yet, create:

```markdown
# Name

First mentioned in [[daily/YYYY-MM-DD]].

---

## Timeline

- YYYY-MM-DD — First mention in [[daily/YYYY-MM-DD]]
```

You can flesh out the compiled truth later as more arrives.

### Recalling for the user

1. `search_notes(query)` — start with the user's words. Try variants if the first miss returns nothing useful.
2. For the top 3-5 hits, `read_note(path)` to get the actual content.
3. **Synthesize the answer from the read contents** — quote or summarize what's actually in the user's notes, do not invent or fill in from your training data. The compiled-truth sections of `pages/` are the best starting point; consult the timeline or the underlying `sources/` files when the user asks "how do we know?" or "when did that happen?"
4. When citing, use the path: "From `pages/Sarah Johnson.md`: …" or "Per the 2026-04-22 source: …"
5. If the brain is silent on the question, say so.

## Pitfalls

- **`write_note` replaces the entire file.** Always `read_note` first when updating. This is the #1 source of data loss.
- **Never rewrite a `sources/` file.** They are receipts. If a source contains errors, note the correction on the relevant topical page's timeline; don't edit the source.
- **Never delete timeline entries.** Even a fact you later contradict belongs in the timeline — it's the audit trail.
- **Don't invent paths or filenames.** When unsure whether a note exists, `search_notes` or `list_notes` first. Creating `pages/sarah.md` when `pages/Sarah Johnson.md` already exists fragments the brain.
- **Preserve the user's words in daily notes.** When extending an existing daily entry, append rather than rewrite. The user reads these in a web UI and notices when their phrasing changes.
- **The user may also be editing.** If they were typing in the UI when you write, the UI surfaces a conflict banner. Avoid spurious writes — only write when there's a real change to commit.
- **Markdown only.** Stick to plain markdown. No HTML unless the user has been using HTML in the brain already (the dated `<!-- ingested -->` comment in sources is the one exception).
- **One topic, one note.** Don't create `pages/Aurora Launch.md` if `pages/Project Aurora.md` already covers it. Update the existing note.
- **Wiki-link the basename, not the path.** `[[Sarah Johnson]]`, not `[[pages/Sarah Johnson.md]]` or `[[Sarah Johnson.md]]`.
- **Date format.** Always `YYYY-MM-DD` for daily notes and timeline entries.

## Verification

After a capture or update, verify:

1. `read_note(path)` and confirm the content is what you intended (especially after a `write_note` that merged old + new).
2. For wiki links: each `[[Page]]` reference in a daily note or source should resolve to either an existing `pages/<Page>.md` or a freshly-created stub. `list_notes()` after the operation should show all referenced pages.
3. For pages, confirm the structure is intact: a compiled-truth section, a `---` separator, a `## Timeline` heading, and dated entries with back-links.
4. For recall: the answer to the user should be supportable by quoting from the notes you read. If you can't quote it, you're hallucinating — re-read or admit the gap.
