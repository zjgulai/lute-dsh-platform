# 2026-09-17 · Codex Desktop 视觉语法与默认风格

关联：[ADR-0104](../../../adr/ADR-0104.md)、[ADR-0019](../../../adr/ADR-0019.md)、[ADR-0098](../../../adr/ADR-0098.md)

## Problem

项目页面目前由多个 surface package 和注入式入口组成，颜色、卡片、间距、信息密度、抽屉和设置体验没有
统一约束。用户明确指出旧后台感、卡片过多、层级混乱、颜色廉价、页面不一致以及抽屉/设置体验差，并要求
先复刻当前 Codex Desktop 的调性，再做业务页面布局迁移。

这次改造必须同时满足几个边界：保留 LUTE/DSH 品牌与业务色，第一阶段不改变业务信息架构，支持浅色/深色/
系统三态，不修改 vendor 基座，不引入第二套运行时设计系统，并且能在现有 dirty worktree 中与 Settings
Shell 的已完成安全边界共存。

## Decision

- 采用「基础画布 → 内容面板 → 顶层抽屉/弹层」三层空间结构。装饰性卡片不再作为默认容器，卡片只承载语义、
  状态或操作边界；默认工作密度为中高密度。
- 视觉 token 由 `dsh-theme-local` 单一持有。默认模式跟随系统，同时保留浅色和深色显式切换；浅色使用
  中性浅灰绿画布与可访问的 LUTE 绿色变体，深色使用深绿灰画布与更明亮的 LUTE 绿色。业务色只作为强调、
  选中、主操作和状态色。
- 字体、层级、间距、圆角、控件、边界和动效按统一基线推进：系统无衬线 + 等宽元数据，四级层级，
  150–220ms 的轻动效，并支持 reduced motion。页面只消费语义 token。
- `dsh-ui-polish-local` 继续承担受限的壳层校准，不扩张为新的 design-system runtime。Settings 继续以
  parser-owned marker、独立 AX 校准和现有工作树实现为第一规范样本；本次不覆盖这些变更。
- 页面迁移采用 Settings → 抽屉/Composer/空会话 → Team Hub 与业务页的顺序。每个批次必须同时留下自动化、
  固定状态截图和人工评审证据；离线证据不冒充 live GUI 验收。

本批实际落实 `dsh-theme-local` 的默认浅色/深色调色板、Codex 预设一致性测试，以及 Settings Shell 的主题
语义 token 接入、固定分组导航、单一内容滚动区、180ms 动效和 reduced-motion 降级；保留两个包的构建产物。
Settings 内各业务 section 的标题/说明、扁平表单行和危险区，以及后续页面布局迁移仍按后续批次推进。

## Alternatives considered

- 逐页自定义主题：会继续产生多套颜色和密度，不能解决一致性问题。
- 新建独立 design-system runtime：增加 token 双源、运行时和发布面，当前已有主题包无需承担这项风险。
- 像素级复制 Codex Desktop：会越过品牌、业务语义和官方基座边界，不符合用户要求。
- 一次性重排信息架构：无法隔离视觉问题，且会扩大数据、路由和权限回归面。
- 只做深色或继续沿用蓝色默认主题：无法满足系统跟随、浅色基线和 LUTE 品牌调性。

## Consequences

- 默认主题拥有稳定的中性画布、内容面板、侧栏、前景和强调色基线；浅色/深色可由同一组语义 token 表达。
- `dsh-theme-local` 与 `dsh-settings-shell-local` 的 typecheck、测试、build 已通过；主题 token acceptance 与
  Settings Shell 自检通过，包级 Settings suite 为 49/49。
- 本批初始 `pnpm run gate` 为 76/78 通过、2 项环境跳过、0 项失败；本次没有修改门禁逻辑。修正导航宽度归属
  后，Settings criteria 独立自检为 9/9 通过；最新聚合 gate 的剩余失败是共享工作树中另一个任务新增 ADR-0105
  的索引与 Note 链接未完成，未将该问题归因于本批 UI 改动。
- Settings bundle 已按 tmp+mv 同步到当前 loadpoint，24/24 包一致；已按用户授权重启 DSH Desktop。
  重启后重新运行 `pnpm run accept:settings-shell` 已通过：导航校准 raw=226 AX px / 188 CSS px，18 项导航
  独立滚动，末项 39.53 CSS px，面板 950.4 CSS px，分组标题 5/5，Settings 已关闭。此前的
  `nav-candidate-missing` 根因是两列 flex 几何未固定；本次补齐面板宽度、内容列 `min-width:0`，并消费
  upstream 已定义的 188px 导航轨道（Shell 不重复改写校准宽度），状态更新为
  `instrument verified, live verified`。
- 当前文档和代码均写入共享 dirty worktree，未提交；现有未解释的用户变更保持原样。
