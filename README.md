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

## Deploy (new client — start to finish)

On a fresh VM with Docker installed. This is the whole thing; follow it top to bottom.

```bash
# 1. Create the brain folder. Your notes live here, on the host.
sudo mkdir -p /srv/bizerbrain/brain

# 2. Get the compose file
curl -fsSL https://raw.githubusercontent.com/kelsi-bizer/bizerbrain/master/docker-compose.yml -o docker-compose.yml

# 3. Start BizerBrain
docker compose up -d

# 4. Confirm it's healthy
docker compose ps
curl -s http://127.0.0.1:8080/api/health      # -> {"ok":true,"brainDir":"/brain"}
```

**Reach the UI from your laptop** (the container is bound to the VM's
loopback only — nothing is exposed publicly):

```bash
ssh -L 8080:localhost:8080 user@your-vm
# then open http://localhost:8080 in your browser
```

**Connect your AI agent** (if it runs in its own container, e.g. Hermes/OpenClaw):

```bash
# Put the agent's container on the same network as BizerBrain
docker network connect bizerbrain <your-agent-container-name>

# Then set this env var on the agent process and install the skill or
# MCP server (see "Agent integration" below):
#   BIZERBRAIN_API_URL=http://bizerbrain:8080
```

That's the entire deployment. `http://bizerbrain:8080` is the URL the
agent uses in every example and as the code default — it works for
container-to-container traffic because the app listens on both port 80
and 8080 inside the container. No port juggling, no manual bridge IPs.

## Components

- **`packages/notes-app`** — Vite + React markdown editor (the web UI)
- **`packages/file-api`** — Fastify HTTP service that exposes the brain folder as a tiny REST API used by the SPA
- **`packages/mcp-server`** — Model Context Protocol server that exposes the brain to any MCP-capable agent over stdio
- **`docker/`** — nginx config and entrypoint that runs the web UI + file-api inside one container
- **`.agents/skills/bizerbrain`** — agent skill (agentskills.io format) compatible with Hermes Agent, OpenClaw, and Claude Code; ClawHub-publishable

## Agent integration

The agent connects to BizerBrain over **HTTP**, not the filesystem. The agent can live in its own container, on its own VM, or anywhere it can reach the BizerBrain instance — no shared volume mount required.

Set one env var on the agent process:

| Where the agent runs | `BIZERBRAIN_API_URL` |
|---|---|
| Its own container on the same Docker host (Hermes, OpenClaw, …) — **the common case** | `http://bizerbrain:8080` (after `docker network connect bizerbrain <agent>`) |
| Directly on the host, no container | `http://localhost:8080` |
| A different machine | `http://<bizerbrain-vm-ip-or-hostname>:8080` |

`http://bizerbrain:8080` is also the built-in default, so for the common containerized case you often don't need to set anything beyond joining the network.

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

The compose file binds the host port to `127.0.0.1:8080` — the UI is only reachable from the VM itself (use the SSH tunnel). It is **not** exposed publicly.

Agent containers reach BizerBrain over the internal Docker network at `http://bizerbrain:8080`, not through the host port. The container listens on both port 80 and 8080 internally, so the `:8080` URL works the same from a container as it does through the host tunnel — there is only one URL to remember. The single requirement is that the agent's container is attached to the `bizerbrain` network:

```bash
docker network connect bizerbrain <your-agent-container>
```

To confirm the agent can reach it:

```bash
docker exec <your-agent-container> \
  python3 -c "import urllib.request; print(urllib.request.urlopen('http://bizerbrain:8080/api/health', timeout=5).read().decode())"
```

Expected: `{"ok":true,"brainDir":"/brain"}`.

## License

Apache-2.0. See [LICENSE](LICENSE).
