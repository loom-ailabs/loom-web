# 项目工作约定

本文件是 loom-web 的仓库级工程规范。修改代码前先阅读；子目录存在更具体的 `AGENTS.md` 时，同时遵守。用户当次明确要求优先。

本规范参考 evals-grader 的 Evals Admin 前端技术栈、Feature-Sliced Design、Next.js 服务端边界、共享 UI 和验证约定，并按本仓库的 Cloudflare、Logto、Creem、历史 Stripe 与 Python workspace 实际情况调整。不要照搬该项目的业务模块、内部基础设施、端口或未安装技能路径。

## 当前目标与应用边界

- 在 `apps/identity` 实现账户与购买应用，支持 Logto Cloud 登录、Creem 单次购买、D1 权益记录和服务端鉴权。全站新购买统一使用 Creem Test mode：Loom Pro 为 USD 1.00，职业形象照包为 USD 9.99。Stripe SDK、原模式和 Webhook 仅用于历史订单查询、退款及撤权；历史有效 Pro 权益继续按来源订单核对。未经再次明确要求不得开启真实收款。
- 职业形象照包通过 Creem Test mode 单次购买：USD 9.99 含税、4 张成片的套餐权益与 1 次重做。使用独立订单、事件和套餐表，允许重复购买；每单独立发放和退款撤回。本阶段仅交付支付及套餐权益，照片上传、生成和下载尚未开放。Creem 必须显式选择测试 API 与测试密钥，拒绝正式环境对象；未经明确要求不得开启真实收款。
- Creem 当前只接受 `CREEM_MODE=test`；未配置时兼容默认 test，显式空串、空白、live 或其他值均拒绝。Identity 配置 `CREEM_PRODUCT_ID`（职业照）与 `CREEM_PRO_PRODUCT_ID`（Loom Pro），WWW 只读取模式及数据库权益，不持有支付密钥。发布两应用前须在共享目标 D1 顺序完成 `0001`—`0006` 迁移。
- 所有新增 Web 应用统一使用 **Next.js 全栈应用**：页面与业务 API 位于同一应用、同一服务和同一域名。每个产品在 `apps/<产品名>` 下拥有独立应用与 package。
- 使用 App Router 承载页面，使用 `src/app/api/**/route.ts` 承载 HTTP API；应用业务逻辑放在本应用的 `src/server`。不要为同一个 Web 产品再新增独立 Hono、Express 网关或另一套 BFF。
- Cloudflare 通过 OpenNext 将该 Next.js 应用部署为一个 Worker，同时提供页面、静态资源和 API。需要登录或动态 API 的应用不得设置 `output: "export"`。
- `apps/web` 是 `www.loom-labs.ai` 的 Loom AI 产品首页与工作区，使用 Next.js/OpenNext 提供页面与受保护 API。`apps/identity` 提供统一登录入口与购买页；子域通过 `.loom-labs.ai` 的随机会话标识 Cookie 访问同一份 D1 会话与权益，使用相同的会话加密密钥和 Logto 应用。共享服务端实现提取到 package，禁止应用互相导入。
- `apps/worker` 保留为旧网关示例，不承载正式首页或新的认证、支付逻辑。站点以实际交付能力使用正式产品文案，不在界面放置 Demo、示例或演示标签；当前工作计划按整理好的阅读与规划内容呈现，不宣称调用真实模型或代为执行任务。当前付款说明读取服务端 `CREEM_MODE`，只允许 test 并明确不会真实扣款；未来正式收款需另行接入及验收，不能仅切换文案。
- `apps/python` 与 `packages/python/*` 保持既有 uv workspace 边界。只有明确需要 Python 的能力才由独立 Python Worker 提供；用户身份、订单和权益判断仍由 Next.js 服务负责。
- 应用不能导入另一应用的实现。业务类型与接口定义先留在实际所有者中，多个活跃消费者确实需要共享时，再提取职责明确的 package。
- 仓库根目录只管理 workspace、工具链与任务，不承载应用代码，不声明根 Python package。

## 技术栈与工具

- Web：Next.js 16、React 19、TypeScript strict、Tailwind CSS 4。
- UI：本仓库 `packages/ui` 中的 shadcn/ui 风格基础组件、统一主题变量和 `cn()`；图标使用 `lucide-react`。
- 持久化：Cloudflare D1；认证协议与短期令牌刷新使用已发布的 Logto 官方 SDK，Next.js 只读写父域随机会话标识，SDK 状态加密保存在 D1；新购买使用 Creem 官方 SDK 与托管 Checkout，Stripe SDK 保留处理历史订单。
- 测试：Vitest；React 交互测试按需使用 Testing Library 与 happy-dom；数据库状态和事务测试使用实际 SQL 执行环境。
- 格式与静态检查使用 **Oxlint、Oxfmt**。不要添加 ESLint 或 Prettier 配置与依赖。
- mise 管理项目固定的 Node.js、pnpm、Python、uv 和 Wrangler CLI 版本。Identity 使用 `mise identity <命令>`（对应 `mise run identity:<命令>`）作为统一入口，临时命令使用 `mise exec -- ...`，不修改全局工具版本。
- Wrangler CLI 由 `.mise.toml` 的 `npm:wrangler` 固定版本；OpenNext 的 Node API、运行时验证及 pywrangler 的内部调用仍需要 package 中的 Wrangler 依赖，必须使用与 mise 相同的精确版本，不再分别声明版本范围。升级时同步修改 mise、相关 package 与 pnpm 锁文件。
- `package.json` 与 `turbo.json` 管理 package 任务图，`.mise.toml` 提供项目入口；初始化逻辑集中于 `scripts/setup.sh`，重复运行不得覆盖已有密钥或重置数据。
- 框架、SDK 与 OpenNext 的版本必须相互兼容；新增依赖直接声明在使用它的 package。不能把锁文件中的传递依赖视为可直接导入的依赖。
- 表单确实需要复杂校验时再加入 React Hook Form 与 Zod；只有跨组件共享的客户端状态才引入 Zustand。简单局部状态使用 React 本身。

## 前端目录与依赖方向

采用 Feature-Sliced Design，按实际需要创建 slice，不预建空目录：

```text
apps/identity/src/
  app/                    # Next.js page/layout/route 等框架适配
  _app/                   # 可选：FSD App 层，providers 与应用组合
  _pages/                 # 产品页面组合
  widgets/                # 可选：独立、完整的界面区块
  features/               # 登录、购买、查询订单等用户操作
  entities/               # 可选：用户、订单、权益等前端领域对象
  shared/                 # 浏览器安全的通用 API 客户端、配置与基础能力
  server/                 # 仅服务端代码：认证、支付、权益、数据库与 SDK 适配
```

- 前端依赖方向为 `App → Pages → Widgets → Features → Entities → Shared`。下层不得依赖上层，同层不同 slice 不直接导入内部实现。
- `src/app` 是 Next.js 适配层，不是 FSD App 层。为避免框架保留目录冲突，FSD Pages 使用 `_pages`，FSD App 使用 `_app`。
- 保留标准的 `page.tsx`、`layout.tsx`、`route.ts` 命名；确需请求拦截时使用 Next.js 16 的 `src/proxy.ts`。不得通过修改 `pageExtensions` 绕开架构边界。
- 页面导航使用 Next.js 路径路由，不使用 Hash 路由或 `#workspace` 等片段地址作为页面入口。登录与支付返回地址同样使用真实路径；新增页面必须能够直接访问和刷新。
- 页面只负责组合。支付流程、轮询、请求重试及其他业务状态放在相应 feature 的 model/hooks/API 中。
- slice 对外通过 `index.ts` 暴露公共接口；其他 slice 不越过公共入口访问内部文件。
- `shared` 只包含不带产品业务规则的通用能力。订单定价、身份归属、权益规则不能藏在通用 `utils`、`helpers` 或 `manager` 中。
- 客户端代码不得导入 `src/server`、Cloudflare bindings、数据库或支付/认证密钥。服务端模块使用 `server-only` 防止误入客户端构建。
- 浏览器安全的请求/响应类型与服务端实现分开；前端不能通过类型导入间接耦合服务端 SDK。

## UI 与交互约定

- 组件选择顺序：本仓库 `packages/ui` → 官方 shadcn/ui 合适组件 → 有明确必要性的产品自定义组件。
- 新增基础组件前先检查现有组件和 shadcn/ui 官方文档。通用 primitive 放在 `packages/ui` 并公开导出，产品组合留在所属应用。
- `packages/ui/src/styles/globals.css` 是共享主题变量的唯一来源；业务代码使用语义颜色、圆角与 Tailwind 默认 spacing/typography utilities。
- 不在产品组件中硬编码 hex/rgba 颜色、任意圆角、间距或字号；不另造重复 token 体系。
- 使用 Tailwind utilities 与 `cn()` 组合样式。不要新增 CSS Modules、styled-components、Emotion、组件局部样式或内联 style 对象。
- 点击控件使用语义化 `button`、`a[href]` 等，非禁用状态显示 pointer；同时提供键盘焦点、禁用、加载、空态和错误反馈。
- 页面需要适配移动端与桌面端。保留可读的排版层级、合理对比度、表单标签与必要的 `aria` 属性。
- 平台首期提供简体中文与英文，统一使用 `packages/i18n` 的 next-intl App Router 接线和消息文件；默认英文沿用根路径，中文使用 `/zh` 路径，旧 `/en` 页面地址保留查询并跳转至对应英文根路径。禁止以 Hash 或仅客户端替换实现多语言。API、认证回调和 Webhook 保持 `/api` 原路径；`Link`、语言切换和外部产品链接应保留用户选择的语言与合法返回地址。新增用户可见文案同时补齐两种语言，不以翻译后的文案决定业务分支。
- 中文界面使用自然中文，英文界面使用自然英文；SDK、协议、代码标识符和必要产品名保持原文。共享语言菜单按 English、简体中文排序；该顺序不覆盖用户已经保存的语言偏好。工程配置和实现细节放在开发文档，不挤入普通产品流程。
- 外观使用共享 `AppearanceProvider`，支持浅色、深色与跟随系统；主题与语言偏好只写入经过枚举校验的 `LOOM_THEME`、`LOOM_LOCALE` 父域 Cookie，不承载身份或权益。主题、语言切换不得改变认证 Cookie 或放宽退出的来源校验。
- 账户菜单使用可访问的 Avatar/Dropdown Menu，头像缺失或失败时提供文字回退；个人资料只来自当前受校验身份，不根据 URL 参数或邮箱推断用户。轮播与动画必须可手动控制，并遵循减少动态效果设置。
- 首页账号状态在每次完整页面加载时读取一次，由共享客户端 Provider 在页面路由间保留；不因窗口聚焦、可见性变化、定时器或路由切换自动同步。用户刷新页面或点击刷新操作时才更新账号显示；初始读取不在导航显示同步文案，账号入口保留稳定空间。该显示状态不能用于服务端鉴权，受保护请求仍须验证当前会话和权益。
- 公开页面同时面向用户、搜索引擎和 AI 检索：正文由服务端输出，提供准确的标题、描述、规范网址、分享元数据、站点地图和可抓取的内部链接。结构化数据必须与可见内容一致，不虚构评价、客户、真实模型能力或将 Sandbox 价格当作正式报价。
- 公开产品说明可提供 `llms.txt` 等便于 AI 读取的文本入口，并与页面内容同步；不承诺这些文件能提高搜索排名。登录、支付、私人接口和用户数据禁止索引，实际访问控制始终由服务端认证与鉴权负责，不能由 robots.txt 代替。
- 各语言公开页输出对应语言的 HTML、标题、描述、canonical 与 hreflang；站点地图包含两种语言的公开页面，个人信息等私有页面禁止索引且不进入站点地图。无语言偏好时默认英文，不依赖浏览器 Accept-Language 为搜索引擎生成不稳定内容；用户已经保存的中文偏好继续有效。

## Next.js 服务端与 HTTP API

- Route Handler 只做输入解析、调用服务、映射响应；跨步骤业务流程放在 `src/server` 对应模块。
- 数据库、外部 SDK 与 Cloudflare bindings 只能由服务端访问；在服务端明确处理配置缺失、外部超时和失败恢复。
- OpenNext 下使用 Next.js Node.js runtime 与 `nodejs_compat`，不设置 `runtime = "edge"`。通过官方适配获取 D1 binding。
- 不使用进程内 Map、全局变量或本机文件作为会话、订单或权益的权威存储。
- 环境变量、HTTP 输入和外部数据在边界处解析校验；有明确运行时校验需求时使用维护良好的 schema 库，避免同一数据在各层重复解析。
- URL 路径段、路径参数与 query 使用 `snake_case`，JSON 字段使用 `camelCase`。
- 自有 JSON API 使用统一响应格式；登录跳转与供应商明确规定的协议响应按其协议处理。

成功响应：

```json
{ "code": 0, "msg": "success", "data": {} }
```

失败响应：

```json
{ "code": 10001, "msg": "Safe readable reason", "error": { "type": "stable_error_type" } }
```

- 成功不包含 `error`，失败不包含 `data`；HTTP status 仍正确区分成功、客户端和服务端错误。
- 业务码为应用内唯一、稳定的正整数，集中登记在 `src/server/http-codes.ts`；客户端依据 `code` 判断，不能依据 `msg` 文案分支。
- 通用浏览器请求客户端放在 `src/shared/api`，统一处理响应格式、HTTP 错误和安全错误展示。
- 用户资料、订单、会话、权益与付费 API 使用 `private, no-store`，不能进入共享缓存。
- 错误返回不得泄漏凭据、SQL 或外部供应商原始响应。服务端保留经过必要脱敏的 stack/cause 诊断，不记录会话 Cookie、令牌、支付原始请求体或敏感用户资料。

## 登录、支付与鉴权规则

- Logto Cloud Free + Google/GitHub 登录，Creem Test 单次购买，D1 管理产品权益。开发租户与旧 Stripe Sandbox 保留；正式身份使用既有生产租户、专用会话密钥与独立生产 D1，不复制测试会话、订单或权益，不按邮箱自动迁移身份。
- Creem 的 Loom Pro 与职业照包按固定 SKU 分别发权。职业照套餐不能授予 Pro；Pro 退款不能撤回其他来源订单或职业照套餐。Creem 的模式、密钥、固定含税金额、商品、数量、完整 metadata 与当前交易状态均由服务端核对。
- 下述 Stripe 专属规则继续约束历史订单及退款处理，不能据此为新购买创建 Stripe Checkout；当前新购买由 Creem 处理。
- 使用已发布的 Logto 官方 SDK，回调验证 state、PKCE、issuer、audience 和签名；不能把 JWT decode 当作认证校验，不修改 SDK 源码以实现 Cookie 设置。
- `login.loom-labs.ai` 统一发起登录并处理回调。有效会话直接返回原产品地址；会话绝对到期、已撤销或无法安全刷新时重新登录。返回地址必须校验 HTTPS、精确域名后缀、端口与用户信息，保留合法路径与查询；拒绝外域、含片段的地址及会引发登录循环的目标。
- 正式会话 Cookie 为 `__Secure-loom_sid_<appId>`，登录流程 Cookie 为 `__Secure-loom_flow_<appId>`；两者仅保存随机标识，使用 `Domain=.loom-labs.ai; Path=/; Secure; HttpOnly; SameSite=Lax`，写入与删除必须匹配 Domain/Path。父域下的所有子域均属于会话信任范围；新增产品不得托管不受信任的子域内容或采用另一套会话密钥。本地不设置正式父域，且 Cookie 名不带 `__Secure-` 前缀。
- `auth_sessions` 是会话有效性与撤销的权威存储：只保存标识的 SHA-256 哈希以及经 HKDF 派生密钥、AES-GCM 加密的 SDK 状态，不把令牌写入浏览器 Cookie。应用会话从成功回调起固定 14 天，流程状态固定 10 分钟；刷新不得延长绝对截止时间，不能只依赖浏览器 `Max-Age`。
- 身份令牌或 access token 剩余有效期不超过 60 秒，或 access token 缓存缺失、异常时，使用官方 SDK 公开方法刷新并重新读取、校验身份；RSC 读取只需 Cookie，不依赖重新写入 Cookie。跨 Worker 刷新通过 D1 `first-primary`、版本比较更新及 30 秒租约串行化；请求与协议总耗时有界，锁过期不接管旧 refresh token，结果不确定时撤销会话，禁止重试可能已轮换的旧状态。
- 统一退出先在 D1 撤销当前共享会话及关联登录流程，再由 SDK 尽力撤销上游 refresh token；适配层在 finally 中清除 Cookie，最终响应以 303 执行 Logto 登出。并发刷新或已知关联流程的迟到回调不能恢复已撤销会话。该范围是当前 Cookie 标识的共享会话与流程，不等于退出用户的所有设备或撤销无关联的独立新授权；清除 Cookie、主动退出、上游失效或安全异常都可能要求在 14 天前重新登录。
- 用户归属来自受校验会话中的稳定身份。保留 `(issuer, subject)` 映射，不以邮箱匹配订单或自动合并账号。
- 不把 ID Token 当作通用业务 API access token；不依赖 Logto 付费 RBAC/API resources 才能实现首版付费鉴权。
- 浏览器写操作检查配置的准确 Origin；Creem 与历史 Stripe Webhook 按原文与签名认证，不能要求用户登录或套用浏览器 Origin 校验。
- 商品、金额、币种与数量由服务端确定。Creem 先持久化本地订单，再通过数据库原子 claim 创建 Checkout；不能把供应商的 `request_id` 跟踪字段当成已经验证的幂等保证，创建结果不确定时拒绝盲目重建。历史 Stripe Checkout 重试继续使用原始请求字段和稳定幂等键。
- 使用经枚举校验的 `STRIPE_MODE=test|live` 明确选择支付环境，不从请求参数或密钥自动开启 Live。为兼容原开发配置，只有未设置模式时才默认 test；空字符串、空白或非法值必须拒绝。Key、Price、Session、PaymentIntent、事件与来源订单的模式必须一致。未完成商户激活、Live Price/Webhook 配置和验收前，不将现网站点配置为 live。
- 订单与事件保存 `stripe_mode`，迁移将历史数据明确标为 test；权益查询同时核对来源订单、已付款状态与当前模式，测试购买不能解锁正式权益。当前 Logto 生产租户使用新独立 D1，但支付模式仍是 test；旧开发库保留。未来 Stripe Live 必须使用独立于测试支付的数据库，模式字段不能代替数据库隔离。
- 新建 Stripe 对象 metadata 明确记录模式。只有历史 `checkout_payload_version=1`、配置与订单均为 test 时允许旧 metadata 缺少模式字段，其他归属字段仍须一致；新订单显式版本 2，test/live 都必须带匹配模式。历史版本 1 的 Checkout 重试必须保持原始请求字段与幂等键，不能补充 currency 或 metadata 后复用旧键；live 拒绝版本 1，所有模式都拒绝未知版本。回滚不得丢弃已发生的正式订单或让仍需处理的 Live Webhook 切回测试数据库。
- 只有服务端核实支付成功后才发放权益，成功页参数不能授予权限。
- Webhook 必须原文验签、事件去重、容忍重复及乱序；事件处理标记、订单更新与权益变更原子提交。处理失败必须可重试。
- 权益按来源订单独立管理。确认成功全额退款后撤回对应订单权益，迟到成功事件不能恢复；其他有效订单仍可支撑使用权限。
- 每次受保护操作检查当前权益。只隐藏按钮、长期缓存 `isPaid` 或把付费状态写入长期 Cookie/JWT，均不能代替服务端鉴权。
- D1 是会话、订单与权益的权威存储，KV 只承载可容忍传播延迟的缓存或配置。
- 测试与生产密钥、Webhook 密钥、回调域名和数据库分开配置；密钥不进入 `NEXT_PUBLIC_*`、源码、生成页面或提交记录。真实付款与退款验收由用户本人提交；不得为了验证正式配置自行扣款或退款。商户身份、结算资料与服务协议由用户本人完成。

## 代码质量与验证

- 修改前检查当前代码、manifest、锁文件和现有约定；生态行为不明确时先查对应版本的官方文档与维护中的实现。
- 按业务职责命名文件与模块，保持一个行为的单一实现；不保留无必要的 V1/V2、临时兼容路径或重复业务规则。
- 单文件尽量控制在 400 行内，超过 600 行前按职责拆分；不要靠压缩排版满足行数要求。
- 数据库变更新增 migration，不修改已经应用的迁移；迁移、回滚和恢复路径必须可说明。
- 测试覆盖可观察行为、边界条件、状态转换和故障恢复，不写只重复实现的镜像测试。
- 认证、支付、权益及 HTTP 边界的适用测试必须覆盖正常与拒绝路径；核心业务覆盖率目标为 statements、branches、functions、lines 均至少 90%。不通过排除未测业务模块或忽略失败分支达标。
- 必测行为包括会话 14 天绝对边界、短期令牌自动刷新、并发刷新与退出竞争、失效或超时刷新后拒绝访问、迟到回调、已撤销 SID 重放，以及未登录/未购买、跨用户订单访问、来源检查、伪造回调、重复及乱序事件、事务失败重试、全额退款和多订单权益隔离。
- HTTP、SQL 和 UI 交互采用适合该边界的单元/集成测试；样式与静态配置不需要为覆盖率编造无效测试。
- 先运行受影响 package 的类型、lint、测试与构建，再根据共享模块和任务入口的变化扩展验证。
- 较大变更交付前运行 `mise run verify`；新应用还需要实际 HTTP smoke 与 OpenNext/Workers 本地预览验证。
- `next build`、OpenNext build、Wrangler dry-run、本地预览、真实第三方联调和云端部署是不同证据。没有配置真实 Logto/Creem 账号、远端 D1 与域名时，明确报告尚未验证的部分；历史 Stripe 验收与当前新购买链路分别记录。
- 本项目由用户单人开发维护。后续功能开发默认直接在 `main` 分支进行；完成适用检查后，使用 Conventional Commits 提交并推送到 `origin/main`。仅在用户当次明确要求时新建或使用其他开发分支；用户要求先评审、仅本地修改或暂不提交/推送时，遵循当次要求。
- 不覆盖或提交与当前任务无关的其他改动。
- 不提交 `.next`、`.open-next`、`.wrangler`、`dist`、coverage、本地环境文件、令牌和密钥。

## 命令入口

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

Cloudflare 首次部署需要真实 D1 ID、远端迁移与 Secret 配置。使用 `mise identity db-create`、`mise identity db-migrate` 和 `mise identity deploy`；不能将占位 UUID 或未配置凭据的 dry-run 描述为生产可用。`mise identity build` 生成 Next.js 与 OpenNext/Workers 产物；`mise identity deploy-dry-run` 构建并检查打包，实际发布只由 `deploy` 执行。
