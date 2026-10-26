import "server-only";
import { verifyWebhookSignature } from "creem/webhooks";
import { ApiError } from "./http";
import type { CreemWebhookEvent } from "./creem-types";

export const MAX_CREEM_WEBHOOK_BYTES = 1_048_576;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function verifyCreemWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
): Promise<CreemWebhookEvent> {
  if (new TextEncoder().encode(rawBody).byteLength > MAX_CREEM_WEBHOOK_BYTES) {
    throw new ApiError(413, "webhook_too_large", "Webhook 超过大小限制。");
  }
  if (
    !headers.has("creem-signature") &&
    !headers.has("x-creem-signature") &&
    !headers.has("webhook-signature")
  ) {
    throw new ApiError(400, "missing_webhook_signature", "缺少 Creem webhook 签名。");
  }
  try {
    await verifyWebhookSignature(rawBody, headers, { secret });
  } catch {
    throw new ApiError(400, "invalid_webhook_signature", "Creem webhook 签名无效。");
  }
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new ApiError(400, "invalid_json", "Webhook JSON 无效。");
  }
  if (
    !isRecord(event) ||
    typeof event.id !== "string" ||
    !event.id ||
    event.id.length > 255 ||
    typeof event.eventType !== "string" ||
    !event.eventType ||
    !isRecord(event.object)
  ) {
    throw new ApiError(400, "payment_mismatch", "Creem webhook 格式无效。");
  }
  return { id: event.id, eventType: event.eventType, object: event.object };
}
