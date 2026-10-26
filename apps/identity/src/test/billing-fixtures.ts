import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import Stripe from "stripe";
import { vi } from "vitest";
import type { OrderRow } from "../server/billing";
import type { StripeMode } from "@loom-ai/identity-core/billing-types";

export const databaseBinding = { value: undefined as D1Database | undefined };
export const environmentBinding = { value: {} as Record<string, string> };

// Execute the application's migration and batch SQL against SQLite, including rollback.
// This does not replace the documented integration check against a real D1 deployment.
export class SQLiteD1 {
  readonly raw = new DatabaseSync(":memory:");
  failNextGrant = false;

  constructor() {
    const migrations = new URL("../../migrations/", import.meta.url);
    for (const name of readdirSync(migrations)
      .filter((file) => file.endsWith(".sql"))
      .sort())
      this.raw.exec(readFileSync(new URL(name, migrations), "utf8"));
    this.raw.exec(
      "INSERT INTO users(id,issuer,subject,created_at) VALUES ('alice','https://id.example','alice',1),('bob','https://id.example','bob',1)",
    );
  }

  prepare(sql: string) {
    return new SQLiteStatement(this, sql);
  }

  async batch(statements: SQLiteStatement[]) {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(statement.execute());
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

class SQLiteStatement {
  private values: (string | number | null)[] = [];
  constructor(
    private readonly db: SQLiteD1,
    private readonly sql: string,
  ) {}
  bind(...values: (string | number | null)[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.db.raw.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }
  async run() {
    return this.execute();
  }
  execute() {
    if (this.db.failNextGrant && this.sql.startsWith("INSERT INTO entitlements")) {
      this.db.failNextGrant = false;
      throw new Error("Simulated grant write failure");
    }
    const result = this.db.raw.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

export const config = {
  mode: "test" as const,
  appUrl: "https://app.example",
  secretKey: "sk_test_offline_fixture",
  webhookSecret: "whsec_offline_fixture",
  priceId: "price_premium",
};
export const requestId = "7a517e89-7ac5-43ad-8618-8a4bfbc53d52";
export const orderId = "e454113c-24b7-4269-ae96-65ee98625af3";

export function seedOrder(
  db: SQLiteD1,
  id = orderId,
  user = "alice",
  mode: StripeMode = "test",
): OrderRow {
  db.raw
    .prepare(`INSERT INTO orders
    (id,user_id,request_id,product_key,feature_key,stripe_price_id,amount,currency,stripe_mode,checkout_payload_version,created_at,updated_at)
    VALUES (?, ?, ?, 'hotkey-tools','premium-demo','price_premium', ?, 'usd', ?, 2, ?, ?)`)
    .run(id, user, id, mode === "live" ? 100 : 1200, mode, Date.now(), Date.now());
  return db.raw.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow;
}

export function stripeFixture(order: OrderRow) {
  const metadata = {
    app_key: "hotkey-tools-identity",
    order_id: order.id,
    user_id: order.user_id,
    product_key: order.product_key,
    feature_key: order.feature_key,
    stripe_mode: order.stripe_mode,
  };
  const suffix = order.id === orderId ? "payment" : order.id;
  const sessionId = `cs_${order.stripe_mode}_${suffix}`;
  const intentId = `pi_${order.stripe_mode}_${suffix}`;
  const session = {
    id: sessionId,
    object: "checkout.session",
    livemode: order.stripe_mode === "live",
    mode: "payment",
    client_reference_id: order.id,
    metadata,
    amount_total: order.amount,
    currency: order.currency,
    payment_intent: intentId as string | { id: string } | null,
    payment_status: "paid",
    status: "complete",
    url: `https://checkout.stripe.com/c/pay/${sessionId}`,
  };
  const intent = {
    id: intentId,
    livemode: order.stripe_mode === "live",
    metadata: { ...metadata },
    amount: order.amount,
    amount_received: order.amount,
    currency: order.currency,
    status: "succeeded",
  };
  const line = {
    quantity: 1,
    price: {
      id: order.stripe_price_id,
      unit_amount: order.amount,
      currency: order.currency,
      livemode: order.stripe_mode === "live",
    },
    amount_total: order.amount,
  };
  const refunds: { status: string; currency: string; amount: number }[] = [];
  const api = {
    prices: {
      retrieve: vi.fn(async () => ({
        id: "price_premium",
        livemode: order.stripe_mode === "live",
        active: true,
        type: "one_time",
        billing_scheme: "per_unit",
        unit_amount: order.amount,
        currency: order.currency,
      })),
    },
    checkout: {
      sessions: {
        retrieve: vi.fn(async () => session),
        listLineItems: vi.fn(async () => ({ data: [line], has_more: false })),
        list: vi.fn(async () => ({ data: [session], has_more: false })),
        create: vi.fn(
          async (
            params: Stripe.Checkout.SessionCreateParams,
            _options?: Stripe.RequestOptions,
          ) => ({
            ...session,
            status: "open",
            metadata: params.metadata,
            client_reference_id: params.client_reference_id,
          }),
        ),
      },
    },
    paymentIntents: { retrieve: vi.fn(async () => intent) },
    refunds: {
      list: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          yield* refunds;
        },
      })),
    },
  };
  return { stripe: api as unknown as Stripe, api, session, intent, line, refunds };
}

export function completedEvent(
  id = "evt_completed",
  mode: StripeMode = "test",
  order?: OrderRow,
): Stripe.Event {
  const idOfOrder = order?.id ?? orderId;
  const suffix = idOfOrder === orderId ? "payment" : idOfOrder;
  return {
    id,
    type: "checkout.session.completed",
    livemode: mode === "live",
    data: {
      object: {
        id: `cs_${mode}_${suffix}`,
        livemode: mode === "live",
        metadata: {
          app_key: "hotkey-tools-identity",
          order_id: idOfOrder,
          user_id: order?.user_id ?? "alice",
          product_key: "hotkey-tools",
          feature_key: "premium-demo",
          stripe_mode: mode,
        },
      },
    },
  } as unknown as Stripe.Event;
}

export function refundEvent(
  id = "evt_refunded",
  mode: StripeMode = "test",
  order?: OrderRow,
): Stripe.Event {
  const suffix = !order || order.id === orderId ? "payment" : order.id;
  return {
    id,
    type: "refund.updated",
    livemode: mode === "live",
    data: { object: { id: "re_fixture", payment_intent: `pi_${mode}_${suffix}` } },
  } as unknown as Stripe.Event;
}
