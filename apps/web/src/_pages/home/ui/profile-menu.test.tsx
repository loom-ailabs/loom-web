import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes } from "react";
import { AppearanceProvider } from "@loom-ai/ui";
import { IntlWrapper } from "@/test/intl-wrapper";
import { AccountMenu } from "./profile-menu";
import type { useProductAccess } from "@/features/product-workspace";

const switchLocale = vi.fn();
vi.mock("@loom-ai/i18n/navigation", () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
  useLocaleSwitcher: () => ({ locale: "zh", switchLocale }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  switchLocale.mockReset();
});
function mount(user: { id: string; name?: string; email?: string } | null) {
  const access = {
    profile: { user, entitlements: { premium: false } },
    loading: false,
    loginUrl: "/api/auth/login?returnTo=test",
  } as ReturnType<typeof useProductAccess>;
  render(
    <IntlWrapper>
      <AppearanceProvider>
        <AccountMenu access={access} />
      </AppearanceProvider>
    </IntlWrapper>,
  );
}
async function openAccount() {
  await act(async () => {
    fireEvent.pointerDown(screen.getByRole("button", { name: "打开账号菜单" }), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
  });
  await screen.findByRole("menu");
}
describe("account navigation", () => {
  it("keeps anonymous sign-in on the unprefixed authentication endpoint", () => {
    mount(null);
    expect(screen.getByRole("link", { name: "登录" }).getAttribute("href")).toBe(
      "/api/auth/login?returnTo=test",
    );
    expect(screen.queryByRole("button", { name: "打开账号菜单" })).toBeNull();
  });
  it("shows a profile fallback, user information and a real profile route", async () => {
    mount({ id: "one-user", name: "Ada", email: "ada@example.com" });
    expect(screen.getByRole("button", { name: "打开账号菜单" }).textContent).toBe("A");
    await openAccount();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "个人信息" }).getAttribute("href")).toBe(
      "/account",
    );
  });
  it("submits logout as a POST form rather than navigating to an unprotected URL", async () => {
    const requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => {});
    mount({ id: "one-user", name: "Ada" });
    await openAccount();
    fireEvent.click(screen.getByRole("menuitem", { name: "退出登录" }));
    await waitFor(() => expect(requestSubmit).toHaveBeenCalledOnce());
    const form = document.querySelector<HTMLFormElement>('form[action="/api/auth/logout"]');
    expect(form?.method).toBe("post");
  });
});
