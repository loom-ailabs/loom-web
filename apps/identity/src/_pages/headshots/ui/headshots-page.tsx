"use client";

import Image from "next/image";
import { localizeUrl, useTranslations } from "@loom-ai/i18n";
import { Link, useLocaleSwitcher } from "@loom-ai/i18n/navigation";
import { Alert, AlertDescription, Badge, PreferencesMenu } from "@loom-ai/ui";
import { FlaskConical, Info } from "lucide-react";
import { HeadshotPurchase } from "@/features/headshot-purchase";

export function HeadshotsPage() {
  const t = useTranslations("Headshots");
  const { locale, switchLocale } = useLocaleSwitcher();
  return (
    <div className="loom-atmosphere mx-auto flex min-h-screen max-w-5xl flex-col px-5 sm:px-8">
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b py-4">
        <Link
          href={localizeUrl("https://www.loom-labs.ai/", locale)}
          className="inline-flex items-center gap-2.5 rounded-md text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("homeLabel")}
        >
          <Image
            src="/loom-mark.svg"
            alt=""
            width={36}
            height={36}
            className="size-9 opacity-85 dark:invert"
            unoptimized
            priority
          />
          Loom AI
        </Link>
        <div className="flex items-center gap-3">
          <Badge variant="warning">
            <FlaskConical className="size-3.5" aria-hidden="true" />
            {t("testMode")}
          </Badge>
          <PreferencesMenu
            locale={locale}
            onLocaleChange={switchLocale}
            labels={{
              settings: t("preferences.settings"),
              theme: t("preferences.theme"),
              light: t("preferences.light"),
              dark: t("preferences.dark"),
              system: t("preferences.system"),
              language: t("preferences.language"),
            }}
          />
        </div>
      </header>
      <main className="flex-1 space-y-8 py-10 sm:py-14">
        <div className="max-w-2xl space-y-4">
          <p className="text-xs font-medium tracking-widest text-link">{t("eyebrow")}</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>
          <p className="text-sm leading-7 text-muted-foreground">{t("description")}</p>
        </div>
        <Alert variant="warning">
          <Info aria-hidden="true" />
          <AlertDescription>{t("availability")}</AlertDescription>
        </Alert>
        <HeadshotPurchase />
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t py-6 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} Loom AI</span>
        <nav aria-label={t("legalLinks")} className="flex items-center gap-4">
          <Link href={localizeUrl("https://www.loom-labs.ai/privacy", locale)}>{t("privacy")}</Link>
          <Link href={localizeUrl("https://www.loom-labs.ai/terms", locale)}>{t("terms")}</Link>
          <Link href="/">{t("accountLink")}</Link>
        </nav>
      </footer>
    </div>
  );
}
