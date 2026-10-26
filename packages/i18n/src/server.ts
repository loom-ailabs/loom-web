export { getLocale, getTranslations, getMessages, setRequestLocale } from "next-intl/server";
import type { Locale } from "./routing";

/** Legal text stays in server-rendered pages rather than every client message payload. */
export async function getLegalMessages(locale: Locale) {
  return locale === "en"
    ? (await import("../messages/en/legal.json")).default
    : (await import("../messages/zh/legal.json")).default;
}

/** The Creem test purchase page loads its copy without changing other payment pages. */
export async function getHeadshotMessages(locale: Locale) {
  return locale === "en"
    ? (await import("../messages/en/headshots.json")).default
    : (await import("../messages/zh/headshots.json")).default;
}

function selectBilling<
  T extends { billing: { test: Record<string, string>; live: Record<string, string> } },
>(messages: T, mode: "test" | "live") {
  return { ...messages, billing: { [mode]: messages.billing[mode] } };
}

export async function getMessagesForLocale(locale: Locale, billingMode: "test" | "live" = "test") {
  if (locale === "en") {
    const [Common, Web, SignIn, Access] = await Promise.all([
      import("../messages/en/common.json"),
      import("../messages/en/web.json"),
      import("../messages/en/sign-in.json"),
      import("../messages/en/access.json"),
    ]);
    return {
      Common: Common.default,
      Web: selectBilling(Web.default, billingMode),
      SignIn: SignIn.default,
      Access: selectBilling(Access.default, billingMode),
    };
  }
  const [Common, Web, SignIn, Access] = await Promise.all([
    import("../messages/zh/common.json"),
    import("../messages/zh/web.json"),
    import("../messages/zh/sign-in.json"),
    import("../messages/zh/access.json"),
  ]);
  return {
    Common: Common.default,
    Web: selectBilling(Web.default, billingMode),
    SignIn: SignIn.default,
    Access: selectBilling(Access.default, billingMode),
  };
}
