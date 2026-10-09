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
| mailpit        | 8025      | http://localhost:8025 — catches sign-up verification emails (local only) |

Inside the compose network apps use `KAFKA_BROKERS=kafka:9093` and
`GRPC_SERVER_URL=authoritative:50051`.

Just the broker, running the Go apps natively:

```bash
cd deployments && docker compose up kafka kafka-ui
cd apps/authoritative && go run ./cmd/authoritative      # uses localhost:9092
```

## Accounts and email verification

Sign-up and login accept only `@wustl.edu` addresses, and a new account is
created only after its owner enters the 6-digit code emailed to them. Pending
sign-ups live in the `pending_signups` table: apply
`supabase/migrations/20261009120000_pending_signups.sql` (Supabase dashboard →
SQL editor, or `supabase db push`) **before** deploying a web build that uses it.

Codes are sent over SMTP (`SMTP_*` in `.env`, see `.env.example`). Locally,
compose points `web` at mailpit, so leave them empty and read the emails at
http://localhost:8025. `npm run dev` with no `SMTP_HOST` prints the code to the
server log instead. In prod, `SMTP_HOST` and `SMTP_FROM` are required and mailpit
is not started.

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

`fleet-server` (from the [fleet-platform](https://github.com/WUSTL-Delivery/robo-fleet-platform)
repo) runs as a prebuilt image; `fleet-bridge` (`apps/fleet-bridge`) is built here and
forwards platform events to Kafka.

**Version pin.** `docker-compose.yml` references `ghcr.io/wustl-delivery/fleet-server:X.Y.Z`.
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
same on its first boot. Rotating: set a new value and redeploy (the new key is added), then
revoke the old one with `fleetctl enroll-key revoke`. Robots already enrolled keep their
own tokens either way.

**The admin token and fleetctl.** `FLEET_ADMIN_TOKEN` (prod: the `FLEET_ADMIN_TOKEN`
secret, `openssl rand -hex 32`) turns on fleet-server's admin API. `fleetctl` uses it to
mint operator invites for the console, manage enrollment keys, and list or revoke clients:

```bash
export FLEETCTL_SERVER=https://fleet.<domain> FLEETCTL_TOKEN=<admin token>
fleetctl invite operator --fleet club-fleet   # paste the key on the console at https://fleet.<domain>/
fleetctl client list     --fleet club-fleet   # robots, the bridge, operators
fleetctl client revoke   --fleet club-fleet r_...   # a lost robot; drops it immediately
```

Full reference: `fleet-platform/docs/FLEETCTL.md`. Empty token = admin API off (fine for
local dev). The console itself is served at `https://fleet.<domain>/` and needs an invite
to sign in.

Fleet state (fleets, clients, tokens) is sqlite on the `fleet-data` volume. Both volumes
survive deploys, which wipe only the checkout.

**Prod.** Caddy serves `fleet.DOMAIN_NAME` → `fleet-server:8080`; add that A record. Robots
and services dial `wss://fleet.<domain>/ws`. Exactly one `fleet-server` replica: it is
stateful (presence and leases live in memory). Recovery is restart.

The fleet-server package on GHCR is public, so the VM pulls it anonymously. If it is ever
made private, run a one-time `docker login ghcr.io` on the VM with a `read:packages` token.
