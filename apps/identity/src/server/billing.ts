import "server-only";
import Stripe from "stripe";
import { parseCreemMode, parseStripeMode } from "@hotkey-tools/identity-core/billing-mode";
import { hasPremiumInDatabase } from "@hotkey-tools/identity-core/entitlements";
import { getDatabase } from "./db";
import { getEnv } from "./env";
import { ApiError } from "./http";
import { createStripeClient, getBillingConfig } from "./billing-config";
import { BillingService } from "./billing-service";
import { requireCheckoutPayloadVersion } from "./billing-checkout-payload";
import type { CheckoutUser, OrderRow } from "./billing-types";

export { PRODUCT_KEY, FEATURE_KEY } from "@hotkey-tools/identity-core/entitlements";
export { BillingService } from "./billing-service";
export { createStripeClient, getBillingConfig } from "./billing-config";
export type { OrderRow } from "./billing-types";
const MAX_WEBHOOK_BYTES = 1_048_576;

export async function hasPremium(userId: string): Promise<boolean> {
  const db = await getDatabase();
  return hasPremiumInDatabase(db, userId, parseCreemMode((await getEnv()).CREEM_MODE));
}

export async function getOrderForUser(id: string, userId: string) {
  const db = await getDatabase();
  const mode = parseStripeMode((await getEnv()).STRIPE_MODE);
  const order = await db
    .prepare("SELECT * FROM orders WHERE id = ? AND user_id = ? AND stripe_mode = ?")
    .bind(id, userId, mode)
    .first<OrderRow>();
  if (!order) throw new ApiError(404, "order_not_found", "未找到此订单。");
  requireCheckoutPayloadVersion(order);
  return {
    id: order.id,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

export async function createCheckout(user: CheckoutUser, requestId: string) {
  const config = getBillingConfig(await getEnv());
  return new BillingService(
    await getDatabase(),
    createStripeClient(config.secretKey),
    config,
  ).createCheckout(user, requestId);
}

export async function verifyStripeEvent(
  rawBody: string,
  signature: string,
  stripe: Stripe,
  secret: string,
) {
  try {
    return await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    throw new ApiError(400, "invalid_webhook_signature", "Stripe webhook 签名无效。");
  }
}

export async function handleStripeWebhook(request: Request) {
  const config = getBillingConfig(await getEnv());
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    throw new ApiError(400, "missing_webhook_signature", "缺少 Stripe webhook 签名。");
  if (Number(request.headers.get("content-length")) > MAX_WEBHOOK_BYTES)
    throw new ApiError(413, "webhook_too_large", "Webhook 超过大小限制。");
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES)
    throw new ApiError(413, "webhook_too_large", "Webhook 超过大小限制。");
  const stripe = createStripeClient(config.secretKey);
  const event = await verifyStripeEvent(rawBody, signature, stripe, config.webhookSecret);
  return new BillingService(await getDatabase(), stripe, config).handleEvent(event);
}
