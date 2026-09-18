# CI 的判据面：workflow 静态契约与干净 HOME 干跑

- 日期：2026-09-17
- 卡：QG-007（可复现 CI workflow）
- ADR：[ADR-0105](../../../adr/ADR-0105.md)
- 前序：[2026-09-17-self-attestation-and-process-reaping](2026-09-17-self-attestation-and-process-reaping.md)（QG-006B）

## Problem

QG-007 要的是「由独立 runner 在 PR/main 上执行门禁，不能依赖开发者本机结果」。开始做的时候，仓库里的事实是：

```
$ ls .github/
pull_request_template.md          ← 没有任何 workflow

$ git ls-remote --heads origin main
fatal: unable to access 'https://github.com/zjgulai/lute-dsh-platform.git/':
Failed to connect to github.com port 443 after 75002 ms: Couldn't connect to server

$ docker version
failed to connect to the docker API at unix:///Users/lute/.docker/run/docker.sock:
no such file or directory
```

卡面把这种情况直接写成了 Red 条款：「根仓库无可验证 workflow run 或 PR 不触发目标 checker 时，**不得引用本机 gate 结果宣称 CI 已建立**」；证据层级也写死了「开发机日志只能作为诊断，不是 CI 证据」。

所以这一轮的真实问题不是「写一份 YAML」，而是：**在没有 L2/L3 的条件下，怎么让 CI 的判据面尽可能地被离线证伪，并且不把「未验证」说成「已建立」。**

另外两个当场暴露的事实：

1. `.github/workflows/` 是空的，而门禁注册表里有一项 `scripts-runnable` 之类**只在 full 跑**的检查——PR 上只跑 quick 就意味着那 8 项在 CI 里**根本不存在**（P-04 的形态）。
2. 门禁里凡是读 `~/.dsh` 的检查（profile 三面、`live-presets`、`skill-lines`、`agent-fullstack`…）在干净 runner 上会怎样，从来没有人量过。

## Decision

见 [ADR-0105](../../../adr/ADR-0105.md)。落地：

1. **`.github/workflows/gate.yml`**：`quick`（PR + push）+ `full`（push-only，`if` 里排除 `pull_request`）；两个 job 都带数值型 `timeout-minutes`、门禁步骤、其后的 `--attest` 见证（ADR-0103）、`if: always()` 的 evidence 上传；顶层只读 `permissions` + `concurrency.cancel-in-progress`；`NODE_VERSION` / `PNPM_VERSION` 钉在 `env`。
2. **`scripts/gates/ci-workflow.mjs`**：workflow 契约的离线判据（含一个 80 行的 YAML 子集读取器），返回值固定带 `authority: 'L1-static'`。
3. **`scripts/gates/ci-workflow.test.mjs`**：27 条反向自测，21 条是针对具体事故的变异。
4. **门禁注册表**新增 `ci-workflow-contract` 与 `ci-workflow-contract-selftest`（都进 quick）。
5. **干净 HOME 干跑**（不新增门禁项，是一轮取证）：`HOME`/`TMPDIR`/`DSH_PROFILE_DIR` 指向空目录跑 quick，逐条记 skip 的类型化理由。

## Alternatives considered

| 方案 | 为什么不选 |
|---|---|
| 等能推送时再写 workflow | 卡面 Red 条款说的正是这种状态；而且能被离线判据拦下的事故（缺 `full`、`continue-on-error`、浮动版本）是最常见的几种 |
| `npm i yaml` 解析 workflow | 为一个文件扩大供应链面；子集读取器读不懂时会抛错，比「声称支持全部 YAML」更保守 |
| 只写 workflow、不加判据 | 没有判据的 workflow 会被一次「顺手改成 `continue-on-error`」悄悄削弱，而门禁读数还是绿的 |
| 把 L2/L3 报成已完成并引用本机读数 | 卡面明令禁止的那句话 |
| 起 Docker 做 L2 干跑 | daemon 未运行，本轮不可得；已记入未完成项 |

## Consequences

**读数（本轮实测）**

| 项 | 读数 |
|---|---|
| `node --test scripts/gates/ci-workflow.test.mjs` | **27/27**（基线 1 条 + 变异 21 条 + 解析器 2 条 + 结构 3 条） |
| `node scripts/gate.mjs --mode quick --json`（本机 HOME） | **exit 0**，`total 80 / pass 78 / skip 2 / fail 0` |
| 干净 HOME 干跑（`HOME`/`TMPDIR`/`DSH_PROFILE_DIR` 指向空目录） | **exit 0**，`total 80 / pass 71 / skip 9 / fail 0` |
| `gate-result.test.mjs`（补的混用合同用例） | 26/26 |

干净 HOME 下 9 项 skip 的类型化理由（逐条带「未核对什么」）：

```
profile-metadata-sync        profile 根不存在
profile-files-sync           profile 根不存在
profile-bundle-sync          profile 根不存在
live-presets                 用户预设根不存在（…/.dsh/.agent-presets）——本项**未核对任何预设**（不是「都健康」）
fullstack-catalog            catalog 0/138
agent-fullstack              预设目录不存在（…/agent-fullstack）—— 本项没量到任何东西
dmg-layout-doc               既没有挂载的交付卷，也没有未打 tag 的 payload——未校验任何卷内清单
skill-runtime-preconditions  没有已接线的技能子集（未建立 preset 或 preset 尚未生成）
skill-lines                  本机没有 ~/.dsh/skills 与 ~/.dsh/.agent-presets —— 三条技能线尚未入库
```

**干跑当场抓出的缺陷（这就是它值得做的理由）**

第一次干净 HOME 干跑是 `fail 70 / 80 fail 1`：`skill-lines-selftest` 判红。根因是
`skill-lines.test.mjs` 的 **S2 与 S3** 也在读真实 `homedir()`——

- S2 传了 `runOne` 桩但没传 `home`，于是在没有 `~/.dsh/skills` 的机器上走「环境前提不在」的早返回分支，
  断言 `r.passed === false` 失败；
- S3 用 `repoRoot: '/nonexistent-repo-for-selftest'` 测「验证器文件不存在必须红」，同样先被前提检查拦下。

这两条此前只在**真有 `~/.dsh/skills` 的机器上**才会走到被测分支——也就是「判据读了环境」。
S2–S7 现在全部经 `withSelftestHome()` 注入合成 HOME，干净 HOME 下 9 项 skip、0 项 fail。

**顺带修掉的聚合层缺陷**

`ci-workflow-contract` 第一版交了 `{passed, expected, discovered, checked, skipped: 0, failed, violations, note}`
——一半 canonical 一半 legacy。`normalizeGateResult` 走 legacy 分支、把 canonical 字段整片丢掉，
最后报「legacy skipped must be boolean」：**真正的原因是混用，读数里一个字都没提**。
现在 `normalizeGateResult` 遇到同时带 `status` 与 `passed` 的读数会点名到字段并说清两份合同分别是哪一份，
`gate-result.test.mjs` 补了正反两条例。

**已知边界（写在 ADR 里，也在反向自测的注释里）**

- 判据不保证把「任何非 YAML」都报成解析失败：`quick:` 下挂缩进的标量序列会被本子集解析成
  「一个没有字段的 job」，报的是「缺少 timeout-minutes」——仍判红且具体，只是措辞不同。
- `pnpm-lock.yaml` 被白名单式 `.gitignore` 忽略，CI 上可能没有锁文件：workflow 用
  `if [ -f pnpm-lock.yaml ]` 显式分流并打印 notice，不假装做了锁文件安装。
- Node 钉在 `22.19.0`（与 `engines.node` 相容），但**没有在本机验证过**它能跑通全部门禁（本机是 26.0.0）。
- **L2/L3 未取得**：没有可验证的 workflow run，本轮所有 CI 结论的证据层级都是 L1。
