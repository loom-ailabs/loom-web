import type { Locale } from "@hotkey-tools/i18n";
import { readResponse } from "@/shared/api";
import type { HeadshotAccount, HeadshotCheckout, HeadshotOrder } from "../model/types";

export async function fetchHeadshotAccount(signal?: AbortSignal) {
  return readResponse<HeadshotAccount>(
    await fetch("/api/headshot_packs", { cache: "no-store", signal }),
  );
}

export async function fetchHeadshotOrder(orderId: string, signal?: AbortSignal) {
  const data = await readResponse<{ order: HeadshotOrder }>(
    await fetch(`/api/headshot_orders/${encodeURIComponent(orderId)}`, {
      cache: "no-store",
      signal,
    }),
  );
  return data.order;
}

export async function createHeadshotCheckout(requestId: string, locale: Locale) {
  return readResponse<HeadshotCheckout>(
    await fetch("/api/headshot_checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, locale }),
    }),
  );
}
