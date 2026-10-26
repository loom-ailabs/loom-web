import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreemBillingService } from "./creem-billing-service";
import { getCreemProductDefinition } from "./creem-products";
import {
  getCreemOrderForUser,
  listCreemOrdersForUser,
  listHeadshotPacksForUser,
} from "./creem-repository";
import {
  HEADSHOT_PRODUCT_KEY,
  LOOM_PRO_PRODUCT_KEY,
  type CreemGateway,
  type CreemProductKey,
  type CreemOrderRow,
} from "./creem-types";
import {
  CreemTestDatabase,
  creemConfig,
  creemFixture,
  creemRequestId,
  seedCreemOrder,
} from "../test/creem-fixtures";

const config = { ...creemConfig, proProductId: "prod_loompro" };
const proOrderId = "44a54843-f497-4814-bacc-e58ca037ca8e";

function proFixture(id = proOrderId) {
  const fixture = creemFixture(id);
  fixture.product.id = config.proProductId;
  fixture.product.price = 100;
  fixture.checkout.metadata!.product_key = LOOM_PRO_PRODUCT_KEY;
  fixture.checkout.order = {
    ...fixture.checkout.order!,
    product: config.proProductId,
    amount: 100,
    amountPaid: 100,
    amountDue: 100,
  };
  fixture.transaction.amount = 100;
  fixture.transaction.amountPaid = 100;
  return fixture;
}

function seedProOrder(db: CreemTestDatabase, id = proOrderId) {
  db.raw
    .prepare(`INSERT INTO creem_orders
    (id,user_id,request_id,product_key,creem_product_id,amount,currency,mode,locale,created_at,updated_at)
    VALUES (?,'alice',?,'loom_pro','prod_loompro',100,'USD','test','en',?,?)`)
    .run(id, id, Date.now(), Date.now());
  return db.raw.prepare("SELECT * FROM creem_orders WHERE id = ?").get(id) as CreemOrderRow;
}

describe("Creem Loom Pro product isolation", () => {
  let db: CreemTestDatabase;
  beforeEach(() => {
    db = new CreemTestDatabase();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    db.raw.close();
  });

  it("creates a fixed USD 1 Pro purchase using its own provider SKU and localized account return", async () => {
    const fixture = proFixture();
    const service = new CreemBillingService(db.binding(), fixture.gateway, config);
    const result = await service.createCheckout(
      { id: "alice" },
      creemRequestId,
      "zh",
      LOOM_PRO_PRODUCT_KEY,
    );
    expect(fixture.gateway.getProduct).toHaveBeenCalledWith("prod_loompro");
    expect(fixture.gateway.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "prod_loompro",
        successUrl: `https://checkout.example/zh?checkout=success&purchase_id=${result.orderId}`,
        metadata: expect.objectContaining({
          product_key: "loom_pro",
          user_id: "alice",
          order_id: result.orderId,
        }),
      }),
    );
    expect(await getCreemOrderForUser(db.binding(), result.orderId, "alice")).toMatchObject({
      amount: 100,
      productKey: "loom_pro",
    });
    expect(await listCreemOrdersForUser(db.binding(), "alice")).toEqual([]);
    expect(await listCreemOrdersForUser(db.binding(), "alice", LOOM_PRO_PRODUCT_KEY)).toHaveLength(
      1,
    );
    expect(await listHeadshotPacksForUser(db.binding(), "alice")).toEqual([]);
  });

  it("grants only Pro on verified payment, deduplicates and revokes a full refund", async () => {
    seedProOrder(db);
    const fixture = proFixture();
    const service = new CreemBillingService(db.binding(), fixture.gateway, config);
    await service.handleEvent(fixture.completed());
    await service.handleEvent(fixture.completed());
    expect(
      db.raw
        .prepare("SELECT count(*) AS n FROM creem_pro_entitlements WHERE revoked_at IS NULL")
        .get()?.n,
    ).toBe(1);
    expect(await listHeadshotPacksForUser(db.binding(), "alice")).toEqual([]);
    fixture.transaction.status = "refunded";
    fixture.transaction.refundedAmount = 100;
    await service.handleEvent(fixture.refunded());
    expect(
      db.raw
        .prepare("SELECT count(*) AS n FROM creem_pro_entitlements WHERE revoked_at IS NULL")
        .get()?.n,
    ).toBe(0);
    expect((await getCreemOrderForUser(db.binding(), proOrderId, "alice")).status).toBe("refunded");
    fixture.transaction.status = "paid";
    fixture.transaction.refundedAmount = 0;
    await service.handleEvent(fixture.completed("evt_stale_pro_payment"));
    expect(
      db.raw
        .prepare("SELECT count(*) AS n FROM creem_pro_entitlements WHERE revoked_at IS NULL")
        .get()?.n,
    ).toBe(0);
  });

  it("headshot purchases never grant Pro and refunding one Pro order preserves another Pro order and the headshot pack", async () => {
    const headshot = seedCreemOrder(db);
    const headshotFixture = creemFixture(headshot.id);
    await new CreemBillingService(db.binding(), headshotFixture.gateway, config).handleEvent(
      headshotFixture.completed(),
    );
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_pro_entitlements").get()?.n).toBe(0);
    seedProOrder(db);
    const first = proFixture();
    const service = new CreemBillingService(db.binding(), first.gateway, config);
    await service.handleEvent(first.completed());
    const secondId = "143bcf79-ad7e-4b88-b083-f5205c2a4bfc";
    seedProOrder(db, secondId);
    const second = proFixture(secondId);
    await new CreemBillingService(db.binding(), second.gateway, config).handleEvent(
      second.completed(),
    );
    first.transaction.status = "refunded";
    first.transaction.refundedAmount = 100;
    await service.handleEvent(first.refunded());
    expect(
      db.raw.prepare("SELECT order_id FROM creem_pro_entitlements WHERE revoked_at IS NULL").get()
        ?.order_id,
    ).toBe(secondId);
    expect((await listHeadshotPacksForUser(db.binding(), "alice"))[0]?.status).toBe("active");
  });

  it("rolls back Pro event and order changes if its entitlement insert fails", async () => {
    seedProOrder(db);
    const fixture = proFixture();
    const service = new CreemBillingService(db.binding(), fixture.gateway, config);
    db.failNextProGrant = true;
    await expect(service.handleEvent(fixture.completed())).rejects.toThrow("Simulated Pro grant");
    expect((await getCreemOrderForUser(db.binding(), proOrderId, "alice")).status).toBe("pending");
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_events").get()?.n).toBe(0);
    await service.handleEvent(fixture.completed());
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_pro_entitlements").get()?.n).toBe(1);
  });

  it("does not revive Pro if a full refund arrives before completion", async () => {
    seedProOrder(db);
    const fixture = proFixture();
    const service = new CreemBillingService(db.binding(), fixture.gateway, config);
    fixture.transaction.status = "refunded";
    fixture.transaction.refundedAmount = 100;
    await service.handleEvent(fixture.refunded());
    fixture.transaction.status = "paid";
    fixture.transaction.refundedAmount = 0;
    await service.handleEvent(fixture.completed());
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_pro_entitlements").get()?.n).toBe(0);
    expect((await getCreemOrderForUser(db.binding(), proOrderId, "alice")).status).toBe("refunded");
  });

  it("rejects missing Pro configuration, unsupported products and shared provider SKU ids", async () => {
    const fixture = proFixture();
    await expect(
      new CreemBillingService(db.binding(), fixture.gateway, creemConfig).createCheckout(
        { id: "alice" },
        creemRequestId,
        "en",
        LOOM_PRO_PRODUCT_KEY,
      ),
    ).rejects.toMatchObject({ code: "billing_not_configured", status: 503 });
    expect(() =>
      getCreemProductDefinition(config, "untrusted_product" as CreemProductKey),
    ).toThrow();
    expect(() =>
      getCreemProductDefinition(
        { ...config, proProductId: config.productId },
        LOOM_PRO_PRODUCT_KEY,
      ),
    ).toThrow();
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_orders").get()?.n).toBe(0);
  });

  it("rejects Pro price changes and request-id reuse across products", async () => {
    const fixture = proFixture();
    fixture.product.price = 999;
    const service = new CreemBillingService(db.binding(), fixture.gateway, config);
    await expect(
      service.createCheckout({ id: "alice" }, creemRequestId, "en", LOOM_PRO_PRODUCT_KEY),
    ).rejects.toMatchObject({ code: "invalid_price_configuration" });
    const headshot = seedCreemOrder(db);
    await expect(
      service.createCheckout({ id: "alice" }, headshot.request_id, "en", LOOM_PRO_PRODUCT_KEY),
    ).rejects.toMatchObject({ code: "payment_mismatch", status: 409 });
  });

  it.each([
    [HEADSHOT_PRODUCT_KEY, LOOM_PRO_PRODUCT_KEY],
    [LOOM_PRO_PRODUCT_KEY, HEADSHOT_PRODUCT_KEY],
  ] as const)(
    "rejects a concurrent %s intent reused by %s before creating the wrong checkout",
    async (winningKey, losingKey) => {
      let signalInsert!: () => void;
      let releaseInsert!: () => void;
      const inserted = new Promise<void>((resolve) => {
        signalInsert = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseInsert = resolve;
      });
      const prepare = db.prepare.bind(db);
      let delayFirstInsert = true;
      vi.spyOn(db, "prepare").mockImplementation((sql) => {
        const statement = prepare(sql);
        if (delayFirstInsert && sql.startsWith("INSERT INTO creem_orders")) {
          delayFirstInsert = false;
          const run = statement.run.bind(statement);
          vi.spyOn(statement, "run").mockImplementation(async () => {
            const result = await run();
            signalInsert();
            await release;
            return result;
          });
        }
        return statement;
      });
      const fixture = creemFixture();
      const losingProduct = getCreemProductDefinition(config, losingKey);
      const createCheckout = vi.fn<CreemGateway["createCheckout"]>(async (input) => ({
        ...fixture.checkout,
        status: "pending",
        product: input.productId,
        requestId: input.requestId,
        metadata: input.metadata,
        successUrl: input.successUrl,
      }));
      const gateway: CreemGateway = {
        ...fixture.gateway,
        getProduct: async (id) => {
          // Both requests first see no local order. The losing request resumes
          // while the winning INSERT has committed but its response is delayed.
          if (id === losingProduct.id) await inserted;
          return { ...fixture.product, id, price: id === config.proProductId ? 100 : 999 };
        },
        createCheckout,
      };
      const service = new CreemBillingService(db.binding(), gateway, config);
      const winning = service.createCheckout({ id: "alice" }, creemRequestId, "en", winningKey);
      const losing = service.createCheckout({ id: "alice" }, creemRequestId, "en", losingKey);
      try {
        await expect(losing).rejects.toMatchObject({ status: 409, code: "payment_mismatch" });
        expect(createCheckout).not.toHaveBeenCalled();
      } finally {
        releaseInsert();
        await winning;
      }
      expect(createCheckout).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          productId: getCreemProductDefinition(config, winningKey).id,
          metadata: expect.objectContaining({ product_key: winningKey }),
        }),
      );
      expect(db.raw.prepare("SELECT count(*) AS n FROM creem_orders").get()?.n).toBe(1);
    },
  );

  it("uses the Pro SKU and amount from stored orders when validating webhook payments", async () => {
    seedProOrder(db);
    const fixture = proFixture();
    const service = new CreemBillingService(db.binding(), fixture.gateway, config);
    fixture.checkout.metadata!.product_key = "professional_headshots";
    await expect(service.handleEvent(fixture.completed())).rejects.toMatchObject({
      code: "payment_mismatch",
    });
    fixture.checkout.metadata!.product_key = "loom_pro";
    fixture.checkout.order!.product = config.productId;
    await expect(service.handleEvent(fixture.completed())).rejects.toMatchObject({
      code: "payment_mismatch",
    });
    expect(db.raw.prepare("SELECT count(*) AS n FROM creem_pro_entitlements").get()?.n).toBe(0);
  });
});
