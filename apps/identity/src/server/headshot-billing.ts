import "server-only";
import { getEnv } from "./env";
import { getDatabase } from "./db";
import { ApiError } from "./http";
import { getCreemBillingConfig } from "./creem-config";
import { createCreemGateway } from "./creem-gateway";
import { CreemBillingService } from "./creem-billing-service";
import {
  getCreemOrderForUser,
  listCreemOrdersForUser,
  listHeadshotPacksForUser,
} from "./creem-repository";
import { HEADSHOT_PRICE, HEADSHOT_PHOTO_COUNT, HEADSHOT_REDO_COUNT } from "./creem-types";
import { MAX_CREEM_WEBHOOK_BYTES, verifyCreemWebhook } from "./creem-webhook";

export function getHeadshotProduct() {
  return {
    name: "Loom Professional Headshot Pack",
    amount: HEADSHOT_PRICE,
    currency: "usd" as const,
    mode: "test" as const,
    photoCount: HEADSHOT_PHOTO_COUNT,
    redoCount: HEADSHOT_REDO_COUNT,
  };
}

export async function getHeadshotSummary(userId?: string) {
  getCreemBillingConfig(await getEnv());
  if (!userId) return { product: getHeadshotProduct(), orders: [], packs: [] };
  const db = await getDatabase();
  const [orders, packs] = await Promise.all([
    listCreemOrdersForUser(db, userId),
    listHeadshotPacksForUser(db, userId),
  ]);
  return { product: getHeadshotProduct(), orders, packs };
}

export async function createHeadshotCheckout(
  user: { id: string },
  requestId: string,
  locale: "en" | "zh",
) {
  const config = getCreemBillingConfig(await getEnv());
  return new CreemBillingService(
    await getDatabase(),
    createCreemGateway(config.apiKey),
    config,
  ).createCheckout(user, requestId, locale);
}

export async function getHeadshotOrder(id: string, userId: string) {
  getCreemBillingConfig(await getEnv());
  return getCreemOrderForUser(await getDatabase(), id, userId);
}

async function readWebhookBody(request: Request) {
  const tooLarge = () => new ApiError(413, "webhook_too_large", "Webhook 超过大小限制。");
  if (Number(request.headers.get("content-length")) > MAX_CREEM_WEBHOOK_BYTES) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CREEM_WEBHOOK_BYTES) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ApiError(400, "invalid_json", "Webhook 必须为有效的 UTF-8 JSON。");
  }
}

export async function handleCreemWebhook(request: Request) {
  const config = getCreemBillingConfig(await getEnv());
  const rawBody = await readWebhookBody(request);
  const event = await verifyCreemWebhook(rawBody, request.headers, config.webhookSecret);
  return new CreemBillingService(
    await getDatabase(),
    createCreemGateway(config.apiKey),
    config,
  ).handleEvent(event);
}
