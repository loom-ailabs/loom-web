"use client";

import { useTranslations } from "@loom-ai/i18n";
import { useLocaleSwitcher } from "@loom-ai/i18n/navigation";
import { PreferencesMenu } from "@loom-ai/ui";

export function LegalControls() {
  const t = useTranslations("Common");
  const { locale, switchLocale } = useLocaleSwitcher();
  return (
    <PreferencesMenu
      locale={locale}
      onLocaleChange={switchLocale}
      labels={{
        settings: t("settings"),
        theme: t("theme"),
        light: t("light"),
        dark: t("dark"),
        system: t("system"),
        language: t("language"),
      }}
    />
  );
}
