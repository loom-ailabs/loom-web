import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "@loom-ai/i18n";
import { describe, expect, it, vi } from "vitest";
import zh from "../../../../../../packages/i18n/messages/zh/sign-in.json";
import en from "../../../../../../packages/i18n/messages/en/sign-in.json";
import zhCommon from "../../../../../../packages/i18n/messages/zh/common.json";
import enCommon from "../../../../../../packages/i18n/messages/en/common.json";
import { SignInPage } from "./sign-in-page";

const preference = vi.hoisted(() => ({ locale: "zh" as "zh" | "en" }));
vi.mock("@loom-ai/i18n/navigation", () => ({
  useLocaleSwitcher: () => ({ locale: preference.locale, switchLocale: vi.fn() }),
}));

describe("login page composition", () => {
  it.each([
    ["zh", zh],
    ["en", en],
  ] as const)(
    "server renders %s and retains both server-validated provider URLs",
    (locale, messages) => {
      preference.locale = locale;
      const google =
        "https://login.loom-labs.ai/api/auth/login?provider=google&returnTo=https%3A%2F%2Fwww.loom-labs.ai%2Fworkspace%3Fsource%3Dlogin";
      const github = google.replace("provider=google", "provider=github");
      const markup = renderToStaticMarkup(
        <NextIntlClientProvider
          locale={locale}
          messages={{ SignIn: messages, Common: locale === "en" ? enCommon : zhCommon }}
          timeZone="UTC"
        >
          <SignInPage googleSignInUrl={google} githubSignInUrl={github} />
        </NextIntlClientProvider>,
      );
      expect(markup).toContain(messages.login.title);
      expect(markup).toContain(messages.login.google);
      expect(markup).toContain(messages.login.github);
      expect(markup).toMatch(/<section[^>]+class="[^"]*text-center/);
      expect(markup).not.toMatch(/产品愿景 · 视觉示意|Product vision · visual preview/);
      expect(markup).not.toMatch(/aria-label="(上一项|下一项|Previous item|Next item)"/);
      expect(markup).toContain(`href="https://www.loom-labs.ai/${locale === "zh" ? "zh" : ""}"`);
      expect(markup).toContain(`href="${google.replaceAll("&", "&amp;")}"`);
      expect(markup).toContain(`href="${github.replaceAll("&", "&amp;")}"`);
      const legalPrefix = `https://www.loom-labs.ai${locale === "zh" ? "/zh" : ""}`;
      expect(markup).toContain(`href="${legalPrefix}/privacy"`);
      expect(markup).toContain(`href="${legalPrefix}/terms"`);
      expect(markup).not.toContain('href="#');
    },
  );
});
