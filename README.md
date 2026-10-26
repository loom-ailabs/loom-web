# loom-web

**Everyday AI. For everyone.**

Loom AI is building simple ways for anyone to use AI in daily life. Our goal is to bring practical AI tools, templates, skills, and plugins together around the things people want to do: write something, learn something, or make everyday tasks easier. No technical background should stand between someone and a useful result.

The current site introduces this vision and offers curated work plans for reading and planning. The workspace does not yet run AI models, create files, or take actions in external tools. New purchases use Creem Test mode and do not incur real charges.

[loom-web](https://github.com/loom-ailabs/loom-web) contains the Loom AI product homepage and workspace (`apps/web`), along with the sign-in and purchase application (`apps/identity`). Each application uses Next.js/OpenNext to serve pages and same-origin APIs. They share sign-in sessions, Logto identities, and Cloudflare D1 entitlements under `.loom-labs.ai`. The default `mise run dev` command still starts the account and purchase application; use `mise run dev-web` for the main site.

See the [Identity application guide](apps/identity/README.md) for setup, identity provider configuration, and payment integration testing. Repository conventions are documented in [AGENTS.md](AGENTS.md).

Both Workers use the Logto production tenant on the Free plan and a dedicated D1 database. All new purchases across the site now use Creem Test mode: USD 1.00 for Loom Pro and USD 9.99 for the professional headshot package. Neither purchase incurs a real charge. Stripe remains available for historical order queries and refund processing. See the [Creem integration guide](docs/creem-test-integration.md) for the current configuration and acceptance results, and the [production cutover guide](docs/production-cutover.md) for the identity migration record.

The professional headshot package is a separate Creem Test product: a USD 9.99 one-time purchase records an entitlement to 4 finished photos and 1 redo per order. Repeat purchases and entitlement revocation after a full refund are supported. The entry points are `/headshots` and `/zh/headshots` in the account application; photo upload, generation, and download are not yet available. Headshot packages do not grant Loom Pro. The two products track their originating orders and revoke entitlements after refunds independently. See the [Creem test payment integration guide](docs/creem-test-integration.md) for configuration and staged acceptance checks.

## Applications and shared packages

| Directory                     | Stack                                                        | Responsibility                                                                                              |
| ----------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `apps/identity`               | Next.js 16, React 19, Tailwind CSS 4, Logto, Creem, OpenNext | Default product: accounts, purchases, orders, and paid access authorization; pages and APIs share an origin |
| `packages/ui`                 | shadcn/ui-style components, Tailwind theme variables, `cn()` | Shared UI primitives such as Button, Card, Badge, and Alert                                                 |
| `apps/web`                    | Next.js 16, React 19, TypeScript                             | Loom AI main site, workspace, and protected feature APIs                                                    |
| `apps/worker`                 | TypeScript, Hono, Wrangler, D1                               | Existing static asset hosting, example APIs, and a gateway to Python via a service binding                  |
| `apps/python`                 | Python 3.13, FastAPI, Pydantic                               | Hotkey normalization example that runs on CPython or as a Python Worker                                     |
| `packages/python/hotkey-core` | Python, uv workspace                                         | Shared Python business logic library                                                                        |

Each new product uses a separate full-stack Next.js application under `apps/<product_name>`. Shared authentication, HTTP handling, and entitlement queries live in `packages/identity-core`; payment SDKs and webhooks live only in `apps/identity`. The legacy `apps/worker` has its own static placeholder page and example APIs. Python is used as a separate service only when a capability actually requires it.

Renaming the repository does not change existing package names or runtime identifiers. References to `@hotkey-tools/*`, `hotkey-tools-core`, database names, and order identifiers still match the actual configuration; historical deployment records retain the resource names used at the time.

## Setup and daily development

After installing mise, run the following from the repository root:

```bash
mise trust
mise run setup
mise run env-check
mise run dev
```

The default URL is `http://localhost:3001`. The `dev` task applies Identity's local D1 migrations before starting the Next.js development server. OpenNext provides local emulation of Cloudflare bindings.

The `setup` task installs the toolchain, installs pnpm dependencies and uv workspace members from the lockfiles, creates the root `.env` and Identity's `.env.local` and `.dev.vars` only if they are missing, and applies local migrations for each application's database. Repeated runs do not overwrite existing environment files or reset databases. Configure Logto and Creem credentials as described in the [application guide](apps/identity/README.md); retain the original credentials for historical Stripe webhooks. Affected APIs return 503 when configuration is incomplete.

| Command                                  | Purpose                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `mise run dev` / `mise run dev-identity` | Start the default account and purchase application on port 3001                                  |
| `mise run smoke`                         | Check pages, D1, private APIs, and cross-site request rejection in the default application       |
| `mise run dev-examples`                  | Start the existing static web, gateway, and Python Worker examples                               |
| `mise run dev-web`                       | Run the Loom AI main site with hot reload on port 3000                                           |
| `mise run dev-worker`                    | Build the static web assets, migrate the example D1 database, and start the gateway on port 8787 |
| `mise run dev-python`                    | Run the Python Worker on port 8788                                                               |
| `mise run dev-python-local`              | Run CPython + Uvicorn on port 8000                                                               |
| `mise run smoke-examples`                | Check the existing gateway, D1, and Python integration                                           |

mise pins Node.js 24, pnpm 12.10.1, Python 3.13, uv 0.12.3, and Wrangler 4.151.2. `mise run setup` installs these tools. Use `mise exec -- <command>` for one-off commands without changing global tool versions. The root `.env` serves the workspace and legacy examples; Identity's server configuration belongs in its own environment files or Worker environment. Never expose secrets through `NEXT_PUBLIC_*`.

Use `mise identity <command>` for routine Identity operations. Run `mise identity help` for the full command list:

| Command                                                | Purpose                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `mise identity dev`                                    | Apply local D1 migrations, then start the Next.js development server               |
| `mise identity build`                                  | Build Next.js and generate OpenNext/Workers deployment artifacts                   |
| `mise identity preview`                                | Apply local D1 migrations, build, and preview in the Workers runtime               |
| `mise identity test` / `mise identity coverage`        | Run tests and coverage checks                                                      |
| `mise identity verify`                                 | Run type, lint, coverage, JWT runtime, and deployment packaging checks in sequence |
| `mise identity deploy-dry-run`                         | Build and check the deployment package without publishing remote resources         |
| `mise identity deploy`                                 | Validate configuration, build, and publish the Worker                              |
| `mise identity db-create` / `mise identity db-migrate` | Create a remote D1 database / apply remote migrations                              |
| `mise identity db-migrate-local`                       | Apply local D1 migrations                                                          |
| `mise identity login` / `mise identity status`         | Sign in to Cloudflare / check sign-in status                                       |
| `mise identity logs`                                   | Stream remote Worker logs                                                          |
| `mise identity wrangler <args...>`                     | Run the mise-managed Wrangler from the Identity directory                          |

These commands correspond to `mise run identity:<command>`. To inspect the steps a task will execute, use `mise run --dry-run identity:deploy`. This differs from `mise identity deploy-dry-run`, which actually builds and checks the package. The original `mise run dev-identity` and `identity-db-*` entry points remain as aliases.

OpenNext and local verification import Wrangler's Node API, and pywrangler invokes the project's Wrangler through npx. The required package dependencies therefore remain in place, pinned to the exact same version as mise. When upgrading Wrangler, update the tool configuration, packages, and lockfile together. See the [mise npm backend documentation](https://mise.jdx.dev/dev-tools/backends/npm).

## Verification

```bash
mise run verify
mise identity coverage
```

The `verify` task checks the uv lockfile and runs type checks, Oxlint/Ruff, formatting checks, Vitest/pytest, builds for each package, and deployment packaging checks for all Workers. Identity's coverage checks cover server code and HTTP APIs, with a 90% threshold for all four metrics.

The following are historical acceptance results for English as the default language, product wording, reuse of the navigation account state, the sign-in carousel, and menu icons. At that time, the full-repository `mise run verify` exited with code 0. A total of 454 tests passed: 263 in identity-core, 149 in identity, 32 in web, and 10 in i18n, plus 4 separate tests for the legacy Worker. Shared-session checks in a real local Workerd runtime passed 9/9; local HTTP checks and independent online HTTP checks each passed 67/67. The WWW version was `a39d3bf2-e75b-492c-9af7-fe3cb14ac9a0`, and the Identity version was `17aeae33-1ab4-450e-af1e-074e7a690576`. Reading back deployment state confirmed that each served 100% of its traffic. These versions and tests are not evidence for the production identity cutover.

An earlier domain configuration passed the full-repository `mise run verify` and 182 tests. Identity core coverage at that time was 98.57% statements, 98.06% branches, 100% functions, and 99.39% lines. The old workers.dev entry point was verified with a real GitHub sign-in, a USD 1.00 Sandbox payment that granted access, retained access after signing out and back in, and entitlement revocation after a full refund. Local Workers preview, a local D1 smoke check, and remote health checks also passed.

`login.loom-labs.ai` handles centralized sign-in and callbacks; `checkout.loom-labs.ai` provides accounts and purchases. `LOGTO_ENDPOINT` specifies Logto's hosted authentication service, and `auth.loom-labs.ai` is the development tenant's entry point. Products redirect to the sign-in page with `returnTo`. A valid session returns directly to the original product; otherwise, the user signs in before returning. Return URLs must point to trusted Loom products, preserve valid paths and queries, and contain no fragment. WWW and checkout access D1 sessions through the same random SID cookie (`Domain=.loom-labs.ai`) instead of performing separate OIDC sign-ins. Token state is stored only as ciphertext in D1, and both applications query D1 for the same user's valid entitlements in the current payment mode.

A previous authentication checkpoint deployed D1 sessions with a fixed 14-day lifetime and automatic refresh of short-lived tokens. The lifetime starts at the successful callback and is not extended by refresh; D1 revocation is authoritative for sign-out. At that time, 400 tests, full-repository verification, protocol checks in a real Workerd runtime, and 53 anonymous online checks passed. Real GitHub sign-in shared across three domains, direct return with a valid session, refresh through the official SDK, and shared sign-out were verified. Access rejection on all three domains after a controlled reduction of a test session's expiration time, followed by successful sign-in again, also passed; this did not involve waiting 14 days. This mechanism remains in use, and the old self-contained cookies are no longer accepted. See the [session lifecycle guide](docs/session-lifecycle.md).

The user created the Logto development and production tenants in advance. Earlier acceptance checks used only the development tenant; see the [production cutover record](docs/production-cutover.md) for migration progress. Previous payment, access retention after signing out and back in, and full-refund revocation checks remain historical evidence. At that time, a real GitHub sign-in returned with the complete URL `/workspace?source=login-polish&keep=a%2Bb`. Google sign-in also went through the official account picker and Logto callback to WWW, where it was recognized as the same existing identity. A read-only check of Logto user settings showed the existing GitHub and Google connections. That round of verification did not link or merge accounts or edit connections; accounts are not automatically merged by email.

`next build`, OpenNext build, Wrangler dry-run, local preview, real third-party integration testing, and remote deployment are separate levels of verification. Successful packaging or local tests do not establish that remote migrations, sign-in, payments, or Free plan capacity have been verified.

## Cloudflare deployment

Identity uses Workers + Static Assets + D1. A single Next.js/OpenNext Worker serves pages and APIs. The current dynamic pages do not require an R2 ISR cache, Durable Objects, containers, or a separate Node server. Use the Next.js Node.js runtime with `nodejs_compat`; do not set `output: "export"` or `runtime = "edge"`.

Configure a real account, database, and secrets before deploying:

```bash
mise identity login
mise identity status
mise identity db-create
# Set database_id in apps/identity/wrangler.jsonc to the value returned above
mise identity db-migrate
# Configure APP_URL, Logto, Creem Test, and Worker Secrets; see the application guide
mise identity deploy
```

Identity uses its own `apps/identity/migrations` and D1 database rather than reusing the legacy gateway database. The all-zero UUID is for local emulation only; remote migration and deployment commands reject this placeholder. Add new migrations for future schema changes instead of rewriting migrations that have already been applied.

The goal is to validate the application using Cloudflare's free resources, but the project does not automatically select or upgrade a plan or establish its available capacity. Verify Worker bundle size, CPU, request, and D1 quotas against the actual account and deployment results. See [Cloudflare Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

Remote deployment of the existing examples continues to use the legacy gateway database and a separate Python Worker:

```bash
mise run cloudflare-db-create
# Set the legacy gateway's database_id in apps/worker/wrangler.jsonc
mise run cloudflare-db-migrate
mise exec -- pnpm deploy:examples
```

This command deploys the Python Worker first, then builds the web assets and deploys the gateway Worker. The Python Worker is accessed through a service binding. The legacy gateway's `/api/hotkeys` and `/api/normalize` endpoints only demonstrate the technical integration; they do not provide Identity's user isolation or paid access checks.

## Loom AI main site

Both applications share next-intl support for English and Chinese through `packages/i18n`. English uses root paths by default, and Chinese uses `/zh`. Legacy `/en` page URLs preserve the query and redirect to the corresponding canonical English root path. The shared language menu lists “English” before “简体中文” (Simplified Chinese) and preserves the user's saved preference. Language and appearance preferences (light, dark, or system) use parent-domain cookies containing only preference values. The profile pages `/account` and `/zh/account` must not be indexed. APIs, sign-in callbacks, and payment endpoints have no locale prefix; authentication and entitlement rules remain unchanged. See the [internationalization guide](docs/internationalization.md) for configuration, message ownership, and SEO details.

The layout's `ProductAccessProvider` preserves the navigation account state across client-side routes. It reads the state once on the initial full page load and does not resynchronize on window focus, visibility changes, timers, or client-side navigation. Users can refresh the state manually; protected operations still check the server-side session and entitlements on every request. The navigation shows no status text such as “Syncing.” The avatar's outer frame is 28px, the image inside the border is 26px, the click target is 40px, and all four menu icons are 16px. The sign-in controls are centered. The carousel on the right plays automatically by default and uses only pagination dots as visible controls, while retaining keyboard-accessible pause/play controls and support for reduced motion. Local browser verification confirmed that moving from the vision page to the workspace adds no `/api/me` request, while a manual refresh adds one. Online verification also confirmed that client-side navigation does not reread the account state.

The [main site guide](apps/web/README.md) covers local configuration, shared sessions, and deployment. The [design rationale](docs/loom-product-design.md) records the loom-box vision, original logo, Linear-inspired references, and current capability limits.

The [Logto branding guide](docs/logto-branding.md) records the light and dark primary colors and Custom CSS saved and reloaded in the production Free tenant, along with the earlier development tenant results and rollback record. The native Company logo/Favicon have not been uploaded. The mark on the loading screen is CSS decoration only; it does not hide Powered by Logto or eliminate protocol redirects and upstream pages.

The [SEO and AI retrieval guide](docs/seo-geo.md) documents public-page metadata, structured data, sitemaps, and text entry points for AI retrieval, along with indexing restrictions and verification methods for private flows.

English pages use `/` for the product homepage, `/vision` for the vision, `/workspace` for the workspace, and `/pricing` for plans. Chinese uses the corresponding `/zh` paths. Navigation and sign-in/payment return URLs do not use hash fragments, and every page can be opened directly and refreshed.

```bash
mise run dev-web
mise run web:preview
mise run web:coverage
mise run web:deploy-dry-run
mise run web:deploy
```

The `loom-web` Worker serves the main site's www custom domain, and `loom-identity` provides centralized sign-in and purchases. They were renamed in place from `vite-react-template` and `hotkey-tools-identity`, respectively. Source code lives in `apps/web` and `apps/identity`. The old `hotkey-tools-identity` D1 database is retained, while production uses a separate database. See the [web deployment guide](apps/web/README.md) for the main site's Git Builds repository and build settings. In deployed environments, login sets a random session identifier on the parent domain; all Loom subdomains are within the same session trust boundary. D1 stores encrypted state and revocation markers. Sign-out revokes the session before deleting the shared cookie. Local development uses explicitly configured localhost URLs without the production parent domain. Cookies are not isolated by port, so both applications must use the same environment's session configuration and database. Before deploying the current payment code, apply `0001`–`0006` to the target database in order, then deploy Identity and WWW. Identity requires `CREEM_PRODUCT_ID`, `CREEM_PRO_PRODUCT_ID`, and payment secrets; both applications accept only `CREEM_MODE=test`. Clearing cookies, signing out, upstream invalidation, or a security anomaly may still require signing in again within the 14-day period.

The workspace currently provides manually curated, static work plans. It does not call models, create files, or execute external tools. The product interface uses terms such as work plans, accounts, and access permissions without claiming generation or execution capabilities it does not have. After a one-time USD 1.00 test payment through Creem Test mode on checkout, users can return to the workspace, manually refresh their entitlements, and open a plan. The purchase interface clearly labels the payment as a test with no real charge. Every protected operation rechecks the current user's valid orders that grant Pro access, and a full refund revokes only the entitlement from the corresponding order.

## Python workspace

The root `pyproject.toml` does not declare an application package. The uv workspace includes `apps/python` and `packages/python/*`, sharing the root `uv.lock` and `.venv`. The application references `hotkey-tools-core` through `workspace = true`. Each member declares its own runtime dependencies and build backend; development tools are centralized in root dependency groups.

```bash
mise run python-sync
mise run python-lock
mise exec -- uv tree --locked --depth 1
mise exec -- uv run --locked --all-packages pytest
```

`uv run --package` selects the dependency environment without changing the working directory. Wrangler's Python commands must run from the application directory, so prefer the corresponding mise tasks. The Python Worker's `pylock.toml` and `.venv-workers` target Pyodide/WASM and do not replace the root development lockfile. Before startup or deployment, deployment dependencies are synchronized and the shared library's source is bundled. See [uv workspaces](https://docs.astral.sh/uv/concepts/projects/workspaces/) and [Python Workers with FastAPI](https://developers.cloudflare.com/workers/languages/python/packages/fastapi/).
