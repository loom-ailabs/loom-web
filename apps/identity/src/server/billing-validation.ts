import "server-only";
import type Stripe from "stripe";
import type { StripeMode } from "@hotkey-tools/identity-core/billing-mode";
import { ApiError } from "./http";
import type { OrderRow } from "./billing-types";

export const APPLICATION_KEY = "hotkey-tools-identity";

export function objectId(value: { id: string } | string | null): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

export function metadataFor(order: OrderRow): Record<string, string> {
  return {
    app_key: APPLICATION_KEY,
    stripe_mode: order.stripe_mode,
    order_id: order.id,
    user_id: order.user_id,
    product_key: order.product_key,
    feature_key: order.feature_key,
  };
}

export function validMetadata(
  metadata: Stripe.Metadata | null,
  order: OrderRow,
  mode: StripeMode,
): boolean {
  const expected = metadataFor(order);
  return Object.entries(expected).every(([key, value]) => {
    if (
      key === "stripe_mode" &&
      mode === "test" &&
      order.stripe_mode === "test" &&
      order.checkout_payload_version === 1 &&
      metadata?.[key] === undefined
    )
      return true;
    return metadata?.[key] === value;
  });
}

export function requireStripeMode(livemode: unknown, mode: StripeMode, status = 400) {
  if (livemode !== (mode === "live"))
    throw new ApiError(status, "billing_mode_mismatch", "支付对象与配置的支付模式不一致。");
}

export function requirePaymentSession(
  session: Stripe.Checkout.Session,
  order: OrderRow,
  mode: StripeMode,
) {
  requireStripeMode(session.livemode, mode);
  if (
    session.mode !== "payment" ||
    session.client_reference_id !== order.id ||
    !validMetadata(session.metadata, order, mode) ||
    (order.checkout_session_id !== null && order.checkout_session_id !== session.id) ||
    session.amount_total !== order.amount ||
    session.currency !== order.currency
  )
    throw invalidPayment();
}

export function invalidPayment(message = "Stripe 支付信息与本地订单不一致。") {
  return new ApiError(400, "payment_mismatch", message);
}
