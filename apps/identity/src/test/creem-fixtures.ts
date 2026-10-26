import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { vi } from "vitest";
import {
  CREEM_APPLICATION_KEY,
  HEADSHOT_PRODUCT_KEY,
  type CreemBillingConfig,
  type CreemCheckout,
  type CreemCheckoutInput,
  type CreemGateway,
  type CreemOrderRow,
  type CreemProduct,
  type CreemTransaction,
  type CreemWebhookEvent,
} from "../server/creem-types";

export class CreemTestDatabase {
  raw = new DatabaseSync(":memory:");
  failNextGrant = false;
  failNextProGrant = false;
  constructor(throughMigration?: string) {
    const migrations = new URL("../../migrations/", import.meta.url);
    for (const file of readdirSync(migrations)
      .filter((name) => name.endsWith(".sql"))
      .filter((name) => throughMigration === undefined || name <= throughMigration)
      .sort()) {
      this.raw.exec(readFileSync(new URL(file, migrations), "utf8"));
    }
    this.raw.exec(
      "INSERT INTO users(id,issuer,subject,created_at) VALUES ('alice','https://id.example','alice',1),('bob','https://id.example','bob',1)",
    );
  }
  prepare(sql: string) {
    return new CreemTestStatement(this, sql);
  }
  async batch(statements: CreemTestStatement[]) {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.execute());
      this.raw.exec("COMMIT");
      return results;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }
  binding() {
    return this as unknown as D1Database;
  }
}

class CreemTestStatement {
  private values: (string | number | null)[] = [];
  constructor(
    private readonly db: CreemTestDatabase,
    private readonly sql: string,
  ) {}
  bind(...values: (string | number | null)[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.db.raw.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }
  async all<T>() {
    return { results: this.db.raw.prepare(this.sql).all(...this.values) as T[] };
  }
  async run() {
    return this.execute();
  }
  execute() {
    if (this.db.failNextGrant && this.sql.startsWith("INSERT INTO headshot_packs")) {
      this.db.failNextGrant = false;
      throw new Error("Simulated headshot grant write failure");
    }
    if (this.db.failNextProGrant && this.sql.startsWith("INSERT INTO creem_pro_entitlements")) {
      this.db.failNextProGrant = false;
      throw new Error("Simulated Pro grant write failure");
    }
    const result = this.db.raw.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

export const creemConfig: CreemBillingConfig = {
  mode: "test",
  appUrl: "https://checkout.example",
  productId: "prod_headshots",
  apiKey: "creem_test_offline_fixture",
  webhookSecret: "offline_creem_webhook_secret",
};
export const creemOrderId = "98f7652e-1512-4f3c-a4c5-e7568c179126";
export const creemRequestId = "f8392497-78e4-4f40-8a2f-dd6430d733f6";

export function seedCreemOrder(db: CreemTestDatabase, id = creemOrderId, userId = "alice") {
  db.raw
    .prepare(`INSERT INTO creem_orders
    (id,user_id,request_id,product_key,creem_product_id,amount,currency,mode,locale,created_at,updated_at)
    VALUES (?, ?, ?, ?, 'prod_headshots',999,'USD','test','en',?,?)`)
    .run(id, userId, id, HEADSHOT_PRODUCT_KEY, Date.now(), Date.now());
  return db.raw.prepare("SELECT * FROM creem_orders WHERE id = ?").get(id) as CreemOrderRow;
}

export function creemFixture(id = creemOrderId, userId = "alice") {
  const product: CreemProduct = {
    id: creemConfig.productId,
    mode: "test",
    status: "active",
    price: 999,
    currency: "USD",
    billingType: "onetime",
    taxMode: "inclusive",
    businessNetPricing: false,
  };
  const metadata = {
    app_key: CREEM_APPLICATION_KEY,
    order_id: id,
    user_id: userId,
    product_key: HEADSHOT_PRODUCT_KEY,
    mode: "test",
  };
  const transaction: CreemTransaction = {
    id: `tran_${id}`,
    mode: "test",
    amount: 999,
    amountPaid: 999,
    currency: "USD",
    type: "payment",
    status: "paid",
    refundedAmount: 0,
    order: `ord_${id}`,
  };
  const checkout: CreemCheckout = {
    id: `ch_${id}`,
    mode: "test",
    status: "completed",
    requestId: id,
    product,
    units: 1,
    checkoutUrl: `https://www.creem.io/test/payment/ch_${id}`,
    metadata,
    order: {
      id: `ord_${id}`,
      mode: "test",
      product: product.id,
      transaction: transaction.id,
      amount: 999,
      amountPaid: 999,
      amountDue: 999,
      currency: "USD",
      status: "paid",
      type: "onetime",
      discountAmount: 0,
    },
  };
  const gateway = {
    getProduct: vi.fn(async () => product),
    getCheckout: vi.fn(async () => checkout),
    getTransaction: vi.fn(async () => transaction),
    createCheckout: vi.fn(
      async (input: CreemCheckoutInput): Promise<CreemCheckout> => ({
        ...checkout,
        status: "pending",
        requestId: input.requestId,
        metadata: input.metadata,
        successUrl: input.successUrl,
      }),
    ),
  } satisfies CreemGateway;
  function completed(eventId = `evt_complete_${id}`): CreemWebhookEvent {
    return {
      id: eventId,
      eventType: "checkout.completed",
      object: { id: checkout.id, mode: "test", metadata },
    };
  }
  function refunded(eventId = `evt_refund_${id}`): CreemWebhookEvent {
    return {
      id: eventId,
      eventType: "refund.created",
      object: {
        mode: "test",
        status: "succeeded",
        checkout: { id: checkout.id, metadata, mode: "test" },
        transaction: { id: transaction.id, mode: "test" },
      },
    };
  }
  return { product, transaction, checkout, gateway, completed, refunded };
}
