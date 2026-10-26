import type { StripeMode } from "@loom-ai/identity-core/billing-mode";

export type CheckoutUser = { id: string; email?: string; name?: string };
export type OrderStatus = "pending" | "paid" | "refunded" | "expired";
export type OrderRow = {
  id: string;
  user_id: string;
  request_id: string;
  product_key: string;
  feature_key: string;
  stripe_price_id: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  stripe_mode: StripeMode;
  checkout_payload_version: number;
  checkout_session_id: string | null;
  checkout_url: string | null;
  payment_intent_id: string | null;
  created_at: number;
  updated_at: number;
  paid_at: number | null;
  refunded_at: number | null;
};

export type BillingConfig = {
  mode: StripeMode;
  appUrl: string;
  secretKey: string;
  webhookSecret: string;
  priceId: string;
};
