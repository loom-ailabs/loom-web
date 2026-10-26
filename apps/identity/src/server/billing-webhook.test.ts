import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SQLiteD1,
  databaseBinding,
  environmentBinding,
  config,
  requestId,
  orderId,
  completedEvent,
} from "../test/billing-fixtures";
vi.mock("server-only", () => ({}));
vi.mock("./db", async () => {
  const { databaseBinding } = await import("../test/billing-fixtures");
  return { getDatabase: async () => databaseBinding.value };
});
vi.mock("./env", async () => {
  const { environmentBinding } = await import("../test/billing-fixtures");
  return { getEnv: async () => environmentBinding.value };
});
import {
  BillingService,
  createCheckout,
  createStripeClient,
  getBillingConfig,
  handleStripeWebhook,
  verifyStripeEvent,
} from "./billing";
import { ApiError } from "./http";

describe("Billing configuration and webhook signatures", () => {
  const validEnvironment = {
    APP_URL: config.appUrl,
    STRIPE_SECRET_KEY: config.secretKey,
    STRIPE_WEBHOOK_SECRET: config.webhookSecret,
    STRIPE_PRICE_ID: config.priceId,
  };
  beforeEach(() => {
    environmentBinding.value = { ...validEnvironment };
  });

  it("fails closed when configuration is missing or a live key is supplied without live mode", () => {
    expect(() => getBillingConfig({})).toThrow(ApiError);
    expect(() =>
      getBillingConfig({
        APP_URL: config.appUrl,
        STRIPE_SECRET_KEY: "sk_live_disallowed",
        STRIPE_WEBHOOK_SECRET: config.webhookSecret,
        STRIPE_PRICE_ID: config.priceId,
      }),
    ).toThrow("支付模式");
  });

  it.each(Object.keys(validEnvironment))("rejects a missing %s before using Stripe", (name) => {
    const environment = { ...validEnvironment };
    delete environment[name as keyof typeof environment];
    expect(() => getBillingConfig(environment)).toThrow("尚未配置完整");
  });

  it("rejects malformed webhook secret or price id and accepts the configured origin", () => {
    expect(() =>
      getBillingConfig({ ...validEnvironment, STRIPE_WEBHOOK_SECRET: "other-secret" }),
    ).toThrow("回调密钥");
    expect(() =>
      getBillingConfig({ ...validEnvironment, STRIPE_PRICE_ID: "prod_wrong_kind" }),
    ).toThrow("单次固定价格");
    expect(getBillingConfig({ ...validEnvironment, APP_URL: "https://app.example/path" })).toEqual(
      config,
    );
  });

  it.each(["", "LIVE", " test", "sandbox"])(
    "rejects an invalid explicit billing mode %j",
    (mode) => {
      expect(() => getBillingConfig({ ...validEnvironment, STRIPE_MODE: mode })).toThrow(
        expect.objectContaining({ status: 503, code: "invalid_billing_mode" }),
      );
    },
  );

  it.each(["test", "live"] as const)(
    "authenticates %s webhooks only with that endpoint's signing secret",
    async (mode) => {
      const secret = `whsec_${mode}_offline_endpoint`;
      environmentBinding.value = {
        ...validEnvironment,
        STRIPE_MODE: mode,
        STRIPE_SECRET_KEY: `sk_${mode}_offline_fixture`,
        STRIPE_WEBHOOK_SECRET: secret,
      };
      const db = new SQLiteD1();
      databaseBinding.value = db.binding();
      const stripe = createStripeClient(environmentBinding.value.STRIPE_SECRET_KEY!);
      const payload = JSON.stringify({
        id: "evt_endpoint_mode",
        type: "customer.created",
        livemode: mode === "live",
        data: { object: { id: "cus_fixture" } },
      });
      try {
        for (const signingSecret of [secret, "whsec_other_endpoint"]) {
          const signature = stripe.webhooks.generateTestHeaderString({
            payload,
            secret: signingSecret,
          });
          const request = new Request("https://app.example/api/webhooks/stripe", {
            method: "POST",
            headers: { "stripe-signature": signature },
            body: payload,
          });
          if (signingSecret === secret)
            await expect(handleStripeWebhook(request)).resolves.toEqual({
              received: true,
              ignored: true,
            });
          else
            await expect(handleStripeWebhook(request)).rejects.toMatchObject({
              code: "invalid_webhook_signature",
            });
        }
      } finally {
        db.raw.close();
      }
    },
  );

  it("constructs a Sandbox service lazily for the public checkout function", async () => {
    const db = new SQLiteD1();
    databaseBinding.value = db.binding();
    const result = {
      orderId,
      checkoutUrl: "https://checkout.stripe.com/example",
      status: "pending" as const,
    };
    const checkout = vi.spyOn(BillingService.prototype, "createCheckout").mockResolvedValue(result);
    try {
      expect(await createCheckout({ id: "alice" }, requestId)).toEqual(result);
      expect(checkout).toHaveBeenCalledWith({ id: "alice" }, requestId);
    } finally {
      checkout.mockRestore();
      db.raw.close();
    }
  });

  it("rejects missing signatures before reading or parsing the request", async () => {
    const request = new Request("https://app.example/api/webhooks/stripe", {
      method: "POST",
      body: "invalid-json",
    });
    const read = vi.spyOn(request, "text");
    await expect(handleStripeWebhook(request)).rejects.toMatchObject({
      status: 400,
      code: "missing_webhook_signature",
    });
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["declared", "actual"])(
    "rejects an oversized %s webhook before verification",
    async (kind) => {
      const request = new Request("https://app.example/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": "invalid",
          ...(kind === "declared" ? { "content-length": "1048577" } : {}),
        },
        body: kind === "actual" ? "x".repeat(1_048_577) : "{}",
      });
      await expect(handleStripeWebhook(request)).rejects.toMatchObject({
        status: 413,
        code: "webhook_too_large",
      });
    },
  );

  it("passes an authentic raw request to event handling and rejects a signed Live event", async () => {
    const db = new SQLiteD1();
    databaseBinding.value = db.binding();
    const stripe = createStripeClient(config.secretKey);
    try {
      for (const livemode of [false, true]) {
        const payload = JSON.stringify({
          id: "evt_other",
          type: "customer.created",
          livemode,
          data: { object: { id: "cus_test" } },
        });
        const signature = stripe.webhooks.generateTestHeaderString({
          payload,
          secret: config.webhookSecret,
        });
        const request = new Request("https://app.example/api/webhooks/stripe", {
          method: "POST",
          headers: { "stripe-signature": signature },
          body: payload,
        });
        if (livemode)
          await expect(handleStripeWebhook(request)).rejects.toMatchObject({
            status: 400,
            code: "billing_mode_mismatch",
          });
        else expect(await handleStripeWebhook(request)).toEqual({ received: true, ignored: true });
      }
    } finally {
      db.raw.close();
    }
  });

  it("verifies an authentic raw payload asynchronously and rejects modified or expired payloads", async () => {
    const stripe = createStripeClient(config.secretKey);
    const payload = JSON.stringify(completedEvent());
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: config.webhookSecret,
    });
    expect((await verifyStripeEvent(payload, signature, stripe, config.webhookSecret)).id).toBe(
      "evt_completed",
    );
    await expect(
      verifyStripeEvent(`${payload} `, signature, stripe, config.webhookSecret),
    ).rejects.toMatchObject({ status: 400, code: "invalid_webhook_signature" });
    const oldSignature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: config.webhookSecret,
      timestamp: Math.floor(Date.now() / 1000) - 600,
    });
    await expect(
      verifyStripeEvent(payload, oldSignature, stripe, config.webhookSecret),
    ).rejects.toMatchObject({ status: 400 });
  });
});
