import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SQLiteD1,
  databaseBinding,
  environmentBinding,
  config,
  requestId,
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
import { BillingService, type OrderRow } from "./billing";

describe("Checkout intents and recovery", () => {
  let db: SQLiteD1;
  beforeEach(() => {
    db = new SQLiteD1();
    databaseBinding.value = db.binding();
    environmentBinding.value = {};
  });
  afterEach(() => db.raw.close());

  it.each([
    ["wrong Price", { id: "price_other" }],
    ["inactive", { active: false }],
    ["subscription", { type: "recurring" }],
    ["tiered", { billing_scheme: "tiered" }],
    ["decimal", { unit_amount: 1.5 }],
    ["zero", { unit_amount: 0 }],
    ["negative", { unit_amount: -1 }],
  ])("rejects %s price configuration before creating an order", async (_label, override) => {
    const fixture = stripeFixture(seedOrder(db));
    const price = await fixture.api.prices.retrieve();
    fixture.api.prices.retrieve.mockResolvedValue({ ...price, ...override });
    await expect(
      new BillingService(db.binding(), fixture.stripe, config).createCheckout(
        { id: "bob" },
        requestId,
      ),
    ).rejects.toMatchObject({ status: 503, code: "invalid_price_configuration" });
    expect(
      db.raw.prepare("SELECT count(*) AS total FROM orders WHERE user_id='bob'").get()?.total,
    ).toBe(0);
    expect(fixture.api.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("does not create a checkout for invalid requests or an already entitled user", async () => {
    const order = seedOrder(db);
    const fixture = stripeFixture(order);
    const service = new BillingService(db.binding(), fixture.stripe, config);
    await expect(service.createCheckout({ id: "alice" }, "not-a-uuid")).rejects.toMatchObject({
      code: "invalid_request_id",
    });
    await service.handleEvent(completedEvent());
    await expect(service.createCheckout({ id: "alice" }, requestId)).rejects.toMatchObject({
      status: 409,
      code: "already_unlocked",
    });
    expect(fixture.api.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it.each(["paid", "refunded", "expired"])(
    "never reopens a %s checkout attempt",
    async (status) => {
      const order = seedOrder(db);
      db.raw.prepare("UPDATE orders SET status=?").run(status);
      const fixture = stripeFixture(order);
      await expect(
        new BillingService(db.binding(), fixture.stripe, config).createCheckout(
          { id: "alice" },
          orderId,
        ),
      ).rejects.toMatchObject({ status: 409, code: "order_closed" });
      expect(fixture.api.checkout.sessions.create).not.toHaveBeenCalled();
    },
  );

  it("reuses a stored open Checkout and rejects it once Stripe closes it", async () => {
    const order = seedOrder(db);
    db.raw.prepare("UPDATE orders SET checkout_session_id='cs_test_payment'").run();
    const fixture = stripeFixture(order);
    fixture.session.status = "open";
    const service = new BillingService(db.binding(), fixture.stripe, config);
    expect(await service.createCheckout({ id: "alice" }, orderId)).toMatchObject({
      orderId,
      checkoutUrl: fixture.session.url,
    });
    fixture.session.status = "complete";
    await expect(service.createCheckout({ id: "alice" }, orderId)).rejects.toMatchObject({
      code: "checkout_closed",
    });
    fixture.session.status = "open";
    fixture.session.url = "";
    await expect(service.createCheckout({ id: "alice" }, orderId)).rejects.toMatchObject({
      code: "checkout_closed",
    });
    expect(fixture.api.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("does not recreate an uncertain checkout after the Stripe idempotency retention window", async () => {
    const order = seedOrder(db);
    db.raw.prepare("UPDATE orders SET created_at=?").run(Date.now() - 24 * 60 * 60 * 1000);
    const fixture = stripeFixture(order);
    await expect(
      new BillingService(db.binding(), fixture.stripe, config).createCheckout(
        { id: "alice" },
        orderId,
      ),
    ).rejects.toMatchObject({ status: 409, code: "checkout_attempt_expired" });
    expect(fixture.api.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it.each(["live", "missing URL", "wrong owner"])(
    "does not persist a newly created Checkout with %s",
    async (kind) => {
      const fixture = stripeFixture(seedOrder(db));
      fixture.api.checkout.sessions.create.mockImplementation(async (params) => ({
        ...fixture.session,
        status: "open",
        livemode: kind === "live",
        url: kind === "missing URL" ? "" : fixture.session.url,
        metadata: { ...params.metadata, user_id: kind === "wrong owner" ? "alice" : "bob" },
        client_reference_id: params.client_reference_id,
      }));
      await expect(
        new BillingService(db.binding(), fixture.stripe, config).createCheckout(
          { id: "bob" },
          requestId,
        ),
      ).rejects.toMatchObject({
        code: kind === "live" ? "billing_mode_mismatch" : "payment_mismatch",
      });
      expect(
        db.raw.prepare("SELECT checkout_session_id FROM orders WHERE user_id='bob'").get()
          ?.checkout_session_id,
      ).toBeNull();
    },
  );

  it("persists pending intent before Stripe and recovers a failed attempt with the same key", async () => {
    const fixture = stripeFixture({
      id: orderId,
      user_id: "alice",
      product_key: "hotkey-tools",
      feature_key: "premium-demo",
      stripe_mode: "test",
      checkout_payload_version: 2,
      amount: 1200,
      currency: "usd",
    } as OrderRow);
    const keys: (string | undefined)[] = [];
    fixture.api.checkout.sessions.create.mockImplementation(async (params, ...rest: unknown[]) => {
      const options = rest[0] as { idempotencyKey?: string } | undefined;
      keys.push(options?.idempotencyKey);
      const row = db.raw
        .prepare("SELECT * FROM orders WHERE request_id = ?")
        .get(requestId) as OrderRow;
      expect(row.status).toBe("pending");
      expect(params.client_reference_id).toBe(row.id);
      expect(params.line_items).toEqual([{ price: "price_premium", quantity: 1 }]);
      if (keys.length === 1) throw new Error("Lost response");
      return {
        ...fixture.session,
        status: "open",
        metadata: params.metadata,
        client_reference_id: params.client_reference_id,
      };
    });
    const service = new BillingService(db.binding(), fixture.stripe, config);
    await expect(service.createCheckout({ id: "alice" }, requestId)).rejects.toMatchObject({
      status: 502,
    });
    const checkout = await service.createCheckout({ id: "alice" }, requestId);
    expect(checkout.checkoutUrl).toMatch(/^https:\/\/checkout.stripe.com\//);
    expect(keys).toEqual([
      `identity-checkout:${checkout.orderId}`,
      `identity-checkout:${checkout.orderId}`,
    ]);
    expect(db.raw.prepare("SELECT count(*) AS total FROM orders").get()?.total).toBe(1);
  });
});
