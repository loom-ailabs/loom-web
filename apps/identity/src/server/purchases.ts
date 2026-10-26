import "server-only";
import { hasPremiumInDatabase } from "@loom-ai/identity-core/entitlements";
import { parseCreemMode } from "@loom-ai/identity-core/billing-mode";
import { getDatabase } from "./db";
import { getEnv } from "./env";
import { ApiError } from "./http";
import { getCreemBillingConfig } from "./creem-config";
import { createCreemGateway } from "./creem-gateway";
import { CreemBillingService } from "./creem-billing-service";
import { getCreemOrderForUser } from "./creem-repository";
import { LOOM_PRO_PRODUCT_KEY } from "./creem-types";
import { getOrderForUser as getHistoricalStripeOrder } from "./billing";

export async function createPurchaseCheckout(
  user: { id: string },
  requestId: string,
  locale: "en" | "zh",
) {
  const config = getCreemBillingConfig(await getEnv());
  const db = await getDatabase();
  const existing = await db
    .prepare("SELECT id FROM creem_orders WHERE user_id = ? AND request_id = ? AND product_key = ?")
    .bind(user.id, requestId, LOOM_PRO_PRODUCT_KEY)
    .first<{ id: string }>();
  if (!existing && (await hasPremiumInDatabase(db, user.id, config.mode))) {
    throw new ApiError(409, "already_unlocked", "Loom Pro 已向此账号开放。");
  }
  return new CreemBillingService(db, createCreemGateway(config.apiKey), config).createCheckout(
    user,
    requestId,
    locale,
    LOOM_PRO_PRODUCT_KEY,
  );
}

export async function getPurchaseOrderForUser(id: string, userId: string) {
  parseCreemMode((await getEnv()).CREEM_MODE);
  const db = await getDatabase();
  const current = await db
    .prepare(
      "SELECT id FROM creem_orders WHERE id = ? AND user_id = ? AND product_key = ? AND mode = 'test'",
    )
    .bind(id, userId, LOOM_PRO_PRODUCT_KEY)
    .first<{ id: string }>();
  if (current) return getCreemOrderForUser(db, id, userId);
  return getHistoricalStripeOrder(id, userId);
}
