# Identity core

WWW 与账户/购买应用共用的服务端实现；不包含 Cloudflare binding 获取或 Stripe 客户端。

- `session` 只适配 Next cookies 中的随机标识；`session-manager` 通过官方 `@logto/node/edge` 发起、完成、刷新与退出。官方 SDK 负责 state、PKCE、issuer、audience、签名及协议流程，不修改 SDK 或自行实现 OIDC。
- 生产会话 Cookie 为 `__Secure-loom_sid_<appId>`，流程 Cookie 为 `__Secure-loom_flow_<appId>`，均设置 `Domain=.loom-labs.ai; Path=/; HttpOnly; Secure; SameSite=Lax`。Cookie 不含令牌；WWW、checkout 与 login 共用 D1、原 identity 密钥、app ID、endpoint、租户命名空间。
- `session-repository` 保存 SID 的 SHA-256 哈希、加密 SDK 状态、固定截止时间、版本与 30 秒刷新租约。D1 `first-primary` 读取和条件更新协调跨 Worker 并发；登录流程为 10 分钟，成功回调另建固定 14 天认证会话，令牌刷新不延长期限。
- `session-crypto` 使用原 `LOGTO_COOKIE_SECRET` 经 HKDF 派生 AES-GCM 密钥；app ID、endpoint 与 SID 哈希绑定加密上下文。ID/access/refresh token 只存在于服务端处理过程和 D1 密文中。
- `session-sdk` 使用官方公开方法 `clearAccessToken()` / `getAccessToken()` 自动刷新，SDK 状态暂存后通过一次 D1 版本比较更新提交。身份令牌或 access token 剩余有效期不超过 60 秒，或 access token 缓存缺失、异常时触发；每个请求 5 秒、协议操作总计 20 秒。活跃锁等待有界；锁过期不接管旧 refresh token，刷新结果不确定时撤销会话。
- `auth` 取得未撤销、未绝对到期且必要时已刷新的会话，再校验 `exp/sub`。用户写入固定租户命名空间，不能按邮箱合并。
- `auth-routes` 统一在 LOGIN_URL 发起与完成 OIDC。有效共享会话直接返回受信产品；显式 `returnTo` 保存于 D1 中加密的 SDK 登录状态，回调重新验证。
- `return-target` 仅接受 HTTPS 的规范 `*.loom-labs.ai`、默认 443、无用户信息，排除 login/auth 主机，不接受 apex、混淆域名或任何 hash。保留合法路径和原 query。开发仅允许显式登记的 loopback origin。
- `entitlements` 每次查 D1 当前有效订单授权，不缓存付费状态；各应用写 API 仍验证自己的准确 Origin。
- `http` / `http-codes` 提供统一安全响应与脱敏诊断；`contract` 仅包含浏览器安全类型。

父域 Cookie 会发送给同一信任域内的所有子域（也包括 auth）；这些服务必须按同一会话信任边界管理。退出先在 D1 撤销当前 SID 及关联流程，再由 SDK 尽力撤销 refresh token；适配层 finally 清同 Domain/Path 的 Cookie，最终 303 退出 Logto。版本条件阻止在途刷新恢复会话；流程与认证记录的关联阻止已知流程的迟到回调恢复会话，新登录也先撤销 Cookie 指向的旧流程。后续请求和复制的 SID 均受撤销检查，已显示页面需刷新状态；这不等于退出用户所有设备或撤销无关联的独立新授权。

旧自包含 `__Secure-loom_session_<appId>` 和 `logto_<appId>` 不再读取，迁移需一次重新登录；退出还会清理它们。14 天是最长绝对期限，不承诺上游令牌、浏览器 Cookie 或异常情况下始终免登录。设计和本轮验证状态见[会话生命周期](../../docs/session-lifecycle.md)。

生产固定 `LOGTO_USER_NAMESPACE=https://kpy72v.logto.app`；它不是 OIDC issuer 的替代品，SDK 仍从当前 endpoint 发现并校验实际 issuer。本地统一 localhost，两端口使用同一密钥，Cookie 不设置 Domain；不能用端口隔离同名 Cookie。

```bash
mise exec -- pnpm --filter @loom-ai/identity-core test:coverage
```

核心四项覆盖率门槛均为 90%；会话与权益使用真实 SQLite 查询，SDK 协议测试使用合成供应商响应，支付事务与实际迁移测试归 `apps/identity`。重点覆盖绝对到期、轮换、并发刷新、失败关闭、退出竞争和迟到回调；这些测试不等于真实供应商在线刷新证据。
