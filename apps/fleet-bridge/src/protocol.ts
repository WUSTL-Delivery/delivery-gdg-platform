// Hand-mirrored subset of fleet-platform protocol v0 (protocol/ in that repo is
// the source of truth; the TypeScript SDK will replace this file). Only the
// messages the bridge touches are typed here.

export const PROTOCOL_VERSION = 0 as const;

export type Envelope<T = unknown> = {
  v: typeof PROTOCOL_VERSION;
  type: string;
  id?: string;
  ts_ms?: number;
  payload: T;
};

export type Welcome = {
  client_id: string;
  fleet_id: string;
  kind: "robot" | "service" | "operator";
  server_time_ms: number;
  heartbeat_interval_ms: number;
};

export type EnrollResponse = { token: string; client_id: string; fleet_id: string };

export type RobotState = "AUTONOMOUS" | "HELP_REQUESTED" | "TELEOP";

export type RobotSummary = {
  robot_id: string;
  name?: string;
  presence: "online" | "offline";
  state: RobotState;
  manifest?: unknown;
  lease?: { lease_id: string; robot_id: string; operator_id: string; expires_at_ms: number };
};

export type Snapshot = { robots: RobotSummary[] };

export type EventName =
  | "robot.online"
  | "robot.offline"
  | "robot.telemetry"
  | "robot.help_requested"
  | "robot.lease_granted"
  | "robot.lease_released"
  | "robot.lease_revoked";

export type Event = { event: EventName; robot_id?: string; data?: unknown };

export type ErrorMsg = { code: string; message: string; ref?: string };

export function envelope<T>(type: string, payload: T, id?: string): string {
  const env: Envelope<T> = { v: PROTOCOL_VERSION, type, id, ts_ms: Date.now(), payload };
  return JSON.stringify(env);
}
