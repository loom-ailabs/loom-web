import assert from "node:assert/strict";

const baseUrl = process.env.IDENTITY_SMOKE_URL ?? "http://localhost:3001";
const page = await fetch(baseUrl);
assert.equal(page.status, 200, "Next.js page should respond");
assert.match(await page.text(), /Loom|Hotkey Tools/);

const health = await fetch(new URL("/api/health", baseUrl));
assert.equal(health.status, 200, "D1 must be migrated and available");
const healthBody = await health.json();
assert.equal(healthBody.code, 0);
assert.equal(healthBody.data.storage, "d1");
assert.match(health.headers.get("cache-control") ?? "", /no-store/);

const profile = await fetch(new URL("/api/me", baseUrl));
assert.ok([200, 503].includes(profile.status));
const profileBody = await profile.json();
if (profile.status === 200) {
  assert.equal(profileBody.code, 0);
  assert.equal(profileBody.data.user, null);
} else {
  assert.equal(profileBody.error.type, "AUTH_NOT_CONFIGURED");
}

const crossSite = await fetch(new URL("/api/checkout", baseUrl), {
  method: "POST",
  headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" },
  body: JSON.stringify({ requestId: crypto.randomUUID() }),
});
assert.ok([403, 503].includes(crossSite.status));
const crossSiteBody = await crossSite.json();
assert.notEqual(crossSiteBody.code, 0);

console.log(
  "Identity smoke passed: Next.js page + D1 + private API + rejected cross-site checkout.",
);
console.log("Real Logto sign-in and Creem Test payment need separate end-to-end verification.");
