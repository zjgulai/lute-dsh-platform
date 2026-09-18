# Drawer control contract

## Problem

New App、Role Matrix 和 Skill Center 都是用户从同一侧边入口打开的业务抽屉，却分别使用了不同的按钮命中区、
焦点环、卡片/列表密度、状态表达和窄屏降级方式。只改颜色无法消除这种页面方言；直接改运行时又会扩大到
路由、slot、权限和业务状态风险。

## Decision

关联 ADR：ADR-0108。

三包只修改自身 CSS 和视觉合同测试。New App 与 Role Matrix 保持现有 dialog top-layer；Skill Center 保持现有
右侧抽屉宿主。所有页面统一为中性画布、内容面板、扁平列表/分组和显式状态层级，控件采用统一命中区、
focus-visible、禁用/错误/成功态、180ms 动效、reduced-motion 和窄屏单列规则。业务色只用于选中、主操作和状态。

## Alternatives considered

- 复制新的共享组件或 design-system runtime：拒绝，违反 dsh-theme-local 的单一 token owner 边界。
- 把所有抽屉统一成一个新的宿主：拒绝，会改变已经验证的 top-layer/slot 交互契约。
- 继续让每个页面自行保留卡片、胶囊和动画：拒绝，会保留用户反馈中的页面不统一、层级混乱和信息密度问题。

## Consequences

New App、Role Matrix、Skill Center 的包级 test/typecheck/build 已通过，测试覆盖了新增的视觉合同。下一步是
profile sync 后统一重启 DSH Desktop，再取得真实浅色/深色/系统与键盘截图；锁屏或 window-off-screen 只能记录为
未取得 live 证据，不能被静态合同测试替代。
