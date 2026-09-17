# syntax=docker/dockerfile:1.7
#
# Next.js web client. Uses `output: "standalone"` (next.config.ts) so the
# runtime image carries only the traced server bundle, not node_modules.
#
# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time, so
# NEXT_PUBLIC_SUPABASE_URL must be passed as a build arg (docker-compose does).
# Server-only secrets (SUPABASE_SECRET_KEY, JWT_SECRET, GRPC_SERVER_URL)
# are read at runtime and must NOT be baked in.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
# grpc-client.ts loads the .proto from process.cwd()/proto at runtime.
COPY --from=builder --chown=app:app /app/proto ./proto
USER app
EXPOSE 3000
CMD ["node", "server.js"]
