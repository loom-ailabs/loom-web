import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCloudflareContext } = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(async (_options: { async: true }) => ({
    env: {} as Record<string, unknown>,
  })),
}));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext }));

import { getEnv } from "./env";
import { getDatabase } from "./db";
import { getBillingPresentationMode } from "./billing-presentation";

const variableNames = [
  "APP_URL",
  "LOGIN_URL",
  "AUTH_SUCCESS_URL",
  "LOGTO_ENDPOINT",
  "LOGTO_USER_NAMESPACE",
  "LOGTO_APP_ID",
  "LOGTO_APP_SECRET",
  "LOGTO_COOKIE_SECRET",
  "LOGTO_COOKIE_DOMAIN",
  "STRIPE_MODE",
  "CREEM_MODE",
] as const;

beforeEach(() => {
  getCloudflareContext.mockReset();
  getCloudflareContext.mockResolvedValue({ env: {} });
  for (const name of variableNames) vi.stubEnv(name, undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("Cloudflare environment boundary", () => {
  it("prefers worker bindings over process variables without passing unknown values through", async () => {
    const db = { prepare: vi.fn() } as unknown as D1Database;
    vi.stubEnv("APP_URL", "https://process.example");
    getCloudflareContext.mockResolvedValue({
      env: { DB: db, APP_URL: "https://worker.example", UNRELATED_SECRET: "must-not-escape" },
    });
    const result = await getEnv();
    expect(getCloudflareContext).toHaveBeenCalledExactlyOnceWith({ async: true });
    expect(result.DB).toBe(db);
    expect(result.APP_URL).toBe("https://worker.example");
    expect(result).not.toHaveProperty("UNRELATED_SECRET");
  });

  it("uses local process configuration when worker variables are absent", async () => {
    for (const name of variableNames) vi.stubEnv(name, `local-${name}`);
    const result = await getEnv();
    for (const name of variableNames) expect(result[name]).toBe(`local-${name}`);
    expect(result.DB).toBeUndefined();
  });

  it("uses local process configuration when the worker variable is empty", async () => {
    vi.stubEnv("LOGTO_APP_SECRET", "local-app-secret");
    getCloudflareContext.mockResolvedValue({ env: { LOGTO_APP_SECRET: "" } });
    expect((await getEnv()).LOGTO_APP_SECRET).toBe("local-app-secret");
  });

  it("preserves an explicitly blank payment mode for validation instead of falling back to live", async () => {
    vi.stubEnv("STRIPE_MODE", "live");
    getCloudflareContext.mockResolvedValue({ env: { STRIPE_MODE: "" } });
    expect((await getEnv()).STRIPE_MODE).toBe("");
  });

  it("prefers Creem's worker mode while retaining the historical Stripe setting independently", async () => {
    vi.stubEnv("CREEM_MODE", "prod");
    vi.stubEnv("STRIPE_MODE", "test");
    getCloudflareContext.mockResolvedValue({ env: { CREEM_MODE: "test", STRIPE_MODE: "live" } });
    expect(await getEnv()).toMatchObject({ CREEM_MODE: "test", STRIPE_MODE: "live" });
    expect(await getBillingPresentationMode()).toBe("test");
  });

  it.each(["", " ", "live", "prod"])(
    "does not replace rejected Creem worker mode %j with a valid process fallback",
    async (mode) => {
      vi.stubEnv("CREEM_MODE", "test");
      getCloudflareContext.mockResolvedValue({ env: { CREEM_MODE: mode } });
      expect((await getEnv()).CREEM_MODE).toBe(mode);
      await expect(getBillingPresentationMode()).rejects.toMatchObject({
        status: 503,
        code: "sandbox_required",
      });
    },
  );

  it("defaults the active Creem display to Test when its mode is absent", async () => {
    getCloudflareContext.mockResolvedValue({ env: { STRIPE_MODE: "live" } });
    expect((await getEnv()).CREEM_MODE).toBeUndefined();
    expect(await getBillingPresentationMode()).toBe("test");
  });

  it("does not fabricate environment or database bindings after a runtime failure", async () => {
    const unavailable = new Error("Runtime binding unavailable");
    getCloudflareContext.mockRejectedValue(unavailable);
    await expect(getEnv()).rejects.toBe(unavailable);
    await expect(getDatabase()).rejects.toBe(unavailable);
  });
});

describe("D1 binding boundary", () => {
  it("returns the actual request database binding", async () => {
    const db = { prepare: vi.fn() } as unknown as D1Database;
    getCloudflareContext.mockResolvedValue({ env: { DB: db } });
    expect(await getDatabase()).toBe(db);
  });

  it("rejects a missing database with the registered configuration error", async () => {
    await expect(getDatabase()).rejects.toMatchObject({
      status: 503,
      code: "database_not_configured",
    });
  });
});
