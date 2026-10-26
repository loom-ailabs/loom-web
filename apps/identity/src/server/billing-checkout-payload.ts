import "server-only";
import type Stripe from "stripe";
import { ApiError } from "./http";
import type { OrderRow } from "./billing-types";
import { metadataFor } from "./billing-validation";

export function requireCheckoutPayloadVersion(order: OrderRow, status = 400): 1 | 2 {
  const version = order.checkout_payload_version;
  if (version === 2 || (version === 1 && order.stripe_mode === "test")) return version;
  throw new ApiError(status, "billing_mode_mismatch", "订单支付格式与当前支付模式不兼容。");
}

/** A stored order's payload must stay stable for Stripe's idempotency comparison. */
export function checkoutPayload(
  order: OrderRow,
  appUrl: string,
): Stripe.Checkout.SessionCreateParams {
  const version = requireCheckoutPayloadVersion(order);
  const metadata = metadataFor(order);
  if (version === 1) delete metadata.stripe_mode;
  return {
    mode: "payment",
    ...(version === 2 ? { currency: order.currency } : {}),
    allowed_payment_method_types: ["card"],
    adaptive_pricing: { enabled: false },
    automatic_tax: { enabled: false },
    allow_promotion_codes: false,
    line_items: [{ price: order.stripe_price_id, quantity: 1 }],
    client_reference_id: order.id,
    metadata,
    payment_intent_data: { metadata: { ...metadata } },
    success_url: `${appUrl}/?checkout=success&order_id=${order.id}`,
    cancel_url: `${appUrl}/?checkout=cancelled&order_id=${order.id}`,
  };
}
