import { describe, expect, it } from "vitest";
import { parseCreemMode, parseStripeMode } from "./billing-mode";

describe("explicit Stripe mode", () => {
  it("keeps an unconfigured existing deployment in test mode", () => {
    expect(parseStripeMode()).toBe("test");
  });

  it.each(["test", "live"] as const)("accepts the exact %s mode", (mode) => {
    expect(parseStripeMode(mode)).toBe(mode);
  });

  it.each(["", " ", "\ttest", "test ", "TEST", "Live", "production", "sk_live_fixture"])(
    "rejects invalid configuration %j instead of inferring a payment environment",
    (value) => {
      expect(() => parseStripeMode(value)).toThrow(
        expect.objectContaining({ status: 503, code: "invalid_billing_mode" }),
      );
    },
  );
});

describe("current Creem mode", () => {
  it("defaults only an absent value to test", () => {
    expect(parseCreemMode()).toBe("test");
    expect(parseCreemMode("test")).toBe("test");
  });

  it.each(["", " ", "live", "prod", "TEST", "test ", "\ttest"])(
    "refuses unsupported mode %j",
    (value) => {
      expect(() => parseCreemMode(value)).toThrow(
        expect.objectContaining({ status: 503, code: "sandbox_required" }),
      );
    },
  );
});
