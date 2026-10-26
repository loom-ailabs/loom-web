import { readResponse } from "@/shared/api";
import type { Locale } from "@hotkey-tools/i18n";
import type { Checkout, Order, Profile } from "../model/types";

export async function fetchProfile(signal?: AbortSignal) {
  return readResponse<Profile>(await fetch("/api/me", { cache: "no-store", signal }));
}

export async function fetchOrder(orderId: string, signal?: AbortSignal) {
  const result = await readResponse<{ order: Order }>(
    await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: "no-store", signal }),
  );
  return result.order;
}

export async function createCheckout(requestId: string, locale: Locale) {
  return readResponse<Checkout>(
    await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, locale }),
    }),
  );
}

export async function fetchPremium() {
  return readResponse<{ message?: string }>(await fetch("/api/premium", { cache: "no-store" }));
}
