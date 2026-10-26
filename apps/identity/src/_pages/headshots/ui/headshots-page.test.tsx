import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { NextIntlClientProvider } from "@hotkey-tools/i18n";
import { getHeadshotMessages } from "@hotkey-tools/i18n/server";
import { describe, expect, it, vi } from "vitest";
import { HeadshotsPage } from "./headshots-page";

const preferences = vi.hoisted(() => ({ locale: "en" as "en" | "zh" }));
vi.mock("@hotkey-tools/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
  useLocaleSwitcher: () => ({ locale: preferences.locale, switchLocale: vi.fn() }),
}));

describe("headshot test purchase page", () => {
  it.each(["en", "zh"] as const)(
    "renders the %s package scope without claiming photo delivery",
    async (locale) => {
      preferences.locale = locale;
      const markup = renderToStaticMarkup(
        <NextIntlClientProvider
          locale={locale}
          messages={{ Headshots: await getHeadshotMessages(locale) }}
          timeZone="UTC"
        >
          <HeadshotsPage />
        </NextIntlClientProvider>,
      );
      expect(markup).toMatch(/4 portraits|4 张/);
      expect(markup).toMatch(/1 redo|1 次重做/);
      expect(markup).toMatch(/No real payment|不会真实扣款/);
      expect(markup).toMatch(/not available yet|尚未开放/);
      expect(markup).not.toMatch(/href="#|download=/);
      const prefix = `https://www.loom-labs.ai${locale === "zh" ? "/zh" : ""}`;
      expect(markup).toContain(`href="${prefix}/privacy"`);
      expect(markup).toContain(`href="${prefix}/terms"`);
    },
  );
});
