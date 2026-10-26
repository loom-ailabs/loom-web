import { beforeEach, describe, expect, it, vi } from "vitest";
const { getDatabase, getEnv, hasPremiumInDatabase } = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  getEnv: vi.fn(),
  hasPremiumInDatabase: vi.fn(),
}));
vi.mock("./db", () => ({ getDatabase }));
vi.mock("./env", () => ({ getEnv }));
vi.mock("@hotkey-tools/identity-core/entitlements", () => ({ hasPremiumInDatabase }));
import { hasPremium } from "./entitlements";
beforeEach(() => {
  getEnv.mockReset();
  getEnv.mockResolvedValue({});
  getDatabase.mockReset();
  hasPremiumInDatabase.mockReset();
});

describe("product payment environment", () => {
  it.each([undefined, "test"])(
    "passes the verified identity and current Creem mode %s to the shared D1 query",
    async (mode) => {
      const binding = { prepare: vi.fn() };
      getDatabase.mockResolvedValue(binding);
      getEnv.mockResolvedValue({ CREEM_MODE: mode, STRIPE_MODE: "live" });
      hasPremiumInDatabase.mockResolvedValue(true);
      expect(await hasPremium("subject")).toBe(true);
      expect(hasPremiumInDatabase).toHaveBeenCalledExactlyOnceWith(
        binding,
        "subject",
        mode ?? "test",
      );
    },
  );

  it("rejects an invalid mode before any entitlement or database lookup", async () => {
    getEnv.mockResolvedValue({ CREEM_MODE: "live", STRIPE_MODE: "test" });
    await expect(hasPremium("subject")).rejects.toMatchObject({
      status: 503,
      code: "sandbox_required",
    });
    expect(getDatabase).not.toHaveBeenCalled();
    expect(hasPremiumInDatabase).not.toHaveBeenCalled();
  });

  it("returns the authoritative refusal for an account with no paid grant in that mode", async () => {
    getEnv.mockResolvedValue({ CREEM_MODE: "test", STRIPE_MODE: "live" });
    getDatabase.mockResolvedValue({ prepare: vi.fn() });
    hasPremiumInDatabase.mockResolvedValue(false);
    expect(await hasPremium("subject")).toBe(false);
  });

  it.each([undefined, "test", "live", "", "invalid"])(
    "does not let historical Stripe mode %j select the active entitlement environment",
    async (stripeMode) => {
      const binding = { prepare: vi.fn() };
      getEnv.mockResolvedValue({ CREEM_MODE: "test", STRIPE_MODE: stripeMode });
      getDatabase.mockResolvedValue(binding);
      hasPremiumInDatabase.mockResolvedValue(true);
      expect(await hasPremium("subject")).toBe(true);
      expect(hasPremiumInDatabase).toHaveBeenCalledExactlyOnceWith(binding, "subject", "test");
    },
  );
});
