import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SQLiteD1,
  databaseBinding,
  environmentBinding,
  config,
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
import { BillingService, hasPremium } from "./billing";

describe("Payment validation", () => {
  let db: SQLiteD1;
  beforeEach(() => {
    db = new SQLiteD1();
    databaseBinding.value = db.binding();
    environmentBinding.value = {};
  });
  afterEach(() => db.raw.close());

  it.each(["owner", "amount", "price", "session", "live"])(
    "rejects a mismatched %s before granting",
    async (mismatch) => {
      const order = seedOrder(db);
      const fixture = stripeFixture(order);
      if (mismatch === "owner") fixture.session.metadata.user_id = "bob";
      if (mismatch === "amount") fixture.intent.amount_received = 1;
      if (mismatch === "price") fixture.line.price.id = "price_other";
      if (mismatch === "session")
        db.raw.prepare("UPDATE orders SET checkout_session_id = 'cs_test_other'").run();
      if (mismatch === "live") fixture.session.livemode = true;
      await expect(
        new BillingService(db.binding(), fixture.stripe, config).handleEvent(completedEvent()),
      ).rejects.toMatchObject({
        status: 400,
        code: mismatch === "live" ? "billing_mode_mismatch" : "payment_mismatch",
      });
      expect(await hasPremium("alice")).toBe(false);
      expect(db.raw.prepare("SELECT count(*) AS total FROM stripe_events").get()?.total).toBe(0);
    },
  );

  it.each(["owner", "live", "reference", "session"])(
    "rejects an expiry with mismatched %s",
    async (mismatch) => {
      const fixture = stripeFixture(seedOrder(db));
      fixture.session.status = "expired";
      if (mismatch === "owner") fixture.session.metadata.user_id = "bob";
      if (mismatch === "live") fixture.session.livemode = true;
      if (mismatch === "reference") fixture.session.client_reference_id = "other-order";
      if (mismatch === "session")
        db.raw.prepare("UPDATE orders SET checkout_session_id = 'cs_test_other'").run();
      const service = new BillingService(db.binding(), fixture.stripe, config);
      await expect(
        service.handleEvent({
          ...completedEvent(),
          type: "checkout.session.expired",
        } as Stripe.Event),
      ).rejects.toMatchObject({
        code: mismatch === "live" ? "billing_mode_mismatch" : "payment_mismatch",
      });
      expect(db.raw.prepare("SELECT status FROM orders").get()?.status).toBe("pending");
    },
  );

  it.each([
    [
      "session mode",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.session.mode = "subscription";
      },
    ],
    [
      "client reference",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.session.client_reference_id = "other-order";
      },
    ],
    [
      "session total",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.session.amount_total = 1;
      },
    ],
    [
      "session currency",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.session.currency = "eur";
      },
    ],
    [
      "extra line items",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.api.checkout.sessions.listLineItems.mockResolvedValue({
          data: [fixture.line, fixture.line],
          has_more: false,
        });
      },
    ],
    [
      "paginated line items",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.api.checkout.sessions.listLineItems.mockResolvedValue({
          data: [fixture.line],
          has_more: true,
        });
      },
    ],
    [
      "quantity",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.line.quantity = 2;
      },
    ],
    [
      "price amount",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.line.price.unit_amount = 1;
      },
    ],
    [
      "price currency",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.line.price.currency = "eur";
      },
    ],
    [
      "line total",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.line.amount_total = 1;
      },
    ],
    [
      "missing payment intent",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.session.payment_intent = null;
      },
    ],
    [
      "live payment intent",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.intent.livemode = true;
      },
    ],
    [
      "payment intent owner",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.intent.metadata.user_id = "bob";
      },
    ],
    [
      "payment intent currency",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.intent.currency = "eur";
      },
    ],
    [
      "payment intent amount",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.intent.amount = 1;
      },
    ],
    [
      "incomplete payment",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.intent.status = "processing";
      },
    ],
    [
      "incomplete session",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.session.status = "open";
      },
    ],
    [
      "unpaid session",
      (fixture: ReturnType<typeof stripeFixture>) => {
        fixture.session.payment_status = "unpaid";
      },
    ],
  ] as const)("does not grant access for a mismatched %s", async (label, alter) => {
    const fixture = stripeFixture(seedOrder(db));
    alter(fixture);
    await expect(
      new BillingService(db.binding(), fixture.stripe, config).handleEvent(completedEvent()),
    ).rejects.toMatchObject({
      status: 400,
      code: label === "live payment intent" ? "billing_mode_mismatch" : "payment_mismatch",
    });
    expect(await hasPremium("alice")).toBe(false);
    expect(db.raw.prepare("SELECT count(*) AS total FROM stripe_events").get()?.total).toBe(0);
  });

  it("does not replace a payment intent already attached to the order", async () => {
    const fixture = stripeFixture(seedOrder(db));
    db.raw.prepare("UPDATE orders SET payment_intent_id = 'pi_other'").run();
    await expect(
      new BillingService(db.binding(), fixture.stripe, config).handleEvent(completedEvent()),
    ).rejects.toMatchObject({ code: "payment_mismatch" });
  });

  it("keeps unknown local orders retryable without consuming the event", async () => {
    const fixture = stripeFixture(seedOrder(db));
    const event = completedEvent();
    (event.data.object as Stripe.Checkout.Session).metadata = { app_key: "hotkey-tools-identity" };
    await expect(
      new BillingService(db.binding(), fixture.stripe, config).handleEvent(event),
    ).rejects.toMatchObject({ status: 503, code: "order_unavailable" });
    expect(db.raw.prepare("SELECT count(*) AS total FROM stripe_events").get()?.total).toBe(0);
  });

  it.each(["live", "ambiguous session", "wrong intent", "missing order"])(
    "does not reconcile a refund with %s",
    async (kind) => {
      const fixture = stripeFixture(seedOrder(db));
      if (kind === "live") fixture.intent.livemode = true;
      if (kind === "ambiguous session")
        fixture.api.checkout.sessions.list.mockResolvedValue({ data: [], has_more: true });
      if (kind === "wrong intent") fixture.session.payment_intent = "pi_other";
      if (kind === "missing order")
        delete (fixture.intent.metadata as Record<string, string>).order_id;
      await expect(
        new BillingService(db.binding(), fixture.stripe, config).handleEvent(refundEvent()),
      ).rejects.toMatchObject({
        code:
          kind === "missing order"
            ? "order_unavailable"
            : kind === "live"
              ? "billing_mode_mismatch"
              : "payment_mismatch",
      });
      expect(await hasPremium("alice")).toBe(false);
    },
  );
});
