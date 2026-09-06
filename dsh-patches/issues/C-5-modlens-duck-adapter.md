# [Medium] @liustack/modlens + dsh-vision-router: 鸭子类型 adapter 缺 imageRequestPricing

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x

## 证据
- `dsh-vision-router/lib/adapter-update-coalescer.js:7-60`：`ensureAdapterPrepareCall` 只给鸭子 adapter 补 `prepareCall`（自述「duck-typed，不继承 LlmAdapter 默认实现」），未补 `imageRequestPricing`/`providerInfo` 等。
- 后果：见 dsh-llm 的 B-1 崩溃（此适配器是直接触发方）。

## 建议修复
`ensureAdapterPrepareCall` 对缺失的 `LlmAdapter` 方法补 `() => undefined` 空实现，使鸭子 adapter 满足完整契约。
