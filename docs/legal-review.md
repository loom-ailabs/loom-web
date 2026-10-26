# Loom AI 隐私说明与使用规则：已获发布批准

状态：运营者已于 2026-10-23 明确批准按下列中英文正文公开发布，并提交 Google OAuth 品牌配置；四个政策网址已发布并通过 HTTP 200、语言和 canonical 检查，已填入 Google 品牌配置，OAuth Audience 已回读为正式版。下列正文在批准后未改动。

## 发布范围

拟公开英文 `/privacy`、`/terms`，中文 `/zh/privacy`、`/zh/terms`；默认英文路径不加前缀。网站首页、登录和收银台页脚均提供对应语言的入口。以下正文与 `packages/i18n/messages/{en,zh}/legal.json` 完全对应。

联系邮箱 `boylucky2012@gmail.com` 已获对外展示授权。产品品牌为 Loom AI；本稿不虚构注册公司、经营地址、司法辖区、保留期限或合规认证。Stripe 仍为 Sandbox，Live 功能不在本稿服务范围内。

## 运营者确认范围

- 确认可以按下列中英正文公开账号资料、供应商、Cookie、日志和记录处理方式。
- 确认该邮箱有人处理隐私与账号请求；删除请求需要人工核验身份，正文没有承诺尚未实施的自动删除。
- 确认下列当前服务范围和测试支付说明可公开；以后启用真实付款或模型能力时，须先更新相关正文。

本稿不加入未经授权的退款承诺、法律救济条款或未来商业权益承诺。公开页面本身不会证明 Google 品牌已通过审核。

## 参考依据

Google 的外部生产应用品牌设置要求提供首页、隐私说明和使用条款地址，首页应能访问到与 OAuth 设置相同的隐私链接；隐私说明需准确交代 Google 用户数据的访问、使用、保存和共享方式。[Google：Manage OAuth App Branding](https://support.google.com/cloud/answer/15549049)

正文按当前实现描述 Google 数据仅用于身份和账号服务，不向模型发送。数据用途如有变化，应先更新告知并按要求取得授权。[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)

## 英文正文

### Privacy Policy

Last updated: October 23, 2026

This notice explains how the Loom AI website, sign-in service, and Sandbox checkout handle information. Loom AI is the product brand used on this site. For privacy questions or account requests, contact boylucky2012@gmail.com.

#### Sign-in and account information

When you choose Google or GitHub sign-in, that provider shares the basic profile and email information you authorize with Logto, which provides our identity service. This can include a stable account identifier, name, email address, and profile picture. The available fields depend on your provider and authorization. Your provider handles your password; Loom does not ask you to provide it.

Loom uses Google user data only for authentication, maintaining your account, and providing account-related access to Loom services. The current application does not send this data to model services or use it for model training.

#### Service providers and stored records

Logto processes the sign-in identity and authorization flow. Cloudflare hosts the applications and D1 database. D1 stores account identifiers, names and email addresses when supplied, encrypted session-token state, and order and access records. The application does not store session tokens in browser cookies.

For Sandbox checkout, Loom sends Stripe the order and account identifiers, product information, amount, and currency. Stripe hosts the test checkout and processes the information entered there. These service providers process information needed to provide their respective services.

#### Cookies and shared sign-in

The sign-in cookie contains a random session identifier, rather than your profile or tokens. It is Secure, HttpOnly, and SameSite=Lax on HTTPS and is sent to subdomains of .loom-labs.ai for shared sign-in. Those subdomains are part of the same session trust boundary.

A session has an absolute limit of 14 days from successful sign-in. Signing out, revocation, provider failure, or a security check can end access earlier. Temporary sign-in flow cookies last up to 10 minutes. Language and appearance preference cookies can last one year; they contain preference values, not identity or purchase rights.

#### Sandbox payments and current product scope

Payments are currently in Stripe Sandbox and do not charge real money. Use Stripe test payment details. Sandbox order and access records support testing and are separate from live payments.

The available work plan is curated, static reading and planning content. It does not call a model, create files, or perform external actions on your behalf.

#### Operational information

Loom and its infrastructure providers may process request, error, and security-related technical information to operate and protect the service. This notice does not claim that no logs exist. The current site does not add advertising, marketing, or behavioral analytics trackers.

#### Your choices and deletion requests

Signing out revokes the current shared session; it does not delete your account. You can also manage Loom authorization in your Google or GitHub account settings. Provider authorization changes do not themselves delete records held by Loom.

To request account access, correction, or deletion, email boylucky2012@gmail.com. The administrator will need to verify that the account belongs to you before processing the request. Account, order, and security records are handled according to the actual service need and applicable requirements. There is no single automatic deletion mechanism covering all records, and this notice does not promise deletion when a session expires or when you sign out.

#### Changes to these practices

This notice should be updated if the service or its data practices change. A new use of Google user data must be disclosed, with any required authorization obtained before that new use. Contact boylucky2012@gmail.com if anything here is unclear.

### Terms of Use

Last updated: October 23, 2026

These rules describe the current scope of the Loom AI website, shared sign-in, and Sandbox access flow. Questions can be sent to boylucky2012@gmail.com.

#### What the service currently provides

Loom presents its product vision, a workspace introduction, and a curated creative-tool work plan. The work plan is static content for reading and planning. It does not generate model output, create files, or execute tasks in other tools.

Statements about connecting desktop, browser, and editor workflows describe the product vision. They do not mean that every integration or automated capability is currently available.

#### Your account and sign-in

Use an account you control when signing in with Google or GitHub. Keep access to that provider account secure. Use the same Loom account to access its associated records and permissions; matching email addresses alone do not automatically merge accounts.

Loom uses a shared session across its subdomains. A session may end before its maximum lifetime if you sign out, authorization fails, or a security check requires a new sign-in. Signing out is separate from deleting an account.

#### Sandbox access is a test flow

Checkout currently uses Stripe Sandbox. The displayed USD 1.00 amount is a test amount and makes no real charge. Use Stripe test payment details. Access is granted only after server-side payment confirmation, not merely by visiting a success page.

Sandbox records do not represent a real purchase or a promise of access to future commercial offerings. Test payment, refund, and revocation operations can change test access. These rules do not establish a live purchase or refund policy.

#### Use the intended access flow

Use the published sign-in and checkout controls. Do not impersonate another account, access another user’s orders, forge callbacks, bypass permission checks, or abuse the service with unauthorized requests.

The server checks current identity and permissions for protected operations. A visible button, cached page, or previous access result does not establish current permission.

#### External providers and privacy

Sign-in and checkout can take you to Google, GitHub, Logto, or Stripe pages. These providers operate their own account and service features. Loom does not manage your provider password or replace your control of those accounts.

Read the Privacy Policy for information about account data, cookies, service providers, and deletion requests. For account or service questions, contact boylucky2012@gmail.com.

#### Service changes

The scope and availability of the service can change. Any move from Sandbox testing to real payments requires the relevant purchase information and user-facing notices to be updated before the new flow is offered. This page describes the current test flow.

## 中文正文

### 隐私说明

更新日期: 2026年10月23日

本说明介绍 Loom AI 网站、统一登录和 Sandbox 收银台如何处理信息。Loom AI 是本网站使用的产品品牌。隐私问题或账号请求可联系 boylucky2012@gmail.com。

#### 登录与账号资料

选择 Google 或 GitHub 登录后，供应商会将你授权的基本资料和邮箱信息交给身份服务 Logto，包括稳定的账号标识，以及可用的姓名、邮箱、头像等字段。实际字段取决于供应商及你的授权。密码由供应商处理，Loom 不要求你向其提供密码。

Loom 仅将 Google 用户数据用于身份认证、维护账号和提供与账号相关的 Loom 访问服务。当前应用不将这些数据发送给模型服务，也不用于模型训练。

#### 服务供应商与保存的记录

Logto 处理登录身份与授权流程。Cloudflare 托管应用和 D1 数据库。D1 保存账号标识、供应商提供的姓名和邮箱、加密的会话令牌状态，以及订单和访问权限记录。应用不会将会话令牌放入浏览器 Cookie。

创建 Sandbox 收银台时，Loom 向 Stripe 传递订单与账号标识、商品信息、金额和币种。Stripe 托管测试收银台，并处理在该页面填写的信息。这些供应商会处理提供各自服务所需的信息。

#### Cookie 与共享登录

登录 Cookie 只保存随机会话标识，不保存个人资料或令牌。HTTPS 下使用 Secure、HttpOnly 和 SameSite=Lax，并发送到 .loom-labs.ai 下的子域，用于统一登录；这些子域属于同一会话信任范围。

会话从成功登录起最长有效 14 天，主动退出、撤销、上游服务失效或安全检查可能使其提前结束。临时登录流程 Cookie 最长有效 10 分钟。语言与外观偏好 Cookie 最长可保存一年，只包含偏好值，不承载身份或购买权益。

#### 测试支付与当前产品范围

当前付款使用 Stripe Sandbox，不会真实扣款。请使用 Stripe 测试付款资料。Sandbox 订单和权限记录用于测试，与正式支付分开处理。

当前工作计划是由 Loom 整理的静态阅读与规划内容，不会调用模型、创建文件或代你执行外部操作。

#### 运行信息

为运行和保护服务，Loom 及基础设施供应商可能处理请求、错误和安全相关的技术信息。本说明不表示服务完全没有日志。当前站点未新增广告、营销或行为分析追踪。

#### 你的选择与删除请求

退出登录会撤销当前共享会话，不等于删除账号。你也可以在 Google 或 GitHub 的账号设置中管理对 Loom 的授权；更改上游授权不会直接删除 Loom 保存的记录。

如需查询、更正或删除账号资料，请联系 boylucky2012@gmail.com。管理员处理请求前需要验证账号归属。账号、订单和安全记录根据实际服务需要及适用要求处理。目前没有覆盖所有记录的统一自动删除机制，本说明不承诺会话到期或退出后会自动删除这些记录。

#### 处理方式的变更

服务或数据处理方式发生变化时，应同步更新本说明。Google 用户数据如有新的用途，应先说明，并在需要时取得授权后再使用。如有不清楚之处，可联系 boylucky2012@gmail.com。

### 使用规则

更新日期: 2026年10月23日

本规则说明 Loom AI 网站、共享登录和 Sandbox 访问流程的当前范围。有关问题可联系 boylucky2012@gmail.com。

#### 当前提供的服务

Loom 展示产品愿景、工作区介绍，以及整理好的创意工具工作计划。工作计划是供阅读与规划使用的静态内容，不会生成模型输出、创建文件或在其他工具中执行任务。

关于连接桌面、浏览器和编辑器工作流的描述属于产品愿景，不表示每项集成或自动化能力目前都已提供。

#### 账号与登录

请使用你有权控制的 Google 或 GitHub 账号登录，并妥善保护上游账号。使用同一 Loom 账号访问与其关联的记录和权限；相同邮箱本身不会自动合并不同账号。

Loom 在其子域间共享当前会话。主动退出、授权失效或安全检查可能要求提前重新登录。退出会话与删除账号是两种不同操作。

#### Sandbox 访问属于测试流程

当前收银台使用 Stripe Sandbox。页面中的 USD 1.00 是测试金额，不会真实扣款，请使用 Stripe 测试付款资料。只有服务端确认支付状态后才会发放访问权限，仅打开成功页面不能获得权限。

Sandbox 记录不代表真实购买，也不构成对未来商业版本访问权限的承诺。测试支付、退款和撤销操作可能改变测试权限。本规则不建立正式交易或退款政策。

#### 按正常流程使用

请使用站点提供的登录与收银台入口，不要冒用其他账号、访问他人订单、伪造回调、绕过权限校验或发送未经授权的滥用请求。

受保护操作由服务器检查当前身份和权限。可见按钮、缓存页面或之前的访问结果，不代表当前仍有访问权限。

#### 外部供应商与隐私

登录或进入收银台时，可能跳转至 Google、GitHub、Logto 或 Stripe 的页面。这些供应商分别运营自己的账号和服务能力。Loom 不管理你的上游密码，也不替代你对这些账号的控制。

账号数据、Cookie、服务供应商和删除请求的处理方式见隐私说明。账号或服务问题可联系 boylucky2012@gmail.com。

#### 服务调整

服务范围与可用状态可能调整。从 Sandbox 测试切换为真实付款前，需要先更新相应购买信息和面向用户的说明。本页描述的是当前测试流程。
