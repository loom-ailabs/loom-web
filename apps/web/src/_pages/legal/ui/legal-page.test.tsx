import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "@hotkey-tools/i18n";
import { getLegalMessages, getMessagesForLocale } from "@hotkey-tools/i18n/server";
import { describe, expect, it, vi } from "vitest";
import { LegalPage } from "./legal-page";

const preference = vi.hoisted(() => ({ locale: "en" as "en" | "zh" }));
vi.mock("@hotkey-tools/i18n/navigation", () => ({
  useLocaleSwitcher: () => ({ locale: preference.locale, switchLocale: vi.fn() }),
}));

describe("public legal notices", () => {
  it.each([
    ["en", "privacy"],
    ["zh", "privacy"],
    ["en", "terms"],
    ["zh", "terms"],
  ] as const)(
    "server renders the entire %s %s notice with discoverable localized links",
    async (locale, kind) => {
      preference.locale = locale;
      const legal = await getLegalMessages(locale);
      const markup = renderToStaticMarkup(
        <NextIntlClientProvider
          locale={locale}
          messages={await getMessagesForLocale(locale)}
          timeZone="UTC"
        >
          {await LegalPage({ kind, locale })}
        </NextIntlClientProvider>,
      );
      const page = new DOMParser().parseFromString(markup, "text/html");
      expect(page.querySelector("h1")?.textContent).toBe(legal[kind].title);
      expect(page.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-26");
      expect(page.querySelectorAll("article h2")).toHaveLength(legal[kind].sections.length);
      expect(page.querySelector("article")?.textContent).toContain(legal[kind].lead);
      for (const section of legal[kind].sections) {
        for (const paragraph of section.paragraphs)
          expect(page.querySelector("article")?.textContent).toContain(paragraph);
      }
      const prefix = locale === "zh" ? "/zh" : "";
      const footerLinks = Array.from(page.querySelectorAll("footer a"), (link) =>
        link.getAttribute("href"),
      );
      expect(footerLinks).toEqual([
        prefix || "/",
        `${prefix}/privacy`,
        `${prefix}/terms`,
        "mailto:boylucky2012@gmail.com",
      ]);
      expect(markup).not.toContain('href="#');
    },
  );

  it("accurately distinguishes session expiry, manual deletion, test payments, and model capabilities", async () => {
    const en = await getLegalMessages("en");
    const privacy = en.privacy.sections.flatMap((section) => section.paragraphs).join("\n");
    expect(privacy).toContain("absolute limit of 14 days");
    expect(privacy).toContain("up to 10 minutes");
    expect(privacy).toContain("one year");
    expect(privacy).toContain("it does not delete your account");
    expect(privacy).toContain("There is no single automatic deletion mechanism");
    expect(privacy).toContain("does not send this data to model services");
    expect(privacy).toContain("do not charge real money");
    const terms = en.terms.sections.flatMap((section) => section.paragraphs).join("\n");
    expect(terms).toContain("does not generate model output");
    expect(terms).toContain("USD 1.00 amount for Loom Pro");
    expect(terms).toContain("USD 9.99 amount for the separate Professional Headshot Pack");
    expect(terms).toContain("Creem Test mode");
    expect(privacy).toContain("Historical Stripe Sandbox orders");
    expect(terms).toContain("do not establish a live purchase or refund policy");
  });
});
