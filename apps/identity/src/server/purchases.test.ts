import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreemTestDatabase, seedCreemOrder } from "../test/creem-fixtures";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const gateway = { getProduct: vi.fn() };
  const createCheckout = vi.fn(
    async (
      _user: { id: string },
      _requestId: string,
      _locale: "en" | "zh",
      _productKey: string,
    ) => ({
      orderId: "creem-pro-order",
      checkoutUrl: "https://www.creem.io/test/payment/pro-fixture",
      status: "pending",
    }),
  );
  return {
    gateway,
    createCheckout,
    getEnv: vi.fn<() => Promise<Record<string, string | undefined>>>(),
    getDatabase: vi.fn<() => Promise<D1Database>>(),
    createGateway: vi.fn((_key: string) => gateway),
    service: vi.fn(function (_db: D1Database, _gateway: unknown, _config: unknown) {
      return { createCheckout };
    }),
    historicalOrder: vi.fn<(_id: string, _userId: string) => Promise<Record<string, unknown>>>(),
  };
});

vi.mock("./env", () => ({ getEnv: mocks.getEnv }));
vi.mock("./db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("./creem-gateway", () => ({ createCreemGateway: mocks.createGateway }));
vi.mock("./creem-billing-service", () => ({ CreemBillingService: mocks.service }));
vi.mock("./billing", () => ({ getOrderForUser: mocks.historicalOrder }));

import { ApiError } from "./http";
import { createPurchaseCheckout, getPurchaseOrderForUser } from "./purchases";

const requestId = "6cb3c57b-89c1-439a-929f-278310a0fe45";
const environment = {
  APP_URL: "https://checkout.loom-labs.ai",
  CREEM_MODE: "test",
  CREEM_API_KEY: "creem_test_offline_fixture",
  CREEM_WEBHOOK_SECRET: "offline-fixture-webhook-secret",
  CREEM_PRODUCT_ID: "prod_headshots",
  CREEM_PRO_PRODUCT_ID: "prod_proFixture",
};

function seedProOrder(db: CreemTestDatabase, id: string, owner = "alice") {
  seedCreemOrder(db, id, owner);
  db.raw
    .prepare(
      "UPDATE creem_orders SET product_key='loom_pro', amount=100, creem_product_id='prod_proFixture' WHERE id=?",
    )
    .run(id);
}

function seedHistoricalPremium(db: CreemTestDatabase, owner = "alice") {
  const id = `legacy-stripe-order-${owner}`;
  db.raw
    .prepare(`INSERT INTO orders
    (id,user_id,request_id,product_key,feature_key,stripe_price_id,amount,currency,stripe_mode,checkout_payload_version,created_at,updated_at,status)
    VALUES (?,?,?,'hotkey-tools','premium-demo','price_historical',100,'usd','test',2,1,1,'paid')`)
    .run(id, owner, id);
  db.raw
    .prepare(`INSERT INTO entitlements(order_id,user_id,product_key,feature_key,granted_at)
    VALUES (?,?,'hotkey-tools','premium-demo',1)`)
    .run(id, owner);
  return id;
}

describe("default purchase provider and historical order compatibility", () => {
  let db: CreemTestDatabase;
  beforeEach(() => {
    vi.clearAllMocks();
    db = new CreemTestDatabase();
    mocks.getDatabase.mockResolvedValue(db.binding());
    mocks.getEnv.mockResolvedValue({ ...environment });
    mocks.createCheckout.mockResolvedValue({
      orderId: "creem-pro-order",
      checkoutUrl: "https://www.creem.io/test/payment/pro-fixture",
      status: "pending",
    });
    mocks.historicalOrder.mockRejectedValue(new ApiError(404, "order_not_found", "未找到订单。"));
  });
  afterEach(() => db.raw.close());

  it.each(["en", "zh"] as const)(
    "creates Loom Pro through Creem with the verified owner and %s return locale",
    async (locale) => {
      const user = { id: "alice" };
      expect(await createPurchaseCheckout(user, requestId, locale)).toMatchObject({
        orderId: "creem-pro-order",
      });
      expect(mocks.createGateway).toHaveBeenCalledExactlyOnceWith(environment.CREEM_API_KEY);
      expect(mocks.service).toHaveBeenCalledExactlyOnceWith(db.binding(), mocks.gateway, {
        mode: "test",
        appUrl: environment.APP_URL,
        apiKey: environment.CREEM_API_KEY,
        webhookSecret: environment.CREEM_WEBHOOK_SECRET,
        productId: environment.CREEM_PRODUCT_ID,
        proProductId: environment.CREEM_PRO_PRODUCT_ID,
      });
      expect(mocks.createCheckout).toHaveBeenCalledExactlyOnceWith(
        user,
        requestId,
        locale,
        "loom_pro",
      );
      expect(mocks.historicalOrder).not.toHaveBeenCalled();
    },
  );

  it("refuses a new Pro purchase when a historical Stripe order still grants Pro", async () => {
    seedHistoricalPremium(db);
    await expect(createPurchaseCheckout({ id: "alice" }, requestId, "en")).rejects.toMatchObject({
      status: 409,
      code: "already_unlocked",
    });
    expect(mocks.createGateway).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("refuses a new Pro purchase when a current Creem Pro order already grants access", async () => {
    seedProOrder(db, "paid-pro");
    db.raw.prepare("UPDATE creem_orders SET status='paid' WHERE id='paid-pro'").run();
    db.raw
      .prepare(
        "INSERT INTO creem_pro_entitlements(order_id,user_id,granted_at) VALUES ('paid-pro','alice',1)",
      )
      .run();
    await expect(createPurchaseCheckout({ id: "alice" }, requestId, "en")).rejects.toMatchObject({
      status: 409,
      code: "already_unlocked",
    });
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("does not confuse a purchased headshot package with Pro access", async () => {
    seedCreemOrder(db, "paid-headshots");
    db.raw.prepare("UPDATE creem_orders SET status='paid' WHERE id='paid-headshots'").run();
    db.raw
      .prepare(
        "INSERT INTO headshot_packs(id,order_id,user_id,photo_count,redo_count,granted_at) VALUES ('headshot-pack','paid-headshots','alice',4,1,1)",
      )
      .run();
    await expect(createPurchaseCheckout({ id: "alice" }, requestId, "en")).resolves.toHaveProperty(
      "checkoutUrl",
    );
    expect(mocks.createCheckout).toHaveBeenCalledExactlyOnceWith(
      { id: "alice" },
      requestId,
      "en",
      "loom_pro",
    );
  });

  it("allows the existing request to reach recovery even when Pro became active afterward", async () => {
    seedProOrder(db, requestId);
    seedHistoricalPremium(db);
    await expect(createPurchaseCheckout({ id: "alice" }, requestId, "zh")).resolves.toHaveProperty(
      "checkoutUrl",
    );
    expect(mocks.createCheckout).toHaveBeenCalledExactlyOnceWith(
      { id: "alice" },
      requestId,
      "zh",
      "loom_pro",
    );
  });

  it("does not treat another user's matching request id as this user's recoverable attempt", async () => {
    seedProOrder(db, requestId, "bob");
    seedHistoricalPremium(db);
    await expect(createPurchaseCheckout({ id: "alice" }, requestId, "en")).rejects.toMatchObject({
      code: "already_unlocked",
    });
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("does not let a same-id headshot order bypass the Pro already-owned check", async () => {
    seedCreemOrder(db, requestId);
    seedHistoricalPremium(db);
    await expect(createPurchaseCheckout({ id: "alice" }, requestId, "en")).rejects.toMatchObject({
      code: "already_unlocked",
    });
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("does not let another user's entitlement block this user's purchase", async () => {
    seedHistoricalPremium(db, "bob");
    await expect(createPurchaseCheckout({ id: "alice" }, requestId, "en")).resolves.toHaveProperty(
      "checkoutUrl",
    );
  });

  it("returns the current owner's Creem Pro order without querying the historical provider", async () => {
    seedProOrder(db, "pro-order");
    expect(await getPurchaseOrderForUser("pro-order", "alice")).toMatchObject({
      id: "pro-order",
      productKey: "loom_pro",
      amount: 100,
      currency: "usd",
      mode: "test",
    });
    expect(mocks.historicalOrder).not.toHaveBeenCalled();
  });

  it("falls back to the historical lookup with the same authenticated owner", async () => {
    const historical = { id: "legacy-order", status: "paid", amount: 100, currency: "usd" };
    mocks.historicalOrder.mockResolvedValueOnce(historical);
    expect(await getPurchaseOrderForUser("legacy-order", "alice")).toEqual(historical);
    expect(mocks.historicalOrder).toHaveBeenCalledExactlyOnceWith("legacy-order", "alice");
  });

  it.each(["other-owner", "headshot", "missing"])(
    "does not expose a non-Pro or inaccessible current order (%s)",
    async (kind) => {
      if (kind === "other-owner") seedProOrder(db, "private-order", "bob");
      if (kind === "headshot") seedCreemOrder(db, "private-order");
      await expect(getPurchaseOrderForUser("private-order", "alice")).rejects.toMatchObject({
        status: 404,
        code: "order_not_found",
      });
      expect(mocks.historicalOrder).toHaveBeenCalledExactlyOnceWith("private-order", "alice");
    },
  );

  it.each(["", " ", "live", "prod", "invalid"])(
    "rejects active Creem mode %j before any provider or order operation",
    async (mode) => {
      mocks.getEnv.mockResolvedValue({ ...environment, CREEM_MODE: mode });
      await expect(createPurchaseCheckout({ id: "alice" }, requestId, "en")).rejects.toMatchObject({
        status: 503,
        code: "sandbox_required",
      });
      await expect(getPurchaseOrderForUser("order", "alice")).rejects.toMatchObject({
        status: 503,
        code: "sandbox_required",
      });
      expect(mocks.getDatabase).not.toHaveBeenCalled();
      expect(mocks.createGateway).not.toHaveBeenCalled();
      expect(mocks.historicalOrder).not.toHaveBeenCalled();
    },
  );

  it("does not replace a provider failure with a successful or historical purchase", async () => {
    const unavailable = new ApiError(502, "checkout_unavailable", "创建结果待确认。");
    mocks.createCheckout.mockRejectedValueOnce(unavailable);
    await expect(createPurchaseCheckout({ id: "alice" }, requestId, "en")).rejects.toBe(
      unavailable,
    );
    expect(mocks.historicalOrder).not.toHaveBeenCalled();
  });
});
