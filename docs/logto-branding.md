# Logto 托管认证页品牌配置

Logto 生产 Free 租户 `5z8hdi` 已保存并重载 Loom 品牌配置：Dark mode 开启、浅色主色 `#3A72B3`、深色主色 `#8BBFFF`，复用 [logto-branding.css](logto-branding.css)。未上传原生 Company logo/Favicon，未启用 Pro、Bring your UI 或隐藏 Logto 标识。完整生产授权流程仍在联调，不能把保存和重载当作所有托管页面的真实验收。当前版本与结果集中见[生产切换说明](production-cutover.md)。[Logto 定价](https://logto.io/pricing)

以下开发租户 `kpy72v` 的计算样式、截图和原始回滚值保留为历史效果记录，不移作生产截图或生产变更前基线。

## 开发租户历史配置与实际效果

维护者已在 **Sign-in & account → Branding** 保存下列设置，重载后核对已保存 CSS。最终样式使用 `html[data-theme] body` 提高正文规则优先级，加载装饰顶部为 `3rem`。浅色预览的计算背景为 `oklch(0.99 0.004 250)`；真实 `/direct/social/github` 页面为深色，存在 `style[data-custom-css]`，计算背景为 `rgb(24, 24, 24)`，加载装饰顶部为 48px；GitHub 回调也已观察到内联 CSS 与 Loom 标识。验证只覆盖已观察页面，不据此保证所有托管页面都采用同一布局。

| 配置                        | 开发租户历史值                           | 开发变更前值   |
| --------------------------- | ---------------------------------------- | -------------- |
| 浅色主色                    | `#3A72B3`                                | 主色 `#6139F6` |
| 深色主色                    | `#8BBFFF`                                | 深色模式关闭   |
| Dark mode                   | 开启                                     | 关闭           |
| Custom CSS                  | [logto-branding.css](logto-branding.css) | 空             |
| 原生 Company logo / Favicon | 本轮未配置                               | 保持原字段状态 |

CSS 对齐背景、正文颜色、系统字体、加载图标尺寸与身份源间距，并遵循减少动态效果偏好。加载画面的 Loom 标识是引用公开 SVG 的装饰性伪元素，不能作为原生 Company logo 或 Favicon 已上传的证明。它不替换身份源图标、加载状态、表单、错误、账号关联、开发环境提示或 Powered by Logto。无个人资料的实际回调截图保存在忽略目录 `.codex-artifacts/polish/logto-github-loading.png` 与 `logto-loading-final-dark.png`。

控制台的原生品牌字段与 Custom CSS 是两种配置；官方文档分别说明 Logo、Favicon、主色及应用级覆盖规则。后续上传原生图片时，应按当前控制台限制处理，并重新核对浅深主题。[品牌设置](https://docs.logto.io/customization/match-your-brand)

## 作用范围与主题传递

Custom CSS 只接受样式，不插入 HTML 或 JavaScript。托管 DOM 和类名可能随 Logto 升级改变，因此维护时要检查真实加载、身份源回调、错误与关联页面；Live Preview 不能代替真实授权流程。CSS 无法绘制浏览器尚未收到的页面，也无法消除跨域网络导航或纯重定向阶段的空白，更不控制 Google/GitHub 自身页面。[Custom CSS](https://docs.logto.io/customization/custom-css)

应用只从唯一且有效的 `LOOM_THEME` Cookie 读取 `light` 或 `dark`，通过官方 SDK 的 `extraParams.theme` 传递；`system`、缺失、无效或重复值均省略，不接受 query 覆盖。Logto 官方新增的 `theme=light|dark` 参数控制托管流程外观，配合租户启用的深色模式使用；它不改变 state、PKCE、令牌验证或返回地址规则。[官方更新说明](https://blog.logto.io/changelogs/2026-september)

## 品牌回滚

此前开发租户的回滚方式是在该租户 Branding 页面清空 Custom CSS，将主色恢复为 `#6139F6`，关闭 Dark mode 并保存。生产品牌回滚应使用生产配置自身的变更前记录，不把开发基线套用到生产；原生 Logo/Favicon 未上传，没有本轮新增原生图片需要撤销。随后分别用浅色、深色偏好检查托管登录、错误和账号关联页面。品牌回滚仅涉及显示，不修改身份源、客户端凭据、回调地址或 D1 会话，也不等于应用切回开发租户。
