import "server-only";
import { createAuthService } from "@loom-ai/identity-core/auth";
import { getDatabase } from "./db";
import { getEnv } from "./env";
export type { IdentityUser } from "@loom-ai/identity-core/auth";
export const { getLoginPageConfig, getLogtoConfig, getAuthClient, getUser } = createAuthService({
  getEnv,
  getDatabase,
});
