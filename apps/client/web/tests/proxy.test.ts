import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { proxy } from "@/proxy";
import { get } from "./helpers/requests";

function tokenFor(email: string) {
  return jwt.sign({ userId: "u1", email, name: "Jane" }, "test-secret", { expiresIn: "7d" });
}

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy", () => {
  it("lets a WashU session through to the dashboard", async () => {
    const res = await proxy(get("/dashboard", { "auth-token": tokenFor("jane@wustl.edu") }));

    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("ends a session issued to a non-WashU account", async () => {
    const res = await proxy(get("/dashboard", { "auth-token": tokenFor("old@gmail.com") }));

    expect(res.headers.get("location")).toBe("http://localhost/login");
    expect(res.cookies.get("auth-token")?.value).toBe("");
  });

  it("still redirects visitors without a session", async () => {
    const res = await proxy(get("/dashboard"));

    expect(res.headers.get("location")).toBe("http://localhost/login");
  });
});
