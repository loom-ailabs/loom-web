import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)) },
  },
  test: {
    environment: "happy-dom",
    environmentOptions: { happyDOM: { url: "https://www.loom-labs.ai/" } },
    include: ["src/**/*.test.{ts,tsx}"],
    clearMocks: true,
  },
});
