# Next.js admin dashboard — multi-stage production image (standalone).
# Build context: repository root (see docker-compose.yml).
# No secrets in build args / ENV. Runtime: API_INTERNAL_URL, ADMIN_INTERNAL_SECRET.

FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/dashboard/package.json apps/dashboard/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/dashboard/ ./
# Next may omit public/; the runner still COPY's it — ensure the path exists.
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S -G nodejs nextjs

# Standalone server + static assets required at runtime
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# LGPL/GPL texts + version-matched libvips notices (not stripped by Next standalone tracing).
COPY --chown=nextjs:nodejs third-party /app/third-party

USER nextjs
EXPOSE 3001

# standalone output places server.js at /app/server.js when built from apps/dashboard
CMD ["node", "server.js"]
