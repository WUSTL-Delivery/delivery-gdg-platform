# fleet-bridge

The club's first [fleet-platform](https://github.com/jaximus808/robo-fleet-platform) client.
It connects to `fleet-server` as a `service`, subscribes to presence, telemetry and
intervention events, and forwards them to Kafka so club services that stay on Kafka keep
working. **One direction only: platform → Kafka.** Anything that needs to command a robot
talks to the platform directly (see `fleet-platform/docs/INTEGRATION.md`).

| Kafka topic       | Message                                              | Source platform event |
|-------------------|------------------------------------------------------|-----------------------|
| `robot-update`    | `{robot_id, status: "online" \| "shutdown"}`         | `robot.online`, `robot.offline`, and the initial snapshot |
| `robot-telemetry` | `{robot_id, ts_ms, pose?, velocity?, battery?, health?}` | `robot.telemetry` |
| `robot-ops`       | `{robot_id, event, ts_ms, data}`                     | `robot.help_requested`, `robot.lease_*` |

`robot-update` keeps the exact shape the old authoritative WebSocket hub produced, so the
existing consumer in `apps/authoritative` needs no change.

## Run locally, no Kafka

```bash
# terminal 1: a fleet-server (see fleet-platform/docs/INTEGRATION.md §1)
# terminal 2:
cd apps/fleet-bridge && npm ci
FLEET_URL=ws://localhost:8080/ws FLEET_ENROLL_KEY=fp-ek-... BRIDGE_SINK=log FLEET_TOKEN_FILE=./.token npm run dev
```

The first run enrolls with the key and saves a per-service token to `FLEET_TOKEN_FILE`;
later runs reuse it. In the compose stack the token lives on the `fleet-bridge-data` volume.

## Configuration

| Variable            | Default                          |
|---------------------|----------------------------------|
| `FLEET_URL`         | `ws://fleet-server:8080/ws`      |
| `FLEET_TOKEN`       | (none; preferred once you have one) |
| `FLEET_ENROLL_KEY`  | (none; used once if there is no token) |
| `FLEET_TOKEN_FILE`  | `/var/lib/fleet-bridge/token`    |
| `KAFKA_BROKERS`     | `kafka:9093`                     |
| `BRIDGE_SINK`       | `kafka` (or `log`)               |
