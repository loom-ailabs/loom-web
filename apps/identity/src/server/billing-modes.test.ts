import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StripeMode } from "@hotkey-tools/identity-core/billing-types";
import { hasPremiumInDatabase } from "@hotkey-tools/identity-core/entitlements";
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
  refundEvent,
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
import { BillingService, getBillingConfig, getOrderForUser, hasPremium } from "./billing";

const modes = ["test", "live"] as const;
const modeConfig = (mode: StripeMode) => ({
  ...config,
  mode,
  secretKey: `sk_${mode}_offline_fixture`,
});

describe.each(modes)("%s billing isolation", (mode) => {
  let db: SQLiteD1;
  beforeEach(() => {
    db = new SQLiteD1();
    databaseBinding.value = db.binding();
    environmentBinding.value = { STRIPE_MODE: mode };
  });
  afterEach(() => db.raw.close());

  it("requires matching keys and preserves the explicitly selected mode", () => {
    const selected = modeConfig(mode);
    const env = {
      APP_URL: selected.appUrl,
      STRIPE_MODE: mode,
      STRIPE_SECRET_KEY: selected.secretKey,
      STRIPE_WEBHOOK_SECRET: selected.webhookSecret,
      STRIPE_PRICE_ID: selected.priceId,
    };
    expect(getBillingConfig(env)).toEqual(selected);
    expect(() =>
      getBillingConfig({
        ...env,
        STRIPE_SECRET_KEY: `sk_${mode === "test" ? "live" : "test"}_wrong`,
      }),
    ).toThrow(expect.objectContaining({ status: 503, code: "billing_mode_mismatch" }));
  });

  it("creates one durable checkout and safely resumes it in the same mode", async () => {
    const fixture = stripeFixture(seedOrder(db, orderId, "alice", mode));
    const service = new BillingService(db.binding(), fixture.stripe, modeConfig(mode));
    const created = await service.createCheckout({ id: "bob" }, requestId);
    const order = db.raw.prepare("SELECT * FROM orders WHERE id=?").get(created.orderId)!;
    expect(order).toMatchObject({
      stripe_mode: mode,
      checkout_payload_version: 2,
      currency: "usd",
      status: "pending",
      amount: mode === "live" ? 100 : 1200,
    });
    const [params, options] = fixture.api.checkout.sessions.create.mock.calls[0]!;
    expect(params).toMatchObject({
      mode: "payment",
      currency: "usd",
      metadata: { stripe_mode: mode },
      payment_intent_data: { metadata: { stripe_mode: mode } },
      line_items: [{ price: "price_premium", quantity: 1 }],
    });
    expect(options).toEqual({ idempotencyKey: `identity-checkout:${created.orderId}` });
    fixture.session.status = "open";
    fixture.session.client_reference_id = created.orderId;
    Object.assign(fixture.session.metadata, params.metadata);
    expect(await service.createCheckout({ id: "bob" }, requestId)).toEqual(created);
    expect(fixture.api.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(fixture.api.prices.retrieve).toHaveBeenCalledTimes(1);
  });

  it("does not reuse the other mode's pending order or even retrieve its Checkout", async () => {
    const other = mode === "test" ? "live" : "test";
    const fixture = stripeFixture(seedOrder(db, orderId, "alice", other));
    db.raw.prepare("UPDATE orders SET checkout_session_id=?").run(fixture.session.id);
    await expect(
      new BillingService(db.binding(), fixture.stripe, modeConfig(mode)).createCheckout(
        { id: "alice" },
        orderId,
      ),
    ).rejects.toMatchObject({ status: 409, code: "billing_mode_mismatch" });
    expect(fixture.api.checkout.sessions.retrieve).not.toHaveBeenCalled();
    expect(fixture.api.checkout.sessions.create).not.toHaveBeenCalled();
    await expect(getOrderForUser(orderId, "alice")).rejects.toMatchObject({ status: 404 });
  });

  it("deduplicates payment and revokes only the fully refunded source order", async () => {
    const first = seedOrder(db, orderId, "alice", mode);
    const second = seedOrder(db, "second-purchase", "alice", mode);
    const fixture = stripeFixture(first);
    const other = stripeFixture(second);
    const service = new BillingService(db.binding(), fixture.stripe, modeConfig(mode));
    const secondService = new BillingService(db.binding(), other.stripe, modeConfig(mode));
    await Promise.all(
      Array.from({ length: 4 }, () =>
        service.handleEvent(completedEvent("evt_first", mode, first)),
      ),
    );
    await secondService.handleEvent(completedEvent("evt_second", mode, second));
    expect(db.raw.prepare("SELECT count(*) AS n FROM entitlements").get()?.n).toBe(2);
    fixture.refunds.push({ status: "pending", currency: "usd", amount: first.amount });
    await service.handleEvent(refundEvent("evt_pending", mode, first));
    expect(
      db.raw.prepare("SELECT revoked_at FROM entitlements WHERE order_id=?").get(first.id)
        ?.revoked_at,
    ).toBeNull();
    fixture.refunds[0]!.status = "succeeded";
    await service.handleEvent(refundEvent("evt_refunded", mode, first));
    fixture.refunds.length = 0;
    await service.handleEvent(completedEvent("evt_late_success", mode, first));
    expect(db.raw.prepare("SELECT status FROM orders WHERE id=?").get(first.id)?.status).toBe(
      "refunded",
    );
    expect(await hasPremiumInDatabase(db.binding(), "alice", mode)).toBe(true);
    other.refunds.push({ status: "succeeded", currency: "usd", amount: second.amount });
    await secondService.handleEvent(refundEvent("evt_other_refund", mode, second));
    expect(await hasPremiumInDatabase(db.binding(), "alice", mode)).toBe(false);
    expect(
      db.raw.prepare("SELECT count(*) AS n FROM stripe_events WHERE stripe_mode=?").get(mode)?.n,
    ).toBe(5);
  });

  it("never grants a fully refunded order when completion arrives afterward", async () => {
    const order = seedOrder(db, orderId, "alice", mode);
    const fixture = stripeFixture(order);
    fixture.refunds.push({ status: "succeeded", currency: "usd", amount: order.amount });
    const service = new BillingService(db.binding(), fixture.stripe, modeConfig(mode));
    await service.handleEvent(refundEvent("evt_early_refund", mode, order));
    fixture.refunds.length = 0;
    await service.handleEvent(completedEvent("evt_late_completed", mode, order));
    expect(await hasPremiumInDatabase(db.binding(), "alice", mode)).toBe(false);
    expect(db.raw.prepare("SELECT count(*) AS n FROM entitlements").get()?.n).toBe(0);
  });

  it.each(["completed", "expired", "refund"])(
    "rejects another mode's local order in a %s event",
    async (kind) => {
      const other = mode === "test" ? "live" : "test";
      const order = seedOrder(db, orderId, "alice", other);
      const fixture = stripeFixture(order);
      const event =
        kind === "refund"
          ? refundEvent("evt_mixed", mode, order)
          : completedEvent("evt_mixed", mode, order);
      if (kind === "expired") event.type = "checkout.session.expired";
      await expect(
        new BillingService(db.binding(), fixture.stripe, modeConfig(mode)).handleEvent(event),
      ).rejects.toMatchObject({ code: "billing_mode_mismatch" });
      expect(db.raw.prepare("SELECT status FROM orders").get()?.status).toBe("pending");
      expect(db.raw.prepare("SELECT count(*) AS n FROM stripe_events").get()?.n).toBe(0);
    },
  );

  for (const missing of [false, true]) {
    it.each(["event", "event session", "session", "line price", "intent"])(
      `rejects %s with ${missing ? "missing" : "opposite"} livemode`,
      async (target) => {
        const order = seedOrder(db, orderId, "alice", mode);
        const fixture = stripeFixture(order);
        const event = completedEvent("evt_invalid_mode", mode, order);
        const value = missing ? undefined : mode !== "live";
        const object =
          target === "event"
            ? event
            : target === "event session"
              ? event.data.object
              : target === "session"
                ? fixture.session
                : target === "line price"
                  ? fixture.line.price
                  : fixture.intent;
        Reflect.set(object, "livemode", value);
        await expect(
          new BillingService(db.binding(), fixture.stripe, modeConfig(mode)).handleEvent(event),
        ).rejects.toMatchObject({ code: "billing_mode_mismatch" });
        expect(await hasPremiumInDatabase(db.binding(), "alice", mode)).toBe(false);
        expect(db.raw.prepare("SELECT count(*) AS n FROM stripe_events").get()?.n).toBe(0);
      },
    );
  }

  it.each([undefined, "", null, "other", "test", "live"])(
    "enforces metadata mode %s at each payment boundary",
    async (stamp) => {
      const order = seedOrder(db, orderId, "alice", mode);
      const fixture = stripeFixture(order);
      const event = completedEvent("evt_metadata", mode, order);
      for (const value of [
        (event.data.object as Stripe.Checkout.Session).metadata!,
        fixture.session.metadata,
        fixture.intent.metadata,
      ])
        Reflect.set(value, "stripe_mode", stamp);
      const service = new BillingService(db.binding(), fixture.stripe, modeConfig(mode));
      if (stamp === mode) {
        await service.handleEvent(event);
        expect(await hasPremiumInDatabase(db.binding(), "alice", mode)).toBe(true);
      } else {
        await expect(service.handleEvent(event)).rejects.toMatchObject({
          code: "payment_mismatch",
        });
        expect(await hasPremiumInDatabase(db.binding(), "alice", mode)).toBe(false);
      }
    },
  );

  it.each([
    ["event", "missing"],
    ["session", "missing"],
    ["intent", "missing"],
    ["event", "opposite"],
    ["session", "opposite"],
    ["intent", "opposite"],
  ] as const)("independently rejects %s metadata with a %s mode stamp", async (target, stamp) => {
    const order = seedOrder(db, orderId, "alice", mode);
    const fixture = stripeFixture(order);
    const event = completedEvent("evt_single_metadata", mode, order);
    const metadata =
      target === "event"
        ? (event.data.object as Stripe.Checkout.Session).metadata!
        : target === "session"
          ? fixture.session.metadata
          : fixture.intent.metadata;
    Reflect.set(
      metadata,
      "stripe_mode",
      stamp === "missing" ? undefined : mode === "live" ? "test" : "live",
    );
    await expect(
      new BillingService(db.binding(), fixture.stripe, modeConfig(mode)).handleEvent(event),
    ).rejects.toMatchObject({ code: "payment_mismatch" });
    expect(await hasPremiumInDatabase(db.binding(), "alice", mode)).toBe(false);
    expect(db.raw.prepare("SELECT count(*) AS n FROM stripe_events").get()?.n).toBe(0);
  });

  it.each([undefined, true, false])(
    "checks Price livemode %s before persisting checkout intent",
    async (livemode) => {
      const fixture = stripeFixture(seedOrder(db, orderId, "alice", mode));
      const price = await fixture.api.prices.retrieve();
      Reflect.set(price, "livemode", livemode);
      fixture.api.prices.retrieve.mockResolvedValue(price);
      const creating = new BillingService(
        db.binding(),
        fixture.stripe,
        modeConfig(mode),
      ).createCheckout({ id: "bob" }, requestId);
      if (livemode === (mode === "live"))
        await expect(creating).resolves.toHaveProperty("checkoutUrl");
      else {
        await expect(creating).rejects.toMatchObject({
          status: 503,
          code: "billing_mode_mismatch",
        });
        expect(
          db.raw.prepare("SELECT count(*) AS n FROM orders WHERE user_id='bob'").get()?.n,
        ).toBe(0);
      }
    },
  );
});

describe("configured production offer and cross-mode grants", () => {
  let db: SQLiteD1;
  beforeEach(() => {
    db = new SQLiteD1();
    databaseBinding.value = db.binding();
    environmentBinding.value = {};
  });
  afterEach(() => db.raw.close());

  it("resumes a known legacy test Session and still handles its full refund", async () => {
    const order = seedOrder(db);
    db.raw.prepare("UPDATE orders SET checkout_payload_version=1 WHERE id=?").run(order.id);
    const fixture = stripeFixture(order);
    fixture.session.status = "open";
    db.raw.prepare("UPDATE orders SET checkout_session_id=?").run(fixture.session.id);
    Reflect.deleteProperty(fixture.session.metadata, "stripe_mode");
    Reflect.deleteProperty(fixture.intent.metadata, "stripe_mode");
    const service = new BillingService(db.binding(), fixture.stripe, config);
    await expect(service.createCheckout({ id: "alice" }, orderId)).resolves.toHaveProperty(
      "checkoutUrl",
    );
    expect(fixture.api.checkout.sessions.create).not.toHaveBeenCalled();
    fixture.session.status = "complete";
    const event = completedEvent();
    Reflect.deleteProperty((event.data.object as Stripe.Checkout.Session).metadata!, "stripe_mode");
    await service.handleEvent(event);
    expect(await hasPremium("alice")).toBe(true);
    fixture.refunds.push({ status: "succeeded", currency: "usd", amount: order.amount });
    await service.handleEvent(refundEvent());
    expect(await hasPremium("alice")).toBe(false);
    expect(
      db.raw.prepare("SELECT stripe_mode FROM stripe_events WHERE id=?").get(event.id)?.stripe_mode,
    ).toBe("test");
  });

  it.each([{ currency: "eur" }, { unit_amount: 200 }])(
    "rejects a Live Price outside the approved USD 1 offer: %j",
    async (override) => {
      const fixture = stripeFixture(seedOrder(db, orderId, "alice", "live"));
      const price = await fixture.api.prices.retrieve();
      fixture.api.prices.retrieve.mockResolvedValue({ ...price, ...override });
      await expect(
        new BillingService(db.binding(), fixture.stripe, modeConfig("live")).createCheckout(
          { id: "bob" },
          requestId,
        ),
      ).rejects.toMatchObject({ code: "invalid_price_configuration" });
      expect(fixture.api.checkout.sessions.create).not.toHaveBeenCalled();
    },
  );

  it("isolates legacy Live bookkeeping while the active Creem purchase mode stays Test", async () => {
    const test = seedOrder(db);
    const testStripe = stripeFixture(test);
    await new BillingService(db.binding(), testStripe.stripe, config).handleEvent(completedEvent());
    expect(await hasPremium("alice")).toBe(true);
    environmentBinding.value = { STRIPE_MODE: "live", CREEM_MODE: "test" };
    expect(await hasPremium("alice")).toBe(true);
    expect(await hasPremiumInDatabase(db.binding(), "alice", "live")).toBe(false);
    environmentBinding.value = { STRIPE_MODE: "test", CREEM_MODE: "live" };
    await expect(hasPremium("alice")).rejects.toMatchObject({
      code: "sandbox_required",
      status: 503,
    });
    environmentBinding.value = { STRIPE_MODE: "live", CREEM_MODE: "test" };
    const live = stripeFixture(seedOrder(db, "live-template", "bob", "live"));
    await expect(
      new BillingService(db.binding(), live.stripe, modeConfig("live")).createCheckout(
        { id: "alice" },
        requestId,
      ),
    ).resolves.toHaveProperty("checkoutUrl");
  });
});
