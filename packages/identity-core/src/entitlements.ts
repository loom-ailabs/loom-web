import "server-only";
import type { StripeMode } from "./billing-types";

export const PRODUCT_KEY = "hotkey-tools";
export const FEATURE_KEY = "premium-demo";
export async function hasPremiumInDatabase(
  db: D1Database,
  userId: string,
  mode: StripeMode = "test",
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT e.order_id FROM entitlements e
 JOIN orders o ON o.id = e.order_id
   AND o.user_id = e.user_id AND o.product_key = e.product_key AND o.feature_key = e.feature_key
 WHERE e.user_id = ? AND e.product_key = ? AND e.feature_key = ? AND e.revoked_at IS NULL
   AND o.status = 'paid' AND o.stripe_mode = ?
   AND (o.checkout_payload_version = 2
     OR (o.stripe_mode = 'test' AND o.checkout_payload_version = 1))
 UNION ALL
 SELECT p.order_id FROM creem_pro_entitlements p
 JOIN creem_orders o ON o.id = p.order_id AND o.user_id = p.user_id
 WHERE p.user_id = ? AND p.revoked_at IS NULL AND o.status = 'paid'
   AND o.mode = ? AND o.product_key = 'loom_pro'
   AND o.amount = 100 AND o.currency = 'USD'
 LIMIT 1`)
    .bind(userId, PRODUCT_KEY, FEATURE_KEY, mode, userId, mode)
    .first<{ order_id: string }>();
  return row !== null;
}
