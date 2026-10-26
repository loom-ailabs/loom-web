import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const client = {
    handleSignIn: vi.fn(async () => ({ url: "https://id.example/authorize" })),
    handleSignOut: vi.fn(async () => "https://id.example/logout"),
    handleSignInCallback: vi.fn(async () => undefined),
  };
  const first = vi.fn(async () => null);
  return {
    client,
    first,
    getUser: vi.fn(async () => null as null | { id: string; name: string; email: string }),
    getAuthClient: vi.fn(async () => ({
      client,
      config: { baseUrl: "https://login.loom-labs.ai", endpoint: "https://auth.loom-labs.ai" },
      successUrl: "https://www.loom-labs.ai/",
    })),
    getEnv: vi.fn(
      async () => ({ APP_URL: "https://checkout.loom-labs.ai" }) as { APP_URL?: string },
    ),
    getDatabase: vi.fn(async () => ({ prepare: vi.fn(() => ({ first })) })),
    hasPremium: vi.fn(async () => false),
    createPurchaseCheckout: vi.fn(async () => ({
      orderId: "order-1",
      checkoutUrl: "https://www.creem.io/test/payment/pro-fixture",
      status: "pending",
    })),
    getPurchaseOrderForUser: vi.fn(async () => ({
      id: "order-1",
      status: "pending",
      amount: 100,
      currency: "usd",
    })),
    handleStripeWebhook: vi.fn(async (_request: Request) => ({ received: true })),
  };
});

vi.mock("@/server/auth", () => ({ getUser: mocks.getUser, getAuthClient: mocks.getAuthClient }));
vi.mock("@/server/env", () => ({ getEnv: mocks.getEnv }));
vi.mock("@/server/db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/server/billing", () => ({
  hasPremium: mocks.hasPremium,
  handleStripeWebhook: mocks.handleStripeWebhook,
}));
vi.mock("@/server/purchases", () => ({
  createPurchaseCheckout: mocks.createPurchaseCheckout,
  getPurchaseOrderForUser: mocks.getPurchaseOrderForUser,
}));

import { ApiError } from "@/server/http";
import { POST as checkout } from "./checkout/route";
import { GET as order } from "./orders/[id]/route";
import { GET as premium } from "./premium/route";
import { GET as me } from "./me/route";
import { GET as health } from "./health/route";
import { POST as webhook } from "./webhooks/stripe/route";
import { GET as login } from "./auth/login/route";
import { POST as logout } from "./auth/logout/route";
import { GET as callback } from "./auth/callback/route";

const appUrl = "https://checkout.loom-labs.ai";
const alice = { id: "alice", name: "Alice", email: "alice@example.com" };
const requestId = "8ee21263-ad30-481b-bb9e-3f40e805c2e5";

function post(path: string, body: unknown = { requestId }, origin: string | null = appUrl) {
  return new Request(`${appUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function expectFailure(response: Response, status: number, type: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
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
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getUser.mockResolvedValue(null);
  mocks.getEnv.mockResolvedValue({ APP_URL: appUrl });
  mocks.getAuthClient.mockResolvedValue({
    client: mocks.client,
    config: { baseUrl: "https://login.loom-labs.ai", endpoint: "https://auth.loom-labs.ai" },
    successUrl: "https://www.loom-labs.ai/",
  });
  mocks.client.handleSignIn.mockResolvedValue({ url: "https://id.example/authorize" });
  mocks.client.handleSignOut.mockResolvedValue("https://id.example/logout");
  mocks.client.handleSignInCallback.mockResolvedValue(undefined);
  mocks.getDatabase.mockResolvedValue({ prepare: vi.fn(() => ({ first: mocks.first })) });
  mocks.first.mockResolvedValue(null);
  mocks.hasPremium.mockResolvedValue(false);
  mocks.createPurchaseCheckout.mockResolvedValue({
    orderId: "order-1",
    checkoutUrl: "https://www.creem.io/test/payment/pro-fixture",
    status: "pending",
  });
  mocks.getPurchaseOrderForUser.mockResolvedValue({
    id: "order-1",
    status: "pending",
    amount: 100,
    currency: "usd",
  });
  mocks.handleStripeWebhook.mockResolvedValue({ received: true });
});
afterEach(() => vi.restoreAllMocks());

describe("checkout API", () => {
  it("requires a logged-in user before calling billing", async () => {
    await expectFailure(await checkout(post("/api/checkout")), 401, "unauthenticated");
    expect(mocks.createPurchaseCheckout).not.toHaveBeenCalled();
  });

  it.each([null, "https://attacker.example"])(
    "rejects an untrusted Origin %s before auth or billing",
    async (origin) => {
      await expectFailure(
        await checkout(post("/api/checkout", { requestId }, origin)),
        403,
        "invalid_origin",
      );
      expect(mocks.getUser).not.toHaveBeenCalled();
      expect(mocks.createPurchaseCheckout).not.toHaveBeenCalled();
    },
  );

  it("fails clearly when APP_URL is missing", async () => {
    mocks.getEnv.mockResolvedValue({});
    await expectFailure(await checkout(post("/api/checkout")), 503, "invalid_app_url");
    expect(mocks.createPurchaseCheckout).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without creating a pending payment", async () => {
    mocks.getUser.mockResolvedValue(alice);
    await expectFailure(await checkout(post("/api/checkout", "{")), 400, "invalid_json");
    expect(mocks.createPurchaseCheckout).not.toHaveBeenCalled();
  });

  it.each([null, 1, [], {}, { requestId: 123 }])(
    "rejects a missing/invalid request id in %j",
    async (body) => {
      mocks.getUser.mockResolvedValue(alice);
      await expectFailure(await checkout(post("/api/checkout", body)), 400, "invalid_request_id");
      expect(mocks.createPurchaseCheckout).not.toHaveBeenCalled();
    },
  );

  it("takes the owner and price from the server, ignoring browser-supplied alternatives", async () => {
    mocks.getUser.mockResolvedValue(alice);
    const response = await checkout(
      post("/api/checkout", { requestId, userId: "bob", priceId: "price_attacker", amount: 1 }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      code: 0,
      msg: "success",
      data: {
        orderId: "order-1",
        checkoutUrl: "https://www.creem.io/test/payment/pro-fixture",
        status: "pending",
      },
    });
    expect(mocks.createPurchaseCheckout).toHaveBeenCalledExactlyOnceWith(alice, requestId, "en");
  });

  it.each(["en", "zh"] as const)(
    "preserves the selected %s locale for the Creem payment return",
    async (locale) => {
      mocks.getUser.mockResolvedValue(alice);
      const response = await checkout(post("/api/checkout", { requestId, locale }));
      expect(response.status).toBe(200);
      expect(mocks.createPurchaseCheckout).toHaveBeenCalledExactlyOnceWith(
        alice,
        requestId,
        locale,
      );
    },
  );

  it.each([null, "", "fr", "zh-CN", 12, false])(
    "rejects invalid checkout locale %j before creating a provider checkout",
    async (locale) => {
      mocks.getUser.mockResolvedValue(alice);
      await expectFailure(
        await checkout(post("/api/checkout", { requestId, locale })),
        400,
        "invalid_json",
      );
      expect(mocks.createPurchaseCheckout).not.toHaveBeenCalled();
    },
  );

  it("preserves a recoverable Checkout error code", async () => {
    mocks.getUser.mockResolvedValue(alice);
    mocks.createPurchaseCheckout.mockRejectedValue(
      new ApiError(502, "checkout_unavailable", "请重试。"),
    );
    await expectFailure(await checkout(post("/api/checkout")), 502, "checkout_unavailable");
  });
});

describe("identity, orders and premium APIs", () => {
  const orderRequest = () => new Request(`${appUrl}/api/orders/order-1`);
  const orderParams = () => ({ params: Promise.resolve({ id: "order-1" }) });

  it("represents an anonymous session without querying premium grants", async () => {
    const response = await me();
    expect(await response.json()).toEqual({
      code: 0,
      msg: "success",
      data: { user: null, entitlements: { premium: false } },
    });
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });

  it("returns the authenticated user's own entitlement", async () => {
    mocks.getUser.mockResolvedValue(alice);
    mocks.hasPremium.mockResolvedValue(true);
    expect(await (await me()).json()).toEqual({
      code: 0,
      msg: "success",
      data: { user: alice, entitlements: { premium: true } },
    });
    expect(mocks.hasPremium).toHaveBeenCalledExactlyOnceWith("alice");
  });

  it("requires auth and server-side entitlement for premium data", async () => {
    await expectFailure(await premium(), 401, "unauthenticated");
    expect(mocks.hasPremium).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue(alice);
    await expectFailure(await premium(), 403, "premium_required");
    mocks.hasPremium.mockResolvedValue(true);
    const response = await premium();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      code: 0,
      data: { unlocked: true, message: expect.any(String) },
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("requires auth before order lookup and passes the authenticated owner to storage", async () => {
    await expectFailure(await order(orderRequest(), orderParams()), 401, "unauthenticated");
    expect(mocks.getPurchaseOrderForUser).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue(alice);
    const response = await order(orderRequest(), orderParams());
    expect(await response.json()).toMatchObject({
      code: 0,
      data: { order: { id: "order-1", status: "pending" } },
    });
    expect(mocks.getPurchaseOrderForUser).toHaveBeenCalledExactlyOnceWith("order-1", "alice");
  });

  it("hides unavailable or other-user orders with the same 404 response", async () => {
    mocks.getUser.mockResolvedValue(alice);
    mocks.getPurchaseOrderForUser.mockRejectedValue(
      new ApiError(404, "order_not_found", "未找到此订单。"),
    );
    await expectFailure(await order(orderRequest(), orderParams()), 404, "order_not_found");
  });

  it.each(["me", "premium"])("reports an unavailable entitlement store in %s", async (route) => {
    mocks.getUser.mockResolvedValue(alice);
    mocks.hasPremium.mockRejectedValue(
      new ApiError(503, "database_not_configured", "数据库未配置。"),
    );
    await expectFailure(await (route === "me" ? me() : premium()), 503, "database_not_configured");
  });
});

describe("Stripe webhook and health routes", () => {
  it("preserves the exact raw request for signature validation", async () => {
    const payload = '  {"id":"evt_signed"}\n';
    const request = post("/api/webhooks/stripe", payload, null);
    mocks.handleStripeWebhook.mockImplementation(async (incoming) => {
      expect(incoming).toBe(request);
      expect(await incoming.text()).toBe(payload);
      return { received: true };
    });
    expect(await (await webhook(request)).json()).toEqual({
      code: 0,
      msg: "success",
      data: { received: true },
    });
  });

  it("does not acknowledge invalid signatures", async () => {
    mocks.handleStripeWebhook.mockRejectedValue(
      new ApiError(400, "invalid_webhook_signature", "签名无效。"),
    );
    await expectFailure(
      await webhook(post("/api/webhooks/stripe")),
      400,
      "invalid_webhook_signature",
    );
  });

  it("checks D1 connectivity without exposing configuration", async () => {
    const response = await health();
    expect(await response.json()).toEqual({
      code: 0,
      msg: "success",
      data: { status: "ok", framework: "nextjs", storage: "d1" },
    });
    expect(mocks.first).toHaveBeenCalledOnce();
    mocks.getDatabase.mockRejectedValue(
      new ApiError(503, "database_not_configured", "数据库未配置。"),
    );
    await expectFailure(await health(), 503, "database_not_configured");
  });
});

describe("Logto browser redirects", () => {
  it("routes a product login through the central portal without a product preauth cookie", async () => {
    const response = await login(new Request(`${appUrl}/api/auth/login?destination=checkout`));
    expect(response.status).toBe(303);
    const target = new URL(response.headers.get("location")!);
    expect(target.origin).toBe("https://login.loom-labs.ai");
    expect(target.searchParams.get("returnTo")).toBe(`${appUrl}/`);
    expect(mocks.client.handleSignIn).not.toHaveBeenCalled();
  });

  it("validates the callback against the central origin", async () => {
    const response = await callback(
      new Request(
        "https://login.loom-labs.ai/api/auth/callback?code=from-provider&state=signed-state",
      ),
    );
    expect(mocks.client.handleSignInCallback).toHaveBeenCalledExactlyOnceWith(
      "https://login.loom-labs.ai/api/auth/callback?code=from-provider&state=signed-state",
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://www.loom-labs.ai/workspace");
  });

  it("rejects provider callback validation errors without redirecting", async () => {
    mocks.client.handleSignInCallback.mockRejectedValue(
      new ApiError(400, "invalid_origin", "回调无效。"),
    );
    await expectFailure(
      await callback(new Request("https://login.loom-labs.ai/api/auth/callback?code=bad")),
      400,
      "invalid_origin",
    );
  });

  it("logs out by same-origin POST and follows the provider using GET", async () => {
    const response = await logout(post("/api/auth/logout"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://id.example/logout");
    expect(mocks.client.handleSignOut).toHaveBeenCalledExactlyOnceWith(`${appUrl}/`);
  });

  it("prevents logout CSRF before touching the session", async () => {
    await expectFailure(
      await logout(post("/api/auth/logout", {}, "https://attacker.example")),
      403,
      "invalid_origin",
    );
    expect(mocks.getAuthClient).not.toHaveBeenCalled();
  });

  it("rejects logout when APP_URL is missing", async () => {
    mocks.getEnv.mockResolvedValue({});
    await expectFailure(await logout(post("/api/auth/logout")), 503, "invalid_app_url");
  });

  it.each(["login", "logout", "callback"])(
    "reports unavailable Logto configuration in %s",
    async (route) => {
      mocks.getAuthClient.mockRejectedValue(
        new ApiError(503, "AUTH_NOT_CONFIGURED", "登录尚未配置。"),
      );
      const response =
        route === "login"
          ? await login(new Request(`${appUrl}/api/auth/login`))
          : route === "logout"
            ? await logout(post("/api/auth/logout"))
            : await callback(new Request(`${appUrl}/api/auth/callback`));
      await expectFailure(response, 503, "AUTH_NOT_CONFIGURED");
    },
  );
});
