import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const db = { prepare: vi.fn() };
  const gateway = { getProduct: vi.fn() };
  const checkout = vi.fn(
    async (_user: { id: string }, _requestId: string, _locale: "en" | "zh") => ({
      orderId: "order-1",
      checkoutUrl: "https://www.creem.io/test/payment/checkout-1",
      status: "pending",
    }),
  );
  const handleEvent = vi.fn(async (_event: unknown) => ({ received: true }));
  return {
    db,
    gateway,
    checkout,
    handleEvent,
    getEnv: vi.fn<() => Promise<Record<string, string | undefined>>>(),
    getDatabase: vi.fn(async () => db),
    createGateway: vi.fn((_key: string) => gateway),
    service: vi.fn(function (_db: unknown, _gateway: unknown, _config: unknown) {
      return { createCheckout: checkout, handleEvent };
    }),
    getOrder: vi.fn(async (_db: unknown, _id: string, _userId: string) => ({
      id: "order-1",
      status: "paid",
    })),
    listOrders: vi.fn(async (_db: unknown, _userId: string) => [{ id: "order-1" }]),
    listPacks: vi.fn(async (_db: unknown, _userId: string) => [{ id: "pack-1" }]),
  };
});

vi.mock("./env", () => ({ getEnv: mocks.getEnv }));
vi.mock("./db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("./creem-gateway", () => ({ createCreemGateway: mocks.createGateway }));
vi.mock("./creem-billing-service", () => ({ CreemBillingService: mocks.service }));
vi.mock("./creem-repository", () => ({
  getCreemOrderForUser: mocks.getOrder,
  listCreemOrdersForUser: mocks.listOrders,
  listHeadshotPacksForUser: mocks.listPacks,
}));

import { ApiError } from "./http";
import {
  createHeadshotCheckout,
  getHeadshotOrder,
  getHeadshotProduct,
  getHeadshotSummary,
  handleCreemWebhook,
} from "./headshot-billing";
import { MAX_CREEM_WEBHOOK_BYTES } from "./creem-webhook";

const appUrl = "https://checkout.loom-labs.ai";
const webhookSecret = "offline-fixture-webhook-secret";
const environment = {
  APP_URL: appUrl,
  CREEM_MODE: "test",
  CREEM_API_KEY: "creem_test_offline_fixture",
  CREEM_WEBHOOK_SECRET: webhookSecret,
  CREEM_PRODUCT_ID: "prod_headshots",
};
const event = {
  id: "evt_fixture",
  eventType: "checkout.completed",
  object: { id: "ch_fixture", mode: "test", metadata: { order_id: "order-1" } },
};
const rawBody = JSON.stringify(event, null, 2);
const signatureFor = (body: string) =>
  createHmac("sha256", webhookSecret).update(body).digest("hex");

function webhookRequest(body: string = rawBody, headers: Record<string, string> = {}) {
  return new Request(`${appUrl}/api/webhooks/creem`, {
    method: "POST",
    headers: { "creem-signature": signatureFor(body), ...headers },
    body,
  });
}

function streamedRequest(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  const cancel = vi.fn();
  let next = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next < chunks.length) controller.enqueue(chunks[next++]!);
      else controller.close();
    },
    cancel,
  });
  const request = new Request(`${appUrl}/api/webhooks/creem`, {
    method: "POST",
    headers,
    body: stream,
    duplex: "half",
  } as RequestInit);
  return { request, stream, cancel };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEnv.mockResolvedValue({ ...environment });
  mocks.getDatabase.mockResolvedValue(mocks.db);
  mocks.checkout.mockResolvedValue({
    orderId: "order-1",
    checkoutUrl: "https://www.creem.io/test/payment/checkout-1",
    status: "pending",
  });
  mocks.handleEvent.mockResolvedValue({ received: true });
  mocks.getOrder.mockResolvedValue({ id: "order-1", status: "paid" });
  mocks.listOrders.mockResolvedValue([{ id: "order-1" }]);
  mocks.listPacks.mockResolvedValue([{ id: "pack-1" }]);
});
afterEach(() => vi.restoreAllMocks());

describe("headshot runtime configuration and owner boundary", () => {
  it("publishes the fixed test product without exposing provider identifiers or credentials", () => {
    expect(getHeadshotProduct()).toEqual({
      name: "Loom Professional Headshot Pack",
      amount: 999,
      currency: "usd",
      mode: "test",
      photoCount: 4,
      redoCount: 1,
    });
  });

  it("returns the anonymous product without reading private orders or creating a provider client", async () => {
    expect(await getHeadshotSummary()).toEqual({
      product: getHeadshotProduct(),
      orders: [],
      packs: [],
    });
    expect(mocks.getEnv).toHaveBeenCalledOnce();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.listOrders).not.toHaveBeenCalled();
    expect(mocks.listPacks).not.toHaveBeenCalled();
    expect(mocks.createGateway).not.toHaveBeenCalled();
  });

  it("loads only the authenticated owner's orders and packs from the request database", async () => {
    expect(await getHeadshotSummary("alice")).toEqual({
      product: getHeadshotProduct(),
      orders: [{ id: "order-1" }],
      packs: [{ id: "pack-1" }],
    });
    expect(mocks.listOrders).toHaveBeenCalledExactlyOnceWith(mocks.db, "alice");
    expect(mocks.listPacks).toHaveBeenCalledExactlyOnceWith(mocks.db, "alice");
  });

  it("never hides an order-storage failure behind an empty purchase history", async () => {
    const unavailable = new Error("Storage unavailable");
    mocks.listOrders.mockRejectedValueOnce(unavailable);
    await expect(getHeadshotSummary("alice")).rejects.toBe(unavailable);
  });

  it.each(["en", "zh"] as const)(
    "passes the verified owner, stable request and %s locale to billing",
    async (locale) => {
      const user = { id: "alice" };
      const requestId = "b7d53d2e-3411-419e-b1c8-4f0a2afc1411";
      expect(await createHeadshotCheckout(user, requestId, locale)).toMatchObject({
        orderId: "order-1",
      });
      expect(mocks.createGateway).toHaveBeenCalledExactlyOnceWith(environment.CREEM_API_KEY);
      expect(mocks.service).toHaveBeenCalledExactlyOnceWith(mocks.db, mocks.gateway, {
        mode: "test",
        appUrl,
        apiKey: environment.CREEM_API_KEY,
        webhookSecret,
        productId: environment.CREEM_PRODUCT_ID,
      });
      expect(mocks.checkout).toHaveBeenCalledExactlyOnceWith(user, requestId, locale);
    },
  );

  it("preserves the checkout service's stable refusal error", async () => {
    const uncertain = new ApiError(409, "checkout_unavailable", "支付状态待确认。");
    mocks.checkout.mockRejectedValueOnce(uncertain);
    await expect(createHeadshotCheckout({ id: "alice" }, "request", "en")).rejects.toBe(uncertain);
  });

  it("passes the order id together with the authenticated owner to the repository", async () => {
    expect(await getHeadshotOrder("order-1", "alice")).toEqual({ id: "order-1", status: "paid" });
    expect(mocks.getOrder).toHaveBeenCalledExactlyOnceWith(mocks.db, "order-1", "alice");
  });

  it("preserves the same not-found result for a missing or different-owner order", async () => {
    const absent = new ApiError(404, "order_not_found", "未找到订单。");
    mocks.getOrder.mockRejectedValueOnce(absent);
    await expect(getHeadshotOrder("bob-order", "alice")).rejects.toBe(absent);
    expect(mocks.getOrder).toHaveBeenCalledExactlyOnceWith(mocks.db, "bob-order", "alice");
  });

  it.each(["", " ", "live", "prod"])(
    "rejects explicit mode %j before any database/provider operation",
    async (mode) => {
      mocks.getEnv.mockResolvedValue({ ...environment, CREEM_MODE: mode });
      for (const operation of [
        () => getHeadshotSummary("alice"),
        () => getHeadshotOrder("order-1", "alice"),
        () => createHeadshotCheckout({ id: "alice" }, "request", "en"),
        () => handleCreemWebhook(webhookRequest()),
      ]) {
        await expect(operation()).rejects.toMatchObject({ status: 503, code: "sandbox_required" });
      }
      expect(mocks.getDatabase).not.toHaveBeenCalled();
      expect(mocks.createGateway).not.toHaveBeenCalled();
    },
  );

  it("does not let an anonymous product request mask incomplete payment configuration", async () => {
    mocks.getEnv.mockResolvedValue({ ...environment, CREEM_WEBHOOK_SECRET: undefined });
    await expect(getHeadshotSummary()).rejects.toMatchObject({
      status: 503,
      code: "billing_not_configured",
    });
  });
});

describe("Creem webhook request body boundary", () => {
  it("verifies the unchanged signed body and delegates only the verified event", async () => {
    expect(await handleCreemWebhook(webhookRequest())).toEqual({ received: true });
    expect(mocks.handleEvent).toHaveBeenCalledExactlyOnceWith(event);
    expect(mocks.service).toHaveBeenCalledOnce();
  });

  it("joins streamed chunks without corrupting a multibyte UTF-8 character or the signature", async () => {
    const withUnicode = { ...event, object: { ...event.object, note: "形象照" } };
    const json = JSON.stringify(withUnicode);
    const bytes = new TextEncoder().encode(json);
    const firstMultibyte = bytes.findIndex((value) => value > 127);
    const { request, stream } = streamedRequest(
      [
        bytes.slice(0, firstMultibyte + 1),
        bytes.slice(firstMultibyte + 1, firstMultibyte + 2),
        bytes.slice(firstMultibyte + 2),
      ],
      { "creem-signature": signatureFor(json), "content-length": "1" },
    );
    await handleCreemWebhook(request);
    expect(mocks.handleEvent).toHaveBeenCalledExactlyOnceWith(withUnicode);
    expect(stream.locked).toBe(false);
  });

  it("rejects a declared oversized body before reading or constructing the provider service", async () => {
    const request = webhookRequest(rawBody, {
      "content-length": String(MAX_CREEM_WEBHOOK_BYTES + 1),
    });
    await expect(handleCreemWebhook(request)).rejects.toMatchObject({
      status: 413,
      code: "webhook_too_large",
    });
    expect(request.bodyUsed).toBe(false);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("enforces the actual streamed byte limit even when Content-Length is omitted", async () => {
    const { request, cancel, stream } = streamedRequest([
      new Uint8Array(MAX_CREEM_WEBHOOK_BYTES),
      new Uint8Array(1),
      new Uint8Array(1),
    ]);
    await expect(handleCreemWebhook(request)).rejects.toMatchObject({
      status: 413,
      code: "webhook_too_large",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
    expect(mocks.handleEvent).not.toHaveBeenCalled();
  });

  it("allows a body exactly at the byte limit", async () => {
    const padded =
      rawBody + " ".repeat(MAX_CREEM_WEBHOOK_BYTES - new TextEncoder().encode(rawBody).byteLength);
    await handleCreemWebhook(
      webhookRequest(padded, { "content-length": String(MAX_CREEM_WEBHOOK_BYTES) }),
    );
    expect(mocks.handleEvent).toHaveBeenCalledExactlyOnceWith(event);
  });

  it("fails closed on invalid UTF-8 before signature verification or payment handling", async () => {
    const { request, stream } = streamedRequest([new Uint8Array([0xc3, 0x28])]);
    await expect(handleCreemWebhook(request)).rejects.toMatchObject({
      status: 400,
      code: "invalid_json",
    });
    expect(stream.locked).toBe(false);
    expect(mocks.handleEvent).not.toHaveBeenCalled();
  });

  it("rejects an absent body and does not invoke the payment service", async () => {
    const request = new Request(`${appUrl}/api/webhooks/creem`, {
      method: "POST",
      headers: { "creem-signature": signatureFor("") },
    });
    await expect(handleCreemWebhook(request)).rejects.toMatchObject({
      status: 400,
      code: "invalid_json",
    });
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("rejects a modified body under the original signature", async () => {
    await expect(
      handleCreemWebhook(
        webhookRequest(rawBody + " ", { "creem-signature": signatureFor(rawBody) }),
      ),
    ).rejects.toMatchObject({ status: 400, code: "invalid_webhook_signature" });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.handleEvent).not.toHaveBeenCalled();
  });

  it("releases the reader and propagates a stream failure without processing a partial event", async () => {
    const unavailable = new Error("Stream interrupted");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(unavailable);
      },
    });
    const request = new Request(`${appUrl}/api/webhooks/creem`, {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(handleCreemWebhook(request)).rejects.toBe(unavailable);
    expect(stream.locked).toBe(false);
    expect(mocks.handleEvent).not.toHaveBeenCalled();
  });

  it("allows a valid event handler failure to propagate so the provider can retry", async () => {
    const unavailable = new Error("Transaction rolled back");
    mocks.handleEvent.mockRejectedValueOnce(unavailable);
    await expect(handleCreemWebhook(webhookRequest())).rejects.toBe(unavailable);
  });
});
