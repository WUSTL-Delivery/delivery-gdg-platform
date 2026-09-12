# syntax=docker/dockerfile:1.7
#
# fleet-bridge: fleet-platform -> Kafka forwarder. Plain Node service, no
# native deps (kafkajs is pure JS).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app \
 && mkdir -p /var/lib/fleet-bridge && chown app:app /var/lib/fleet-bridge
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --chown=app:app package.json ./
USER app
VOLUME /var/lib/fleet-bridge
CMD ["node", "dist/index.js"]
