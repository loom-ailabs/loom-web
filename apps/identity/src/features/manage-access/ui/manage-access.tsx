"use client";

import { Alert, AlertDescription, AlertTitle, Badge, Button, cn } from "@hotkey-tools/ui";
import type { PaymentMode } from "@hotkey-tools/identity-core/billing-types";
import { localizeUrl, useLocale, useTranslations } from "@hotkey-tools/i18n";
import { Link } from "@hotkey-tools/i18n/navigation";
import {
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  CreditCard,
  Info,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Settings2,
  UserRound,
} from "lucide-react";
import { useManageAccess } from "../model/use-manage-access";

export function ManageAccess({ billingMode }: { billingMode: PaymentMode }) {
  const t = useTranslations("Access");
  const locale = useLocale();
  const benefits = [t("benefits.account"), t("benefits.confirmation"), t("benefits.persistence")];
  const workspaceUrl = localizeUrl("https://www.loom-labs.ai/workspace", locale);
  const state = useManageAccess();
  const user = state.profile?.user;
  const disabled = state.loading || state.action !== null || state.configurationMissing;

  return (
    <section aria-labelledby="access-title" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="access-title" className="text-sm font-medium text-muted-foreground">
          {t("sectionTitle")}
        </h2>
        <Button
          variant="outline"
          className="h-9 px-3"
          onClick={state.refresh}
          disabled={state.refreshing || state.loading || state.action !== null}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn(state.refreshing && "motion-safe:animate-spin")}
          />
          {state.refreshing ? t("refreshing") : t("refresh")}
        </Button>
      </div>

      <div className="space-y-3" aria-live="polite">
        {state.failure && (
          <Alert variant={state.configurationMissing ? "warning" : "destructive"}>
            {state.configurationMissing ? (
              <Settings2 aria-hidden="true" />
            ) : (
              <CircleAlert aria-hidden="true" />
            )}
            <div className="min-w-0">
              <AlertTitle>
                {state.configurationMissing ? t("configurationTitle") : t("failureTitle")}
              </AlertTitle>
              <AlertDescription>
                <p className="break-words">{state.failure.message}</p>
                <p>{state.configurationMissing ? t("configurationHelp") : t("retryHelp")}</p>
              </AlertDescription>
            </div>
          </Alert>
        )}
        {state.notice && (
          <Alert role="status">
            <Info aria-hidden="true" />
            <p className="leading-relaxed">{state.notice}</p>
          </Alert>
        )}
        {state.featureResult && state.premium && (
          <Alert variant="success" role="status">
            <CircleCheck aria-hidden="true" />
            <p className="leading-relaxed">{state.featureResult}</p>
          </Alert>
        )}
      </div>

      <div className="loom-glass-strong grid divide-y rounded-xl px-6 md:grid-cols-2 md:divide-x md:divide-y-0">
        <section aria-labelledby="account-title" className="flex flex-col gap-6 py-8 md:pr-10">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <UserRound className="size-4" aria-hidden="true" />
              {t("account")}
            </span>
            <Badge variant={user ? "success" : "outline"}>
              {state.loading ? t("reading") : user ? t("signedIn") : t("signedOut")}
            </Badge>
          </div>
          <div className="space-y-3">
            <h3 id="account-title" className="break-words text-xl font-semibold tracking-tight">
              {state.loading
                ? t("readingAccount")
                : (user?.name ?? (user ? t("welcome") : t("startWithSignIn")))}
            </h3>
            <p className="break-words text-sm leading-6 text-muted-foreground">
              {user ? (user.email ?? t("signedInDescription")) : t("signInDescription")}
            </p>
          </div>
          <p className="text-sm leading-7 text-muted-foreground">
            {t("accountPersistence")}
            <br />
            {t("otherDevices")}
          </p>
          <div className="mt-auto pt-2">
            {user ? (
              <form action="/api/auth/logout" method="post">
                <Button type="submit" variant="outline" className="h-9">
                  <LogOut aria-hidden="true" />
                  {t("signOut")}
                </Button>
              </form>
            ) : state.loading || state.configurationMissing ? (
              <Button className="h-9" disabled>
                {state.loading && (
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                )}
                {state.loading ? t("readingAccountButton") : t("configurationLogin")}
              </Button>
            ) : (
              <Button asChild className="h-9">
                <a href={state.loginUrl}>
                  {t("signIn")}
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            )}
          </div>
        </section>

        <section aria-labelledby="product-title" className="flex flex-col gap-6 py-8 md:pl-10">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <LockKeyhole className="size-4" aria-hidden="true" />
              {t("access")}
            </span>
            <Badge variant={state.premium ? "success" : "outline"}>
              {state.premium ? t("unlocked") : t("oneTime")}
            </Badge>
          </div>
          <div className="space-y-3">
            <h3 id="product-title" className="text-xl font-semibold tracking-tight">
              Loom Pro
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {state.premium ? t("unlockedDescription") : t("purchaseDescription")}
            </p>
          </div>
          <ul className="space-y-3 text-sm text-muted-foreground">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2.5">
                <Check className="size-4 shrink-0" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>
          <div className="mt-auto space-y-3 pt-2">
            {state.premium ? (
              <>
                <Button asChild className="h-9 w-full">
                  <Link href={workspaceUrl}>
                    {t("back")}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 w-full"
                  onClick={state.usePremium}
                  disabled={disabled}
                >
                  {state.action ? (
                    <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                  ) : (
                    <CircleCheck aria-hidden="true" />
                  )}
                  {state.action ? t("checking") : t("checkAccess")}
                </Button>
              </>
            ) : (
              <Button className="h-9 w-full" onClick={state.purchase} disabled={disabled}>
                {state.action ? (
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <CreditCard aria-hidden="true" />
                )}
                {state.action ? t("waiting") : user ? t("checkout") : t("signInAndUnlock")}
                {!state.action && <ArrowRight aria-hidden="true" />}
              </Button>
            )}
            <p className="text-xs leading-6 text-muted-foreground">
              {t(`billing.${billingMode}.disclaimer`)}
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
