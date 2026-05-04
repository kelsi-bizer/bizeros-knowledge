# Builds the BizerOS Knowledge web app image from this repository's source.
# The build context is the repo root, so the rebranded sources are baked into
# the resulting image rather than being re-cloned from upstream Logseq.

# Builder image
FROM clojure:temurin-11-tools-deps-1.11.1.1208-bullseye-slim as builder

ARG DEBIAN_FRONTEND=noninteractive

# Install reqs
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    apt-transport-https \
    gpg \
    build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# install NodeJS & pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get update && apt-get install -y nodejs && \
    corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /data

COPY . /data

RUN pnpm install --config.network-timeout=240000

RUN pnpm release

# Web App Runner image
FROM nginx:1.24.0-alpine3.17

COPY --from=builder /data/static /usr/share/nginx/html
