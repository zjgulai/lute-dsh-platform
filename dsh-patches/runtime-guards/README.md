# runtime-guards 补丁（G1 HMR 生产守卫 + G2 console 转发）

2026-09-13 白屏事故的机制修复与可观测性修复。幂等脚本，锚点 count==1 才落笔。

## 用法

```bash
DSH_APP="/Applications/DSH Desktop.app" bash apply-fixes.sh apply
DSH_APP="/Applications/DSH Desktop.app" bash apply-fixes.sh --check
DSH_APP="/Applications/DSH Desktop.app" bash apply-fixes.sh --verify-anchors
DSH_APP="/Applications/DSH Desktop.app" bash apply-fixes.sh --rollback
```

- `apply`：打 G1（`dsh-client-hmr/lib/index.js`）+ G2（`electron-runtime-*.js`），已打补丁则跳过，首次自动备份 `.orig`。
- `--check`：只报告状态。
- `--verify-anchors`：对 `.orig` 基线验证锚点唯一——**基座升级后必跑**，漂移时手工适配锚点。
- `--rollback`：从 `.orig` 还原（还原后需重签 + 完整重启）。

## 生效

G1/G2 都是主进程/宿主侧代码，**Cmd+R 无效，必须完整重启**。改完 `codesign --verify --strict` 应通过；若失败，用 `LUTE Code Signing` 证书重签（`codesign --force --deep --sign "LUTE Code Signing" <app>`）。

## 打包

`packaging/assemble.sh` 在 brand-replay 后强制重放（缺失即失败）；脚本随包分发到 `tools/runtime-guards/`。决策记录见
`docs/notes/implemented/architecture/2026-09-13-hmr-production-guard.md`。
