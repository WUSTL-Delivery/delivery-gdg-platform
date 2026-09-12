// fleet-bridge: a fleet-platform `service` client that forwards platform events
// to the club's Kafka topics. ONE DIRECTION ONLY (platform -> Kafka). Nothing
// here ever commands a robot; club code that needs to do that talks to the
// platform directly. See fleet-platform/docs/INTEGRATION.md §3.3.
//
// Topics produced (all JSON):
//   robot-update    {robot_id, status: "online"|"shutdown"}          - the shape the
//                   authoritative hub used to publish, so existing consumers keep working
//   robot-telemetry {robot_id, ts_ms, ...telemetry payload}          - pose/battery/health
//   robot-ops       {robot_id, event, ts_ms, data}                    - help requested, lease events
//
// Config (env):
//   FLEET_URL          ws(s)://.../ws                    default ws://fleet-server:8080/ws
//   FLEET_TOKEN        per-service token                 (preferred)
//   FLEET_ENROLL_KEY   fleet enrollment key              (used once if no token; token is
//                       then written to FLEET_TOKEN_FILE and reused across restarts)
//   FLEET_TOKEN_FILE   default /var/lib/fleet-bridge/token
//   KAFKA_BROKERS      comma-separated                   default kafka:9093
//   BRIDGE_SINK        kafka | log                       default kafka
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { envelope, type EnrollResponse, type Envelope, type Event, type Snapshot, type Welcome, type ErrorMsg } from "./protocol.js";
import { KafkaSink, LogSink, type Sink } from "./sink.js";

const FLEET_URL = process.env.FLEET_URL ?? "ws://fleet-server:8080/ws";
const TOKEN_FILE = process.env.FLEET_TOKEN_FILE ?? "/var/lib/fleet-bridge/token";
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? "kafka:9093").split(",").map((s) => s.trim());
const SINK = process.env.BRIDGE_SINK ?? "kafka";

const TOPIC_UPDATE = "robot-update";
const TOPIC_TELEMETRY = "robot-telemetry";
const TOPIC_OPS = "robot-ops";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[fleet-bridge]", ...a);

// ---------- credential ----------

function loadToken(): string | undefined {
  if (process.env.FLEET_TOKEN) return process.env.FLEET_TOKEN;
  try {
    return readFileSync(TOKEN_FILE, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function enroll(key: string): Promise<EnrollResponse> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(FLEET_URL);
    const fail = (e: unknown) => { reject(e instanceof Error ? e : new Error(String(e))); };
    ws.onopen = () =>
      ws.send(envelope("enroll.request", { enrollment_key: key, kind: "service", name: "fleet-bridge", agent: { name: "fleet-bridge", version: "0.1.0" } }));
    ws.onmessage = (m) => {
      const env: Envelope = JSON.parse(String(m.data));
      if (env.type === "enroll.response") resolve(env.payload as EnrollResponse);
      else fail(new Error(`enroll rejected: ${JSON.stringify(env.payload)}`));
    };
    ws.onerror = () => fail(new Error(`enroll: cannot reach ${FLEET_URL}`));
  });
}

async function obtainToken(): Promise<string> {
  const existing = loadToken();
  if (existing) return existing;
  const key = process.env.FLEET_ENROLL_KEY;
  if (!key) throw new Error("no FLEET_TOKEN, no token file, and no FLEET_ENROLL_KEY: cannot authenticate");
  const res = await enroll(key);
  try {
    mkdirSync(dirname(TOKEN_FILE), { recursive: true });
    writeFileSync(TOKEN_FILE, res.token + "\n", { mode: 0o600 });
    log(`enrolled as ${res.client_id} in fleet ${res.fleet_id}; token saved to ${TOKEN_FILE}`);
  } catch (e) {
    log(`enrolled as ${res.client_id} but could not persist token (${(e as Error).message}); set FLEET_TOKEN to avoid re-enrolling`);
  }
  return res.token;
}

// ---------- bridge ----------

function toRecord(env: Envelope): { topic: string; key: string; value: unknown } | undefined {
  if (env.type !== "event") return undefined;
  const ev = env.payload as Event;
  const robot_id = ev.robot_id ?? "";
  const ts_ms = env.ts_ms ?? Date.now();
  switch (ev.event) {
    case "robot.online":
      return { topic: TOPIC_UPDATE, key: robot_id, value: { robot_id, status: "online" } };
    case "robot.offline":
      return { topic: TOPIC_UPDATE, key: robot_id, value: { robot_id, status: "shutdown" } };
    case "robot.telemetry":
      return { topic: TOPIC_TELEMETRY, key: robot_id, value: { robot_id, ts_ms, ...(ev.data as object) } };
    case "robot.help_requested":
    case "robot.lease_granted":
    case "robot.lease_released":
    case "robot.lease_revoked":
      return { topic: TOPIC_OPS, key: robot_id, value: { robot_id, event: ev.event, ts_ms, data: ev.data ?? null } };
    default:
      return undefined;
  }
}

function runSession(token: string, sink: Sink): Promise<"closed"> {
  return new Promise((resolve) => {
    const ws = new WebSocket(FLEET_URL);
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    ws.onopen = () => ws.send(envelope("hello", { token, agent: { name: "fleet-bridge", version: "0.1.0" } }));

    ws.onmessage = async (m) => {
      const env: Envelope = JSON.parse(String(m.data));
      switch (env.type) {
        case "welcome": {
          const w = env.payload as Welcome;
          log(`connected as ${w.client_id} (${w.kind}) fleet ${w.fleet_id}`);
          heartbeat = setInterval(() => ws.send(envelope("heartbeat", {})), w.heartbeat_interval_ms);
          ws.send(envelope("subscribe", { topics: ["presence", "events", "telemetry"] }));
          break;
        }
        case "snapshot": {
          // Snapshot-then-stream: replay current presence so Kafka consumers that
          // (re)started with us converge, then live events keep them current.
          const snap = env.payload as Snapshot;
          log(`snapshot: ${snap.robots.length} robots, ${snap.robots.filter((r) => r.presence === "online").length} online`);
          for (const r of snap.robots) {
            await sink.send({ topic: TOPIC_UPDATE, key: r.robot_id, value: { robot_id: r.robot_id, status: r.presence === "online" ? "online" : "shutdown" } });
          }
          break;
        }
        case "event": {
          const rec = toRecord(env);
          if (rec) await sink.send(rec).catch((e) => log("sink error:", (e as Error).message));
          break;
        }
        case "error": {
          const err = env.payload as ErrorMsg;
          log(`server error ${err.code}: ${err.message}${err.ref ? ` (ref ${err.ref})` : ""}`);
          if (err.code === "auth_failed") {
            log("token rejected; delete the token file or set FLEET_TOKEN, then restart");
            process.exitCode = 2;
            ws.close();
          }
          break;
        }
      }
    };

    ws.onerror = () => log(`socket error against ${FLEET_URL}`);
    ws.onclose = (e) => {
      clearInterval(heartbeat);
      log(`disconnected (${e.code} ${e.reason || "no reason"})`);
      resolve("closed");
    };
  });
}

async function main() {
  const sink: Sink = SINK === "log" ? new LogSink() : new KafkaSink(KAFKA_BROKERS, "fleet-bridge");
  if (sink instanceof KafkaSink) {
    await sink.connect();
    log(`kafka producer connected to ${KAFKA_BROKERS.join(",")}`);
  } else {
    log("sink=log (no kafka)");
  }

  const token = await obtainToken();

  let backoffMs = 1000;
  const shutdown = async () => { log("shutting down"); await sink.close(); process.exit(process.exitCode ?? 0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  for (;;) {
    const started = Date.now();
    await runSession(token, sink);
    if (process.exitCode === 2) return shutdown();
    // Reset backoff after a session that lived a while; otherwise grow it.
    backoffMs = Date.now() - started > 30_000 ? 1000 : Math.min(backoffMs * 2, 30_000);
    log(`reconnecting in ${backoffMs} ms`);
    await new Promise((r) => setTimeout(r, backoffMs));
  }
}

main().catch((e) => { log("fatal:", (e as Error).message); process.exit(1); });
