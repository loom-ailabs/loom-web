import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SQLiteD1,
  databaseBinding,
  environmentBinding,
  config,
  orderId,
  seedOrder,
  stripeFixture,
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
import { BillingService, getOrderForUser } from "./billing";

describe("durable Checkout request format", () => {
  let db: SQLiteD1;
  beforeEach(() => {
    db = new SQLiteD1();
    databaseBinding.value = db.binding();
    environmentBinding.value = {};
  });
  afterEach(() => db.raw.close());

  it("retries a legacy test lost response with the exact old request body and idempotency key", async () => {
    const order = seedOrder(db);
    db.raw.prepare("UPDATE orders SET checkout_payload_version=1 WHERE id=?").run(order.id);
    const fixture = stripeFixture(order);
    // This is the pre-cutover wire format, not a second invocation of the new payload builder.
    const originalMetadata = {
      app_key: "hotkey-tools-identity",
      order_id: order.id,
      user_id: order.user_id,
      product_key: order.product_key,
      feature_key: order.feature_key,
    };
    const originalPayload = {
      mode: "payment",
      allowed_payment_method_types: ["card"],
      adaptive_pricing: { enabled: false },
      automatic_tax: { enabled: false },
      allow_promotion_codes: false,
      line_items: [{ price: order.stripe_price_id, quantity: 1 }],
      client_reference_id: order.id,
      metadata: originalMetadata,
      payment_intent_data: { metadata: originalMetadata },
      success_url: `${config.appUrl}/?checkout=success&order_id=${order.id}`,
      cancel_url: `${config.appUrl}/?checkout=cancelled&order_id=${order.id}`,
    };
    let attempts = 0;
    fixture.api.checkout.sessions.create.mockImplementation(async (params, options) => {
      expect(params).toEqual(originalPayload);
      expect(params).not.toHaveProperty("currency");
      expect(params.metadata).not.toHaveProperty("stripe_mode");
      expect(params.payment_intent_data?.metadata).not.toHaveProperty("stripe_mode");
      expect(options).toEqual({ idempotencyKey: `identity-checkout:${order.id}` });
      if (++attempts === 1) throw new Error("Historical response was lost");
      return {
        ...fixture.session,
        status: "open",
        metadata: params.metadata,
        client_reference_id: params.client_reference_id,
      };
    });
    const service = new BillingService(db.binding(), fixture.stripe, config);
    await expect(service.createCheckout({ id: "alice" }, orderId)).rejects.toMatchObject({
      code: "checkout_unavailable",
    });
    expect(
      db.raw.prepare("SELECT checkout_session_id FROM orders").get()?.checkout_session_id,
    ).toBeNull();
    await expect(service.createCheckout({ id: "alice" }, orderId)).resolves.toHaveProperty(
      "checkoutUrl",
    );
    expect(attempts).toBe(2);
    expect(fixture.api.prices.retrieve).not.toHaveBeenCalled();
    expect(db.raw.prepare("SELECT count(*) AS n FROM orders").get()?.n).toBe(1);
    expect(await getOrderForUser(order.id, "alice")).toMatchObject({
      status: "pending",
      amount: order.amount,
    });
    expect(
      db.raw.prepare("SELECT checkout_payload_version FROM orders").get()?.checkout_payload_version,
    ).toBe(1);
  });

  it.each([1, 3])(
    "rejects Live version %s without retrieving or creating a Session",
    async (version) => {
      const order = seedOrder(db, orderId, "alice", "live");
      db.raw.exec("PRAGMA ignore_check_constraints=ON");
      db.raw.prepare("UPDATE orders SET checkout_payload_version=?").run(version);
      environmentBinding.value = { STRIPE_MODE: "live" };
      const fixture = stripeFixture(order);
      const service = new BillingService(db.binding(), fixture.stripe, { ...config, mode: "live" });
      await expect(service.createCheckout({ id: "alice" }, orderId)).rejects.toMatchObject({
        status: 409,
        code: "billing_mode_mismatch",
      });
      await expect(
        service.handleEvent(completedEvent("evt_unsupported", "live", order)),
      ).rejects.toMatchObject({ code: "billing_mode_mismatch" });
      await expect(getOrderForUser(order.id, "alice")).rejects.toMatchObject({
        code: "billing_mode_mismatch",
      });
      expect(fixture.api.checkout.sessions.retrieve).not.toHaveBeenCalled();
      expect(fixture.api.checkout.sessions.create).not.toHaveBeenCalled();
      expect(db.raw.prepare("SELECT count(*) AS n FROM stripe_events").get()?.n).toBe(0);
    },
  );

  it("rejects an unknown test payload version instead of guessing a legacy body", async () => {
    const order = seedOrder(db);
    db.raw.exec("PRAGMA ignore_check_constraints=ON");
    db.raw.prepare("UPDATE orders SET checkout_payload_version=3").run();
    const fixture = stripeFixture(order);
    await expect(
      new BillingService(db.binding(), fixture.stripe, config).createCheckout(
        { id: "alice" },
        orderId,
      ),
    ).rejects.toMatchObject({ code: "billing_mode_mismatch" });
    expect(fixture.api.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
