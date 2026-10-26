import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { resolveLoginReturnTarget } from "@loom-ai/identity-core/auth-routes";
import { IdentityPage } from "@/_pages/identity";
import { SignInPage } from "@/_pages/sign-in";
import { getAuthClient, getLoginPageConfig, getUser } from "@/server/auth";
import { getEnv } from "@/server/env";
import { ApiError } from "@/server/http";
import { getBillingPresentationMode } from "@/server/billing-presentation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const config = await getLoginPageConfig();
  const requestHeaders = await headers();
  if (config && requestHeaders.get("host") === new URL(config.loginUrl).host) {
    const input = await searchParams;
    const query = new URLSearchParams();
    for (const name of ["returnTo", "destination"]) {
      const value = input[name];
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value])
        query.append(name, item);
    }
    const auth = await getAuthClient();
    let target: string;
    try {
      target = resolveLoginReturnTarget(query, auth, await getEnv());
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) notFound();
      throw error;
    }
    if (await getUser()) redirect(target);
    const providerUrl = (provider: string) => {
      const url = new URL("/api/auth/login", config.loginUrl);
      url.searchParams.set("provider", provider);
      url.searchParams.set("returnTo", target);
      return url.toString();
    };
    return (
      <SignInPage googleSignInUrl={providerUrl("google")} githubSignInUrl={providerUrl("github")} />
    );
  }
  return <IdentityPage billingMode={await getBillingPresentationMode()} />;
}
