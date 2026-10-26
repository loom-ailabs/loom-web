"use client";

import { useTranslations } from "@hotkey-tools/i18n";
import { useLocaleSwitcher } from "@hotkey-tools/i18n/navigation";
import { PreferencesMenu } from "@hotkey-tools/ui";

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
