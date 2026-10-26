import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { NextIntlClientProvider } from "@loom-ai/i18n";
import { getMessagesForLocale } from "@loom-ai/i18n/server";
import { describe, expect, it, vi } from "vitest";
import { IdentityPage } from "./identity-page";

const preference = vi.hoisted(() => ({ locale: "en" as "en" | "zh" }));
vi.mock("@loom-ai/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
  useLocaleSwitcher: () => ({ locale: preference.locale, switchLocale: vi.fn() }),
}));

describe("server-rendered checkout billing copy", () => {
  it.each(["en", "zh"] as const)(
    "retains Sandbox safeguards and shows only live purchase copy in %s",
    async (locale) => {
      preference.locale = locale;
      for (const mode of ["test", "live"] as const) {
        const messages = await getMessagesForLocale(locale, mode);
        const markup = renderToStaticMarkup(
          <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
            <IdentityPage billingMode={mode} />
          </NextIntlClientProvider>,
        );
        if (mode === "test") {
          expect(markup).toMatch(/Creem Test mode|Creem 测试模式/);
          expect(markup).toMatch(/No real charge|不会真实扣款/);
        } else {
          expect(markup).toContain("USD 1.00");
          expect(markup).toContain("Creem");
          expect(markup).not.toMatch(
            /Sandbox|Test payment|test payment|No real charge|不会真实扣款|测试支付/,
          );
        }
        expect(markup).not.toContain("Stripe");
        const legalPrefix = `https://www.loom-labs.ai${locale === "zh" ? "/zh" : ""}`;
        expect(markup).toContain(`href="${legalPrefix}/privacy"`);
        expect(markup).toContain(`href="${legalPrefix}/terms"`);
        expect(markup).not.toContain('href="#');
      }
    },
  );
});
