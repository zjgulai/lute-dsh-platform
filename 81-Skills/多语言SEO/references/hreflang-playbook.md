# hreflang 配置 Playbook（多语言 SEO 参考）

> 按需加载：配置 hreflang / 站点架构 / 地域定向时查阅。来源：Google 官方文档 + 跨境 SEO 实践。

## 语言-地域代码规范（ISO 639-1 + ISO 3166-1）

正确格式 `language-region`（语言小写、地区大写或小写均可，Google 不区分大小写但推荐小写）：

| 代码 | 含义 | 常见误区 |
|------|------|---------|
| en-us | 英语-美国 | 与 en-gb / en-ca / en-au 分开 |
| zh-cn | 中文-中国大陆（简体） | 与 zh-tw / zh-hk 分开 |
| de-de | 德语-德国 | 与 de-at（奥地利）分开 |
| ja-jp | 日语-日本 | — |
| es-es | 西班牙语-西班牙 | 与 es-mx（墨西哥）分开 |
| fr-fr | 法语-法国 | 与 fr-ca（加拿大）分开 |

## 三种实现方式

1. **HTML head 标签**（最常用，逐页添加）
2. **HTTP Header**（适用于 PDF 等非 HTML 资源）
3. **XML Sitemap**（推荐用于大型站点，集中管理）

三种方式等价，但**不要在同一页面混合多种实现**。

## x-default 规则

- 必须设置，指向「最通用」的版本（通常默认语言或语言选择页）
- 用于处理「未匹配到任何语言」的用户（如搜索引擎或用户语言不在列表）
- 与其它 hreflang 标签并列，每个 URL 集合只设一个 x-default

## 双向引用与自引用验证

- **自引用**：每个页面必须在自己的 hreflang 集合里包含指向自己的一条
- **双向引用**：页面 A 声明了页面 B 的 hreflang，页面 B 也必须声明页面 A
- 缺失任一方向，Google 会忽略整个集合

## 架构选择

| 维度 | 子目录 (/en/) | 子域名 (en.) | ccTLD (.co.uk) |
|------|--------------|--------------|----------------|
| SEO 权重 | 集中到主域 | 分散 | 完全独立 |
| 维护成本 | 低 | 中 | 高 |
| 本地化信号 | 弱 | 中 | 强（Geo 明确） |
| 推荐场景 | 一般跨境站 | 大型区域站 | 深耕单一市场 |

## 各国搜索引擎要点

- **Google**：标准 hreflang；关注 Core Web Vitals；英语内容质量
- **Baidu（中国）**：不完全支持 hreflang；必须 ICP 备案；简体中文优先；.cn 域名或备案国际域名
- **Yandex（俄罗斯）**：自有 geo 体系，需配合 Yandex Webmaster
- **日本（Google.co.jp + Yahoo! Japan）**：日语本地化程度、移动端优先、Konbini 等本地支付

## 地域定向信号（页面级）

- 本地货币显示（USD/CNY/EUR/JPY）
- 本地联系方式（电话/地址）
- 本地支付方式（SEPA、Konbini、iDEAL）
- 配送信息（本地物流）
- Organization Schema 的 address/addressCountry/addressLocality

## 常见错误清单

1. hreflang 代码大写混用（EN-US）→ 不规范，改小写
2. 漏 x-default
3. 双向引用缺失
4. 同一 URL 被多个 locale 复用
5. 语言切换器用 JS 跳转（爬虫不可见）→ 改 HTML 链接
