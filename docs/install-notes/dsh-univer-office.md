# dsh-univer-office 本地说明（安装于 2026-09-11）

- 来源：npm `dsh-univer-office@0.2.14`（GitHub dream-num/dsh-univer-office，commit 62df970）
- 安装位置：desktop profile（package.json dependencies + dsh.profile.bundles 双条目）
- 快照：`~/.dsh/profiles/desktop/package.json.bak-20260911-092015`（及 pnpm-lock 同刻备份）

## 使用方法
1. 对话中让模型操作 .univer 文件（表格/文档/幻灯片/画布/关系表）——8 个随包技能自动生效
   （univer-sheet / doc / slide / board / base / embed / cross-unit-formula / univer）。
2. GUI 侧：内联预览、Worktree 浮窗、会话结束审查动作；插件设置页（univer-office）可调端口与网关。
3. 网关为按需启动：首次文件操作时监听 localhost:9080（默认）。

## 相关说明
- 遥测：已双保险关闭——settings.yaml `univer-office.telemetry:false`（配置级，重启生效）+ `~/.dsh/telemetry/dsh-univer-office/state.json` 置 `disabled:true`（即时生效）。
  注意：安装激活瞬间（09:25:57）已上报过 activate/daily_active 两事件（端点 univer.ai/api/telemetry/cli），此后不再上报。
- 原生绑定：rust 公式引擎 / exchange / libsql 均 darwin-arm64 预编译，无构建脚本。
- 依赖版本与宿主全对齐（cordis 4.0.2 / schemastery 3.18.2 / dsh-* 0.1.2-rc.1），零版本漂移。

## 更新 / 回滚
- 更新：改 package.json 版本号 → `"$HOME/Library/Application Support/DSH Desktop/runtime-commands/bin/pnpm" install` → 重启桌面。
- 回滚：`cp package.json.bak-20260911-092015 package.json` + `cp pnpm-lock.yaml.bak-20260911-092015 pnpm-lock.yaml` → pnpm install → 重启。
- 卸载：删除 package.json 两条目（dependencies + bundles）→ pnpm install → 重启；遥测残留 `~/.dsh/telemetry/dsh-univer-office/` 可删。

## 迭代优化方向
- 关注上游 0.2.14+ 版本对 darwin-x64 的支持（当前仅 arm64）。
- 网关端口 9080 若与本地服务冲突，在插件设置页改 gatewayPort。
- 截屏功能首次使用可能下载 Chromium（@puppeteer/browsers），体积约百 MB。
