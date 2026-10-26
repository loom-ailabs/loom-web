import "server-only";
import { parseCreemMode } from "@hotkey-tools/identity-core/billing-mode";
import { getEnv } from "./env";

export async function getBillingPresentationMode() {
  return parseCreemMode((await getEnv()).CREEM_MODE);
}
