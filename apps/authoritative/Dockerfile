# syntax=docker/dockerfile:1.7
#
# Authoritative server — gRPC (:50051) + robot WebSocket hub (:8080) + Kafka.
#
# confluent-kafka-go wraps librdkafka via cgo, so this is NOT a CGO_ENABLED=0
# build. The module bundles a prebuilt static librdkafka for linux/glibc, so a
# Debian-based golang image needs no extra apt packages — just a C toolchain,
# which golang:*-bookworm already ships.
#
# Floating minor tag on purpose: it always resolves to the latest patch release,
# which is where Go stdlib security fixes land (govulncheck flags the stdlib
# version baked into the image). Must be >= apps/authoritative/go.mod's `go` directive.
FROM golang:1.26-bookworm AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 GOOS=linux go build -trimpath -ldflags="-s -w" \
      -o /out/authoritative ./cmd/authoritative

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -r -u 10001 app
WORKDIR /app
COPY --from=builder /out/authoritative /app/authoritative
USER app

EXPOSE 50051 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/authoritative"]
