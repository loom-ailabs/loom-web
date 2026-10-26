"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { localizePath, useLocale, useTranslations } from "@loom-ai/i18n";
import { ApiRequestError } from "@/shared/api";
import {
  createHeadshotCheckout,
  fetchHeadshotAccount,
  fetchHeadshotOrder,
} from "../api/headshot-api";
import type { HeadshotAccount } from "./types";

const configurationCodes = [1001, 1002, 1003, 1004, 1005, 1006, 1009, 4005];
const closedCheckoutCodes = [3004, 3005, 3006];

export function useHeadshotPurchase() {
  const t = useTranslations("Headshots");
  const locale = useLocale();
  const [account, setAccount] = useState<HeadshotAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pollVersion, setPollVersion] = useState(0);
  const requestId = useRef<string | null>(null);
  const purchaseInFlight = useRef(false);
  const accountReadVersion = useRef(0);

  const errorMessage = useCallback(
    (error: unknown, fallback: "load" | "purchase" | "order") => {
      if (error instanceof ApiRequestError) {
        if (configurationCodes.includes(error.code ?? 0)) return t("errors.configuration");
        if ([1007, 2002].includes(error.code ?? 0)) return t("errors.authentication");
        if (closedCheckoutCodes.includes(error.code ?? 0)) return t("errors.closed");
        if (error.code === 2001) return t("errors.origin");
      }
      return t(`errors.${fallback}`);
    },
    [t],
  );

  const reload = useCallback(async (signal?: AbortSignal) => {
    const version = ++accountReadVersion.current;
    const data = await fetchHeadshotAccount(signal);
    if (!signal?.aborted && version === accountReadVersion.current) setAccount(data);
    return data;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailure(errorMessage(error, "load"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload, errorMessage]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const purchaseId = query.get("purchase_id");
    if (query.get("checkout") !== "success" || !purchaseId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    async function poll() {
      try {
        const order = await fetchHeadshotOrder(purchaseId!, controller.signal);
        if (controller.signal.aborted) return;
        if (order.status !== "pending") {
          await reload(controller.signal);
          if (controller.signal.aborted) return;
          setNotice(t(`notices.${order.status}`));
          requestId.current = null;
          if (order.status === "paid") {
            window.history.replaceState({}, "", window.location.pathname);
          }
          return;
        }
        attempts += 1;
        setNotice(t(attempts < 15 ? "notices.confirming" : "notices.pending"));
        if (attempts < 15) timer = setTimeout(poll, 2000);
      } catch (error) {
        if (!controller.signal.aborted) setFailure(errorMessage(error, "order"));
      }
    }
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [reload, pollVersion, t, errorMessage]);

  async function refresh() {
    setRefreshing(true);
    setFailure(null);
    setPollVersion((value) => value + 1);
    try {
      await reload();
    } catch (error) {
      setFailure(errorMessage(error, "load"));
    } finally {
      setRefreshing(false);
    }
  }

  async function purchase() {
    if (purchaseInFlight.current || loading || !account) return;
    if (!account.user) {
      const target = new URL(localizePath("/headshots", locale), window.location.origin);
      window.location.assign(`/api/auth/login?returnTo=${encodeURIComponent(target.toString())}`);
      return;
    }
    purchaseInFlight.current = true;
    setPurchasing(true);
    setFailure(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const checkout = await createHeadshotCheckout(requestId.current, locale);
      if (checkout.status === "paid") {
        await reload();
        requestId.current = null;
        setNotice(t("notices.paid"));
      } else if (checkout.checkoutUrl) {
        window.location.assign(checkout.checkoutUrl);
      } else {
        setFailure(t("errors.purchase"));
      }
    } catch (error) {
      if (error instanceof ApiRequestError && closedCheckoutCodes.includes(error.code ?? 0)) {
        requestId.current = null;
      }
      setFailure(errorMessage(error, "purchase"));
    } finally {
      purchaseInFlight.current = false;
      setPurchasing(false);
    }
  }

  return { account, loading, refreshing, purchasing, failure, notice, refresh, purchase };
}
