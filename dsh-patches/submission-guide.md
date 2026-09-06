# 上游投稿清单（仓库映射 + 标签建议）

> 对应 `issues/` 目录的 19 份 issue + 1 份 PR diff。按优先级顺序投递。
> 复制 issue 正文 → 打开目标仓库 New Issue → 粘贴 → 按建议加标签。

## 投递映射

| 优先级 | 文件 | 目标仓库 | 建议标签 |
|---|---|---|---|
| 1 | A-1-update-installer-no-signature.md + A-1-PR-diff.md | anywhere-labs/deepseek-harness-desktop | security, critical |
| 2 | A-2-silent-profile-rollback.md | anywhere-labs/deepseek-harness-desktop | bug, data-loss |
| 3 | B-1-llm-imageRequestPricing-unguarded.md | anywhere-labs/deepseek-harness-desktop | bug, compaction |
| 4 | B-2-fiber-dispose-catch.md | anywhere-labs/deepseek-harness-desktop | bug |
| 5 | B-3-loadOlder-silent-failures.md | anywhere-labs/deepseek-harness-desktop | bug, ux |
| 6 | C-6-deepresearch-rc2-pinning.md | havingautism/dsh-deepresearch | bug, dependencies |
| 7 | A-8-overlay-preset-plane.md | anywhere-labs/deepseek-harness-desktop | architecture, loader |
| 8 | B-4-loader-entry-leak.md | anywhere-labs/deepseek-harness-desktop | bug, loader |
| 9 | B-5-inspect-query-pending-leak.md | anywhere-labs/deepseek-harness-desktop | bug, tooling |
| 10 | A-3-renderer-console-forwarding.md | anywhere-labs/deepseek-harness-desktop | enhancement, diagnostics |
| 11 | A-4-permission-handler-openExternal.md | anywhere-labs/deepseek-harness-desktop | security |
| 12 | A-5-diagnostic-export-crash-dumps.md | anywhere-labs/deepseek-harness-desktop | security, privacy |
| 13 | B-6-composer-row-wrap.md | anywhere-labs/deepseek-harness-desktop | bug, ui |
| 14 | B-7-writeClipboard-fallback.md | anywhere-labs/deepseek-harness-desktop | bug, ui |
| 15 | C-1-noema-status-ledger.md | ZSeven-W/dsh-noema | bug |
| 16 | C-2-lingshu-macos-defaults.md | FuRongJun-1999/dsh-memory | bug, macos |
| 17 | C-5-modlens-duck-adapter.md | liustack/modlens | bug, compatibility |
| 18 | B-9 compaction/token/裁剪（upstream-issues.md 内） | anywhere-labs/deepseek-harness-desktop | enhancement, context |
| 19 | B-10 小项合集（upstream-issues.md 内） | anywhere-labs/deepseek-harness-desktop | bug, polish |

## 投稿模板建议

每份 issue 已在 `issues/` 内按统一结构备好：**环境 / 证据(file:line) / 复现 / 建议修复 / 关联本地补丁**。直接粘贴即可；标题用文件内的一级标题。

## 注意

- A-1 的 PR diff（`A-1-PR-diff.md`）可作 issue 的补充评论或直接开 PR（需服务端配合下发 sha512）。
- B-9/B-10 未单列文件，正文在 `upstream-issues.md` 对应小节，投递时拆成单条 issue。
- 本地补丁证据：`patches-manifest.md` + `REGRESSION-GUARD.md` 可链接引用。
