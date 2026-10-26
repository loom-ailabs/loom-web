# Creem 测试支付与全站购买接入

当前全站新购买统一使用 Loom Labs 商店的 Creem Test mode，保留首页 Loom Pro 与独立职业形象照包两种商品；不真实扣款，未开启 Live。第一阶段职业照接入的验收记录保留在下方，不能当作第二阶段全站切换的发布或 Pro 验收结果。

## 当前全站方案

| 商品                            | 固定测试价格           | Creem 测试商品                | 页面与权益                                                             |
| ------------------------------- | ---------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| Loom Pro                        | USD 1.00，含税单次购买 | `prod_7axKhvtA10UxHeQlhFi91U` | `/`、`/zh` 账号页；解锁静态工作计划，已有有效 Pro 时不重复购买         |
| Loom Professional Headshot Pack | USD 9.99，含税单次购买 | `prod_6ntBKFLfAklD4ipCBu5exj` | `/headshots`、`/zh/headshots`；每单 4 张成片权益、1 次重做，可重复购买 |

新 Pro 使用 `/api/checkout` 与 `/api/orders/[id]`，职业照使用独立的 `headshot_*` 接口；两种商品共用 `/api/webhooks/creem`，通过固定 SKU、订单类型和当前交易分别核实及发权。职业照套餐不授予 Pro；退款只撤回对应来源订单，不撤回其他有效 Pro 订单或职业照套餐。历史 Stripe 订单、Webhook、退款与有效 Pro 权益继续按原协议处理，不再创建新的 Stripe 购买。

Identity 的公开变量为 `CREEM_MODE=test`、`CREEM_PRODUCT_ID`（职业照）、`CREEM_PRO_PRODUCT_ID`（Pro）；`CREEM_API_KEY`、`CREEM_WEBHOOK_SECRET` 仅进入忽略的本地 `.dev.vars` 或 Identity Worker Secrets。WWW 配置 `CREEM_MODE=test` 并查询共享 D1，不持有支付密钥。两应用对未设置的 `CREEM_MODE` 兼容默认 test，但拒绝显式空串、空白、live 或其他值。共享语言菜单为 English 第一项、简体中文第二项，保留用户已保存的语言偏好；两种购买均保留合法的原语言回跳。

发布前必须在同一目标 D1 顺序应用 `0001`—`0006`，再发布 Identity 与 WWW。`0005_creem_headshot_packs.sql` 创建首轮 Creem 订单、事件和职业照套餐；`0006_creem_pro.sql` 以事务重建相关表，复制并保留既有订单、事件、套餐和关联关系，扩展固定商品与金额约束，并新增 `creem_pro_entitlements`。不能编辑已应用迁移，不能把职业照套餐转换为 Pro；迁移后须比对既有记录与外键，再开始端到端验证。第二阶段最终部署版本和 Pro 验收结果见后文。

## 职业照产品范围

职业照支付与套餐权益依据[产品方案 3.3](https://bytedance.larkoffice.com/wiki/XblqwD2cgiVk3qkQWMpc7rMOnle)：USD 9.99 单次购买，每包 4 张职业形象照（方形头像与竖版文件）及 1 次重做。照片上传、模型生成、预览和文件下载尚未实现。套餐记录表示购买权利，不表示已经生成成片；正式产品需要先生成真实水印预览、付款后解锁同一批成品。

## 商店与商品

- 商店：用户已创建的 Loom Labs，保持 Test mode。
- 商品：`Loom Professional Headshot Pack`，`prod_6ntBKFLfAklD4ipCBu5exj`；USD 999 cents，`onetime`、`inclusive`，关闭自选金额、企业净价和弃单营销。
- SDK：官方 `creem@1.13.0`，显式 `server: "test"`，15 秒超时，不自动重试创建 Checkout。
- Webhook：`wh_test_3ktmfouyLV4w9vbZ6iE53o`，`https://checkout.loom-labs.ai/api/webhooks/creem`，订阅 `checkout.completed`、`refund.created`。
- 页面：`https://checkout.loom-labs.ai/headshots` 与 `/zh/headshots`，禁止索引，明确测试购买不会真实扣款。

`CREEM_MODE=test`、`CREEM_PRODUCT_ID` 与 `CREEM_PRO_PRODUCT_ID` 为公开配置；`CREEM_API_KEY`、`CREEM_WEBHOOK_SECRET` 只保存在本地忽略的 `.dev.vars` 和 Identity Worker Secrets。不要把密钥放入 `.env.local`，OpenNext 会编译 dotenv 内容。当前不配置正式密钥、正式商品或真实扣款。

## 下单、确认与撤权

浏览器提交 UUID `requestId`，服务端从受校验会话取得用户，核对准确 Origin，并从 Creem 读取启用的测试商品，确认 USD 9.99 含税单次固定价。先保存 D1 pending 订单，再创建单件 Checkout。数据库原子 claim 保证同一购买尝试只调用一次创建接口；响应丢失时标为 uncertain，拒绝盲目重建，迟到的已验签 Webhook 可以恢复该订单。

不把 Creem 的 `request_id` 跟踪字段假定为有明确保留期限的幂等保证。付款回跳保留语言并使用本地 `purchase_id` 查询订单；Creem 自动附加的 `order_id` 不是本地订单标识。回跳、浏览器传参和购买按钮均不能发放权益。

实际测试 API 的创建响应未回传 SDK 中可选的 `requestId`；仅在该字段存在时比对，始终核对完整 metadata 和本地订单关联。此响应差异已加入创建和付款的回归测试。

Webhook 先限制正文大小，以官方 helper 验证原文签名，再通过测试 API 查询真实 Checkout、订单与交易，核对商品、金额、币种、数量、关联用户、metadata 和模式。事件、订单状态、套餐发放或撤回在同一 D1 事务中提交；重复事件不重复发权，事务失败可重试。

退款后 Creem 订单仍可能为 `paid`，因此使用当前交易的退款状态和 `refundedAmount` 判断成功全额退款。迟到的付款事件不能恢复已退款套餐；同账号其他有效订单继续保留各自权益。生成阶段以后接入时，必须按来源订单和当前套餐状态鉴权，不能仅使用浏览器显示或旧 Pro 开关。

异步退款尚未确认时返回 503，让 Creem 重试；退款状态与累计金额矛盾时拒绝发权。Creem 的自动重试窗口有限，超过 24 小时仍未完成的通知需要从控制台手动重放。本轮未新增定时对账任务，正式收款前需补充超窗恢复的运营或自动对账流程。

`0005_creem_headshot_packs.sql` 新增独立 `creem_orders`、`creem_events`、`headshot_packs`，第二阶段的 `0006` 在保留这些记录后增加 Pro 支持；旧 Stripe 订单、事件和权益保持原有数据归属。当前 Creem 数据的 mode 只允许 test。

## 配置与运行

1. 配置上述五项 Creem 变量，只有密钥写入 `.dev.vars`，不得进入 dotenv 构建配置或提交；WWW 仅配置模式。
2. `mise identity db-migrate-local`；需要发布时先核对目标 DB binding，再执行 `mise identity db-migrate`。
3. 执行类型、lint、覆盖率、`mise run verify` 和 Workers 本地预览；确认迁移至 `0006` 后使用 `mise identity deploy` 与 `mise run web:deploy` 发布两应用。
4. 使用已登录账号从形象照页面发起测试购买。成功测试卡及拒绝卡以 [Creem Test Mode](https://docs.creem.io/getting-started/test-mode) 为准，不输入真实卡号。
5. 回读 D1 订单、已处理事件和对应套餐；测试退款后检查该单撤权以及其他订单隔离。

## 第一阶段验收记录：职业照接入（历史）

第一阶段于 2026-10-26 从工作区发布 Identity Worker，当时版本为 `be076e67-3b86-4101-8927-622ed696583b`；D1 `c6f250d7-ee2d-4436-a5dd-f4f4fe498546` 当时已应用 `0005`。以下对象、数量、覆盖率与版本仅反映首轮职业照验收，不表示第二阶段或之后的当前账号数据。未提交或推送代码，后续 Git Builds 需包含对应变更才能保持部署一致。

| 验收项           | 第一阶段实际结果                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 构建与检查       | 全仓 `mise run verify` 通过；实际响应兼容修正后，Identity 类型、lint、461 项测试与发布构建再次通过；核心覆盖率 statements 99.61%、branches 99.32%、functions/lines 100%。                    |
| Workers 本地预览 | 11 项 HTTP 检查通过：两语言页面、匿名商品读取、未登录/跨来源拒绝、原文验签、正式事件拒绝及正文大小限制。                                                                                     |
| 远端匿名检查     | Worker 地址 7 项 HTTP smoke 通过，正式域名商品接口返回测试价 999 cents；实际登录和付款使用 checkout.loom-labs.ai。                                                                           |
| 拒绝测试卡       | 官方拒绝卡显示付款拒绝；D1 订单仍 pending、套餐数为 0。                                                                                                                                      |
| 英文购买         | 本地订单 `a690c0b9-97af-4dc2-a9cb-55581aef1fa8`；Checkout `ch_34Co0qLXHHuEHVbAVjaVpZ`；交易 `tran_4MVvYYp0Or9RazHtysPbRU`；实际确认 test、USD 999 cents 后发放一包。该单现已全额退款。       |
| 中文重复购买     | 本地订单 `9d21a105-651f-41b9-81a4-4ec0194d6112`；Checkout `ch_6HgdFTBaKfxVehY06laHV9`；交易 `tran_4IxSmQuRNlWdNE21qtkQJJ`；回跳仍为 /zh/headshots。第二次购买后共 2 包、8 张成片、2 次重做。 |
| 测试退款         | 首次退款接口返回 pending，随后 API 确认交易 refunded、refundedAmount=999。真实 refund.created 已投递并处理，第一单权益撤回，第二单保持有效。                                                 |
| 旧付款事件重放   | 从 Creem 控制台重放第一笔 checkout.completed，投递 HTTP 200。平台为此次重放生成新事件 `evt_5ZtLuk7XplqlYPTU9pflLW`；已退款订单仍 refunded，不恢复套餐。                                      |
| 最终权利与事件   | 1 个有效测试套餐：4 张成片、1 次重做；一单 paid、一单 refunded，4 个真实事件均已处理。                                                                                                       |
| 凭据检查         | 已检查 Next.js/OpenNext 产物，未包含本次 Creem API 密钥或 Webhook 密钥。                                                                                                                     |

首次联调因创建响应缺少可选 requestId 而保留的未付款尝试 `8c6b58fc-405d-4296-9cc0-a5ad83bc54d9` 仍为 pending/uncertain，无交易、无权益；未删除或伪造该记录。另有一个不关联应用订单的诊断测试 Checkout，未付款。它们不计入成功订单或套餐数。

第一阶段证据位于忽略的 `.codex-artifacts/creem/`：`local-runtime.json`、`remote-smoke.json`、`payment-1.json`、`payment-2.json`、`refund-1-transaction.json`、`final-d1.json`、`final-payment-refund.png` 与构建/发布日志。记录只包含测试对象标识和状态，不保存原始会话 Cookie、令牌或敏感用户资料。

第一阶段完成的是 Creem Test mode 的职业照付费测试链路，未产生真实付款或退款，也未验证正式商户审核、实际出款及照片交付。

## 第二阶段验收：全站 Creem 与 Loom Pro

2026-10-26 已从工作区发布两应用：Identity `43ffedd1-0c33-4030-a9d5-ffbb1aaa3dd9`，WWW `22706dcc-235b-4290-ae7a-2c0c08104aea`，均回读为 100% 流量。WWW 首次发布遇到网络错误，复用已验证产物重试后成功。目标 D1 已应用 `0006`；本轮未提交或推送代码，后续 Git Builds 仍需包含本轮源码和迁移。

| 验收项          | 第二阶段实际结果                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 检查与构建      | 全仓 `mise run verify` 返回 0：identity-core 310、Identity 518、WWW 89、i18n 14、旧 Worker 4，共 935 项测试；包含实际 Workerd 会话协议验证、Next.js/OpenNext 构建与 dry-run。                    |
| 覆盖率          | Identity statements 99.45%、branches 99.16%、functions 100%、lines 99.8%；identity-core 98.28%/95.89%/100%/98.82%；WWW 四项均 100%。                                                             |
| 并发边界        | 同用户、同 requestId 同时请求两种商品时，仅胜出商品创建一次 Checkout；另一个请求拒绝，不会返回错误 SKU 的收银台。真实 SQL 双向并发回归通过。                                                     |
| 迁移与既有记录  | 本地及远端迁移成功。迁移前后逐项比对原 4 笔 Creem 订单、3 份套餐记录、5 个事件完全一致；历史 Stripe 表记录数不变，外键检查无异常。                                                               |
| HTTP 验证       | Identity 实际本地 Workers 10 项、正式域名 10 项、WWW 正式域名 9 项通过；覆盖双语页面、独立职业照目录、D1、匿名和跨来源拒绝及缺少 Webhook 签名拒绝。                                              |
| 新 Pro 测试付款 | 从首页购买入口进入新 Creem 商品，确认 Test、USD 100 cents、单次含税；本地订单 `b71f9ab9-20fd-40cf-8d80-446b48d6dd39`，Checkout `ch_65LbwxbuJeLlf6SCJfPXiL`，交易 `tran_5wR1LLwtWnSAaxWjY3Djii`。 |
| 真实发权与功能  | `checkout.completed` 事件 `evt_2qZEzYzkA8YSKYfcDsXCuo` 已处理；订单 paid、独立 Pro 权益生效。浏览器回跳显示付款确认，WWW 识别 Pro 并实际成功读取受保护工作计划。                                 |
| 测试退款与撤权  | 退款首次响应 pending，随后读取交易确认 refunded、refundedAmount=100。真实事件 `evt_3HeORHWH2pxvYz6fs6UjKT` 已处理，来源 Pro 权益撤回；原主站页面再次调用受保护操作被拒绝并清除已显示计划。       |
| 商品权益隔离    | 此次 Pro 付款与退款前后，原有全部职业照套餐记录逐项一致；两个有效职业照套餐继续有效，不授予 Pro。                                                                                                |
| 语言排序与文案  | 购买页与主站实际浏览器菜单均确认 English 第一项、简体中文第二项。当前方案、购买页、SEO/AI 文本及双语法律说明已更新至 Creem；法律说明保留历史 Stripe 数据用途。                                   |
| 密钥            | 扫描 4633 个 Next.js/OpenNext 产物文件，未发现本地 Creem API 或 Webhook 密钥；WWW 不配置支付密钥。                                                                                               |

本轮证据位于忽略目录 `.codex-artifacts/creem-unification/`，包含迁移前后快照、覆盖率/全仓验证、发布及流量读回、HTTP 检查、Pro 付款/退款状态，以及 `pro-workspace-unlocked.png`、`pro-refund-denied.png`、`english-first.png` 和 `web-english-first.png`。最终该笔 Pro 测试订单为 refunded，Pro 不再有效；原职业照套餐保持原状态。此次未发生真实收退款，未开放正式收款或扩展照片生成与交付。
