import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCreemBillingConfig } from "./creem-config";
import { createCreemGateway } from "./creem-gateway";
import { isRecord, MAX_CREEM_WEBHOOK_BYTES, verifyCreemWebhook } from "./creem-webhook";

const environment = {
  APP_URL: "https://checkout.loom-labs.ai/nested?ignored=yes",
  CREEM_MODE: "test",
  CREEM_API_KEY: "creem_test_fixture",
  CREEM_WEBHOOK_SECRET: "fixture-webhook-secret",
  CREEM_PRODUCT_ID: "prod_fixture123",
};
const event = {
  id: "evt_fixture",
  eventType: "checkout.completed",
  object: { id: "chck_fixture" },
};
const payload = JSON.stringify(event);
const secret = "fixture-webhook-secret";

function legacyHeaders(raw: string, key = secret, header = "creem-signature") {
  return new Headers({ [header]: createHmac("sha256", key).update(raw).digest("hex") });
}

function standardHeaders(raw: string, timestamp = Math.floor(Date.now() / 1000)) {
  const id = "webhook_fixture";
  const signature = createHmac("sha256", Buffer.from(secret))
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64");
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Creem test-only configuration", () => {
  it("accepts explicit test configuration and returns only the application origin", () => {
    expect(getCreemBillingConfig(environment)).toEqual({
      mode: "test",
      appUrl: "https://checkout.loom-labs.ai",
      apiKey: environment.CREEM_API_KEY,
      webhookSecret: environment.CREEM_WEBHOOK_SECRET,
      productId: environment.CREEM_PRODUCT_ID,
    });
    expect(getCreemBillingConfig({ ...environment, CREEM_MODE: undefined }).mode).toBe("test");
  });

  it.each(["live", "", " ", "Test", "standard"])(
    "rejects mode %j before contacting Creem",
    (mode) => {
      expect(() => getCreemBillingConfig({ ...environment, CREEM_MODE: mode })).toThrowError(
        expect.objectContaining({ status: 503, code: "sandbox_required" }),
      );
    },
  );

  it.each(["APP_URL", "CREEM_API_KEY", "CREEM_WEBHOOK_SECRET", "CREEM_PRODUCT_ID"] as const)(
    "rejects a missing or empty %s",
    (name) => {
      for (const value of [undefined, ""]) {
        expect(() => getCreemBillingConfig({ ...environment, [name]: value })).toThrowError(
          expect.objectContaining({ status: 503, code: "billing_not_configured" }),
        );
      }
    },
  );

  it.each(["creem_live_fixture", "creem_fixture", " creem_test_fixture"])(
    "rejects a credential outside the test environment",
    (key) => {
      expect(() => getCreemBillingConfig({ ...environment, CREEM_API_KEY: key })).toThrowError(
        expect.objectContaining({ code: "billing_mode_mismatch" }),
      );
    },
  );

  it.each(["price_fixture", "prod_", "prod_fixture/other", "prod_fixture?other=yes"])(
    "rejects an invalid product identifier %j",
    (id) => {
      expect(() => getCreemBillingConfig({ ...environment, CREEM_PRODUCT_ID: id })).toThrowError(
        expect.objectContaining({ code: "invalid_price_configuration" }),
      );
    },
  );

  it.each([
    "invalid-url",
    "http://checkout.loom-labs.ai",
    "ftp://localhost",
    "https://username@checkout.loom-labs.ai",
    "https://:password@checkout.loom-labs.ai",
  ])("rejects an unsafe application address %j", (url) => {
    expect(() => getCreemBillingConfig({ ...environment, APP_URL: url })).toThrowError(
      expect.objectContaining({ code: "invalid_app_url" }),
    );
  });

  it.each(["http://localhost:3001", "http://127.0.0.1:3001", "http://[::1]:3001"])(
    "permits local preview at %s",
    (url) => expect(getCreemBillingConfig({ ...environment, APP_URL: url }).appUrl).toBe(url),
  );
});

describe("Creem gateway over the official SDK", () => {
  it("uses the test API and retains SDK request and response mapping for all operations", async () => {
    const requests: Request[] = [];
    const product = {
      id: "prod_fixture123",
      mode: "test",
      object: "product",
      name: "Loom Professional Headshot Pack",
      description: "Four portraits and one redo",
      price: 999,
      currency: "USD",
      billing_type: "onetime",
      billing_period: "once",
      status: "active",
      tax_mode: "inclusive",
      tax_category: "digital-goods-service",
      created_at: "2026-10-26T00:00:00Z",
      updated_at: "2026-10-26T00:00:00Z",
    };
    const checkout = {
      id: "chck_fixture",
      mode: "test",
      object: "checkout",
      status: "pending",
      product: product.id,
      request_id: "order-fixture",
      checkout_url: "https://www.creem.io/test/payment/prod_fixture123/chck_fixture",
    };
    const transaction = {
      id: "tran_fixture",
      mode: "test",
      object: "transaction",
      amount: 999,
      amount_paid: 999,
      currency: "USD",
      type: "payment",
      status: "paid",
      refunded_amount: 0,
      order: "ord_fixture",
      created_at: 1_793_001_600_000,
    };
    const fetcher = vi.fn(async (input: Request) => {
      requests.push(input);
      const path = new URL(input.url).pathname;
      const body = path.startsWith("/v1/products/")
        ? product
        : path === "/v1/transactions"
          ? transaction
          : checkout;
      return Response.json(body);
    });
    vi.stubGlobal("fetch", fetcher);
    const gateway = createCreemGateway(environment.CREEM_API_KEY);
    expect(await gateway.getProduct(product.id)).toMatchObject({
      id: product.id,
      billingType: "onetime",
      taxMode: "inclusive",
    });
    const input = {
      productId: product.id,
      requestId: "order-fixture",
      units: 1,
      successUrl: "https://checkout.loom-labs.ai/headshots?purchase_id=local-order",
      metadata: { order_id: "local-order", mode: "test" },
    };
    expect(await gateway.createCheckout(input)).toMatchObject({
      id: checkout.id,
      checkoutUrl: checkout.checkout_url,
      requestId: "order-fixture",
    });
    expect(await gateway.getCheckout(checkout.id)).toMatchObject({ id: checkout.id });
    expect(await gateway.getTransaction(transaction.id)).toMatchObject({
      id: transaction.id,
      amountPaid: 999,
      refundedAmount: 0,
    });
    expect(requests).toHaveLength(4);
    for (const request of requests) {
      expect(new URL(request.url).origin).toBe("https://test-api.creem.io");
      expect(request.headers.get("x-api-key")).toBe(environment.CREEM_API_KEY);
    }
    expect(requests[1]?.method).toBe("POST");
    expect(await requests[1]?.json()).toMatchObject({
      product_id: product.id,
      request_id: "order-fixture",
      success_url: input.successUrl,
      metadata: input.metadata,
      units: 1,
    });
    expect(new URL(requests[2]!.url).searchParams.get("checkout_id")).toBe(checkout.id);
    expect(new URL(requests[3]!.url).searchParams.get("transaction_id")).toBe(transaction.id);
  });

  it("does not retry provider failures that could hide an uncertain create outcome", async () => {
    const fetcher = vi.fn(async () => Response.json({ message: "unavailable" }, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      createCreemGateway(environment.CREEM_API_KEY).getProduct("prod_fixture"),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("connects requests to a 15-second abort signal and returns a bounded timeout failure", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetcher = vi.fn(
      async (request: Request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(request.signal.reason), {
            once: true,
          });
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const pending = createCreemGateway(environment.CREEM_API_KEY).getProduct("prod_fixture");
    const failure = expect(pending).rejects.toMatchObject({ name: "RequestTimeoutError" });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(timeout).toHaveBeenCalledWith(15_000);
    controller.abort(new DOMException("Operation timed out", "TimeoutError"));
    await failure;
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("Creem raw-body webhook verification", () => {
  it.each(["creem-signature", "x-creem-signature"])(
    "accepts a valid %s signature",
    async (header) => {
      expect(
        await verifyCreemWebhook(payload, legacyHeaders(payload, secret, header), secret),
      ).toEqual(event);
    },
  );

  it("accepts the legacy sha256 prefix without changing the signed bytes", async () => {
    const headers = legacyHeaders(payload);
    headers.set("creem-signature", `sha256=${headers.get("creem-signature")!.toUpperCase()}`);
    expect(await verifyCreemWebhook(payload, headers, secret)).toEqual(event);
  });

  it("accepts Standard Webhooks with the official timestamp and versioned signature format", async () => {
    const headers = standardHeaders(payload);
    headers.set("webhook-signature", `v0,ignored v1,invalid ${headers.get("webhook-signature")}`);
    const standardSecret = `whsec_${Buffer.from(secret).toString("base64")}`;
    expect(await verifyCreemWebhook(payload, headers, standardSecret)).toEqual(event);
  });

  it.each(["", "invalid", "00", "0".repeat(64)])(
    "rejects an invalid legacy signature %j",
    async (signature) => {
      await expect(
        verifyCreemWebhook(payload, new Headers({ "creem-signature": signature }), secret),
      ).rejects.toMatchObject({ status: 400, code: "invalid_webhook_signature" });
    },
  );

  it("requires signature headers before parsing event data", async () => {
    await expect(verifyCreemWebhook(payload, new Headers(), secret)).rejects.toMatchObject({
      status: 400,
      code: "missing_webhook_signature",
    });
  });

  it("rejects a tampered body and a different shared secret", async () => {
    await expect(
      verifyCreemWebhook(`${payload} `, legacyHeaders(payload), secret),
    ).rejects.toMatchObject({
      code: "invalid_webhook_signature",
    });
    await expect(
      verifyCreemWebhook(payload, legacyHeaders(payload), "other-secret"),
    ).rejects.toMatchObject({
      code: "invalid_webhook_signature",
    });
  });

  it.each([-301, 301])(
    "rejects a Standard Webhooks timestamp outside tolerance (%s seconds)",
    async (delta) => {
      const headers = standardHeaders(payload, Math.floor(Date.now() / 1000) + delta);
      await expect(
        verifyCreemWebhook(payload, headers, `whsec_${Buffer.from(secret).toString("base64")}`),
      ).rejects.toMatchObject({ code: "invalid_webhook_signature" });
    },
  );

  it("rejects a signed malformed JSON body after signature verification", async () => {
    const malformed = "{invalid-json";
    await expect(
      verifyCreemWebhook(malformed, legacyHeaders(malformed), secret),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_json",
    });
  });

  it.each([
    null,
    [],
    "string",
    1,
    { ...event, id: 1 },
    { ...event, id: "" },
    { ...event, id: "a".repeat(256) },
    { ...event, eventType: 1 },
    { ...event, eventType: "" },
    { ...event, object: null },
    { ...event, object: [] },
  ])("rejects a signed event with invalid required fields %#", async (value) => {
    const raw = JSON.stringify(value);
    await expect(verifyCreemWebhook(raw, legacyHeaders(raw), secret)).rejects.toMatchObject({
      status: 400,
      code: "payment_mismatch",
    });
  });

  it("applies the body limit to UTF-8 bytes before signature verification", async () => {
    const oversized = "🚀".repeat(MAX_CREEM_WEBHOOK_BYTES / 4 + 1);
    expect(oversized.length).toBeLessThan(MAX_CREEM_WEBHOOK_BYTES);
    await expect(verifyCreemWebhook(oversized, new Headers(), secret)).rejects.toMatchObject({
      status: 413,
      code: "webhook_too_large",
    });
  });

  it("accepts an exactly maximum-sized signed JSON event", async () => {
    const raw = payload + " ".repeat(MAX_CREEM_WEBHOOK_BYTES - payload.length);
    expect(await verifyCreemWebhook(raw, legacyHeaders(raw), secret)).toEqual(event);
  });

  it("treats only non-null non-array objects as records", () => {
    expect(isRecord({})).toBe(true);
    for (const value of [null, undefined, [], "", 0, false]) expect(isRecord(value)).toBe(false);
  });
});
