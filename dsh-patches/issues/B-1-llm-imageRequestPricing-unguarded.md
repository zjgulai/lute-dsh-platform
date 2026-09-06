# [High] dsh-llm: imageRequestPricing 对鸭子类型 adapter 无守卫调用 → compaction 每步崩溃

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x

## 证据
- `dsh-llm/lib/index.js:1526`：`return this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model);`（`?.` 在 `.adapter` 上、不在方法上）。
- `dsh-llm/lib/index.js:1170`：基类 `LlmAdapter.imageRequestPricing` 是空实现返回 undefined（显式可选契约）。
- `dsh-llm/lib/index.js:1519-1521`：注释明言「未知 provider 降级为 undefined 而非抛错」。
- 同码第二处：`dsh-llm/lib/types/index.js:534`。

## 复现
安装任意以鸭子类型 adapter 注册视觉包装 provider 的插件（如 @liustack/modlens + dsh-vision-router，`dsh-vision-router/lib/adapter-update-coalescer.js:7-60` 只给鸭子 adapter 补 `prepareCall`）→ 压缩时定价历史路由 → `TypeError: this.adapters.get(...)?.adapter.imageRequestPricing is not a function` → `dsh-compaction-basic/lib/index.js:781-793` fail-open → **上下文从不压缩**（error.log 每 ~30s 刷屏一条）。

## 建议修复
`this.adapters.get(provider)?.adapter.imageRequestPricing?.(provider, model)`（可选调用，与基类空实现语义等价）。两处调用点同改。

## 关联本地修复
profile override `dsh-llm@0.1.2-alpha.1-override`（补丁清单 P0-3）。
