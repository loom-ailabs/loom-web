import "server-only";
import type Stripe from "stripe";
import {
  PRODUCT_KEY,
  FEATURE_KEY,
  hasPremiumInDatabase,
} from "@hotkey-tools/identity-core/entitlements";
import { ApiError } from "./http";
import type { BillingConfig, CheckoutUser, OrderRow } from "./billing-types";
import {
  APPLICATION_KEY,
  objectId,
  validMetadata,
  invalidPayment,
  requireStripeMode,
  requirePaymentSession,
} from "./billing-validation";
import { checkoutPayload, requireCheckoutPayloadVersion } from "./billing-checkout-payload";

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class BillingService {
  constructor(
    private readonly db: D1Database,
    private readonly stripe: Stripe,
    private readonly config: BillingConfig,
  ) {}

  private requireOrderMode(order: OrderRow, status = 400) {
    if (order.stripe_mode !== this.config.mode)
      throw new ApiError(status, "billing_mode_mismatch", "订单与配置的支付模式不一致。");
    requireCheckoutPayloadVersion(order, status);
  }

  private async getOrder(id: string): Promise<OrderRow> {
    const order = await this.db
      .prepare("SELECT * FROM orders WHERE id = ?")
      .bind(id)
      .first<OrderRow>();
    if (!order) throw new ApiError(503, "order_unavailable", "本地订单暂不可用，请稍后重试。");
    this.requireOrderMode(order);
    return order;
  }

  async createCheckout(user: CheckoutUser, requestId: string) {
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      throw new ApiError(
        400,
        "invalid_request_id",
        "requestId 必须为 UUID，重试时应使用同一个值。",
      );
    }
    let order = await this.db
      .prepare("SELECT * FROM orders WHERE user_id = ? AND request_id = ?")
      .bind(user.id, requestId)
      .first<OrderRow>();

    if (!order) {
      if (await hasPremiumInDatabase(this.db, user.id, this.config.mode)) {
        throw new ApiError(409, "already_unlocked", "Loom Pro 已向此账号开放。");
      }
      const price = await this.stripe.prices.retrieve(this.config.priceId);
      requireStripeMode(price.livemode, this.config.mode, 503);
      if (
        price.id !== this.config.priceId ||
        !price.active ||
        price.type !== "one_time" ||
        price.billing_scheme !== "per_unit" ||
        !Number.isSafeInteger(price.unit_amount) ||
        !price.unit_amount ||
        price.unit_amount <= 0 ||
        (this.config.mode === "live" && (price.currency !== "usd" || price.unit_amount !== 100))
      ) {
        throw new ApiError(503, "invalid_price_configuration", "需要启用的单次固定价格。");
      }
      const now = Date.now();
      const orderId = crypto.randomUUID();
      // Persist intent before calling Stripe. A retry reuses the stored price and order id.
      await this.db
        .prepare(
          `INSERT INTO orders
           (id, user_id, request_id, product_key, feature_key, stripe_price_id, amount, currency, stripe_mode, checkout_payload_version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?, ?)
           ON CONFLICT(user_id, request_id) DO NOTHING`,
        )
        .bind(
          orderId,
          user.id,
          requestId,
          PRODUCT_KEY,
          FEATURE_KEY,
          price.id,
          price.unit_amount,
          price.currency,
          this.config.mode,
          now,
          now,
        )
        .run();
      order = await this.db
        .prepare("SELECT * FROM orders WHERE user_id = ? AND request_id = ?")
        .bind(user.id, requestId)
        .first<OrderRow>();
      if (!order) throw new ApiError(503, "order_unavailable", "无法创建本地订单。");
    }

    this.requireOrderMode(order, 409);
    if (order.status !== "pending") {
      throw new ApiError(409, "order_closed", "此支付尝试已结束，请刷新订单状态。");
    }
    if (order.checkout_session_id) {
      const session = await this.stripe.checkout.sessions.retrieve(order.checkout_session_id);
      requirePaymentSession(session, order, this.config.mode);
      if (session.status !== "open" || !session.url) {
        throw new ApiError(409, "checkout_closed", "Checkout 已结束，请查看订单状态后重新发起。");
      }
      return { orderId: order.id, checkoutUrl: session.url, status: order.status };
    }
    // Stripe only retains idempotency keys for a limited window. Never recreate an uncertain old attempt.
    if (Date.now() - order.created_at > 23 * 60 * 60 * 1000) {
      throw new ApiError(
        409,
        "checkout_attempt_expired",
        "此支付尝试已过期，请使用新的 requestId。",
      );
    }
    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.create(
        checkoutPayload(order, this.config.appUrl),
        { idempotencyKey: `identity-checkout:${order.id}` },
      );
    } catch (cause) {
      // Keep pending intent. The same request id can recover a lost Stripe response.
      throw new ApiError(
        502,
        "checkout_unavailable",
        "Checkout 暂不可用，请用相同 requestId 重试。",
        { cause },
      );
    }
    requirePaymentSession(session, order, this.config.mode);
    if (!session.url) {
      throw invalidPayment();
    }
    await this.db
      .prepare(
        `UPDATE orders SET checkout_session_id = ?, checkout_url = ?, updated_at = ?
         WHERE id = ? AND stripe_mode = ? AND (checkout_session_id IS NULL OR checkout_session_id = ?)`,
      )
      .bind(session.id, session.url, Date.now(), order.id, this.config.mode, session.id)
      .run();
    return { orderId: order.id, checkoutUrl: session.url, status: order.status };
  }

  private async loadPayment(sessionId: string, order: OrderRow) {
    const [session, lines] = await Promise.all([
      this.stripe.checkout.sessions.retrieve(sessionId),
      this.stripe.checkout.sessions.listLineItems(sessionId, { limit: 2 }),
    ]);
    const line = lines.data[0];
    requirePaymentSession(session, order, this.config.mode);
    if (line?.price) requireStripeMode(line.price.livemode, this.config.mode);
    if (
      lines.has_more ||
      lines.data.length !== 1 ||
      line?.quantity !== 1 ||
      line.price?.id !== order.stripe_price_id ||
      line.price?.unit_amount !== order.amount ||
      line.price?.currency !== order.currency ||
      line.amount_total !== order.amount
    ) {
      throw invalidPayment();
    }
    const paymentIntentId = objectId(session.payment_intent);
    if (
      !paymentIntentId ||
      (order.payment_intent_id !== null && order.payment_intent_id !== paymentIntentId)
    ) {
      throw invalidPayment();
    }
    const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    requireStripeMode(intent.livemode, this.config.mode);
    if (
      !validMetadata(intent.metadata, order, this.config.mode) ||
      intent.currency !== order.currency ||
      intent.amount !== order.amount ||
      intent.amount_received !== order.amount ||
      intent.status !== "succeeded"
    ) {
      throw invalidPayment();
    }
    let refunded = 0;
    // Refunds can arrive before checkout.completed. Read current successful refunds rather than event order.
    for await (const refund of this.stripe.refunds.list({
      payment_intent: intent.id,
      limit: 100,
    })) {
      if (refund.status === "succeeded" && refund.currency === order.currency)
        refunded += refund.amount;
    }
    return { session, paymentIntentId, fullyRefunded: refunded >= order.amount };
  }

  private async applyEvent(
    event: Stripe.Event,
    order: OrderRow,
    status: "paid" | "refunded" | "expired",
    sessionId: string,
    paymentIntentId: string | null,
  ) {
    const now = Date.now();
    const eventIsNew =
      "EXISTS (SELECT 1 FROM stripe_events WHERE id = ? AND stripe_mode = ? AND order_id = ? AND processed_at IS NULL)";
    const eventValues = [event.id, this.config.mode, order.id];
    const statements = [
      this.db
        .prepare(
          "INSERT OR IGNORE INTO stripe_events (id, type, order_id, received_at, stripe_mode) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(event.id, event.type, order.id, now, this.config.mode),
    ];
    if (status === "refunded") {
      statements.push(
        this.db
          .prepare(`UPDATE orders SET status = 'refunded', checkout_session_id = ?, payment_intent_id = ?,
          refunded_at = COALESCE(refunded_at, ?), updated_at = ? WHERE id = ? AND ${eventIsNew}`)
          .bind(sessionId, paymentIntentId, now, now, order.id, ...eventValues),
        this.db
          .prepare(`UPDATE entitlements SET revoked_at = COALESCE(revoked_at, ?)
          WHERE order_id = ? AND ${eventIsNew}`)
          .bind(now, order.id, ...eventValues),
      );
    } else if (status === "paid") {
      statements.push(
        this.db
          .prepare(`UPDATE orders SET status = 'paid', checkout_session_id = ?, payment_intent_id = ?,
          paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE id = ? AND status != 'refunded' AND ${eventIsNew}`)
          .bind(sessionId, paymentIntentId, now, now, order.id, ...eventValues),
        this.db
          .prepare(`INSERT INTO entitlements (order_id, user_id, product_key, feature_key, granted_at)
          SELECT id, user_id, product_key, feature_key, ? FROM orders
          WHERE id = ? AND status = 'paid' AND ${eventIsNew}
          ON CONFLICT(order_id) DO NOTHING`)
          .bind(now, order.id, ...eventValues),
      );
    } else {
      statements.push(
        this.db
          .prepare(`UPDATE orders SET status = 'expired', updated_at = ?
          WHERE id = ? AND status = 'pending' AND ${eventIsNew}`)
          .bind(now, order.id, ...eventValues),
      );
    }
    statements.push(
      this.db
        .prepare(
          "UPDATE stripe_events SET processed_at = ? WHERE id = ? AND stripe_mode = ? AND order_id = ? AND processed_at IS NULL",
        )
        .bind(now, ...eventValues),
    );
    // D1 batch is a transaction: a failed grant/revoke does not consume the event.
    await this.db.batch(statements);
  }

  async handleEvent(event: Stripe.Event): Promise<{ received: true; ignored?: true }> {
    requireStripeMode(event.livemode, this.config.mode);
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
      const eventSession = event.data.object as Stripe.Checkout.Session;
      if (eventSession.metadata?.app_key !== APPLICATION_KEY)
        return { received: true, ignored: true };
      const order = await this.getOrder(eventSession.metadata.order_id ?? "");
      requireStripeMode(eventSession.livemode, this.config.mode);
      if (!validMetadata(eventSession.metadata, order, this.config.mode)) throw invalidPayment();
      if (event.type === "checkout.session.expired") {
        const current = await this.stripe.checkout.sessions.retrieve(eventSession.id);
        requirePaymentSession(current, order, this.config.mode);
        if (current.status === "expired")
          await this.applyEvent(event, order, "expired", current.id, null);
      } else {
        const payment = await this.loadPayment(eventSession.id, order);
        if (payment.session.status !== "complete" || payment.session.payment_status !== "paid")
          throw invalidPayment();
        await this.applyEvent(
          event,
          order,
          payment.fullyRefunded ? "refunded" : "paid",
          payment.session.id,
          payment.paymentIntentId,
        );
      }
      return { received: true };
    }
    if (
      event.type === "charge.refunded" ||
      event.type === "refund.created" ||
      event.type === "refund.updated"
    ) {
      const object = event.data.object as Stripe.Charge | Stripe.Refund;
      const intentId = objectId(object.payment_intent);
      if (!intentId) return { received: true, ignored: true };
      const intent = await this.stripe.paymentIntents.retrieve(intentId);
      requireStripeMode(intent.livemode, this.config.mode);
      if (intent.metadata.app_key !== APPLICATION_KEY) return { received: true, ignored: true };
      const order = await this.getOrder(intent.metadata.order_id ?? "");
      let sessionId = order.checkout_session_id;
      if (!sessionId) {
        const sessions = await this.stripe.checkout.sessions.list({
          payment_intent: intentId,
          limit: 2,
        });
        if (sessions.has_more || sessions.data.length !== 1) throw invalidPayment();
        sessionId = sessions.data[0]!.id;
      }
      const payment = await this.loadPayment(sessionId, order);
      if (payment.paymentIntentId !== intentId) throw invalidPayment();
      // Partial/pending/failed refunds do not remove a fully paid entitlement.
      if (payment.fullyRefunded)
        await this.applyEvent(event, order, "refunded", sessionId, intentId);
      return { received: true };
    }
    return { received: true, ignored: true };
  }
}
