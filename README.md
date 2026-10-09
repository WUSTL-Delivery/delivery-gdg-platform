# WashU GDG Delivery Robot Monorepo

<img src="https://github.com/jaximus808/delivery-gdg-platform/blob/main/assets/gdg_logo.jpg" width="48">

---

Campus food delivery by robot. A student orders from a campus vendor on the website, a
robot is matched to the order, picks it up, and drives it to a drop-off point on campus. This repo holds the web app, the backend that matches orders to robots, and the
glue to the robot fleet. The robot's onboard software lives in
[delivery-robo](https://github.com/WUSTL-Delivery/delivery-robo).

**New?** Read this page, then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (how the
pieces fit) and [docs/STATUS.md](docs/STATUS.md) (what works today and what doesn't).

## How it fits together

![System architecture](docs/diagrams/system-architecture.png)

Source: [docs/diagrams/system-architecture.puml](docs/diagrams/system-architecture.puml).

Details, protocols and data model: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Apps

| App | Language | What it does | Docs |
|-----|----------|--------------|------|
| `apps/client/web` | Next.js 16 / TS | Customer site: login, vendors, cart, order tracking, plus the `/api/*` routes | [README](apps/client/web/README.md) |
| `apps/authoritative` | Go | gRPC order service, order-to-robot matcher, legacy robot WebSocket hub | [README](apps/authoritative/README.md) |
| `apps/command` | Go | TCP/UDP relay for real-time messages between robots and clients | [README](apps/command/README.md) |
| `apps/fleet-bridge` | Node / TS | Forwards fleet-server events to Kafka topics | [README](apps/fleet-bridge/README.md) |
| `apps/client/mobile` | — | Not started | [README](apps/client/mobile/README.md) |
| `fleet-server` | external image | Robot connectivity + operator console, from [fleet-platform](https://github.com/WUSTL-Delivery/robo-fleet-platform) | [deployments](deployments/README.md#fleet-platform) |

## Running locally

Prereqs: Docker Desktop (with `docker compose` v2). Go 1.26+ (`apps/authoritative/go.mod`) and Node 22+ only if you want to run apps outside Docker.

```bash
# 1. Configure secrets (Supabase URL/keys + a JWT secret)
cp deployments/.env.example deployments/.env
#    ...edit deployments/.env
#    Apply supabase/migrations/*.sql to your Supabase project (SQL editor).

# 2. Build and start everything (Kafka, authoritative, command, web)
./scripts/rebuild.sh            # foreground; Ctrl-C to stop
./scripts/rebuild.sh -d         # or detached

# 3. Useful commands
./scripts/rebuild.sh ps         # status
./scripts/rebuild.sh logs -f    # tail logs (add a service name to filter)
./scripts/rebuild.sh down       # stop + remove containers
```

| What            | URL / port                      |
|-----------------|---------------------------------|
| Web client      | http://localhost:3000           |
| Kafka UI        | http://localhost:8085           |
| Mailpit (sign-up verification emails) | http://localhost:8025 |
| gRPC (authoritative) | localhost:50051            |
| Robot WebSocket (legacy hub) | ws://localhost:8080/ws |
| Fleet platform WebSocket | ws://localhost:8090/ws    |
| Command TCP / UDP | localhost:8082 / localhost:8081 |
| Kafka (host)    | localhost:9092                  |

Run only Kafka in Docker and the apps natively:

```bash
cd deployments && docker compose up -d kafka kafka-ui
cd apps/authoritative && go run ./cmd/authoritative   # reads .env, uses localhost:9092
cd apps/command && go run . -mode=server
cd apps/client/web && npm install && npm run dev
```

## Fleet platform

Robot connectivity, presence, and the operator intervention queue come from
[fleet-platform](https://github.com/WUSTL-Delivery/robo-fleet-platform), consumed as a
prebuilt `fleet-server` image pinned in `deployments/docker-compose.yml`.
`apps/fleet-bridge` is the club's first client on it: it forwards platform events to
Kafka so existing consumers keep working. Integration guide:
`fleet-platform/docs/INTEGRATION.md`. Operating it here: `deployments/README.md`.

See `deployments/README.md` for the full port table and the production/GCP deploy flow.

## Where to start contributing

1. Get the stack running locally (above).
2. Skim [docs/STATUS.md](docs/STATUS.md): every gap listed there links to the code and,
   where one exists, the Linear issue.
3. Pick up work on Linear. **DSC** is this repo (web + backend); **ROB** is the robot itself.
4. Read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for commit style (Conventional Commits)
   and who to ask.

## More docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): services, protocols, data, order lifecycle
- [docs/STATUS.md](docs/STATUS.md): implemented vs. planned
- [docs/diagrams/](docs/diagrams/): architecture and customer user-flow diagrams (PlantUML source + PNG; re-render with `plantuml -tpng docs/diagrams/*.puml`)
- [deployments/README.md](deployments/README.md): ports, production deploy, fleet-server ops
- [docs/tdd.pdf](docs/tdd.pdf): original technical design doc (partly out of date; see STATUS.md)
