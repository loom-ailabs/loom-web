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
import { getCreemBillingConfig } from "./creem-config";

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
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
  "CREEM_MODE",
  "CREEM_API_KEY",
  "CREEM_WEBHOOK_SECRET",
  "CREEM_PRODUCT_ID",
  "CREEM_PRO_PRODUCT_ID",
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
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_local_fallback");
    getCloudflareContext.mockResolvedValue({ env: { STRIPE_SECRET_KEY: "" } });
    expect((await getEnv()).STRIPE_SECRET_KEY).toBe("sk_test_local_fallback");
  });

  it("preserves an explicit empty billing mode for fail-closed validation", async () => {
    vi.stubEnv("STRIPE_MODE", "live");
    getCloudflareContext.mockResolvedValue({ env: { STRIPE_MODE: "" } });
    expect((await getEnv()).STRIPE_MODE).toBe("");
  });

  it("prefers Creem worker bindings and falls back only for absent or empty credential fields", async () => {
    vi.stubEnv("CREEM_MODE", "prod");
    vi.stubEnv("CREEM_API_KEY", "creem_test_process_fixture");
    vi.stubEnv("CREEM_WEBHOOK_SECRET", "process-fixture-webhook-secret");
    vi.stubEnv("CREEM_PRODUCT_ID", "prod_processFixture");
    vi.stubEnv("CREEM_PRO_PRODUCT_ID", "prod_processProFixture");
    getCloudflareContext.mockResolvedValue({
      env: {
        CREEM_MODE: "test",
        CREEM_API_KEY: "creem_test_worker_fixture",
        CREEM_WEBHOOK_SECRET: "",
      },
    });
    expect(await getEnv()).toMatchObject({
      CREEM_MODE: "test",
      CREEM_API_KEY: "creem_test_worker_fixture",
      CREEM_WEBHOOK_SECRET: "process-fixture-webhook-secret",
      CREEM_PRODUCT_ID: "prod_processFixture",
      CREEM_PRO_PRODUCT_ID: "prod_processProFixture",
    });
  });

  it("keeps the current Creem and historical Stripe modes independent", async () => {
    vi.stubEnv("CREEM_MODE", "prod");
    vi.stubEnv("STRIPE_MODE", "live");
    getCloudflareContext.mockResolvedValue({
      env: {
        CREEM_MODE: "test",
        STRIPE_MODE: "test",
        CREEM_PRO_PRODUCT_ID: "prod_workerProFixture",
      },
    });
    expect(await getEnv()).toMatchObject({
      CREEM_MODE: "test",
      STRIPE_MODE: "test",
      CREEM_PRO_PRODUCT_ID: "prod_workerProFixture",
    });
  });

  it.each(["", " ", "live", "prod"])(
    "preserves rejected Creem worker mode %j instead of a valid process fallback",
    async (mode) => {
      vi.stubEnv("CREEM_MODE", "test");
      getCloudflareContext.mockResolvedValue({ env: { CREEM_MODE: mode } });
      const env = await getEnv();
      expect(env.CREEM_MODE).toBe(mode);
      expect(() => getCreemBillingConfig(env)).toThrow(
        expect.objectContaining({
          status: 503,
          code: "sandbox_required",
        }),
      );
    },
  );

  it("selects Test when no Creem mode is supplied without inferring mode from a key", async () => {
    getCloudflareContext.mockResolvedValue({
      env: {
        APP_URL: "https://checkout.loom-labs.ai",
        CREEM_API_KEY: "creem_test_offline_fixture",
        CREEM_WEBHOOK_SECRET: "offline-fixture-webhook-secret",
        CREEM_PRODUCT_ID: "prod_headshots",
      },
    });
    expect(getCreemBillingConfig(await getEnv())).toMatchObject({ mode: "test" });
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
