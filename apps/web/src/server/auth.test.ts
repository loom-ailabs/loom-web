// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getEnv: vi.fn(), getDatabase: vi.fn(), getContext: vi.fn() }));
vi.mock("./env", () => ({ getEnv: mocks.getEnv }));
vi.mock("./db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@loom-ai/identity-core/session", () => ({
  default: class {},
  getLogtoContext: mocks.getContext,
}));
import { getLogtoConfig, getUser } from "./auth";

const config = {
  APP_URL: "https://www.loom-labs.ai",
  LOGIN_URL: "https://login.loom-labs.ai",
  LOGTO_COOKIE_DOMAIN: ".loom-labs.ai",
  AUTH_SUCCESS_URL: "https://www.loom-labs.ai/",
  LOGTO_ENDPOINT: "https://auth.loom-labs.ai",
  LOGTO_USER_NAMESPACE: "https://kpy72v.logto.app",
  LOGTO_APP_ID: "fixture-app",
  LOGTO_APP_SECRET: "fixture-app-secret",
  LOGTO_COOKIE_SECRET: "independent-www-cookie-key-test-fixture",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getEnv.mockResolvedValue(config);
});
it("uses the WWW callback origin and its own secure cookie configuration", async () => {
  const result = await getLogtoConfig();
  expect(result).toMatchObject({
    baseUrl: "https://login.loom-labs.ai",
    endpoint: "https://auth.loom-labs.ai",
    cookieSecret: config.LOGTO_COOKIE_SECRET,
    cookieSecure: true,
  });
  expect(result.cookieDomain).toBe(".loom-labs.ai");
  expect(result).not.toHaveProperty("sessionWrapper");
});
it("preserves the existing tenant namespace and uses the verified subject for WWW ownership", async () => {
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ run });
  mocks.getDatabase.mockResolvedValue({ prepare: () => ({ bind }) });
  mocks.getContext.mockResolvedValue({
    isAuthenticated: true,
    claims: { sub: "same-tenant-subject", exp: Math.floor(Date.now() / 1000) + 30 },
  });
  expect(await getUser()).toEqual({ id: "same-tenant-subject" });
  expect(bind).toHaveBeenCalledWith(
    "same-tenant-subject",
    "https://kpy72v.logto.app",
    "same-tenant-subject",
    null,
    null,
    expect.any(Number),
  );
});
