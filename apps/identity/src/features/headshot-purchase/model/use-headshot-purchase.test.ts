// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { NextIntlClientProvider } from "@loom-ai/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/shared/api";
import en from "../../../../../../packages/i18n/messages/en/headshots.json";
import zh from "../../../../../../packages/i18n/messages/zh/headshots.json";
import type { HeadshotAccount } from "./types";

const api = vi.hoisted(() => ({
  fetchHeadshotAccount: vi.fn(),
  fetchHeadshotOrder: vi.fn(),
  createHeadshotCheckout: vi.fn(),
}));
vi.mock("../api/headshot-api", () => api);
import { useHeadshotPurchase } from "./use-headshot-purchase";

const account: HeadshotAccount = {
  product: {
    name: "Loom Professional Headshot Pack",
    amount: 999,
    currency: "usd",
    mode: "test",
    photoCount: 4,
    redoCount: 1,
  },
  user: { id: "user-1", name: "Loom user" },
  orders: [],
  packs: [],
};

function renderPurchase(locale: "en" | "zh" = "en") {
  return renderHook(() => useHeadshotPurchase(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(NextIntlClientProvider, {
        locale,
        messages: { Headshots: locale === "en" ? en : zh },
        timeZone: "UTC",
        children,
      }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, "", "/headshots");
  api.fetchHeadshotAccount.mockResolvedValue(account);
});

afterEach(() => cleanup());

describe("headshot package purchases", () => {
  it("preserves the purchase UUID and locale across uncertain retries", async () => {
    api.createHeadshotCheckout.mockRejectedValue(new Error("provider detail"));
    const { result } = renderPurchase("zh");
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.purchase();
      await result.current.purchase();
    });
    expect(api.createHeadshotCheckout).toHaveBeenCalledTimes(2);
    const initial = api.createHeadshotCheckout.mock.calls[0];
    expect(initial?.[0]).toMatch(/^[\da-f-]{36}$/i);
    expect(api.createHeadshotCheckout.mock.calls[1]).toEqual(initial);
    expect(initial?.[1]).toBe("zh");
    expect(result.current.failure).toBe(zh.errors.purchase);
  });

  it("allows another independent purchase after a confirmed purchase", async () => {
    api.createHeadshotCheckout.mockResolvedValue({ orderId: "order-1", status: "paid" });
    const { result } = renderPurchase();
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.purchase();
      await result.current.purchase();
    });
    expect(api.createHeadshotCheckout).toHaveBeenCalledTimes(2);
    expect(api.createHeadshotCheckout.mock.calls[1]?.[0]).not.toBe(
      api.createHeadshotCheckout.mock.calls[0]?.[0],
    );
    expect(result.current.notice).toBe(en.notices.paid);
  });

  it("starts a new attempt only after the server closes the old attempt", async () => {
    api.createHeadshotCheckout.mockRejectedValue(
      new ApiRequestError("raw provider text", 409, 3005, "checkout_closed"),
    );
    const { result } = renderPurchase();
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.purchase();
      await result.current.purchase();
    });
    expect(api.createHeadshotCheckout.mock.calls[1]?.[0]).not.toBe(
      api.createHeadshotCheckout.mock.calls[0]?.[0],
    );
    expect(result.current.failure).toBe(en.errors.closed);
  });

  it("does not treat a success URL or a Creem order_id as package ownership", async () => {
    window.history.replaceState({}, "", "/headshots?checkout=success&order_id=provider-order");
    const { result } = renderPurchase();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.fetchHeadshotOrder).not.toHaveBeenCalled();
    expect(result.current.account?.packs).toEqual([]);
    expect(result.current.notice).toBeNull();
  });

  it("rejects a forged local purchase return without showing granted rights", async () => {
    window.history.replaceState({}, "", "/headshots?checkout=success&purchase_id=other-user-order");
    api.fetchHeadshotOrder.mockRejectedValue(
      new ApiRequestError("untrusted text", 404, 3001, "order_not_found"),
    );
    const { result } = renderPurchase();
    await waitFor(() => expect(result.current.failure).toBe(en.errors.order));
    expect(result.current.account?.packs).toEqual([]);
    expect(result.current.notice).toBeNull();
  });

  it.each(["en", "zh"] as const)(
    "checks server state and preserves the %s route after paid confirmation",
    async (locale) => {
      const path = locale === "zh" ? "/zh/headshots" : "/headshots";
      window.history.replaceState(
        {},
        "",
        `${path}?checkout=success&purchase_id=local-order&order_id=provider-order`,
      );
      api.fetchHeadshotOrder.mockResolvedValue({ status: "paid" });
      api.fetchHeadshotAccount.mockResolvedValue({
        ...account,
        packs: [
          { id: "pack-1", orderId: "local-order", photoCount: 4, redoCount: 1, status: "active" },
        ],
      });
      const { result } = renderPurchase(locale);
      await waitFor(() =>
        expect(result.current.notice).toBe((locale === "en" ? en : zh).notices.paid),
      );
      expect(api.fetchHeadshotOrder).toHaveBeenCalledWith("local-order", expect.any(AbortSignal));
      expect(api.fetchHeadshotAccount).toHaveBeenCalledTimes(2);
      expect(result.current.account?.packs).toHaveLength(1);
      expect(window.location.pathname).toBe(path);
      expect(window.location.search).toBe("");
    },
  );

  it("restores a refunded order from the server without treating it as active", async () => {
    window.history.replaceState({}, "", "/headshots?checkout=success&purchase_id=local-order");
    api.fetchHeadshotOrder.mockResolvedValue({ status: "refunded" });
    api.fetchHeadshotAccount.mockResolvedValue({
      ...account,
      packs: [
        {
          id: "pack-1",
          orderId: "local-order",
          photoCount: 4,
          redoCount: 1,
          status: "revoked",
          revokedAt: 10,
        },
      ],
    });
    const { result } = renderPurchase();
    await waitFor(() => expect(result.current.notice).toBe(en.notices.refunded));
    expect(result.current.account?.packs[0]?.status).toBe("revoked");
  });

  it("keeps confirmed package rights when an older account read finishes late", async () => {
    window.history.replaceState({}, "", "/headshots?checkout=success&purchase_id=local-order");
    let finishInitialRead!: (value: HeadshotAccount) => void;
    api.fetchHeadshotAccount
      .mockImplementationOnce(
        () => new Promise<HeadshotAccount>((resolve) => (finishInitialRead = resolve)),
      )
      .mockResolvedValueOnce({
        ...account,
        packs: [
          {
            id: "pack-1",
            orderId: "local-order",
            photoCount: 4,
            redoCount: 1,
            status: "active",
          },
        ],
      });
    api.fetchHeadshotOrder.mockResolvedValue({ status: "paid" });
    const { result } = renderPurchase();
    await waitFor(() => expect(result.current.notice).toBe(en.notices.paid));
    await act(async () => finishInitialRead(account));
    expect(result.current.account?.packs).toHaveLength(1);
  });

  it.each(["en", "zh"] as const)(
    "uses stable error codes and safe localized copy in %s",
    async (locale) => {
      api.fetchHeadshotAccount.mockRejectedValue(
        new ApiRequestError("private provider payload", 503, 1003, "unknown_future_type"),
      );
      const { result } = renderPurchase(locale);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.failure).toBe((locale === "en" ? en : zh).errors.configuration);
    },
  );
});
