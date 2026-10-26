import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const joseWebCrypto = join(dirname(require.resolve("jose/package.json")), "dist/browser/index.js");

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  transpilePackages: [
    "@hotkey-tools/ui",
    "@hotkey-tools/identity-core",
    "@hotkey-tools/i18n",
    "@hotkey-tools/analytics",
  ],
  images: { unoptimized: true },
  webpack(config) {
    // Next's Node build otherwise selects jose's Node export before OpenNext can
    // resolve its workerd condition. Keep the SDK's complete JWT verification
    // using jose's official WebCrypto implementation in both development and Workers.
    config.resolve.alias = { ...config.resolve.alias, jose$: joseWebCrypto };
    return config;
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
