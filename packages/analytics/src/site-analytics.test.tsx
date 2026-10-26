import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteAnalytics } from "./site-analytics";
import { CONSENT_COOKIE, TEST_COOKIE, readCookie, type AnalyticsWindow } from "./browser";
import type { AnalyticsConfiguration, AnalyticsCopy } from "./contract";

const { navigation } = vi.hoisted(() => ({ navigation: { pathname: "/" } }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("next/script", () => ({
  default: ({ src }: { src: string }) => <script data-testid="ga-script" src={src} />,
}));

const configuration: AnalyticsConfiguration = { measurementId: "G-ABC1234567", application: "web" };
const copy: AnalyticsCopy = {
  title: "Optional analytics",
  description: "Choose whether to share optional analytics.",
  accept: "Allow analytics",
  reject: "Reject analytics",
  settings: "Analytics preferences",
  settingsTitle: "Analytics preferences",
  settingsDescription: "Manage analytics.",
  consentLabel: "Allow optional analytics",
  excludeBrowser: "Exclude this browser",
  excludeBrowserDescription: "For testing.",
  save: "Save preferences",
  cancel: "Cancel",
  privacy: "Privacy Policy",
};
const props = { configuration, copy, privacyHref: "/privacy" };

function pageEvents() {
  return ((window as AnalyticsWindow).dataLayer ?? [])
    .map((entry) => Array.from(entry as unknown[]))
    .filter((entry) => entry[0] === "event" && entry[1] === "page_view");
}

beforeEach(() => {
  window.history.replaceState({}, "", "https://www.loom-labs.ai/");
  navigation.pathname = "/";
});

afterEach(() => {
  cleanup();
  for (const name of [CONSENT_COOKIE, TEST_COOKIE, "_ga"]) {
    document.cookie = `${name}=; Domain=.loom-labs.ai; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:01 GMT`;
  }
  const target = window as AnalyticsWindow;
  delete target.gtag;
  delete target.dataLayer;
  delete target["ga-disable-G-ABC1234567"];
});

describe("consent-controlled page measurement", () => {
  it("does not load Google or queue events until the visitor opts in", () => {
    render(<SiteAnalytics {...props} />);
    expect(screen.getByRole("heading", { name: copy.title })).toBeTruthy();
    expect(screen.queryByTestId("ga-script")).toBeNull();
    expect((window as AnalyticsWindow).dataLayer).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: copy.reject }));
    expect(readCookie(CONSENT_COOKIE)).toBe("denied");
    expect(screen.queryByTestId("ga-script")).toBeNull();
    expect(pageEvents()).toEqual([]);
  });

  it("queues one sanitized event per public route including strict-mode hydration", () => {
    document.cookie = `${CONSENT_COOKIE}=granted; Domain=.loom-labs.ai; Path=/; Secure`;
    window.history.replaceState({}, "", "/?email=private@example.com#secret");
    const view = render(
      <StrictMode>
        <SiteAnalytics {...props} />
      </StrictMode>,
    );
    expect(screen.getByTestId("ga-script").getAttribute("src")).toContain(
      configuration.measurementId,
    );
    expect(pageEvents()).toEqual([
      [
        "event",
        "page_view",
        { page_location: "https://www.loom-labs.ai/", page_referrer: "", page_title: "Loom AI" },
      ],
    ]);
    view.rerender(
      <StrictMode>
        <SiteAnalytics {...props} />
      </StrictMode>,
    );
    const initialCount = pageEvents().length;
    navigation.pathname = "/pricing";
    view.rerender(
      <StrictMode>
        <SiteAnalytics {...props} />
      </StrictMode>,
    );
    expect(pageEvents()).toHaveLength(initialCount + 1);
    view.rerender(
      <StrictMode>
        <SiteAnalytics {...props} />
      </StrictMode>,
    );
    expect(pageEvents()).toHaveLength(initialCount + 1);
    expect(JSON.stringify(pageEvents())).not.toContain("private@example.com");
    const streamUpdates = (window as AnalyticsWindow)
      .dataLayer!.map((entry) => Array.from(entry as unknown[]))
      .filter((entry) => entry[0] === "config" && (entry[2] as { update?: boolean }).update);
    expect(streamUpdates.at(-1)).toEqual([
      "config",
      configuration.measurementId,
      {
        update: true,
        send_page_view: false,
        page_location: "https://www.loom-labs.ai/pricing",
        page_referrer: "",
        page_title: "Loom AI",
      },
    ]);
  });

  it("allows opting in and prevents collection on account routes", () => {
    const view = render(<SiteAnalytics {...props} />);
    fireEvent.click(screen.getByRole("button", { name: copy.accept }));
    expect(readCookie(CONSENT_COOKIE)).toBe("granted");
    expect(pageEvents()).toHaveLength(1);
    document.cookie = "_ga=existing; Domain=.loom-labs.ai; Path=/; Secure";
    navigation.pathname = "/account";
    view.rerender(<SiteAnalytics {...props} />);
    expect(pageEvents()).toHaveLength(1);
    expect(screen.queryByTestId("ga-script")).toBeNull();
    expect((window as AnalyticsWindow)["ga-disable-G-ABC1234567"]).toBe(true);
    expect(readCookie("_ga")).toBe("existing");
  });

  it("excludes a browser marked for testing before Google can load", () => {
    document.cookie = `${CONSENT_COOKIE}=granted; Domain=.loom-labs.ai; Path=/; Secure`;
    window.history.replaceState({}, "", "/?analytics_test=1");
    render(<SiteAnalytics {...props} />);
    expect(readCookie(TEST_COOKIE)).toBe("1");
    expect(screen.queryByTestId("ga-script")).toBeNull();
    expect(pageEvents()).toEqual([]);
  });

  it("can remove the explicit testing exclusion on a subsequent document load", () => {
    document.cookie = `${CONSENT_COOKIE}=granted; Domain=.loom-labs.ai; Path=/; Secure`;
    document.cookie = `${TEST_COOKIE}=1; Domain=.loom-labs.ai; Path=/; Secure`;
    window.history.replaceState({}, "", "/?analytics_test=0");
    render(<SiteAnalytics {...props} />);
    expect(readCookie(TEST_COOKIE)).toBeUndefined();
    expect(pageEvents()).toHaveLength(1);
  });

  it("keeps private routes and missing configuration completely inactive", () => {
    navigation.pathname = "/account";
    const view = render(<SiteAnalytics {...props} />);
    expect(view.container.textContent).toBe("");
    expect(pageEvents()).toEqual([]);
    view.rerender(<SiteAnalytics {...props} configuration={null} />);
    expect(screen.queryByTestId("ga-script")).toBeNull();
  });

  it("lets visitors set an exclusion without modifying sign-in cookies", async () => {
    document.cookie = "loom_sid=identity; Domain=.loom-labs.ai; Path=/; Secure";
    render(<SiteAnalytics {...props} />);
    fireEvent.click(screen.getByRole("button", { name: copy.settings }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Exclude this browser/ }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: copy.save })));
    expect(readCookie(TEST_COOKIE)).toBe("1");
    expect(readCookie("loom_sid")).toBe("identity");
    expect(pageEvents()).toEqual([]);
    document.cookie =
      "loom_sid=; Domain=.loom-labs.ai; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:01 GMT";
  });

  it("honors withdrawal from another tab before any further pageview", () => {
    document.cookie = `${CONSENT_COOKIE}=granted; Domain=.loom-labs.ai; Path=/; Secure`;
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);
    render(<SiteAnalytics {...props} />);
    expect(pageEvents()).toHaveLength(1);
    document.cookie = `${CONSENT_COOKIE}=denied; Domain=.loom-labs.ai; Path=/; Secure`;
    act(() => window.dispatchEvent(new Event("focus")));
    expect((window as AnalyticsWindow)["ga-disable-G-ABC1234567"]).toBe(true);
    expect(pageEvents()).toHaveLength(1);
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("ga-script")).toBeNull();
    reload.mockRestore();
  });
});
