"use client";

import { localizeUrl } from "@loom-ai/i18n/routing";
import type { PaymentMode } from "@loom-ai/identity-core/billing-types";

import Image from "next/image";
import { Button, GlassSurface } from "@loom-ai/ui";
import { useLocale, useTranslations } from "@loom-ai/i18n";
import { Link } from "@loom-ai/i18n/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  Command,
  Layers3,
  PencilLine,
  Sparkles,
} from "lucide-react";
import { HeroBanner } from "./hero-banner";
import { PlatformIntroduction } from "./platform-introduction";
import { AccountMenu, AccountProfile } from "./profile-menu";
import { ProductWorkspace, useProductAccess } from "@/features/product-workspace";

function Brand({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Web");
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={t("brandHome")}
    >
      <Image
        src="/loom-mark.svg"
        alt=""
        width={36}
        height={36}
        className="size-9 opacity-85 dark:invert"
        unoptimized
      />
      <span className="text-lg font-semibold tracking-tight">
        Loom<span className="ml-1 font-normal text-muted-foreground">AI</span>
      </span>
      {!compact && (
        <span className="ml-1 hidden rounded border px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline">
          LABS
        </span>
      )}
    </Link>
  );
}

type ProductView = "home" | "vision" | "workspace" | "pricing" | "account";
export function HomePage({
  view = "home",
  billingMode,
}: {
  view?: ProductView;
  billingMode: PaymentMode;
}) {
  const t = useTranslations("Web");
  const locale = useLocale();
  const common = useTranslations("Common");
  const access = useProductAccess();
  const premium = access.profile?.entitlements.premium ?? false;
  const checkoutUrl = localizeUrl("https://checkout.loom-labs.ai/", locale);
  const capabilities = [
    {
      number: "01",
      icon: PencilLine,
      title: t("capability1Title"),
      body: t("capability1Body"),
      label: t("capability1Label"),
    },
    {
      number: "02",
      icon: Layers3,
      title: t("capability2Title"),
      body: t("capability2Body"),
      label: t("capability2Label"),
    },
    {
      number: "03",
      icon: Sparkles,
      title: t("capability3Title"),
      body: t("capability3Body"),
      label: t("capability3Label"),
    },
  ];
  return (
    <div className="loom-atmosphere flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      <header className="loom-glass-nav sticky top-0 z-30 border-x-0 border-t-0">
        <nav
          className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-3 px-5 sm:px-6 lg:px-10"
          aria-label={t("navLabel")}
        >
          <Brand />
          <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <Link className="transition-colors hover:text-foreground" href="/vision">
              {t("vision")}
            </Link>
            <Link className="transition-colors hover:text-foreground" href="/workspace">
              {t("workspace")}
            </Link>
            <Link className="transition-colors hover:text-foreground" href="/pricing">
              {t("pricing")}
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex w-32 shrink-0 items-center justify-end gap-2">
              <AccountMenu access={access} />
            </div>
            <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
              <Link href="/workspace">
                {t("enterWorkspace")}
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </nav>
        <nav
          aria-label={t("navLabel")}
          className="flex items-center justify-center gap-8 border-t px-5 py-3 text-xs text-muted-foreground md:hidden"
        >
          <Link href="/vision">{t("vision")}</Link>
          <Link href="/workspace">{t("workspace")}</Link>
          <Link href="/pricing">{t("pricing")}</Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 lg:px-10">
        {view !== "home" && (
          <h1 className="sr-only">
            {view === "workspace"
              ? t("workName")
              : view === "vision"
                ? t("vision")
                : view === "account"
                  ? t("accountTitle")
                  : t("pricing")}
          </h1>
        )}
        {view === "account" && <AccountProfile access={access} />}
        {view === "home" && <HeroBanner />}
        {(view === "home" || view === "vision") && (
          <section className="pt-20 sm:pt-28">
            <p className="mb-4 font-mono text-xs tracking-widest text-link">{t("visionLabel")}</p>
            <h2 className="max-w-3xl text-3xl leading-snug font-medium tracking-tight sm:text-4xl">
              {t("visionTitle")}
              <br />
              <span className="text-muted-foreground">{t("visionAccent")}</span>
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {capabilities.map(({ number, icon: Icon, title, body, label }) => (
                <article key={number} className="loom-glass rounded-xl p-6 lg:p-7">
                  <div className="mb-6 flex items-center justify-between">
                    <Icon className="size-6 text-link" />
                    <span className="font-mono text-xs text-muted-foreground">{number}</span>
                  </div>
                  <h3 className="text-lg font-medium tracking-tight">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p>
                  <p className="mt-6 font-mono text-xs tracking-wide text-muted-foreground/70">
                    {label}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}
        {(view === "home" || view === "vision") && <PlatformIntroduction />}
        {(view === "home" || view === "workspace") && (
          <ProductWorkspace access={access} billingMode={billingMode} />
        )}
        {(view === "home" || view === "pricing") && (
          <section className="border-t py-20 sm:py-28">
            <div className="grid gap-10 lg:grid-cols-3">
              <div>
                <p className="mb-3 font-mono text-xs tracking-widest text-link">
                  {t("pricingLabel")}
                </p>
                <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
                  {t("pricingTitle")}
                  <br />
                  {t("pricingAccent")}
                </h2>
                <p className="mt-5 max-w-xs text-sm leading-7 text-muted-foreground">
                  {t("pricingBody")}
                </p>
                <p className="mt-4 text-xs leading-6 text-muted-foreground">
                  {t(`billing.${billingMode}.notice`)}
                </p>
              </div>
              <GlassSurface className="flex flex-col p-7">
                <Box className="size-5 text-muted-foreground" />
                <h3 className="mt-5 text-lg font-medium">Loom Explore</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t("exploreBody")}</p>
                <p className="mt-7 text-4xl tracking-tight">{t("free")}</p>
                <ul className="my-7 space-y-3 text-sm text-muted-foreground">
                  {[t("exploreBenefit1"), t("exploreBenefit2"), t("exploreBenefit3")].map((x) => (
                    <li key={x} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0" />
                      {x}
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" className="mt-auto w-full">
                  <Link href="/workspace">
                    {t("startExploring")}
                    <ArrowRight />
                  </Link>
                </Button>
              </GlassSurface>
              <GlassSurface
                intensity="raised"
                className="relative flex flex-col border-link/40 p-7"
              >
                <div className="flex items-center justify-between">
                  <Command className="size-5 text-link" />
                  <span className="rounded border border-link/30 bg-primary/10 px-2 py-1 text-xs text-link">
                    {t(`billing.${billingMode}.mode`)}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-medium">Loom Pro</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t("proBody")}</p>
                <p className="mt-7 text-4xl tracking-tight">
                  $1
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t(`billing.${billingMode}.label`)}
                  </span>
                </p>
                <ul className="my-7 space-y-3 text-sm text-muted-foreground">
                  {[t("proBenefit1"), t("proBenefit2"), t("proBenefit3")].map((x) => (
                    <li key={x} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-link" />
                      {x}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-auto w-full">
                  {premium ? (
                    <Link href="/workspace">
                      {t("openPro")}
                      <ArrowRight />
                    </Link>
                  ) : (
                    <a href={access.profile?.user ? checkoutUrl : access.loginUrl}>
                      {access.profile?.user ? t("unlock") : t("loginToUnlock")}
                      <ArrowRight />
                    </a>
                  )}
                </Button>
              </GlassSurface>
            </div>
          </section>
        )}
        {view === "home" && (
          <section className="loom-glass my-12 rounded-2xl px-6 py-16 text-center sm:my-16 sm:py-20">
            <p className="mb-5 font-mono text-xs tracking-widest text-link">{t("flowLine")}</p>
            <h2 className="text-3xl font-medium tracking-tight sm:text-5xl">{t("closingTitle")}</h2>
            <Button asChild size="lg" className="mt-8">
              <Link href="/workspace">
                {t("enterWorkspace")}
                <ArrowUpRight />
              </Link>
            </Button>
          </section>
        )}
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-8 lg:px-10">
          <Brand compact />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Loom AI · {t("footerVision")}
          </p>
          <nav
            aria-label={common("legalLinks")}
            className="flex flex-wrap items-center gap-5 text-xs text-muted-foreground"
          >
            <Link href="/pricing" className="hover:text-foreground">
              {t("footerLink")}
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              {common("privacy")}
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              {common("terms")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
