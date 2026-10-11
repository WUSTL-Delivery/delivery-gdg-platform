# Status: what works and what doesn't

_Last verified against `main`: 2026-10-09. When you fix something on this list, update this page in the same PR._

The customer can sign up, browse vendors and build a cart. **Placing an order currently
fails**, and everything after that (matching, dispatch, delivery) isn't connected yet. Read
this before assuming a feature works. Each gap below is also a good first task.

## Works today

| Area | Where |
|------|-------|
| Landing page, sign up / log in (bcrypt + 7-day JWT cookie) | `apps/client/web/app/{page.tsx,login,api/signup,api/signin}` |
| Route protection for `/dashboard` | `apps/client/web/proxy.ts` |
| Vendor grid (8 hard-coded vendors) | `apps/client/web/app/dashboard/page.tsx` |
| Menu + cart + drop-off picker | `apps/client/web/app/dashboard/[vendor]/page.tsx` |
| Order tracking page polling every 5 s | `apps/client/web/app/order/[id]/page.tsx`, `app/api/orders/[id]` |
| Order-to-robot matcher loop (with tests) | `apps/authoritative/internal/matcher/` |
| Legacy robot WebSocket hub on :8080 | `apps/authoritative/internal/wsockets/` |
| fleet-server: robot presence, help requests, operator teleop | external image, see [deployments/README.md](../deployments/README.md#fleet-platform) |
| fleet-bridge: fleet events → Kafka | `apps/fleet-bridge/` |
| Local stack + production deploy to GCE | `scripts/rebuild.sh`, `.github/workflows/deploy.yml` |

## Broken or not wired up

| Gap | Details | Where | Linear |
|-----|---------|-------|--------|
| **Orders can't be created** | `InsertOrder` is inside a `/* ... */` block, so gRPC returns Unimplemented and `POST /api/orders` returns 500. The customer sees "Failed to create order". | `apps/authoritative/cmd/authoritative/main.go` | DSC-31 |
| Matcher never gets orders | `SubmitOrder` is only called from the disabled `InsertOrder`. | `internal/matcher/engine.go` | DSC-31 |
| Matches aren't saved | A match is sent to the robot over the hub but never written to `orders.robotId`. | `internal/wsockets/wsocket.go` | |
| Hub stops on unknown robot | `Hub.Run` does `return` (not `continue`) when a matched robot has no client, which ends the loop. | `internal/wsockets/wsocket.go` (~line 92) | |
| Order status never changes | `db.UpdateOrderStatus` / `db.AssignOrderToRobot` exist but nothing calls them. | `apps/authoritative/pkg/db.go` | |
| Kafka events not consumed | fleet-bridge publishes `robot-update`, `robot-telemetry`, `robot-ops`, but `NewRobotSubscriber` is never called and `RobotAssigned` returns "still workin on". | `internal/events/` | DSC-15 |
| Dispatch / routing | Stub files only. A* pathing and the campus graph are in progress separately. | `internal/dispatch/`, `internal/routing/` | DSC-32, 33, 37, 28 |
| Robot state manager + `RobotService` gRPC | Implemented but never started from `main`. | `internal/state/`, `internal/grpc/server.go` | |
| Delivery confirmation | Nothing sets `delivered`, and there's no pickup step (PIN, QR or button). | none | |
| Cancel order | `DeleteOrder` is in the proto but not implemented, and there's no UI. | `proto/order_service.proto` | |
| Order APIs unauthenticated | `/api/orders`, `/api/orders/[id]` and `/order/[id]` skip auth; signed-out orders use `userId = "guest-user"`. | `apps/client/web/app/api/orders/` | DSC-9 |
| Mock menu | Every vendor shows the same 3 items. | `app/dashboard/[vendor]/page.tsx` | |
| Command server dispatch | Relays TCP/UDP messages but has no dispatch logic. | `apps/command/` | |
| Mobile app | Not started. | `apps/client/mobile/` | |

## Out of scope (by design)

- Payment. Prices are display only ([tdd.pdf](tdd.pdf)).
