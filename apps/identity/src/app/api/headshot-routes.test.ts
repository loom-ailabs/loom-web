import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getUser: vi.fn<() => Promise<{ id: string; name: string } | null>>(),
  getEnv: vi.fn<() => Promise<{ APP_URL?: string }>>(),
  checkout: vi.fn(async (_user: { id: string }, _requestId: string, _locale: "en" | "zh") => ({
    orderId: "order-1",
    checkoutUrl: "https://www.creem.io/test/payment/checkout-1",
    status: "pending",
  })),
  summary: vi.fn(async (_userId?: string) => ({
    product: {
      name: "Headshot Pack",
      amount: 999,
      currency: "usd",
      mode: "test",
      photoCount: 4,
      redoCount: 1,
    },
    orders: [] as { id: string }[],
    packs: [] as { id: string }[],
  })),
  order: vi.fn(async (_id: string, _userId: string) => ({
    id: "order-1",
    status: "paid",
    amount: 999,
    currency: "usd",
  })),
  webhook: vi.fn(async (_request: Request) => ({ received: true })),
}));

vi.mock("@/server/auth", () => ({ getUser: mocks.getUser }));
vi.mock("@/server/env", () => ({ getEnv: mocks.getEnv }));
vi.mock("@/server/headshot-billing", () => ({
  createHeadshotCheckout: mocks.checkout,
  getHeadshotSummary: mocks.summary,
  getHeadshotOrder: mocks.order,
  handleCreemWebhook: mocks.webhook,
}));

import { ApiError } from "@/server/http";
import { POST as checkout } from "./headshot_checkout/route";
import { GET as packs, dynamic } from "./headshot_packs/route";
import { GET as order } from "./headshot_orders/[order_id]/route";
import { POST as webhook } from "./webhooks/creem/route";

const appUrl = "https://checkout.loom-labs.ai";
const alice = { id: "alice", name: "Alice" };
const requestId = "b7d53d2e-3411-419e-b1c8-4f0a2afc1411";

function post(body: unknown = { requestId }, origin: string | null = appUrl) {
  return new Request(`${appUrl}/api/headshot_checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin === null ? {} : { origin }) },
    body: JSON.stringify(body),
  });
}

async function expectFailure(response: Response, status: number, type: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-robots-tag")).toContain("noindex");
  const body = (await response.json()) as { code: number };
  expect(body).toMatchObject({
    code: expect.any(Number),
    msg: expect.any(String),
    error: { type },
  });
  expect(body.code).toBeGreaterThan(0);
  expect(body).not.toHaveProperty("data");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getUser.mockResolvedValue(null);
  mocks.getEnv.mockResolvedValue({ APP_URL: appUrl });
  mocks.checkout.mockResolvedValue({
    orderId: "order-1",
    checkoutUrl: "https://www.creem.io/test/payment/checkout-1",
    status: "pending",
  });
  mocks.summary.mockResolvedValue({
    product: {
      name: "Headshot Pack",
      amount: 999,
      currency: "usd",
      mode: "test",
      photoCount: 4,
      redoCount: 1,
    },
    orders: [],
    packs: [],
  });
  mocks.order.mockResolvedValue({ id: "order-1", status: "paid", amount: 999, currency: "usd" });
  mocks.webhook.mockResolvedValue({ received: true });
});
afterEach(() => vi.restoreAllMocks());

describe("headshot Checkout HTTP boundary", () => {
  it.each([
    null,
    "https://attacker.example",
    "https://checkout.loom-labs.ai.attacker.example",
    `${appUrl}:8443`,
  ])("rejects untrusted Origin %j before authentication or checkout", async (origin) => {
    await expectFailure(await checkout(post({ requestId }, origin)), 403, "invalid_origin");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("rejects a missing APP_URL rather than using the incoming host", async () => {
    mocks.getEnv.mockResolvedValue({});
    await expectFailure(await checkout(post()), 503, "invalid_app_url");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("requires a verified session before parsing an order or calling billing", async () => {
    await expectFailure(await checkout(post()), 401, "unauthenticated");
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without creating a pending order", async () => {
    mocks.getUser.mockResolvedValue(alice);
    const request = new Request(`${appUrl}/api/headshot_checkout`, {
      method: "POST",
      headers: { origin: appUrl },
      body: "{",
    });
    await expectFailure(await checkout(request), 400, "invalid_json");
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it.each([null, 1, "request", [], {}, { requestId: 123 }])(
    "rejects a missing/string-invalid requestId in %j",
    async (body) => {
      mocks.getUser.mockResolvedValue(alice);
      await expectFailure(await checkout(post(body)), 400, "invalid_request_id");
      expect(mocks.checkout).not.toHaveBeenCalled();
    },
  );

  it.each(["", null, false, 1, "fr", "zh-CN"])("rejects unsupported locale %j", async (locale) => {
    mocks.getUser.mockResolvedValue(alice);
    await expectFailure(await checkout(post({ requestId, locale })), 400, "invalid_json");
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it.each([undefined, "en", "zh"] as const)(
    "uses server identity and product while accepting locale %j",
    async (locale) => {
      mocks.getUser.mockResolvedValue(alice);
      const response = await checkout(
        post({
          requestId,
          ...(locale ? { locale } : {}),
          userId: "bob",
          productId: "prod_attacker",
          amount: 1,
          mode: "prod",
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual({
        code: 0,
        msg: "success",
        data: {
          orderId: "order-1",
          checkoutUrl: "https://www.creem.io/test/payment/checkout-1",
          status: "pending",
        },
      });
      expect(mocks.checkout).toHaveBeenCalledExactlyOnceWith(alice, requestId, locale ?? "en");
    },
  );

  it("preserves service validation for a string that is not a UUID", async () => {
    mocks.getUser.mockResolvedValue(alice);
    mocks.checkout.mockRejectedValueOnce(
      new ApiError(400, "invalid_request_id", "requestId 必须为 UUID。"),
    );
    await expectFailure(
      await checkout(post({ requestId: "not-a-uuid" })),
      400,
      "invalid_request_id",
    );
  });

  it("preserves an uncertain-checkout refusal and does not expose provider internals", async () => {
    mocks.getUser.mockResolvedValue(alice);
    mocks.checkout.mockRejectedValueOnce(
      new ApiError(409, "checkout_unavailable", "支付状态待确认。"),
    );
    await expectFailure(await checkout(post()), 409, "checkout_unavailable");
  });

  it("maps unexpected identity failures to the safe standard response", async () => {
    mocks.getUser.mockRejectedValueOnce(new Error("sensitive upstream body"));
    const response = await checkout(post());
    await expectFailure(response.clone(), 503, "service_unavailable");
    expect(await response.text()).not.toContain("sensitive upstream body");
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
});

describe("headshot purchase history and order HTTP boundaries", () => {
  const orderRequest = () => new Request(`${appUrl}/api/headshot_orders/order-1?user_id=bob`);
  const orderContext = (id = "order-1") => ({ params: Promise.resolve({ order_id: id }) });

  it("returns an anonymous product with no private history and marks the route dynamic", async () => {
    expect(dynamic).toBe("force-dynamic");
    const response = await packs();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      code: 0,
      data: { user: null, orders: [], packs: [] },
    });
    expect(mocks.summary).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("selects the logged-in owner's history rather than an owner supplied by the browser", async () => {
    mocks.getUser.mockResolvedValue(alice);
    mocks.summary.mockResolvedValueOnce({
      product: {
        name: "Headshot Pack",
        amount: 999,
        currency: "usd",
        mode: "test",
        photoCount: 4,
        redoCount: 1,
      },
      orders: [{ id: "alice-order" }],
      packs: [{ id: "alice-pack" }],
    });
    expect(await (await packs()).json()).toMatchObject({
      code: 0,
      data: { user: alice, orders: [{ id: "alice-order" }], packs: [{ id: "alice-pack" }] },
    });
    expect(mocks.summary).toHaveBeenCalledExactlyOnceWith("alice");
  });

  it("reports a summary configuration failure without pretending there are no purchases", async () => {
    mocks.summary.mockRejectedValueOnce(
      new ApiError(503, "billing_not_configured", "支付未配置。"),
    );
    await expectFailure(await packs(), 503, "billing_not_configured");
  });

  it("requires authentication before an order lookup", async () => {
    await expectFailure(await order(orderRequest(), orderContext()), 401, "unauthenticated");
    expect(mocks.order).not.toHaveBeenCalled();
  });

  it("binds a requested order to the session user, ignoring owner query parameters", async () => {
    mocks.getUser.mockResolvedValue(alice);
    const response = await order(orderRequest(), orderContext());
    expect(await response.json()).toEqual({
      code: 0,
      msg: "success",
      data: { order: { id: "order-1", status: "paid", amount: 999, currency: "usd" } },
    });
    expect(mocks.order).toHaveBeenCalledExactlyOnceWith("order-1", "alice");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["bob-order", "", "' OR 1=1 --"])(
    "uses the same 404 for inaccessible or invalid order id %j",
    async (id) => {
      mocks.getUser.mockResolvedValue(alice);
      mocks.order.mockRejectedValueOnce(new ApiError(404, "order_not_found", "未找到订单。"));
      await expectFailure(await order(orderRequest(), orderContext(id)), 404, "order_not_found");
      expect(mocks.order).toHaveBeenCalledExactlyOnceWith(id, "alice");
    },
  );
});

describe("Creem webhook HTTP boundary", () => {
  it.each([null, "https://creem.io", "https://unrelated.example"])(
    "delegates provider authentication without session/Origin checks for %j",
    async (origin) => {
      const request = new Request(`${appUrl}/api/webhooks/creem`, {
        method: "POST",
        headers: origin ? { origin } : {},
        body: "provider-body",
      });
      const response = await webhook(request);
      expect(await response.json()).toEqual({ code: 0, msg: "success", data: { received: true } });
      expect(mocks.webhook).toHaveBeenCalledExactlyOnceWith(request);
      expect(mocks.getUser).not.toHaveBeenCalled();
      expect(mocks.getEnv).not.toHaveBeenCalled();
    },
  );

  it("preserves a signature rejection and a retriable processing failure", async () => {
    const request = new Request(`${appUrl}/api/webhooks/creem`, { method: "POST" });
    mocks.webhook.mockRejectedValueOnce(
      new ApiError(400, "invalid_webhook_signature", "签名无效。"),
    );
    await expectFailure(await webhook(request), 400, "invalid_webhook_signature");
    mocks.webhook.mockRejectedValueOnce(new Error("private SQL statement"));
    const response = await webhook(request);
    await expectFailure(response.clone(), 503, "service_unavailable");
    expect(await response.text()).not.toContain("private SQL statement");
  });
});
