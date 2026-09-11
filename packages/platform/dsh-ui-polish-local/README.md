# dsh-ui-polish（LUTE 本机 UI 微调）

DSH Desktop 2.0.5 客户端纯 CSS 微调插件。零改动 app bundle 字节，装载走 profile
`dependencies(file:)` + `dsh.profile.bundles` 双条目（与 dsh-root-brand 同一成熟路径）。

## 生效内容（2026-09-11 收敛）

1. **正文宽度 748 → 960px**：覆盖 `--dsh-chat-content-width`，聊天列/输入卡/审批卡联动。

> 历史：滚动条透明/移除实验（v1–v7）已按用户决定撤销——主题滚动条渲染路径无法被
> 外部插件 CSS 稳定覆盖；诊断横幅已移除。若未来重试，关键教训：核心右列真实类名是
> `sidebarCol`（非 detailsCol），且滚动条可能被运行时主题以更高优先级通道渲染。

## 锚点清单（升级 DSH 后复查）

| 锚点 | 位置 | 复查方法 |
| --- | --- | --- |
| `--dsh-chat-content-width` | dsh-client-ui-chat 消费（748px 回退） | grep `chat-content-width` |

## 回滚

- 完全移除：profile package.json 删 `dependencies` 与 `bundles` 两条目 →
  `pnpm install --no-frozen-lockfile` → 重启。
- 只回宽度：改本文件 `960px` → `748px` 后按下方同步 → Cmd+R。

## 修改同步（硬链接纪律）

编辑 `lib/*.js` 后：`node --check` → `cp` 同步到
`~/.dsh/profiles/desktop/vendor/dsh-ui-polish-local/lib/` 与
`~/.dsh/profiles/desktop/node_modules/dsh-ui-polish/lib/`（三处一致）→ Cmd+R。
