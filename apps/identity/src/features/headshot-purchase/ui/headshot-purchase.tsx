"use client";

import { useFormatter, useTranslations } from "@hotkey-tools/i18n";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@hotkey-tools/ui";
import {
  ArrowRight,
  Check,
  CircleAlert,
  CreditCard,
  Info,
  LoaderCircle,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { useHeadshotPurchase } from "../model/use-headshot-purchase";

export function HeadshotPurchase() {
  const t = useTranslations("Headshots");
  const format = useFormatter();
  const state = useHeadshotPurchase();
  const { account } = state;
  const product = account?.product;
  const price = product
    ? format.number(product.amount / 100, {
        style: "currency",
        currency: product.currency.toUpperCase(),
        currencyDisplay: "code",
      })
    : t("loadingPrice");
  const activePacks = account?.packs.filter((pack) => pack.status === "active") ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-3" aria-live="polite">
        {state.failure && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{state.failure}</AlertDescription>
          </Alert>
        )}
        {state.notice && (
          <Alert role="status">
            <Info aria-hidden="true" />
            <AlertDescription>{state.notice}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{t("productName")}</CardTitle>
              <Badge variant="outline">{t("oneTime")}</Badge>
            </div>
            <CardDescription>{t("productDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className="text-3xl font-semibold tracking-tight" aria-live="polite">
              {price}
            </p>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {[t("benefits.portraits"), t("benefits.formats"), t("benefits.redo")].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm leading-6 text-muted-foreground">{t("productBoundary")}</p>
            <div className="mt-auto space-y-3">
              <Button
                className="w-full"
                onClick={state.purchase}
                disabled={state.loading || state.purchasing || !product}
              >
                {state.purchasing ? (
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <CreditCard aria-hidden="true" />
                )}
                {state.loading
                  ? t("loading")
                  : state.purchasing
                    ? t("openingCheckout")
                    : account?.user
                      ? t("purchase")
                      : t("signInToPurchase")}
                {!state.loading && !state.purchasing && <ArrowRight aria-hidden="true" />}
              </Button>
              <p className="text-xs leading-6 text-muted-foreground">{t("testDisclaimer")}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="inline-flex items-center gap-2">
                <UserRound className="size-5" aria-hidden="true" />
                {t("accountTitle")}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={state.refresh}
                disabled={state.loading || state.refreshing || state.purchasing}
              >
                <RefreshCw
                  className={cn(state.refreshing && "motion-safe:animate-spin")}
                  aria-hidden="true"
                />
                {state.refreshing ? t("refreshing") : t("refresh")}
              </Button>
            </div>
            <CardDescription>
              {state.loading
                ? t("loadingAccount")
                : account?.user
                  ? (account.user.name ?? t("signedIn"))
                  : t("signedOut")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">{t("activePackages")}</p>
              <p className="mt-2 text-2xl font-semibold" aria-live="polite">
                {state.loading ? "—" : activePacks.length}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("packageRights", {
                  photos: activePacks.reduce((total, pack) => total + pack.photoCount, 0),
                  redos: activePacks.reduce((total, pack) => total + pack.redoCount, 0),
                })}
              </p>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{t("deliveryStatus")}</p>
            <p className="text-sm leading-6 text-muted-foreground">{t("repeatPurchase")}</p>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="headshot-orders-title" className="space-y-4">
        <h2 id="headshot-orders-title" className="text-lg font-semibold">
          {t("ordersTitle")}
        </h2>
        {account?.orders.length ? (
          <ul className="divide-y rounded-xl border bg-card">
            {account.orders.map((order) => {
              const pack = account.packs.find((item) => item.orderId === order.id);
              return (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-sm font-medium">
                      {t("orderLabel", { id: order.id.slice(0, 8) })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(order.createdAt, { dateStyle: "medium", timeZone: "UTC" })}
                    </p>
                    {pack && (
                      <p className="text-sm text-muted-foreground">
                        {pack.status === "revoked"
                          ? t("revokedRights")
                          : t("packageRights", { photos: pack.photoCount, redos: pack.redoCount })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm tabular-nums">
                      {format.number(order.amount / 100, {
                        style: "currency",
                        currency: order.currency.toUpperCase(),
                        currencyDisplay: "code",
                      })}
                    </span>
                    <Badge variant={order.status === "paid" ? "success" : "outline"}>
                      {t(`statuses.${order.status}`)}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border p-6 text-sm leading-6 text-muted-foreground">
            {state.loading
              ? t("loadingOrders")
              : account?.user
                ? t("emptyOrders")
                : t("privateOrders")}
          </p>
        )}
      </section>
    </div>
  );
}
