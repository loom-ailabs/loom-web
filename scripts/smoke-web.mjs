import assert from "node:assert/strict";

const baseUrl = new URL(process.env.WEB_SMOKE_URL ?? "http://localhost:3000");
const loginBase = new URL(
  process.env.LOGIN_SMOKE_URL ??
    (baseUrl.hostname === "localhost" ? "http://localhost:3001" : "https://login.loom-labs.ai"),
);
const logtoEndpoint = new URL(
  process.env.LOGTO_SMOKE_ENDPOINT ??
    (baseUrl.hostname === "localhost" ? "https://auth.loom-labs.ai" : "https://5z8hdi.logto.app"),
);
const checks = [];
async function api(path, status) {
  const response = await fetch(new URL(path, baseUrl), { redirect: "manual" });
  assert.equal(response.status, status, path);
  assert.equal(response.headers.get("cache-control"), "private, no-store", path);
  const body = await response.json();
  assert.equal(body.code === 0, status < 400, path);
  checks.push({ path, status });
  return body;
}

for (const [locale, prefix] of [
  ["en", ""],
  ["zh", "/zh"],
]) {
  for (const pagePath of ["/", "/vision", "/pricing", "/workspace"]) {
    const path = `${prefix}${pagePath === "/" && prefix ? "" : pagePath}`;
    for (let visit = 0; visit < 2; visit++) {
      const page = await fetch(new URL(path, baseUrl));
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /Loom/);
      assert.ok(html.includes(`lang="${locale === "en" ? "en" : "zh-CN"}"`));
      assert.ok(
        !/<a\b[^>]*\bhref=["'][^"']*#/i.test(html),
        "Product links must not use hash routes",
      );
    }
    checks.push({ path, locale, status: 200, directAndRefresh: true });
  }
}
const legacy = await fetch(new URL("/en/workspace?source=legacy&keep=a%2Bb", baseUrl), {
  redirect: "manual",
});
assert.equal(legacy.status, 307);
assert.equal(new URL(legacy.headers.get("location"), baseUrl).pathname, "/workspace");
assert.equal(new URL(legacy.headers.get("location"), baseUrl).search, "?source=legacy&keep=a%2Bb");
checks.push({ path: "/en/workspace", status: 307, rawQueryPreserved: true });
for (const prefix of ["/en", "/zh"]) {
  const response = await fetch(new URL(`${prefix}/api/me`, baseUrl), { redirect: "manual" });
  assert.equal(response.status, 404);
  assert.equal(response.headers.has("location"), false);
  checks.push({ path: `${prefix}/api/me`, status: 404 });
}
const centralPage = await fetch(loginBase);
assert.equal(centralPage.status, 200);
const centralHtml = await centralPage.text();
assert.ok(
  !/<a\b[^>]*\bhref=["'][^"']*#/i.test(centralHtml),
  "Central login links must not use hash routes",
);
checks.push({ path: "central/", status: 200, noHashLinks: true });
assert.equal((await api("/api/health", 200)).data.storage, "d1");
for (const path of ["/api/me", "/api/me?premium=true&checkout=success"]) {
  assert.deepEqual((await api(path, 200)).data, {
    user: null,
    entitlements: { premium: false },
  });
}
assert.equal((await api("/api/premium", 401)).error.type, "unauthenticated");
for (const query of [
  "?provider=attacker",
  "?provider=google&provider=github",
  "?destination=https://attacker.example",
]) {
  await api(`/api/auth/login${query}`, 400);
}
for (const origin of [null, "https://checkout.loom-labs.ai", "https://login.loom-labs.ai"]) {
  const response = await fetch(new URL("/api/auth/logout", baseUrl), {
    method: "POST",
    headers: origin ? { Origin: origin } : {},
    redirect: "manual",
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.type, "invalid_origin");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  checks.push({ path: "/api/auth/logout", source: origin ?? "absent", status: 403 });
}
for (const provider of ["google", "github"]) {
  const returnTo = new URL("/workspace?source=sso-check", baseUrl).toString();
  const product = await fetch(
    new URL(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`, baseUrl),
    { redirect: "manual" },
  );
  assert.equal(product.status, 303);
  const portal = new URL(product.headers.get("location"));
  assert.equal(portal.origin, loginBase.origin);
  assert.equal(portal.pathname, "/");
  assert.equal(portal.searchParams.get("returnTo"), returnTo);
  assert.equal(product.headers.has("set-cookie"), false);
  const response = await fetch(
    new URL(
      `/api/auth/login?provider=${provider}&returnTo=${encodeURIComponent(returnTo)}`,
      loginBase,
    ),
    { redirect: "manual" },
  );
  assert.equal(response.status, 303);
  const target = new URL(response.headers.get("location"));
  assert.equal(target.origin, logtoEndpoint.origin);
  assert.equal(
    target.searchParams.get("redirect_uri"),
    new URL("/api/auth/callback", loginBase).toString(),
  );
  assert.equal(target.searchParams.get("direct_sign_in"), `social:${provider}`);
  assert.equal(target.searchParams.get("ui_locales"), "en");
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.ok(/HttpOnly/i.test(cookie), "Shared cookie must be HttpOnly");
  assert.ok(/SameSite=Lax/i.test(cookie), "Shared cookie must be Lax");
  if (loginBase.protocol === "https:") {
    assert.ok(/;\s*Secure/i.test(cookie), "Shared cookie must be Secure");
    assert.ok(
      /;\s*Domain=\.loom-labs\.ai/i.test(cookie),
      "Shared cookie must use the parent domain",
    );
    assert.ok(
      cookie.startsWith("__Secure-loom_flow_"),
      "Sign-in must issue a distinct short-lived opaque flow ID",
    );
  } else assert.ok(!/(?:^|;)\s*Domain=/i.test(cookie), "Localhost cookies must omit Domain");
  checks.push({
    path: "/api/auth/login",
    provider,
    status: 303,
    callbackOrigin: loginBase.origin,
    sharedDomain: loginBase.protocol === "https:" ? ".loom-labs.ai" : "localhost",
  });
}
await api("/api/auth/callback?code=forged&state=forged", 400);
const invalid = await fetch(new URL("/api/auth/callback?code=forged&state=forged", loginBase), {
  redirect: "manual",
});
assert.equal(invalid.status, 400);
assert.equal((await invalid.json()).error.type, "invalid_auth_callback");
checks.push({ path: "central/api/auth/callback", status: 400 });
console.log(
  JSON.stringify({ mode: "anonymous-http-smoke", baseUrl: baseUrl.origin, checks }, null, 2),
);
