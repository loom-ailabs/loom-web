import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { NextIntlClientProvider } from "@hotkey-tools/i18n";
import { getMessagesForLocale } from "@hotkey-tools/i18n/server";
import { describe, expect, it, vi } from "vitest";
import { HomePage } from "./home-page";

const preference = vi.hoisted(() => ({ locale: "en" as "en" | "zh" }));
vi.mock("@hotkey-tools/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
  useLocaleSwitcher: () => ({ locale: preference.locale, switchLocale: vi.fn() }),
}));
vi.mock("@/features/product-workspace", async (load) => ({
  ...(await load<typeof import("@/features/product-workspace")>()),
  useProductAccess: () => ({
    profile: { user: null, entitlements: { premium: false } },
    loading: false,
    refreshing: false,
    running: false,
    unlocked: false,
    error: "",
    loginUrl: "/api/auth/login",
    refresh: vi.fn(),
    run: vi.fn(),
  }),
}));

describe("server-rendered product billing copy", () => {
  it.each(["en", "zh"] as const)(
    "keeps test and live copy separate across public %s pages",
    async (locale) => {
      preference.locale = locale;
      for (const mode of ["test", "live"] as const) {
        const messages = await getMessagesForLocale(locale, mode);
        for (const view of ["home", "pricing", "workspace", "vision"] as const) {
          const markup = renderToStaticMarkup(
            <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
              <HomePage view={view} billingMode={mode} />
            </NextIntlClientProvider>,
          );
          expect(markup).toContain("Loom");
          expect(markup).toContain('href="/privacy"');
          expect(markup).toContain('href="/terms"');
          expect(markup).toContain(messages.Common.privacy);
          expect(markup).toContain(messages.Common.terms);
          expect(markup).not.toContain("Stripe");
          if (view !== "vision") {
            if (mode === "live") expect(markup).toContain("USD 1.00");
            else {
              expect(markup).toMatch(/Test payments only|当前付款仅用于测试/);
              expect(markup).toContain("Creem");
            }
          }
          if (mode === "live")
            expect(markup).not.toMatch(
              /Sandbox|test payment|Test payments|no real charge|不会产生真实扣款|一次性测试付款/,
            );
        }
      }
    },
  );
});
