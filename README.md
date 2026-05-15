# BizerBrain ![status](https://img.shields.io/badge/status-alpha-orange)

> [!WARNING]
> **BizerBrain is in alpha.** Brain-folder conventions, agent tool surfaces, and the Docker image layout may change between releases. Back up `/srv/bizerbrain/brain` before upgrading. Issues and feedback welcome.

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

The agent connects to BizerBrain over **HTTP**, not the filesystem. The agent can live in its own container, on its own VM, or anywhere it can reach the BizerBrain instance — no shared volume mount required.

Set one env var on the agent process:

```
BIZERBRAIN_API_URL=http://<bizerbrain-host>:8080
```

For agents running in another container on the same Docker host, put both containers on the same Docker network and use the BizerBrain service name (`http://bizerbrain:8080`). For agents on the same host outside containers, use `http://localhost:8080`. For agents on a different machine, use the BizerBrain VM's IP or hostname.

Two equally-valid ways to install the tools. Pick the one your agent supports — both call the same HTTP API and expose the same four tools (`list_notes`, `search_notes`, `read_note`, `write_note`).

### Option A — MCP server (any MCP-capable agent)

For agents that speak the Model Context Protocol — Claude Code, Cursor, MCP-Inspector, custom clients — add one entry to the agent's MCP config:

```json
{
  "mcpServers": {
    "bizerbrain": {
      "command": "node",
      "args": ["/opt/bizerbrain/packages/mcp-server/src/server.js"],
      "env": { "BIZERBRAIN_API_URL": "http://bizerbrain:8080" }
    }
  }
}
```

That's the entire integration. The agent's tool calls turn into HTTP requests to the BizerBrain file-api.

### Option B — agentskills.io skill (Hermes, OpenClaw, Claude Code)

For agents that load skills from a skills directory, symlink the skill in:

```bash
# Hermes
ln -s /opt/bizerbrain/.agents/skills/bizerbrain ~/.hermes/skills/bizerbrain

# OpenClaw
ln -s /opt/bizerbrain/.agents/skills/bizerbrain ~/.openclaw/skills/bizerbrain

# Point the agent process at the BizerBrain HTTP API
export BIZERBRAIN_API_URL=http://bizerbrain:8080
```

The skill teaches the agent the brain conventions (folder layout, wiki-links, the compiled-truth + timeline page structure). See `.agents/skills/bizerbrain/SKILL.md` for the full instructions the agent follows.

### Note on networking

The BizerBrain quickstart binds the container to `127.0.0.1:8080` on the host — only reachable from the host itself. If your agent is in another container, either:

- **Put both containers on the same Docker network** (recommended). Then use `http://bizerbrain:8080` from the agent.
- **Bind BizerBrain to `0.0.0.0:8080`** (in the `docker run` command, use `-p 8080:80` instead of `-p 127.0.0.1:8080:80`). Then the agent can reach it via the Docker bridge IP (typically `http://172.17.0.1:8080`).

For a single-VM setup with both containers on the same host, the first option is cleaner and keeps the brain off the public network.

## License

Apache-2.0. See [LICENSE](LICENSE).
