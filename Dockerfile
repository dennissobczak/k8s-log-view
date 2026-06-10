# syntax=docker/dockerfile:1

# Multi-stage build for the Next.js 16 app, producing a minimal runtime image
# from the standalone output (output: "standalone" in next.config.ts).
# Node 20.9+ is required by Next 16 (see node_modules/next/package.json engines).
ARG NODE_VERSION=22-alpine

# --- deps: install full dependencies for the build -------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# Install deterministically from the lockfile. libc6-compat keeps some native
# deps happy on Alpine.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: produce the standalone production build ----------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner: minimal image that serves the standalone build ----------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as the unprivileged user that the node image already provides.
USER node

# The standalone output carries its own trimmed node_modules and server.js.
# public/ and .next/static aren't bundled into standalone, so copy them in.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
