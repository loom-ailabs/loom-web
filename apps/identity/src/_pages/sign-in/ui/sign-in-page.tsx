"use client";

import Image from "next/image";
import { localizeUrl, useTranslations } from "@hotkey-tools/i18n";
import { useLocaleSwitcher } from "@hotkey-tools/i18n/navigation";
import { Alert, AlertDescription, AlertTitle, Button, PreferencesMenu } from "@hotkey-tools/ui";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import { LoginShowcase } from "./login-showcase";
import { GithubMark, GoogleMark } from "./social-icons";

export type SignInPageProps = {
  googleSignInUrl: string;
  githubSignInUrl: string;
  notice?: { title: string; message: string };
};

export function SignInPage({ googleSignInUrl, githubSignInUrl, notice }: SignInPageProps) {
  const t = useTranslations("SignIn.login");
  const common = useTranslations("Common");
  const { locale, switchLocale } = useLocaleSwitcher();
  const homeUrl = localizeUrl("https://www.loom-labs.ai/", locale);
  return (
    <div className="loom-atmosphere grid min-h-svh bg-background lg:grid-cols-2">
      <div className="flex min-h-svh flex-col px-6 pb-6 pt-5 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between gap-5">
          <a
            href={homeUrl}
            aria-label={t("homeLabel")}
            className="flex items-center gap-2.5 rounded-md text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          </a>
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
        </header>
        <main className="flex flex-1 items-center justify-center py-16">
          <section aria-labelledby="sign-in-title" className="w-full max-w-sm text-center">
            <p className="mb-4 text-xs font-medium tracking-widest text-muted-foreground">
              {t("eyebrow")}
            </p>
            <h1
              id="sign-in-title"
              className="text-3xl font-medium leading-tight tracking-tight sm:text-4xl"
            >
              {t("title")}
            </h1>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{t("description")}</p>
            {notice ? (
              <Alert variant="warning" className="mt-6">
                <CircleAlert aria-hidden="true" />
                <div>
                  <AlertTitle>{notice.title}</AlertTitle>
                  <AlertDescription>{notice.message}</AlertDescription>
                </div>
              </Alert>
            ) : null}
            <div className="mt-8 space-y-3">
              <Button
                asChild
                variant="outline"
                className="h-11 w-full rounded-full bg-control/50 text-foreground hover:bg-control-hover"
              >
                <a href={googleSignInUrl}>
                  <GoogleMark />
                  {t("google")}
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 w-full rounded-full bg-control/50 text-foreground hover:bg-control-hover"
              >
                <a href={githubSignInUrl}>
                  <GithubMark />
                  {t("github")}
                </a>
              </Button>
            </div>
            <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">
              {t("firstTime")}
            </p>
            <div className="mt-7 border-t pt-6">
              <p className="flex items-start justify-center gap-2 text-xs leading-6 text-muted-foreground">
                <ShieldCheck className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
                {t("security")}
              </p>
            </div>
          </section>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Loom AI</span>
          <nav aria-label={common("legalLinks")} className="flex flex-wrap items-center gap-4">
            <a
              href={localizeUrl("https://www.loom-labs.ai/privacy", locale)}
              className="rounded-md hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {common("privacy")}
            </a>
            <a
              href={localizeUrl("https://www.loom-labs.ai/terms", locale)}
              className="rounded-md hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {common("terms")}
            </a>
          </nav>
          <a
            href={homeUrl}
            className="inline-flex items-center gap-1.5 rounded-md outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t("back")}
          </a>
        </footer>
      </div>
      <LoginShowcase />
    </div>
  );
}
