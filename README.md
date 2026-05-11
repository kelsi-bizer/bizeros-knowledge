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
- **`docker/`** — nginx config and entrypoint that runs both inside one container
- **`.agents/skills/bizerbrain`** — agent skill (agentskills.io format) compatible with Hermes Agent, OpenClaw, and Claude Code; ClawHub-publishable

## Agent integration

Drop the skill into the agent's skill directory:

```bash
# Hermes
ln -s /opt/bizerbrain/.agents/skills/bizerbrain ~/.hermes/skills/bizerbrain

# OpenClaw
ln -s /opt/bizerbrain/.agents/skills/bizerbrain ~/.openclaw/skills/bizerbrain

# Set the brain dir for the agent process
export BRAIN_DIR=/srv/bizerbrain/brain
```

The skill exposes four tools to the agent: `list_notes`, `search_notes`, `read_note`, `write_note`. See `.agents/skills/bizerbrain/SKILL.md` for the conventions and tool reference the agent follows.

## License

Apache-2.0. See [LICENSE](LICENSE).
