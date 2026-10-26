import "server-only";
import { ApiError } from "./http";
import {
  HEADSHOT_PRICE,
  HEADSHOT_PRODUCT_KEY,
  LOOM_PRO_PRICE,
  LOOM_PRO_PRODUCT_KEY,
  type CreemBillingConfig,
} from "./creem-types";

export function getCreemProductDefinition(config: CreemBillingConfig, key: string) {
  if (key === HEADSHOT_PRODUCT_KEY) {
    return { key: HEADSHOT_PRODUCT_KEY, id: config.productId, price: HEADSHOT_PRICE };
  }
  if (key !== LOOM_PRO_PRODUCT_KEY) {
    throw new ApiError(400, "invalid_json", "不支持此购买商品。");
  }
  if (!config.proProductId) {
    throw new ApiError(503, "billing_not_configured", "Loom Pro 的 Creem 测试商品尚未配置。");
  }
  if (config.proProductId === config.productId) {
    throw new ApiError(503, "invalid_price_configuration", "不同商品不能共用同一个 Creem 商品。");
  }
  return { key: LOOM_PRO_PRODUCT_KEY, id: config.proProductId, price: LOOM_PRO_PRICE };
}
