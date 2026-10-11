# Authoritative Server

The Go backend that owns orders. It serves the gRPC `OrderHandler` that the web app calls,
runs the order-to-robot **matcher**, and hosts the legacy robot WebSocket hub.

> **Status:** `InsertOrder` is currently commented out, so order creation fails. See
> [docs/STATUS.md](../../docs/STATUS.md).

## Run

```bash
# From the repo root, which is Docker:
./scripts/rebuild.sh
```

## Layout

| Path | What |
|------|------|
| `cmd/authoritative/main.go` | Entry point: Supabase client, matcher, WebSocket hub, gRPC server |
| `proto/` | `order_service.proto` (web → here) and `robot.proto`, plus generated Go |
| `internal/matcher/` | Min-heap of orders × FIFO of idle robots, pairs one per second |
| `internal/wsockets/` | Robot WebSocket hub: robots report `online`/`shutdown`, receive `{robot_id, order_id}` |
| `internal/events/` | Kafka producer/consumer for robot topics (consumer not wired yet) |
| `internal/state/` | Robot state machine and manager (not started yet) |
| `internal/grpc/` | `RobotService` gRPC server (not started yet) |
| `internal/dispatch/`, `internal/routing/` | Stubs for dispatch and route/ETA logic |
| `pkg/db.go` | Supabase helpers for `orders`, `coordinates`, `robots`, ... |

How this fits with the rest of the system: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
