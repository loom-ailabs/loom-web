# Loom AI 产品与工作区的设计依据

`apps/web` 是 `www.loom-labs.ai` 的产品首页与工作区；登录与购买分别使用 `login.loom-labs.ai`、`checkout.loom-labs.ai`。三者统一品牌与主题，工作计划目前是人工整理的静态内容。用户决定本次继续 Stripe Sandbox，Live 关闭；已确认的未来 USD 1.00 正式价仅作代码准备。身份、数据库与切换进度统一见[生产切换说明](production-cutover.md)。

## 愿景与内容

叙事来自 loom-box 的 `README.md`：**Connecting Intelligence. Crafting Tomorrow.**，以及桌面、浏览器、编辑器与 Web 之间连续的 AI 体验。首页使用“连接智能，织就你的下一步”表达这个方向。

“多端协作”“上下文延续”属于产品愿景。本站没有接入 loom-box daemon、模型生成或外部工具执行，不展示虚构用户量、效率、模型运行状态或客户背书。工作区以工作计划、查看计划和访问权限等正式功能措辞呈现，不再使用“示例”“Demo”“演示”标签；只有服务端权益校验通过后才展开人工整理的静态工作计划，文案调整不代表新增生成或执行能力。

## 视觉参考

外部参考为 [Linear 官方首页](https://linear.app/) 与 2026-03-12 发布的 [A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh)。采用内容优先、降低导航视觉权重、柔和边框和低饱和底色的原则。当前首屏使用中央排版与原创数字编织场：数字字符、微点和短线在内容周围交织，细指针输入只牵引边缘图形，正文与主要操作仍由 HTML 输出。它表达连接与创造的愿景，不是实时任务或模型状态。导航、卡片与菜单采用统一磨砂玻璃材料，保留浅深主题、实色主要操作和可读性降级。调研取舍、实际文件和本轮验证见[视觉系统](visual-system.md)；界面、图形与文案不复制 Linear 或其他参考站点的品牌和付费实现。

表单与购买页主要参考 loom-box 的 `apps/loom-desktop/docs/design-language.md` 和实际 `webview/src/shared/styles/theme.css`：连续工作区、轻分隔、系统字体、36px 控件、8px 控件圆角及12px工作区圆角。当前桌面深色基底为 `#181818`，raised 为 `#232323`，边框 `#353535`，文字 `#dfdfdf`，链接 `#8bbfff`。本仓库将这些角色集中在 `packages/ui/src/styles/globals.css` 的 `.dark`（兼容 `.loom-dark`）中，业务组件使用语义颜色和 Tailwind spacing utilities。

登录页采用双栏：左侧社交登录操作区居中，右侧呈现产品愿景轮播。默认自动播放，可视控制仅保留分页点，保留键盘可达的暂停/播放与减少动态效果支持。CSS/SVG 图形表达愿景，不是实时任务状态。组件选择、账户菜单、浅深主题与验证记录见[页面交互设计](ui-interactions.md)。

## Logo 使用

- 彩色原稿直接复用 loom-box 的 `assets/brand/loom.png`，不重绘、不裁切角色；首页展示位采用较低透明度，与深色背景协调。
- 导航与表单使用该项目的正式单色派生标识 `apps/loom-desktop/plugins/tauri-plugin-loom-tray/icons/tray-18.svg`，通过 CSS 反色与透明度协调小尺寸展示；浏览器图标保留暖色原图。
- 两种标识保持同一环织形象，暖色不承担付款成功、服务在线等状态含义。

## 交互与真实边界

用户从产品携带 `returnTo` 进入统一登录页；会话有效则直接回到原产品，否则通过官方 Logto SDK 完成登录与回调后返回。返回地址限制在可信的 Loom 产品域名，合法路径与查询保持不变，拒绝外域、含片段的地址和登录循环目标。

页面采用 Next.js 路径路由：英文默认为 `/`、`/vision`、`/workspace`、`/pricing`，中文使用对应 `/zh` 前缀；个人信息页使用 `/account` 与 `/zh/account`，禁止索引。旧 `/en` 页面保留 query 并规范跳转到英文地址。页面导航、登录和支付返回均不使用 Hash 地址，工作区可直接打开和刷新；SSR、SEO 和偏好设置见[国际化方案](internationalization.md)。

导航账号状态由布局中的 Provider 在客户端路由间保留，首次完整加载读取一次；不在 focus、visibility、定时器或路由变化时自动同步，不显示“Syncing”。用户手动刷新状态，或完整重载后获取新快照；28px 头像外框含 26px 图片，保留 40px 点击范围，菜单四项图标均为 16px。显示快照不代替服务端认证和权益校验。

正式会话 Cookie `__Secure-loom_sid_<appId>` 只保存随机标识，设置 `Domain=.loom-labs.ai; Path=/; Secure; HttpOnly; SameSite=Lax`；所有 Loom 子域使用同一 D1 会话与服务端加密密钥，SDK 令牌状态不进入浏览器。应用会话自成功回调起固定 14 天，服务端按需自动刷新短期令牌且不延长绝对期限。退出先撤销 D1 记录，再尽力撤销上游令牌，适配层 finally 删除相同 Domain/Path 的 Cookie，最终 303 登出；刷新或已知关联流程的迟到回调不能恢复已撤销会话。范围是当前 Cookie 标识的共享会话与流程，不宣称退出其他设备、撤销独立新授权或无条件保持登录 14 天。此前认证 checkpoint 的真实刷新、共享退出、受控绝对到期拒绝与重登证据继续保留；此前界面发布的 454 项测试、本地与线上各 67 项 HTTP 和浏览器记录均为历史，不作为本次切换的验收。详见[会话生命周期](session-lifecycle.md)与[界面验收](ui-interactions.md)。

主站和购买页使用同一环境的 Logto 用户标识查询 D1 权益。来源订单必须已付款、模式与归属匹配，test 接受 payload 版本 1/2、live 只接受版本 2。购买后返回主站手动刷新状态，查看工作计划时再次由服务端检查权益；成功页参数不能开通，已退款订单不能再次提供权限。切换租户不按邮箱迁移身份或测试权益，旧库保留。

支付说明由服务端模式决定，不能从客户端参数或密钥自动开启 Live。当前继续 Stripe Sandbox 的 USD 1.00 单次测试付款，界面明确说明不真实扣款；正式购买文案已准备但未启用。Google 和 GitHub 此前均已通过开发租户返回 WWW；只读检查显示当时已有两种身份源连接，该轮未执行关联、合并或连接编辑，不按邮箱自动合并账号。这些历史结果不作为新生产租户已验收的证据。

Logto 托管页通过免费品牌设置与 Custom CSS 对齐浅深主题；真实 GitHub 回调已观察到 Loom 加载装饰。原生 Logo/Favicon 字段本轮未配置，开发环境提示和 Powered by Logto 保留；CSS 不控制网络空白、重定向或 Google/GitHub 页面，详见[品牌配置](logto-branding.md)。
