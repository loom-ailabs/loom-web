# 生产身份切换与支付模式

2026-10-26 补充：全站新购买已统一使用 Creem Test mode，Loom Pro 与职业照包分别计权；当前对象和实测见 [Creem 接入说明](creem-test-integration.md)。本文以下记录原 Logto/Stripe 阶段的切换对象与历史验收，不能据此判断当前新购买仍走 Stripe。

## 当前状态与验收：已发布，双登录已确认

两 Worker 已实际切换至 Logto 生产 Free 租户 `5z8hdi` 和独立生产 D1，并回读确认各承接 100% 流量。Stripe 继续使用原 Sandbox，`STRIPE_MODE=test`，Live 未开启。USD 1.00 单次购买已作为未来正式价格写入代码校验，但不代表已能收取真实款项。生产身份与测试支付是本次实际组合，不能把两者混称为 Live。

| 验收项             | 已发生事实与边界                                                                                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 代码               | [20b8b40c3b466f4b4abf502482d7b15f2d460539](https://github.com/loom-ailabs/loom-web/commit/20b8b40c3b466f4b4abf502482d7b15f2d460539) 已推送至 `feat/production-cutover`                                                                                                                  |
| Worker 发布        | Identity `66a7533d-124c-4951-b328-aad2a01c8bdb`；WWW `84ef3b06-40f1-4969-9ff0-506dcbc528e2`；CLI 回读均为 100%                                                                                                                                                                          |
| Git Builds         | Cloudflare WWW 生产分支已保存为 `feat/production-cutover`，其余构建参数不变                                                                                                                                                                                                             |
| 全仓检查           | `verify-release` 返回 0；core 295、identity 237、web 69、i18n 14，共 615 项；旧 Worker 4 项另计                                                                                                                                                                                         |
| 覆盖率             | Identity statements/branches/functions/lines 为 99.58%/98.94%/100%/100%；core 为 98.27%/95.85%/100%/98.82%                                                                                                                                                                              |
| 本地运行时         | 新 Worker preview 8 项、共享会话 9 组通过；不替代真实第三方授权                                                                                                                                                                                                                         |
| 线上匿名 smoke     | WWW 26 项通过，Identity smoke 通过；法务四页 200、canonical/lang 与 sitemap 12 URL 检查共 5 项通过；不代替真实登录和付款                                                                                                                                                                |
| 生产租户真实登录   | GitHub、Google 均已完成生产身份源授权和 OIDC 回调；WWW/login/checkout 的 `/api/me` 返回同一非空 `user.id`，Google 与 GitHub 当前进入同一账号                                                                                                                                            |
| 共享会话           | 实际 SID 为 `Domain=.loom-labs.ai; Path=/; Secure; HttpOnly; SameSite=Lax`，D1 `expires_at-created_at` 恰为 14 天；有效会话从 login 精确保留 path/query 返回                                                                                                                            |
| 新库 Sandbox 购买  | 订单 `b89d7632-b1ca-40c9-b5e2-4567a866f505` 的付款阶段已验证：Stripe Session/Price/PaymentIntent 均为 test、100 cents/USD 且归属匹配，D1 payload v2、验签事件 processed；当时 grant active、WWW 工作计划及 Profile Loom Pro 可见。该订单现已全额退款                                    |
| 统一退出与重放拒绝 | GitHub 会话退出后三域均匿名，SID/Flow 清除；真实旧 SID 重放被拒绝，重放测试 Cookie 已清理。Google 登录验收后也已退出，login 的 `/api/me` 确认匿名                                                                                                                                       |
| GitHub 重登持权    | 付款后、退款前的 GitHub 退出重登已验证：仍为同一非空用户 ID、premium 恢复，新 SID 与已撤销旧 SID 不同；不代表退款后仍有 Pro                                                                                                                                                             |
| Sandbox 退款撤权   | 唯一退款 `re_3UTixRK268Z7hNOa02NZhwjU` 成功，100 cents 全额退回；D1 订单 refunded、grant revoked，3 个退款事件 processed 且 pending_webhooks=0。退款验收时用户仍已登录，WWW 高级 API 返回 403/premium_required，premium=false；手动刷新工作区显示 Signed in · Explore，最终有效权益为 0 |
| 双登录方式已确认   | 2026-10-24 用户明确确认保留现有 Google/GitHub 两个登录方式，共用同一账号及其服务端权益；未执行解绑或修改自动关联策略。退款后当前有效权益仍为 0，不代表两身份源账号隔离通过                                                                                                              |

以下对象配置和旧验收分开记录，不将配置存在或旧租户登录成功当作本轮通过。本轮证据位于 `.codex-artifacts/production-cutover/`：`production-shared-session-e2e.json`、`production-logout-e2e.json`、`production-sandbox-payment.json`、`production-relogin-e2e.json`、`production-sandbox-refund.json`、`production-refund-ui-api.json` 与 `production-google-e2e.json`；不记录原始 SID、令牌或个人资料。

同邮箱自动关联开关仍关闭（Value 0），关闭开关不会解除已有身份连接。本次未执行 Link/Bind 操作；审计仅确认首次 Social GitHub 注册和本次 Google SignIn，两条身份连接形成的时间与原因未确定，作为历史说明保留。2026-10-24 用户已明确选择保留现有双登录方式，该确认事项已关闭；不据此开启全局自动关联，也不推断未来同邮箱身份会自动合并。

## 已配置对象

| 对象                    | 当前配置                                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logto 生产 Free 租户    | 用户已有租户 `5z8hdi`；Traditional Web 应用 `qc6kvqsqa3k4ti63rmom7` 已配置                                                                                                                                                                                |
| 生产 endpoint/namespace | `https://5z8hdi.logto.app`；保留开发租户的 `auth.loom-labs.ai`，未转移该域名                                                                                                                                                                              |
| Logto 应用回调          | `https://login.loom-labs.ai/api/auth/callback`；退出后地址为 `https://www.loom-labs.ai/`、`https://login.loom-labs.ai/`、`https://checkout.loom-labs.ai/`                                                                                                 |
| 生产 D1                 | `loom-identity-production`，ID `c6f250d7-ee2d-4436-a5dd-f4f4fe498546`；已应用 `0001`—`0004`，两 Worker 已绑定                                                                                                                                             |
| GitHub 生产 OAuth       | App ID `3957442`，Client ID `Ov23liVefdIsdzOQpfmx`；Logto connector `a4sqevygw4341j6b3zadw`；回调 `https://5z8hdi.logto.app/callback/a4sqevygw4341j6b3zadw`                                                                                               |
| Google 生产 OAuth       | 项目 `loom-ai-identity-production`，编号 `671954727511`；Client ID `671954727511-8lrj48seh5b82fu8sal6c8j1ea6pkkdq.apps.googleusercontent.com`；最终 connector `l5o2f31l18kmn7re65jj3`；精确回调 `https://5z8hdi.logto.app/callback/l5o2f31l18kmn7re65jj3` |
| 登录方式                | 已删除/替换两项演示 connector；仅 Google/GitHub 社交注册与登录，未启用 Discord，已移除邮箱密码，同邮箱自动关联关闭                                                                                                                                        |
| Logto 品牌              | 生产租户已保存并重载：Dark mode 开启、浅色主色 `#3A72B3`、深色主色 `#8BBFFF`，复用仓库 CSS；未上传原生 Logo/Favicon，未启用 Pro                                                                                                                           |
| Stripe                  | 保留同一 Sandbox 的 USD 1.00（100 cents）Price、测试密钥和 Webhook；Live 未开启                                                                                                                                                                           |

Google connector 以本表最终 ID 为准，早期未保存的临时 ID 不作为有效对象。四个经用户批准的法务页面已上线并取得 200：[Privacy](https://www.loom-labs.ai/privacy)、[Terms](https://www.loom-labs.ai/terms)、[中文隐私说明](https://www.loom-labs.ai/zh/privacy)、[中文使用规则](https://www.loom-labs.ai/zh/terms)。Google 已登记 Privacy/Terms，并按用户批准正式发布 OAuth 应用；Audience 实际回读“发布状态：正式版”“用户类型：外部”，操作为“返回测试版”。品牌验证随后通过并完成发布，控制台回读“您的品牌已经过验证，正在向用户显示”；数据访问仅含 openid、基本资料和邮箱，验证中心确认不涉及敏感或受限范围。Google、GitHub 的真实应用回调均已通过，当前账号保留双登录方式的用户确认及适用边界见上方验收记录。

WWW Git Builds 已从 `feat/production-cutover` 的后续文档与检查脚本提交 `b9bf7d8` 自动构建并部署 `bd55c5bf-f9b3-4e86-81a7-9f26f82f6969`，CLI 与控制台均回读 100% 流量。该版本仍使用生产 Logto、新 D1 与 Stripe test；26 项线上匿名检查再次通过。上表保留首次切换的版本作为发布基线，后续纯文档提交可能继续产生新的自动部署版本。

切换前，旧库三笔 open Sandbox Session 已限定执行 expire，并由旧 Webhook 确认：pending 由 3 降为 0，expired 由 0 增为 3；paid=1、refunded=3、有效权益=1 均保持不变。旧库完整保留，这些测试历史和权益没有迁入新生产 D1。

上述 ID 均为定位对象的公开标识。Google/GitHub OAuth 密钥保存在 Logto 连接器，生产应用与会话密钥保存在两个 Worker Secrets，Stripe 测试密钥仅配置到 Identity Worker；本地开发凭据使用忽略的 `.dev.vars`。密钥不写入本记录、源码或构建变量，临时配置文件在上传后清理。

## 支付模式与权益规则

- `STRIPE_MODE` 只接受精确的 `test` 或 `live`。仅未设置时默认 `test`；空串、空白、大小写变化及其他值返回 `invalid_billing_mode`，不根据密钥推断或自动开启 Live。
- Identity 的密钥前缀及 Price、Checkout Session、PaymentIntent、Webhook 事件的 `livemode` 必须匹配配置。WWW 只接收模式值，不配置 Stripe 密钥。页面、元数据和 AI 文本入口按服务端模式显示对应说明；当前必须保留测试支付、不真实扣款的提示。
- `0003_stripe_mode.sql` 为 `orders`、`stripe_events` 增加 `stripe_mode`，历史记录默认 `test`。新建 Stripe 对象的 metadata 记录模式和既有订单、用户、产品、功能标识。
- 权益查询关联来源订单，核对用户、产品、功能一致，要求订单 `paid`、grant 未撤销且模式匹配。test 只接受 Checkout payload 版本 1/2，live 只接受版本 2；即使手工存在 live-v1 已付订单及 grant，也不授权。
- 模式字段不能代替数据库隔离。新生产身份使用独立 D1；不复制旧 Sandbox 的会话、订单、事件或权益。测试成功参数不能授予权限，全额退款只撤回对应来源订单的权益。

### 旧 Checkout 请求的幂等兼容

`0004_checkout_payload_version.sql` 独立增加 `orders.checkout_payload_version`，历史订单默认 1；新订单显式保存 2。已应用的迁移不改写。

旧 test-v1 订单可能已在 Stripe 创建 Session，只是首次响应丢失。本地没有 Session ID 不代表 Stripe 没有该对象。重试继续使用原订单、`requestId`、幂等键及原请求体：不补 `stripe_mode` metadata，也不新增 `currency`，其他参数和返回地址保持原值。只有配置和来源订单均为 test-v1 时，才兼容旧 metadata 缺少模式；其他归属字段仍完整校验。新 v2 请求明确写入模式与币种；live-v1 和未知版本拒绝。

## 身份与会话切换

同一个 Google/GitHub 账号进入另一个 Logto 租户，不代表具有同一个 `sub`。当前应用使用受校验的 `sub` 作为本地用户 ID，`LOGTO_USER_NAMESPACE` 表示固定租户归属，不能沿用旧 namespace 来伪装跨租户身份连续，也不按邮箱迁移购买或合并账号。默认从生产身份重新开始；若以后需要迁移，另行核实身份映射和授权范围。

生产两 Worker 必须使用同一生产 app ID、endpoint、namespace、D1 及新生成的会话密钥；各自 `APP_URL` 保持准确，中央 `LOGIN_URL` 仍为 login。新 app ID 会更换 SID/Flow Cookie 名，SDK 状态加密还绑定 app ID 与 endpoint，因此不迁移旧会话或登录流程，用户需重新登录。父域 Cookie 仍是 `.loom-labs.ai`，所有子域仍属于同一信任范围。

回调始终分两层登记：产品 OIDC 回调是 login 的 `/api/auth/callback`；Google/GitHub 回调必须复制生产 Logto connector 显示的 URI。不能复用开发 connector ID 推算新地址。生产使用默认 endpoint，开发 `auth.loom-labs.ai` 及其原配置保留。

## 发布前与回滚

1. 确认生产 connector、应用回调与退出地址完整，两个 Worker 的公开配置及 Secrets 对应同一环境；Stripe 保持 `test`。旧库 `hotkey-tools-identity` 和旧配置完整保留，不清空或改写历史付款。
2. 核对目标 D1 ID 和迁移记录，再发布读取新字段的代码；目标库必须先具有 `0001`—`0004`。当前两应用的本地/preview 迁移、Identity 远端迁移及共享会话检查均以 `DB` binding 选择数据库，不再硬编码旧库名。`mise identity db-migrate` 执行 `wrangler d1 migrations apply DB --remote`；执行前仍须核对所选 Wrangler 环境、该环境的 `DB` binding 和实际 `database_id`。`mise identity db-create` 仅用于首次创建，执行 `wrangler d1 create loom-identity-production --update-config=false`，不会自动改写配置；本次目标库已存在，不重跑建库操作。
3. 两 Worker 成组切换。发布窗口内避免一站使用旧身份/旧库、另一站使用新身份/新库；Git Builds 与运行时配置也必须一致，防止后续自动部署恢复旧配置。
4. 回读实际绑定与部署，再验新租户登录、旧 Cookie 拒绝、三域身份一致、原路径/query 返回、刷新和统一退出。Sandbox 购买、重登与退款撤权是后续独立验收，不以构建通过或旧证据代替。
5. 本轮未开启真实付款；若回滚，两个 Worker 的版本、公开变量、Secrets 和 DB 必须一起恢复，重新登录。不要把新旧会话密文混用。保留新生产库及其记录，回滚不等于删除它。
6. 未来若开启 Live 并已有真实交易，不能将订单处理和 Live Webhook 切回 Sandbox 数据库；应暂停新 Checkout、保留生产订单与事件处理，使用兼容 Live 的版本修复，避免丢单。

官方依据：[Logto 租户类型](https://docs.logto.io/logto-cloud/tenant-settings)说明生产 Free 与付费原地转换的区别；[当前定价](https://logto.io/pricing)列出 Free 配额；[用户迁移](https://docs.logto.io/user-management/user-migration)说明 Cloud 不支持自定义用户 ID；[Google 正式发布要求](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)要求测试和生产项目分离；[Stripe 测试说明](https://docs.stripe.com/testing)区分测试与真实支付。
