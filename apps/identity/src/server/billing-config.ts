import "server-only";
import Stripe from "stripe";
import { parseStripeMode } from "@hotkey-tools/identity-core/billing-mode";
import type { IdentityEnv } from "./env";
import { ApiError } from "./http";
import type { BillingConfig } from "./billing-types";

export function getBillingConfig(env: IdentityEnv): BillingConfig {
  const mode = parseStripeMode(env.STRIPE_MODE);
  const { APP_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID } = env;
  if (!APP_URL || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !STRIPE_PRICE_ID) {
    throw new ApiError(503, "billing_not_configured", "支付服务尚未配置完整。");
  }
  if (!STRIPE_SECRET_KEY.startsWith(`sk_${mode}_`)) {
    throw new ApiError(503, "billing_mode_mismatch", "支付密钥与配置的支付模式不一致。");
  }
  if (!STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) {
    throw new ApiError(503, "billing_not_configured", "支付回调密钥配置无效。");
  }
  if (!STRIPE_PRICE_ID.startsWith("price_")) {
    throw new ApiError(503, "invalid_price_configuration", "请配置当前支付模式的单次固定价格。");
  }
  return {
    mode,
    appUrl: new URL(APP_URL).origin,
    secretKey: STRIPE_SECRET_KEY,
    webhookSecret: STRIPE_WEBHOOK_SECRET,
    priceId: STRIPE_PRICE_ID,
  };
}

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 15_000,
  });
}
