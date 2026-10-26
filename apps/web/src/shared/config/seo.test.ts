import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentMode } from "@loom-ai/identity-core/billing-types";
import { getSeoMessages } from "@loom-ai/i18n/seo";
const runtime = vi.hoisted(() => ({ mode: "test" as PaymentMode }));
vi.mock("@/server/billing-presentation", () => ({
  getBillingPresentationMode: async () => runtime.mode,
}));
beforeEach(() => {
  runtime.mode = "test";
});
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { GET as getLlmsIndex } from "@/app/llms.txt/route";
import { GET as getLlmsFullText } from "@/app/llms-full.txt/route";
import { GET as getLocalizedIndex } from "@/app/[locale]/llms.txt/route";
import { GET as getLocalizedFullText } from "@/app/[locale]/llms-full.txt/route";
import {
  createLlmsIndex,
  createLlmsFullText,
  createPageMetadata,
  PUBLIC_PAGES,
  serializeJsonLd,
  siteStructuredData,
} from "./seo";

const publicUrls = [
  "https://www.loom-labs.ai/",
  "https://www.loom-labs.ai/vision",
  "https://www.loom-labs.ai/workspace",
  "https://www.loom-labs.ai/pricing",
  "https://www.loom-labs.ai/privacy",
  "https://www.loom-labs.ai/terms",
];
const chineseUrl = (url: string) =>
  url === publicUrls[0]
    ? "https://www.loom-labs.ai/zh"
    : url.replace("https://www.loom-labs.ai", "https://www.loom-labs.ai/zh");

describe("public search and agent discovery", () => {
  it("lists English and Chinese canonical pages and excludes private account routes", () => {
    const entries = sitemap();
    expect(entries.map((entry) => entry.url)).toEqual(
      publicUrls.flatMap((url) => [url, chineseUrl(url)]),
    );
    expect(entries).toHaveLength(12);
    expect(entries.every((entry) => !entry.url.includes("/account"))).toBe(true);
    for (const [index, entry] of entries.entries()) {
      const english = publicUrls[Math.floor(index / 2)]!;
      expect(entry.alternates?.languages).toEqual({
        "zh-CN": chineseUrl(english),
        en: english,
        "x-default": english,
      });
    }
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(true);
    expect(robots()).toMatchObject({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/account", "/zh/account", "/en/account"],
      },
      sitemap: "https://www.loom-labs.ai/sitemap.xml",
    });
  });

  it("uses English default metadata and distinct Chinese canonicals with reciprocal hreflang", () => {
    const titles = new Set();
    for (const [index, page] of PUBLIC_PAGES.entries()) {
      const metadata = createPageMetadata(page.path);
      const english = publicUrls[index]!;
      expect(metadata.alternates?.canonical).toBe(english);
      expect(metadata.openGraph?.url).toBe(english);
      expect(metadata.alternates?.languages).toEqual({
        "zh-CN": chineseUrl(english),
        en: english,
        "x-default": english,
      });
      expect(createPageMetadata(page.path, "en")).toEqual(metadata);
      const chinese = createPageMetadata(page.path, "zh");
      expect(chinese.alternates?.canonical).toBe(chineseUrl(english));
      expect(chinese.openGraph?.url).toBe(chinese.alternates?.canonical);
      expect(chinese.description).not.toBe(metadata.description);
      titles.add(JSON.stringify(metadata.title));
    }
    expect(titles.size).toBe(6);
  });

  it("keeps root public text permanently English regardless of language preference", async () => {
    const responses = await Promise.all([getLlmsIndex(), getLlmsFullText()]);
    const texts = [createLlmsIndex("en"), createLlmsFullText("en")];
    for (const [index, response] of responses.entries()) {
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
      expect(response.headers.get("Content-Language")).toBe("en");
      expect(response.headers.get("Cache-Control")).toContain("public");
      const text = await response.text();
      expect(text).toBe(texts[index]);
      for (const url of publicUrls) expect(text).toContain(url);
      expect(text).not.toMatch(/https?:\/\/[^\s)]*\/api\//);
      expect(text).not.toMatch(/https?:\/\/(?:login|checkout|auth)\./);
      expect(text).not.toMatch(/(?:sk_test_|whsec_|Bearer |session_id=)/);
    }
  });

  it("serves Chinese text on /zh and preserves legacy /en text links without promoting aliases", async () => {
    for (const get of [getLocalizedIndex, getLocalizedFullText]) {
      const zh = await get(new Request("https://www.loom-labs.ai/zh/llms.txt"), {
        params: Promise.resolve({ locale: "zh" }),
      });
      expect(zh.headers.get("Content-Language")).toBe("zh-CN");
      expect(zh.headers.get("Link")).toContain("/zh/llms.txt");
      expect(await zh.text()).toContain("https://www.loom-labs.ai/zh/workspace");
      const en = await get(new Request("https://www.loom-labs.ai/en/llms.txt"), {
        params: Promise.resolve({ locale: "en" }),
      });
      expect(en.headers.get("Content-Language")).toBe("en");
      expect(en.headers.get("Link")).toBe('<https://www.loom-labs.ai/llms.txt>; rel="describedby"');
      expect(await en.text()).not.toContain("https://www.loom-labs.ai/en/");
      expect(
        (
          await get(new Request("https://www.loom-labs.ai/fr/llms.txt"), {
            params: Promise.resolve({ locale: "fr" }),
          })
        ).status,
      ).toBe(404);
    }
  });

  it("keeps JSON-LD inert and limits claims to the website and organization", () => {
    const hostile = { description: "</script><script>alert('fixture')</script>" };
    expect(serializeJsonLd(hostile)).not.toContain("<");
    expect(JSON.parse(serializeJsonLd(hostile))).toEqual(hostile);
    const structuredData = JSON.parse(serializeJsonLd(siteStructuredData));
    expect(structuredData["@graph"].map((node: { "@type": string }) => node["@type"])).toEqual([
      "Organization",
      "WebSite",
    ]);
    expect(structuredData["@graph"][1].inLanguage).toBe("en");
    expect(structuredData["@graph"][1].url).toBe(publicUrls[0]);
    expect(JSON.stringify(structuredData)).not.toMatch(
      /Offer|AggregateRating|Review|priceCurrency/,
    );
  });

  it.each(["en", "zh"] as const)(
    "publishes the visible product questions in the %s full-text feed",
    (locale) => {
      const { faq } = getSeoMessages(locale);
      const text = createLlmsFullText(locale);
      expect(text).toContain(`## ${faq.title}`);
      for (const { question, answer } of faq.items) {
        expect(text).toContain(`### ${question}\n\n${answer}`);
      }
    },
  );

  it.each(["en", "zh"] as const)(
    "keeps metadata and public text accurate for test/live %s requests",
    async (locale) => {
      for (const mode of ["test", "live"] as const) {
        runtime.mode = mode;
        const metadata = createPageMetadata("/pricing", locale, mode);
        const expectedTest = /test|Test|测试/;
        const content = [
          metadata.description,
          createLlmsIndex(locale, mode),
          createLlmsFullText(locale, mode),
        ].join("\n");
        expect(content).toContain("USD 1.00");
        if (mode === "test") expect(content).toMatch(expectedTest);
        else expect(content).not.toMatch(/Sandbox|test|Test|no real charge|不会真实扣款|测试/);
        const request = new Request(`https://www.loom-labs.ai/${locale}/llms.txt`);
        for (const get of [getLocalizedIndex, getLocalizedFullText]) {
          const response = await get(request, { params: Promise.resolve({ locale }) });
          const text = await response.text();
          expect(text).toBe(
            get === getLocalizedIndex
              ? createLlmsIndex(locale, mode)
              : createLlmsFullText(locale, mode),
          );
          expect(response.headers.get("Cache-Control")).toContain("must-revalidate");
        }
      }
    },
  );

  it("reads runtime mode for each root text request rather than freezing a build-time payment claim", async () => {
    const test = await (await getLlmsFullText()).text();
    expect(test).toContain("Creem Test mode");
    expect(test).not.toContain("Stripe");
    runtime.mode = "live";
    const live = await (await getLlmsFullText()).text();
    expect(live).toContain("USD 1.00");
    expect(live).not.toMatch(/Sandbox|test|no real charge/);
    expect(await (await getLlmsIndex()).text()).not.toMatch(/test mode|no real charge/);
    runtime.mode = "test";
    expect(await (await getLlmsFullText()).text()).toBe(test);
  });
});
