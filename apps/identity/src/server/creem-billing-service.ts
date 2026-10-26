import "server-only";
import { ApiError } from "./http";
import {
  CREEM_APPLICATION_KEY,
  HEADSHOT_PHOTO_COUNT,
  HEADSHOT_PRODUCT_KEY,
  HEADSHOT_REDO_COUNT,
  LOOM_PRO_PRODUCT_KEY,
  type CreemBillingConfig,
  type CreemGateway,
  type CreemOrderRow,
  type CreemProductKey,
  type CreemWebhookEvent,
} from "./creem-types";
import {
  creemCheckoutInput,
  creemObjectId,
  invalidCreemPayment,
  requireCreemCheckout,
  requireCreemCheckoutUrl,
  requireCreemPaidOrder,
  requireCreemProduct,
  requireCreemTestMode,
  requireCreemTransaction,
} from "./creem-validation";
import { isRecord } from "./creem-webhook";
import { getCreemProductDefinition } from "./creem-products";

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CreemBillingService {
  constructor(
    private readonly db: D1Database,
    private readonly gateway: CreemGateway,
    private readonly config: CreemBillingConfig,
  ) {
    requireCreemTestMode(config.mode, 503);
  }

  private requireOrder(order: CreemOrderRow) {
    requireCreemTestMode(order.mode);
    const product = getCreemProductDefinition(this.config, order.product_key);
    if (
      order.creem_product_id !== product.id ||
      order.amount !== product.price ||
      order.currency !== "USD"
    ) {
      throw invalidCreemPayment();
    }
  }

  private async findOrder(userId: string, requestId: string) {
    return this.db
      .prepare("SELECT * FROM creem_orders WHERE user_id = ? AND request_id = ?")
      .bind(userId, requestId)
      .first<CreemOrderRow>();
  }

  async createCheckout(
    user: { id: string },
    requestId: string,
    locale: "en" | "zh" = "en",
    productKey: CreemProductKey = HEADSHOT_PRODUCT_KEY,
  ) {
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      throw new ApiError(400, "invalid_request_id", "requestId 必须为 UUID。");
    }
    if (locale !== "en" && locale !== "zh") {
      throw new ApiError(400, "invalid_json", "不支持的界面语言。");
    }
    const product = getCreemProductDefinition(this.config, productKey);
    let order = await this.findOrder(user.id, requestId);
    if (!order) {
      requireCreemProduct(await this.gateway.getProduct(product.id), product.id, product.price);
      const now = Date.now();
      await this.db
        .prepare(`INSERT INTO creem_orders
          (id, user_id, request_id, product_key, creem_product_id, amount, currency, mode, locale, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'USD', 'test', ?, ?, ?)
          ON CONFLICT(user_id, request_id) DO NOTHING`)
        .bind(
          crypto.randomUUID(),
          user.id,
          requestId,
          product.key,
          product.id,
          product.price,
          locale,
          now,
          now,
        )
        .run();
      order = await this.findOrder(user.id, requestId);
    }
    if (!order) throw new ApiError(503, "order_unavailable", "无法创建购买订单。");
    // A concurrent request can win INSERT with another SKU under the same key.
    // Check the stored result before resuming or creating its provider checkout.
    if (order.product_key !== productKey) throw invalidCreemPayment(409);
    this.requireOrder(order);
    if (order.status !== "pending") {
      throw new ApiError(409, "order_closed", "此购买已结束，请刷新订单状态。");
    }
    if (order.checkout_id) {
      const checkout = await this.gateway.getCheckout(order.checkout_id);
      requireCreemCheckout(checkout, order, this.config);
      if (checkout.status !== "pending") {
        throw new ApiError(409, "checkout_closed", "此收银台已结束，请刷新订单状态。");
      }
      return {
        orderId: order.id,
        checkoutUrl: requireCreemCheckoutUrl(checkout),
        status: order.status,
      };
    }
    // request_id is documented as a tracking identifier. Do not assume the
    // provider deduplicates concurrent calls or retains a Stripe-style key window.
    const claimed = await this.db
      .prepare(
        "UPDATE creem_orders SET checkout_state = 'creating', updated_at = ? WHERE id = ? AND checkout_state = 'new'",
      )
      .bind(Date.now(), order.id)
      .run();
    if (!claimed.meta.changes) {
      throw new ApiError(
        409,
        "checkout_unavailable",
        "此支付尝试仍在确认，请刷新订单状态，避免重复付款。",
      );
    }
    try {
      const checkout = await this.gateway.createCheckout(creemCheckoutInput(order, this.config));
      requireCreemCheckout(checkout, order, this.config);
      if (checkout.status !== "pending") throw invalidCreemPayment();
      const checkoutUrl = requireCreemCheckoutUrl(checkout);
      await this.db
        .prepare(`UPDATE creem_orders SET checkout_id = ?, checkout_url = ?, checkout_state = 'ready', updated_at = ?
          WHERE id = ? AND (checkout_id IS NULL OR checkout_id = ?)`)
        .bind(checkout.id, checkoutUrl, Date.now(), order.id, checkout.id)
        .run();
      return { orderId: order.id, checkoutUrl, status: order.status };
    } catch (cause) {
      // A lost response could mean a checkout exists. A late verified webhook
      // can recover it via our metadata, but a browser retry must not create more.
      await this.db
        .prepare(
          "UPDATE creem_orders SET checkout_state = 'uncertain', updated_at = ? WHERE id = ? AND checkout_id IS NULL",
        )
        .bind(Date.now(), order.id)
        .run();
      if (cause instanceof ApiError) throw cause;
      throw new ApiError(
        502,
        "checkout_unavailable",
        "收银台创建结果尚未确认，请刷新订单后再操作。",
        { cause },
      );
    }
  }

  private async loadPayment(checkoutId: string) {
    const checkout = await this.gateway.getCheckout(checkoutId);
    requireCreemTestMode(checkout.mode);
    if (checkout.metadata?.app_key !== CREEM_APPLICATION_KEY) return null;
    const localOrderId = checkout.metadata.order_id;
    if (typeof localOrderId !== "string") throw invalidCreemPayment();
    const order = await this.db
      .prepare("SELECT * FROM creem_orders WHERE id = ?")
      .bind(localOrderId)
      .first<CreemOrderRow>();
    if (!order) throw new ApiError(503, "order_unavailable", "本地购买订单暂不可用。");
    this.requireOrder(order);
    if (checkout.id !== checkoutId) throw invalidCreemPayment();
    requireCreemCheckout(checkout, order, this.config);
    const paid = requireCreemPaidOrder(checkout, order);
    const transaction = await this.gateway.getTransaction(paid.transaction!);
    const { fullyRefunded } = requireCreemTransaction(transaction, checkout, order);
    return { checkout, order, paid, transaction, fullyRefunded };
  }

  private async applyEvent(
    event: CreemWebhookEvent,
    payment: NonNullable<Awaited<ReturnType<CreemBillingService["loadPayment"]>>>,
  ) {
    const { order, checkout, paid, transaction, fullyRefunded } = payment;
    const now = Date.now();
    const eventIsNew =
      "EXISTS (SELECT 1 FROM creem_events WHERE id = ? AND order_id = ? AND mode = 'test' AND processed_at IS NULL)";
    const eventValues = [event.id, order.id];
    const statements = [
      this.db
        .prepare(
          "INSERT OR IGNORE INTO creem_events (id, type, order_id, mode, received_at) VALUES (?, ?, ?, 'test', ?)",
        )
        .bind(event.id, event.eventType, order.id, now),
    ];
    if (fullyRefunded) {
      statements.push(
        this.db
          .prepare(`UPDATE creem_orders SET status = 'refunded', checkout_id = ?, creem_order_id = ?, transaction_id = ?,
          checkout_state = 'ready', refunded_at = COALESCE(refunded_at, ?), updated_at = ? WHERE id = ? AND ${eventIsNew}`)
          .bind(checkout.id, paid.id, transaction.id, now, now, order.id, ...eventValues),
        this.db
          .prepare(`UPDATE ${order.product_key === LOOM_PRO_PRODUCT_KEY ? "creem_pro_entitlements" : "headshot_packs"} SET revoked_at = COALESCE(revoked_at, ?)
          WHERE order_id = ? AND ${eventIsNew}`)
          .bind(now, order.id, ...eventValues),
      );
    } else {
      statements.push(
        this.db
          .prepare(`UPDATE creem_orders SET status = 'paid', checkout_id = ?, creem_order_id = ?, transaction_id = ?,
          checkout_state = 'ready', paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE id = ? AND status != 'refunded' AND ${eventIsNew}`)
          .bind(checkout.id, paid.id, transaction.id, now, now, order.id, ...eventValues),
        order.product_key === LOOM_PRO_PRODUCT_KEY
          ? this.db
              .prepare(`INSERT INTO creem_pro_entitlements (order_id, user_id, granted_at)
            SELECT id, user_id, ? FROM creem_orders WHERE id = ? AND status = 'paid' AND ${eventIsNew}
            ON CONFLICT(order_id) DO NOTHING`)
              .bind(now, order.id, ...eventValues)
          : this.db
              .prepare(`INSERT INTO headshot_packs (id, order_id, user_id, photo_count, redo_count, granted_at)
            SELECT id, id, user_id, ?, ?, ? FROM creem_orders WHERE id = ? AND status = 'paid' AND ${eventIsNew}
            ON CONFLICT(order_id) DO NOTHING`)
              .bind(HEADSHOT_PHOTO_COUNT, HEADSHOT_REDO_COUNT, now, order.id, ...eventValues),
      );
    }
    statements.push(
      this.db
        .prepare(
          "UPDATE creem_events SET processed_at = ? WHERE id = ? AND order_id = ? AND mode = 'test' AND processed_at IS NULL",
        )
        .bind(now, ...eventValues),
    );
    await this.db.batch(statements);
  }

  async handleEvent(event: CreemWebhookEvent): Promise<{ received: true; ignored?: true }> {
    if (event.object.mode !== undefined) requireCreemTestMode(event.object.mode);
    if (!["checkout.completed", "refund.created"].includes(event.eventType)) {
      return { received: true, ignored: true };
    }
    requireCreemTestMode(event.object.mode);
    for (const field of ["product", "order", "transaction", "checkout"]) {
      const child = event.object[field];
      if (isRecord(child) && child.mode !== undefined) requireCreemTestMode(child.mode);
    }
    const processed = await this.db
      .prepare("SELECT type FROM creem_events WHERE id = ? AND processed_at IS NOT NULL")
      .bind(event.id)
      .first<{ type: string }>();
    if (processed) {
      if (processed.type !== event.eventType) throw invalidCreemPayment();
      return { received: true };
    }
    let checkoutId: string | null;
    if (event.eventType === "checkout.completed") {
      if (
        !isRecord(event.object.metadata) ||
        event.object.metadata.app_key !== CREEM_APPLICATION_KEY
      ) {
        return { received: true, ignored: true };
      }
      checkoutId = creemObjectId(event.object);
    } else {
      checkoutId = creemObjectId(event.object.checkout);
      if (!checkoutId) {
        const transactionId = creemObjectId(event.object.transaction);
        if (!transactionId) return { received: true, ignored: true };
        const order = await this.db
          .prepare(
            "SELECT checkout_id FROM creem_orders WHERE transaction_id = ? AND mode = 'test'",
          )
          .bind(transactionId)
          .first<{ checkout_id: string | null }>();
        checkoutId = order?.checkout_id ?? null;
        if (!checkoutId) {
          throw new ApiError(503, "order_unavailable", "退款关联订单尚未确认，请稍后重试。");
        }
      }
    }
    if (!checkoutId) throw invalidCreemPayment();
    const payment = await this.loadPayment(checkoutId);
    if (!payment) return { received: true, ignored: true };
    // Partial, pending and failed refunds cannot revoke or grant a purchase.
    if (event.eventType === "refund.created" && !payment.fullyRefunded) {
      const refundStatus = event.object.status;
      if (
        !["succeeded", "failed", "canceled"].includes(String(refundStatus)) ||
        (refundStatus === "succeeded" && payment.transaction.status === "paid")
      ) {
        // An asynchronous refund, or a provider read that has not caught up,
        // must remain retryable rather than consume the only refund event.
        throw new ApiError(503, "order_unavailable", "退款结果尚未确认，请稍后重试。");
      }
      return { received: true, ignored: true };
    }
    await this.applyEvent(event, payment);
    return { received: true };
  }
}
