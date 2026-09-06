# [High] dsh-deepresearch 把核心包钉在 rc.2 作真实依赖（版本混跑 + http provider 双注册根因）

## 环境
DSH Desktop 2.0.4（内置 @deepseek-ai/*@0.1.2-alpha.1）· dsh-deepresearch@0.2.2

## 证据
- `package.json` dependencies：`"@deepseek-ai/dsh-storage-sqlite": "^0.1.1-rc.2"`、`"@deepseek-ai/dsh-web-fetch-http": "^0.1.1-rc.2"` —— **真实依赖**而非 peerDependencies，把 rc 系核心包强制拉进宿主 node_modules，与 alpha 主机版本混跑。
- 后果一（http 双注册）：deepresearch 经 rc.2 的 `dsh-web-fetch-http` 注册 http fetch provider，宿主 alpha 已有同名 provider → 二次注册冲突。
- 后果二（残留守卫）：`lib/types/platform.js:11` 仍是旧守卫 `typeof web.registerFetchProvider === 'function'`（无 `!web.fetchProviders.has("http")` 检查）；`lib/index.js:1313` 已被本地补丁修正——**两处副本分叉**，任何 rebuild/子路径 import 即复活双注册。

## 建议修复
1. 核心 `@deepseek-ai/*` 移入 peerDependencies（对齐宿主 alpha 版本），或直接升级到 alpha 系；
2. 同步 `platform.js` 与 `index.js` 的守卫（并消除该逻辑的重复副本）。

## 关联本地缓解
apply-patches.mjs 第 2 条（守卫补丁）——仅缓解，根因仍在。
