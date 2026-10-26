import type { MetadataRoute } from "next";
import { locales } from "@loom-ai/i18n/routing";
import { PUBLIC_PAGES, publicPageUrl } from "@/shared/config/seo";
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.flatMap((page) =>
    locales.map((locale) => ({
      url: publicPageUrl(page.path, locale),
      alternates: {
        languages: {
          "zh-CN": publicPageUrl(page.path, "zh"),
          en: publicPageUrl(page.path, "en"),
          "x-default": publicPageUrl(page.path, "en"),
        },
      },
    })),
  );
}
