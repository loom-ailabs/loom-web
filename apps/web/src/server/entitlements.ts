import "server-only";
import { hasPremiumInDatabase } from "@hotkey-tools/identity-core/entitlements";
import { parseCreemMode } from "@hotkey-tools/identity-core/billing-mode";
import { getDatabase } from "./db";
import { getEnv } from "./env";
export async function hasPremium(userId: string): Promise<boolean> {
  const mode = parseCreemMode((await getEnv()).CREEM_MODE);
  return hasPremiumInDatabase(await getDatabase(), userId, mode);
}
