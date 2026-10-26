import { describe, expect, it, vi } from "vitest";
import { getBillingPresentationMode } from "./billing-presentation";

const runtime = vi.hoisted(() => ({
  creemMode: undefined as string | undefined,
  stripeMode: undefined as string | undefined,
}));
vi.mock("./env", () => ({
  getEnv: async () => ({ CREEM_MODE: runtime.creemMode, STRIPE_MODE: runtime.stripeMode }),
}));

describe("request-time Creem payment presentation", () => {
  it("defaults to Test and reads each Creem runtime configuration change", async () => {
    runtime.creemMode = undefined;
    runtime.stripeMode = "live";
    expect(await getBillingPresentationMode()).toBe("test");
    runtime.creemMode = "test";
    expect(await getBillingPresentationMode()).toBe("test");
    runtime.creemMode = "invalid";
    await expect(getBillingPresentationMode()).rejects.toMatchObject({
      status: 503,
      code: "sandbox_required",
    });
    runtime.creemMode = "test";
    expect(await getBillingPresentationMode()).toBe("test");
  });

  it.each(["", " ", "live", "prod", "TEST"])(
    "rejects Creem mode %j even when legacy Stripe mode is Test",
    async (mode) => {
      runtime.creemMode = mode;
      runtime.stripeMode = "test";
      await expect(getBillingPresentationMode()).rejects.toMatchObject({
        status: 503,
        code: "sandbox_required",
      });
    },
  );

  it.each([undefined, "test", "live", "invalid", ""])(
    "does not let legacy Stripe mode %j change the active Creem payment display",
    async (mode) => {
      runtime.creemMode = "test";
      runtime.stripeMode = mode;
      expect(await getBillingPresentationMode()).toBe("test");
    },
  );
});
