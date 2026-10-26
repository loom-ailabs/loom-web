# loom-web

[loom-web](https://github.com/loom-ailabs/loom-web) 包含 Loom AI 产品首页与工作区（`apps/web`）以及登录与购买应用（`apps/identity`）。两者分别使用 Next.js/OpenNext 提供页面与同源 API，共享 `.loom-labs.ai` 下的登录会话、Logto 身份与 Cloudflare D1 权益。默认 `mise run dev` 仍启动账户与购买应用；主站使用 `mise run dev-web`。

从初始化、身份源配置到支付联调的步骤见 [Identity 应用说明](apps/identity/README.md)。仓库工作约定见 [AGENTS.md](AGENTS.md)。

两 Worker 使用 Logto 生产 Free 身份与独立 D1。全站新购买已统一 Creem Test mode：Loom Pro 为 USD 1.00，职业形象照包为 USD 9.99；均不会真实扣款。Stripe 保留历史订单查询和退款处理。当前配置与验收见 [Creem 接入说明](docs/creem-test-integration.md)，原身份切换记录见[生产切换说明](docs/production-cutover.md)。

职业形象照包是独立的 Creem Test 商品：USD 9.99 单次购买，按订单记录 4 张成片及 1 次重做的套餐权益，支持重复购买与全额退款撤权。入口为账户应用的 `/headshots`、`/zh/headshots`；照片上传、生成和下载尚未开放。职业照套餐不授予 Loom Pro，两种商品的来源订单和退款撤权分别处理。配置与分阶段验收见 [Creem 测试支付接入](docs/creem-test-integration.md)。

## 应用与共享包

| 目录                          | 技术栈                                                       | 职责                                                      |
| ----------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `apps/identity`               | Next.js 16、React 19、Tailwind CSS 4、Logto、Creem、OpenNext | 默认产品：账户、购买、订单与付费鉴权；页面和 API 同源     |
| `packages/ui`                 | shadcn/ui 风格组件、Tailwind 主题变量、`cn()`                | 共享 Button、Card、Badge、Alert 等基础组件                |
| `apps/web`                    | Next.js 16、React 19、TypeScript                             | Loom AI 主站、工作区与受保护功能 API                      |
| `apps/worker`                 | TypeScript、Hono、Wrangler、D1                               | 既有静态资源托管、示例 API 与 Python service binding 网关 |
| `apps/python`                 | Python 3.13、FastAPI、Pydantic                               | 快捷键规范化示例，可运行于 CPython 或 Python Worker       |
| `packages/python/hotkey-core` | Python、uv workspace                                         | Python 共享业务库                                         |

新产品使用 `apps/<产品名>` 下的独立 Next.js 全栈应用。共享认证、HTTP 与权益查询位于 `packages/identity-core`；支付 SDK 与 Webhook 只在 `apps/identity`。旧 `apps/worker` 使用自己的静态占位页与示例 API。Python 仅在实际需要时作为独立能力服务使用。

仓库更名不改变现有包名和运行标识：文档中的 `@hotkey-tools/*`、`hotkey-tools-core`、数据库名及订单业务标识仍与实际配置一致；历史部署记录保留当时的资源名称。

## 初始化与日常开发

安装 mise 后，在仓库根目录执行：

```bash
mise trust
mise run setup
mise run env-check
mise run dev
```

默认访问 `http://localhost:3001`。`dev` 会先应用 Identity 本地 D1 migrations，再启动 Next.js 开发服务器；Cloudflare bindings 由 OpenNext 提供本地模拟。

`setup` 安装工具链、按锁文件安装 pnpm 依赖及 uv workspace 成员，在文件缺失时创建根 `.env`、Identity 的 `.env.local` 与 `.dev.vars`，并应用各应用数据库的本地迁移。重复执行不会覆盖已有环境文件或重置数据库。Logto 和 Creem 凭据按 [应用说明](apps/identity/README.md) 配置；历史 Stripe Webhook 保留原凭据。配置不完整时相关 API 返回 503。

| 命令                                     | 用途                                           |
| ---------------------------------------- | ---------------------------------------------- |
| `mise run dev` / `mise run dev-identity` | 启动默认账户与购买应用，端口 3001              |
| `mise run smoke`                         | 对默认应用做页面、D1、私有 API 与跨站拒绝检查  |
| `mise run dev-examples`                  | 启动既有静态 Web、网关和 Python Worker 示例    |
| `mise run dev-web`                       | Loom AI 主站热更新，端口 3000                  |
| `mise run dev-worker`                    | 构建静态 Web、迁移示例 D1、启动网关，端口 8787 |
| `mise run dev-python`                    | Python Worker，端口 8788                       |
| `mise run dev-python-local`              | CPython + Uvicorn，端口 8000                   |
| `mise run smoke-examples`                | 检查既有网关、D1 与 Python 链路                |

mise 固定 Node.js 24、pnpm 12.10.1、Python 3.13、uv 0.12.3 和 Wrangler 4.151.2。`mise run setup` 会安装这些工具。使用 `mise exec -- <command>` 执行临时命令，不修改全局工具版本。根 `.env` 服务于 workspace 和旧示例；Identity 的服务端配置放在应用自己的环境文件或 Worker 环境中。任何密钥都不能使用 `NEXT_PUBLIC_*`。

Identity 的日常操作统一使用 `mise identity <命令>`；运行 `mise identity help` 查看全部命令：

| 命令                                                   | 用途                                             |
| ------------------------------------------------------ | ------------------------------------------------ |
| `mise identity dev`                                    | 启动 Next.js 开发服务，先迁移本地 D1             |
| `mise identity build`                                  | 构建 Next.js，并生成 OpenNext/Workers 部署产物   |
| `mise identity preview`                                | 迁移本地 D1、构建并在 Workers runtime 预览       |
| `mise identity test` / `mise identity coverage`        | 测试与覆盖率检查                                 |
| `mise identity verify`                                 | 依次检查类型、lint、覆盖率、JWT 运行时和部署打包 |
| `mise identity deploy-dry-run`                         | 构建并检查打包，不发布远端资源                   |
| `mise identity deploy`                                 | 检查配置、构建并发布 Worker                      |
| `mise identity db-create` / `mise identity db-migrate` | 创建远端 D1 / 应用远端迁移                       |
| `mise identity db-migrate-local`                       | 应用本地 D1 迁移                                 |
| `mise identity login` / `mise identity status`         | Cloudflare 登录 / 登录状态                       |
| `mise identity logs`                                   | 订阅远端 Worker 日志                             |
| `mise identity wrangler <参数...>`                     | 在 Identity 目录使用 mise 管理的 Wrangler        |

这些入口对应 `mise run identity:<命令>`。检查命令将执行哪些步骤，可用 `mise run --dry-run identity:deploy`；它与实际构建打包的 `mise identity deploy-dry-run` 不同。原有 `mise run dev-identity`、`identity-db-*` 入口作为别名保留。

OpenNext 和本地验证需要导入 Wrangler 的 Node API，pywrangler 也会通过 npx 调用项目中的 Wrangler，因此 package 中仍保留必要依赖，统一精确固定为 mise 的相同版本；升级 Wrangler 时需同步修改工具配置、package 和锁文件。[mise npm 工具说明](https://mise.jdx.dev/dev-tools/backends/npm)

## 验证

```bash
mise run verify
mise identity coverage
```

`verify` 检查 uv 锁文件，执行类型检查、Oxlint/Ruff、格式检查、Vitest/pytest、各 package 构建，以及全部 Worker 的部署打包检查。Identity 的覆盖率检查范围为服务端和 HTTP API，四项阈值均为 90%。

以下是此前默认英文、产品措辞、导航账号状态复用、登录轮播与菜单图标的历史验收。全仓 `mise run verify` 当时返回 0；identity-core 263、identity 149、web 32、i18n 10，共 454 项测试通过，旧 Worker 的 4 项另计。本地真实 Workerd 共享会话 9/9、本地 HTTP 67/67 和线上独立 HTTP 67/67 通过。当时 WWW 版本为 `a39d3bf2-e75b-492c-9af7-fe3cb14ac9a0`，identity 为 `17aeae33-1ab4-450e-af1e-074e7a690576`，部署读回确认两者均承接 100% 流量；这些版本与测试不作为本次生产身份切换的证据。

早期域名方案曾通过全仓 `mise run verify` 和 182 项测试；当时 Identity 核心覆盖率为 statements 98.57%、branches 98.06%、functions 100%、lines 99.39%。旧 workers.dev 入口已完成真实 GitHub 登录、USD 1.00 Sandbox 付款开通、退出重登后持权及全额退款撤权；Workers 本地预览、本地 D1 smoke 和远端健康检查也已通过。

页面域名分工为 `login.loom-labs.ai` 统一登录与回调、`checkout.loom-labs.ai` 账户与购买；Logto 托管认证由 `LOGTO_ENDPOINT` 指定，`auth.loom-labs.ai` 是开发租户入口。产品携带 `returnTo` 跳转登录页；会话有效时直接返回原产品，否则完成登录后返回。返回地址只接受受信任的 Loom 产品地址并保留路径与查询，拒绝含片段的地址。www 与 checkout 通过同一随机 SID Cookie（`Domain=.loom-labs.ai`）访问 D1 会话，不再分别进行 OIDC 登录；令牌状态只以密文保存在 D1，两者从 D1 查询同一用户在当前支付模式下的有效权益。

此前认证 checkpoint 已部署固定 14 天 D1 会话与短期令牌自动刷新：期限从成功回调起计算，刷新不延长期限；退出以 D1 撤销为准。当时 400 项测试、全仓验证、真实 Workerd 协议检查及 53 项线上匿名检查通过；真实 GitHub 三域共享登录、有效会话直接返回、官方 SDK 刷新与共享退出已验证。受控缩短测试会话截止时间后的三域拒绝，以及重新登录均已通过；这不是实际等待 14 天。该机制继续沿用，旧自包含 Cookie 不再接受；详见[会话生命周期](docs/session-lifecycle.md)。

Logto 开发/生产租户由用户预先创建；此前验收只使用开发租户，生产切换进度见[统一记录](docs/production-cutover.md)。既有付款开通、退出重登持权及全额退款撤权保留为历史。当时真实 GitHub 登录完整返回 `/workspace?source=login-polish&keep=a%2Bb`；Google 也已从官方账号选择、Logto 回调进入 WWW，并识别为此前同一身份。Logto 用户设置的只读检查显示既有 GitHub 与 Google 连接，该轮未执行关联、合并或连接编辑，也不按邮箱自动合并账号。

`next build`、OpenNext build、Wrangler dry-run、本地预览、真实第三方联调与远端部署是不同的验证层级。打包或本地测试通过，不代表已完成远端迁移、登录、付款或免费套餐容量验证。

## Cloudflare 部署

Identity 使用 Workers + Static Assets + D1。页面与 API 由一个 Next.js/OpenNext Worker 提供；当前动态页面不需要 R2 ISR 缓存，也不依赖 Durable Objects、容器或独立 Node 服务器。应使用 Next.js 的 Node.js runtime 和 `nodejs_compat`，不设置 `output: "export"` 或 `runtime = "edge"`。

先配置真实账号、数据库和密钥，再部署：

```bash
mise identity login
mise identity status
mise identity db-create
# 将输出的 database_id 填入 apps/identity/wrangler.jsonc
mise identity db-migrate
# 配置 APP_URL、Logto、Creem Test 和 Worker Secrets，见应用说明
mise identity deploy
```

Identity 使用自己的 `apps/identity/migrations` 与 D1 数据库，不复用旧网关的数据库。全零 UUID 只供本地模拟；远端迁移和部署入口会拒绝该占位值。后续结构变更新增 migration，不改写已应用的迁移。

目标以 Cloudflare 免费资源验证，但项目不会自动选择、升级或证明某个套餐的可用额度；Worker 包大小、CPU、请求和 D1 配额需以实际账户及部署结果核实。参考 [Cloudflare Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)、[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)和 [D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)。

既有示例的远端部署继续使用旧网关数据库与独立 Python Worker：

```bash
mise run cloudflare-db-create
# 将旧网关的 database_id 填入 apps/worker/wrangler.jsonc
mise run cloudflare-db-migrate
mise exec -- pnpm deploy:examples
```

该入口按 Python Worker → Web 构建/网关 Worker 的顺序执行；Python Worker 通过 service binding 提供服务。旧网关 `/api/hotkeys` 与 `/api/normalize` 仅用于技术链路演示，没有 Identity 的用户隔离和付费校验。

## Loom AI 主站

两应用通过 `packages/i18n` 共享 next-intl 中英文能力：英文默认使用根路径，中文使用 `/zh`；旧 `/en` 页面地址保留 query 并规范跳转到对应英文根路径。共享语言菜单按 English、简体中文排序，保留用户已保存的偏好。语言与浅色、深色、跟随系统外观使用仅含偏好值的父域 Cookie。个人信息页 `/account`、`/zh/account` 禁止索引；API、登录回调和支付端点不加语言前缀，认证与权益规则保持不变。配置、消息分工和 SEO 说明见[国际化说明](docs/internationalization.md)。

导航账号状态由布局中的 `ProductAccessProvider` 在客户端路由间保留；首次完整加载读取一次，不在窗口聚焦、页面可见性变化、定时器或客户端路由切换时重新同步。用户可手动刷新状态，受保护操作仍逐次检查服务端会话和权益。导航不显示“Syncing”等同步文字；头像外框为 28px（边框内图片 26px），点击范围为 40px，四项菜单图标均为 16px。登录操作区居中，右侧轮播默认自动播放，可视控制只保留分页点，并保留键盘可达的暂停/播放与减少动态效果支持。本地浏览器验证从愿景进入工作区不新增 `/api/me` 请求，手动刷新新增一次；线上也确认客户端导航不重复读取账号。

[主站说明](apps/web/README.md)覆盖本地配置、共享会话和部署；[设计依据](docs/loom-product-design.md)记录 loom-box 愿景、原版 Logo、Linear 风格参考及当前能力边界。

[Logto 品牌配置](docs/logto-branding.md)记录生产 Free 租户已保存并重载的浅深主色和 Custom CSS，以及此前开发租户的效果与回滚记录。原生 Company logo/Favicon 未上传；加载画面的标识仅为 CSS 装饰，不隐藏 Powered by Logto，也不能消除协议重定向与上游页面。

[SEO 与 AI 检索说明](docs/seo-geo.md)记录公开页面的元数据、结构化数据、站点地图和 AI 文本入口，以及私人流程的索引限制与验证方式。

英文页面为 `/` 产品首页、`/vision` 愿景、`/workspace` 工作区、`/pricing` 方案；中文使用对应 `/zh` 路径。导航与登录、支付返回均不使用 Hash 地址，每个页面都可直接打开和刷新。

```bash
mise run dev-web
mise run web:preview
mise run web:coverage
mise run web:deploy-dry-run
mise run web:deploy
```

主站由 `loom-web` Worker 承载 www 自定义域，统一登录与购买由 `loom-identity` Worker 提供；两者分别由原 `vite-react-template`、`hotkey-tools-identity` 原地更名。源码位于 `apps/web` 与 `apps/identity`，旧 D1 `hotkey-tools-identity` 保留，生产目标使用独立数据库。主站 Git Builds 的仓库与构建设置见 [Web 部署说明](apps/web/README.md)。部署环境由 login 写入父域随机会话标识，所有 Loom 子域都属于同一会话信任范围；D1 保存加密状态和撤销标记，退出先撤销再删除共享 Cookie。本地使用明确配置的 localhost 地址，不设置正式父域；Cookie 不按端口隔离，两应用需使用同一环境的会话配置和数据库。发布当前支付代码前目标库须顺序完成 `0001`—`0006`，再发布 Identity 与 WWW；Identity 配置 `CREEM_PRODUCT_ID`、`CREEM_PRO_PRODUCT_ID` 及支付密钥，两应用均仅接受 `CREEM_MODE=test`。14 天内清除 Cookie、主动退出、上游失效或安全异常仍可能要求重登。

工作区当前提供人工整理的静态工作计划，不调用模型、创建文件或执行外部工具。产品界面使用工作计划、账号和访问权限等正式措辞，不以界面文案虚构生成或执行能力。用户到 checkout 通过 Creem Test mode 进行 USD 1.00 单次测试付款后，可返回工作区手动刷新权益并打开计划；购买位置清楚标注测试支付、不真实扣款。每次受保护操作均重新查询本用户的有效 Pro 来源订单，全额退款只撤回对应订单权限。

## Python workspace

根 `pyproject.toml` 不声明应用 package。uv workspace 包含 `apps/python` 与 `packages/python/*`，共用根 `uv.lock` 和 `.venv`；应用通过 `workspace = true` 引用 `hotkey-tools-core`。成员自行声明运行依赖和构建后端，开发工具集中在根依赖组。

```bash
mise run python-sync
mise run python-lock
mise exec -- uv tree --locked --depth 1
mise exec -- uv run --locked --all-packages pytest
```

`uv run --package` 选择依赖环境，不改变工作目录。Wrangler 的 Python 命令须在应用目录执行，因此优先使用对应 mise 入口。Python Worker 的 `pylock.toml`、`.venv-workers` 服务于 Pyodide/WASM，不替代根开发锁；启动或部署前会同步发布依赖并打包共享库源码。参考 [uv workspace](https://docs.astral.sh/uv/concepts/projects/workspaces/)和 [Python Workers FastAPI](https://developers.cloudflare.com/workers/languages/python/packages/fastapi/)。
