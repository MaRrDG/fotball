# syntax=docker/dockerfile:1

# ============================================================
# WC26 Office Predictor — production image (Next.js standalone)
# ============================================================
# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time, so they
# must be passed as --build-arg. Server-only secrets (service role key,
# football-data key, CRON_SECRET) are read at RUNTIME and must NOT be baked in.

ARG NODE_VERSION=22-alpine

# ---- deps: install dependencies against a clean lockfile ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- builder: compile the Next.js standalone output ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public (client-visible) build-time config — safe to embed in the bundle.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as the unprivileged 'node' user that ships with the base image.
USER node

# standalone bundles server.js + a trimmed node_modules; static assets and the
# public/ dir are copied alongside it (server.js serves them automatically).
COPY --chown=node:node --from=builder /app/.next/standalone ./
COPY --chown=node:node --from=builder /app/.next/static ./.next/static
COPY --chown=node:node --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
