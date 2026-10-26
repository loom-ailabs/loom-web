import "server-only";

import {
  ANALYTICS_HOSTS,
  type AnalyticsApplication,
  type AnalyticsConfiguration,
} from "./contract";

/** Call with the application's official Cloudflare adapter environment. No secret is exposed. */
export function getAnalyticsConfiguration(
  env: { APP_URL?: string; GA_MEASUREMENT_ID?: string },
  application: AnalyticsApplication,
): AnalyticsConfiguration | null {
  if (env.GA_MEASUREMENT_ID === undefined) return null;
  if (!/^G-[A-Z0-9]{6,20}$/.test(env.GA_MEASUREMENT_ID)) {
    throw new Error("GA_MEASUREMENT_ID must be a valid GA4 measurement ID.");
  }
  try {
    const origin = new URL(env.APP_URL ?? "");
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.port ||
      !ANALYTICS_HOSTS[application].includes(origin.hostname)
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return { measurementId: env.GA_MEASUREMENT_ID, application };
}
