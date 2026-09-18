# Management and research surface visual contract

关联 ADR：ADR-0107。

## Problem

Team Hub 的管理页、Agent Team Recipes 和 Deep Research 仍有各自的卡片、胶囊控件、状态颜色和弹层层级。
这些差异让同一产品的管理、导入校验和研究流程像三个后台产品；但它们的权限、RPC、recipe schema、
研究状态机和数据契约不能因为视觉问题被重写。

## Decision

在保留业务信息架构和行为的前提下，三类 surface 统一到「基础画布 → 内容面板 → 顶层 modal」语法：

- Team Hub admin UI 使用独立页面内的语义别名，支持系统跟随和显式 `data-theme` 钩子，统一列表、表格、
  表单、状态徽标、焦点、错误/成功态和窄屏布局。
- Recipes 将 source/editor 与 preview/validation 分成双栏，应用操作进入可达的 sticky footer；预览过期、
  warning、invalid 和成功态继续使用原有业务判断。
- Deep Research 的 library、plan、investigate、report 和 modal 共用控件高度、面板层级、状态 token、
  180ms 动效、reduced-motion 和响应式规则；移除装饰性渐变和硬编码状态色。

## Alternatives considered

- 复制一套新的共享组件 runtime：拒绝，`dsh-theme-local` 仍是唯一主题 token owner。
- 只换颜色、不改空间结构：拒绝，无法消除卡片堆叠、胶囊泛滥和状态层级混乱。
- 改动 API、权限、RPC 或研究状态机来适应新布局：拒绝，视觉迁移不应扩大业务契约风险。

## Consequences

三个包的实现与包级测试/typecheck/build 已完成，后续必须在统一 profile sync 和一次 Desktop 重启后做
真实 live GUI、浅/深/系统状态、键盘/焦点和固定截图验收。Team Hub 的 standalone admin UI 还需要浏览器
实机确认显式主题钩子是否由宿主页面实际设置；这项证据不能由 CSS 合同测试替代。
