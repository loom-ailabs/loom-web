"use client";

import { localizeUrl } from "@hotkey-tools/i18n/routing";
import type { PaymentMode } from "@hotkey-tools/identity-core/billing-types";

import { useLocale, useTranslations } from "@hotkey-tools/i18n";
import { Button, GlassSurface, cn } from "@hotkey-tools/ui";
import {
  ArrowRight,
  Check,
  CircleDot,
  Command,
  FileText,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { useProductAccess } from "../model/use-product-access";

type Access = ReturnType<typeof useProductAccess>;
export function ProductWorkspace({
  access,
  billingMode,
}: {
  access: Access;
  billingMode: PaymentMode;
}) {
  const t = useTranslations("Web");
  const locale = useLocale();
  const premium = access.profile?.entitlements.premium ?? false;
  return (
    <section id="workspace" className="py-20 sm:py-28">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-3 font-mono text-xs tracking-widest text-link">
            {t("workspaceLabelTag")}
          </p>
          <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">{t("workTitle")}</h2>
        </div>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">{t("workBody")}</p>
      </div>
      <GlassSurface intensity="raised" className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4 text-xs">
          <span className="flex items-center gap-2 font-medium">
            <Command className="size-4 text-link" /> {t("workName")}
          </span>
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-link" />
            {t("workspaceLabel")}
          </span>
        </div>
        <div className="grid md:grid-cols-4">
          <aside className="hidden border-r bg-background/40 p-4 md:block">
            <p className="px-3 pb-4 text-xs text-muted-foreground">{t("personalSpace")}</p>
            <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-link">
              <Sparkles className="size-4" />
              {t("inspirationDesk")}
            </div>
            <div className="mt-2 flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <FileText className="size-4" />
              {t("planTitle")}
            </div>
            <div className="mt-24 border-t px-3 pt-4 text-xs leading-6 text-muted-foreground">
              {t("footerVision")}
            </div>
          </aside>
          <div className="p-6 sm:p-10 md:col-span-3">
            <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CircleDot className="size-3.5 text-link" />
                {premium
                  ? t("proUnlocked")
                  : access.profile?.user
                    ? t("signedInFree")
                    : t("guestFree")}
              </div>
              <div className="flex items-center gap-3">
                {access.profile?.user && (
                  <form action="/api/auth/logout" method="post">
                    <button
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      type="submit"
                    >
                      <LogOut className="size-3" />
                      {t("logout")}
                    </button>
                  </form>
                )}
                <button
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                  disabled={access.loading || access.refreshing}
                  onClick={() => void access.refresh()}
                >
                  <RefreshCw
                    className={cn(
                      "size-3",
                      access.refreshing && "animate-spin motion-reduce:animate-none",
                    )}
                  />
                  {t("refreshAccess")}
                </button>
              </div>
            </div>
            <h3 className="text-xl font-medium">{t("ideaTitle")}</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{t("ideaBody")}</p>
            <div className="mt-6 rounded-lg border bg-background p-4 text-sm leading-7 text-foreground/80">
              {t("planDescription")}
              <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span>{t("planCategory")}</span>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {premium ? (
                <Button
                  disabled={access.running || access.loading}
                  onClick={() => void access.run()}
                >
                  <Sparkles />
                  {access.running ? t("checkingAccess") : t("openPlan")}
                  <ArrowRight />
                </Button>
              ) : (
                <Button asChild>
                  <a
                    href={
                      access.profile?.user
                        ? localizeUrl("https://checkout.loom-labs.ai/", locale)
                        : access.loginUrl
                    }
                  >
                    {access.profile?.user ? t("unlockPro") : t("loginToExplore")}
                    <ArrowRight />
                  </a>
                </Button>
              )}
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LockKeyhole className="size-3" />
                {premium ? t("checkEveryRun") : t("needsUnlock")}
              </span>
            </div>
            {access.error && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {access.error}
              </p>
            )}
            {!premium && (
              <p className="mt-4 text-xs leading-6 text-muted-foreground">
                {t(`billing.${billingMode}.notice`)}
              </p>
            )}
            {access.unlocked && (
              <div className="mt-6 border-t pt-6" role="status">
                <p className="mb-4 text-xs font-medium text-link">{t("accessVerified")}</p>
                <ol className="space-y-3">
                  {[t("step1"), t("step2"), t("step3")].map((step) => (
                    <li key={step} className="flex gap-3 text-sm leading-6">
                      <Check className="mt-1 size-4 shrink-0 text-link" />
                      {step}
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-xs leading-6 text-muted-foreground">{t("planGuidance")}</p>
              </div>
            )}
          </div>
        </div>
      </GlassSurface>
    </section>
  );
}
