# [High] overlay 版本覆盖对「预设平面」包惰性失效（profile override 静默无效）

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x

## 证据
- `lib/module-resolution.js`（desktop 包）的 overlay 生效条件：
  ```js
  const packageName = context.parentURL === LOADER_ENTRY_URL || context.parentURL === profileBaseUrl
    ? packageNameFromSpecifier(specifier) : void 0;
  ```
  其中 `LOADER_ENTRY_URL = import.meta.resolve("@deepseek-ai/cordis-plugin-loader")`。
- `cordis-plugin-loader/lib/index.js` 的 `EntryTree.import`：
  ```js
  if (this.ctx.loader.internal) return await this.ctx.loader.internal.import(name, this.ctx.baseUrl, {});
  ```
  以 `this.ctx.baseUrl` 为父级；对「预设平面」行（standard preset 等），`baseUrl` 是 **preset 目录 URL**，与两个门条件均不匹配。

## 复现
1. 在 `~/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-tool-subagent`（预设行包）放置版本抬升（`-override`）的补丁副本；
2. `findOverlayPackage` 决策正确返回 profile 副本（决策层无错）；
3. 但运行时代码仍执行 checkout 副本——实测：`dsh-tool-subagent/lib/index.js:622` 的 `fiber.dispose().catch` 补丁未生效，`agent/disposed listener threw: reading 'catch'` 持续出现；改「直补 checkout 副本」后消失。
4. 对照：宿主平面包（如 `dsh-llm`，父级=profileBaseUrl）的 override 正常生效。

## 影响
- 第三方/本地对**预设行核心包**的任何 profile override **静默无效**（无报错、无提示），补丁看似在位实则未加载——诊断成本极高。
- 这是「版本覆盖机制」的结构性盲区：宿主平面与预设平面不对称。

## 建议修复
1. 门条件扩展：`parentURL ∈ {LOADER_ENTRY_URL, profileBaseUrl, <任一 preset 目录 URL 前缀>}`；
   或更稳：让 loader 对预设子树也以 `profileBaseUrl`（或一个统一入口 URL）为父级导入。
2. 至少加「override 未被消费」的启动告警：当 profile 存在某包的高版本副本但实际加载的是 install 副本时，写日志（当前完全静默）。

## 关联本地缓解
manifest 已标注「预设平面包 → checkout 直补」（`dsh-tool-subagent`、`dsh-file-reference-local` 的 checkout 三处已直补）。
