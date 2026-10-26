import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONSENT_COOKIE,
  TEST_COOKIE,
  clearAnalyticsCookies,
  initializeTag,
  isProductionBrowser,
  isPublicPath,
  pageLocation,
  readConsent,
  readCookie,
  referrerOrigin,
  stopAnalytics,
  writePreference,
  type AnalyticsWindow,
} from "./browser";
import type { AnalyticsConfiguration } from "./contract";

const configuration: AnalyticsConfiguration = { measurementId: "G-ABC1234567", application: "web" };

beforeEach(() => {
  window.history.replaceState({}, "", "https://www.loom-labs.ai/");
});

afterEach(() => {
  for (const name of [CONSENT_COOKIE, TEST_COOKIE, "_ga", "_ga_ABC1234567", "loom_sid_test"]) {
    document.cookie = `${name}=; Domain=.loom-labs.ai; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:01 GMT`;
    document.cookie = `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:01 GMT`;
  }
  const target = window as AnalyticsWindow;
  delete target.gtag;
  delete target.dataLayer;
  delete target["ga-disable-G-ABC1234567"];
});

describe("analytics privacy boundaries", () => {
  it("keeps production host checks independent of deployment configuration", () => {
    expect(isProductionBrowser(configuration, new URL("https://www.loom-labs.ai/"))).toBe(true);
    for (const url of [
      "http://www.loom-labs.ai/",
      "https://www.loom-labs.ai:8443/",
      "http://localhost:3000/",
      "https://www.loom-labs.ai.evil.example/",
      "https://login.loom-labs.ai/",
    ]) {
      expect(isProductionBrowser(configuration, new URL(url))).toBe(false);
    }
  });

  it("only measures allowlisted public pages in both languages", () => {
    for (const path of ["/", "/zh", "/pricing", "/zh/pricing", "/workspace", "/privacy"])
      expect(isPublicPath(configuration, path)).toBe(true);
    for (const path of ["/account", "/zh/account", "/api/me", "/pricing/order-123", "/unknown"])
      expect(isPublicPath(configuration, path)).toBe(false);
    const identity = { ...configuration, application: "identity" as const };
    expect(isPublicPath(identity, "/zh/headshots")).toBe(true);
    expect(isPublicPath(identity, "/orders/123")).toBe(false);
  });

  it("removes query strings, fragments and referrer paths before collection", () => {
    expect(pageLocation(new URL("https://www.loom-labs.ai/?code=secret#token"), "/pricing")).toBe(
      "https://www.loom-labs.ai/pricing",
    );
    expect(referrerOrigin("https://login.loom-labs.ai/api/auth/callback?code=secret#token")).toBe(
      "https://login.loom-labs.ai",
    );
    for (const value of ["", "not a URL", "javascript:alert(1)"])
      expect(referrerOrigin(value)).toBe("");
  });

  it("uses strict consent values and separate cookies without changing identity", () => {
    document.cookie = "loom_sid_test=identity; Domain=.loom-labs.ai; Path=/; Secure";
    expect(readConsent()).toBeNull();
    writePreference(CONSENT_COOKIE, "yes");
    expect(readConsent()).toBeNull();
    writePreference(CONSENT_COOKIE, "granted");
    writePreference(TEST_COOKIE, "1");
    expect(readConsent()).toBe("granted");
    expect(readCookie(TEST_COOKIE)).toBe("1");
    writePreference(CONSENT_COOKIE, "denied");
    writePreference(TEST_COOKIE, "");
    expect(readConsent()).toBe("denied");
    expect(readCookie(TEST_COOKIE)).toBeUndefined();
    expect(readCookie("loom_sid_test")).toBe("identity");
  });

  it("configures no automatic pageview, advertising or identity parameters", () => {
    initializeTag(configuration, "https://www.loom-labs.ai/");
    const commands = (window as AnalyticsWindow).dataLayer!.map((entry) =>
      Array.from(entry as unknown[]),
    );
    expect(commands[0]).toEqual([
      "consent",
      "default",
      {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ]);
    expect(commands[2]).toEqual([
      "config",
      configuration.measurementId,
      {
        send_page_view: false,
        page_location: "https://www.loom-labs.ai/",
        page_referrer: "",
        page_title: "Loom AI",
        cookie_domain: "loom-labs.ai",
        cookie_flags: "SameSite=Lax;Secure",
        cookie_expires: 15552000,
        cookie_update: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    ]);
  });

  it("withdrawal disables Google collection and clears only analytics cookies", () => {
    document.cookie = "_ga=GA1.1.123; Domain=.loom-labs.ai; Path=/; Secure";
    document.cookie = "_ga_ABC1234567=session; Path=/; Secure";
    document.cookie = "loom_sid_test=identity; Domain=.loom-labs.ai; Path=/; Secure";
    stopAnalytics(configuration);
    expect((window as AnalyticsWindow)["ga-disable-G-ABC1234567"]).toBe(true);
    expect(readCookie("_ga")).toBeUndefined();
    expect(readCookie("_ga_ABC1234567")).toBeUndefined();
    expect(readCookie("loom_sid_test")).toBe("identity");
    clearAnalyticsCookies();
  });
});
