import "server-only";

import { ApiError } from "./http";
import type { StripeMode } from "./billing-types";

export type { StripeMode } from "./billing-types";

/** Existing deployments remain in test mode until live is explicitly configured. */
export function parseStripeMode(value?: string): StripeMode {
  if (value === undefined) return "test";
  if (value === "test" || value === "live") return value;
  throw new ApiError(503, "invalid_billing_mode", "支付模式必须明确配置为 test 或 live。");
}

/** Current Creem purchases and their presentation are test-only. */
export function parseCreemMode(value?: string): "test" {
  if (value === undefined || value === "test") return "test";
  throw new ApiError(503, "sandbox_required", "Creem 目前仅开放测试支付。");
}
