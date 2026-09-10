# rc-eval 轨道手册（D 轨道操作手册）

> 目标：在完全隔离环境运行官方 DSH Desktop 2.0.5（runtime 0.1.2-rc.1）验证插件兼容性。
> 生产环境（/Applications/DSH Desktop.app + ~/.dsh）零接触。

## 环境布局

| 项 | 路径 |
|---|---|
| RC app 副本 | `~/Applications/DSH Desktop RC.app`（官方 2.0.5 universal DMG 解包，已除 quarantine） |
| DSH_HOME | `~/.dsh-rc-eval/` |
| Electron userData | `~/.dsh-rc-eval/.electron-userdata/`（userData 隔离补丁） |
| rc-eval profile | `~/.dsh-rc-eval/profiles/desktop/`（6 个 ⛔ 插件最新版） |
| 日志/生命周期 | `~/.dsh-rc-eval/.electron-userdata/{logs,lifecycle-events}/` |
| DMG 缓存 | `/tmp/dsh-rc-eval/DSH.Desktop-2.0.5-universal.dmg` |

## 关键补丁（RC 副本独有，勿动生产）

- `lib/main.js`：`requestSingleInstanceLock()` 前注入
  `if (process.env.DSH_HOME) app.setPath("userData", process.env.DSH_HOME + "/.electron-userdata");`
  —— 无此补丁时 RC 与生产共享 userData，被单实例锁静默击杀（实证两次）。
- 备份：`lib/main.js.rc-eval-orig`。

## 启动 / 停止

```bash
# 启动（可与生产 app 并存）
DSH_HOME="$HOME/.dsh-rc-eval" nohup "$HOME/Applications/DSH Desktop RC.app/Contents/MacOS/DSH Desktop" > /tmp/rc-eval-launch.log 2>&1 &

# 验证健康
tail -1 "$HOME/.dsh-rc-eval/.electron-userdata/lifecycle-events/startup.jsonl"
# 期望：startup.run.completed + finalStage=health-commit + rendererStatus=healthy

# 停止（只杀 RC：路径含 "DSH Desktop RC.app"）
pkill -f "DSH Desktop RC.app" || true
```

## profile 维护（rc-eval）

```bash
cd ~/.dsh-rc-eval/profiles/desktop
# 重要：pnpm-workspace.yaml 必须保留 autoInstallPeers: false（rc 生态 peer 范围在 npm 上不可解析）
"/Users/lute/Library/Application Support/DSH Desktop/runtime-commands/bin/pnpm" install
# 加插件：package.json dependencies + dsh.profile.bundles 两处，再 pnpm install + 重启 app
```

## 重置

```bash
rm -rf ~/.dsh-rc-eval ~/Applications/"DSH Desktop RC.app"
# 即完全还原（生产零影响）
```

## 已知事实

- setup-wizard 由 `<userData>/profile-setup/<sha256(profileDir)>/state.json` 的 outcome=skipped 抑制。
- vision-router 2.1.4 peer 追 0.1.3-alpha.2、noema 0.1.0-rc.3 peer 追 0.1.0-rc.6：跨代共存，验证矩阵已标记。
- Electron 43.3.0（与 2.0.4 相同），Node v24.18.1。
