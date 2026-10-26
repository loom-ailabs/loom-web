# Loom AI Homepage and Workspace

`www.loom-labs.ai` runs as a standalone Next.js/OpenNext Worker, serving the default English routes `/`, `/vision`, `/pricing`, and `/workspace`, their Chinese counterparts under `/zh`, and same-origin APIs. The workspace provides manually curated, static work plans. It does not call models, create files, or perform external actions, and it uses path-based routing. The interface uses product-oriented language, with accurate test-payment notices wherever purchases are offered.

All sign-ins start at `login.loom-labs.ai`, using the Logto tenant specified by `LOGTO_ENDPOINT`. Within each environment, WWW, checkout, and login share the same D1 database, app ID, endpoint, session key, and fixed tenant namespace. The production cookie `__Secure-loom_sid_<appId>` stores only a random session identifier and uses `Domain=.loom-labs.ai; Path=/; HttpOnly; Secure; SameSite=Lax`; SDK token state is encrypted in D1. The 10-minute sign-in flow uses `__Secure-loom_flow_<appId>` with the same cookie attributes.

Both Workers use the Logto production Free tenant and a separate D1 database. All new purchases across the site use Creem Test mode: USD 1.00 for Loom Pro and a separate USD 9.99 product for the professional headshot package. Neither incurs a real charge. See the [Creem integration guide](../../docs/creem-test-integration.md) for the current configuration and phased acceptance results, and the [production cutover guide](../../docs/production-cutover.md) for historical identity cutover and Stripe validation records.

Sessions last at most 14 days from a successful callback; refreshing short-lived tokens does not extend that deadline. The server uses the official SDK to refresh tokens as needed and revalidate the identity, without requiring pages or RSCs to rewrite cookies. An uncertain refresh outcome or expired lease prevents further session use. Clearing cookies, signing out, or upstream invalidation may also require signing in again before 14 days have elapsed. Legacy self-contained parent-domain cookies and the host-only `logto_<appId>` cookie are no longer accepted, so existing users must sign in again once. See the [session lifecycle guide](../../docs/session-lifecycle.md).

Product sign-in links carry the full `returnTo` path and query string. With a valid session, the central entry point returns directly to the product; anonymous users choose Google or GitHub. Return URLs must use HTTPS and a canonical `*.loom-labs.ai` host, excluding login/auth destinations, userinfo, nonstandard ports, and fragments. Without an explicit destination, a same-product Referer can preserve the path of a link used before hydration; other sources fall back to the fixed `/workspace` path.

The shared implementation lives in `packages/identity-core`, using the official Node/edge SDK for OIDC and token refresh. Next.js cookie APIs read and write only random identifiers; D1 is the authoritative store for revocable sessions. WWW does not load payment SDKs or keys. Its account display and authorization use the validated `CREEM_MODE=test` setting. Purchases take place through Creem on checkout, and WWW reads the same D1 database on return: the originating Creem Pro or historical Stripe Pro order must be paid, match the current mode, and belong to the same user. Headshot packages do not grant Pro access. Current pages, SEO content, and AI-readable text explicitly state that payments are test transactions with no real charge; legacy Stripe fields remain only for historical processing.

## Languages, Appearance, and Profile

English uses the four original public routes by default; Chinese uses the corresponding `/zh` routes. All support direct access and refresh. Legacy `/en` URLs preserve their original query strings and redirect to the corresponding English root paths. `/account` and `/zh/account` show the current user's profile and are excluded from indexing and the public sitemap. The avatar menu provides profile access, light/dark/system appearance, language selection, and sign-out. Language options list English before Simplified Chinese while honoring saved preferences. The avatar frame is 28px, with a 26px image inside the border and a 40px click target; all four menu icons are 16px. These UI elements do not establish identity or authorize paid access.

`ProductAccessProvider` lives in the layout so navigation and the workspace share the same account state without fetching it again during client-side navigation. It reads account status once per full page load. Focus, visibility changes, timers, and route changes do not trigger synchronization, and navigation does not display “Syncing.” An explicit status refresh or full page reload updates the snapshot. Feature operations still depend on the server's current session and entitlements; the navigation snapshot grants no access.

`packages/i18n` owns next-intl routing and messages, while `packages/ui` owns appearance and menu components. `LOOM_LOCALE` and `LOOM_THEME` store only non-sensitive preferences and use the shared parent domain in production, separately from the HttpOnly sign-in session. Page negotiation and preference-dependent SSR use `private,no-store`; public sitemap, robots, and llms text remain separate. APIs and authentication callbacks have no language prefix. See the [internationalization guide](../../docs/internationalization.md).

## Local Development

Copy `.env.example` to `.env.local` and `.dev.vars`. Put real secrets only in `.dev.vars` and leave secret fields empty in `.env.local`, because OpenNext embeds dotenv values in the Worker. A pre-build guard rejects secrets, tokens, and API keys in dotenv files.

Both applications use the same Logto app secret, existing Identity cookie secret, endpoint, and namespace. Set WWW to `APP_URL=http://localhost:3000`, with the shared `LOGIN_URL=http://localhost:3001` and `AUTH_SUCCESS_URL=http://localhost:3000/`. Leave `LOGTO_COOKIE_DOMAIN` empty locally; the two localhost ports share cookies naturally. Do not configure different secrets. Next.js normalizes loopback IP addresses to localhost, so `127.0.0.1` cannot bypass this behavior.

Register `http://localhost:3001/api/auth/callback` as the Logto app's local callback and both product root URLs as post-sign-out redirect URIs.

```bash
mise identity preview
mise run web:preview
mise run web:smoke
mise run web:coverage
mise run web:deploy-dry-run
```

Preview clears production custom routes, uses local SQLite only, and does not run remote migrations. Identity manages the migration history, and both applications bind to the same remote D1 database. Standard local previews have separate local data files. Shared-database tests of cookie transport use a temporary shared persistence directory; local state must not be treated as remote entitlements.

## APIs and Deployment

JSON responses use `{code:0,msg:"success",data}` or `{code:positive_integer,msg,error:{type}}`; all are private/no-store and noindex. `GET /api/me` returns `{user:{id,name?,email?,picture?}|null,entitlements:{premium:boolean}}`. `GET /api/premium` checks the session and D1 on every request: 401 for anonymous users, 403 without valid access, and 200 with `{unlocked:true,message}` for authorized users. `POST /api/auth/logout` accepts only this product's exact Origin. It first revokes the shared D1 session, then attempts upstream token revocation, clears cookies in `finally`, and completes sign-out with a 303 redirect. Shared cookies do not relax CORS/CSRF checks. Copies of the current SID also become invalid after revocation; refreshes or late callbacks from known associated flows cannot restore it. This does not sign out other devices or revoke unrelated, independently initiated authorizations.

The deployment target in `wrangler.jsonc` is the `loom-web` Worker. The existing `vite-react-template` Worker was renamed in place on 2026-10-23 and continues to serve `www.loom-labs.ai`. Public variables include APP_URL, LOGIN_URL, AUTH_SUCCESS_URL, LOGTO_ENDPOINT, LOGTO_USER_NAMESPACE, LOGTO_APP_ID, LOGTO_COOKIE_DOMAIN, CREEM_MODE, and STRIPE_MODE for historical entitlement queries. Currently, `CREEM_MODE` accepts only test and defaults to test when unset; explicitly empty strings, whitespace, live, and all other values are rejected. The only secrets are LOGTO_APP_SECRET and LOGTO_COOKIE_SECRET, which must match Identity's; no payment keys are included. LOGTO_COOKIE_SECRET is the input for deriving the D1 state-encryption key. Both applications in an environment must bind to the same database. Before deploying the current payment code, use Identity to apply migrations `0001` through `0006` in order to the target database, then deploy Identity and WWW. Do not copy sessions or test entitlements between environments. Migration `0006` preserves existing headshot records and adds separate Pro entitlements without changing historical Stripe orders. Register the central `https://login.loom-labs.ai/api/auth/callback` as the actual OIDC callback. Older callbacks remain registered for now, but product services reject callbacks on any non-central host.

Parent-domain sessions are sent to every subdomain, so all subdomains must be treated as one trust boundary. End-to-end acceptance still requires a real browser to demonstrate sign-in, identity recognition across products, payment, entitlement revocation after refund, and shared sign-out. Builds and synthetic cookie-transport tests provide separate, limited evidence.

### Git Builds Configuration

The target repository is [loom-ailabs/loom-web](https://github.com/loom-ailabs/loom-web). Cloudflare has saved `feat/production-cutover` as the production branch; all other build settings remain unchanged. Changing the branch does not replace reading back the actual deployed version and traffic allocation. See the [production cutover guide](../../docs/production-cutover.md) for the current record.

| Setting           | Value                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| Worker            | `loom-web`, matching Wrangler's `name`                                 |
| Production branch | `feat/production-cutover`                                              |
| Root directory    | `apps/web`                                                             |
| Build command     | `(cd ../.. && pnpm install --frozen-lockfile) && pnpm cf:build`        |
| Deploy command    | `pnpm exec opennextjs-cloudflare deploy`                               |
| Build variables   | `NODE_VERSION=24`, `PNPM_VERSION=12.10.1`, `SKIP_DEPENDENCY_INSTALL=1` |

Tool versions match the repository's `.mise.toml` and root `packageManager`; Wrangler is a direct application dependency pinned to `4.151.2`. Cloudflare's Root directory sets the working directory for build and deploy commands. With automatic installation explicitly disabled, the command above first returns to the repository root, installs the entire workspace using the single `pnpm-lock.yaml`, then returns to `apps/web` to run `pnpm cf:build`. If the platform provides a separate install step, run `pnpm install --frozen-lockfile` from the repository root there and keep the application build command as `pnpm cf:build`. This follows the [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) and [build-image version overrides and installation controls](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).

The deploy command uses the generated OpenNext artifacts directly, without rerunning `pnpm run deploy`, which includes a build. Logto credentials remain in Worker runtime secrets, never build variables or dotenv files. Git builds do not run remote D1 migrations. Cloud configuration still needs verification: repository authorization, production branch, commands and tool versions, and preservation of existing domains, D1 bindings, and secrets. Completion requires the first Git build's logs plus readback of the actual version and traffic allocation; local configuration changes alone do not demonstrate successful automatic deployment.

## Validation Status

The following acceptance results predate the rename and do not establish that Git Builds has been verified. See the [visual system guide](../../docs/visual-system.md) for later releases of the glass-style interface and initial theme rendering.

The earlier release included English as the default, updated product copy, shared navigation state, and icon changes. Repository-wide `mise run verify` exited with 0: identity-core passed 263 tests, identity 149, web 32, and i18n 10, for a total of 454; the legacy Worker passed another 4 tests. Local Workerd shared-session checks passed 9/9, local HTTP checks 67/67, and independent deployed HTTP checks 67/67. At that time, the WWW version was `a39d3bf2-e75b-492c-9af7-fe3cb14ac9a0` and Identity was `17aeae33-1ab4-450e-af1e-074e7a690576`, with deployment readback confirming 100% traffic for each. Public page content, eight bilingual URLs, legacy `/en` redirects preserving query strings, and rejection behavior for private pages and APIs were checked.

Real-browser testing confirmed the full GitHub return to `/workspace?source=login-polish&keep=a%2Bb`. Client-side navigation from vision to the workspace did not reread `/api/me`; a local manual refresh added one read. Menu icons, the avatar click target, centered sign-in, and the carousel's default autoplay were checked. Google sign-in passed through the official account chooser and Logto callback to WWW, which recognized the same existing identity. Read-only Logto user settings showed existing GitHub and Google connections; that validation round did not link, merge, or edit connections. After Google sign-in, all three domains recognized the same user with premium=false. Shared sign-out then made all three anonymous, and another GitHub sign-in successfully returned to the WWW root. The versions and tests below remain historical records.

At an earlier authentication checkpoint, WWW was version `3b1091f9-a959-4352-91ac-54b6f0731811`, Identity was `9e04b462-53e1-4660-8636-3c13139b00cc`, and session migrations had been applied. At that time, 400 tests, repository-wide verification, actual Workerd protocol checks, and 53/53 deployed anonymous checks passed. Real GitHub sign-in confirmed the same identity across three domains, preservation of the return path and query string, official SDK refresh, and shared sign-out. Shortening a test session's deadline under controlled conditions caused authentication rejection; signing in again restored the same identity. This did not involve waiting an actual 14 days. The session mechanism remains in use; see the [session lifecycle guide](../../docs/session-lifecycle.md).

### Acceptance Completed for the Previous Version (2026-10-23)

That historical release used WWW version `c7fbf7c8-c45a-45e5-b6d2-7ae7c15a0b85` and sign-in/purchase Worker version `a4224f5a-c2f1-427f-87c5-2fb94f03cce2`.

- Repository-wide `mise run verify` passed, along with 19 local Workerd HTTP checks and 8 groups of parent-domain cookie-transport checks. Transport checks used local test keys and databases and do not substitute for real third-party sign-in.
- Deployed anonymous checks passed 60/60, with remote data unchanged before and after. Public pages supported direct access and refresh, with no hash-based page entry points.
- After real GitHub sign-in, WWW, login, and checkout recognized the same user. With an existing session, the central entry point returned directly to the original product path and query string. Signing out from WWW made all three domains anonymous.
- After a USD 1.00 Sandbox payment, returning to WWW allowed the preset demo to run; entitlements survived sign-out and sign-in. After a full refund, the original user's premium API returned `premium_required`, and the workspace no longer displayed the plan.
- Google Search Console HTML ownership verification was completed, and the sitemap was successfully processed with four pages discovered. Generative AI search inherited the parent domain's “Include” setting. This does not establish search indexing or ranking.

The Google/GitHub records above belong to earlier development-tenant acceptance and do not validate the new production connectors. The [production cutover guide](../../docs/production-cutover.md) is authoritative for the runtime environment and cutover progress. See the [Feishu document](https://bytedance.larkoffice.com/docx/O5IUdAY2bon0L1x72gucn73NnOh) for full operational records and Sandbox validation steps, and the [SEO and AI-readable content guide](../../docs/seo-geo.md) for those entry points.
