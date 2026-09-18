# Surface visual closeout and artifact boundary

## Problem

Agent Team Recipes 的 sticky footer 仍用渐变，Deep Research 项目卡通过 inline 硬编码色调绕过主题 token，Team Hub
Admin 的退出链接同时有 inline style 和 stylesheet override。另有 Task Board、My Quotes、LoopX、UI Polish 等页面
缺少可在本仓库重建的 source/build owner；Wanzh 的 client 是直接维护的 hand-written bundle。若不区分这两类 owner，
继续统一 UI 要么留下视觉方言，要么把不可维护的 compiled artifact 误当源码。

## Decision

关联 ADR：ADR-0110。

Recipes footer 改为语义 panel 背景；Deep Research 卡片移除 `CARD_TONES` / `--card-tint`，改用中性面板和业务强调
token；Team Hub Admin 移除退出入口的 inline visual style。Wanzh 的 `whRightPanel` 使用低于 Settings root 的
semantic drawer layer，并移除渐变顶条。Task Board、My Quotes、LoopX、UI Polish 保留为 compiled-only artifact，
只继续验证现有产物和合同测试，source recovery 需要后续 owner 提供完整 source/build/provenance。

## Alternatives considered

- 继续保留每个页面自己的渐变、硬编码色和 inline style：拒绝，会继续产生页面之间的不一致。
- 直接修改所有 compiled-only `lib`：拒绝，缺少可重建链，无法证明后续升级不会覆盖修复。
- 修改 vendor 或引入第二套主题 runtime：拒绝，违反项目只读基座和唯一 token owner 边界。

## Consequences

本批新增 CSS 合同覆盖 footer 无渐变、Deep Research 双主题 token、Admin 无 inline visual style、Wanzh drawer 层级
低于 Settings。相关包级测试和静态检查由各 package gate 负责；目标 Desktop 仍停在 `electron-ready`、43120 未监听，
因此 live GUI、截图、浅/深/系统、键盘和 reduced-motion 尚未宣称完成。改动已写入但未提交。
