# Deployments

## Local

```bash
cp deployments/.env.example deployments/.env   # fill in Supabase + JWT values
./scripts/rebuild.sh                            # or: cd deployments && docker compose up --build
```

| Service        | Host port | Notes                                              |
|----------------|-----------|----------------------------------------------------|
| web            | 3000      | Next.js client + `/api/*`                          |
| authoritative  | 50051     | gRPC `OrderHandler` (web → authoritative)          |
| authoritative  | 8080      | robot WebSocket hub at `/ws`                       |
| fleet-server   | 8090      | fleet-platform WebSocket at `/ws` (robots + services) |
| command        | 8082/tcp  | TCP relay (container port 8080)                    |
| command        | 8081/udp  | UDP relay                                          |
| kafka          | 9092      | host listener for `go run` apps (`localhost:9092`) |
| kafka-ui       | 8085      | http://localhost:8085                              |

Inside the compose network apps use `KAFKA_BROKERS=kafka:9093` and
`GRPC_SERVER_URL=authoritative:50051`.

Just the broker, running the Go apps natively:

```bash
cd deployments && docker compose up kafka kafka-ui
cd apps/authoritative && go run ./cmd/authoritative      # uses localhost:9092
```

## Production (GCE VM)

`.github/workflows/deploy.yml` runs on every push to `main`: it writes
`deployments/.env` from the `prod` environment secrets, authenticates to GCP via
Workload Identity Federation, copies the repo to `/opt/delivery-gdg` on the VM,
and runs

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The prod overlay adds Caddy (auto-TLS for `DOMAIN_NAME` → `web:3000`) and
removes host port bindings for Kafka, kafka-ui, gRPC and the web server; only
80/443, 8080 (robot WS), 8082/tcp + 8081/udp (command) stay exposed.
Required secrets and VM setup are documented at the top of the workflow file.

## Fleet platform

`fleet-server` (from the [fleet-platform](https://github.com/jaximus808/robo-fleet-platform)
repo) runs as a prebuilt image; `fleet-bridge` (`apps/fleet-bridge`) is built here and
forwards platform events to Kafka.

**Version pin.** `docker-compose.yml` references `ghcr.io/jaximus808/fleet-server:X.Y.Z`.
That tag is the contract between the two repos: bump it in a reviewed commit when you want
the new server. While the protocol is v0, pin the exact patch version. Release process and
tag scheme: `fleet-platform/docs/RELEASING.md`.

**The enrollment key.** You generate it; nothing is minted on the box:

```bash
openssl rand -hex 24        # -> FLEET_ENROLL_KEY in .env (prod: the FLEET_ENROLL_KEY secret)
```

On every start fleet-server makes sure `club-fleet` exists and that this key is registered
for it (idempotent, so a fresh VM comes up ready). The bridge presents the key once on its
first run and stores its own token on the `fleet-bridge-data` volume. Each robot does the
same on its first boot. Rotating: set a new value and redeploy; the new key is added, the
old one stays valid until revoked in the database.

Fleet state (fleets, clients, tokens) is sqlite on the `fleet-data` volume. Both volumes
survive deploys, which wipe only the checkout.

**Prod.** Caddy serves `fleet.DOMAIN_NAME` → `fleet-server:8080`; add that A record. Robots
and services dial `wss://fleet.<domain>/ws`. Exactly one `fleet-server` replica: it is
stateful (presence and leases live in memory). Recovery is restart.

**If the GHCR package is private**, set the `GHCR_READ_TOKEN` secret so the deploy logs the
VM in before pulling; otherwise make the package public in the fleet-platform repo settings.
