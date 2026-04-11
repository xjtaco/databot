# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# Build tools for native modules (bcrypt, better-sqlite3, etc.)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Install ALL dependencies (including devDependencies for tsc)
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN npx prisma generate

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:24-alpine

LABEL maintainer="databot"
LABEL description="Databot backend runtime"

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# Runtime dependencies: docker CLI, su-exec, timezone data
RUN apk add --no-cache python3 make g++ curl su-exec tzdata \
    && curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-27.4.1.tgz \
       | tar xz --strip-components=1 -C /usr/local/bin docker/docker

WORKDIR /app
RUN chown node:node /app

USER node

# Copy dependency manifests and install production-only deps
COPY --chown=node:node package.json pnpm-lock.yaml ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts ./
RUN pnpm install --frozen-lockfile --prod

# Generate Prisma client in production image
RUN npx prisma generate

# Copy compiled output from build stage
COPY --from=build --chown=node:node /app/dist ./dist

# Remove build tools (needs root)
USER root
RUN apk del python3 make g++

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/src/index.js"]
