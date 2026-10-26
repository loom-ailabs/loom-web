import "server-only";
import { ApiError } from "./http";
import {
  HEADSHOT_PRODUCT_KEY,
  type CreemOrderRow,
  type CreemProductKey,
  type HeadshotOrder,
  type HeadshotPack,
} from "./creem-types";

function presentOrder(order: CreemOrderRow): HeadshotOrder {
  return {
    id: order.id,
    productKey: order.product_key,
    status: order.status,
    amount: order.amount,
    currency: "usd",
    mode: "test",
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    paidAt: order.paid_at,
    refundedAt: order.refunded_at,
  };
}

export async function getCreemOrderForUser(db: D1Database, id: string, userId: string) {
  const order = await db
    .prepare("SELECT * FROM creem_orders WHERE id = ? AND user_id = ? AND mode = 'test'")
    .bind(id, userId)
    .first<CreemOrderRow>();
  if (!order) throw new ApiError(404, "order_not_found", "未找到此购买订单。");
  return presentOrder(order);
}

export async function listCreemOrdersForUser(
  db: D1Database,
  userId: string,
  productKey: CreemProductKey = HEADSHOT_PRODUCT_KEY,
) {
  const { results } = await db
    .prepare(
      "SELECT * FROM creem_orders WHERE user_id = ? AND product_key = ? AND mode = 'test' ORDER BY created_at DESC LIMIT 50",
    )
    .bind(userId, productKey)
    .all<CreemOrderRow>();
  return results.map(presentOrder);
}

type PackRow = {
  id: string;
  order_id: string;
  photo_count: number;
  redo_count: number;
  granted_at: number;
  revoked_at: number | null;
};

export async function listHeadshotPacksForUser(
  db: D1Database,
  userId: string,
): Promise<HeadshotPack[]> {
  const { results } = await db
    .prepare(`SELECT p.id, p.order_id, p.photo_count, p.redo_count, p.granted_at,
        CASE WHEN o.status = 'paid' AND p.revoked_at IS NULL THEN NULL
          ELSE COALESCE(p.revoked_at, o.refunded_at, o.updated_at) END AS revoked_at
      FROM headshot_packs p
      JOIN creem_orders o ON o.id = p.order_id AND o.user_id = p.user_id
      WHERE p.user_id = ? AND o.mode = 'test' AND o.product_key = 'professional_headshots'
        AND o.amount = 999 AND o.currency = 'USD' AND o.status IN ('paid', 'refunded')
      ORDER BY p.granted_at DESC LIMIT 50`)
    .bind(userId)
    .all<PackRow>();
  return results.map((pack) => ({
    id: pack.id,
    orderId: pack.order_id,
    photoCount: pack.photo_count,
    redoCount: pack.redo_count,
    grantedAt: pack.granted_at,
    revokedAt: pack.revoked_at,
    status: pack.revoked_at === null ? "active" : "revoked",
  }));
}
