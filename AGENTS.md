# Project Working Agreements

This file defines the repository-wide engineering standards for loom-web. Read it before changing code, and also follow any more specific `AGENTS.md` in the relevant subdirectory. The user's explicit instructions for the current task take precedence.

These standards draw on evals-grader's Evals Admin frontend stack, Feature-Sliced Design, Next.js server boundaries, shared UI, and validation practices, adapted to this repository's Cloudflare, Logto, Creem, legacy Stripe, and Python workspace setup. Do not copy that project's business modules, internal infrastructure, ports, or paths to skills that are not installed here.

## Current Goals and Application Boundaries

- Build the account and purchase application in `apps/identity`, with Logto Cloud sign-in, one-time Creem purchases, D1 entitlement records, and server-side authorization. All new purchases across the site use Creem Test mode: USD 1.00 for Loom Pro and USD 9.99 for the professional headshot package. Retain the Stripe SDK, its existing modes, and webhooks only for historical order queries, refunds, and entitlement revocation; continue checking valid historical Pro entitlements against their originating orders. Do not enable real payments without a further explicit request.
- Offer the professional headshot package as a one-time Creem Test mode purchase: USD 9.99 including tax, with entitlements to 4 finished photos and 1 redo. Use separate order, event, and package tables, allow repeat purchases, and grant entitlements and revoke them on refund independently for each order. This phase delivers payment and package entitlements only; photo upload, generation, and download are not yet available. Explicitly select Creem's test API and test keys, and reject production objects. Do not enable real payments without an explicit request.
- Creem currently accepts only `CREEM_MODE=test`. For compatibility, an unset value defaults to test; explicitly empty strings, whitespace, live, and all other values must be rejected. Configure `CREEM_PRODUCT_ID` (headshots) and `CREEM_PRO_PRODUCT_ID` (Loom Pro) in Identity. WWW reads only the mode and database entitlements and must not hold payment keys. Before deploying either application, apply migrations `0001` through `0006` in order to the shared target D1 database.
- Build every new web application as a **full-stack Next.js application**: pages and business APIs belong to the same application, service, and domain. Each product has its own application and package under `apps/<product_name>`.
- Use the App Router for pages and `src/app/api/**/route.ts` for HTTP APIs; keep business logic in the application's own `src/server`. Do not add a separate Hono or Express gateway, or another BFF, for the same web product.
- Deploy the Next.js application to Cloudflare through OpenNext as a single Worker serving pages, static assets, and APIs. Applications requiring sign-in or dynamic APIs must not set `output: "export"`.
- `apps/web` provides the Loom AI product homepage and workspace at `www.loom-labs.ai`, using Next.js/OpenNext for pages and protected APIs. `apps/identity` provides the shared sign-in entry point and purchase pages. Subdomains use a random session identifier cookie scoped to `.loom-labs.ai` to access the same D1 sessions and entitlements, with the same session encryption key and Logto application. Extract shared server implementations into packages; applications must not import from one another.
- Retain `apps/worker` as a legacy gateway example; it must not host the production homepage or new authentication or payment logic. Use normal product copy that reflects delivered capabilities, without Demo or example labels in the interface. Present current work plans as curated reading and planning content, without claiming to call real models or execute tasks for users. Payment notices must read the server-side `CREEM_MODE`, allow only test, and clearly state that no real charge will occur. Future real payments require separate integration and acceptance testing; changing the copy alone is insufficient.
- Preserve the existing uv workspace boundaries of `apps/python` and `packages/python/*`. Use a separate Python Worker only for capabilities that explicitly require Python; Next.js services remain responsible for user identity, orders, and entitlement checks.
- Applications must not import another application's implementation. Keep business types and interface definitions with their actual owner first; extract a package with clearly defined responsibilities only when multiple active consumers genuinely need to share them.
- The repository root manages only the workspace, toolchain, and tasks. It must not contain application code or declare a root Python package.

## Technology Stack and Tooling

- Web: Next.js 16, React 19, TypeScript strict mode, and Tailwind CSS 4.
- UI: shadcn/ui-style primitives, shared theme variables, and `cn()` from this repository's `packages/ui`; use `lucide-react` for icons.
- Persistence: Cloudflare D1. Use the published official Logto SDK for the authentication protocol and short-lived token refresh. Next.js reads and writes only the random session identifier scoped to the parent domain; store SDK state encrypted in D1. Use the official Creem SDK and hosted Checkout for new purchases, and retain the Stripe SDK for historical orders.
- Testing: Vitest; use Testing Library and happy-dom for React interaction tests when needed. Test database state and transactions in an environment that actually executes SQL.
- Use **Oxlint and Oxfmt** for static analysis and formatting. Do not add ESLint or Prettier configuration or dependencies.
- mise manages the project's pinned Node.js, pnpm, Python, uv, and Wrangler CLI versions. Use `mise identity <command>` (equivalent to `mise run identity:<command>`) as the standard Identity entry point, and `mise exec -- ...` for ad hoc commands. Do not change global tool versions.
- `.mise.toml` pins the Wrangler CLI through `npm:wrangler`. OpenNext's Node API, runtime validation, and pywrangler's internal calls still require Wrangler dependencies in the relevant packages. Pin them to the exact same version as mise rather than declaring separate version ranges. Update mise, the relevant packages, and the pnpm lockfile together when upgrading.
- `package.json` and `turbo.json` manage the package task graph; `.mise.toml` provides project entry points. Keep initialization logic in `scripts/setup.sh`; repeated runs must not overwrite existing keys or reset data.
- Framework, SDK, and OpenNext versions must be mutually compatible. Declare new dependencies directly in the package that uses them; a transitive dependency in the lockfile does not make it available for direct imports.
- Add React Hook Form and Zod only when a form actually needs complex validation. Introduce Zustand only for client state shared across components; use React itself for simple local state.

## Frontend Structure and Dependency Direction

Use Feature-Sliced Design. Create slices as needed, without pre-creating empty directories:

```text
apps/identity/src/
  app/                    # Next.js adapters: page/layout/route, etc.
  _app/                   # Optional FSD App layer: providers and app composition
  _pages/                 # Product page composition
  widgets/                # Optional self-contained interface sections
  features/               # User actions: sign-in, purchases, order queries, etc.
  entities/               # Optional frontend domain objects: users, orders, entitlements, etc.
  shared/                 # Browser-safe generic API clients, configuration, and utilities
  server/                 # Server-only authentication, payments, entitlements, database, and SDK adapters
```

- Frontend dependencies flow from `App → Pages → Widgets → Features → Entities → Shared`. Lower layers must not depend on higher layers, and separate slices in the same layer must not directly import one another's internals.
- `src/app` is the Next.js adapter layer, not the FSD App layer. Use `_pages` for FSD Pages and `_app` for FSD App to avoid conflicts with framework-reserved directories.
- Keep the standard `page.tsx`, `layout.tsx`, and `route.ts` names. When request interception is necessary, use Next.js 16's `src/proxy.ts`. Do not change `pageExtensions` to bypass architectural boundaries.
- Use Next.js path-based routing for page navigation. Do not use hash routing or fragments such as `#workspace` as page entry points. Sign-in and payment return URLs must also use actual paths. Every new page must support direct access and refresh.
- Pages are responsible only for composition. Put payment flows, polling, request retries, and other business state in the relevant feature's model/hooks/API.
- Expose each slice's public interface through `index.ts`; other slices must not bypass that entry point to access internal files.
- `shared` contains only generic capabilities without product business rules. Do not hide order pricing, identity ownership, or entitlement rules in generic `utils`, `helpers`, or `manager` modules.
- Client code must not import `src/server`, Cloudflare bindings, databases, or payment/authentication keys. Use `server-only` in server modules to prevent accidental inclusion in client builds.
- Separate browser-safe request/response types from server implementations. The frontend must not become indirectly coupled to server SDKs through type imports.

## UI and Interaction Standards

- Choose components in this order: this repository's `packages/ui` → suitable official shadcn/ui components → custom product components with a clear need.
- Check existing components and the official shadcn/ui documentation before adding primitives. Put reusable primitives in `packages/ui` and export them publicly; keep product compositions in their owning application.
- `packages/ui/src/styles/globals.css` is the single source of shared theme variables. Product code uses semantic colors and border radii, plus Tailwind's default spacing and typography utilities.
- Do not hardcode hex/rgba colors or arbitrary border radii, spacing, or font sizes in product components. Do not introduce a duplicate token system.
- Compose styles with Tailwind utilities and `cn()`. Do not add CSS Modules, styled-components, Emotion, component-local styles, or inline style objects.
- Use semantic interactive elements such as `button` and `a[href]`, with a pointer cursor when enabled. Provide keyboard focus, disabled, loading, empty, and error states.
- Support mobile and desktop layouts, with a readable visual hierarchy, adequate contrast, form labels, and necessary `aria` attributes.
- The initial release supports Simplified Chinese and English through the next-intl App Router integration and message files in `packages/i18n`. English uses the root paths by default; Chinese uses `/zh`. Legacy `/en` page URLs must preserve their query strings and redirect to the corresponding English root paths. Do not implement localization through hash routing or client-only text replacement. APIs, authentication callbacks, and webhooks retain their original `/api` paths. `Link`, language switching, and external product links must preserve the user's selected language and valid return URL. Add every new user-facing string in both languages, and never branch business logic on translated copy.
- Native English speakers are the primary audience. Write product, SEO, and public AI-readable copy in idiomatic English first, then adapt it into natural Simplified Chinese. Lead with everyday needs and clear benefits; describe planned capabilities as product direction until they are available.
- Use natural Chinese in the Chinese interface and natural English in the English interface. Preserve SDK, protocol, and code identifiers, and product names where necessary. The shared language menu lists English, then “简体中文” (Simplified Chinese); this order must not override a user's saved language preference. Keep engineering configuration and implementation details in developer documentation rather than ordinary product flows.
- Use the shared `AppearanceProvider` for light, dark, and system appearance. Store theme and language preferences only in the parent-domain `LOOM_THEME` and `LOOM_LOCALE` cookies after validating them against their allowed enumerated values. These cookies must not carry identity or entitlements. Theme and language changes must not alter authentication cookies or relax sign-out origin checks.
- Use accessible Avatar/Dropdown Menu components for account menus, with a text fallback when the avatar is missing or fails to load. Profile data must come only from the currently validated identity; do not infer the user from URL parameters or email addresses. Carousels and animations must provide manual controls and honor reduced-motion preferences.
- Read homepage account status once per full page load and retain it across page routes in a shared client provider. Do not automatically synchronize on window focus, visibility changes, timers, or route changes. Update the account display only when the user reloads the page or explicitly refreshes it. Do not show synchronization text in the navigation during the initial read, and reserve stable space for the account entry. This display state must not be used for server-side authorization; protected requests must still validate the current session and entitlements.
- Public pages serve users, search engines, and AI retrieval. Render their main content on the server and provide accurate titles, descriptions, canonical URLs, sharing metadata, sitemaps, and crawlable internal links. Structured data must match visible content. Do not fabricate reviews, customers, or real model capabilities, or present Sandbox prices as production prices.
- Public product documentation may provide AI-readable text entry points such as `llms.txt`, kept in sync with the pages. Do not promise that these files improve search rankings. Sign-in, payment, private endpoints, and user data must not be indexed. Actual access control always relies on server-side authentication and authorization, not robots.txt.
- Public pages in each language must output HTML, titles, descriptions, canonical URLs, and hreflang for that language. Include public pages in both languages in the sitemap; private pages such as profile pages must not be indexed or included in the sitemap. Default to English when there is no language preference. Do not rely on the browser's Accept-Language to produce variable content for search engines; continue honoring a user's saved Chinese preference.

## Next.js Server Code and HTTP APIs

- Route Handlers only parse input, call services, and map responses. Put business workflows spanning multiple steps in the appropriate `src/server` modules.
- Only server code may access databases, external SDKs, and Cloudflare bindings. Explicitly handle missing configuration, external timeouts, and failure recovery on the server.
- Under OpenNext, use the Next.js Node.js runtime with `nodejs_compat`; do not set `runtime = "edge"`. Obtain D1 bindings through the official adapter.
- Do not use in-process Maps, global variables, or local files as the source of truth for sessions, orders, or entitlements.
- Parse and validate environment variables, HTTP input, and external data at their boundaries. Use a well-maintained schema library where runtime validation is actually needed; avoid repeatedly parsing the same data at every layer.
- Use `snake_case` for URL path segments, path parameters, and query parameters; use `camelCase` for JSON fields.
- Use a consistent response format for application-owned JSON APIs. Follow the relevant protocol for sign-in redirects and provider-defined protocol responses.

Success response:

```json
{ "code": 0, "msg": "success", "data": {} }
```

Error response:

```json
{ "code": 10001, "msg": "Safe readable reason", "error": { "type": "stable_error_type" } }
```

- Success responses must not contain `error`; error responses must not contain `data`. HTTP status codes must still correctly distinguish success, client errors, and server errors.
- Business error codes are stable positive integers, unique within the application and centrally registered in `src/server/http-codes.ts`. Clients branch on `code`, never on `msg` text.
- Put the generic browser request client in `src/shared/api` to handle response formats, HTTP errors, and safe error display consistently.
- User profile, order, session, entitlement, and paid-feature APIs must use `private, no-store` and must not enter shared caches.
- Error responses must not expose credentials, SQL, or raw external provider responses. Retain appropriately redacted stack/cause diagnostics on the server. Do not log session cookies, tokens, raw payment request bodies, or sensitive user profile data.

## Sign-in, Payments, and Authorization

- Use Logto Cloud Free with Google/GitHub sign-in, one-time Creem Test purchases, and D1-managed product entitlements. Retain the development tenant and legacy Stripe Sandbox. Production identities use the existing production tenant, a dedicated session key, and a separate production D1 database. Do not copy test sessions, orders, or entitlements, or automatically migrate identities by email.
- Grant Creem Loom Pro and headshot entitlements separately by fixed SKU. A headshot package must not grant Pro, and a Pro refund must not revoke entitlements from other originating orders or headshot packages. The server must verify Creem's mode, keys, fixed tax-inclusive amount, product, quantity, complete metadata, and current transaction status.
- The Stripe-specific rules below continue to govern historical orders and refunds. They do not authorize creating Stripe Checkout sessions for new purchases; Creem handles all current new purchases.
- Use the published official Logto SDK. Validate state, PKCE, issuer, audience, and signatures during callbacks. JWT decoding is not authentication validation. Do not modify SDK source code to set cookies.
- `login.loom-labs.ai` initiates sign-in and handles callbacks centrally. Return directly to the original product URL when the session is valid; require sign-in again when the session reaches its absolute expiry, has been revoked, or cannot be refreshed safely. Validate return URLs for HTTPS, the exact allowed domain suffix, port, and userinfo, while preserving valid paths and query strings. Reject external domains, fragments, and destinations that would cause sign-in loops.
- Production session cookies are named `__Secure-loom_sid_<appId>` and sign-in flow cookies `__Secure-loom_flow_<appId>`. Both store only random identifiers and use `Domain=.loom-labs.ai; Path=/; Secure; HttpOnly; SameSite=Lax`. Cookie writes and deletions must use matching Domain/Path values. All subdomains under the parent domain are within the session trust boundary; new products must not host untrusted subdomain content or use a different session key. Local development must not set the production parent domain, and local cookie names omit the `__Secure-` prefix.
- `auth_sessions` is the source of truth for session validity and revocation. Store only SHA-256 hashes of identifiers and SDK state encrypted with AES-GCM using an HKDF-derived key; never put tokens in browser cookies. Application sessions last a fixed 14 days from the successful callback; flow state lasts a fixed 10 minutes. Refresh must not extend the absolute deadline, and browser `Max-Age` alone is insufficient.
- When an ID token or access token has 60 seconds or less remaining, or the access-token cache is missing or invalid, refresh through the official SDK's public methods, then reread and validate the identity. RSC reads require only the cookie and must not depend on rewriting it. Serialize refreshes across Workers using D1 `first-primary`, version-based compare-and-update, and a 30-second lease. Bound request and total protocol duration. After a lock expires, do not take over its old refresh token. Revoke the session if the outcome is uncertain; never retry old state whose token may already have rotated.
- Shared sign-out first revokes the current shared session and associated sign-in flows in D1, then uses the SDK to revoke the upstream refresh token on a best-effort basis. The adapter clears cookies in `finally`, and the final response performs Logto sign-out with a 303 redirect. Concurrent refreshes or late callbacks from known associated flows must not restore a revoked session. This scope covers the shared session and flows identified by the current cookie; it does not sign the user out of every device or revoke unrelated, independently initiated new authorizations. Clearing cookies, signing out, upstream invalidation, or security anomalies may require signing in again before 14 days have elapsed.
- Derive user ownership from the stable identity in a validated session. Preserve the `(issuer, subject)` mapping; do not match orders or automatically merge accounts by email.
- Do not use ID Tokens as general business API access tokens. The first version of paid-feature authorization must not depend on Logto's paid RBAC/API resources.
- Check the exact configured Origin for browser write operations. Authenticate Creem and legacy Stripe webhooks using the raw request body and signature; do not require user sign-in or apply browser Origin checks to them.
- The server determines the product, amount, currency, and quantity. For Creem, persist the local order first, then create Checkout through an atomic database claim. Do not treat the provider's `request_id` tracking field as a verified idempotency guarantee. If the creation result is uncertain, refuse to blindly create another Checkout. Historical Stripe Checkout retries must continue using the original request fields and a stable idempotency key.
- Explicitly select the payment environment with enum-validated `STRIPE_MODE=test|live`; never enable Live automatically from request parameters or keys. For compatibility with the original development configuration, default to test only when the mode is unset. Reject empty strings, whitespace, and invalid values. The mode must match across Key, Price, Session, PaymentIntent, events, and originating orders. Do not configure the deployed site for live until merchant activation, Live Price/webhook configuration, and acceptance testing are complete.
- Store `stripe_mode` on orders and events; migrations must explicitly mark historical data as test. Entitlement queries must check the originating order, paid status, and current mode together. Test purchases must not unlock production entitlements. The current Logto production tenant uses a new, separate D1 database, but payment mode remains test; retain the old development database. Any future Stripe Live setup must use a database separate from test payments; mode fields do not replace database isolation.
- Explicitly record the mode in metadata for new Stripe objects. Legacy metadata may omit the mode only for historical `checkout_payload_version=1` when both configuration and order are test; all other ownership fields must still match. New orders explicitly use version 2 and must carry a matching mode in both test and live. Retries for historical version 1 Checkout sessions must preserve the original request fields and idempotency key; do not add currency or metadata and reuse the old key. Reject version 1 in live and unknown versions in all modes. Rollbacks must not discard existing production orders or redirect Live webhooks that still require processing to the test database.
- Grant entitlements only after the server verifies successful payment. Success-page parameters must not grant access.
- Webhooks must verify signatures against the raw request body, deduplicate events, and tolerate duplicate and out-of-order delivery. Commit event-processing markers, order updates, and entitlement changes atomically. Processing failures must be retryable.
- Manage entitlements independently by originating order. Revoke the corresponding order's entitlements only after confirming a successful full refund; late success events must not restore them. Other valid orders may continue to grant access.
- Check current entitlements on every protected operation. Hiding buttons, caching `isPaid` long term, or storing paid status in a long-lived cookie/JWT cannot replace server-side authorization.
- D1 is the source of truth for sessions, orders, and entitlements. Use KV only for caches or configuration that can tolerate propagation delays.
- Configure test and production keys, webhook secrets, callback domains, and databases separately. Never put secrets in `NEXT_PUBLIC_*`, source code, generated pages, or commits. The user must personally initiate real payment and refund acceptance tests; do not charge or refund payments yourself to validate production configuration. The user must complete merchant identity, settlement details, and service agreements.

## Code Quality and Validation

- Inspect the current code, manifests, lockfiles, and conventions before making changes. If ecosystem behavior is unclear, consult the official documentation and maintained implementation for the relevant version first.
- Name files and modules by business responsibility, with a single implementation for each behavior. Do not retain unnecessary V1/V2 variants, temporary compatibility paths, or duplicate business rules.
- Aim to keep each file within 400 lines, and split it by responsibility before it exceeds 600 lines. Do not compress formatting to meet line-count limits.
- Add migrations for database changes; never modify migrations that have already been applied. Migration, rollback, and recovery paths must be explainable.
- Test observable behavior, boundary conditions, state transitions, and failure recovery. Do not write tests that merely mirror the implementation.
- Applicable tests for authentication, payments, entitlements, and HTTP boundaries must cover both accepted and rejected paths. Core business code targets at least 90% coverage for statements, branches, functions, and lines. Do not meet the target by excluding untested business modules or skipping failure paths.
- Required test behavior includes the absolute 14-day session boundary, automatic short-lived token refresh, concurrent refresh/sign-out races, rejection after invalid or timed-out refresh, late callbacks, revoked SID replay, unauthenticated/unpaid access, cross-user order access, origin checks, forged callbacks, duplicate and out-of-order events, retries after transaction failure, full refunds, and entitlement isolation across multiple orders.
- Use unit/integration tests appropriate to the HTTP, SQL, or UI interaction boundary. Do not invent ineffective tests for styling or static configuration merely to increase coverage.
- Run type checks, lint, tests, and builds for affected packages first, then expand validation according to changes in shared modules and task entry points.
- Run `mise run verify` before delivering substantial changes. New applications also require actual HTTP smoke tests and OpenNext/Workers local preview validation.
- `next build`, OpenNext build, Wrangler dry-run, local preview, actual third-party integration tests, and cloud deployment provide different evidence. If real Logto/Creem accounts, remote D1, and domains are not configured, explicitly report what remains unverified. Record historical Stripe acceptance testing separately from the current new-purchase flow.
- The user develops and maintains this project alone. By default, work on future features directly on `main`; after applicable checks pass, commit with Conventional Commits and push to `origin/main`. Create or use another development branch only when the user explicitly requests it for the current task. Honor requests for prior review, local-only changes, or no commit/push yet.
- Do not overwrite or commit changes unrelated to the current task.
- Do not commit `.next`, `.open-next`, `.wrangler`, `dist`, coverage output, local environment files, tokens, or secrets.

## Command Entry Points

```bash
mise run setup
mise identity dev
mise identity build
mise identity preview
mise identity test
mise identity coverage
mise identity check-session
mise identity verify
mise identity deploy-dry-run
mise identity db-create
mise identity db-migrate
mise identity deploy
mise identity wrangler --version
mise run verify
```

The first Cloudflare deployment requires a real D1 ID, remote migrations, and configured secrets. Use `mise identity db-create`, `mise identity db-migrate`, and `mise identity deploy`. Do not describe a placeholder UUID or a dry-run without configured credentials as production-ready. `mise identity build` generates Next.js and OpenNext/Workers artifacts; `mise identity deploy-dry-run` builds and checks packaging, while only `deploy` actually publishes the application.
