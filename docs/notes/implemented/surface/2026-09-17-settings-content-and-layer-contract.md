# Settings content and layer contract

## Problem

右侧 sidebar 打开时会遮挡 Settings；修复其 stacking context 后，Settings 内容列仍缺少明确的单一滚动区、窄屏
重排和跨 section 的低风险控件基线。Skill Center 的 `z-index:9999` 与 Deep Research 的 `100/110` 也会继续制造
跨 surface 的浮层竞争。

## Decision

关联 ADR：ADR-0109。

在 parser-owned Settings marker 内建立 `panel → content → header/options` 结构，保留业务 section 的按钮和状态
几何，只统一内容滚动、输入控件继承/边界/焦点/禁用态、分组分隔、主题 token、窄屏布局和 reduced-motion。Skill Center
与 Deep Research 的浮层改用作用域语义层级变量及低于 Settings root 的回退值。Task Board、My Quotes、Wanzh、LoopX
等 compiled-only surface 不直接手改，转入源码入口恢复 Ticket。

## Alternatives considered

- 修改 vendor SettingsRoot：拒绝，违反 vendor 只读和官方 CSS-module hash 不稳定边界。
- 用高 specificity 覆盖所有业务按钮：拒绝，会破坏 switch、图标按钮、行内 action 的既有几何。
- 继续保留 raw z-index：拒绝，无法形成可解释的 modal/drawer 层级合同。

## Consequences

Settings shell 的 49/49 tests、typecheck、build 与 bundle validation 通过；Skill Center 84/84、typecheck/build，
Deep Research 52/52、typecheck/build 通过。改动尚未提交；profile sync 已完成，但最终统一 Desktop restart 当前停在
`electron-ready`、无可交互窗口；仍需在 macOS
解锁时完成 live GUI、浅/深/系统、键盘、Escape、reduced-motion 和固定截图验收。
