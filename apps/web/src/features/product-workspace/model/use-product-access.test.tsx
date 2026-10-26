import { IntlWrapper } from "@/test/intl-wrapper";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductAccessProvider, useProductAccess } from "./use-product-access";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
function AccessWrapper({ children }: { children: ReactNode }) {
  return (
    <IntlWrapper>
      <ProductAccessProvider>{children}</ProductAccessProvider>
    </IntlWrapper>
  );
}

const response = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const profile = (premium: boolean) =>
  response(200, {
    code: 0,
    data: {
      user: { id: "same-logto-user" },
      entitlements: { premium },
    },
  });
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("product entitlement lifecycle", () => {
  it.each(["invalid_billing_mode", "billing_mode_mismatch"])(
    "shows a safe configuration message for %s",
    async (type) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            response(503, { code: 1099, msg: "raw provider failure", error: { type } }),
          ),
      );
      const { result } = renderHook(() => useProductAccess(), { wrapper: AccessWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBe("付款配置暂不可用，请稍后再试。");
      expect(result.current.unlocked).toBe(false);
    },
  );
  it("keeps the loaded account when a route consumer is replaced", async () => {
    const fetchMock = vi.fn().mockResolvedValue(profile(false));
    vi.stubGlobal("fetch", fetchMock);
    function Page({ name }: { name: string }) {
      const access = useProductAccess();
      return <p data-testid={name}>{access.profile?.user?.id ?? "anonymous"}</p>;
    }
    const view = (name: string) => (
      <AccessWrapper>
        <Page key={name} name={name} />
      </AccessWrapper>
    );
    const { rerender } = render(view("home"));
    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("same-logto-user"));
    window.history.replaceState(null, "", "/workspace?from=nav");
    rerender(view("workspace"));
    expect(screen.getByTestId("workspace").textContent).toBe("same-logto-user");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("loads once and only refreshes account state through a user action", async () => {
    const fetchMock = vi.fn().mockResolvedValue(profile(false));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useProductAccess(), { wrapper: AccessWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.refresh();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("returns login to the current product path and query without a legacy hash", async () => {
    window.history.replaceState(null, "", "/pricing?source=product&plan=pro#legacy");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(profile(false)));
    const { result } = renderHook(() => useProductAccess(), { wrapper: AccessWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const login = new URL(result.current.loginUrl, window.location.origin);
    expect(login.pathname).toBe("/api/auth/login");
    const target = new URL(login.searchParams.get("returnTo")!);
    expect(target.origin).toBe(window.location.origin);
    expect(target.pathname).toBe("/pricing");
    expect(target.search).toBe("?source=product&plan=pro");
    expect(target.hash).toBe("");
  });

  it("removes the demo when a refund invalidates previously loaded entitlement", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(profile(true))
      .mockResolvedValueOnce(response(200, { code: 0, data: { unlocked: true } }))
      .mockResolvedValueOnce(
        response(403, {
          code: 2003,
          msg: "购买后可访问示例高级功能。",
          error: { type: "premium_required" },
        }),
      )
      .mockResolvedValueOnce(profile(false));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useProductAccess(), { wrapper: AccessWrapper });
    await waitFor(() => expect(result.current.profile?.entitlements.premium).toBe(true));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.unlocked).toBe(true);
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.unlocked).toBe(false);
    expect(result.current.profile?.entitlements.premium).toBe(false);
    expect(result.current.error).toBe("解锁 Loom Pro 后即可查看工作计划。");
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/premium")).toHaveLength(2);
  });

  it("clears a previous result when refreshed account has no active entitlement", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(profile(true))
        .mockResolvedValueOnce(response(200, { code: 0, data: { unlocked: true } }))
        .mockResolvedValueOnce(profile(false)),
    );
    const { result } = renderHook(() => useProductAccess(), { wrapper: AccessWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.unlocked).toBe(true);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.unlocked).toBe(false);
  });

  it.each(["success", "failure"])(
    "ignores an older permission %s after manual refresh revokes access",
    async (outcome) => {
      let settlePermission!: (value: Response) => void;
      const pendingPermission = new Promise<Response>((resolve) => {
        settlePermission = resolve;
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(profile(true))
        .mockReturnValueOnce(pendingPermission)
        .mockResolvedValueOnce(profile(false));
      vi.stubGlobal("fetch", fetchMock);
      const { result } = renderHook(() => useProductAccess(), { wrapper: AccessWrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let pendingRun!: Promise<void>;
      act(() => {
        pendingRun = result.current.run();
      });
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.profile?.entitlements.premium).toBe(false);

      await act(async () => {
        settlePermission(
          outcome === "success"
            ? response(200, { code: 0, data: { unlocked: true } })
            : response(401, { code: 2002, error: { type: "unauthenticated" } }),
        );
        await pendingRun;
      });
      expect(result.current.profile?.entitlements.premium).toBe(false);
      expect(result.current.unlocked).toBe(false);
      expect(result.current.error).toBe("");
      expect(result.current.running).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );
});
