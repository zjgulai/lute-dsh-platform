---
title: 外部系统卡片（systems.html → 新应用，按岗位分类）方案与执行 TODO
status: implemented（P0–P5 全部落地，2026-09-13；实测读数见 docs/notes/implemented/surface/2026-09-13-newapp-systems-section.md）
date: 2026-09-13
---

# 外部系统卡片 · 方案与执行 TODO

> 目标：把 `https://lute-tlz-dddd.top/systems.html` 下的**全部卡片链接**，以同款卡片形态收进 DSH 桌面端，
> 分类轴**由源页面的 5 类改为岗位角色**（本机 50 个 `agt-*` preset）。
>
> 本文件只做方案，不含实施。所有"事实"栏都是一次真实取证，取证方式写在同行。

---

## 0. 已裁决（2026-09-13，冻结；未写任何代码）

| # | 分叉 | 裁决 | 含义 |
| --- | --- | --- | --- |
| **D1** | 卡片住在哪 | **B —— 扩展「新应用」抽屉，加「业务系统」第二分区** | 上分区「产品」目标函数（ADR-0045）**原样不动**；下分区新增外链卡；须登记一条窄修订（§3 写法定稿） |
| **D2** | 岗位归属口径 | **① 多对多 + 主岗位分组** | 每系统 1 主岗位 + N 兼属；按主岗位分组，一系统只出现一次；卡上列全部岗位 chip，可跳转 |
| **D3** | 数据同步 | **快照进仓库 + 可复跑同步脚本** | 抽屉**离线可用**；重跑以 git diff 呈现差异；凭据只走 DSH 凭据服务 |
| **D4** | 点开方式 | **系统默认浏览器新开** | 不做 iframe 内嵌（跨域拦截未验证，且各系统自带登录态） |

**默认、可随时推翻的一项**：源页面的 5 类分类**不作为二级筛选**进本轮（留 P6.1）。理由见 §4.6。

---

## 0.5 实施结果（2026-09-13 收口）

| 阶段 | 状态 | 关键读数 |
| --- | --- | --- |
| P1 数据层 | ✅ | 31 系统入库；同步脚本幂等（**带凭据时** `--check` exit 0；本机未配置凭据 → 现 exit 2，见 T0.3）；巡检 31/31 可达、2 个入口即登录页 |
| P2 契约层 | ✅ | 外链开卡独立于 `planOpen`（产品三级逐字未改）；`open-system` 只收 slug，未知 slug 404、任意 URL 送不进（400） |
| P3 渲染层 | ✅ | 「业务系统」分区；31 系统 / 14 个主岗位分组 / 覆盖 23/50 岗位 |
| P4 装配与门禁 | ✅ | `gate:full` **22/22**；装载点字节与仓库一致；实况探针 **34/34、exit 0** |
| P5 留痕 | ✅ | ADR-0062 + Note；ADR-0045 标注部分修订 |

**实施中被仪器抓到的两个真缺陷**（详见 Note）：网格项拉伸而卡片未填满导致同行卡底差 102px；品牌绿作正文色两态都只有 3.3:1。两个都不是肉眼在单一主题下能看见的。

**实况探针自身也被抓了三个错**（详见 Note）：一条恒真的分组断言（Σ 按构造恒等，是装饰不是证据）、把 preset 目录名 `agt-NNN` 当成岗位 id `AGT-NNN`、以及按未转义写法断 JSON 里的 `"slug"`。三条都已改成能被证伪的判据，并用变异测试证明会红。

**重启后实况读数（2026-09-13）**：宿主半边重启后 `systems` 由 401 转 **200**，实活 **31 条 / 14 个分组 / 覆盖 23 个岗位**，与产物逐字一致；`accept:newapp-systems` 由 **32/32 exit 3** 转 **34/34 exit 0**（原先两条 ⏳ 转成真实绿，且**没有任何一条是靠放宽判据转绿的**）。本包单测 **179/179（16 文件）**，`probe:design` 真实 Chrome 双主题对比度全绿。

**仍未取到（不宣称完成）**：
- **抽屉里那 31 张卡的屏幕读数**——需要页面刷新 + DOM 探针或人眼；本轮相机拍的是夹具页（真组件 + 真 payload 契约已由 `catalog-roundtrip.spec` 与实况探针覆盖，但"画出来了"仍是推断）。
- **人点一次卡**确认默认浏览器打开正确地址——探针**故意**不打 `open-system` 成功路径（会真的弹浏览器）。决策与解出的 href 已由 `systems-routes.spec` 用注入的假 `openUrl` 断言，但"真的开对了"没有自动证据。
- **凭据未落地（T0.3）**：`sync-systems.mjs` 需要 `LUTE_PORTAL_EMAIL` / `LUTE_PORTAL_PASSWORD`，本机凭据服务里没有这两个键 → 脚本现 **exit 2**（响亮失败，非静默）。快照完整可用，但**再同步跑不通**。另：本轮对话出现过明文口令，**建议用后即改**。

---

## 1. 实测底数

### 1.1 源页面（2026-09-13 取证）

| 读数 | 值 | 取证方式 |
| --- | --- | --- |
| 是否需要登录 | **是**。`/systems.html` → `/login.html?next=/systems.html` | `web_fetch` |
| 登录接口 | `POST /portal/session`，JSON `{email,password}`；成功 `200 {"ok":true}`，种 cookie `lute_portal_session` | 读 `login.html` 内联 JS + curl 实测 |
| 卡片总数 | **31**，31 个**唯一域名**（无重复 href） | 正则解析已登录 HTML |
| 每卡字段 | `href` / `data-category` / 英文名 `card-subtitle` / 中文名 `card-title` / 中文简介 / 英文简介 / `card-meta` chips（**类型**：Docker 应用·静态站点·静态报告 + 技术标签）/ 动作文案 `card-cta` | 同上（样例：`video.lute-tlz-dddd.top` → "AI Native Video / AI 原生视频系统 / AI 视频生成·资产管理·长视频与品牌内容工作流 / [Docker 应用][AI Video][Next.js] / 打开视频系统"） |
| 源页面**自带**的分类 | 5 类：creation 5 / insight 7 / growth 8 / ai 8 / operations 3 | `data-category` 计数 |
| 分类栏文案 | 全部 · 内容创作与发布 · 客户洞察与市场 · 经营决策与增长 · 数据治理与运营 · AI 能力与智能体 | 解析 `<nav class="category-bar">` |
| 渲染方式 | 服务端直出静态 HTML，**无 XHR、无内嵌 JSON、无 data-role** | grep |
| 域名入口可达性 | **31/31 返回 200** | `curl -L` 并发实测（最快 0.14s / 最慢 4.3s） |
| 入口即登录页 | **≥2 确定**（`mkt`、`shopify` 的 title = 「登录 LUTE AI Native Builder Lab」）；`audit`/`brand`/`platform.shopify` 正文含登录字样（启发式，需人工复核） | curl 标题抽取 |
| 已有更丰富的旁证 | `VOA/_current/05_Assets/LUTE系统产品五维介绍汇总.md`：产品定位/业务价值/技术亮点/**成熟度 M0–M4**/优化方向 —— 但**只覆盖 24 个产品、日期 2026-07-02，已过期**（现 31 个） | 读文件 |

**31 个系统清单**（中文名 · 英文名 · 源类别 · 类型）：

| # | 中文名 | 英文名 | 源类别 | 类型 | 域名前缀 |
| ---: | --- | --- | --- | --- | --- |
| 1 | AI 原生视频系统 | AI Native Video | creation | Docker | video |
| 2 | AI 效能公式链 | AI Content Production | creation | Docker | redbook |
| 3 | 客户声音分析平台 | Voice of Customer | insight | Docker | voc |
| 4 | 财经经营洞察 | Momcozy DataPilot | insight | Docker | ana |
| 5 | 品牌资产智能中台 | BrandOS Asset Intelligence | growth | 静态站点 | asset |
| 6 | 品牌经营操作系统 | BOS AI Brand Operations | growth | Docker | bos |
| 7 | E2E 洞察报告 | VOC Insight Report | insight | 静态报告 | report |
| 8 | 独立站监控 | Shopify Audit Report | growth | 静态报告 | shopify |
| 9 | Shopify AI 经营知识库 | Shopify AI Knowledge Base | growth | Docker | platform.shopify |
| 10 | 市场洞察工作台 | Market Insight Platform | insight | 静态站点 | mkt |
| 11 | 品牌战略引擎 | Brand Strategy Engine | growth | Docker | brand |
| 12 | 科学经营决策系统 | VOA MAS | growth | Docker | mas |
| 13 | 商业机会点 | Business Insight Hub | growth | 静态站点 | business |
| 14 | AI 选品平台 | AI Product Selection | growth | 静态站点 | product |
| 15 | AI 知识图谱 | AI Knowledge Garden | ai | Docker | kg |
| 16 | DocCanvas 工作台 | DocCanvas Knowledge Graph | ai | Docker | kgraph |
| 17 | 数字员工 | AI Digital Employee | ai | 静态站点 | person |
| 18 | 大模型选型 | LLM Compare Hub | ai | 静态站点 | llm |
| 19 | 前车之鉴 · 思维模型工作台 | Oriental Thinking Workbench | ai | Docker | xmind |
| 20 | 数据采集平台 | Data Intelligence Hub | operations | Docker | scrapy |
| 21 | Melwater 分析 | Melwater VOC | insight | Docker | melwater |
| 22 | Reddit 舆情工作台 | Reddit Insight Workbench | insight | Docker | reddit |
| 23 | 插件中心 | VOC Hub | ai | Docker | plugin |
| 24 | AI 流程编排平台 | Flowise Agent Builder | ai | Docker | flowise |
| 25 | VOC 标签工作台 | VOC Label Workbench | insight | Docker | label |
| 26 | 供应链治理 | SCM Governance | operations | Docker | scm |
| 27 | AI 审计一体化协作平台 | Medical Audit Collaboration | operations | Docker | audit |
| 28 | 发布资产工厂 | HTML Anything | creation | Docker | present |
| 29 | 微信公众号文章批量下载 | WeChat Content Toolkit | creation | Docker | wct |
| 30 | 经营咨询工作台 | Consultant Agent | ai | Docker | kb |
| 31 | AI 技能库 | paper2skills | creation | 静态站点 | skills |

### 1.2 目标宿主（本机 DSH Desktop / LUTE）

| 事实 | 值 | 出处 |
| --- | --- | --- |
| 「新应用」是什么 | 侧边栏与「新会话」**并排各占一半**的入口 → 抽屉「应用矩阵」 | `dsh-newapp-local/README.md` |
| 抽屉的**卡主键** | **产品**（有 `product.json` 的目录），一产品一卡 | ADR-0045 R4 |
| 卡的六项字段 | 名称 / summary / 状态 / **岗位** / 版本 / 功能数 | ADR-0045 M4 |
| 「岗位」是否**已是**卡的字段 | **是**。`product.json` 的 `preset` **必填**，且必须是本机存在的 preset（`agt-*` 之一） | ADR-0033；`src/products.ts:159` |
| 点开三级判据 | ①有 `entry.service`→开面板 ②岗位在本机→开会话 ③否则**禁用**，原因写在按钮旁（不用 tooltip） | `src/client/product-cards.ts` `planOpen()` |
| **已冻结**的目标函数 | 「一张**只摆已产品化产品**的启动台」，未产品化占位卡数目标 **0** | ADR-0045 §2 M1 |
| 该目标函数的来历 | 用户原话「这个插件太重了」；当时 25 张卡里 24 张写着「尚未产品化」 | `.scratch/newapp-product-matrix/spec.md` §1 |
| 本机扫描根 | `/Users/lute/project`（profile patch；**默认为空 = 一个目录都不扫**） | `~/.dsh/profiles/desktop/cordis.patch.yml:17` |
| 本机已声明产品 | **1 个**（`KOL-Hunter`） | 同上 spec §1 |
| 岗位角色 | **50 个** `AGT-001..050`，两层分类（组织平面 → 责任域），如 `AGT-007 望野·市场竞争与机会研究`【业务运营·产品与创新】 | `~/.dsh/.agent-presets/*/manifest.json` |
| 已有的岗位分类面 | ①`dsh-role-matrix-local` **岗位矩阵抽屉**（只读预设目录，按平面→责任域出卡）②输入框下方「**岗位能力导引**」（按会话岗位渲染技能列，ADR-0053/0054） | 两包 README |
| 本地 surface 如何装配 | profile `dependencies`（`file:`/`link:`）+ 包内 `cordis.patch.yml`；本机 6 个 `*-local` 包 | `~/.dsh/profiles/desktop/package.json` |

### 1.3 由此得到的三个硬约束

1. **源页面的分类轴不是岗位。** 它自带 5 类，且页面里**没有任何岗位数据**（无 `data-role`、无内嵌 JSON）。
   按岗位分类 = 一次**人工映射**，抓取抓不到 —— 这是本方案里**唯一无法自动化**的工件（见 §4）。

2. **31 个目标全是外部域名。** 没有本地目录、没有 preset、没有 `entry.service` →
   在 `planOpen()` 现有三级里**全部落到第 3 级「不可用」**。
   把卡片直接塞进现有管线的任何做法，都会产出 31 张"**看着能按、按了什么也没发生**"的卡
   —— 正是这个插件明令禁止的失败态。**必须新增一种开卡动作（外链）。**

3. **「新应用」刚被剪枝，往里加东西是对 ADR-0045 的显式修订。**
   剪枝的目的是消灭"占位噪音"，不是禁止第二类**可点开**的卡；但这条修订必须**登记 ADR**，
   不能静默做（ADR-0009 / ADR-0015）。

---

## 2. 四个落点方案

| | 方案 | 卡片住在哪 | 新增代码量 | 需修订 ADR | 主要代价 |
| --- | --- | --- | --- | --- | --- |
| **A** | **31 份 `product.json` + 外链开卡（第 4 级）** | 新装配目录 `<scanRoot>/lute-systems/<slug>/` | **最小**（几乎只有 `planOpen` 加一档 + 渲染） | ADR-0033（entry.kind 增 url）、ADR-0045（M5 判据扩） | 「产品」这个词被稀释：31 个"产品"其实是远程网址；扫描根多 31 个目录 |
| **B** | **newapp 抽屉加「业务系统」第二分区** | `dsh-newapp-local` 内新增 catalog 数据源 | 中 | ADR-0045（目标函数扩为两分区） | 该插件自述「只读，不拥有自己的事实」，引入自带 catalog 后它会**开始拥有一个事实** |
| **C** | **新建独立插件 `dsh-systems-map-local`** | 自己的抽屉（侧边栏新入口） | 中 | **无** | 侧边栏多一个入口（现在已有 7 个 `*-local` 面） |
| **D** | **挂进 `dsh-role-matrix-local` 岗位矩阵** | 岗位卡详情展开区 / 新增「系统」分区 | 中 | 无（但扩了该插件边界） | 该插件自述「**只读**预设目录」，引入外部目录 + 网络探测会破坏其纯度 |

**四个方案共享同一份核心工作量**：catalog（31 系统 + 岗位映射）、外链卡类型与打开动作、
按岗位分组的渲染、测试与门禁。**分歧只在"catalog 的家"和"哪个面渲染它"。**

---

## 3. 已采纳 B（本节保留决策理由，供日后回看）

**裁决：B（§0 D1）。** 理由：

- 用户的原话是"存放到**新应用**中" —— B 直接命中，不新增入口。
- ADR-0045 的剪枝针对的是"**占位**噪音"（24 张点不开的卡），B 加的是第二类**可点开**的卡，
  与剪枝意图不冲突；修订面窄且可写清楚。
- 不选 A：它代码最少，但会让抽屉里出现 31 个"不是 Agent 的产品"，
  「产品」这个名词与「点开直接跑」的承诺同时被稀释 —— 省下的代码不值得付这个语义代价。
- 不选 D：`role-matrix` 的"只读预设目录"是它 README 里刻意声明的边界，不该为这件事破。
- 不选 C：能满足需求，但要牺牲"一个入口装下全部"这个用户明确表达过的意图。

**ADR-0045 的修订写法定稿**（实施时逐字进 ADR）：

> 抽屉 = **两个分区**。上分区「产品」维持原目标函数不变（一卡一产品、未产品化占位卡数 0）；
> 下分区「业务系统」放外部系统外链卡，卡片**必须可点开**（外链动作恒成立），不产生任何禁用卡。
> M1/M2 只对上分区生效。

**由此产生的边界（写进实施与测试）**：

1. `planOpen()` 的现有三级**逐字不变** —— 它只服务产品卡；外链卡走**另一条**判据
   （`{level: 0, kind: 'url'}`），两条互不污染。
2. 两个分区的卡片**不共用渲染**：产品卡有「打开 / 开会话 / 不可用」三态，
   外链卡只有「打开系统 →」一态。混在一张网格里会让人分不清哪个"点开直接跑"（§6 R5）。
3. **catalog 进包，`systems.json` 是这份事实唯一的家**（ADR-0009）；
   `dsh-newapp-local` 从"不拥有任何事实"变成"拥有一份 catalog"——这个身份变化必须在 Note 里写明。

---

## 4. 数据与分类设计

### 4.1 数据分层（三个家，各一份事实）

| 层 | 内容 | 家 | 谁生成 | 是否进仓库 |
| --- | --- | --- | --- | --- |
| **抓取层** | 31 个系统的 `href/中英文名/中英简介/chips/类型/cta/源类别` | `packages/surfaces/<pkg>/catalog/systems.json` | `scripts/sync-systems.mjs`（从 systems.html 抓） | ✅ 进 |
| **映射层** | `slug → roles[]`（**主岗位 + 兼属岗位**）+ 一句"为什么属它" | 同目录 `catalog/role-map.json` | **人工维护**（我出初稿，你审） | ✅ 进 |
| **凭据层** | portal 账号密码 | **DSH 凭据服务**（键如 `LUTE_PORTAL_SESSION`） | 用户写入 | ❌ **绝不进仓库**（AGENTS.md 红线） |

**为什么两层分开**：抓取层可随时重跑覆盖，映射层是人的判断、重跑会丢。分开后
"系统换了名字"和"这个系统该归哪个岗位"是两件事，不会互相覆盖。

### 4.2 快照 vs 实时

**推荐快照（catalog 进仓库）+ 可复跑同步脚本。** 理由：
面板打开时**必须离线可用** —— 在渲染路径上发网络请求，会让抽屉在断网/站点抖动时变空或变慢。
实时性由 `pnpm run sync:systems` 手动或发布前跑一次来保证，差异以 git diff 呈现。

### 4.3 岗位分类的三条口径（已裁决采纳 ①）

| 口径 | 表现 | 风险 |
| --- | --- | --- |
| ①**多对多 + 主岗位分组** | 每个系统声明 1 主 + N 兼属；抽屉按**主岗位**分组（一系统只出现一次）；卡上列出全部岗位 chip，点 chip 跳到该岗位分组 | 兼属关系在默认视图里不可见（靠 chip 与搜索补） |
| ②纯多对多重复 | 系统在每个所属岗位分组下都出现 | 31 个系统 × 平均 2 岗位 ≈ 60 次出现，用户会以为有 60 个系统 |
| ③扁平 + 岗位筛选 | 不分组，卡上带岗位 chip，顶部一排岗位筛选器 | 丢掉"按岗位看"的分组感，50 个岗位的筛选器本身很长 |

**已采纳 ①（§0 D2）。** 它同时满足"按岗位分类"（分组）与"一张卡一个事实"（不重复）。

实施细节（① 的完整定义）：

- `role-map.json` 每条形如 `{ "slug": "video", "primary": "AGT-031", "also": ["AGT-030"], "why": "…一句理由…" }`
- 抽屉**默认视图**：按 `primary` 分组，组头显示 `AGT-031 绘影 · 视觉视频与素材生产`，
  组内是系统卡；**每个系统只出现一次**。
- 卡上岗位区显示 `AGT-031 绘影 +1`，点 `+1` 展开其余岗位；点任一岗位 chip → 跳到该岗位分组。
- 搜索命中「兼属岗位名」时，该系统**出现在结果里**（尽管它不在那个分组下）——
  这是"兼属关系在默认视图里不可见"的补救。
- 分组顺序：沿用 role-matrix 的两层分类（组织平面 → 责任域 → 岗位编号），不另造一套顺序。

### 4.4 源页面 5 类要不要保留（本轮默认不做）

源页面的 5 类是这个站**自己的**分类，与岗位是两套正交的轴。本轮默认**不进 UI**：
两个分类轴同时出现在一个抽屉里，用户会分不清"这个分组是按岗位还是按类别"。
`sourceCategory` 字段**仍然抓进 catalog**（不丢事实），留给 P6.1 需要时再上。

### 4.5 卡片上显示什么（建议）

沿用源页面的信息密度，去掉源页面没有的承诺：

```
┌──────────────────────────────────────────┐
│ [icon]  中文名                      [类型] │  ← 类型 chip：Docker 应用/静态站点/静态报告
│         英文名                              │
│  中文简介（1–2 行，超出省略）                  │
│  [技术标签] [技术标签]                       │  ← 原 chips 去掉类型那一个
│  ─────────────────────────────────────    │
│  岗位 AGT-031 绘影  +2                     │  ← 全量岗位 chips，多出 2 个折叠
│                              [ 打开系统 → ] │  ← 动作文案沿用 card-cta
└──────────────────────────────────────────┘
```

**诚实状态**：入口即登录页的系统（`mkt`/`shopify` 等）**必须在卡上标出来**（如「入口需登录」），
不能让人以为点开就是工作台。状态来自**离线巡检脚本**的结果写进 catalog，不在渲染时探测。

### 4.6 岗位映射怎么产出（本方案的唯一人工工件）

- 输入：31 个系统的中文/英文名 + 简介 + 源类别；
  50 个岗位的 `name` + `description`（含责任域，如 `【业务运营·品牌与增长】`）。
- 方法：对每个系统，先按**责任域**筛候选岗位，再按**标准产物**对齐（岗位 description 里写了标准产物，
  如 `AGT-031 绘影…标准产物：带版本的渠道素材包` ↔ `AI 原生视频系统`）。
- 产出：`role-map.json` 初稿（每系统 1 主 + N 兼属 + 一句理由），**交你审**。
- 可断言：每个系统至少 1 个岗位；每个岗位 id 必须在 `agt-001..050` 内存在（无悬空）；
  50 个岗位里至少 K 个被用到（否则说明映射漏了整片责任域）。

---

## 5. 执行 TODO

> 纪律沿用仓库既有约定：**每步先 Red 再 Green**（新断言在旧代码上必须先失败）；**未跑就写「未运行」**。

### P0 · 决策收口 ✅ 已完成（2026-09-13）
- [x] T0.1 裁决四项分叉 → 见 §0（B / ① / 快照 / 默认浏览器）
- [x] T0.2 裁决点开方式 → 系统默认浏览器新开，不做 iframe
- [ ] T0.3 凭据落地：写入 DSH 凭据服务（键名建议 `LUTE_PORTAL_SESSION`）——
      **待你在设置页写入**；本轮对话里已出现明文口令，建议用后即改
- [ ] T0.4 开工前确认：源页面 5 类是否保留为二级筛选（默认不做，见 §4.6）

### P1 · 数据层（可独立验收，不碰 UI）
- [x] T1.1 定 `catalog/systems.json` schema（`slug/name/nameEn/desc/descEn/tags/kind/href/cta/sourceCategory/loginRequired`）
- [x] T1.2 写 `scripts/sync-systems.mjs`：登录（凭据来自凭据服务）→ 抓 `/systems.html` → 解析 → 写 catalog；
      **解析器必须对 31 张卡逐一断言**（字段非空、href 唯一、域名在 `*.lute-tlz-dddd.top` 白名单内）
- [x] T1.3 写 `scripts/probe-systems.mjs`：离线巡检 31 个域名的可达性 + 是否登录页，结果写回 catalog
- [x] T1.4 产 `catalog/role-map.json` **初稿**（31 系统 × 岗位，附一句理由）→ **交你审**
- [x] T1.5 映射校验单测：无悬空岗位 id / 无未映射系统 / 每组非空

**验收判据**：`node scripts/sync-systems.mjs --check` 重跑后 git diff 为空（幂等）；
`role-map` 校验单测全绿；`systems.json` 恰好 31 条且 href 全唯一。

### P2 · 契约层（纯函数，无浏览器也能断言）
- [x] T2.1 扩展开卡动作：新增外链一档（`{level: 0, kind: 'url', href}`）——
      它**恒成立**，因此不违反"点开必能用"
- [x] T2.2 卡片视图类型加 `kind: 'product' | 'system'`，两者**共用** `CardView` 的六项字段布局
- [x] T2.3 写 `planSystemsGrouping()` 纯函数：`(systems, roleMap, roles) → [{roleId, roleName, systems[]}]`
      —— 分组顺序、空组丢弃、未知岗位降级全部在这里，可测

**验收判据（先 Red）**：在旧代码上，`planOpen({kind:'url', href})` 必须返回 `level 3 disabled`
（证明新断言非空转）；实现后返回 `level 0 url`。分组函数：31 条进 → 分组后总数 = 31（不重不漏）。

### P3 · 渲染层（落点已定为 B：改 `dsh-newapp-local`）
- [x] T3.1 `NewAppPanel.tsx` 在现有「产品」区块**下方**新增「业务系统」区块；
      产品区块的渲染逻辑**一行不改**（ADR-0045 目标函数原样保留）
- [x] T3.2 新的 host 路由 `GET /api/dsh-newapp/systems`（只读 catalog + role-map，
      **不发网络请求、不读预设目录以外的任何东西**）；`COMPOSED_SOURCES` 相应登记
- [x] T3.3 岗位分组头：复用 role-matrix 的两层分类读法（组织平面 → 责任域 → 岗位编号）
- [x] T3.4 卡片：§4.5 的字段与状态徽标（含「入口需登录」）；岗位 chips；「打开系统 →」按钮；
      **与产品卡视觉上可区分**（不同按钮文案 + 类型徽标），且**不共用**产品卡的禁用态
- [x] T3.5 搜索：沿用现有 `search.placeholder` 写法（名称 / 英文名 / 岗位 / 域名），
      并覆盖"兼属岗位"命中（§4.3）
- [x] T3.6 点击 → 系统默认浏览器打开（宿主既有能力），**不做 DOM 兜底**；
      打开失败必须在按钮旁写原因，不用 tooltip
- [x] T3.7 文案进 `locales.ts`（zh 为键源，en 镜像每一个键）；
      新词「业务系统」不得与既有「产品」「岗位」二词混用

**验收判据**：真实 Chrome 里抽屉打开 → 上分区产品卡数与改前**逐字相同**（回归），
下分区渲染 31 张卡；分组数 = 被使用的主岗位数；搜索"岗位名"命中该组全部系统；
点任意卡 → 默认浏览器打开**正确** URL（31 条逐条比对，不抽查）。

### P4 · 装配与门禁
- [x] T4.1 包元数据三字段（`luteOrigin: self` / `luteOwner: lute` / `lutePublish: false`）与 `cordis.patch.yml`
- [x] T4.2 profile 本地装配（`dsh.profile.bundles` + `dependencies`），按 ADR-0061
- [x] T4.3 **装载点字节**核对（ADR-0054：仓库改完 ≠ 生效，判据是 `~/.dsh/profiles/desktop/node_modules/<包>/lib/client.js` 的字节）
- [x] T4.4 `pnpm run gate` & `pnpm run gate:full` → **22/22，exit 0**
- [x] T4.5 **实况探针** `scripts/acceptance/newapp-systems-live.mjs`（`pnpm run accept:newapp-systems`）：
      真 curl 打真 HTTP，补单测结构上答不了的四件事——产物里有没有这两条路由、catalog 有没有
      真的被内联进 `lib/index.js`、栅栏包没包住**会开浏览器的动作路由**、`open-system` 的输入
      词汇是不是只有那 31 个 slug。退出码三态（0 全绿 / 1 真失败 / **3 = A–C 全绿但 D 因宿主
      未重启无法判决**）。**成功路径故意不打**（会真的弹浏览器），由人点一次验收。
      交付时实测 **32/32、exit 3**；**宿主重启后转 34/34、exit 0**（终态读数见本文 §0
      「重启后实况读数」与 `acceptance/newapp-systems-live.json`）；变异测试与探针自身的三个错见 Note。

### P5 · 留痕
- [x] T5.1 ADR：登记对 **ADR-0045** 的修订（§3 的写法定稿逐字进 ADR）；ADR-0033 不受影响（产品卡的 preset 必填规则不变）
- [x] T5.2 Note：`docs/notes/implemented/surface/2026-09-13-newapp-systems-section.md`
      （必备 `## Problem` / `## Decision` / `## Alternatives considered` / `## Consequences`）
- [x] T5.3 `docs/adr/README.md` 登记；本 plan 状态改为 `implemented` 并写实测读数；
      **并写明 `dsh-newapp-local` 的身份变化**（从"不拥有任何事实"→"拥有一份 catalog"，§3 边界 3）

### P6 · 可选（默认不做，等你点名）
- [ ] T6.1 二级轴：源页面 5 类作为**次要**筛选器（与岗位分组并存的第二个视图）
- [ ] T6.2 从 `VOA/_current/05_Assets/…五维介绍汇总.md` 补"成熟度 M0–M4"与"优化方向"进卡片详情
      —— **注意它是 24 个 / 2026-07-02 的过期材料**，要用必须先复核
- [ ] T6.3 定时巡检（可达性变化告警）

---

## 6. 风险与红线

| # | 风险 | 处置 |
| --- | --- | --- |
| R1 | **凭据**：portal 账号密码 | 只进 DSH 凭据服务；不进仓库/不进 profile `package.json`/不进任何 md 或脚本（AGENTS.md 红线）。**本轮对话已出现明文口令。** |
| R2 | 面板打开时联网 → 断网变空、站点抖动变慢 | catalog 进包内（快照）；探测只走离线脚本 |
| R3 | 31 个域名是**别人的运行事实**，会漂移（下线/改名/换登录） | catalog 里记 `probedAt`；卡上状态**如实**显示，不谎称"打开就能用" |
| R4 | 违反 ADR-0045 冻结的目标函数 | 要么登记修订（选 A/B），要么不动该面（选 C/D） |
| R5 | 把"外链卡"和"产品卡"混在一张网格里，用户分不清哪个"点开直接跑" | 分区 + 卡片类型徽标；两种卡的按钮文案不同（「打开系统 →」vs「打开」/「开会话」） |
| R6 | 岗位映射是人工判断，会主观 | 每条带一句理由；映射文件单独成家、可评审、可被单测约束 |
| R7 | 装载点漂移（改完没生效） | 按 ADR-0054 用装载点字节验收，不用"文件在不在" |

---

## 7. 裁决记录

四项分叉已于 2026-09-13 全部裁决，结果见 **§0**；本节只留一项待你一句话确认：

- **源页面的 5 类分类**要不要作为二级筛选保留？（默认**不做**，见 §4.6；
  字段仍抓进 catalog，随时可上）
