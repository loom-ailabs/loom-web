import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreemBillingService } from "./creem-billing-service";
import {
  getCreemOrderForUser,
  listCreemOrdersForUser,
  listHeadshotPacksForUser,
} from "./creem-repository";
import {
  CreemTestDatabase,
  creemConfig,
  creemFixture,
  seedCreemOrder,
} from "../test/creem-fixtures";

describe("Creem verified payment state", () => {
  let db: CreemTestDatabase;
  beforeEach(() => {
    db = new CreemTestDatabase();
  });
  afterEach(() => db.raw.close());

  function setup() {
    const order = seedCreemOrder(db);
    const fixture = creemFixture(order.id);
    const service = new CreemBillingService(db.binding(), fixture.gateway, creemConfig);
    return { order, ...fixture, service };
  }

  it("grants one four-photo pack and one redo after provider-confirmed payment", async () => {
    const { service, completed, order } = setup();
    expect(await listHeadshotPacksForUser(db.binding(), "alice")).toEqual([]);
    await service.handleEvent(completed());
    expect(await getCreemOrderForUser(db.binding(), order.id, "alice")).toMatchObject({
      id: order.id,
      status: "paid",
      amount: 999,
      currency: "usd",
      mode: "test",
      paidAt: expect.any(Number),
    });
    expect(await listHeadshotPacksForUser(db.binding(), "alice")).toEqual([
      expect.objectContaining({
        orderId: order.id,
        photoCount: 4,
        redoCount: 1,
        status: "active",
        revokedAt: null,
      }),
    ]);
    expect(await listHeadshotPacksForUser(db.binding(), "bob")).toEqual([]);
    expect(await listCreemOrdersForUser(db.binding(), "bob")).toEqual([]);
    await expect(getCreemOrderForUser(db.binding(), order.id, "bob")).rejects.toMatchObject({
      status: 404,
    });
    expect(await listCreemOrdersForUser(db.binding(), "alice")).toHaveLength(1);
  });

  it("deduplicates deliveries and distinct completion events for the same purchase", async () => {
    const { service, gateway, completed } = setup();
    await service.handleEvent(completed());
    await service.handleEvent(completed());
    expect(gateway.getCheckout).toHaveBeenCalledTimes(1);
    await service.handleEvent(completed("evt_same_purchase_again"));
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_events").get()?.n).toBe(2);
    expect(db.raw.prepare("SELECT count(*) AS n FROM headshot_packs").get()?.n).toBe(1);
    await expect(
      service.handleEvent({ ...completed(), eventType: "refund.created" }),
    ).rejects.toMatchObject({ code: "payment_mismatch" });
  });

  it("verifies payment without requestId while still requiring the stored user metadata", async () => {
    const { service, completed, checkout } = setup();
    delete checkout.requestId;
    checkout.metadata!.user_id = "bob";
    await expect(service.handleEvent(completed())).rejects.toMatchObject({
      code: "payment_mismatch",
    });
    expect(await listHeadshotPacksForUser(db.binding(), "alice")).toEqual([]);
    checkout.metadata!.user_id = "alice";
    await service.handleEvent(completed());
    expect((await listHeadshotPacksForUser(db.binding(), "alice"))[0]?.status).toBe("active");
  });

  it("serializes concurrent webhook deliveries into one grant", async () => {
    const { service, completed } = setup();
    await Promise.all(Array.from({ length: 8 }, () => service.handleEvent(completed())));
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_events").get()?.n).toBe(1);
    expect(db.raw.prepare("SELECT count(*) AS n FROM headshot_packs").get()?.n).toBe(1);
  });

  it("atomically rolls back event/order/grant on SQL failure and accepts the retry", async () => {
    const { service, completed } = setup();
    db.failNextGrant = true;
    await expect(service.handleEvent(completed())).rejects.toThrow("Simulated headshot grant");
    expect(db.raw.prepare("SELECT status FROM creem_orders").get()?.status).toBe("pending");
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_events").get()?.n).toBe(0);
    await service.handleEvent(completed());
    expect(await listHeadshotPacksForUser(db.binding(), "alice")).toHaveLength(1);
  });

  it("recovers a lost checkout response through authenticated provider metadata", async () => {
    const { service, completed, checkout, transaction } = setup();
    db.raw.prepare("UPDATE creem_orders SET checkout_state = 'uncertain'").run();
    await service.handleEvent(completed());
    expect(
      db.raw
        .prepare("SELECT checkout_id, transaction_id, checkout_state, status FROM creem_orders")
        .get(),
    ).toEqual({
      checkout_id: checkout.id,
      transaction_id: transaction.id,
      checkout_state: "ready",
      status: "paid",
    });
  });

  it("revokes only a successful full refund and cannot restore it with a stale completion", async () => {
    const { service, completed, refunded, transaction, order } = setup();
    await service.handleEvent(completed());
    transaction.status = "partialRefund";
    transaction.refundedAmount = 100;
    expect(await service.handleEvent(refunded("evt_partial"))).toMatchObject({ ignored: true });
    expect((await listHeadshotPacksForUser(db.binding(), "alice"))[0]?.status).toBe("active");
    transaction.status = "paid";
    transaction.refundedAmount = 0;
    const pending = refunded("evt_pending");
    pending.object.status = "pending";
    await expect(service.handleEvent(pending)).rejects.toMatchObject({ status: 503 });
    expect((await listHeadshotPacksForUser(db.binding(), "alice"))[0]?.status).toBe("active");
    transaction.status = "refunded";
    transaction.refundedAmount = 999;
    await service.handleEvent(refunded());
    expect((await getCreemOrderForUser(db.binding(), order.id, "alice")).status).toBe("refunded");
    expect((await listHeadshotPacksForUser(db.binding(), "alice"))[0]).toMatchObject({
      status: "revoked",
      revokedAt: expect.any(Number),
    });
    transaction.status = "paid";
    transaction.refundedAmount = 0;
    await service.handleEvent(completed("evt_late_completion"));
    expect((await getCreemOrderForUser(db.binding(), order.id, "alice")).status).toBe("refunded");
    expect((await listHeadshotPacksForUser(db.binding(), "alice"))[0]?.status).toBe("revoked");
  });

  it("records a refund before completion without ever creating a usable pack", async () => {
    const { service, refunded, completed, transaction } = setup();
    transaction.status = "refunded";
    transaction.refundedAmount = 999;
    await service.handleEvent(refunded());
    transaction.status = "paid";
    transaction.refundedAmount = 0;
    await service.handleEvent(completed());
    expect(await listHeadshotPacksForUser(db.binding(), "alice")).toEqual([]);
    expect(db.raw.prepare("SELECT status FROM creem_orders").get()?.status).toBe("refunded");
  });

  it.each([undefined, 0, 400])(
    "never grants from a refunded transaction with inconsistent cumulative refund %s",
    async (refundedAmount) => {
      const { service, completed, transaction } = setup();
      transaction.status = "refunded";
      transaction.refundedAmount = refundedAmount;
      await expect(service.handleEvent(completed())).rejects.toMatchObject({
        code: "payment_mismatch",
      });
      expect(db.raw.prepare("SELECT status FROM creem_orders").get()?.status).toBe("pending");
      expect(await listHeadshotPacksForUser(db.binding(), "alice")).toEqual([]);
      expect(db.raw.prepare("SELECT count(*) AS n FROM creem_events").get()?.n).toBe(0);
    },
  );

  it.each(["pending", "requiresAction", "processing", "succeeded"])(
    "retries an unresolved %s refund and revokes when the provider confirms it",
    async (status) => {
      const { service, completed, refunded, transaction } = setup();
      await service.handleEvent(completed());
      const event = refunded("evt_async_refund");
      event.object.status = status;
      await expect(service.handleEvent(event)).rejects.toMatchObject({
        code: "order_unavailable",
        status: 503,
      });
      expect(
        db.raw.prepare("SELECT id FROM creem_events WHERE id = 'evt_async_refund'").get(),
      ).toBeUndefined();
      expect((await listHeadshotPacksForUser(db.binding(), "alice"))[0]?.status).toBe("active");
      transaction.status = "refunded";
      transaction.refundedAmount = 999;
      await service.handleEvent(event);
      expect((await listHeadshotPacksForUser(db.binding(), "alice"))[0]?.status).toBe("revoked");
    },
  );

  it("checks the current refund state even when a completed event arrived first", async () => {
    const { service, completed, transaction } = setup();
    transaction.status = "refunded";
    transaction.refundedAmount = 999;
    await service.handleEvent(completed());
    expect(db.raw.prepare("SELECT status FROM creem_orders").get()?.status).toBe("refunded");
    expect(await listHeadshotPacksForUser(db.binding(), "alice")).toEqual([]);
  });

  it("isolates other valid orders when one order is fully refunded", async () => {
    const first = setup();
    await first.service.handleEvent(first.completed());
    const secondOrder = seedCreemOrder(db, "0a4b36dd-cd69-46b7-9665-9d13f8a590c2");
    const second = creemFixture(secondOrder.id);
    const secondService = new CreemBillingService(db.binding(), second.gateway, creemConfig);
    await secondService.handleEvent(second.completed());
    first.transaction.status = "refunded";
    first.transaction.refundedAmount = 999;
    await first.service.handleEvent(first.refunded());
    const packs = await listHeadshotPacksForUser(db.binding(), "alice");
    expect(packs).toHaveLength(2);
    expect(packs.filter((pack) => pack.status === "active")).toHaveLength(1);
    expect(packs.find((pack) => pack.orderId === secondOrder.id)?.status).toBe("active");
  });

  it("finds a stored checkout for refund events that only identify a transaction", async () => {
    const { service, completed, refunded, transaction } = setup();
    await service.handleEvent(completed());
    const event = refunded();
    delete event.object.checkout;
    transaction.status = "refunded";
    transaction.refundedAmount = 999;
    await service.handleEvent(event);
    expect((await listHeadshotPacksForUser(db.binding(), "alice"))[0]?.status).toBe("revoked");
  });

  it("acknowledges unrelated events without altering a local order", async () => {
    const { service, completed, refunded, checkout } = setup();
    expect(
      await service.handleEvent({ id: "evt_other", eventType: "subscription.paid", object: {} }),
    ).toMatchObject({ ignored: true });
    const missingMetadata = completed();
    delete missingMetadata.object.metadata;
    expect(await service.handleEvent(missingMetadata)).toMatchObject({ ignored: true });
    checkout.metadata!.app_key = "foreign_app";
    expect(await service.handleEvent(refunded())).toMatchObject({ ignored: true });
    const noCheckout = refunded();
    delete noCheckout.object.checkout;
    delete noCheckout.object.transaction;
    expect(await service.handleEvent(noCheckout)).toMatchObject({ ignored: true });
    noCheckout.object.transaction = "tran_missing";
    await expect(service.handleEvent(noCheckout)).rejects.toMatchObject({
      code: "order_unavailable",
      status: 503,
    });
    expect(db.raw.prepare("SELECT status FROM creem_orders").get()?.status).toBe("pending");
  });

  it("rejects wrong modes including nested event objects", async () => {
    const { service, completed } = setup();
    const live = completed();
    live.object.mode = "prod";
    await expect(service.handleEvent(live)).rejects.toMatchObject({
      code: "billing_mode_mismatch",
    });
    delete live.object.mode;
    await expect(service.handleEvent(live)).rejects.toMatchObject({
      code: "billing_mode_mismatch",
    });
    const nested = completed();
    nested.object.product = { mode: "prod" };
    await expect(service.handleEvent(nested)).rejects.toMatchObject({
      code: "billing_mode_mismatch",
    });
  });

  it("rejects missing identifiers, missing local orders and wrong provider identifiers", async () => {
    const { service, completed, checkout } = setup();
    const missingId = completed();
    delete missingId.object.id;
    await expect(service.handleEvent(missingId)).rejects.toMatchObject({
      code: "payment_mismatch",
    });
    checkout.metadata!.order_id = null;
    await expect(service.handleEvent(completed())).rejects.toMatchObject({
      code: "payment_mismatch",
    });
    checkout.metadata!.order_id = "missing-local-order";
    await expect(service.handleEvent(completed())).rejects.toMatchObject({
      code: "order_unavailable",
    });
    checkout.metadata!.order_id = seedId();
    const wrong = completed();
    wrong.object.id = "ch_wrong";
    await expect(service.handleEvent(wrong)).rejects.toMatchObject({ code: "payment_mismatch" });
    function seedId() {
      return db.raw.prepare("SELECT id FROM creem_orders").get()?.id as string;
    }
  });
});
