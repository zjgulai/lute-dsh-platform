# 受管包目录墙

本文件由 `scripts/gen-catalog.mjs` 从各包 `package.json` 生成，**请勿手改**——手改会被门禁 `catalog-fresh` 拒绝（ADR-0011）。

受管包总数：**24**。分组规则见 [docs/architecture.md](../architecture.md#0-仓库构成与门禁2026-09-11-起) 与 [ADR-0011](../adr/ADR-0011.md)。

| 组 | 目录 | 包名 | 来源 | owner | 发布 npm |
| --- | --- | --- | --- | --- | --- |
| capabilities | `packages/capabilities/dsh-browser-local` | `@yuxianglin/dsh-bridge-browser` | `internalized` | `@yuxianglin` | `false` |
| capabilities | `packages/capabilities/dsh-deepresearch-local` | `@deepseek-ai/dsh-deepresearch` | `internalized` | `@deepseek-ai` | `false` |
| capabilities | `packages/capabilities/dsh-loopx-plugin` | `dsh-loopx-plugin` | `self` | `lute` | `true` |
| capabilities | `packages/capabilities/dsh-overseas-skills` | `dsh-overseas-skills` | `self` | `lute` | `false` |
| capabilities | `packages/capabilities/dsh-overseas-tools` | `dsh-overseas-tools` | `self` | `lute` | `false` |
| capabilities | `packages/capabilities/dsh-paper2skills` | `dsh-paper2skills` | `self` | `lute` | `false` |
| capabilities | `packages/capabilities/dsh-wanzh-hulian` | `dsh-wanzh-hulian` | `self` | `lute` | `false` |
| surfaces | `packages/surfaces/dsh-agent-team-gui-local` | `dsh-agent-team-gui` | `internalized` | `@deepseek-ai` | `false` |
| surfaces | `packages/surfaces/dsh-algo-skills-local` | `dsh-algo-skills-local` | `self` | `lute` | `false` |
| surfaces | `packages/surfaces/dsh-my-quotes` | `dsh-my-quotes` | `self` | `lute` | `false` |
| surfaces | `packages/surfaces/dsh-newapp-local` | `dsh-newapp-local` | `self` | `lute` | `false` |
| surfaces | `packages/surfaces/dsh-role-matrix-local` | `dsh-role-matrix-local` | `self` | `lute` | `false` |
| surfaces | `packages/surfaces/dsh-skill-center-local` | `dsh-skill-center-local` | `self` | `lute` | `false` |
| surfaces | `packages/surfaces/dsh-task-board-local` | `@etony668/dsh-task-board` | `internalized` | `@etony668` | `false` |
| platform | `packages/platform/dsh-auto-compact-local` | `@deepseek-ai/dsh-auto-compact` | `internalized` | `@deepseek-ai` | `false` |
| platform | `packages/platform/dsh-file-upload-local` | `dsh-file-upload` | `self` | `lute` | `false` |
| platform | `packages/platform/dsh-rename-conversations` | `dsh-rename-conversations` | `self` | `lute` | `false` |
| platform | `packages/platform/dsh-root-brand-local` | `dsh-root-brand` | `self` | `lute` | `false` |
| platform | `packages/platform/dsh-theme-local` | `dsh-theme` | `self` | `lute` | `false` |
| platform | `packages/platform/dsh-ui-polish-local` | `dsh-ui-polish` | `self` | `lute` | `false` |
| contract | `packages/contract/dsh-preset-lint-local` | `dsh-preset-lint-local` | `self` | `lute` | `false` |
| contract | `packages/contract/dsh-skill-subset` | `dsh-skill-subset` | `self` | `lute` | `false` |
| infra | `.` | `lute-agentic-system` | `self` | `lute` | `false` |
| infra | `packages/infra/dsh-team-hub` | `dsh-team-hub` | `self` | `lute` | `false` |

## 分组统计

| 组 | 包数 |
| --- | --- |
| capabilities | 7 |
| surfaces | 7 |
| platform | 6 |
| contract | 2 |
| infra | 2 |
