import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreemBillingService } from "./creem-billing-service";
import {
  CreemTestDatabase,
  creemConfig,
  creemFixture,
  creemRequestId,
  seedCreemOrder,
} from "../test/creem-fixtures";
import type { CreemOrderRow } from "./creem-types";

describe("Creem checkout creation", () => {
  let db: CreemTestDatabase;
  beforeEach(() => {
    db = new CreemTestDatabase();
  });
  afterEach(() => db.raw.close());

  it("persists fixed-price intent before creating checkout and binds the authenticated user", async () => {
    const fixture = creemFixture();
    fixture.gateway.createCheckout.mockImplementationOnce(async (input) => {
      const persisted = db.raw.prepare("SELECT * FROM creem_orders").get() as CreemOrderRow;
      expect(persisted).toMatchObject({
        user_id: "alice",
        amount: 999,
        currency: "USD",
        mode: "test",
        locale: "zh",
        checkout_state: "creating",
      });
      expect(input).toMatchObject({
        productId: "prod_headshots",
        requestId: persisted.id,
        units: 1,
        metadata: { order_id: persisted.id, user_id: "alice", mode: "test" },
      });
      expect(input.successUrl).toBe(
        `https://checkout.example/zh/headshots?checkout=success&purchase_id=${persisted.id}`,
      );
      return {
        ...fixture.checkout,
        status: "pending",
        metadata: input.metadata,
        requestId: input.requestId,
        successUrl: input.successUrl,
      };
    });
    const service = new CreemBillingService(db.binding(), fixture.gateway, creemConfig);
    const result = await service.createCheckout({ id: "alice" }, creemRequestId, "zh");
    expect(result.status).toBe("pending");
    expect(db.raw.prepare("SELECT checkout_state FROM creem_orders").get()?.checkout_state).toBe(
      "ready",
    );
    expect(db.raw.prepare("SELECT count(*) AS n FROM headshot_packs").get()?.n).toBe(0);
  });

  it("reuses a persisted checkout without changing its original locale or creating again", async () => {
    const order = seedCreemOrder(db);
    const fixture = creemFixture(order.id);
    fixture.checkout.status = "pending";
    db.raw
      .prepare("UPDATE creem_orders SET checkout_id = ?, checkout_state = 'ready'")
      .run(fixture.checkout.id);
    const service = new CreemBillingService(db.binding(), fixture.gateway, creemConfig);
    const result = await service.createCheckout({ id: "alice" }, order.request_id, "zh");
    expect(result.orderId).toBe(order.id);
    expect(fixture.gateway.createCheckout).not.toHaveBeenCalled();
    expect(fixture.gateway.getProduct).not.toHaveBeenCalled();
  });

  it("accepts the real create response shape without an optional requestId", async () => {
    const fixture = creemFixture();
    fixture.gateway.createCheckout.mockImplementationOnce(async (input) => {
      const response = {
        ...fixture.checkout,
        status: "pending",
        product: input.productId,
        checkoutUrl: "https://creem.io/test/checkout/prod_headshots",
        metadata: input.metadata,
        successUrl: input.successUrl,
      };
      delete response.requestId;
      delete response.order;
      return response;
    });
    const result = await new CreemBillingService(
      db.binding(),
      fixture.gateway,
      creemConfig,
    ).createCheckout({ id: "alice" }, creemRequestId);
    expect(result).toMatchObject({
      checkoutUrl: "https://creem.io/test/checkout/prod_headshots",
      status: "pending",
    });
    expect(db.raw.prepare("SELECT checkout_state FROM creem_orders").get()?.checkout_state).toBe(
      "ready",
    );
    expect(db.raw.prepare("SELECT count(*) AS n FROM headshot_packs").get()?.n).toBe(0);
  });

  it("serializes concurrent creations instead of relying on provider request_id deduplication", async () => {
    const fixture = creemFixture();
    const service = new CreemBillingService(db.binding(), fixture.gateway, creemConfig);
    const results = await Promise.allSettled([
      service.createCheckout({ id: "alice" }, creemRequestId),
      service.createCheckout({ id: "alice" }, creemRequestId),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect(fixture.gateway.createCheckout).toHaveBeenCalledTimes(1);
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_orders").get()?.n).toBe(1);
  });

  it("preserves an uncertain attempt after a lost provider response and never blindly creates again", async () => {
    const fixture = creemFixture();
    fixture.gateway.createCheckout.mockRejectedValueOnce(new Error("Response lost"));
    const service = new CreemBillingService(db.binding(), fixture.gateway, creemConfig);
    await expect(service.createCheckout({ id: "alice" }, creemRequestId)).rejects.toMatchObject({
      code: "checkout_unavailable",
      status: 502,
    });
    expect(db.raw.prepare("SELECT checkout_state FROM creem_orders").get()?.checkout_state).toBe(
      "uncertain",
    );
    await expect(service.createCheckout({ id: "alice" }, creemRequestId)).rejects.toMatchObject({
      status: 409,
    });
    expect(fixture.gateway.createCheckout).toHaveBeenCalledTimes(1);
  });

  it.each(["paid", "refunded", "expired"])("rejects a %s intent", async (status) => {
    const order = seedCreemOrder(db);
    db.raw.prepare("UPDATE creem_orders SET status = ?").run(status);
    const fixture = creemFixture(order.id);
    await expect(
      new CreemBillingService(db.binding(), fixture.gateway, creemConfig).createCheckout(
        { id: "alice" },
        order.request_id,
      ),
    ).rejects.toMatchObject({ code: "order_closed", status: 409 });
  });

  it.each(["processing", "completed", "expired"])(
    "rejects an existing %s checkout",
    async (status) => {
      const order = seedCreemOrder(db);
      const fixture = creemFixture(order.id);
      fixture.checkout.status = status;
      db.raw.prepare("UPDATE creem_orders SET checkout_id = ?").run(fixture.checkout.id);
      await expect(
        new CreemBillingService(db.binding(), fixture.gateway, creemConfig).createCheckout(
          { id: "alice" },
          order.request_id,
        ),
      ).rejects.toMatchObject({ code: "checkout_closed" });
    },
  );

  it("allows a new purchase after an already-paid pack", async () => {
    const first = seedCreemOrder(db);
    db.raw.prepare("UPDATE creem_orders SET status = 'paid'").run();
    const fixture = creemFixture(first.id);
    const result = await new CreemBillingService(
      db.binding(),
      fixture.gateway,
      creemConfig,
    ).createCheckout({ id: "alice" }, creemRequestId);
    expect(result.orderId).not.toBe(first.id);
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_orders").get()?.n).toBe(2);
  });

  it("fails closed on invalid input, modes and altered stored product identity", async () => {
    const fixture = creemFixture();
    const service = new CreemBillingService(db.binding(), fixture.gateway, creemConfig);
    await expect(service.createCheckout({ id: "alice" }, "invalid")).rejects.toMatchObject({
      code: "invalid_request_id",
    });
    await expect(
      service.createCheckout({ id: "alice" }, creemRequestId, "es" as "en"),
    ).rejects.toMatchObject({ code: "invalid_json" });
    expect(
      () =>
        new CreemBillingService(db.binding(), fixture.gateway, {
          ...creemConfig,
          mode: "prod" as "test",
        }),
    ).toThrow();
    const order = seedCreemOrder(db);
    db.raw.prepare("UPDATE creem_orders SET creem_product_id = 'prod_other'").run();
    await expect(service.createCheckout({ id: "alice" }, order.request_id)).rejects.toMatchObject({
      code: "payment_mismatch",
    });
  });

  it("does not persist an intent for a provider product with a different price", async () => {
    const fixture = creemFixture();
    fixture.product.price = 100;
    await expect(
      new CreemBillingService(db.binding(), fixture.gateway, creemConfig).createCheckout(
        { id: "alice" },
        creemRequestId,
      ),
    ).rejects.toMatchObject({ code: "invalid_price_configuration" });
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_orders").get()?.n).toBe(0);
  });

  it("rejects an invalid checkout returned by create, keeping the intent uncertain", async () => {
    const fixture = creemFixture();
    fixture.gateway.createCheckout.mockImplementationOnce(async (input) => ({
      ...fixture.checkout,
      metadata: input.metadata,
      requestId: input.requestId,
      status: "completed",
    }));
    await expect(
      new CreemBillingService(db.binding(), fixture.gateway, creemConfig).createCheckout(
        { id: "alice" },
        creemRequestId,
      ),
    ).rejects.toMatchObject({ code: "payment_mismatch" });
    expect(db.raw.prepare("SELECT checkout_state FROM creem_orders").get()?.checkout_state).toBe(
      "uncertain",
    );
  });
});
