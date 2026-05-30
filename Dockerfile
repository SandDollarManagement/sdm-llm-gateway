FROM node:20-slim AS base
WORKDIR /app

FROM base AS builder
COPY package.json package-lock.json* ./
# Use npm ci when a lockfile exists; fall back to npm install on the very first build.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js standalone output traces every server-side require automatically.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migration runner + SQL files are not part of the Next.js build, so copy
# them explicitly so `node scripts/migrate.js` works in the runtime image.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations

# Next.js standalone prunes any node_modules not referenced by the build.
# scripts/migrate.js runs outside that trace, so explicitly bring pg + its
# transitive deps into the runner image (small footprint, ~1 MB total).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg ./node_modules/pg
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg-cloudflare ./node_modules/pg-cloudflare
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/split2 ./node_modules/split2
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/xtend ./node_modules/xtend

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
