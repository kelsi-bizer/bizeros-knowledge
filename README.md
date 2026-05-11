# BizerBrain

A markdown knowledge base for AI agents and humans, built around plain files on disk. Notes live as `.md` files in a folder; an AI agent and a web UI both read and write the same files, with live updates between them.

## Architecture

```
   AI agent (Hermes / OpenClaw / Claude Code)
                  │  reads & writes
                  ▼
        /srv/bizerbrain/brain/    ◄──── volume
                  ▲                     │
   reads & writes │                     │
                  │              ┌──────┴───────────────────┐
                  └──────────────┤  Docker container         │
                                 │   nginx (web UI)          │
                                 │   file-api (Node)         │
                                 └────────┬──────────────────┘
                                          │  SSH tunnel
                                          ▼
                                   Browser on your laptop
```

## Quickstart

On a VM (assuming Docker is installed):

```bash
sudo mkdir -p /srv/bizerbrain/brain

docker run -d \
  --name bizerbrain \
  --restart unless-stopped \
  -v /srv/bizerbrain/brain:/brain \
  -p 127.0.0.1:8080:80 \
  ghcr.io/kelsi-bizer/bizerbrain:latest
```

From your laptop, tunnel to the UI:

```bash
ssh -L 8080:localhost:8080 user@your-vm
```

Then open `http://localhost:8080`.

## Components

- **`packages/notes-app`** — Vite + React markdown editor (the web UI)
- **`packages/file-api`** — Fastify HTTP service that exposes the brain folder as a tiny REST API used by the SPA
- **`packages/mcp-server`** — Model Context Protocol server that exposes the brain to any MCP-capable agent over stdio
- **`docker/`** — nginx config and entrypoint that runs the web UI + file-api inside one container
- **`.agents/skills/bizerbrain`** — agent skill (agentskills.io format) compatible with Hermes Agent, OpenClaw, and Claude Code; ClawHub-publishable

## Agent integration

Two equally-valid ways to connect an agent. Pick the one your agent supports — both target the same brain folder and expose the same four tools (`list_notes`, `search_notes`, `read_note`, `write_note`).

### Option A — MCP server (any MCP-capable agent)

For agents that speak the Model Context Protocol — Claude Code, Cursor, MCP-Inspector, custom clients — add one entry to the agent's MCP config:

```json
{
  "mcpServers": {
    "bizerbrain": {
      "command": "node",
      "args": ["/opt/bizerbrain/packages/mcp-server/src/server.js"],
      "env": { "BRAIN_DIR": "/srv/bizerbrain/brain" }
    }
  }
}
```

That's the entire integration. The agent reads and writes markdown directly under `/srv/bizerbrain/brain/`.

### Option B — agentskills.io skill (Hermes, OpenClaw, Claude Code)

For agents that load skills from a skills directory, symlink the skill in:

```bash
# Hermes
ln -s /opt/bizerbrain/.agents/skills/bizerbrain ~/.hermes/skills/bizerbrain

# OpenClaw
ln -s /opt/bizerbrain/.agents/skills/bizerbrain ~/.openclaw/skills/bizerbrain

# Set the brain dir for the agent process
export BRAIN_DIR=/srv/bizerbrain/brain
```

The skill teaches the agent the brain conventions (folder layout, wiki-links, the compiled-truth + timeline page structure). See `.agents/skills/bizerbrain/SKILL.md` for the full instructions the agent follows.

## License

Apache-2.0. See [LICENSE](LICENSE).
