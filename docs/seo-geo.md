# 搜索与 AI 阅读入口

Loom AI 的六个公开页面提供中英文共十二个可抓取 URL、独立元数据和机器阅读入口。当前工作区提供人工整理的静态计划。已准备的代码按服务端 `STRIPE_MODE` 选择支付说明，test 明确不真实扣款，live 使用 USD 1.00 单次购买文案；用户本次决定继续 Sandbox，Live 关闭，不能将价格代码准备写成已可收取正式款项。身份与支付切换进度见[统一记录](production-cutover.md)。代码配置、已发布站点、搜索引擎抓取、索引和排名分别验证。

## 已实现的入口

| 入口                                                                             | 当前行为                                                                                                                                                    |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`、`/vision`、`/workspace`、`/pricing`、`/privacy`、`/terms` 及对应 `/zh` 路径 | 英文默认无前缀，中文使用 `/zh`，正文由 Next.js 首次渲染；输出对应语言的标题、描述、canonical 和 hreflang。公开介绍可匿名阅读，工作区权益仍由私有 API 校验。 |
| 分享元数据                                                                       | 每页 Open Graph 和 Twitter Card 使用同页绝对地址、对应语言和模式文案及原有 1254×1254 `/loom.png`，不重绘 Logo。                                             |
| JSON-LD                                                                          | `Organization` 与 `WebSite` 只包含实际品牌、站点、语言及 Logo；输出前转义 `<`。没有虚构评分、评论、地址、商业 Offer 或真实模型能力。                        |
| `/robots.txt`                                                                    | 允许公共内容抓取，并指向本站 sitemap。私有 API 通过认证、`private, no-store` 及 `X-Robots-Tag: noindex, nofollow, noarchive` 控制，不依靠 robots 隐藏信息。 |
| `/sitemap.xml`                                                                   | 列出六页两种语言的十二个公开 canonical URL；不列登录回调、用户、订单或支付接口。没有可靠内容更新时间时不生成虚假的 `lastmod`。                              |
| `/llms.txt`                                                                      | Markdown 格式的站点说明、六个公开页面入口与纯文本正文链接，供主动支持该约定的 agent 使用。                                                                  |
| `/llms-full.txt`                                                                 | 六个页面的精简公开说明；只含产品方向、工作计划、当前支付模式与能力边界，按请求读取公开模式配置，不读取会话或数据库。                                        |

元数据与公开内容集中在 `apps/web/src/shared/config/seo.ts`。新增公开页面时同时维护 canonical、sitemap 和正文；产品能力变化时更新公开正文，避免 HTML 与纯文本描述分歧。Next.js 使用官方 [Metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)、[robots](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots)、[sitemap](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)和 [JSON-LD 输出方式](https://nextjs.org/docs/app/guides/json-ld)。

## SEO 与 GEO 的实际边界

Google 的 [2026 年生成式 AI 搜索优化指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)仍以有用内容、可抓取页面、清晰站点结构和良好体验为基础。页面需满足索引与摘要资格；站点还需在 Search Console 中被纳入生成式 AI 搜索功能。符合要求不保证抓取、索引或展示。该指南明确：Google Search 不用 `llms.txt`，添加它不会改善或损害 Google 排名。

`llms.txt` 是[独立提出的开放约定](https://llmstxt.org/)，用于为支持它的 agent 提供背景与正文入口；它不是通用搜索协议或授权机制。本实现不承诺任何 AI 服务一定读取、引用或推荐本站，也不通过批量重复页面或隐藏内容争取展示。

`WebSite` 信息用于表达[网站名称偏好](https://developers.google.com/search/docs/appearance/site-names)，`Organization` 信息用于帮助[识别品牌与组织](https://developers.google.com/search/docs/appearance/structured-data/organization)。结构化数据不代表已经获得搜索结果增强展示。`noindex` 需要爬虫能读取响应，因此 WWW 不在 robots 中阻止 `/api/`；未经认证的访问只能取得经过脱敏的拒绝响应，索引规则不替代鉴权。参考 Google 的 [noindex 说明](https://developers.google.com/search/docs/crawling-indexing/block-indexing)。

## Cloudflare 与搜索控制台

Cloudflare 可以在源站 robots 前[追加托管规则](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/)，AI Crawl Control 或 WAF 也可能单独阻止爬虫。因此部署后以 `https://www.loom-labs.ai/robots.txt` 的真实响应及边缘策略为准，不能只检查仓库文件。

本轮控制台已检查：`loom-labs.ai` 的 Bot Preference Sync 关闭，AI Crawl Control 所列 32 个爬虫的阻止开关均未开启；记录见本地验证产物 `cloudflare-ai-crawlers.json`。这只证明检查时的配置，不保证所有请求不会受其他规则限制。Cloudflare 自动 Markdown 转换需要 Pro，当前未启用、未升级；本应用用公开纯文本入口提供基础阅读能力。

2026-10-23 已按用户授权，为 `https://www.loom-labs.ai/` 完成 Google Search Console URL-prefix 所有权验证；验证方法为 HTML 标记。`https://www.loom-labs.ai/sitemap.xml` 已提交，控制台回读“已成功处理站点地图”，发现网页 4、视频 0，读取日期为 2026/10/23。记录为 `gsc-verification.json`。这是[站点图提交与处理](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)的实际结果，不等于四个页面已经被索引。

`Settings > Search generative AI` 已回读为继承父域 `loom-labs.ai` 的“包含”，保留原配置，未修改开关。[官方说明](https://support.google.com/webmasters/answer/16908024)指出默认选择 Include，有父属性时默认继承；本轮记录来自本站实际控制台，而非由默认规则推断。该开关不等于 AI 训练授权或排名保证。

## 历史验证记录

本地行为测试检查 sitemap 的公开范围、同页 canonical/分享地址、纯文本响应与敏感入口排除，以及 JSON-LD 注入边界。完整 Next.js/OpenNext 构建、Workers 预览和生产域 HTTP 检查由最终应用验证执行；搜索控制台结果和实际收录需另记，不能由单元测试推断。

| 历史已观察结果                          | 状态                                                                                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WWW Worker                              | `c7fbf7c8-c45a-45e5-b6d2-7ae7c15a0b85` 已部署，主站新版页面已生效。                                                                                                                                 |
| 登录与购买 Worker                       | `a4224f5a-c2f1-427f-87c5-2fb94f03cce2` 已部署；本轮 GitHub 中央登录、三域共享身份、付款后演示与共享退出重登持权已真实通过；新订单成功全额退款后，D1 撤权及原已登录 WWW 会话的高级接口拒绝均已核对。 |
| 主站公开 HTML 与 feeds                  | 四页 SSR 正文、canonical、Open Graph 地址及 robots、sitemap、两份 llms 纯文本均已在线取得 HTTP 200；首页验证标记存在，产品 hash 链接数为 0。                                                        |
| 匿名安全检查                            | 60/60 通过，包括四种自声明 crawler User-Agent 的公开页 200 与高级接口 401、私有接口 noindex/no-store。不能据此推断真实爬虫 IP 已访问。                                                              |
| GSC HTML 所有权、站点图与生成式 AI 设置 | 所有权已验证，站点图已成功处理并发现 4 页，生成式 AI 搜索继承父域“包含”；三张对应截图与 `gsc-verification.json` 已保存。                                                                            |

匿名检查前后 D1 均为用户 1、订单 4（pending 2、refunded 2）、权益 2（有效 0）、事件 8，查询 `rowsWritten=0`，数据库无变化；证据为 `shared-domain-negative-checks.json`。公开可达性另见 `seo-live-reachability.json`。实际搜索索引与真实 crawler IP 抓取仍未确认。GitHub 共享会话、付款后演示、共享退出重登及成功全额退款撤权已有独立浏览器、Stripe 和 D1 证据，不能由这组匿名请求推断。

该历史轮次成功全额退款为 `re_3UTQ2FK268Z7hNOa1gQwapex`，金额 USD 1.00，对应当时测试订单；原已登录 WWW 会话的高级接口返回 `code=2003`、`premium_required`，工作区恢复免费状态并隐藏旧计划。当时最终 D1 为用户 1、订单 5（refunded 3、pending 2）、权益 3（有效 0）、事件 12。付款完成及三类退款事件全部处理；记录为 `shared-domain-browser-e2e.json`、`shared-domain-billing.json` 与 `shared-domain-d1-refunded.json`。当时 Google 按用户选择停止关联；后续开发租户的真实登录记录另见应用 README，均不能替代本次生产租户验收。
