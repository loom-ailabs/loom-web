# 中英文国际化

Loom 使用 `next-intl 4.14.9`，为两套 Next.js 16 App Router/OpenNext 应用提供中英文页面、请求级消息和客户端翻译。英文为默认语言，使用 `/`、`/vision`、`/workspace`、`/pricing`；中文使用真实的 `/zh` 路径。个人信息页为 `/account` 与 `/zh/account`。旧 `/en` 页面地址由 next-intl 重定向到对应无前缀地址，保留原始查询。

## 方案与边界

Next.js 官方推荐以动态语言段承载子路径语言路由；next-intl 提供对应的 App Router、服务端组件、客户端 Provider、导航和 SEO 支持。本项目采用 `app/[locale]`、`localePrefix: 'as-needed'` 和默认语言 `en`。与自行实现字典相比，现成库还处理 ICU 消息和语言导航；与 next-i18next 相比，这里直接使用面向 App Router 的 next-intl 请求配置，不引入第二套翻译运行时。

- [Next.js 国际化](https://nextjs.org/docs/app/guides/internationalization)
- [next-intl 路由接线](https://next-intl.dev/docs/routing/setup)
- [next-intl 路由配置](https://next-intl.dev/docs/routing/configuration)
- [next-i18next 官方仓库](https://github.com/i18next/next-i18next)

语言只影响页面显示与托管登录的界面语言，不影响用户、会话、商品、价格或权益。`/api/**`、Logto callback、Stripe Webhook、静态资源、robots 与站点地图不经语言代理，不新增 `/en/api` 端点。页面路径不使用 Hash 路由。

## 语言选择

显式语言前缀优先。没有前缀时，代理只读取已验证的 `LOOM_LOCALE=zh|en` 偏好；没有有效偏好则使用英文。代理不使用 `Accept-Language` 自动改变默认语言，因此搜索引擎和首次访问者读取默认英文地址时行为稳定；已保存中文偏好的用户仍进入 `/zh`，不会被默认值覆盖。

正式环境的偏好 Cookie 使用 `Domain=.loom-labs.ai; Path=/; Secure; SameSite=Lax`，本地使用当前主机。它只含非敏感的语言代码，一年后过期，可由客户端更新；不与 HttpOnly 登录 Cookie 共用名称或内容。

语言切换从当前页面构造目标地址，保留合法路径、原始查询及其中的 `returnTo`，移除片段。切换到英文会移除语言前缀，切换到中文使用 `/zh`。偏好写入后进行文档导航，使另一个应用也能读取相同偏好。

## 文件与调用

共享实现位于 `packages/i18n`：

| 位置                | 职责                                                          |
| ------------------- | ------------------------------------------------------------- |
| `src/routing.ts`    | 支持语言、真实路径转换与偏好 Cookie 属性                      |
| `src/proxy.ts`      | next-intl 页面协商，明确跳过 API 与资源                       |
| `src/index.ts`      | 不含 Next 路由加载的翻译 Hook 与 Provider                     |
| `src/navigation.ts` | `Link`、路由 Hook 与 `useLocaleSwitcher`；API Link 保持原路径 |
| `src/server.ts`     | 服务端翻译 API、按语言装载消息                                |
| `messages/{zh,en}`  | Common、Web、SignIn、Access 与公开 SEO 消息                   |

两个应用的 `src/i18n/request.ts` 使用当前 Next.js 的 `next/root-params` 读取已匹配语言，拒绝不支持的值。Next config 中的 next-intl 插件与已有 OpenNext、jose WebCrypto alias 同时保留。布局输出对应的 HTML `lang`，并以相同消息进行服务端渲染与客户端 hydration。

客户端翻译：

```tsx
import { useTranslations } from "@loom-ai/i18n";
import { Link, useLocaleSwitcher } from "@loom-ai/i18n/navigation";

const t = useTranslations("Web");
const { locale, switchLocale } = useLocaleSwitcher();
```

服务端翻译使用 `@loom-ai/i18n/server` 的 `getTranslations`。消息按 namespace 分文件，中文和英文必须具有一致的键；共享测试负责检查两份目录对应关系。导航和纯翻译使用不同出口，避免测试只使用翻译时无必要地加载 Next 导航实现。

## 认证语言

托管 Logto 登录保持统一的 `/api/auth/login` 和 `/api/auth/callback`。未设置有效偏好时使用英文；应用只把有效的偏好映射为 `extraParams.ui_locales = 'zh-CN' | 'en'`，不转发任意客户端额外参数。Logto 官方支持该 OIDC 参数，但最终显示取决于租户已支持的语言；它不改变身份或回调地址，也不保证 Google/GitHub 自身授权页使用相同语言。

参考：[Logto UI locales](https://docs.logto.io/end-user-flows/authentication-parameters/ui-locales)。

本站购买页面按用户选择的语言显示；Stripe 托管 Checkout 本轮保持官方默认行为，省略 `locale` 时沿用浏览器语言，不与 `LOOM_LOCALE` 绑定。为保持已有订单重试参数一致，本轮不修改订单格式或 Stripe 创建参数，也不承诺 Google、GitHub 或 Stripe 外部页面与站点偏好一致。参考：[Stripe Checkout locale](https://docs.stripe.com/api/checkout/sessions/create?query=locale)。

## SEO 与隐私

公开四类页面为每种语言生成独立 canonical、`zh-CN` / `en` / `x-default` hreflang、Open Graph、描述与 JSON-LD。站点地图收录八个公开地址，排除个人信息、认证和购买页面。英文公开纯文本入口固定在根目录，中文入口为 `/zh/llms.txt`、`/zh/llms-full.txt`；旧 `/en/llms*.txt` 继续提供英文文本以兼容已有链接。`x-default` 指向默认英文地址。

个人信息页明确 `noindex,nofollow,noarchive`；identity 全站保持禁止索引。私有 API 继续使用服务端认证、实时权益和 `private,no-store`，语言 Cookie 与 robots 不能授予任何访问权限。

## 验证

新增测试覆盖无 Cookie 默认英文、显式中文优先、已有中文偏好保留、旧 `/en` 跳转、无效偏好、父域 Cookie 属性、查询保留、API 不被改写、消息键对应、双语 canonical/hreflang 和站点地图范围。实际 OpenNext 构建、Workers HTTP 及浏览器检查须分别记录；构建通过本身不代表已发布或第三方联调完成。

next-intl 使用 ESM。涉及其导航的 Vitest 测试按[官方测试说明](https://next-intl.dev/docs/environments/testing)内联处理 `next-intl` 依赖，避免 Node 对 `next/navigation` 扩展名的解析差异；不修改 Next.js 或 next-intl 源码。
