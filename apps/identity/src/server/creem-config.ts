import "server-only";
import { parseCreemMode } from "@hotkey-tools/identity-core/billing-mode";
import { ApiError } from "./http";
import type { CreemBillingConfig } from "./creem-types";

type CreemEnvironment = {
  APP_URL?: string;
  CREEM_MODE?: string;
  CREEM_API_KEY?: string;
  CREEM_WEBHOOK_SECRET?: string;
  CREEM_PRODUCT_ID?: string;
  CREEM_PRO_PRODUCT_ID?: string;
};

export function getCreemBillingConfig(env: CreemEnvironment): CreemBillingConfig {
  const mode = parseCreemMode(env.CREEM_MODE);
  const { APP_URL, CREEM_API_KEY, CREEM_WEBHOOK_SECRET, CREEM_PRODUCT_ID } = env;
  if (!APP_URL || !CREEM_API_KEY || !CREEM_WEBHOOK_SECRET || !CREEM_PRODUCT_ID) {
    throw new ApiError(503, "billing_not_configured", "Creem 测试支付尚未配置完整。");
  }
  if (!CREEM_API_KEY.startsWith("creem_test_")) {
    throw new ApiError(503, "billing_mode_mismatch", "Creem 密钥必须属于测试环境。");
  }
  if (!/^prod_[A-Za-z0-9]+$/.test(CREEM_PRODUCT_ID)) {
    throw new ApiError(503, "invalid_price_configuration", "Creem 测试商品配置无效。");
  }
  if (
    env.CREEM_PRO_PRODUCT_ID !== undefined &&
    !/^prod_[A-Za-z0-9]+$/.test(env.CREEM_PRO_PRODUCT_ID)
  ) {
    throw new ApiError(503, "invalid_price_configuration", "Loom Pro 的 Creem 测试商品配置无效。");
  }
  let url: URL;
  try {
    url = new URL(APP_URL);
  } catch {
    throw new ApiError(503, "invalid_app_url", "应用访问地址尚未正确配置。");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username ||
    url.password
  ) {
    throw new ApiError(503, "invalid_app_url", "应用访问地址必须使用 HTTPS。");
  }
  return {
    mode,
    appUrl: url.origin,
    productId: CREEM_PRODUCT_ID,
    ...(env.CREEM_PRO_PRODUCT_ID ? { proProductId: env.CREEM_PRO_PRODUCT_ID } : {}),
    apiKey: CREEM_API_KEY,
    webhookSecret: CREEM_WEBHOOK_SECRET,
  };
}
