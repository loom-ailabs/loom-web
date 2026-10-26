import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export type IdentityEnv = {
  DB?: D1Database;
  APP_URL?: string;
  GA_MEASUREMENT_ID?: string;
  LOGIN_URL?: string;
  AUTH_SUCCESS_URL?: string;
  LOGTO_ENDPOINT?: string;
  LOGTO_USER_NAMESPACE?: string;
  LOGTO_APP_ID?: string;
  LOGTO_APP_SECRET?: string;
  LOGTO_COOKIE_SECRET?: string;
  LOGTO_COOKIE_DOMAIN?: string;
  STRIPE_MODE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  CREEM_MODE?: string;
  CREEM_API_KEY?: string;
  CREEM_WEBHOOK_SECRET?: string;
  CREEM_PRODUCT_ID?: string;
  CREEM_PRO_PRODUCT_ID?: string;
};

declare global {
  interface CloudflareEnv extends IdentityEnv {}
}

const variableNames = [
  "APP_URL",
  "GA_MEASUREMENT_ID",
  "LOGIN_URL",
  "AUTH_SUCCESS_URL",
  "LOGTO_ENDPOINT",
  "LOGTO_USER_NAMESPACE",
  "LOGTO_APP_ID",
  "LOGTO_APP_SECRET",
  "LOGTO_COOKIE_SECRET",
  "LOGTO_COOKIE_DOMAIN",
  "STRIPE_MODE",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
  "CREEM_MODE",
  "CREEM_API_KEY",
  "CREEM_WEBHOOK_SECRET",
  "CREEM_PRODUCT_ID",
  "CREEM_PRO_PRODUCT_ID",
] as const;

export async function getEnv(): Promise<IdentityEnv> {
  const { env } = await getCloudflareContext({ async: true });
  const result: IdentityEnv = { DB: env.DB };
  for (const name of variableNames) {
    // Blank template values in .dev.vars must not hide next dev's .env.local.
    result[name] =
      name === "STRIPE_MODE" || name === "CREEM_MODE"
        ? (env[name] ?? process.env[name])
        : env[name] || process.env[name];
  }
  return result;
}
