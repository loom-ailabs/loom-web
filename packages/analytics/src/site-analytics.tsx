"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import type { AnalyticsConfiguration, AnalyticsCopy } from "./contract";
import {
  CONSENT_COOKIE,
  TEST_COOKIE,
  disableTag,
  initializeTag,
  isProductionBrowser,
  isPublicPath,
  pageLocation,
  readConsent,
  readCookie,
  referrerOrigin,
  stopAnalytics,
  writePreference,
  type AnalyticsWindow,
  type Consent,
} from "./browser";
import { ConsentControls } from "./consent-controls";

type Props = {
  configuration: AnalyticsConfiguration | null;
  copy: AnalyticsCopy;
  privacyHref: string;
};

/** Own gtag initialization lets consent and sanitized URLs precede every event. */
export function SiteAnalytics({ configuration, copy, privacyHref }: Props) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<Consent>(null);
  const [excluded, setExcluded] = useState(false);
  const [production, setProduction] = useState(false);
  const [tagReady, setTagReady] = useState(false);
  const initialized = useRef(false);
  const lastPage = useRef<string | null>(null);
  const preferencesChannel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!configuration || !isProductionBrowser(configuration, new URL(window.location.href)))
      return;
    const test = new URL(window.location.href).searchParams.get("analytics_test");
    if (test === "1" || test === "0") writePreference(TEST_COOKIE, test === "1" ? "1" : "");
    const testBrowser = readCookie(TEST_COOKIE) === "1";
    if (testBrowser) stopAnalytics(configuration);
    setProduction(true);
    setConsent(readConsent());
    setExcluded(testBrowser);
    setReady(true);
    const synchronizePreferences = () => {
      const nextConsent = readConsent();
      const nextExcluded = readCookie(TEST_COOKIE) === "1";
      setConsent(nextConsent);
      setExcluded(nextExcluded);
      if (nextConsent !== "granted" || nextExcluded) {
        stopAnalytics(configuration);
        if (initialized.current) window.location.reload();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") synchronizePreferences();
    };
    if (typeof window.BroadcastChannel === "function") {
      const channel = new BroadcastChannel("loom-analytics-preferences");
      channel.onmessage = synchronizePreferences;
      preferencesChannel.current = channel;
    }
    // Cookie choices can change in another tab or Loom subdomain independently of account state.
    window.addEventListener("focus", synchronizePreferences);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", synchronizePreferences);
      document.removeEventListener("visibilitychange", onVisible);
      preferencesChannel.current?.close();
      preferencesChannel.current = null;
    };
  }, [configuration?.application, configuration?.measurementId]);

  const publicPage = configuration !== null && isPublicPath(configuration, pathname);
  const allowed = ready && production && publicPage && consent === "granted" && !excluded;

  useEffect(() => {
    if (!configuration || !ready) return;
    if (!allowed) {
      disableTag(configuration);
      lastPage.current = null;
      return;
    }
    if (readConsent() !== "granted" || readCookie(TEST_COOKIE) === "1") {
      stopAnalytics(configuration);
      setConsent(readConsent());
      setExcluded(readCookie(TEST_COOKIE) === "1");
      if (initialized.current) window.location.reload();
      return;
    }
    const location = pageLocation(new URL(window.location.href), pathname);
    const target = window as AnalyticsWindow;
    target[`ga-disable-${configuration.measurementId}`] = false;
    if (!initialized.current) {
      initializeTag(configuration, location);
      initialized.current = true;
      setTagReady(true);
    }
    if (lastPage.current === location) return;
    lastPage.current = location;
    const properties = {
      page_location: location,
      page_referrer: referrerOrigin(document.referrer),
      page_title: "Loom AI",
    };
    // Update stream defaults too: its automatic engagement events must never recover a raw URL.
    target.gtag?.("config", configuration.measurementId, {
      ...properties,
      update: true,
      send_page_view: false,
    });
    target.gtag?.("event", "page_view", properties);
  }, [allowed, configuration?.measurementId, pathname, ready]);

  if (!configuration || !ready || !production || !publicPage) return null;

  function save(nextConsent: Exclude<Consent, null>, nextExcluded: boolean) {
    writePreference(CONSENT_COOKIE, nextConsent);
    writePreference(TEST_COOKIE, nextExcluded ? "1" : "");
    setConsent(nextConsent);
    setExcluded(nextExcluded);
    preferencesChannel.current?.postMessage("changed");
    if (nextConsent === "denied" || nextExcluded) {
      stopAnalytics(configuration!);
      // A loaded Google tag has timers; a reload stops them after consent is withdrawn.
      if (initialized.current) window.location.reload();
    }
  }

  return (
    <>
      {allowed && tagReady ? (
        <Script
          id="loom-google-analytics"
          src={`https://www.googletagmanager.com/gtag/js?id=${configuration.measurementId}`}
          strategy="afterInteractive"
        />
      ) : null}
      <ConsentControls
        copy={copy}
        privacyHref={privacyHref}
        consent={consent}
        excluded={excluded}
        onSave={save}
      />
    </>
  );
}
