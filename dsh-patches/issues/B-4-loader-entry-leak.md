# [Medium] cordis-plugin-loader: EntryGroup.update 在 fiber 销毁中途泄漏 entry

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x

## 证据
- `cordis-plugin-loader/lib/index.js:86-93`：`Promise.allSettled(create)` 后 `if (this.ctx.fiber.uid === null) return;` 提前返回——不回滚已创建 entry、不写入 `this.data`，后续 `stop()`（遍历 `this.data`）永不释放这些 entry/fiber。

## 建议修复
提前返回前回滚本次创建的 entry。
