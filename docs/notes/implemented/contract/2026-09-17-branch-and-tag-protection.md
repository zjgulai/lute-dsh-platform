# main 与 v* tag 的保护：从「文档声称」到「API 证实」

- 日期：2026-09-17
- 卡：QG-008（Branch ruleset、required checks 与 tag 保护）
- ADR：[ADR-0106](../../../adr/ADR-0106.md)（更正了 [ADR-0001](../../../adr/ADR-0001.md) 的一处失实声明）
- 前序：[2026-09-17-ci-workflow-contract-and-clean-runner-simulation](2026-09-17-ci-workflow-contract-and-clean-runner-simulation.md)（QG-007）

## Problem

QG-008 的目标是「`main` 和发布 tag 不能绕过已建立的检查」。开工时的实测：

```
$ gh api repos/zjgulai/lute-dsh-platform/rulesets
[]

$ gh api repos/zjgulai/lute-dsh-platform/branches/main/protection
{"message":"Branch not protected","status":404}
```

而两处文档**声称**保护已经存在：`docs/adr/ADR-0001.md` 与 `docs/release-process.md` 都写着「main 分支保护」。
这正是本仓库总账里那条「把意图写成事实」——没有机制守着的声明，读起来与已生效的声明一模一样。

同时，QG-007 的 workflow 虽然本地写完，但**不在远端**：`.github/` 下只有 `pull_request_template.md`，
`GET /actions/workflows` 返回 `total_count: 0`。所以「稳定检查名 + 一次成功运行」这个前置条件当时也不满足。

## Decision

见 [ADR-0106](../../../adr/ADR-0106.md)。落地：

1. `scripts/gates/ruleset-declaration.json`：声明 `main` 与 `v*` tag 上应当存在的规则（唯一事实之家）。
2. `scripts/gates/ruleset-audit.mjs`：纯比对逻辑（真实读数 vs 声明），只读。
3. `scripts/gates/audit-rulesets.mjs`：只读 CLI，退出码 0/1/2 = 全等 / 不符 / **拿不到读数**。
4. `scripts/gates/apply-rulesets.mjs`：由声明推导 payload，默认 dry-run，`--apply` 才写远端。
5. `scripts/gates/ruleset-audit.test.mjs` + `fixtures/rulesets-live.json`：15 条反向自测，基线是**真实 API 读数**。
6. 门禁新增 `ruleset-declaration-selftest`（quick）与 `ruleset-audit`（L2 只读，无读数时类型化 skip）。

## Consequences

### 远端变更（全部有据可查、可回滚）

| 变更 | 值 |
|---|---|
| workflow 文件 | 用 GitHub API 推到 `main`，提交 `623404375e95`（base `cc6f1ac`） |
| `main-protection` ruleset | **id 23564403**，target=branch，enforcement=active |
| `release-tag-protection` ruleset | **id 23564404**，target=tag，enforcement=active |
| 变更前快照 | rulesets = `[]`；main protection = 404。恢复方式：删掉这两条 ruleset 即回到变更前 |

### API 自己给出的执行证据（不是「配置看起来对」）

```
$ gh api -X PATCH repos/…/git/refs/heads/main -F sha=<HEAD~1> -F force=true
422  Cannot force-push to this branch
     Changes must be made through a pull request.
     2 of 2 required status checks are expected.

$ gh api -X DELETE repos/…/git/refs/tags/v2.4.1
422  Cannot delete this tag

$ gh api -X PATCH repos/…/git/refs/tags/v2.4.1 -F sha=<HEAD> -F force=true
422  Cannot update this protected ref.
```

三条都是**服务端拒绝**，不是本机判断。审计随后与声明全等：

```
$ node scripts/gates/audit-rulesets.mjs
ok 保护面审计（ok，证据层级 L2-readonly-api）
     API 返回 2 条 ruleset：main-protection#23564403、release-tag-protection#23564404
     required check：gate (full)、gate (quick)
```

### 实施中踩到并修掉的两处

**一、判据读错了端点。** `GET /rulesets`（列表）刻意只返回摘要，**不带 `conditions` 与 `rules`**。
第一版拿列表去比对，于是逐条报「API 里没有任何 ruleset 覆盖这个 ref」——而此刻保护**已经生效**。
判据读错端点会把「保护在」判成「保护不在」，方向与它该防的正好相反。改为先列后详，
并把「列表端点的形状必须判红」写成一条负例（基线用真实摘要裁出来）。

**二、门禁自己的判据抓住了我的新代码。** `runRulesetAudit()` 第一版用
`spawnSync(process.execPath, …)` 起子进程，被 `node-interpreter` 判红：
「在 pnpm 下它是宿主 Electron，子进程会『退出码 0 且没有输出』」（ADR-0040 / P-02）。
改用 `nodeCommand()`。这条值得记下来：**判据拦住它本来要拦的那种事故**，而不是只在文档里写着。

### 已知边界

- `ruleset-audit` 需要网络与 `gh` 凭证；GitHub Actions 默认没有 `gh` 认证，因此它在 CI 上是
  `api-unavailable` 类型化 skip，真实读数目前只在开发机上取。
- `required_approving_review_count` 取 **0**：单人仓库要求 review 等于自我审批，是名义保护。
- bypass actor 为空数组是**声明**；GitHub 的 bypass 不留审计事件，「break-glass 留痕」只能靠流程。
- **误阻塞风险已实际存在**：`gate (full)` 目前在有嵌套仓/依赖的项上判红（`pin-consistency` 在干净检出上
  必然失败，因为 `vendor/dsh-desktop/` 被白名单式 `.gitignore` 排除且没有 `.gitmodules`）。
  **在那些项修好之前，任何 PR 都无法合并。** 这是有意为之的诚实状态，但它是本项目前最需要盯的一条。
