import { ANALYTICS_HOSTS, PUBLIC_PATHS, type AnalyticsConfiguration } from "./contract";

export const CONSENT_COOKIE = "LOOM_ANALYTICS_CONSENT";
export const TEST_COOKIE = "LOOM_ANALYTICS_TEST";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
export type Consent = "granted" | "denied" | null;
export type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

export type AnalyticsWindow = Window;

export function readCookie(name: string, cookie = document.cookie): string | undefined {
  return cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function readConsent(): Consent {
  const value = readCookie(CONSENT_COOKIE);
  return value === "granted" || value === "denied" ? value : null;
}

export function writePreference(name: typeof CONSENT_COOKIE | typeof TEST_COOKIE, value: string) {
  const expiry = value ? "" : "; Expires=Thu, 01 Jan 1970 00:00:01 GMT";
  document.cookie = `${name}=${value}; Domain=.loom-labs.ai; Path=/; Max-Age=${value ? COOKIE_MAX_AGE : 0}${expiry}; SameSite=Lax; Secure`;
}

export function isProductionBrowser(config: AnalyticsConfiguration, url: URL): boolean {
  return (
    url.protocol === "https:" &&
    !url.port &&
    ANALYTICS_HOSTS[config.application].includes(url.hostname)
  );
}

export function isPublicPath(config: AnalyticsConfiguration, pathname: string): boolean {
  const unlocalized = pathname === "/zh" ? "/" : pathname.replace(/^\/zh\//, "/");
  return PUBLIC_PATHS[config.application].includes(unlocalized);
}

export function pageLocation(url: URL, pathname: string): string {
  return `${url.origin}${pathname}`;
}

export function referrerOrigin(referrer: string): string {
  try {
    const url = new URL(referrer);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

export function clearAnalyticsCookies() {
  for (const entry of document.cookie.split(";")) {
    const name = entry.trim().split("=")[0];
    if (name !== "_ga" && !name.startsWith("_ga_")) continue;
    // Google uses the parent domain here; clear a host-only legacy cookie too.
    document.cookie = `${name}=; Domain=.loom-labs.ai; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax; Secure`;
    document.cookie = `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax; Secure`;
  }
}

export function initializeTag(config: AnalyticsConfiguration, location: string): Gtag {
  const target = window as AnalyticsWindow;
  target.dataLayer ??= [];
  target.gtag ??= function () {
    target.dataLayer!.push(arguments);
  };
  const gtag = target.gtag;
  target[`ga-disable-${config.measurementId}`] = false;
  gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  gtag("js", new Date());
  gtag("config", config.measurementId, {
    send_page_view: false,
    page_location: location,
    page_referrer: referrerOrigin(document.referrer),
    page_title: "Loom AI",
    cookie_domain: "loom-labs.ai",
    cookie_flags: "SameSite=Lax;Secure",
    cookie_expires: COOKIE_MAX_AGE,
    cookie_update: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  return gtag;
}

export function disableTag(config: AnalyticsConfiguration) {
  const target = window as AnalyticsWindow;
  target[`ga-disable-${config.measurementId}`] = true;
}

export function stopAnalytics(config: AnalyticsConfiguration) {
  disableTag(config);
  clearAnalyticsCookies();
}
