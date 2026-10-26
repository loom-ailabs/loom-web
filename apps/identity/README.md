# Identity: Accounts and Purchases

This application hosts pages, sign-in callbacks, order APIs, payment webhooks, and paid-access authorization in a single Next.js App Router service, deployed as one Cloudflare Worker through OpenNext. It provides Loom account management, access to Loom Pro work plans, and a separate professional headshot package. All new purchases across the site use Creem Test mode; Stripe is retained only for historical order queries, refunds, and entitlement revocation. Historical database identifiers remain `hotkey-tools` / `premium-demo`, preserving the ownership of existing orders and entitlements. Subscriptions, usage-based billing, and a standalone identity issuer are outside its scope.

Logto handles authentication and short-lived token refresh. D1 stores revocable sessions, users, orders, and entitlements, while Creem Test mode handles new purchases. The application database determines paid access, without relying on Logto RBAC or custom API resources. Features available in a development tenant do not establish that they work on the production Free plan.

The deployed application uses a Logto production Free tenant and a separate D1 database. New purchases use Creem Test mode; real payments are not enabled. See the [Creem integration guide](../../docs/creem-test-integration.md) for the current payment configuration. The [production cutover guide](../../docs/production-cutover.md) retains historical acceptance results from the original Logto/Stripe phase.

Loom Pro remains a one-time USD 1.00 purchase, using the separate Creem product `prod_7axKhvtA10UxHeQlhFi91U`. The account page at the root path places orders through `/api/checkout`. Valid Pro entitlements come from the same user's paid, unrevoked Creem Pro orders or historical Stripe Pro orders; headshot packages do not grant Pro. Accounts that already have Pro do not create another Pro purchase.

The professional headshot package has a separate Creem Test payment flow at `/headshots` and `/zh/headshots`: a one-time USD 9.99 purchase including tax, with entitlements to 4 finished photos and 1 redo per order. Repeat purchases are allowed. Its APIs are `GET /api/headshot_packs`, `POST /api/headshot_checkout`, `GET /api/headshot_orders/[order_id]`, and `POST /api/webhooks/creem`. See the [Creem Test payment integration](../../docs/creem-test-integration.md) for configuration, data isolation, and acceptance results for this phase.

## Languages and Appearance

Sign-in and purchase pages use English at the root paths by default and Chinese under `/zh`. Legacy `/en` pages preserve the original query string and redirect to the canonical English root paths. The sign-in controls are centered, and the product vision carousel on the right plays automatically by default. Pagination dots are its only persistently visible controls; pause/play is available on keyboard focus, and the carousel honors reduced-motion preferences. Purchase pages use standard product language such as accounts, access, and one-time unlocks. Purchase controls clearly state that payments are for testing and no real charge will occur. Work plans remain static content curated on the main site.

The interface shares light, dark, system appearance, and language preferences. The shared language menu lists English first, followed by Simplified Chinese, while preserving the saved preference. In production, `LOOM_LOCALE` and `LOOM_THEME` store only non-sensitive preferences, separately from the HttpOnly random session identifier. All Identity pages remain excluded from indexing in every language.

`/api/auth/login`, callbacks, orders, Creem webhooks, and historical Stripe webhooks have no language prefix. A valid language preference affects only the hosted sign-in interface through the official SDK's fixed `ui_locales=zh-CN|en` values; it does not change authentication or return-URL validation. See the [internationalization guide](../../docs/internationalization.md) for message and layout integration. The main site's avatar menu and profile page belong to `apps/web`.

## Visitor Analytics

GA4 dashboards: [Overview](https://analytics.google.com/analytics/web/#/a413424914p560689577/reports/intelligenthome) and [Realtime](https://analytics.google.com/analytics/web/#/a413424914p560689577/realtime/overview). The configured account is `413424914`, property `560689577`, web stream `16206196176`, and measurement ID `G-DNW94H7H8N`.

Identity and WWW share the GA4 implementation in `packages/analytics` and the same runtime `GA_MEASUREMENT_ID`. Analytics loads only after opt-in on an exact production Loom HTTPS host. Only the root and `/headshots` landing pages, including their Chinese equivalents, are measured; profile, receipt, callback, and API paths are excluded. Measurement sends sanitized page paths and referrer origins without account, order, payment, or sign-in data.

Analytics settings and browser test exclusion are shared with WWW through separate 180-day preference cookies. Open a public page with `?analytics_test=1` to exclude this browser, or `?analytics_test=0` to remove that exclusion. These preferences do not affect shared authentication. Local and Workers previews do not collect analytics. Keep enhanced measurement disabled in GA4 because the application sends manual page views. See [WWW visitor analytics](../web/README.md#visitor-analytics) for collection boundaries, consent controls, and metric definitions.

On 2026-10-26, deployment readback confirmed Identity version `909007d9-8b13-43d3-bded-7f0ecf1c3049` served 100% of traffic. The full `mise run verify` passed, including 17 analytics tests. Actual browser validation confirmed checkout `/headshots` returned a successful GA collection response (204) using the same browser identifier as WWW. Realtime displayed one controlled test visitor; this is collection acceptance evidence, not organic visitor growth. See the WWW analytics record for consent, route-transition, and profile-exclusion checks.

## Local Development

Initialize the application from the repository root:

```bash
mise run setup
mise identity dev
```

The default address is `http://localhost:3001`. You can also run `mise run dev-identity`; both commands start the same application. The development entry point applies local D1 migrations first. Pages remain accessible without provider configuration, while sign-in and payment services return clear 503 responses.

Use `mise identity <command>` for routine operations; `mise run identity:<command>` is also supported:

```bash
mise identity help
mise identity build             # Build Next.js and generate OpenNext/Workers artifacts
mise identity preview           # Local Workers runtime on port 3001
mise identity test
mise identity coverage
mise identity check-session     # Verify the real SDK protocol in the Workerd runtime
mise identity verify            # Types, lint, coverage, JWT runtime, build, and packaging
mise identity deploy-dry-run    # Build and package without deploying
mise identity wrangler --version
```

mise installs and pins the Wrangler CLI. OpenNext's Node API and runtime checks still use the package dependency pinned to the same exact version. To inspect the deployment command without building or deploying, run `mise run --dry-run identity:deploy`.

Environment files:

- `apps/identity/.env.local`: public Next.js local configuration only; leave secret values empty.
- `apps/identity/.dev.vars`: local Next.js/OpenNext bindings and actual local secrets.
- `setup` creates either file from `.env.example` only when it is missing, preserves existing contents, and both files are ignored by Git.
- The server prefers non-empty OpenNext/Workers binding values, then falls back to the process environment. Explicit empty strings for `CREEM_MODE` and the legacy `STRIPE_MODE` are preserved for validation to reject; they must not fall back to another mode. Avoid inconsistent configuration across the two local files.

## Configuration

| Name                    | Purpose                                                                                                                                                                                                                 | Where to configure                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `APP_URL`               | This application's exact origin, such as local `http://localhost:3001` or the deployed HTTPS origin; exclude paths, query strings, and fragments                                                                        | Local environment files; remote Worker Variable    |
| `LOGIN_URL`             | Central authentication origin, used as the SDK baseUrl and sole OIDC callback host; this exact host serves the sign-in page                                                                                             | Local environment files; remote Worker Variable    |
| `AUTH_SUCCESS_URL`      | Trusted root origin for the site's default return destination, which defaults to its /workspace path; use HTTPS for deployed addresses, with HTTP allowed for local loopback; defaults to the `APP_URL` root when unset | Local environment files; remote Worker Variable    |
| `LOGTO_ENDPOINT`        | Logto tenant URL, without an additional `/oidc` path                                                                                                                                                                    | Local environment files; remote Worker Variable    |
| `LOGTO_USER_NAMESPACE`  | Stable tenant identifier for the local users table; defaults to `LOGTO_ENDPOINT` when unset; explicitly pin the original value before changing the tenant domain                                                        | Local environment files; remote Worker Variable    |
| `LOGTO_APP_ID`          | Logto Traditional web application ID                                                                                                                                                                                    | Local environment files; remote Worker Variable    |
| `LOGTO_APP_SECRET`      | Client secret for the same application                                                                                                                                                                                  | `.dev.vars` only; remote Worker Secret             |
| `LOGTO_COOKIE_DOMAIN`   | Fixed to `.loom-labs.ai` in production; leave empty for local localhost                                                                                                                                                 | Public local configuration; remote Worker Variable |
| `LOGTO_COOKIE_SECRET`   | Random key input of at least 32 characters, used to derive the D1 session-state encryption key; keep it identical across shared applications, restarts, and redeployments                                               | `.dev.vars` only; remote Worker Secret             |
| `CREEM_MODE`            | Currently accepts only `test`; defaults to test only when unset; rejects explicit empty strings, whitespace, live, and all other values; configure the same value in WWW                                                | Public local configuration; remote Worker Variable |
| `CREEM_PRODUCT_ID`      | USD 9.99 professional headshot package test product, currently `prod_6ntBKFLfAklD4ipCBu5exj`                                                                                                                            | Public local configuration; remote Worker Variable |
| `CREEM_PRO_PRODUCT_ID`  | USD 1.00 Loom Pro test product, currently `prod_7axKhvtA10UxHeQlhFi91U`                                                                                                                                                 | Public local configuration; remote Worker Variable |
| `CREEM_API_KEY`         | Test key beginning with `creem_test_`; the SDK explicitly calls the test API and does not select the environment from a request                                                                                         | `.dev.vars` only; remote Worker Secret             |
| `CREEM_WEBHOOK_SECRET`  | Signing secret for the raw request body at the Creem test endpoint, shared by Pro and headshot notifications; ownership is still determined per order                                                                   | `.dev.vars` only; remote Worker Secret             |
| `STRIPE_MODE`           | Mode for historical orders and webhooks; exactly `test` or `live`, defaulting to test only when unset; rejects empty strings and invalid values; currently kept at test                                                 | Public local configuration; remote Worker Variable |
| `STRIPE_SECRET_KEY`     | Key for historical Stripe order and refund queries; must match the original mode, Price, Session, and events; not used for new purchases                                                                                | `.dev.vars` only; remote Worker Secret             |
| `STRIPE_WEBHOOK_SECRET` | `whsec_` signing secret for the retained historical Stripe endpoint; CLI forwarding and the remote endpoint use different secrets                                                                                       | `.dev.vars` only; remote Worker Secret             |
| `STRIPE_PRICE_ID`       | Retained fixed, one-time Stripe Price configuration for historical orders; does not change existing order amounts or ownership                                                                                          | Local environment files; remote Worker Variable    |
| `GA_MEASUREMENT_ID`     | Optional GA4 web-stream measurement ID (`G-…`), shared with WWW; unset disables analytics and collection requires visitor consent                                                                                       | Remote Worker Variable                             |
| `DB`                    | D1 binding, not a connection string                                                                                                                                                                                     | `d1_databases` in `wrangler.jsonc`                 |

Generate a cookie secret with `openssl rand -base64 32`, then save it in a local file or Secret. Do not commit actual credentials, put them in `NEXT_PUBLIC_*`, or expose secrets in command-line arguments, pages, screenshots, or logs. The root `.env` does not replace application configuration.

## Logto Applications and Upstream Identity Providers

### Connecting the Application to Logto

Create your own **Traditional web** application in the Logto tenant and enter its application ID, application secret, and tenant endpoint in the configuration above. Register these two addresses for this application:

| Logto application field    | Address                          |
| -------------------------- | -------------------------------- |
| Redirect URI               | `${LOGIN_URL}/api/auth/callback` |
| Post sign-out redirect URI | `${APP_URL}/`                    |

Register local and remote callbacks separately. The SDK consistently uses `LOGIN_URL` as its baseUrl; the production callback is `https://login.loom-labs.ai/api/auth/callback`, never derived from Host. A product's `/api/auth/login` returns a 303 redirect to the central sign-in page. `returnTo` accepts only canonical HTTPS `*.loom-labs.ai` URLs, excluding login/auth destinations, userinfo, nonstandard ports, and fragments, while preserving the path and original query string. A valid shared session returns directly to the product; anonymous users use the fixed Google/GitHub providers. The destination is stored in the official SDK's encrypted sign-in state in D1; the browser holds only a 10-minute flow identifier. The callback validates state, PKCE, issuer, audience, and signatures before validating the destination again. Legacy `destination=website|checkout` supports only fixed destinations; unknown or duplicate parameters are rejected. Clients cannot specify arbitrary IdP targets.

### Custom Domains and Existing User Ownership

The configuration below was previously accepted for the development tenant and is retained as a development reference. See the [cutover record](../../docs/production-cutover.md) for production targets and actual cutover status. login and checkout are bound to this Worker; auth is the development tenant's custom Logto domain. Historical acceptance under this configuration covered GitHub returns, Sandbox payments, entitlement revocation after full refunds, and Google's central callback.

```dotenv
APP_URL=https://checkout.loom-labs.ai
LOGIN_URL=https://login.loom-labs.ai
AUTH_SUCCESS_URL=https://www.loom-labs.ai/
LOGTO_ENDPOINT=https://auth.loom-labs.ai
LOGTO_USER_NAMESPACE=https://kpy72v.logto.app
```

`login.loom-labs.ai` and `checkout.loom-labs.ai` are bound to this Worker. The former serves the central sign-in page and initiates and receives the sole OIDC callback; the latter serves account and purchase pages. `auth.loom-labs.ai` hosts Logto authentication, while `www.loom-labs.ai` serves product pages from apps/web. Every product goes through login with a validated, complete returnTo path and query string; a valid shared session returns directly to the product. Upstream Google/GitHub connector callbacks remain registered under the Logto auth domain and must not be confused with this application's login callback.

The official `@logto/node/edge` SDK handles protocol validation and refresh. Next.js cookie APIs carry only random identifiers. The production session cookie is `__Secure-loom_sid_<appId>` and the flow cookie is `__Secure-loom_flow_<appId>`; both use `Domain=.loom-labs.ai; Path=/; HttpOnly; Secure; SameSite=Lax`. WWW/checkout/login share D1, the original identity key, app ID, endpoint, and namespace. Tokens and SDK state are stored encrypted in D1. Parent-domain cookies reach all subdomains, which must be treated as one trust boundary. Creem returns to the account or headshot page in the original language, where the local `purchase_id` is used to query the order. Historical Stripe webhook paths and raw-body signature validation remain in place and are unaffected by sign-in redirects.

The migration from self-contained cookies to D1 sessions means that neither the old `__Secure-loom_session_<appId>` cookie nor the host-only `logto_<appId>` cookie is accepted as proof of sign-in; existing users must sign in once again. Sign-out clears both old and new parent-domain cookies with matching Domain/Path values, along with the current host's legacy cookie. The original `LOGTO_COOKIE_SECRET` remains a server-side key derivation input and must never be written to the browser.

When changing only the access domain of the same Logto tenant, keep `LOGTO_APP_ID`, the cookie secret, and `LOGTO_USER_NAMESPACE` stable. Existing development users have the original endpoint stored in `users.issuer`, so the development tenant's namespace is fixed to `https://kpy72v.logto.app`; no database rewrite or order reassociation is needed. This field represents a stable local identity namespace. The SDK still obtains and validates the actual OIDC issuer through discovery at the current endpoint. The production tenant uses its own namespace rather than the development value. Namespaces must not automatically merge identities from other tenants, and users are not matched by email. Changing domains without pinning the namespace can cause a user primary-key conflict, in which case the application rejects the request.

### Connecting Google/GitHub to Logto

This layer uses a different set of OAuth credentials and callbacks: **Google/GitHub → Logto**. Signing in to the Logto console or creating a development tenant does not mean that the tenant already has social sign-in credentials.

1. Create an OAuth application you control in Google Cloud or GitHub, and obtain its Client ID and Client Secret.
2. Add Google/GitHub under Logto's Social connectors and enter the provider credentials.
3. Copy the Callback URI shown for that connector and register it in the corresponding provider application. This is **Logto's connector callback**, not this application's `/api/auth/callback`.
4. Enable the configured connector under Logto's Sign-up and sign-in, save, and then test the sign-in buttons.

The development tenant previously registered Google/GitHub callbacks under auth.loom-labs.ai and kpy72v.logto.app. The production tenant uses new connector callbacks under `5z8hdi.logto.app`; see the [object inventory](../../docs/production-cutover.md) for exact IDs and URIs. The product login callback cannot replace upstream connector callbacks, and the old development configuration is not a fallback identity provider for production.

Google's test audience must include the actual test account. Required settings depend on that OAuth application's audience, publishing status, and scopes. An existing Google OAuth client may add a Logto callback where permitted. For GitHub OAuth Apps, register the exact callback in the current console, preserve addresses still used by other applications, and disable wildcards. Do not assume that different provider application types or versions impose the same limit on callback URLs.

Both Google/GitHub demo connectors have been replaced with dedicated credentials under the user's control. If other development tenants offer connectors labeled as demos, they may be used for development verification according to the console instructions. `socialConnectors: []` in the public sign-in configuration means only that social sign-in is currently disabled; it does not prove that the console has no demo connectors. Demo connectors must not be used in production. After testing, delete them or replace them with credentials you control, as instructed by the console. Demo credentials are not guaranteed to be provisioned in every tenant.

Provider OAuth secrets are stored in the **Logto connector**; this application does not define separate `GOOGLE_CLIENT_SECRET` or `GITHUB_CLIENT_SECRET` values. Dedicated OAuth applications still require the provider configuration steps above. See the [Google connector](https://docs.logto.io/integrations/google), [GitHub connector](https://docs.logto.io/integrations/github), and [social sign-in setup](https://docs.logto.io/connectors/social-connectors).

The user created the Logto development and production tenants in advance. The following results belong to historical development-tenant acceptance: 1 personal account was added to the Google OAuth test audience, both Google/GitHub demo connectors were replaced with dedicated configurations, and real GitHub sign-in completed through both the old and new entry points. Use the [production cutover guide](../../docs/production-cutover.md) for production objects and current cutover status; development identity-provider acceptance does not establish production readiness.

An early Google test in the development tenant reached the explicit account-linking page for accounts with the same email address, and that branch was stopped at the user's request. During later development-tenant acceptance, Google proceeded from the official account chooser through the Logto callback to WWW, where the application recognized the same existing identity. Read-only settings showed existing GitHub and Google connections; no linking, merging, or connection edits were performed in that run. These historical Google/GitHub results for identity recognition and sign-out across three domains do not establish that a complete sign-in flow has passed for the production tenant. Automatic same-email linking is disabled in production.

The production Free tenant has saved and reloaded light/dark primary colors, Dark mode, and [Custom CSS](../../docs/logto-branding.css). The inline CSS and Loom decoration observed in a real GitHub callback for the development tenant are retained only as historical visual evidence. End-to-end authorization validation for production remains pending in this phase. Native Company logo/Favicon assets have not been uploaded, Powered by Logto remains visible, and Pro has not been enabled. See [Logto branding](../../docs/logto-branding.md) for the configuration scope and rollback instructions.

Development tenants carry development labels and user-data retention limits and must not serve as the production user database. Verify plans, quotas, and migration arrangements separately before production launch. See [Logto tenant settings](https://docs.logto.io/logto-cloud/tenant-settings).

### Session Boundaries

A successful callback creates a D1 application session with a fixed 14-day lifetime. Requests and token refreshes never extend its expiry. Sign-in flow state lasts only 10 minutes. `auth_sessions` stores only SHA-256 hashes of random SIDs and HKDF/AES-GCM-encrypted SDK state; the browser holds no ID, access, or refresh tokens.

Requests first check that the D1 session is neither expired nor revoked, then read identity claims. When an ID token or access token has 60 seconds or less remaining, or the access-token cache is missing or invalid, the server refreshes through the official SDK's `clearAccessToken()` / `getAccessToken()` methods, then rereads and validates the identity. RSC reads do not need to write cookies. Refreshes across Workers use D1 `first-primary`, version-based compare-and-update, and a 30-second lease. Each SDK request is limited to 5 seconds, with a 20-second total limit for protocol operations. Waiting beyond the limit for an active lease returns `session_busy`. An expired lease or uncertain refresh outcome revokes the session to avoid replaying a refresh token that may already have been consumed.

Sign-out accepts only POST requests from the exact same origin. It first revokes the current session and associated flows in D1, then uses the SDK to revoke the upstream refresh token on a best-effort basis. The adapter clears cookies in finally, and the final 303 redirect performs Logto sign-out. A copied, revoked SID cannot restore the session on a later request; concurrent refreshes and late callbacks from known associated flows cannot reactivate it either. Shared sign-out covers only the shared session and flows identified by the current cookie, not all of the user's devices or unrelated, independently initiated new authorizations. Business operations already in progress are not retroactively canceled.

The 14-day period is the maximum absolute lifetime the application permits, not an unconditional promise that sign-in will never be required sooner. Clearing cookies, signing out, upstream token invalidation, key or endpoint changes, and security anomalies may require earlier sign-in. A real-time back channel for user disablement in the Logto console has not been integrated. The application identifies users by a stable `(tenant namespace, subject)` pair and does not associate purchases by email. ID Tokens are not used as general business API bearer tokens. See the [session lifecycle guide](../../docs/session-lifecycle.md) for the detailed design, migration, and verification boundaries.

## Historical Stripe Orders and Mode Isolation

This section records the historical Stripe protocol and acceptance results. New Loom Pro purchases create Creem Checkout through `/api/checkout`, and `/api/orders/[id]` reads new or historical orders subject to user ownership. Use the [Creem integration guide](../../docs/creem-test-integration.md) for new products and current test cards; new Stripe purchases are no longer created.

The historical Stripe protocol explicitly selects its mode through `STRIPE_MODE=test|live`. It defaults to test only when unset and rejects whitespace or invalid values; Live is never inferred from keys. Keys, Price, Session, PaymentIntent, events, and originating orders must all match the selected mode. That phase used Sandbox with Live disabled. Retained validation for production prices does not mean real payments are enabled.

`orders` and `stripe_events` store the mode, and migration `0003` marks historical records as test. New orders explicitly use payload version 2 and include the mode in metadata. Legacy test-v1 retries preserve the original request body and idempotency key without adding currency or mode metadata; only this branch allows legacy metadata to omit the mode. live-v1 and unknown versions are rejected. Entitlements must come from paid orders belonging to the same user, product, and feature, with a mode matching the current configuration. test accepts v1/v2; live accepts only v2. See the [production cutover guide](../../docs/production-cutover.md) for database isolation and identity cutover rules.

Historical Stripe purchase flow, retained as a protocol reference and no longer used to create new purchases:

1. A signed-in user starts Checkout. The client submits only a UUID `requestId` and reuses it for retries after failure.
2. The server derives the user from the session, reads and validates the Price, saves a local order in D1, and then creates Checkout with an idempotency key bound to that order.
3. After the hosted checkout completes a test payment, the page returns and queries the current user's order up to 15 times at 2-second intervals. If a query fails or processing is still underway, the user can select “Refresh status” to retry.
4. After validating the webhook signature, the server rereads Stripe's Session, PaymentIntent, and current refund state, checks order ownership, Price, amount, currency, and quantity, and atomically records the event, order, and entitlements.
5. `/api/premium` derives the identity from the server-side session and queries valid D1 entitlements on every request. Success-page query parameters, client-supplied user IDs, and button state cannot grant access.

That phase fixed quantity at 1, accepted cards only, and disabled promotion codes, automatic tax, and automatic localized pricing. Historical Stripe test cards are documented in the [official Stripe testing guide](https://docs.stripe.com/testing). Current new purchases must use [Creem test cards](https://docs.creem.io/getting-started/test-mode); do not enter real card details.

### Webhook

The historical Stripe webhook uses `${APP_URL}/api/webhooks/stripe`. Its endpoint was changed from the original workers.dev address to `https://checkout.loom-labs.ai/api/webhooks/stripe` and read back to confirm the update. Actual payment notifications, entitlement revocation after refunds, and premium API rejection were verified in that phase. Keep these event subscriptions registered; historical results do not establish acceptance of the new Creem flow:

- `checkout.session.completed`
- `checkout.session.expired`
- `charge.refunded`
- `refund.created`
- `refund.updated`

Set `STRIPE_WEBHOOK_SECRET` to this endpoint's signing secret. For local development, Stripe CLI can forward events from the same Sandbox to `http://localhost:3001/api/webhooks/stripe`; use the signing secret printed by that CLI session, not the remote endpoint's secret. See [Stripe webhooks](https://docs.stripe.com/webhooks).

The webhook uses the raw request body and asynchronous signature verification. It requires neither user sign-in nor a browser Origin. D1 event-processing markers and order/entitlement changes are committed in the same batch. Failures return an error so Stripe can retry delivery. A late expiration event cannot overwrite a paid state.

### Refunds and Recovery

- When the total successfully refunded amount reaches the original order amount, mark the order as `refunded` and revoke that order's entitlements.
- Partial, pending, or failed refunds do not revoke existing entitlements; this phase has no proportional downgrade rules.
- Payment confirmation also rechecks successful refunds to prevent a payment notification arriving after a refund from restoring access.
- Entitlements are stored separately per order. Refunding one order does not revoke access supported by other valid orders.
- That phase has no in-app refund button or scheduled reconciliation service. Historical refunds are initiated in Stripe Sandbox, and problematic events can be inspected and redelivered in Stripe. Refreshing the page only queries status and does not replace webhook confirmation.

## Local Validation and Workers Preview

```bash
mise identity check-types
mise identity lint
mise identity test
mise identity coverage
mise identity build
mise identity preview
```

`next dev` runs primarily in Node.js. `preview` uses the separate `env.preview` in `wrangler.jsonc`, clears remote Custom Domain routes, applies that environment's local D1 migrations, then builds and starts the Workers runtime with `--env preview --local`. It does not apply migrations to a remote database.

The central sign-in preview runs at `http://localhost:3001`, and WWW at `http://localhost:3000`. Both applications use the same local cookie key and localhost, with Domain left empty, LOGIN_URL=localhost:3001, and AUTH_SUCCESS_URL=localhost:3000. Preview clears production routes without relaxing the exact production Origin checks. Real local OAuth requires registering the central localhost:3001 callback.

The following are historical acceptance results for English defaults, standard product copy, centered sign-in controls, the automatically playing carousel, and menu icons. At that time, the repository-wide `mise run verify` returned 0. identity-core passed 263 tests, identity 149, web 32, and i18n 10, for a total of 454, with 4 legacy Worker tests counted separately. Actual local Workerd shared-session checks passed 9/9, local HTTP checks 67/67, and independent online HTTP checks 67/67. Readback confirmed that identity version `17aeae33-1ab4-450e-af1e-074e7a690576` and WWW version `a39d3bf2-e75b-492c-9af7-fe3cb14ac9a0` each served 100% of traffic. GitHub returned to the complete `/workspace?source=login-polish&keep=a%2Bb` URL, and Google also completed the development-tenant application callback and reached WWW. These results do not establish acceptance of the production identity cutover.

At the earlier D1 session authentication checkpoint, identity was `9e04b462-53e1-4660-8636-3c13139b00cc`, WWW was `3b1091f9-a959-4352-91ac-54b6f0731811`, and `0002_sessions.sql` had been applied. core passed 239 tests, identity 137, and WWW 24, for a total of 400. core coverage was 98.17% statements, 95.47% branches, 100% functions, and 98.75% lines. Verification covered real GitHub shared sign-in across three domains, official SDK refresh, shared sign-out, and rejection at a controlled absolute expiry; this was not a test that actually waited 14 days. All 9 local Workerd groups passed. The session mechanism remains in use; see the [session lifecycle guide](../../docs/session-lifecycle.md) for evidence.

The following is the actual record for the previous self-contained parent-domain cookie version on 2026-10-23: the sign-in and purchase Worker was `a4224f5a-c2f1-427f-87c5-2fb94f03cce2`, and WWW was `c7fbf7c8-c45a-45e5-b6d2-7ae7c15a0b85`. Repository-wide validation, local Workerd checks, and 60 online anonymous checks passed. Verification covered real GitHub shared sign-in across three domains, returning users with valid sessions to their original product, shared sign-out, main-site execution after a USD 1.00 Sandbox payment, retained entitlements after signing out and back in, and denial of access to the original session after a full refund. The final valid entitlement count was 0; the 2 existing pending purchase intents were unchanged. Browser and order evidence is in `shared-domain-browser-e2e.json` and `shared-domain-billing.json`, respectively. See the [Feishu operation record](https://bytedance.larkoffice.com/docx/O5IUdAY2bon0L1x72gucn73NnOh) for complete steps and the object inventory.

The following historical results belong to the earlier independent-session design and are not acceptance evidence for the current parent-domain shared session: that domain setup passed the repository-wide `mise run verify` and 182 tests. Core server/API coverage was 98.57% statements, 98.06% branches, 100% functions, and 99.39% lines. Local Workers preview, local D1 smoke tests, remote D1 health checks, and 9 anonymous boundary checks passed.

The old workers.dev entry point completed GitHub sign-in, Sandbox payment, entitlement retention after signing in again, and revocation after a full refund. Evidence is in `.codex-artifacts/identity/browser-e2e.json` and `cloud-e2e-billing.json`.

An early version on the new domains verified both GitHub website/checkout return destinations, activation after a USD 1.00 payment, entitlement retention after signing out and back in, and D1 revocation plus premium API rejection after a successful full refund. The D1 user count remained 1. Evidence is in `custom-domain-browser-e2e.json` and `custom-domain-billing.json`. Google verification in that phase reached only the explicit account-linking page; see above for the subsequently completed Google application callback results.

During Logto SDK integration, the Next.js build selected jose's Node exports, causing incompatible ES384 signature verification in the Workerd environment used for this integration. The direct dependency is now pinned to `jose@5.10.0`, development and builds explicitly use webpack, and an exact `jose$` alias points to the library's official WebCrypto exports. The SDK's signature, issuer, and audience checks remain enabled. `scripts/check-jose-runtime.mjs` verified four behaviors in Workerd: a valid ES384 signature, a tampered signature, a wrong issuer, and a wrong audience. This fix addresses the dependencies and build path used here; it does not imply that Cloudflare generally lacks Node crypto support.

Real integration testing must at least verify that `/api/me` returns the current user after sign-in; premium APIs return 401 for anonymous users and 403 for users without a purchase; webhooks grant access even if the page is closed after payment; a forged success page cannot grant access; duplicate events do not duplicate entitlements; and a successful full refund revokes only the corresponding order's entitlements. Session checks must also cover automatic refresh across products, denial after refresh failure, SID replay after sign-out, concurrent refresh/sign-out, and the fixed 14-day boundary. Advancing time and using synthetic protocol tests must not be described as verification that actually waited 14 days.

## Cloudflare Deployment

`wrangler.jsonc` targets the `loom-identity` Worker, with `.open-next/worker.js` as its entry point, `.open-next/assets` for static assets, and `DB` as its D1 binding. The in-place rename preserved the old `hotkey-tools-identity` D1 database and its existing data. The production identity cutover uses a separate D1 database; see the [production cutover guide](../../docs/production-cutover.md) for targets and progress. R2 caching is not configured by default, and dynamic user data does not use shared caches. See [Cloudflare Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) and [OpenNext configuration](https://opennext.js.org/cloudflare/get-started).

On 2026-10-23, the existing `hotkey-tools-identity` Worker in Cloudflare was renamed in place to `loom-identity`, matching the local `name`. Readback confirmed that the existing deployment still served 100% of traffic and that Secrets, the D1 binding, and the `login.loom-labs.ai` / `checkout.loom-labs.ai` custom domains were retained. For similar migrations, do not simply change `name` and deploy, which may create a different Worker. Complete the cloud-side in-place rename first, then read back the bindings. Inspect Secret names only, without exposing their values. Do not change the session key, Logto parameters, Stripe webhook, or other business identifiers.

Run from the repository root:

```bash
mise identity login
mise identity status
mise identity db-create
```

Enter the actual `database_id` from the output in this application's `wrangler.jsonc`. Apply remote migrations:

```bash
mise identity db-migrate
```

If the Worker does not yet exist, you may deploy the application with incomplete configuration first; pages will indicate that configuration is pending. Complete the configuration afterward and redeploy. That initial deployment does not establish successful sign-in or payment integration.

Set `APP_URL`, `LOGTO_ENDPOINT`, `LOGTO_APP_ID`, `CREEM_MODE=test`, `CREEM_PRODUCT_ID`, and `CREEM_PRO_PRODUCT_ID` in Worker Variables. Configure `LOGIN_URL`, `AUTH_SUCCESS_URL`, and the fixed `LOGTO_USER_NAMESPACE` for the target environment. Set the four current secrets separately in Worker Secrets, or enter them one at a time with these interactive commands:

```bash
mise identity wrangler secret put LOGTO_APP_SECRET
mise identity wrangler secret put LOGTO_COOKIE_SECRET
mise identity wrangler secret put CREEM_API_KEY
mise identity wrangler secret put CREEM_WEBHOOK_SECRET
```

Retain the historical `STRIPE_MODE=test`, `STRIPE_PRICE_ID`, and Stripe Secrets to handle original orders and refunds. Do not replace these historical settings with Creem products or keys.

This application's APP_URL is checkout, while WWW's APP_URL is www; each is used only for its own pages/APIs and exact Origin checks. Both applications use LOGIN_URL=login as the SDK baseUrl, with OIDC callbacks handled only on login. Within an environment, Cookie Domain=.loom-labs.ai, D1, app ID, session key, endpoint, and namespace must all match. Apply `0001`–`0006` to the target database in order before deploying Identity and WWW versions that read the new fields. Both applications currently set `CREEM_MODE=test`. Do not migrate old sessions across tenants; use a new production key and require users to sign in again. Retain the old database and never migrate test entitlements by matching email addresses. Both Creem and the retained Stripe endpoint point to checkout. Then run:

```bash
mise identity deploy
mise run web:deploy
```

Before the first remote deployment, confirm that migrations, Variables, and Secrets are configured. The application's remote migration/deployment commands reject an all-zero database UUID. `deploy:dry-run` checks packaging only; it neither creates resources nor validates provider accounts. Feasibility on free resources still depends on the actual Worker bundle size, CPU usage, and account quotas. The project does not automatically upgrade plans.

## Data and APIs

`migrations/0001_identity.sql` contains `users`, `orders`, `entitlements`, and `stripe_events`. `0002_sessions.sql` adds `auth_sessions`. `0003_stripe_mode.sql` adds the mode to Stripe orders and events and marks historical records as test. `0004_checkout_payload_version.sql` preserves version 1 for historical Stripe Checkout requests; subsequent Stripe orders explicitly use 2. `0005_creem_headshot_packs.sql` adds `creem_orders`, `creem_events`, and `headshot_packs`. `0006_creem_pro.sql` extends Creem orders to support a separate USD 1.00 Pro purchase and adds `creem_pro_entitlements`, while preserving existing records and relationships. Apply migrations in order and never modify files that have already been applied. Manage local data, test payments, and future real-payment data separately; do not mistake remote resources for a local test database.

| Route                                | Behavior                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                    | Check the D1 binding and migrated tables                                                                                                |
| `GET /api/auth/login`                | Redirect products to the central page; the central page accepts fixed providers and trusted returnTo destinations                       |
| `GET /api/auth/callback`             | After SDK validation, return only to trusted product paths and query strings; reject fragments                                          |
| `POST /api/auth/logout`              | Same-origin only; revoke the D1 session, clear cookies, and perform sign-out with a 303 redirect                                        |
| `GET /api/me`                        | Current user and `{ premium }` entitlements; return `user: null` for anonymous users                                                    |
| `POST /api/checkout`                 | Same-origin and authenticated; create or resume the current user's Creem Pro purchase, with requestId and locale submitted              |
| `GET /api/orders/:id`                | Return only the current user's Creem Pro or historical Stripe order                                                                     |
| `GET /api/premium`                   | Require sign-in and valid entitlements                                                                                                  |
| `GET /api/headshot_packs`            | Current test product, the current user's orders, and headshot package entitlements                                                      |
| `POST /api/headshot_checkout`        | Same-origin and authenticated; create or resume a separate headshot purchase                                                            |
| `GET /api/headshot_orders/:order_id` | Return only the current user's headshot order                                                                                           |
| `POST /api/webhooks/creem`           | Validate the raw-body signature and verify the current transaction through the API; grant/revoke entitlements per Pro or headshot order |
| `POST /api/webhooks/stripe`          | Validate raw-body signatures for historical notifications, check the original mode, and process original orders and entitlements        |

Application-owned JSON APIs return `{ code: 0, msg: "success", data }` on success and `{ code, msg, error: { type } }` on failure, with the appropriate HTTP status. Business codes are centralized in `src/server/http-codes.ts`. Private-data responses use `private, no-store`. Sign-in redirects follow the OIDC flow rather than the JSON response format.

On the frontend, `_pages/identity` composes `features/manage-access` for Pro, and `_pages/headshots` composes `features/headshot-purchase` for headshot packages. Shared request parsing lives in `shared/api`, while generic components and themes live in the root `packages/ui`. Browser code must not import `src/server`.

### Local Secrets and Build Artifacts

Actual Logto / Creem secrets and retained historical Stripe secrets belong only in the ignored `.dev.vars`; production uses Cloudflare Secrets. `.env.local` contains only public configuration, with secret values left empty. OpenNext 1.20 embeds `.env*` values into the Worker. `.dev.vars` is not included in that compilation; Next development reads its local secrets through Cloudflare bindings. Do not copy actual credentials back into `.env.local`. Before building, `check-worker-env.mjs` checks dotenv files for every mode at the repository root and application level and rejects non-empty secret settings. It prints only file and variable names.
