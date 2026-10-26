"use client";

import { localizeUrl } from "@loom-ai/i18n/routing";

import { useRef } from "react";
import { useTranslations } from "@loom-ai/i18n";
import { Link, useLocaleSwitcher } from "@loom-ai/i18n/navigation";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  GlassSurface,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PreferencesMenu,
  PreferencesMenuItems,
} from "@loom-ai/ui";
import { ArrowUpRight, LogOut, UserRound } from "lucide-react";
import type { useProductAccess } from "@/features/product-workspace";

type Access = ReturnType<typeof useProductAccess>;
function usePreferences() {
  const t = useTranslations("Web");
  const { locale, switchLocale } = useLocaleSwitcher();
  return {
    locale,
    onLocaleChange: switchLocale,
    labels: {
      settings: t("settings"),
      theme: t("theme"),
      light: t("light"),
      dark: t("dark"),
      system: t("system"),
      language: t("language"),
    },
  };
}
function ProfileAvatar({
  user,
  large = false,
}: {
  user: NonNullable<Access["profile"]>["user"];
  large?: boolean;
}) {
  const name = user?.name?.trim() || user?.email || "Loom";
  const initial = Array.from(name)[0]?.toUpperCase() || "L";
  return (
    <Avatar className={large ? "size-16 border" : "size-7 border"}>
      <AvatarImage src={user?.picture} alt="" />
      <AvatarFallback className={large ? "text-xl" : ""}>{initial}</AvatarFallback>
    </Avatar>
  );
}
export function AccountMenu({ access }: { access: Access }) {
  const t = useTranslations("Web");
  const preferences = usePreferences();
  const logoutForm = useRef<HTMLFormElement>(null);
  const user = access.profile?.user;
  if (!user)
    return (
      <>
        <PreferencesMenu {...preferences} />
        <a
          href={access.loginUrl}
          className="rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("login")}
        </a>
      </>
    );
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("accountMenu")}
            className="flex size-10 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ProfileAvatar user={user} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <span className="block truncate text-sm font-medium text-foreground">
              {user.name || t("noName")}
            </span>
            {user.email && <span className="mt-1 block truncate font-normal">{user.email}</span>}
            <span className="mt-2 block text-xs font-normal text-link">
              {access.profile?.entitlements.premium ? "Loom Pro" : "Loom Explore"}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/account">
              <UserRound />
              {t("account")}
            </Link>
          </DropdownMenuItem>
          <PreferencesMenuItems {...preferences} />
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logoutForm.current?.requestSubmit()}>
            <LogOut />
            {t("logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <form ref={logoutForm} action="/api/auth/logout" method="post" className="hidden" />
    </>
  );
}
export function AccountProfile({ access }: { access: Access }) {
  const t = useTranslations("Web");
  const { locale } = useLocaleSwitcher();
  const user = access.profile?.user;
  return (
    <section className="mx-auto max-w-2xl py-16 sm:py-24">
      <p className="mb-4 font-mono text-xs tracking-widest text-link">YOUR LOOM IDENTITY</p>
      <h2 className="text-3xl font-medium tracking-tight">{t("accountTitle")}</h2>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">{t("accountBody")}</p>
      <GlassSurface intensity="raised" className="mt-8 p-6 sm:p-8" aria-busy={access.loading}>
        {access.loading ? (
          <p role="status" className="text-muted-foreground">
            {t("loadingAccount")}
          </p>
        ) : user ? (
          <>
            <div className="mb-8 flex items-center gap-4">
              <ProfileAvatar user={user} large />
              <div>
                <p className="text-lg font-medium">{user.name || t("noName")}</p>
                <p className="mt-1 text-sm text-link">
                  {access.profile?.entitlements.premium ? "Loom Pro" : "Loom Explore"}
                </p>
              </div>
            </div>
            <dl className="divide-y">
              {[
                [t("name"), user.name],
                [t("email"), user.email],
                [t("userId"), user.id],
              ].map(([label, value]) => (
                <div key={label} className="grid gap-2 py-4 text-sm sm:grid-cols-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-all sm:col-span-2">{value || t("notProvided")}</dd>
                </div>
              ))}
            </dl>
            <Button asChild variant="outline" className="mt-6">
              <a href={localizeUrl("https://checkout.loom-labs.ai/", locale)}>
                {t("managePurchase")}
                <ArrowUpRight />
              </a>
            </Button>
          </>
        ) : (
          <>
            <p className="mb-6 text-muted-foreground">{t("guestAccount")}</p>
            <Button asChild>
              <a href={access.loginUrl}>{t("login")}</a>
            </Button>
          </>
        )}
        {access.error && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {access.error}
          </p>
        )}
      </GlassSurface>
      <Link
        href="/workspace"
        className="mt-6 inline-flex text-sm text-muted-foreground hover:text-foreground"
      >
        {t("backWorkspace")}
      </Link>
    </section>
  );
}
