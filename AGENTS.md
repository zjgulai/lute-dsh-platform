# AGENTS.md · LUTE Agentic System（DSH 二开平台）

本仓库是 DeepSeek Harness（DSH Desktop）的二次开发平台。以下是**每个会话都要在上下文里的常驻规则**，每条只给结论与归属地；详细内容一律在被链接的文档里，不要在此复述。

## 基座与红线

- **基座只 pin 不改**：`deepseek-harness` 与 `vendor/dsh-desktop` 均为 pin 的只读参照（[ADR-0008](docs/adr/ADR-0008.md)）；补丁与 pin 的实际契约在 `vendor/dsh-desktop.pin`，改 pin 必须与行为变更分开提交。
- **版本跟进走观察窗**：上游新稳定版先观察 2 周，仅红线触发才跟进（[ADR-0006](docs/adr/ADR-0006.md)）。
- 架构红线（凭证不落仓库、不碰 shadows-shipped-ui slot、编辑工具会打破 `file:` 硬链接须 tmp+mv 同步、**官方 UI 改写锚禁止钉哈希**）见 [docs/architecture.md](docs/architecture.md) 第 2 节。

## 改动的验收方式

- **一条命令给证据**：`pnpm run gate`（提交前）与 `pnpm run gate:full`（推送前）；退出码即契约，见 [docs/architecture.md](docs/architecture.md) 第 4 节。
- **门禁是硬门槛**：契约级校验一律阻塞；存量未达标的包登记在 `scripts/gates/exemptions.json`，该文件**只减不增、到期即拒绝**（[ADR-0014](docs/adr/ADR-0014.md)）。
- **不接受口头验收**：改动必须给出真实命令输出（Red/Green、构建、浏览器验收），未跑就写「未运行」。

## 决策与文档

- **非机械改动必须留痕**：同一次提交附一篇决策记录 Note（`docs/notes/{lifecycle}/{class}/yyyy-mm-dd-topic.md`，必备 `## Problem` / `## Decision` / `## Alternatives considered` / `## Consequences`），对应 ADR 编号登记在 `docs/adr/`（[ADR-0015](docs/adr/ADR-0015.md)）。
- **一份事实只有一个家**：同一结论只写一处，其余位置留相对 Markdown 链接；链接可达性由门禁校验（[ADR-0009](docs/adr/ADR-0009.md)）。
- 文档分层：本文件（常驻规则）→ [docs/architecture.md](docs/architecture.md)（有序地图）→ `docs/notes/`（决策）→ 各能力组 README（包契约）。索引见 [docs/README.md](docs/README.md)。

## 目录与归属

- 插件按能力归入 5 组：`capabilities/` `surfaces/` `platform/` `contract/` `infra/`（[ADR-0011](docs/adr/ADR-0011.md)）。
- 包的治理性质写在 `package.json` 的 `luteOrigin` / `luteOwner` / `lutePublish` 三字段里，`npm-pinned` 的包不在本仓库内（[ADR-0010](docs/adr/ADR-0010.md)、[ADR-0012](docs/adr/ADR-0012.md)）。
- 当前重构分期与本次范围见 [.scratch/lute-refactor/spec.md](.scratch/lute-refactor/spec.md)。
