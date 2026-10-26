"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "@loom-ai/i18n";

export type ProductProfile = {
  user: { id: string; name?: string; email?: string; picture?: string } | null;
  entitlements: { premium: boolean };
};

class AccessError extends Error {
  constructor(readonly type?: string) {
    super("access_request_failed");
  }
}
const billingConfigurationErrors = new Set(["invalid_billing_mode", "billing_mode_mismatch"]);
async function readApi<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AccessError();
  }
  const body = value as { code?: unknown; error?: { type?: unknown }; data?: unknown };
  if (!response.ok || body.code !== 0) {
    throw new AccessError(typeof body.error?.type === "string" ? body.error.type : undefined);
  }
  return body.data as T;
}

function useProductAccessState() {
  const t = useTranslations("Web");
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const [profile, setProfile] = useState<ProductProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [loginUrl, setLoginUrl] = useState("/api/auth/login");
  const initialLoadStarted = useRef(false);
  const requestRevision = useRef(0);
  const loadProfile = useCallback(async () => {
    const revision = ++requestRevision.current;
    try {
      const next = await readApi<ProductProfile>("/api/me");
      if (revision === requestRevision.current) {
        setProfile(next);
        if (!next.entitlements.premium) setUnlocked(false);
        setError("");
      }
    } catch (cause) {
      if (revision === requestRevision.current) {
        setProfile(null);
        setUnlocked(false);
        setError(
          cause instanceof AccessError && billingConfigurationErrors.has(cause.type ?? "")
            ? t("errorConfiguration")
            : cause instanceof AccessError && cause.type === "session_busy"
              ? t("errorBusy")
              : t("errorAccount"),
        );
      }
    } finally {
      setLoading(false);
    }
    return revision;
  }, [t]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadProfile();
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile]);
  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void loadProfile();
  }, [loadProfile]);
  useEffect(() => {
    const returnTo = new URL(window.location.href);
    returnTo.hash = "";
    setLoginUrl(`/api/auth/login?${new URLSearchParams({ returnTo: returnTo.toString() })}`);
  }, [pathname, query]);
  const run = async () => {
    const revision = ++requestRevision.current;
    setRunning(true);
    setUnlocked(false);
    setError("");
    try {
      const result = await readApi<{ unlocked: boolean }>("/api/premium");
      if (revision !== requestRevision.current) return;
      if (!result.unlocked) throw new AccessError();
      setUnlocked(true);
    } catch (cause) {
      if (revision !== requestRevision.current) return;
      // Refresh the current entitlement after a rejected operation, including refunds.
      const recoveryRevision = await loadProfile();
      if (recoveryRevision !== requestRevision.current) return;
      const kind = cause instanceof AccessError ? cause.type : undefined;
      setError(
        billingConfigurationErrors.has(kind ?? "")
          ? t("errorConfiguration")
          : kind === "premium_required"
            ? t("errorPremium")
            : kind === "unauthenticated" || kind === "session_renewal_failed"
              ? t("errorAuth")
              : kind === "session_busy"
                ? t("errorBusy")
                : t("errorPlan"),
      );
    } finally {
      setRunning(false);
    }
  };
  return { profile, loading, refreshing, running, unlocked, error, loginUrl, refresh, run };
}

type ProductAccess = ReturnType<typeof useProductAccessState>;
const ProductAccessContext = createContext<ProductAccess | null>(null);
export function ProductAccessProvider({ children }: { children: ReactNode }) {
  const access = useProductAccessState();
  return createElement(ProductAccessContext.Provider, { value: access }, children);
}
export function useProductAccess(): ProductAccess {
  const access = useContext(ProductAccessContext);
  if (!access) throw new Error("ProductAccessProvider is required");
  return access;
}
