FROM node:24-alpine AS base

FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# ---------------------------------------------------------------------------
# worker-builder — bundles the simulation worker independently of Next.js.
#
# Uses simulation.package.json (minimal deps: esbuild + runtime packages)
# so the bundle step is isolated and its dependency surface is explicit.
# The output worker.mjs is copied into the production image below.
# ---------------------------------------------------------------------------
FROM base AS worker-builder
WORKDIR /app

# Install only the minimal simulation worker dependencies.
COPY simulation.package.json ./package.json
RUN npm install

# Source files needed by the bundle step.
COPY trace-worker.mjs ./
COPY knexfile.js ./
COPY src/simulation/ ./src/simulation/

# Create the output directory that trace-worker.mjs expects.
RUN mkdir -p .next/standalone

# Bundle worker.ts → .next/standalone/worker.mjs
RUN node trace-worker.mjs

FROM base AS production
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the simulation worker bundle built by the dedicated worker-builder stage.
# worker.mjs is placed at the root of the standalone output, matching the path
# the workerManager expects at runtime.
COPY --from=worker-builder --chown=nextjs:nodejs /app/.next/standalone/worker.mjs ./worker.mjs
COPY --from=worker-builder --chown=nextjs:nodejs /app/.next/standalone/worker.mjs.map ./worker.mjs.map
COPY --from=worker-builder --chown=nextjs:nodejs /app/.next/standalone/knexfile.js ./knexfile.js

USER nextjs

EXPOSE 3000

ENV PORT=3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]

