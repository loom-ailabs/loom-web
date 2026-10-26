import "server-only";

/** Stable app-local business codes. Never reuse a retired code for another error. */
export const HTTP_ERROR_CODES = {
  service_unavailable: 1000,
  AUTH_NOT_CONFIGURED: 1001,
  database_not_configured: 1002,
  billing_not_configured: 1003,
  sandbox_required: 1004,
  invalid_price_configuration: 1005,
  invalid_app_url: 1006,
  session_renewal_failed: 1007,
  session_busy: 1008,
  invalid_billing_mode: 1009,
  invalid_origin: 2001,
  unauthenticated: 2002,
  premium_required: 2003,
  invalid_json: 2004,
  invalid_request_id: 2005,
  invalid_login_destination: 2006,
  invalid_auth_callback: 2007,
  invalid_login_provider: 2008,
  order_not_found: 3001,
  order_unavailable: 3002,
  already_unlocked: 3003,
  order_closed: 3004,
  checkout_closed: 3005,
  checkout_attempt_expired: 3006,
  checkout_unavailable: 3007,
  payment_mismatch: 4001,
  invalid_webhook_signature: 4002,
  missing_webhook_signature: 4003,
  webhook_too_large: 4004,
  billing_mode_mismatch: 4005,
} as const;

export type ApiErrorType = keyof typeof HTTP_ERROR_CODES;
