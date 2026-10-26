import Stripe from "stripe";
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
import { BillingService, getOrderForUser, hasPremium } from "./billing";

describe("D1 billing state", () => {
  let db: SQLiteD1;
  beforeEach(() => {
    db = new SQLiteD1();
    databaseBinding.value = db.binding();
    environmentBinding.value = {};
  });
  afterEach(() => db.raw.close());

  it("deduplicates completed events and grants exactly one entitlement per order", async () => {
    const order = seedOrder(db);
    const { stripe } = stripeFixture(order);
    const service = new BillingService(db.binding(), stripe, config);
    await service.handleEvent(completedEvent());
    await service.handleEvent(completedEvent());
    await service.handleEvent(completedEvent("evt_second_delivery_same_payment"));
    expect(db.raw.prepare("SELECT count(*) AS total FROM entitlements").get()?.total).toBe(1);
    expect(db.raw.prepare("SELECT count(*) AS total FROM stripe_events").get()?.total).toBe(2);
    expect(await hasPremium("alice")).toBe(true);
    expect(await hasPremium("bob")).toBe(false);
  });

  it("atomically rolls back order and event if granting fails, allowing a retry", async () => {
    const order = seedOrder(db);
    const { stripe } = stripeFixture(order);
    const service = new BillingService(db.binding(), stripe, config);
    db.failNextGrant = true;
    await expect(service.handleEvent(completedEvent())).rejects.toThrow("Simulated grant");
    expect(db.raw.prepare("SELECT status FROM orders").get()?.status).toBe("pending");
    expect(db.raw.prepare("SELECT count(*) AS total FROM stripe_events").get()?.total).toBe(0);
    await service.handleEvent(completedEvent());
    expect(await hasPremium("alice")).toBe(true);
  });

  it("handles a full successful refund before completion and never restores that order", async () => {
    const order = seedOrder(db);
    const { stripe, refunds } = stripeFixture(order);
    refunds.push({ status: "succeeded", currency: "usd", amount: 1200 });
    const service = new BillingService(db.binding(), stripe, config);
    await service.handleEvent(refundEvent());
    // Even a stale Stripe read on a later success cannot reverse the local terminal state.
    refunds.length = 0;
    await service.handleEvent(completedEvent());
    expect(db.raw.prepare("SELECT status FROM orders").get()?.status).toBe("refunded");
    expect(await hasPremium("alice")).toBe(false);
  });

  it("keeps partial and pending refunds active, revoking only the fully refunded purchase", async () => {
    const order = seedOrder(db);
    const { stripe, refunds } = stripeFixture(order);
    const service = new BillingService(db.binding(), stripe, config);
    await service.handleEvent(completedEvent());
    refunds.push(
      { status: "succeeded", currency: "usd", amount: 400 },
      { status: "pending", currency: "usd", amount: 800 },
    );
    await service.handleEvent(refundEvent("evt_partial"));
    expect(await hasPremium("alice")).toBe(true);
    refunds[1]!.status = "succeeded";
    await service.handleEvent(refundEvent("evt_full"));
    expect(await hasPremium("alice")).toBe(false);
    expect(db.raw.prepare("SELECT revoked_at FROM entitlements").get()?.revoked_at).toEqual(
      expect.any(Number),
    );
    // Another valid purchase by the same user remains effective.
    const second = seedOrder(db, "other-order");
    db.raw.prepare("UPDATE orders SET status='paid' WHERE id=?").run(second.id);
    db.raw
      .prepare(
        "INSERT INTO entitlements(order_id,user_id,product_key,feature_key,granted_at) VALUES (?, 'alice','hotkey-tools','premium-demo',1)",
      )
      .run(second.id);
    await service.handleEvent(refundEvent("evt_full_again"));
    expect(await hasPremium("alice")).toBe(true);
  });

  it("does not expose another user's order", async () => {
    seedOrder(db);
    await expect(getOrderForUser(orderId, "bob")).rejects.toMatchObject({ status: 404 });
    expect(await getOrderForUser(orderId, "alice")).toMatchObject({
      id: orderId,
      status: "pending",
      amount: 1200,
    });
  });

  it("serializes concurrent duplicate webhook deliveries into one grant", async () => {
    const fixture = stripeFixture(seedOrder(db));
    const service = new BillingService(db.binding(), fixture.stripe, config);
    await Promise.all(Array.from({ length: 8 }, () => service.handleEvent(completedEvent())));
    expect(db.raw.prepare("SELECT count(*) AS total FROM entitlements").get()?.total).toBe(1);
    expect(db.raw.prepare("SELECT count(*) AS total FROM stripe_events").get()?.total).toBe(1);
    expect(db.raw.prepare("SELECT status FROM orders").get()?.status).toBe("paid");
  });

  it("closes expired sessions without allowing a later expiry to erase a paid purchase", async () => {
    const fixture = stripeFixture(seedOrder(db));
    const service = new BillingService(db.binding(), fixture.stripe, config);
    const event = {
      ...completedEvent("evt_expired"),
      type: "checkout.session.expired",
    } as Stripe.Event;
    fixture.session.status = "expired";
    await service.handleEvent(event);
    expect(db.raw.prepare("SELECT status FROM orders").get()?.status).toBe("expired");
    expect(await hasPremium("alice")).toBe(false);
    fixture.session.status = "complete";
    await service.handleEvent(completedEvent());
    fixture.session.status = "expired";
    await service.handleEvent({ ...event, id: "evt_late_expired" });
    expect(db.raw.prepare("SELECT status FROM orders").get()?.status).toBe("paid");
    expect(await hasPremium("alice")).toBe(true);
  });

  it("uses the current session status when an old expiry event arrives", async () => {
    const fixture = stripeFixture(seedOrder(db));
    fixture.session.status = "open";
    const service = new BillingService(db.binding(), fixture.stripe, config);
    await service.handleEvent({
      ...completedEvent(),
      type: "checkout.session.expired",
    } as Stripe.Event);
    expect(db.raw.prepare("SELECT status FROM orders").get()?.status).toBe("pending");
    expect(db.raw.prepare("SELECT count(*) AS total FROM stripe_events").get()?.total).toBe(0);
  });

  it("accepts expanded Stripe object references and ignores irrelevant events", async () => {
    const fixture = stripeFixture(seedOrder(db));
    const service = new BillingService(db.binding(), fixture.stripe, config);
    fixture.session.payment_intent = { id: fixture.intent.id };
    await service.handleEvent(completedEvent());
    expect(await hasPremium("alice")).toBe(true);
    const unrelated = { ...completedEvent(), type: "customer.created" } as Stripe.Event;
    expect(await service.handleEvent(unrelated)).toEqual({ received: true, ignored: true });
    const foreign = completedEvent("evt_foreign");
    (foreign.data.object as Stripe.Checkout.Session).metadata = null;
    expect(await service.handleEvent(foreign)).toEqual({ received: true, ignored: true });
  });

  it.each(["missing intent", "foreign app"])(
    "acknowledges unrelated refunds with %s",
    async (kind) => {
      const fixture = stripeFixture(seedOrder(db));
      const event = refundEvent();
      if (kind === "missing intent") (event.data.object as Stripe.Refund).payment_intent = null;
      else fixture.intent.metadata.app_key = "other-service";
      expect(
        await new BillingService(db.binding(), fixture.stripe, config).handleEvent(event),
      ).toEqual({ received: true, ignored: true });
      expect(await hasPremium("alice")).toBe(false);
    },
  );

  it("does not count failed or foreign-currency refunds toward a full refund", async () => {
    const fixture = stripeFixture(seedOrder(db));
    fixture.refunds.push(
      { status: "failed", currency: "usd", amount: 1200 },
      { status: "succeeded", currency: "eur", amount: 1200 },
    );
    const service = new BillingService(db.binding(), fixture.stripe, config);
    await service.handleEvent(completedEvent());
    for (const type of ["charge.refunded", "refund.created", "refund.updated"] as const) {
      await service.handleEvent({ ...refundEvent(`evt_${type}`), type } as Stripe.Event);
    }
    expect(await hasPremium("alice")).toBe(true);
  });

  it("rejects live events even if they would otherwise be ignored", async () => {
    const order = seedOrder(db);
    const { stripe } = stripeFixture(order);
    const event = completedEvent();
    event.livemode = true;
    await expect(
      new BillingService(db.binding(), stripe, config).handleEvent(event),
    ).rejects.toMatchObject({ status: 400, code: "billing_mode_mismatch" });
  });
});
