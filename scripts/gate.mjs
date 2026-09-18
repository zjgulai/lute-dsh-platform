#!/usr/bin/env node
/**
 * LUTE 门禁入口。退出码即契约（ADR-0014）：
 *   0 = 全部校验通过
 *   1 = 存在失败校验
 *   2 = 用法错误
 *
 * 用法：node scripts/gate.mjs [--mode quick|full] [--list] [--json] [--require-no-skip]
 *   quick（默认）提交前使用；full 推送前使用（含变更包 typecheck/test，二期接入 git 钩子后启用）。
 */
import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync, rmSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkAdrIndex,
  checkAdrNoteLinks,
  checkCatalogFresh,
  checkChangedPackages,
  checkDependencyLinks,
  checkDmgReadmeTccPanes,
  checkExemptions,
  checkGitignoreWhitelist,
  checkNestedRepositories,
  checkPackageIdentity,
  checkPinConsistency,
  checkReadmeHeredocIsLiteral,
  checkScriptsRunnable,
  checkShellVarAdjacentMultibyte,
  checkTccDeadGrantRule,
  checkTccPaneGuidance,
  checkThemeTokensBaselineFrozen,
  checkTrackedIgnored,
} from './gates/checks.mjs'
import { buildOutputRoot, checkDependencyReproducibility, packageScriptOrder } from './gates/dependency-reproducibility.mjs'
import { checkProfileBundleSync, checkProfileFilesSync, checkProfileMetadata } from './gates/sync-profile.mjs'
import { checkPackageFilesCoverage, createFileSource, listPackageTree } from './gates/package-files-coverage.mjs'
import { checkPluginEntryContract } from './gates/plugin-entry-contract.mjs'
import { buildExpectedSet, readProfileManifest, summarizeTarget } from './gates/profile-coverage.mjs'
import { checkSharedSync } from './gates/sync-shared.mjs'
import { checkLivePresetsAgainstInventory, toCanonicalLivePresetResult } from './gates/live-presets.mjs'
import { assertRemediationDeclared, computeNotCovered, isCheckActive, runGateChecks } from './gates/gate-result.mjs'
import { appResourcesRoot } from './lib/app-resources.mjs'
import { identical as snapshotIdentical, snapshotRepo } from './lib/repo-snapshot.mjs'
import {
  WORKFLOW_CHECK_AUTHORITY,
  WORKFLOW_REL_PATH,
  checkCiWorkflow,
  readWorkflow,
} from './gates/ci-workflow.mjs'
import { checkAgentFullstack } from '../packages/capabilities/dsh-overseas-skills/scripts/verify-agent-fullstack.mjs'
import {
  auditApprovedWhitelist,
  auditFullstackCatalog,
  toCanonicalCatalogResult,
  toCanonicalWhitelistResult,
} from '../packages/capabilities/dsh-overseas-skills/scripts/fullstack-contract.mjs'
import { checkThirdPartyIntake } from './gates/third-party-intake.mjs'
import { checkImmutableSupplyChain } from './gates/immutable-supply-chain.mjs'
import { checkThemeTokens } from './gates/theme-tokens.mjs'
import { checkWorktableFence } from './gates/worktable-fence.mjs'
import { checkNodeInterpreter } from './gates/node-interpreter.mjs'
import { checkSkillRuntimePreconditions } from './gates/skill-runtime-preconditions.mjs'
import { checkSkillLines } from './gates/skill-lines.mjs'
import { checkSidebarRowAxis } from './gates/sidebar-row-axis.mjs'
import {
  checkPitfallsPlaybook,
  PLAYBOOK_BACKLINK_PATHS,
  PLAYBOOK_REL_PATH,
} from './gates/pitfalls-playbook.mjs'
import { checkDocsLinkIntegrity } from './gates/docs-links.mjs'
import { checkDeadInstrument, REGISTRY_REL_PATH as DEAD_INSTRUMENTS_PATH } from './gates/dead-instrument.mjs'
import {
  ASSETS_DIR_REL as BRAND_ICONS_ASSETS_DIR,
  checkBrandIcons,
  REPLAY_REL as BRAND_REPLAY_REL,
} from './gates/brand-icons.mjs'
import {
  checkDmgLayout,
  GUIDE_REL_PATH as DMG_LAYOUT_GUIDE_PATH,
  selectLayoutTargets,
  SOP_REL_PATH as DMG_LAYOUT_SOP_PATH,
} from './gates/dmg-layout.mjs'
import { selectAnchorTargets } from './gates/patch-anchor-scope.mjs'
import { selectPublishTargets } from './gates/release-publish-scope.mjs'
import {
  checkChangelogSections,
  PACKAGING_CHANGELOG_REL_PATH,
  ROOT_CHANGELOG_REL_PATH,
} from './gates/changelog-release-sections.mjs'
import { runScript } from './lib/run-script.mjs'
import { nodeCommand } from './lib/real-node.mjs'
import { collectManagedManifests, collectPackages } from './gates/package-collect.mjs'
import { LOCAL_BASE_REF, createGitRunner, resolveChangedScope } from './gates/changed-packages.mjs'
import { renderCatalog } from './gen-catalog.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODES = ['quick', 'full']

/** 不参与包身份校验的目录（无 package.json 或属外部依赖）。 */
const SCAN_SKIP = new Set(['node_modules', 'vendor', '.git', 'packaging', 'docs', '.scratch'])

/**
 * 会教用户授权 TCC 的出货面。清单本身也是判据：新增一处指引而没登记进来，
 * 等于新增一处「写错了也没人说」的地方（2026-09-13 实测：README 改对后，
 * 另外五处仍写着「自动化」，其中包括安装器最后一行提示）。
 */
const TCC_GUIDANCE_SURFACES = [
  'packaging/assemble.sh',
  'packaging/installer/install.sh',
  'packaging/installer/pkg-postinstall.sh',
  'packaging/INSTALL-CARD.md',
  'packaging/INSTALL-GUIDE.md',
  'packaging/README.md',
  'README.md',
]

/** 校验项注册表：新增校验在此登记，name 会出现在 --list 输出中。 */
const CHECKS = [
  {
    name: 'gate-result-selftest',
    remediation:
      '跑 node --test scripts/gates/gate-result.test.mjs；canonical/legacy 混用、计数不守恒、空射程 pass、throw 或 strict skip 任一反例都必须判红（ADR-0094）',
    run() {
      return runNodeTestFile('scripts/gates/gate-result.test.mjs', '统一 gate result schema 的反向自测失败')
    },
  },
  {
    name: 'mutation-fixture-selftest',
    remediation:
      '跑 node --test scripts/lib/mutation-fixture.test.mjs；fixture 必须独占 repo/home/profile/tmp，越界或 ownership 漂移时拒绝清理，SIGTERM/SIGINT 也必须回收自有根（ADR-0097 / ADR-0103）',
    run() {
      return runNodeTestFile('scripts/lib/mutation-fixture.test.mjs', 'mutation fixture 隔离与生命周期自测失败')
    },
  },
  {
    name: 'ruleset-declaration-selftest',
    // 离线那一半进 quick：它守的是「声明与真实 API 读数形状的比对逻辑」，用采下来的
    // fixture 跑，不需要网络。真实读数那一半见 ruleset-audit。
    remediation:
      '跑 node --test scripts/gates/ruleset-audit.test.mjs；删 required check、改检查名、加 bypass、'
      + '去掉 tag 的 update 规则、降级成 evaluate、多一条未登记 ruleset、API 403、列表端点缺字段'
      + '——每一条都必须判红，且 403 不得被解释成「未配置所以通过」（ADR-0106）',
    run() {
      return runNodeTestFile('scripts/gates/ruleset-audit.test.mjs', '保护面判据的反向自测失败')
    },
  },
  {
    name: 'ruleset-audit',
    // L2 只读 API 取证：**需要网络与 gh 凭证**，拿不到读数时给类型化 skip 而不是判红
    // （本机/CI 都可能没有 gh；ADR-0102：空射程与真通过必须长得不一样）。
    remediation:
      '跑 node scripts/gates/audit-rulesets.mjs；退出码 0=与声明全等，1=不符，2=拿不到读数。'
      + '不符时按输出逐条对齐 scripts/gates/ruleset-declaration.json；'
      + '**不要**在 GitHub UI 里手改规则——那样声明与事实会立刻分家（ADR-0106）',
    run() {
      const audit = runRulesetAudit()
      if (audit.status === 'no-reading') {
        return {
          status: 'skip',
          expected: 1,
          discovered: 1,
          checked: 0,
          skipped: 1,
          failed: 0,
          typedSkips: [{ type: 'api-unavailable', count: 1, reason: audit.reason }],
          violations: [],
          reason: `保护面审计本次无读数：${audit.reason}`,
          note: '读数拿不到 ≠ 没有配置保护；本项在拿到读数之前不给结论',
        }
      }
      const passed = audit.exitCode === 0
      return {
        status: passed ? 'pass' : 'fail',
        expected: 1,
        discovered: 1,
        checked: passed ? 1 : 0,
        skipped: 0,
        failed: passed ? 0 : 1,
        typedSkips: [],
        reason: passed ? '保护面与声明全等' : `保护面与声明不符：${audit.violations.length} 处`,
        violations: audit.violations,
        note: `证据层级 ${audit.authority}；规则来自 ${audit.declarationPath}；`
          + `required check：${(audit.facts['main-protection']?.statusChecks ?? []).join('、') || '（无）'}`,
      }
    },
  },
  {
    name: 'ci-workflow-contract',
    // 证据层级是 **L1 静态**：它审 workflow 文件本身，不证明「CI 已建立」——那需要一次
    // 真实 runner 上的 run（L2/L3）。读数里固定带这句，不允许被读成后者（卡面的 Red 条款）。
    remediation:
      '修 .github/workflows/gate.yml：必须有 quick（PR+push）与 full（push-only）两个 job，各带数值型 timeout-minutes、'
      + '门禁步骤（`node scripts/gate.mjs --mode …`）、其后的 `--attest` 见证、`if: always()` 的 evidence 上传；'
      + '顶层必须有只读 permissions、concurrency.cancel-in-progress、钉住的 NODE_VERSION/PNPM_VERSION；'
      + '不得出现 continue-on-error、`|| true`、secrets.* 或机器路径（ADR-0104）',
    run() {
      const workflowText = readWorkflow(repoRoot)
      const check = checkCiWorkflow({
        workflowText,
        gateNames: CHECKS.map((entry) => entry.name),
        allowedActionRefs: ['actions/checkout@', 'actions/setup-node@', 'actions/upload-artifact@', 'pnpm/action-setup@'],
      })
      // 交 **canonical** 读数（ADR-0094 的三态 + 守恒账目），不要图省事写 legacy 的
      // `{passed, violations}`：`passed` 一旦与 canonical 字段混在一份对象里，聚合层
      // 会走 legacy 分支并把 canonical 字段整片丢掉，最终报一句与真实原因无关的
      // 「result schema invalid」（实测 2026-09-17）。
      return {
        status: check.passed ? 'pass' : 'fail',
        expected: 1,
        discovered: 1,
        checked: check.passed ? 1 : 0,
        skipped: 0,
        failed: check.passed ? 0 : 1,
        typedSkips: [],
        reason: check.passed
          ? `workflow 静态契约合格（${check.facts.jobs.join('、')} 两个 job）`
          : `workflow 静态契约不合规：${check.violations.length} 处`,
        violations: check.violations,
        note: `证据层级 ${WORKFLOW_CHECK_AUTHORITY}（静态审计，不等于 CI 已验证）；`
          + `workflow=${WORKFLOW_REL_PATH}；jobs=${(check.facts.jobs ?? []).join('、') || '无'}；`
          + `钉住版本 node=${check.facts.pinnedVersions?.node ?? '未钉'} pnpm=${check.facts.pinnedVersions?.pnpm ?? '未钉'}`,
      }
    },
  },
  {
    name: 'ci-workflow-contract-selftest',
    remediation:
      '跑 node --test scripts/gates/ci-workflow.test.mjs；12 条变异（缺 job、缺 timeout、缺 attest、缺上传、'
      + '缺权限、缺并发取消、continue-on-error、`|| true`、secrets、机器路径、未钉版本、错误 mode）'
      + '每一条都必须让判据判红（ADR-0104）',
    run() {
      return runNodeTestFile('scripts/gates/ci-workflow.test.mjs', 'CI workflow 判据的反向自测失败')
    },
  },
  {
    name: 'repo-snapshot-selftest',
    remediation:
      '跑 node --test scripts/lib/repo-snapshot.test.mjs；tracked/untracked/声明根/ignored 区域/HEAD/refs/index 必须逐个可判据，空射程判红、声明根不可收缩、差异必须点名到路径（ADR-0103）',
    run() {
      return runNodeTestFile('scripts/lib/repo-snapshot.test.mjs', '见证快照判据的反向自测失败')
    },
  },
  {
    name: 'repo-attest-selftest',
    remediation:
      '跑 node --test scripts/lib/repo-attest.test.mjs；正常、断言失败、非零退出、fixture setup 失败、cleanup 失败与 SIGTERM 六条结束路径都必须 before_digest == after_digest（ADR-0103）',
    run() {
      return runNodeTestFile('scripts/lib/repo-attest.test.mjs', '侧效应见证六条结束路径的反向自测失败')
    },
  },
  {
    name: 'gate-concurrency-selftest',
    // full-only：一轮就是两条完整 gate，实测单轮约 44 秒（本机 10 核），
    // 默认 10 轮是进入 CI 前的聚合收口，不属于提交前该跑的那一档（P-04）。
    modes: ['full'],
    remediation:
      '跑 DSH_GATE_CONCURRENCY_ROUNDS=10 node --test scripts/lib/repo-attest-concurrency.test.mjs；两条完整 gate 并发 10 轮期间被见证仓库必须零差异，且两条 lane 的 pass/skip/fail 读数不得分裂（ADR-0103）。若本项报「并发窗口内有外部写入」，那是**别人的写入**而不是门禁副作用：用 DSH_ATTEST_REPO=<独占副本> 指向一份 clean clone 再跑，不要放宽判据',
    run() {
      // 前置判定：并发稳定性读数只有在**没有别的写入者**时才有意义（ADR-0103 的失败边界）。
      // 本工作树长期有多个会话在写（实测：本会话、Codex 会话、另一个 agent 会话各命中过一次），
      // 直接跑会（正确地）被判红，而那条红说的是「别人在写仓库」，不是「门禁有副作用」。
      // 与其让读的人每次自己分辨，不如在这里先量一次「有没有人在写」，并给出**类型化 skip**
      // 与可执行出路——空射程与真通过必须长得不一样（ADR-0102）。
      const quiet = measureQuietWindow(repoRoot)
      if (!quiet.quiet) {
        return {
          status: 'skip',
          expected: 1,
          discovered: 1,
          checked: 0,
          skipped: 1,
          failed: 0,
          typedSkips: [{
            type: 'concurrent-writers-detected',
            count: 1,
            reason: '并发窗口内检测到外部写入，未产生稳定的 10 轮读数',
          }],
          violations: [],
          reason: `并发见证窗口内有外部写入（${quiet.diffs.join('、')}）——这不是「门禁有副作用」，也不是「并发安全」；`
            + `本项在此环境下无读数。用 DSH_ATTEST_REPO=<独占副本> 指向 clean clone 再跑（${quiet.witness}）`,
          note: `前置安静度探测：${quiet.probes} 次快照、观察到 ${quiet.diffs.length} 处外部变化`,
        }
      }
      return runNodeTestFile(
        'scripts/lib/repo-attest-concurrency.test.mjs',
        '聚合并发见证失败',
        30 * 60 * 1000,
      )
    },
  },
  {
    name: 'package-identity',
    remediation: '在每个受管 package.json 补 luteOrigin / luteOwner / lutePublish（ADR-0012）',
    run() {
      return checkPackageIdentity(repoRoot, collectManagedManifests(repoRoot))
    },
  },
  {
    name: 'pin-consistency',
    remediation: '更新 vendor/dsh-desktop.pin 的 harness-submodule 为实际 HEAD（ADR-0008）',
    run() {
      return checkPinConsistency({
        pinText: readIfExists(join(repoRoot, 'vendor', 'dsh-desktop.pin')),
        submoduleSha: submoduleHead() ?? '<未初始化>',
      })
    },
  },
  {
    name: 'gitignore-whitelist',
    remediation: '删除 .gitignore 中指向不存在路径的白名单条目（ADR-0013）',
    run() {
      return checkGitignoreWhitelist({
        gitignoreText: readIfExists(join(repoRoot, '.gitignore')),
        exists: (path) => existsSync(join(repoRoot, path)),
      })
    },
  },
  {
    name: 'adr-index',
    remediation: '修正 docs/adr/README.md 索引与 docs/adr/ADR-NNNN.md 文件的一致性（ADR-0015）',
    run() {
      return checkAdrIndex({
        adrFiles: listAdrFiles(),
        indexText: readIfExists(join(repoRoot, 'docs', 'adr', 'README.md')),
      })
    },
  },
  {
    name: 'adr-note-links',
    remediation: '修正 ADR 的「决策记录」链接或在其 Note 正文回引 ADR 编号（ADR-0015）',
    run() {
      return checkAdrNoteLinks({
        adrDocs: listAdrFiles().map((path) => ({ path, text: readIfExists(join(repoRoot, path)) })),
        // 逐篇读该 ADR 自己指向的那篇 Note（不再写死单一路径）。
        readNote: (path) => readIfExists(join(repoRoot, path)),
        exists: (path) => existsSync(join(repoRoot, path)),
      })
    },
  },
  {
    name: 'catalog-fresh',
    remediation: '运行 node scripts/gen-catalog.mjs 重新生成目录墙（ADR-0011）',
    run() {
      const target = 'docs/catalog/packages.md'
      const current = readIfExists(join(repoRoot, target))
      if (current === '') {
        return {
          passed: false,
          violations: [`必备治理文件 ${target} 不存在或为空——没有事实源，不能声称目录新鲜`],
        }
      }
      return checkCatalogFresh({
        current,
        regenerated: renderCatalog({ packages: collectManifests() }),
      })
    },
  },
  {
    name: 'dependency-links',
    remediation: '修复断链：重新安装该包依赖，或把链接目标改为绝对路径（ADR-0016）',
    run() {
      return checkDependencyLinks({ links: collectDependencyLinks() })
    },
  },
  {
    name: 'deps-reproducible',
    remediation: '在该包目录执行 pnpm install 重新生成 pnpm-lock.yaml；机器绝对路径依赖改成注册表版本区间（ADR-0055）',
    run() {
      return checkDependencyReproducibility({
        packages: collectManifests()
          .filter((entry) => entry.dir !== '.')
          .map((entry) => {
            const lockPath = join(repoRoot, entry.dir, 'pnpm-lock.yaml')
            return {
              relPath: entry.dir,
              manifest: entry.manifest,
              lockfileText: existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : null,
            }
          }),
      })
    },
  },
  {
    name: 'nested-repos',
    remediation: '把嵌套仓库纳入 .gitmodules 声明，或折叠为普通目录（ADR-0016）',
    run() {
      const nested = []
      for (const entry of collectManifests()) {
        if (entry.dir === '.') continue
        if (existsSync(join(repoRoot, entry.dir, '.git'))) nested.push(entry.dir)
      }
      const gitmodules = readIfExists(join(repoRoot, '.gitmodules'))
      const declared = [...gitmodules.matchAll(/^\s*path\s*=\s*(.+)$/gm)].map((m) => m[1].trim())
      return checkNestedRepositories({ nestedRepos: nested, declaredSubmodules: declared })
    },
  },
  {
    name: 'index-drift',
    remediation: '结清漂移：git rm --cached 已不在磁盘的条目，或把受管归档纳入 .gitignore 白名单（ADR-0013）',
    run() {
      const output = execFileSync('git', ['-C', repoRoot, 'ls-files', '--cached', '--ignored', '--exclude-standard'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return checkTrackedIgnored({ trackedIgnored: output.split('\n').filter(Boolean) })
    },
  },
  {
    name: 'profile-metadata-sync',
    remediation:
      '先确认 profile 的 package.json 是合法 JSON（坏了会直接判红，不再被吞成「没有 file: 依赖」）；'
      + '再运行 node scripts/sync-profile.mjs --apply --only-metadata 同步内嵌副本（profile/vendor，**不是**装载点）的 package.json',
    run() {
      // 注意：vendor/ 不是装载点（DSH 从 profile/node_modules 解析包）。本项只保证
      // 内嵌副本的元数据不漂；「改动是否生效」由下面的 profile-bundle-sync 断言。
      //
      // 期望集由 profile-coverage 从「profile 声明了什么」推出来，保留完整
      // `packages/<组>/<包>` 相对路径。旧实现曾经用 `entry.dir.split('/').pop()`
      // （扁平 basename）拼目标路径，于是每个目标都落在不存在的路径上、被
      // `existsSync` 静默 continue —— 本项因此**永远绿**（P-02）。
      return runProfileTarget('metadata')
    },
  },
  {
    name: 'profile-files-sync',
    remediation:
      '按 package.json 的 files 清单修正：陈旧条目从 files 中删除；真缺件用 tmp+mv 语义补齐装载点副本（勿直接覆盖）。'
      + '若报的是「期望集里的包在装载点不存在」，先跑 node scripts/sync-profile.mjs --apply --loadpoint 或重装 profile',
    run() {
      // 盯 node_modules：`file:` 依赖是硬链接实体副本，且这是 DSH 真实装载点
      // （2026-09-11 实测报错路径即 profiles/desktop/node_modules/dsh-preset-lint-local/lib/...）。
      // vendor/ 是另一份命名不同的副本，本项只对装载点断言。
      return runProfileTarget('files')
    },
  },
  {
    name: 'profile-bundle-sync',
    remediation:
      '运行 node scripts/sync-profile.mjs --apply --loadpoint 把仓库产物按 tmp+mv 同步到装载点（否则应用重启后仍跑旧字节）。'
      + '若报的是「期望集里的包在装载点不存在」，那是安装没落到位而不是字节漂移——先补齐装载点再谈同步',
    run() {
      return runProfileTarget('bundle')
    },
  },
  {
    name: 'plugin-entry-contract',
    remediation:
      '按报错点名的入口修：入口路径以 package.json 的 main/exports 为准（不是约定俗成的 lib/index.js）；'
      + '`const inject = [...]` 忘了 `export` 就补 `export { name, inject }`；'
      + '访问了 `ctx.<服务>` 而 inject 名单里没有就补进名单；'
      + 'Service 子类的 inject 必须是 `static` 字段。判红里的 `library` 与 `unresolved` 需要人来判：'
      + '要么补回入口/apply，要么从 package.json 的 dsh.bundle.patch 里去掉声明',
    run() {
      return checkPluginEntryContract(collectManifests(), readRepoText)
    },
  },
  {
    name: 'plugin-entry-contract-selftest',
    remediation:
      '跑 node --test scripts/gates/plugin-entry-contract.test.mjs 看红在哪条：本项必须能说「不」——删入口、悬空转出口、转出口成环、移除 apply、Service 的 inject 缺 static、访问名单外的服务、注释/字符串里的假 ctx 命中都必须判红，候选总数恒等于 checked+skipped+failed；也必须不误报——只有方法调用、`try { … } catch {}` 里的刻意探测、内置属性 root/scope/parent/logger、清单入口不是 lib/index.js 的转出口壳都要放行（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/plugin-entry-contract.test.mjs', '插件入口契约判据的反向自测失败')
    },
  },
  {
    name: 'package-files-coverage',
    remediation:
      '把报错点名的文件加进该包 package.json 的 files 清单（或改用能覆盖它的目录/通配条目），**不要**靠 `sync-profile.mjs --apply --loadpoint` 补救：pnpm 对 `file:` 依赖按 files 白名单物化（实测），全新安装路径上没有任何同步步骤，缺件就是 ERR_MODULE_NOT_FOUND 进恢复模式。改完跑 `node scripts/sync-profile.mjs --check --loadpoint` 复核装载点，并跑 `pnpm run test:gate` 看校准（判定器必须与真实 npm pack 的产出逐文件全等）',
    run() {
      return checkPackageFilesCoverage(collectPackageTrees())
    },
  },
  {
    name: 'package-files-coverage-selftest',
    remediation:
      '跑 node --test scripts/gates/package-files-coverage.test.mjs 看红在哪条：本项必须能说「不」——P-24 的复发形状（`lib/index.js` 正在 import 的模块不在 files 里）必须判红并点名文件，`new URL(…, import.meta.url)` 定位的运行时文件同理（MUT3 把这条规则关掉后必须漏过）；也必须不误报——`main`/README/LICENSE 永远被打包、裸目录条目覆盖整棵子树、无 files 白名单的包不构成「漏项」、可达闭包之外的 lib bundle 只报读数不判红（假红会把真信号一起拖下水）。`CALIB npm` 是判定器的校准锚：逐文件比对真实 `npm pack` 的产出，不一致即说明 glob 语义建模有偏；`CALIB 前提钉` 用真实 pnpm `file:` 安装复核「缺件到底会不会发生」这一条立论基础（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/package-files-coverage.test.mjs', '交付白名单完整性判据的反向自测失败')
    },
  },
  {
    name: 'profile-coverage-selftest',
    remediation:
      '跑 node --test scripts/gates/profile-coverage.test.mjs 看红在哪条：本项必须能说「不」——profile package.json 坏 JSON、根在但清单读不到、装载点/vendor 目录整个不存在、期望集里 0/1/N-1 个包在目标里缺件，都必须判红并点名是哪个包；也必须不误报——不受管的 `file:` 依赖只进读数、受管但未声明的包只进读数（本机 profile 裁剪是合法的）、目录存在但真的全绿才算过。期望集按**完整相对路径**对齐，basename 相同的包不得互相顶替（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/profile-coverage.test.mjs', 'profile 覆盖率判据的反向自测失败')
    },
  },
  {
    name: 'shared-sync',
    remediation: '改共享层请改 shared/ 后跑 node scripts/sync-shared.mjs --write 把改动写回各副本（ADR-0009）',
    run() {
      return checkSharedSync(repoRoot)
    },
  },
  {
    name: 'live-presets',
    remediation:
      '按报错修 ~/.dsh/.agent-presets/<id>/agent.cordis.yml：占位符只允许出现在 cordis.patch.yml（预设加载器不展开）；行名必须是 cordis:/相对/绝对/file: 路径或 profile node_modules 向上可达的包名。若是经批准的结构变更，重采并审查 scripts/gates/live-presets.expected.json；删除预设一律走 node scripts/role-presets/remove-preset.mjs（强制引用面预检 + 归档）',
    run() {
      return toCanonicalLivePresetResult(checkLivePresetsAgainstInventory({}))
    },
  },
  {
    name: 'live-presets-selftest',
    remediation:
      '跑 node --test scripts/gates/live-presets.test.mjs 看红在哪条：本项必须能说「不」——__DSH_HOME__ 残留、解析不到的包名/绝对路径必须判红；宿主会跳过的 disabled 行不得判红；空射程必须「跳过并写明」；块标量内容里的 name: 不得当插件行；M1 恒真桩突变：只查占位符的退化实现必须放过解析不到的行（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/live-presets.test.mjs', '用户预设写后核验的反向自测失败')
    },
  },
  {
    name: 'destructive-preset-skill-transactions',
    remediation:
      '跑 node --test scripts/lib/preset-skill-paths.test.mjs scripts/lib/preset-skill-transaction.test.mjs scripts/gates/session-refs-fail-closed.test.mjs scripts/gates/preset-maintenance-transaction.test.mjs packages/capabilities/dsh-overseas-skills/test/install-fullstack-skills.spec.mjs；路径逃逸、symlink/hard-link、全批预检、锁、SHA-256 staging、fault rollback、archive/restore 或 installer 任一反例失败都不得发布（ADR-0093）',
    run() {
      return runNodeTestFiles([
        'scripts/lib/preset-skill-paths.test.mjs',
        'scripts/lib/preset-skill-transaction.test.mjs',
        'scripts/gates/session-refs-fail-closed.test.mjs',
        'scripts/gates/preset-maintenance-transaction.test.mjs',
        'packages/capabilities/dsh-overseas-skills/test/install-fullstack-skills.spec.mjs',
      ], 'preset/skill 破坏性事务契约自测失败')
    },
  },
  {
    name: 'wanzh-persistence-and-oauth',
    remediation:
      '跑 node --test packages/capabilities/dsh-wanzh-hulian/test/{atomic-store,persistence,persistence-failclosed,persistence-inventory,oauth-flow,oauth-routes}.spec.mjs 看红在哪条：状态落盘必须只经原子写入器（同目录临时文件 + fsync + rename 前校验权限位 + 目录 fsync）；损坏或形状不对的配置必须 fail-closed 且原字节不改写；「文件不存在」与「内容损坏」必须是两个读数；OAuth 流程同时最多一个 listener、到期必须关端口、注册与回收必须全等。重点是恒真桩突变（P-02 / P-32）：去掉 chmod、去掉 rename 前校验、改回直写、去掉排他槽位、去掉到期定时器、去掉 supersede、去掉 closeAllConnections 都必须有用例变红（ADR-0099）',
    run() {
      return runNodeTestFiles([
        'packages/capabilities/dsh-wanzh-hulian/test/atomic-store.spec.mjs',
        'packages/capabilities/dsh-wanzh-hulian/test/persistence.spec.mjs',
        'packages/capabilities/dsh-wanzh-hulian/test/persistence-failclosed.spec.mjs',
        'packages/capabilities/dsh-wanzh-hulian/test/persistence-inventory.spec.mjs',
        'packages/capabilities/dsh-wanzh-hulian/test/oauth-flow.spec.mjs',
        'packages/capabilities/dsh-wanzh-hulian/test/oauth-routes.spec.mjs',
      ], 'Wanzh 原子持久化与 OAuth 生命周期契约自测失败')
    },
  },
  {
    name: 'fullstack-catalog',
    remediation:
      '运行 node packages/capabilities/dsh-overseas-skills/scripts/verify-fullstack.mjs --json；mapping 与 extra 必须先合成唯一 catalog，再逐项修复 missing、metadata、来源或产物语法问题（ADR-0096）',
    run() {
      return toCanonicalCatalogResult(auditFullstackCatalog())
    },
  },
  {
    name: 'fullstack-whitelist',
    remediation:
      '核对 packages/capabilities/dsh-overseas-skills/manifest/agent-fullstack-whitelist.json：owner 批准的 skillIds、setSha256 与 138 catalog 必须闭合；产品变更需先更新 ADR/Note，不得从 live preset 自动反推（ADR-0096）',
    run() {
      const catalogAudit = auditFullstackCatalog({ checkInstalled: false })
      return toCanonicalWhitelistResult(auditApprovedWhitelist({ catalogAudit }))
    },
  },
  {
    name: 'fullstack-contract-selftest',
    remediation:
      '运行 node --test packages/capabilities/dsh-overseas-skills/test/fullstack-contract.spec.mjs；extra 缺失、跨源重复、归一化碰撞、坏资源、approved set 指纹漂移、任意子集与同数量替换必须逐项判红（ADR-0096）',
    run() {
      return runNodeTestFile(
        'packages/capabilities/dsh-overseas-skills/test/fullstack-contract.spec.mjs',
        'fullstack catalog / whitelist 契约的反向自测失败',
      )
    },
  },
  {
    name: 'agent-fullstack',
    remediation:
      '按报错修 ~/.dsh/.agent-presets/agent-fullstack/：persona 行与 SOUL.md 不同源时改 SOUL.md 再跑 node packages/capabilities/dsh-overseas-skills/scripts/sync-fullstack-persona.mjs（不要直接编辑 persona 行）；icon 行缺失或与图标库不同源时不要手抄 base64，跑 node packages/capabilities/dsh-overseas-skills/scripts/sync-fullstack-avatar.mjs（改头像要改图标库，不是改 preset.yml）；白名单 missing/unexpected 或节点错挂先对照 canonical approved manifest 与 catalog nodeId，不能从 live 反写产品意图；压缩行报非法键就直接删键——compaction-basic 的 validateKeys 抛错会让整行不加载',
    run() {
      const { presetRoot, skipped, facts, problems } = checkAgentFullstack({})
      // 空射程不许与「都合格」同形（ADR-0075）：用户预设不进仓库，干净检出上本就该跳过。
      if (skipped) {
        return {
          passed: true,
          skipped: true,
          violations: [],
          note: `预设目录不存在（${presetRoot}）—— 本项没量到任何东西`,
        }
      }
      const note = facts.persona
        ? `persona 同源=${facts.persona.sameSource ? '是' : '否'} ${facts.persona.personaChars} 字符；白名单 runtime ${facts.subset?.total ?? 0}/approved ${facts.subset?.approved ?? 0}（owner=${facts.subset?.owner ?? 'unknown'}）；节点 ${Object.keys(facts.subset?.nodes ?? {}).length}/14（错挂=${facts.subset?.nodeMismatches ?? 'unknown'}）；头像 ${facts.avatar ? `${facts.avatar.iconId} 同源=${facts.avatar.sameSource === null ? '未核对' : facts.avatar.sameSource ? '是' : '否'}` : '缺'}`
        : undefined
      return { passed: problems.length === 0, violations: problems, note }
    },
  },
  {
    name: 'agent-fullstack-selftest',
    remediation:
      '跑 node --test scripts/gates/agent-fullstack.test.mjs 看红在哪条：人格层判据必须能说「不」——干净副本必须静默；同长度单字符替换必须判红；P1 骨架占位、截断、缺 M09、缺三无条文、缺 {{cwd}} 都必须判红；白名单同数替换必须同时点名 missing/unexpected，同集合节点错挂也必须判红；锚点损坏、SOUL.md 缺失或正文为空必须响亮失败（P-02 / P-03 / P-30）',
    run() {
      return runNodeTestFile('scripts/gates/agent-fullstack.test.mjs', '「三无 · Agent全栈专家」preset 判据的反向自测失败')
    },
  },
  {
    name: 'third-party-intake',
    remediation:
      '运行 node packages/capabilities/dsh-overseas-skills/scripts/build-third-party-intake.mjs --check；每个 upstream source ID 必须恰好落入 imported / skipped / alreadyInstalled 一个终态，且生成清单逐字一致（ADR-0095）',
    run() {
      return checkThirdPartyIntake()
    },
  },
  {
    name: 'third-party-intake-selftest',
    remediation:
      '运行 node --test packages/capabilities/dsh-overseas-skills/test/build-third-party-intake.spec.mjs；overlap、duplicate、missing、unexpected、同总数替换、坏 JSON 与写前失败都必须非零且不改目标（ADR-0095）',
    run() {
      return runNodeTestFile(
        'packages/capabilities/dsh-overseas-skills/test/build-third-party-intake.spec.mjs',
        'third-party intake 分类守恒与原子写入的反向自测失败',
      )
    },
  },
  {
    name: 'immutable-supply-chain',
    remediation:
      '排查浮动供应链版本：MCP 配置禁止未锁版本的 npx -y 与 @latest；LoopX 禁止 loopx>= 与 --upgrade；第三方技能源必须绑定 40 位不可变 commit，禁止 trees/HEAD 与 /HEAD/ 浮动取件；import-fullstack 禁止 /tmp 回退（SEC-RT-002 / ADR-0113）',
    run() {
      const mcpServersSource = readIfExists('packages/capabilities/dsh-wanzh-hulian/lib/index.js')
      const loopxInitSource = readIfExists('packages/capabilities/dsh-loopx-plugin/lib/init-command.js')
      const thirdPartyInventoryRaw = readIfExists('packages/capabilities/dsh-overseas-skills/scripts/third-party-source-inventory.json')
      const thirdPartyInventory = thirdPartyInventoryRaw ? JSON.parse(thirdPartyInventoryRaw) : null
      const thirdPartyFetchSource = readIfExists('packages/capabilities/dsh-overseas-skills/scripts/fetch-third-party-skills.mjs')

      const result = checkImmutableSupplyChain({
        mcpServersSource,
        loopxInitSource,
        thirdPartyInventory,
        thirdPartyFetchSource,
      })
      return {
        status: result.passed ? 'pass' : 'fail',
        expected: 4,
        discovered: 4,
        checked: 4,
        skipped: 0,
        failed: result.violations.length,
        typedSkips: [],
        reason: result.passed
          ? 'MCP、LoopX 与第三方技能供应链已全面固化为不可变来源'
          : result.violations.join('；'),
        note: 'SEC-RT-002 immutable supply chain contract',
        violations: result.violations,
      }
    },
  },
  {
    name: 'immutable-supply-chain-selftest',
    remediation:
      '运行 node --test scripts/gates/immutable-supply-chain.test.mjs；测试覆盖浮动 npx、@latest、loopx>= 范围、--upgrade 与 HEAD 浮动引用拦截（SEC-RT-002）',
    run() {
      return runNodeTestFile(
        'scripts/gates/immutable-supply-chain.test.mjs',
        '不可变供应链门禁的反向自测失败',
      )
    },
  },
  {
    name: 'scripts-runnable',
    modes: ['full'],
    remediation: '补齐脚本依赖（如 devDependencies 加 typescript）或修复脚本本体，使其退出码为 0（ADR-0014）',
    run() {
      const exempted = new Set(JSON.parse(readIfExists(EXEMPTIONS_PATH) || '[]').map((row) => row.package))
      const packages = runPackageScripts().filter((entry) => !exempted.has(entry.relPath))
      return checkScriptsRunnable({ packages })
    },
  },
  {
    name: 'shell-var-multibyte',
    remediation: '把 `$VAR` 写成 `${VAR}`：bash 会把紧跟其后的多字节字符并入变量名，set -u 下直接中断（2026-09-13 实测装配 §5 中断，ADR-0064）',
    run() {
      return checkShellVarAdjacentMultibyte({ files: collectShellScripts() })
    },
  },
  {
    name: 'dmg-readme-tcc-panes',
    remediation:
      '出货 README 的授权段必须写全「辅助功能 / 屏幕录制」两项，且不得把「输入监控」写成待授项：写错一项不报错，用户会照着授了「自动化」而 mac.key/mac.click 静默失败；「输入监控」则根本不需要（post_events 由「辅助功能」承载，ADR-0063 / ADR-0069）',
    run() {
      return checkDmgReadmeTccPanes({
        assembleScript: readIfExists(join(repoRoot, 'packaging', 'assemble.sh')) ?? '',
      })
    },
  },
  {
    name: 'tcc-pane-guidance',
    remediation:
      '把该处授权指引改成「辅助功能 / 屏幕录制」两项：不要写「输入监控」（非必需，post_events 由「辅助功能」承载，ADR-0069），也不要写「自动化」（授了不会让键盘鼠标类能力可用，ADR-0063）；要讲清这两件事就加否定词（「不要授权自动化」「输入监控并非必需」）',
    run() {
      return checkTccPaneGuidance({
        files: TCC_GUIDANCE_SURFACES.map((rel) => ({
          path: rel,
          text: readIfExists(join(repoRoot, rel)) ?? '',
        })),
      })
    },
  },
  {
    name: 'tcc-dead-grant',
    remediation:
      '把「关掉再打开」这句处置写进 packaging/INSTALL-GUIDE.md 与出货 README，并让安装收尾真的调用 tools/tcc-grant-status.sh：换签名身份后，隐私界面会把「绑在旧代码上」的授权显示成「已开启」，界面上看不出异常（ADR-0068）',
    run() {
      return checkTccDeadGrantRule({
        installScript: readIfExists(join(repoRoot, 'packaging', 'installer', 'install.sh')) ?? '',
        assembleScript: readIfExists(join(repoRoot, 'packaging', 'assemble.sh')) ?? '',
        installGuide: readIfExists(join(repoRoot, 'packaging', 'INSTALL-GUIDE.md')) ?? '',
      })
    },
  },
  {
    name: 'tcc-grant-status-selftest',
    remediation:
      '跑 bash packaging/scripts/tcc-grant-status-test.sh 看红在哪条：死授权检出器必须能说「不」（R1 死授权→3、R2 有效→0、R3 封条破损→4 且不误报、R4 无记录→0、R5 要求解不出→4 且不把工具错误文本当要求、R6 非必需项的残留不污染结论、R7 --format=tsv 契约），并在恒真桩突变下失效（M1）。缺签名身份时自测声明跳过，不算失败（ADR-0068）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'tcc-grant-status-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`死授权检出器自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'tcc-form-selftest',
    remediation:
      '跑 bash packaging/scripts/verify-tcc-form-test.sh 看红在哪条：判据⑤（升级不重置授权）能否成立，取决于库里那条要求是**身份型**还是 cdhash 型，而两种形态下 doctor 都报 true。F1/F2 用真实读数做正反例，F5 钉住「非必需项不得污染判决」，F6 钉住「读不懂的格式默认不通过」（ADR-0063 / ADR-0069）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'verify-tcc-form-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`要求形态判读自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'tcc-persistence-selftest',
    remediation:
      '跑 bash packaging/scripts/verify-tcc-persistence-test.sh 看红在哪条：判据⑤（升级不重置授权）在出货前的唯一静态证明，必须同时满足「新版仍被旧授权接受」与「换字节即被拒」——只会说通过的那一支等于没判（ADR-0063）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'verify-tcc-persistence-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`判据⑤ 静态证明自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'readme-heredoc-literal',
    remediation:
      '出货 README 的 heredoc 是 `<<EOF`（未加引号），正文里的裸反引号与 `$(` 会在**打包时**被 shell 执行：2026-09-13 实测两起——`macos-harness doctor` 的原始 JSON 被打进客户 README、`$(basename "$PWD")` 被展开成构建机目录名（客户看到跑不通的 `shasum ../packaging.dmg`）。反引号写成 \\`，命令替换写成 \\$(；`$VERSION` 一类参数展开是有意的，放行（ADR-0069）',
    run() {
      return checkReadmeHeredocIsLiteral({
        assembleScript: readIfExists(join(repoRoot, 'packaging', 'assemble.sh')) ?? '',
      })
    },
  },
  {
    name: 'setup-app-locator',
    remediation:
      '跑 bash packaging/scripts/setup-app-locate-test.sh 看红在哪条：安装器必须能在「同级没有载荷」时从挂载卷找到安装包（从 dmg 里双击就会被 macOS 随机重定位，这是常态），也不得要求 install.sh 有可执行位（脚本是用 /bin/bash 跑的）。缺 swiftc 时先 xcode-select --install（ADR-0066）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'setup-app-locate-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 300000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /✗|TEST FAILED|缺少 swiftc/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`安装器定位自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'release-artifacts-intact',
    remediation:
      '已发布版本的产物不见了：清单（release/<版本>.sha256，已进 git）承诺过那串字节。找回：bash packaging/scripts/release-restore.sh <版本>（从仓库外归档），或 --from <外部副本>（客户/聊天软件里那份，哈希对上才收）。禁止用同一版本号重制（ADR-0057）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'release-verify.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 300000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /✗|\[release-verify\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`发布产物核对失败（${verdict}）`],
      }
    },
  },
  {
    name: 'release-published',
    modes: ['full'],
    remediation:
      '入库版本没有分发面，客户拿不到：按 docs/sop/dmg-release.md §6 发布——gh release create "v<版本>" --title … --notes-file … --verify-tag "packaging/release/<版本>/DSH-Desktop-LUTE-<版本>-mac-arm64.dmg" "packaging/release/<版本>/SHA256SUMS"（历史版本另加 --latest=false，免得被创建时间顶成 Latest）。射程 = **既有** release/<版本>.sha256、**又有** v<版本> tag 的版本（ADR-0076）：只有清单没有 tag（如 2.3.2，通过发布判据之前就被取代）与只有 tag 没有清单（如 2.0.1，早于清单机制）都在射程外，不构成红。gh 不可用或未认证时报**跳过**——跳过不算通过',
    run() {
      let releases
      try {
        const raw = execFileSync('gh', ['release', 'list', '--limit', '200', '--json', 'tagName,isDraft'], {
          encoding: 'utf8',
          timeout: 60000,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        releases = JSON.parse(raw).map((row) => ({ tag: row.tagName, isDraft: row.isDraft }))
      } catch (error) {
        // 读不到 ≠ 都发了。三态里这是 skip（ADR-0075 / P-02）。
        const reason = String(error?.stderr ?? error?.message ?? error)
          .split('\n')
          .filter(Boolean)[0]
        return {
          passed: true,
          skipped: true,
          violations: [],
          note: `gh release list 读不到（${reason}）——本项**未核对任何版本**（不是「都发了」）`,
        }
      }
      const scope = selectPublishTargets({
        manifestVersions: publishedManifests(),
        taggedVersions: releasedVersions(),
        releases,
      })
      if (scope.vacuous) {
        return {
          passed: true,
          skipped: true,
          violations: [],
          note: `${scope.note}——本项**未核对任何版本**（不是「都发了」）`,
        }
      }
      const violations = [
        ...scope.missing.map((version) => `v${version} 有入库清单且有 tag，但 GitHub Releases 上没有它`),
        ...scope.drafts.map((version) => `v${version} 的 Release 仍是 draft——对客户不存在`),
      ]
      return { passed: violations.length === 0, violations, note: scope.note }
    },
  },
  {
    name: 'release-published-scope-selftest',
    remediation:
      '跑 node --test scripts/gates/release-publish-scope.test.mjs 看红在哪条：射程判据必须能说「不」——只有清单没有 tag（v2.3.2 的形状）与只有 tag 没有清单（v2.0.1 的形状）都必须出局且不得变成永久红，draft 必须算未发布，射程为空必须报空而不是报通过。重点是恒真桩突变：把 missing 恒置空、把 draft 读成已发布、或把射程换成「所有 release/*.sha256」，用例必须失效（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/release-publish-scope.test.mjs', '发布面核对判据的反向自测失败')
    },
  },
  {
    name: 'changelog-release-sections',
    remediation:
      '已发布版本（**既有** release/<版本>.sha256、**又有** v<版本> tag）必须在 CHANGELOG.md 里有它自己的一行 `## [<版本>]`——CHANGELOG 是客户在仓库里读「这版改了什么」的家，没有段就等于那一版在文档里不存在。补段的内容取自该版的 GitHub Release notes（已发布的权威记录，不要凭记忆写），`[Unreleased]` 留在最上面给下一个未发布版本用；写完跑 `pnpm run gate`。射程与 `release-published` 同一把尺（ADR-0076）：只有清单没有 tag 的 2.3.2、只有 tag 没有清单的 2.0.1 都在射程外；git tag 读不到（浅克隆）时射程为空，此时版本段部分报**跳过**（跳过不算通过）。`packaging/CHANGELOG.md` 只查「`## [Unreleased]` 至多一个」——它是流水线细节的账，某版打包面没变化时**合法地**没有段，对它也要求逐版成段只会造出一条会被关掉的噪声规则（P-02 的死法）',
    run() {
      const scope = selectPublishTargets({
        manifestVersions: publishedManifests(),
        taggedVersions: releasedVersions(),
      })
      const readDoc = (relPath, requireVersionSections) => {
        try {
          return { path: relPath, text: readFileSync(join(repoRoot, relPath), 'utf8'), requireVersionSections }
        } catch {
          // 读不到正文交给判据去判红（删空这份账不该是绿的），不在这里静默降级。
          return { path: relPath, text: '', requireVersionSections }
        }
      }
      const result = checkChangelogSections({
        publishedVersions: scope.inScope,
        documents: [
          readDoc(ROOT_CHANGELOG_REL_PATH, true),
          readDoc(PACKAGING_CHANGELOG_REL_PATH, false),
        ],
      })
      // 结构规则（Unreleased 至多一个）与射程无关，所以它**永远**说话：
      // 射程为空时，只有「没有任何违规」才可以报跳过。
      if (result.vacuous && result.violations.length === 0) {
        return {
          passed: true,
          skipped: true,
          violations: [],
          note: `${scope.note}——射程为空，本项**未核对任何版本的版本段**（只查了「Unreleased 至多一个」）`,
        }
      }
      const note = result.vacuous ? `${scope.note}（射程为空，只查了结构规则）` : result.note
      return { passed: result.passed, violations: result.violations, note }
    },
  },
  {
    name: 'changelog-release-sections-selftest',
    remediation:
      '跑 node --test scripts/gates/changelog-release-sections.test.mjs 看红在哪条：版本段判据必须能说「不」——修复前那份真实文本（账停在 Unreleased、2.3.3 与 2.4.0 没有段）必须判红，而补齐后必须判绿；`## [2.4.0-rc.1]` 不得冒充 `## [2.4.0]`，正文里出现版本号但**没有标题**不得算成段，并列多个 `## [Unreleased]` 必须红，账读不到正文必须判红而不是跳过，射程为空必须报 vacuous 而不是通过。重点是恒真桩突变：把判据换成 `text.includes(version)`、或把「读不到」写成 `continue`，对应用例必须失效（P-02 / P-03）',
    run() {
      return runNodeTestFile(
        'scripts/gates/changelog-release-sections.test.mjs',
        'changelog 版本段判据的反向自测失败',
      )
    },
  },
  {
    name: 'release-verify-selftest',
    remediation:
      '跑 bash packaging/scripts/release-verify-test.sh 看红在哪条：「已发布产物不许被删、也不许只剩半截」这条判据必须能说「不」。V2/V3 钉住新增的「字节在、清单不全」红灯（2026-09-13 release-restore 把整目录改名留档却只拷回 dmg，清单滞留在 *.replaced-* 里而无人报错）；V4/V5 钉住「清单在、字节没了」与哈希不符；V6 钉住「本机没发布过」不假红；V7/V8 钉住「豁免会过期」——字节已在位却还留着 .lost 判红（2026-09-13 的 2.3.1 由飞书副本找回后正是这形态），而如实宣告的缺席仍判绿；R1/R2/R3 钉住找回时清单随行、不重复留档、哈希不符拒收（ADR-0057 / ADR-0058）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'release-verify-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`发布产物判据自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'shipped-presets-scope-selftest',
    remediation:
      '跑 bash packaging/scripts/select-presets-test.sh 看红在哪条：「预设出货面只能由白名单决定」这条判据必须能说「不」。S2 是本次缺陷的回归钉——2026-09-13 实测 assemble.sh 的整目录 `cp -R ~/.dsh/.agent-presets/.` 把本机自有的机器人助理智能体预设 bobo-cto 静默发进 2.3.0~2.3.3 的 payload（出货 completeness.json 的 presets = 52 条含它）；S3/S4/S5 钉住「登记了但不存在」「岗位数量不符」「登记不写理由」三种腐烂；P1 钉住入口判定在符号链接路径下不许静默不干活；M1 在恒真桩突变下必须失效（ADR-0073）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'select-presets-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`预设出货白名单判据自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'preset-rows-resolvable-selftest',
    remediation:
      '跑 bash packaging/scripts/check-preset-rows-test.sh 看红在哪条：「出货 preset 的每一行必须在出货面里解析得到」这条判据必须能说「不」。S2 是本次缺陷的回归钉——2026-09-14 实测 2.4.0 的 payload 里 presets/agt-033/agent.cordis.yml 带着本机装配行 dsh-kol-hunter-local，客户机的出货 profile 里没有该包（ADR-0056 要求剥掉）→ 客户打开 DSH 时「结伴 · 达人与联盟合作」preset 加载失败；当时的守卫看不见它，因为那条判据是**反向特征**：先在本机 profile 的 file: 依赖里算「外部产品名」再拿去删行，而装配那一刻本机的那半事实已被上一次安装抹掉，脚本如实报告「✓ 出货面没有本机装配的外部产品」。S4/S5 是同一份字节、只换解析面的一对（结论必须相反）——钉住判据看的是出货面而不是本机状态；S3 钉住已登记的行会被剥掉（含紧贴其上的注释，不留下描述「不存在的行」的话）；S6 钉住路径形态的 name 判红并说清是 ADR-0056 的那种坏法；S7/S8/S9 钉住「解析面读不到」「登记处读不到」「登记不写 why」三种都响亮失败而不是退化成「无发现」；S10 钉住过期登记只告警不判红；P1 钉住入口判定在符号链接路径下不许静默不干活；M1 在恒真桩突变下必须失效（ADR-0084）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'check-preset-rows-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`出货预设行解析判据自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'build-path-rewrite-selftest',
    remediation:
      '跑 bash packaging/scripts/rewrite-build-paths-test.sh 看红在哪条：「出货副本里的构建机路径必须换成占位符」这条判据必须改得动、也必须在改不完时喊。R1 钉住五类已知前缀（含带空格的 Application Support 路径）；R2 钉住未登记形态响亮失败；R3 幂等；R4 二进制不误伤；P1 钉住符号链接路径下的入口判定；M1 抹掉一条映射后 R1 必须失效（ADR-0073）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'rewrite-build-paths-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`构建机路径改写判据自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'machine-path-tarball-selftest',
    remediation:
      '跑 bash packaging/scripts/scan-machine-paths-test.sh 看红在哪条：「守卫能看见 payload tarball 里面」这条判据必须能说「不」。T1 钉住 tarball 内的命中被看见且带 tarball 名前缀——2026-09-13 实测守卫在内嵌 profile 上报 `✓ 无新增（当前 37 条，基线 39 条）`，而同一版出货的 skills-presets.tar.gz 解开再扫是 103 个含构建机路径的文件；T2 钉住干净 tarball 判绿；T3 钉住二进制成员不误报；T4 钉住缺失的 tarball 响亮失败；M1 在恒真桩突变下必须失效（ADR-0073）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'scan-machine-paths-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`出货 tarball 机器路径判据自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'shipped-skills-scope-selftest',
    remediation:
      '跑 bash packaging/scripts/select-skills-test.sh 看红在哪条：「技能出货面 = 引用集 ∪ 产品级白名单 − 受限许可」这条判据必须能说「不」。S1 钉住白名单救回未被引用的技能——2026-09-13 实测排除 bobo-cto 后它引用的 15 个工程技能一并掉出（349 → 334），因为它们从未被产品显式要过；S2/S3/S4/S5 钉住名单的四种腐烂（名字不存在、与受限许可同名、缺 why、文件缺失不得当空名单）；S6/S7/S8 钉住落位树必须逐名等于选择结果（少发与多发同罪）；S9 钉住冗余条目仍须打印；P1 钉住符号链接路径下的入口判定；M1 在恒真桩突变下必须失效（ADR-0074）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'select-skills-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return {
        passed: false,
        violations: lines.length > 0 ? lines : [`技能出货白名单判据自测失败（${verdict}）`],
      }
    },
  },
  {
    name: 'pitfalls-playbook',
    remediation:
      '按 docs/pitfalls-playbook.md 头部写明的契约补齐：每条 `## P-NN · 标题` 必须有「症状 / 根因类 / 已落地机制 / 下一版默认动作」四段；「已落地机制」必须点名真实存在的 `gate:<名字>`（见 node scripts/gate.mjs --list）或 `script:<路径>`——机制没有名字就等于自我安慰；编号自 P-01 起连续；正文相对链接可达（**逐字引用的坏链写进行内代码或代码块即可**——「哪段文字算链接」与 docs-link-integrity 共用同一份实现，不会因为没有第二份拷贝而冤枉引用缺陷原文的条目）；且 AGENTS.md 与 docs/README.md 都必须链接本账（没入口的总账等于不存在）',
    run() {
      return checkPitfallsPlaybook({
        playbookText: readIfExists(join(repoRoot, PLAYBOOK_REL_PATH)),
        // 注册表的**实时**名字列表：条目点名一个被改名或删掉的门禁，当场红灯。
        gateNames: CHECKS.map((check) => check.name),
        fileExists: (path) => existsSync(join(repoRoot, path)),
        backlinkTexts: Object.fromEntries(
          PLAYBOOK_BACKLINK_PATHS.map((path) => [path, readIfExists(join(repoRoot, path))]),
        ),
      })
    },
  },
  {
    name: 'pitfalls-playbook-selftest',
    remediation:
      '跑 node --test scripts/gates/pitfalls-playbook.test.mjs 看红在哪条：总账校验必须能说「不」。缺段/空段/跳号/重号/链接不可达/缺入口各有一条反例，重点是「恒真桩突变」——把每条机制换成「有门禁守着」这类永远成立的免责话，校验必须失效；链接那半另有一对用例（行内代码里逐字引用的坏链不得判红、同段里真实的坏链仍必须判红——那条钉子防的是把「跳过行内代码」做成「跳过一切」）；只会判绿的清单校验比没有校验更坏（P-02 / P-03 / P-07）',
    run() {
      return runNodeTestFile('scripts/gates/pitfalls-playbook.test.mjs', '总账校验的反向自测失败')
    },
  },
  {
    name: 'docs-link-integrity',
    remediation:
      '按报错里的「链接 → 解析后的路径」改正层级：相对链接以**本文件所在目录**为基准。最常见的一种是 Note（住在 docs/notes/<lifecycle>/<class>/ 下）指向 docs/adr/ 的 ADR 时写成两层上溯——正确的三层是 ../../../adr/ADR-00XX.md；写错时它不会「点不开」，而是把「没有依据」伪装成「有依据」。代码块与行内代码里的链接不校验（模板占位符与示例不算链接）',
    run() {
      return checkDocsLinkIntegrity({
        docs: collectDocFiles(),
        fileExists: (path) => existsSync(join(repoRoot, path)),
      })
    },
  },
  {
    name: 'docs-link-integrity-selftest',
    remediation:
      '跑 node --test scripts/gates/docs-links.test.mjs 看红在哪条：文档链接校验必须能说「不」（层级少写一层要判红并报出解析后的错误路径），也必须不误报（代码块模板占位符、行内代码示例、外链、页内锚点、带锚点的相对链接都不该判红）——会误报的校验很快会被当成噪声关掉（P-02）；「哪段文字算链接」这条规则与 pitfalls-playbook 共用 `scripts/gates/checks.mjs` 的 `collectDocLinks`，本用例是它唯一的钉子（把规则改回「不跳行内代码」，这里必须红）',
    run() {
      return runNodeTestFile('scripts/gates/docs-links.test.mjs', '文档链接校验的反向自测失败')
    },
  },
  {
    name: 'dead-instrument',
    remediation:
      '按报错把那处判据换掉：登记簿（scripts/gates/dead-instruments.json）里每一条都是**实测过会给出空读数**的仪器——空读数被当成结论，是 2026-09-13 白屏那类事故的成因。替代物写在登记项的 useInstead 里（例如「在不在跑」用 script:packaging/scripts/dsh-running.sh，退出码 0/1/2/4，4 = 判不了必须中止）。若该处是**引用**它作反例，把仪器片段写成「…」引用形式即可（仓库约定）。新增一条登记项门槛同 pitfalls-playbook：可复现的命令 + 原始读数 + 替代物，缺一判红（ADR-0080）',
    run() {
      const files = collectPrescriptionSurfaces()
      if (files === null) {
        // 取不到射程必须判红：静默变成「没扫」就等于这条判据不存在（P-02）。
        return {
          passed: false,
          violations: ['git ls-files 取不到射程——本项本次未核对任何文件（不是「都干净」）'],
        }
      }
      return checkDeadInstrument({
        registryText: readIfExists(join(repoRoot, DEAD_INSTRUMENTS_PATH)) ?? '',
        files,
      })
    },
  },
  {
    name: 'dead-instrument-selftest',
    remediation:
      '跑 node --test scripts/gates/dead-instrument.test.mjs 看红在哪条：本项必须能说「不」——**用 2026-09-13 的缺陷原文**（SOP §0 那条 `pgrep -f` 检查项）配**真登记簿**当输入必须判红、围栏代码块里的同一句也必须判红、脚本代码行里的使用必须判红，而「…」引用形式与散文提及必须放行（那是决定，不是遗漏）；空登记簿、登记项缺证据字段、射程为空、判据面抽出 0 行都必须判红。M3 是恒真桩突变：把模式换成永不匹配的串，缺陷原文就必须漏过——否则拦住它的不是登记簿内容（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/dead-instrument.test.mjs', '死仪器判据的反向自测失败')
    },
  },
  {
    name: 'dsh-running-selftest',
    remediation:
      '跑 bash packaging/scripts/dsh-running-test.sh 看红在哪条：判据必须能说「不」——R1 造出的真进程在跑时→0，R3 **同一条路径、同一份字节**、进程退出后→1（读数跟着进程在不在变），R2 同目录未运行的邻居必须判 1（防「见谁都算命中」），R4 `ps` 读不出→4 而**不是** 1（读不到 ≠ 没有在跑），R5 用法错误→2，R6a~R6c 用受控进程表钉住 `--any` 的尾锚定，R7 在真实靶子上对照；M1/M2 恒真桩突变证明 R1/R3 有牙（ADR-0080）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'dsh-running-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return { passed: false, violations: lines.length > 0 ? lines : [`运行中判据自测失败（${verdict}）`] }
    },
  },
  {
    name: 'installer-running-guard-selftest',
    remediation:
      '跑 bash packaging/scripts/installer-running-guard-test.sh 看红在哪条：安装器 0b 闸守白屏红线，必须**正确消费**那条共享判据——T1 没有实例在跑→放行，T2 实例在跑且退不出去→中止（不得继续替换 app bundle），T3 载荷缺 tools/dsh-running.sh→中止（缺判据 ≠ 没有实例在跑），T4 退出码 4（判不了）→中止且不得打印「无运行中的 DSH 实例」，M1 恒真桩突变证明 T4 有牙。抽不出完整的 0b 块同样判红，不静默变成空转（ADR-0080）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'installer-running-guard-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]|\[自测\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return { passed: false, violations: lines.length > 0 ? lines : [`安装器 0b 闸自测失败（${verdict}）`] }
    },
  },
  {
    name: 'installer-preset-update-selftest',
    remediation:
      '跑 bash packaging/scripts/installer-preset-update-test.sh 看红在哪条：安装器 5/6 对「技能」与「预设」必须是**两条语义**——技能合并不覆盖（技能文件里住着用户状态：算法技能页的开关写在 SKILL.md 的 frontmatter 上，ADR-0083），预设按产品内容处理（载荷里的那些有差异先备份、再整体替换；载荷里没有的一律不动，客户自建的预设不是产品内容）。T1 钉住替换 + 旧副本进 .pre-lute-<stamp> 备份，T2 钉住技能那一半**没有**被一起改成覆盖，T3 钉住客户自建预设原地不动，T4/T5 钉住「一致就不动、不留同内容备份」与「新增项装上且不产生备份」，T6 钉住 RESTORE_PRESETS 接上回滚，M1 把替换退回旧的 `cp -Rn` 后 T1 必须失效。背景：2.4.0 的 payload 里 agt-033 带着一条本机装配行 → 客户机「结伴」preset 加载失败，而 `cp -Rn` 让修好的下一版也覆盖不上已装机器（ADR-0084）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'installer-preset-update-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]|\[自测\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return { passed: false, violations: lines.length > 0 ? lines : [`安装器预设更新语义自测失败（${verdict}）`] }
    },
  },
  {
    name: 'brand-icons',
    remediation:
      '按报错对齐三处的**同一张表**（它在 dsh-patches/brand-replay.sh 的 ICON_PAIRS 里）：表 ↔ 资产目录 `packaging/assets/brand-icons/` ↔ 已装 app 的 `app.asar.unpacked/build/`。少一个资产、多一个没被引用的资产、资产的实际像素与声明不符、目标名重复、已装 app 里没有那个目标名——都判红。重点在**资产那一侧**：`brand-replay.sh --apply` 量的是目标尺寸，资产自己错了没人管，`cp` 照落（Dock 图标成一张放大的模糊图而读数全绿，ADR-0081）',
    run() {
      const dir = join(repoRoot, BRAND_ICONS_ASSETS_DIR)
      const assets = existsSync(dir)
        ? readdirSync(dir)
            .sort()
            .map((name) => ({ name, bytes: readFileSync(join(dir, name)) }))
        : []
      // 目标侧（已装 app）：读不到就传 null —— 那是「未核查」，本项会报 skip 而不是通过。
      // 2.0.10 起 no-ASAR（Resources/app/build），双形态探测见 scripts/lib/app-resources.mjs。
      const buildRoot = appResourcesRoot(join('/', 'Applications', 'DSH Desktop.app'))
      const buildDir = buildRoot === null ? '' : join(buildRoot, 'build')
      let installedBuildDirEntries = null
      try {
        installedBuildDirEntries = readdirSync(buildDir)
      } catch {
        installedBuildDirEntries = null
      }
      return checkBrandIcons({
        replayText: readIfExists(join(repoRoot, BRAND_REPLAY_REL)) ?? '',
        assets,
        installedBuildDirEntries,
      })
    },
  },
  {
    name: 'brand-icons-selftest',
    remediation:
      '跑 node --test scripts/gates/brand-icons.test.mjs 看红在哪条：本项必须能说「不」——资产实际像素与声明不符必须判红（M1 恒真桩突变钉住这一条：只比「声明 vs 声明」的实现会放过它，因为那不是从磁盘字节读出来的）、少一个/多一个资产都判红、目标名重复判红、表解析不出任何一行判红、已装 app 缺目标名判红、非 PNG 读不出尺寸判红，而目标侧不在射程时必须报 skip 且静态半照常说话（ADR-0081 / P-02 / P-07）',
    run() {
      return runNodeTestFile('scripts/gates/brand-icons.test.mjs', '运行时图标资产判据的反向自测失败')
    },
  },
  {
    name: 'brand-replay-selftest',
    remediation:
      '跑 bash packaging/scripts/brand-replay-test.sh 看红在哪条：第 5 块是**写**路径（把 Dock / 托盘图标从官方原样换成品牌态），静态判据只能守表与资产一致，「落笔写了什么字节」只有真跑一次才知道——R1 报出 8 处 DRIFT、R2 落笔 8 处、**R3 逐字节等于资产（sha256）**、R4 重跑幂等全 OK、R5 目标尺寸与声明不符时**拒绝落笔**（那意味着基座换了图标规格）、R6 资产目录为空时判 MISSING（读不到 ≠ 合格），M1 恒真桩突变证明 R3 比的是真资产。夹具是**不完整**的假 app，故只断言 build/ 那几行、不断言收尾判决行与退出码（原因见脚本头部，ADR-0081）',
    run() {
      const script = join(repoRoot, 'packaging', 'scripts', 'brand-replay-test.sh')
      const result = runScript(repoRoot, `bash "${script}"`, 120000)
      if (result.code === 0) return { passed: true, violations: [] }
      const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      const lines = text
        .split('\n')
        .filter((line) => /\[FAIL\]|\[自测\]/.test(line))
        .map((line) => line.trim())
      const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
      return { passed: false, violations: lines.length > 0 ? lines : [`品牌重放自测失败（${verdict}）`] }
    },
  },
  {
    name: 'changed-packages',
    remediation:
      '为本次改动的包补 typecheck 与 test 脚本，或按 ADR-0014 登记豁免（只减不增）。'
      + '若报的是「改动射程未知」，那是基线问题而不是包的问题：CI 请设置 DSH_GATE_BASE_SHA（事件 base SHA 且必须已 fetch），'
      + `本地请确认 ${LOCAL_BASE_REF} 存在并已 fetch——未知射程不得退化成「无改动」`,
    run() {
      const manifests = collectManifests().filter((entry) => entry.dir !== '.')
      const exempted = JSON.parse(readIfExists(EXEMPTIONS_PATH) || '[]').map((row) => row.package)
      const scope = resolveChangedScope({
        git: createGitRunner({ cwd: repoRoot }),
        env: process.env,
        packages: manifests,
      })
      if (!scope.ok) {
        // 射程未知时**不能**退化成空集：空集会让本项少看几个包，而读数上
        // 与「这些包都合规」完全同形（P-02）。这里直接判红并把原因原样带出。
        return {
          status: 'fail',
          expected: 1,
          discovered: 0,
          checked: 0,
          skipped: 0,
          failed: 1,
          typedSkips: [],
          reason: '改动射程未知',
          violations: [scope.reason],
        }
      }
      return checkChangedPackages({
        changed: scope.packages,
        packages: manifests,
        exempted,
        scope,
      })
    },
  },
  {
    name: 'changed-packages-selftest',
    remediation:
      '跑 node --test scripts/gates/changed-packages.test.mjs 看红在哪条：本项必须能说「不」——本地 main 超前 origin/main 时 `main...HEAD` 自比较恒为空（MUT 关掉 untracked 来源后有 5 条判红）、untracked 新包必须进射程、base 不可解析必须判红而不是返回空集、rename 必须同时映射旧包与新包、分叉的事件 base 必须被拒；也必须不误报——路径按分段边界归属（`packages/a/b` 不得冒领 `packages/a/bc`）、只有被证明为空的完整并集才算空射程、未登记治理规则的根级改动只进读数桶。`L2` 一节对当前仓库**只读**对账 `git status`，证明没有路径在中间消失（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/changed-packages.test.mjs', '改动射程判据的反向自测失败')
    },
  },
  {
    name: 'exemptions-frozen',
    remediation: '不得新增豁免条目；补齐后请删除条目，期限不可延后（ADR-0014）',
    run() {
      const baselineExists = baselineFileExists(EXEMPTIONS_PATH)
      return checkExemptions({
        exemptions: JSON.parse(readIfExists(EXEMPTIONS_PATH) || '[]'),
        baseline: baselineExists ? readBaselineFile(EXEMPTIONS_PATH) : [],
        today: new Date().toISOString().slice(0, 10),
        baselineExists,
      })
    },
  },
  {
    name: 'patch-anchors',
    modes: ['full'],
    remediation:
      '运行 packaging/verify-patches-v2.sh 看 MISSING/FAIL 明细；补丁确实丢失时需重打并按 ADR-0018 的教训改用稳定锚（勿依赖内容哈希文件名）。注意本项的**射程**：只量本机 /Applications 与**未打 tag** 的 staging 树——打过 tag 的版本由产物（DMG + 入库清单哈希，ADR-0067）负责，不在这里量（ADR-0075）',
    run() {
      const script = join(repoRoot, 'packaging', 'verify-patches-v2.sh')
      /** 跑一棵 app 树，返回 { tree, passed, lines }。 */
      const checkTree = (tree) => {
        const result = runScript(repoRoot, `DSH_APP="$DSH_APP_TEST" bash "${script}"`, 300000, { DSH_APP_TEST: tree })
        // 两个流都要扫：这里是按正则**过滤**，不存在 ADR-0043 的「体量大的流挤掉小的」
        // 问题——那位移只在按位置截尾时发生。锚点明细写在哪个流由脚本自己决定。
        const lines = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
          .split('\n')
          .filter((line) => /^(MISSING|FAIL)/.test(line))
        const verdict =
          result.code === null
            ? `补丁锚点校验未给出退出码${result.note ? `（${result.note}）` : ''}`
            : `补丁锚点校验失败（退出码 ${result.code}）`
        return { passed: result.code === 0, lines: lines.length > 0 ? lines : [verdict] }
      }
      // 两处 target，判据同一条：
      //   ① 本机 /Applications —— 开发机运行时真值（未安装则不在射程内）；
      //   ② packaging/staging/*/app —— **待发布**的装配产物。加这一处是因为「装配产物里补丁丢了」
      //      与「本机 app 里补丁在」可以同时成立：P0-9(RootOutlet) 曾长期只在本机 app 上，
      //      而 staging 树发的是 pristine（.scratch/pre-dmg-diagnosis B3）。
      //
      // 射程曾经是「staging 下**所有** app 树」，于是它把**随时间单调增长的锚点清单**套到
      // **随时间累积的历史产物**上：任何一棵在「某条锚」出现之前装配的树都永久判红，而这个红
      // 与「本次装配把补丁弄丢了」在输出上不可区分——清理历史于是成了让本项变绿的唯一手段。
      // 而且它的绿也不可信：实测 `staging/2.3.1/app` 在该版发布之后被就地改过（守卫文件 mtime
      // 晚于发布时刻），那棵树的绿不证明任何出厂字节。判据移入 gates/patch-anchor-scope.mjs
      // （纯函数 + 反向自测），射程 = 本机 app ∪ 未打 tag 的树；射程为空时报**跳过**，不报通过。
      const appDir = join('/', 'Applications', 'DSH Desktop.app')
      // 2.0.10 起官方产物 no-ASAR（Resources/app/），2.0.5 及以前为 app.asar.unpacked；
      // 双形态探测让本判据在迁移期（生产 2.0.5 与 2.5.0 staging 并存）两侧都能找到目标。
      const appInstalled = appResourcesRoot(appDir) !== null
      const stagingRoot = join(repoRoot, 'packaging', 'staging')
      const stagingVersions = existsSync(stagingRoot)
        ? readdirSync(stagingRoot).filter((version) =>
            appResourcesRoot(join(stagingRoot, version, 'app', 'DSH Desktop.app')) !== null,
          )
        : []
      const scope = selectAnchorTargets({
        stagingVersions,
        taggedVersions: releasedVersions(),
        appInstalled,
      })
      if (scope.vacuous) {
        // 「没量任何东西」与「量了都合格」必须分开报：空射程报 skip（见 ADR-0075 / P-02）。
        return {
          passed: true,
          skipped: true,
          violations: [],
          note: `${scope.note}——本项本次**未校验任何树**（不是「补丁都在」）`,
        }
      }
      const targets = [
        ...(scope.checkInstalledApp ? [appDir] : []),
        ...scope.scanStaging.map((version) => join(stagingRoot, version, 'app', 'DSH Desktop.app')),
      ]
      const violations = []
      for (const tree of targets) {
        const { passed, lines } = checkTree(tree)
        if (!passed) violations.push(...lines.map((line) => `${relative(repoRoot, tree)}: ${line}`))
      }
      return { passed: violations.length === 0, violations, note: scope.note }
    },
  },
  {
    name: 'patch-anchors-scope-selftest',
    remediation:
      '跑 node --test scripts/gates/patch-anchor-scope.test.mjs 看红在哪条：扫描集判据必须能说「不」——已打 tag 的树必须退出扫描、未打 tag 的（含同号重制的新树）必须纳入、射程为空必须报空而不是报通过。重点是恒真桩突变：把过滤换成「无条件纳入」或把空射程恒置 false，用例必须失效；测不出来的判据等于没有判据（P-02 / P-11）',
    run() {
      return runNodeTestFile('scripts/gates/patch-anchor-scope.test.mjs', '补丁锚点扫描集判据的反向自测失败')
    },
  },
  {
    name: 'dmg-layout-doc',
    remediation:
      '按报错改正三选一：①SOP 里又在复述卷内清单（或断言了拖拽式交付形态）→ 把那份清单换掉，改成指向 packaging/INSTALL-GUIDE.md 第 2 节的名字，让本条去做两向对照；②卷与入口表逐名对不上 → 判断哪边是对的那个，然后改另一边（新增载荷文件要登记进手册，手册里写的文件必须真的在卷上）；③手册**正文里**的链接指向未随包的文件（R6）→ 要么把它加进载荷，要么把链接改成指向手册自己的章节——链接在**仓库里**可达不等于**随包**可达（2026-09-14 实测：手册开头的 `[安装卡](INSTALL-CARD.md)` 自 2.2.0 起从未进过任何一版载荷，而所有门禁都绿）。⚠️ 已打 tag 的版本不在射程内（它由产物自己冻结，ADR-0067）——读数里的「不参与」点名了它们是哪些',
    run() {
      // 交付形态是**产物**的属性，不是**文档**的属性（ADR-0077 / P-14）。
      // 2026-09-13 实测：SOP §5 三处描述的是上一版的形态（可拖拽安装盘），而 2.3.3 是离线安装器
      // 载荷——§5.1 的 codesign 路径在那个目录下根本不存在、§5.2 断言卷根有 .app 与 Applications
      // 快捷方式、§5.4 教用户把 app 拖进 /Applications。三处都判不出，因为没有任何判据把
      // 「文档断言的清单」与「产物真实的清单」比过一次。
      const sopText = readIfExists(join(repoRoot, DMG_LAYOUT_SOP_PATH))
      const guideText = readIfExists(join(repoRoot, DMG_LAYOUT_GUIDE_PATH))

      // 射程两处：① 已挂载的交付卷；② packaging/staging/ 下**未打 tag** 的 payload。
      // 与 patch-anchors 同一条规矩：射程跟着 git 走，不跟着磁盘走（ADR-0075 / P-11）。
      const volumes = []
      try {
        for (const name of readdirSync('/Volumes')) {
          if (!name.startsWith('DSH Desktop LUTE ')) continue
          const label = join('/Volumes', name)
          const version = name.slice('DSH Desktop LUTE '.length).trim() || undefined
          volumes.push({ label, version, entries: readdirSync(label) })
        }
      } catch {
        // /Volumes 读不到：不猜，直接当没有卷——射程为空会如实报 skip。
      }
      const stagingRoot = join(repoRoot, 'packaging', 'staging')
      const payloads = existsSync(stagingRoot)
        ? readdirSync(stagingRoot)
            .sort()
            .map((version) => ({ version, dir: join(stagingRoot, version, 'payload') }))
            .filter(({ dir }) => existsSync(dir))
        : []
      // 交付卷的版本号取卷名；payload 的版本号取目录名——两者由同一个 tag 家判「是否已发布」。
      const scope = selectLayoutTargets({
        volumes: volumes.map(({ label, version }) => ({ label, version })),
        payloadVersions: payloads.map(({ version }) => version),
        taggedVersions: releasedVersions(),
      })
      const inScope = [
        ...scope.scanVolumes.map(({ label }) => ({
          label,
          entries: volumes.find((volume) => volume.label === label)?.entries ?? [],
          // R6 要判**嵌套**链接（如 `tools/verify-patches-v2.sh`）是否随包，
          // 顶层条目不够——只给顶层就等于用「tools/ 这个目录在」冒充「那个文件在」。
          files: listFilesRecursive(label),
        })),
        ...scope.scanPayloads.map((version) => {
          const dir = join(stagingRoot, version, 'payload')
          return {
            label: `packaging/staging/${version}/payload`,
            entries: readdirSync(dir),
            files: listFilesRecursive(dir),
          }
        }),
      ]
      const result = checkDmgLayout({ sopText, guideText, artifacts: inScope })
      if (result.skipped) {
        // 「没量到任何东西」与「量了都合格」必须分开报（ADR-0075 / P-02）。
        return { ...result, note: `${result.note}（${scope.note}）` }
      }
      return { ...result, note: result.note ? `${result.note}（${scope.note}）` : scope.note }
    },
  },
  {
    name: 'dmg-layout-doc-selftest',
    remediation:
      '跑 node --test scripts/gates/dmg-layout.test.mjs 看红在哪条：交付卷形态判据必须能说「不」——SOP 没指向安装手册要判红、**用 2026-09-13 缺陷原文**（「应看到 DSH Desktop.app 与 Applications 快捷方式」）当输入必须判红、卷上有手册没登记的文件与手册登记了卷上没有的文件都必须判红、标为「✅ 可点入口」的项不存在必须判红、入口表解析不出条目时必须判红而不是当作「没什么可比的」放行、射程为空必须报 skip 而不是 ok（且静态半仍然说话）。R6 另有四例：手册正文链接的随包文件不在卷上必须判红（**用 2026-09-14 的缺陷原文** `](INSTALL-CARD.md)` 当输入）、外链/锚点/绝对路径必须被忽略而不得误报、嵌套链接必须按递归清单判（给 `tools/` 目录存在而里面的文件不在时必须红）、未给递归清单时嵌套链接必须计入「未核」而不得当作可达。重点是恒真桩突变：一个只检查「SOP 有没有链接安装手册」的实现会放过缺陷原文，一个只看顶层条目的实现会放过嵌套死链——测不出来的判据等于没有判据（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/dmg-layout.test.mjs', '交付卷形态判据的反向自测失败')
    },
  },
  {
    name: 'staging-freshness',
    modes: ['full'],
    remediation: '删掉陈旧 staging（rm -rf packaging/staging/<版本>）后重新装配：产物必须与仓库同源，否则「跑的是旧件」——历史两次教训见 packaging/RETROSPECTIVE.md 与 .scratch/pre-dmg-pipeline/spec.md 的 A1',
    run() {
      // 出货工具（payload/tools/*）必须与仓库同源。动机：2026-09-11 的 2.1.0 payload 是
      // 11:05 的快照，而当天 21:29~23:31 才修好 verify-patches-v2 的默认路径、install.sh、
      // sign-and-dmg、smoke——直接对那份 payload 制 dmg，客户跑校验工具默认必红。
      const stagingRoot = join(repoRoot, 'packaging', 'staging')
      if (!existsSync(stagingRoot)) {
        return {
          passed: true,
          skipped: true,
          violations: [],
          note: '可选 packaging/staging 不存在——本项未核对任何待发布载荷',
        }
      }
      const pairs = [
        ['payload/tools/verify-patches-v2.sh', 'packaging/verify-patches-v2.sh'],
        ['payload/tools/rewrite-file-deps.mjs', 'packaging/scripts/rewrite-file-deps.mjs'],
        ['payload/tools/reloc-aeis.sh', 'packaging/scripts/reloc-aeis.sh'],
        ['payload/tools/dsh-running.sh', 'packaging/scripts/dsh-running.sh'],
        ['payload/install.sh', 'packaging/installer/install.sh'],
      ]
      const violations = []
      for (const version of readdirSync(stagingRoot).sort()) {
        const payload = join(stagingRoot, version, 'payload')
        if (!existsSync(payload)) continue
        for (const [inPayload, inRepo] of pairs) {
          const a = join(payload, inPayload)
          const b = join(repoRoot, inRepo)
          if (!existsSync(a)) continue // 载荷没带这件工具（早代 payload 可能没有）→ 不判
          if (!existsSync(b)) continue
          if (!readFileSync(a).equals(readFileSync(b))) {
            violations.push(`packaging/staging/${version}/${inPayload} 与仓库 ${inRepo} 不同源（陈旧快照，勿据此制 dmg）`)
          }
        }
      }
      return { passed: violations.length === 0, violations }
    },
  },
  {
    name: 'worktable-fence',
    modes: ['full'],
    remediation: '若 dependencies / bundles / node_modules 任一处又出现 dsh-worktable：把它摘掉（ADR-0045）；若报「资产缺失」，从 git 恢复 vendor/dsh-worktable.pin 与 dsh-patches/worktable-fence/（卸载保留资产是为了可逆，不是漏删）',
    run() {
      // 环境相关：vendor 未 clone 时由 checkWorktableFence 自身报告跳过；但**安装面三项
      // 不依赖 vendor**，照判——否则一个漏装的插件正好能让这条判据静默消失。
      return checkWorktableFence({
        repoRoot,
        profileDir: join(homedir(), '.dsh', 'profiles', 'desktop'),
      })
    },
  },
  {
    name: 'node-interpreter',
    remediation: '开发脚本起子进程一律走 scripts/lib/real-node.mjs 的 nodeCommand()——process.execPath 在 pnpm 下是宿主 Electron，子进程会「退出码 0 且没有输出」（ADR-0040）',
    run() {
      return checkNodeInterpreter({ repoRoot })
    },
  },
  {
    name: 'skill-runtime-preconditions',
    remediation: '补齐已接线技能的运行时前提（跑 packages/capabilities/dsh-overseas-skills/scripts/install-runtime-deps.sh）；中文渲染红则重建 venv/etc/matplotlib 配置（SOP §12.10）',
    run() {
      return checkSkillRuntimePreconditions({ repoRoot })
    },
  },
  {
    name: 'skill-lines',
    remediation: '三条技能线各自的验证器判红了，看输出指名的那一条：出海线跑 scripts/verify_static.mjs、通用线跑 scripts/verify-generic.mjs、全栈线跑 scripts/verify-fullstack.mjs。SOP 把 verify_static 写成入库清单的一项，但在本项出现之前 `pnpm run gate` 里没有任何一项跑过它（P-03）',
    run() {
      return checkSkillLines({ repoRoot })
    },
  },
  {
    name: 'skill-lines-selftest',
    remediation: '跑 node --test scripts/gates/skill-lines.test.mjs 看红在哪条：本项自己就是为「判据从来没有跑到」而建的，所以它必须能说不——环境前提不在时必须是跳过（且 note 说清跳过了什么）而不是静默通过、验证器判红必须红且回传原文、验证器文件不存在必须红、第三个验证器红而前两个绿仍必须红、包内一条 spec 都没有必须红（空射程不得长得像通过，P-11）、恒真桩突变（把 passed 钉成常量 true）必须让用例失效。另有一条守卫钉住「红桩 key 打错字」这种**静默变空转**的反向用例（P-02：看起来验过了比没有验过更坏）',
    run() {
      return runNodeTestFile('scripts/gates/skill-lines.test.mjs', '三条技能线闸门的反向自测失败')
    },
  },
  {
    name: 'sidebar-row-axis',
    remediation: '把该行的 `box-sizing` / `width` / 水平 `margin` / 水平 `padding` 改成与同列一致（导航列 = 原生侧边栏行轴 `box-sizing: border-box; width: 100%; margin: 2px 0; padding: 0 10px`，实测行框 64…320、标签 x=106）；新增注入行则在 scripts/gates/sidebar-row-axis.mjs 的 REGISTRY 加一行。两行并排却各带一套宽度约定，就是 2026-09-13 那次的形态（P-07）',
    run() {
      return checkSidebarRowAxis({ repoRoot })
    },
  },
  {
    name: 'sidebar-row-axis-selftest',
    remediation:
      '跑 node --test scripts/gates/sidebar-row-axis.test.mjs 看红在哪条：行轴判据必须能说「不」——岗位矩阵退回 `width: calc(100% - 8px)` + `margin: 2px 4px` 必须判红、技能中心丢掉 `box-sizing` 必须判红、两行 `padding-inline` 不同必须判红、新增未登记的注入行必须判红、登记项指向不存在入口必须判红、`position` 从 after 改成 split 必须判红、选择器改名后必须判红而不是静默失去射程、射程为空必须判红而不是报通过。重点是恒真桩突变：一个只核对「登记了没有」的实现会放过行轴漂移——测不出来的判据等于没有判据（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/sidebar-row-axis.test.mjs', '注入式侧边栏行轴判据的反向自测失败')
    },
  },
  {
    name: 'settings-shell-criteria-selftest',
    remediation:
      '跑 node --test scripts/gates/settings-shell-criteria.test.mjs 看红在哪条：设置页探针必须用独立的 188px nav 与 28x28px close 锚校准，目标按钮不得反向参与 scale。自检覆盖 14 个已知状态与 typed unavailable；突变控制会把 target size、代数恒等式、锚冲突、L1、L2、pluginLoaded 分别改坏并要求稳定判红。纯函数用例，不碰 GUI、不需要应用在跑（P-02 / P-08 / P-25）',
    run() {
      return runNodeTestFile('scripts/gates/settings-shell-criteria.test.mjs', '设置页探针判据的射程自测失败')
    },
  },
  {
    name: 'theme-tokens',
    modes: ['full'],
    remediation: '改用真实 token（官方主题包或 dsh-theme-local 供给的名字）；存量违规登记在 scripts/gates/theme-tokens-baseline.json，该文件只减不增、条目失效即拒绝（ADR-0014、ADR-0028 的 C2 验收）——「只减不增」由 theme-tokens-baseline-frozen 判据守着，不是靠这句话。若被引用的是一个**组件自有的局部自定义属性**（声明它的文件与引用它的文件同属一个包），那是假红而不是违规——见 theme-tokens-selftest',
    run() {
      const appDir = join('/', 'Applications', 'DSH Desktop.app')
      // 环境相关：app 未安装时由 checkThemeTokens 自身报告跳过（与 patch-anchors 同一语义）。
      return checkThemeTokens({
        repoRoot,
        appDir,
        baseline: JSON.parse(readIfExists(THEME_TOKENS_BASELINE_PATH) || '[]'),
      })
    },
  },
  {
    name: 'theme-tokens-selftest',
    modes: ['full'],
    remediation:
      '跑 node --test scripts/gates/theme-tokens.test.mjs 看红在哪条：本项在 2026-09-15 差点成了假红制造机——`dsh-settings-shell-local/src/client/shell.css` 在 `:root` 声明 `--dsh-settings-shell-brand` 并在同一文件用 `var()` 引用它（组件自有的局部变量），却因前缀撞上平台命名空间 `--dsh-` 被判「从未被任何地方定义」；而判据文字写着「两种定义形态都要认」，实现只认 `"--dsw-x": v` 这一种。修法的风险**不在漏报而在过度放行**，故用例以负向为主：跨包引用一个只在别的包内部声明的名字必须仍判红（否则射程被放宽成「别处声明过」，本项退化成恒真桩）、幻觉 token 不得被任何局部声明放行、注释里的名字不算声明、局部集合必须真小于引用总量。重点是恒真桩突变：把「局部判定」改成恒真必须让 4 条负向用例失效，把「剥注释」去掉必须让注释那条失效——突变不红就说明拦住缺陷的不是判据本身（P-02 / P-03）',
    run() {
      return runNodeTestFile('scripts/gates/theme-tokens.test.mjs', '主题 token 可达性判据的反向自测失败')
    },
  },
  {
    name: 'theme-tokens-baseline-frozen',
    remediation:
      '不得新增主题 token 基线条目（只减不增，ADR-0014）。新发现的幻觉 token 请改源头——换用真实 token，或去掉 var() 走字面兜底；登记进基线只是承认「它不随主题变化」并且不去修它，而且不会有到期日。若确需放宽这一条，请连同理由改本判据自身，让放宽显式可见（2026-09-18 前这条纪律只有文字声明，没有任何判据守着）。',
    run() {
      const baselineExists = baselineFileExists(THEME_TOKENS_BASELINE_PATH)
      return checkThemeTokensBaselineFrozen({
        entries: JSON.parse(readIfExists(THEME_TOKENS_BASELINE_PATH) || '[]'),
        baseline: baselineExists ? readBaselineFile(THEME_TOKENS_BASELINE_PATH) : [],
        baselineExists,
      })
    },
  },
]

// 注册表级自检（P-08）：每个注册项必须声明非空 remediation——第 87 条悄悄不写时，
// 摘要会静默少一行「怎么修」。此断言在任何模式启动前执行，违规即响亮退出，
// 不依赖任何测试去跑它（断言函数本身由 gate-result-selftest 守着）。
{
  const remediationCheck = assertRemediationDeclared(CHECKS)
  if (!remediationCheck.valid) {
    for (const message of remediationCheck.errors) {
      process.stderr.write(`gate 注册表缺 remediation：${message}\n`)
    }
    process.exit(1)
  }
}

/** 豁免登记文件（仓库根相对路径）。 */
const EXEMPTIONS_PATH = 'scripts/gates/exemptions.json'

/** 幻觉 token 基线（仓库根相对路径，只减不增）。 */
const THEME_TOKENS_BASELINE_PATH = 'scripts/gates/theme-tokens-baseline.json'

/** 扫描时不进入的目录：第三方源码、VCS 元数据与装配产物（本检查只针对仓库自有脚本）。 */
const SHELL_SCAN_SKIP_DIRS = new Set(['node_modules', '.git', 'vendor'])

/**
 * 收集全仓 shell 脚本供 `shell-var-multibyte` 校验（ADR-0064）。
 * 范围 = `*.sh`（排除 `.bak` 备份），跳过 node_modules / .git / vendor / packaging/staging。
 * 只扫 shell：本陷阱是 bash 词法问题，别的语言里同样两个相邻字面量不会出事。
 * @returns {Array<{relPath: string, text: string}>}
 */
function collectShellScripts() {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      const rel = relative(repoRoot, full)
      if (entry.isDirectory()) {
        if (SHELL_SCAN_SKIP_DIRS.has(entry.name)) continue
        if (rel === join('packaging', 'staging')) continue
        walk(full)
        continue
      }
      if (!entry.name.endsWith('.sh') || entry.name.endsWith('.bak')) continue
      out.push({ relPath: rel, text: readFileSync(full, 'utf8') })
    }
  }
  walk(repoRoot)
  return out
}

/**
 * 列出 git 索引里的文件（仓库根相对路径）；git 不可用时返回 `null`。
 *
 * 为什么跟着 git 走而不是走磁盘：`packaging/staging/`、`release/`、`.dsh-types/` 这些
 * 产物/生成目录里有几千个同名文件（实测磁盘 4664 个 `*.md`，索引里只有 423 个），
 * 走磁盘会让射程被产物淹没；而「射程跟着 git 走，不跟着磁盘走」是本仓库既有的规矩
 * （ADR-0075 / P-11）。返回 `null` 而不是空数组：调用方必须能把「取不到射程」与
 * 「射程真的是空的」分开（P-02）。
 * @returns {string[]|null}
 */
function gitLsFiles() {
  try {
    const out = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
    return out.split('\0').filter(Boolean)
  } catch {
    return null
  }
}

/**
 * 收集「判据面」文件供 `dead-instrument` 校验（ADR-0080）。
 *
 * 判据面 = 会被人**照着跑**的地方 = `*.md`（清单行 + 围栏代码块）与 `*.sh` / `*.bash`
 * （去掉注释后仍有内容的行）。射程取 git 索引（含已 `git add` 的），故草稿不扫。
 * @returns {Array<{relPath: string, text: string}>|null} git 不可用时返回 `null`
 */
function collectPrescriptionSurfaces() {
  const tracked = gitLsFiles()
  if (tracked === null) return null
  return tracked
    .filter((rel) => rel.endsWith('.md') || rel.endsWith('.sh') || rel.endsWith('.bash'))
    .map((rel) => ({ relPath: rel, text: readIfExists(join(repoRoot, rel)) ?? '' }))
}

/**
 * 跑一个 `node:test` 测试文件，把失败用例名抽成门禁的违规明细。
 *
 * 为什么不用 `process.execPath`：在 pnpm 生命周期脚本下它是**宿主 Electron 可执行文件**，
 * Electron 不认为自己在当 node 而是再开一个 app 实例，单实例锁之下立刻以 0 退出——
 * 父进程看到的是「退出码 0、stdout 空」，而 `runScript` 只读退出码，
 * 于是**测试一条都没跑也会判绿**（ADR-0040 / `scripts/lib/real-node.mjs`）。
 * 这正是总账 P-02「仪器假绿」的形状，所以这里必须走 `nodeCommand()`。
 * @param {string} relPath 测试文件的仓库根相对路径
 * @param {string} failureLabel 没有任何可解析失败行时的兜底说明
 * @param {number} [timeoutMs] 超时上限；默认 120s。**并发/见证类用例必须显式抬高**：
 *   QG-006B 的聚合并发一轮就是两次完整 gate，按住默认值会得到「超时判红」而不是
 *   「并发不安全」——那正是 P-18 的形态（环境读数被当成代码缺陷）。
 * @returns {{passed: boolean, violations: string[]}}
 */
function runNodeTestFile(relPath, failureLabel, timeoutMs = 120000) {
  const { command, env } = nodeCommand()
  const script = join(repoRoot, relPath)
  const result = runScript(repoRoot, `"${command}" --test "${script}"`, timeoutMs, env)
  if (result.code === 0) return { passed: true, violations: [] }
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const lines = text
    .split('\n')
    .filter((line) => /^\s*✖/.test(line) || /AssertionError/.test(line))
    .map((line) => line.trim())
  const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
  return { passed: false, violations: lines.length > 0 ? lines : [`${failureLabel}（${verdict}）`] }
}

/** Run one node:test process over a related contract suite. */
function runNodeTestFiles(relPaths, failureLabel, timeoutMs = 120000) {
  const { command, env } = nodeCommand()
  const scripts = relPaths.map((relPath) => `"${join(repoRoot, relPath)}"`).join(' ')
  const result = runScript(repoRoot, `"${command}" --test ${scripts}`, timeoutMs, env)
  if (result.code === 0) return { passed: true, violations: [] }
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const lines = text
    .split('\n')
    .filter((line) => /^\s*✖/.test(line) || /AssertionError/.test(line))
    .map((line) => line.trim())
  const verdict = result.code === null ? '未给出退出码' : `退出码 ${result.code}`
  return { passed: false, violations: lines.length > 0 ? lines : [`${failureLabel}（${verdict}）`] }
}

/**
 * 收集 `docs-link-integrity` 要校验的文档：`docs/` 全部 Markdown + 仓库根的两份。
 *
 * 范围是刻意的：包内文档（各包的 `docs/`、`packaging/` 下的 Markdown）是另一个面，
 * 未纳入本项。边界写在 `scripts/gates/docs-links.mjs` 的模块注释里。
 * @returns {Array<{path: string, text: string}>}
 */
function collectDocFiles() {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.md')) out.push({ path: relative(repoRoot, full), text: readFileSync(full, 'utf8') })
    }
  }
  walk(join(repoRoot, 'docs'))
  for (const rel of ['AGENTS.md', 'README.md']) {
    if (existsSync(join(repoRoot, rel))) out.push({ path: rel, text: readFileSync(join(repoRoot, rel), 'utf8') })
  }
  return out
}

/**
 * 收集受管包 node_modules 顶层作用域内的符号链接及其可达性。
 * @returns {Array<{from: string, target: string, exists: boolean}>}
 */
function collectDependencyLinks() {
  const links = []
  for (const entry of collectManifests()) {
    if (entry.dir === '.') continue
    const modulesDir = join(repoRoot, entry.dir, 'node_modules')
    if (!existsSync(modulesDir)) continue
    for (const scope of readdirSync(modulesDir)) {
      if (!scope.startsWith('@')) continue
      const scopeDir = join(modulesDir, scope)
      if (!statSync(scopeDir).isDirectory()) continue
      for (const pkg of readdirSync(scopeDir)) {
        const linkPath = join(scopeDir, pkg)
        if (!lstatSync(linkPath).isSymbolicLink()) continue
        const target = readlinkSync(linkPath)
        links.push({
          from: `${entry.dir}/node_modules/${scope}/${pkg}`,
          target,
          exists: existsSync(linkPath),
        })
      }
    }
  }
  return links
}

/**
 * 判断仓库里某个路径有没有被 git 跟踪（至少一个文件）。
 * 用于 package-scripts 的顺序判据：产物入库与否决定 build 该在 test 之前还是之后。
 * @param {string} relPath 仓库相对路径
 * @returns {boolean} 是否有被跟踪的文件
 */
function isGitTracked(relPath) {
  try {
    const out = execFileSync('git', ['-C', repoRoot, 'ls-files', '--', relPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.trim() !== ''
  } catch {
    return false
  }
}

/**
 * 逐个运行受管包声明的 typecheck / test / build 脚本，收集真实退出码。
 * 只用于 full 模式：逐包执行耗时较长，且需要各包 node_modules 已安装。
 *
 * 顺序不是固定的：产物（main 指向的根目录，通常 lib/）未入库时按
 * typecheck → build → test，已入库时按 typecheck → test → build。
 * 判据与实测见 ADR-0055 与 scripts/gates/dependency-reproducibility.mjs 的 packageScriptOrder。
 * @returns {Array<{relPath: string, scripts: Record<string, string>, results: Record<string, {code: number|null, stdout: string, stderr: string, note?: string}>}>}
 */
function runPackageScripts() {
  const timeoutMs = 180000
  return collectManifests()
    .filter((entry) => entry.dir !== '.')
    .map((entry) => {
      const scripts = entry.manifest.scripts ?? {}
      const results = {}
      const order = packageScriptOrder({
        hasBuild: Boolean(scripts.build),
        buildOutputTracked: isGitTracked(join(entry.dir, buildOutputRoot(entry.manifest))),
      })
      for (const key of order) {
        if (!scripts[key]) continue
        results[key] = runScript(join(repoRoot, entry.dir), scripts[key], timeoutMs)
      }
      return { relPath: entry.dir, scripts, results }
    })
    .filter((entry) => Object.keys(entry.results).length > 0)
}

/**
 * 判断某仓库相对路径的文件是否已存在于 git HEAD（未入库即处于初始登记引导期）。
 * @param {string} relPath 仓库根相对路径
 * @returns {boolean}
 */
function baselineFileExists(relPath) {
  try {
    execFileSync('git', ['-C', repoRoot, 'cat-file', '-e', `HEAD:${relPath}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * 从 git HEAD 读取某个 JSON 基线文件；文件尚未入库或仓库尚无提交时返回空数组。
 *
 * 「冻结基线 = HEAD 版本，工作区比 HEAD 多即为新增」是 `exemptions-frozen` 与
 * `theme-tokens-baseline-frozen` 共用的口径——**不必另存一份快照文件**，也就不会
 * 出现「快照与基线各说一套」的第二个家（ADR-0009）。
 * @param {string} relPath 仓库根相对路径
 * @returns {Array<Record<string, unknown>>}
 */
function readBaselineFile(relPath) {
  try {
    const text = execFileSync('git', ['-C', repoRoot, 'show', `HEAD:${relPath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return JSON.parse(text)
  } catch {
    return []
  }
}

/** 列出 docs/adr 下的 ADR 文件（仓库根相对路径）。 */
function listAdrFiles() {
  const dir = join(repoRoot, 'docs', 'adr')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /^ADR-\d{4}\.md$/.test(name))
    .sort()
    .map((name) => `docs/adr/${name}`)
}

/** 收集仓库根与全部受管包；实现位于可注入 repo root 的单一事实源。 */
function collectManifests() {
  return collectManagedManifests(repoRoot)
}

/**
 * 组装 `package-files-coverage` 的输入：受管包（根包不参与——它不是交付单位）
 * 的磁盘文件/目录清单，加上一个**注入**的文件读取器。
 *
 * 读取器由装配处提供而不是让判定器自己去读盘，是 QG-006A 的隔离契约：
 * 判定器保持纯函数，测试可以喂内存树，不必先造一棵真树。
 * @returns {Array<{relPath: string, manifest: Record<string, unknown>, files: Set<string>, dirs: Set<string>, readSource: (relPath: string) => string|null}>}
 */
function collectPackageTrees() {
  return collectManifests()
    .filter((entry) => entry.dir !== '.')
    .map((entry) => {
      const dir = join(repoRoot, entry.dir)
      const { files, dirs } = listPackageTree(dir)
      return {
        relPath: entry.dir,
        manifest: entry.manifest,
        files: new Set(files),
        dirs: new Set(dirs),
        readSource: createFileSource(dir),
      }
    })
}

/** 读取子模块实际 HEAD；未初始化或不可读时返回 undefined。 */
function submoduleHead() {
  const path = join(repoRoot, 'vendor', 'dsh-desktop', 'deepseek-harness')
  try {
    return execFileSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

/**
 * 判定器读仓库相对路径文本；读不到返回 null（区别于空文件）。
 *
 * 判定器保持纯函数、读取器由装配处注入，是 QG-006A 的隔离契约：测试可以喂内存树，
 * 不必先造一棵真树。这里的 `null` 必须是「读不到」而不是「读到了空内容」——
 * 入口文件缺失与入口文件为空是两件事，前者要判红。
 */
function readRepoText(relPath) {
  try {
    const target = join(repoRoot, relPath)
    return existsSync(target) ? readFileSync(target, 'utf8') : null
  } catch {
    return null
  }
}

/** 读绝对路径文本；读不到返回 null（区别于空文件）。 */
function readAbsText(path) {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null
  } catch {
    return null
  }
}

/**
 * 跑一个 profile 断言面（QG-004）。
 *
 * 三个面（metadata / files / bundle）**共用同一个期望集**，各自结账、互不代替：
 * 「内嵌副本元数据一致」不能推出「装载点字节一致」，反过来也一样。
 * 期望集来自「这份 profile 声明了什么」而不是「目标目录里有什么」——后者会让
 * 缺件的包从分母里掉出去，那正是 QG-004 的 Red 形状。
 *
 * @param {'metadata'|'files'|'bundle'} target
 * @returns {object} 规范门禁结果
 */
function runProfileTarget(target) {
  const profileDir = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop')
  if (!existsSync(profileDir)) {
    // 唯一允许的 skip：profile 根整体不存在。根在、node_modules 或 vendor 不在，
    // 都走 summaryTarget 的判红分支——那份清单声明了 file: 依赖，安装没落到位
    // 就意味着应用加载不到这些包。
    return {
      status: 'skip',
      expected: 1,
      discovered: 0,
      checked: 0,
      skipped: 1,
      failed: 0,
      typedSkips: [{
        type: 'profile-root-absent',
        count: 1,
        reason: `可选 profile 根不存在（${profileDir}）——本项未核对任何包`,
      }],
      reason: 'profile 根不存在',
      violations: [],
    }
  }

  const manifest = readProfileManifest({ readText: readAbsText, profileDir })
  const packages = collectManifests()
  const byRelPath = new Map(packages.filter((entry) => entry.relPath !== '.').map((entry) => [entry.relPath, entry]))
  const set = buildExpectedSet({
    profileDir,
    repoRoot,
    dependencies: manifest.ok ? manifest.dependencies : {},
    packages,
  })

  const judge = (item) => {
    const entry = byRelPath.get(item.relPath)
    const files = entry?.manifest.files ?? []
    if (target === 'metadata') {
      // 内嵌副本的 name 用**完整相对路径**：basename 在报错里认不出是哪个包。
      return checkProfileMetadata([{ name: item.relPath, sourceDir: item.sourceDir, targetDir: item.vendorDir }])
    }
    if (target === 'files') {
      return checkProfileFilesSync([{ name: item.name, sourceDir: item.sourceDir, targetDir: item.loadDir, files }])
    }
    return checkProfileBundleSync([{ name: item.name, sourceDir: item.sourceDir, targetDir: item.loadDir, files }])
  }

  return summarizeTarget({ target, profileDir, exists: existsSync, manifest, set, judge })
}

/**
 * 已打 tag 的版本号（去掉 `v` 前缀）。
 *
 * 这是「某版本已发布」的**权威家**（ADR-0058：清单入库 → 打 tag，tag 才担保得住字节），
 * 给 `patch-anchors` 定射程用：打过 tag 的版本不再由发布前门禁度量。
 *
 * 读不到 tag（浅克隆、新克隆、git 不可用）时返回空数组——**默认错误方向选「多量」**：
 * 判据宁可多量几棵已发布的树，也不能因为读不到 tag 而把一棵待发布的新树放行。
 *
 * @returns {string[]}
 */
function releasedVersions() {
  try {
    return execFileSync('git', ['-C', repoRoot, 'tag', '--list', 'v*'], { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((tag) => tag.replace(/^v/, ''))
  } catch {
    return []
  }
}

/**
 * 已入库的发布清单里的版本号（`release/<版本>.sha256`，进 git，ADR-0058）。
 * 缺失或不可读时返回空数组——调用方据此判「射程为空」（ADR-0076）。
 */
function publishedManifests() {
  try {
    const dir = join(repoRoot, 'release')
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((name) => /^[0-9]+\.[0-9]+\.[0-9]+\.sha256$/.test(name))
      .map((name) => name.replace(/\.sha256$/, ''))
  } catch {
    return []
  }
}

/**
 * 递归列出目录下的文件（相对路径），供 `dmg-layout-doc` 的 R6 判嵌套链接是否随包。
 *
 * 深度上限 6 层：交付载荷最多两层（`tools/`、`LUTE Setup.app/Contents/…`），
 * 而挂载卷上不该有更深的树。读不到的那一支返回空数组——**不猜**，
 * 由判据那边如实计入「未核」，而不是拿「顶层目录在」冒充「里面的文件在」。
 * @param {string} root 目录（挂载卷或 payload 根）
 * @param {string} [relPrefix] 当前相对前缀
 * @param {number} [depth] 当前深度
 * @returns {string[]} 相对路径列表（文件，不含目录本身）
 */
function listFilesRecursive(root, relPrefix = '', depth = 0) {
  if (depth > 6) return []
  let entries
  try {
    entries = readdirSync(join(root, relPrefix), { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const entry of entries) {
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
    // 符号链接按文件算（`isDirectory()` 对链接返回 false）——交付载荷里没有链接目录。
    if (entry.isDirectory()) out.push(...listFilesRecursive(root, rel, depth + 1))
    else out.push(rel)
  }
  return out
}

/**
 * 读取 live profile 的已安装依赖表 —— **已删除**。
 *
 * 它曾经是三个 profile 门禁的唯一输入，而它的失败路径是
 * `catch { return {} }`：JSON 坏了与「没有 file: 依赖」返回同一个值。
 * 2026-09-17 实测（QG-004 的 Red）：把 profile package.json 写成截断的 JSON，
 * 三个 profile 门禁**全部绿**，`profile-bundle-sync` 的读数还是「对比 0/0 个
 * file: 依赖」。它的射程守卫（`fileDeps > 0`）防的是「声明了却一个都没对上」，
 * 防不住「声明本身就没了」。
 *
 * 现在由 `gates/profile-coverage.mjs` 的 `readProfileManifest()` 负责，解析失败
 * **直接判红**。这里刻意不留一个同名的「安全版本」——留着就会被下一次顺手用回去，
 * 而它的失败路径正是这轮要收掉的东西。
 */

function parseArgs(argv) {
  let mode = 'quick'
  let list = false
  let json = false
  let requireNoSkip = false
  let attest = null
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--list') list = true
    else if (argv[i] === '--json') json = true
    else if (argv[i] === '--require-no-skip') requireNoSkip = true
    else if (argv[i] === '--attest') {
      // `--attest` 可带值（被见证的命令，默认 node scripts/gate.mjs）；
      // 不带值时也要能识别，所以先看下一个参数是不是另一个开关。
      if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
        attest = argv[i + 1]
        i += 1
      } else {
        attest = `${join(repoRoot, 'scripts', 'gate.mjs')}`
      }
    } else if (argv[i] === '--mode') {
      if (argv[i + 1] === undefined) return { error: '--mode 缺少值（quick / full）' }
      mode = argv[i + 1]
      i += 1
    } else {
      return { error: `未知参数：${argv[i]}` }
    }
  }
  if (!MODES.includes(mode)) return { error: `未知模式：${mode}（可用：${MODES.join(' / ')}）` }
  return { mode, list, json, requireNoSkip, attest }
}

/**
 * 某包入库的 lib/types 文件清单。
 * @param {string} dir 包相对路径
 * @returns {string[]}
 */
function trackedTypeFiles(dir) {
  const output = execFileSync('git', ['-C', repoRoot, 'ls-files', `${dir}/lib/types`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return output.split('\n').filter(Boolean)
}

/**
 * 跑一次只读保护面审计（QG-008）。
 *
 * 分三种结果，**不合并**：`ok`（与声明全等）、`mismatch`（拿得到读数但不符）、
 * `no-reading`（gh 不存在 / 未认证 / 网络不可用 / 声明读不到）。第三种必须能与前两种
 * 分开——把「没读到」混进「不符」会让人以为已经比对过，混进「通过」更糟（卡面负例）。
 *
 * @returns {{status: 'ok'|'mismatch'|'no-reading', exitCode: number, violations: string[], facts: object, authority: string, declarationPath: string, reason?: string}}
 */
function runRulesetAudit() {
  const script = join(repoRoot, 'scripts', 'gates', 'audit-rulesets.mjs')
  // 走 `nodeCommand()` 的 env 而不是裸 `process.execPath`：后者在 pnpm 下是宿主 Electron，
  // 子进程会「退出码 0 且没有输出」（ADR-0040 / P-02）。第一版就是这么写的，
  // 被门禁自己的 `node-interpreter` 判据当场抓住——判据拦住了它本来要拦的那种事故。
  const { command, env } = nodeCommand()
  const result = runScript(repoRoot, `"${command}" "${script}" --json`, 120000, env)
  let payload = null
  try {
    payload = JSON.parse(result.stdout ?? '')
  } catch {
    payload = null
  }
  const fallback = {
    authority: 'L2-readonly-api',
    declarationPath: 'scripts/gates/ruleset-declaration.json',
  }
  if (payload === null) {
    return {
      status: 'no-reading',
      exitCode: 2,
      violations: [],
      facts: {},
      ...fallback,
      reason: (result.stderr ?? '').trim().split('\n')[0] || `审计脚本没有输出可解析的 JSON（退出码 ${String(result.code)}）`,
    }
  }
  return {
    status: payload.exitCode === 0 ? 'ok' : payload.exitCode === 1 ? 'mismatch' : 'no-reading',
    exitCode: payload.exitCode,
    violations: payload.violations ?? [],
    facts: payload.facts ?? {},
    authority: payload.authority ?? fallback.authority,
    declarationPath: payload.facts?.declarationPath ?? fallback.declarationPath,
    reason: payload.exitCode === 2 ? (payload.violations ?? []).join('；') : undefined,
  }
}

/**
 * 量一量被见证仓库在一小段时间内是不是**没有别的写入者**（QG-006B 的前置判定）。
 *
 * 为什么需要它：并发稳定性读数只有在「这段时间没有别人在写」时才有意义，而本工作树
 * 长期有多个会话同时写（实测三次里两次命中：本会话、Codex 会话、另一个 agent 会话）。
 * 与其让读的人自己分辨「红的是门禁还是邻居」，不如先量一次安静度，把「无读数」与
 * 「读数为通过」分成两种结果（ADR-0102）。
 *
 * 探测刻意很短：4 次快照、间隔 3 秒。它只负责说「现在不干净」，不负责证明「接下来干净」——
 * 后者由 10 轮见证自己用 before/after 判。
 *
 * @param {string} repoRoot 被见证的仓库根
 * @returns {{quiet: boolean, probes: number, diffs: string[], witness: string}}
 */
function measureQuietWindow(repoRoot) {
  const probes = 4
  const gapMs = 3000
  let previous = snapshotRepo(repoRoot)
  const diffs = []
  for (let index = 1; index < probes; index += 1) {
    // 同步等待：门禁的校验循环是同步的，而探测必须夹在两次快照之间。
    // 用 `Atomics.wait` 而不是起 `sleep` 子进程——后者每轮要 fork 一次，
    // 在一个只为「量安静度」的探测里不值得。
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, gapMs)
    const current = snapshotRepo(repoRoot)
    const verdict = snapshotIdentical(previous, current)
    for (const diff of verdict.diffs) diffs.push(`${diff.kind}:${diff.path}`)
    previous = current
    if (diffs.length > 0) break
  }
  return {
    quiet: diffs.length === 0,
    probes,
    diffs: [...new Set(diffs)].slice(0, 5),
    witness: 'node scripts/gate.mjs --attest <目标> --mode full --json 可对同一副本复算同一份快照契约',
  }
}

/**
 * `--attest`：见证一次门禁运行，证明它没有改动被见证的仓库（QG-006B）。
 *
 * 为什么这个入口必须由门禁自己提供、而不是只存在于测试里：CI（QG-007）要在
 * **独立 runner** 上用同一份快照契约复算同一件事，而测试文件在 runner 上不是
 * 一个可调用的契约面。快照格式、声明根集合与差异类型都来自
 * `scripts/lib/repo-snapshot.mjs`，此处只负责「跑一次、比两次、说人话」。
 *
 * 证据写在见证者自己的临时根里，**不写回被见证的仓库**——否则见证本身就成了
 * 它要测的那种副作用。
 * @param {string} target 被见证的可执行文件
 * @param {string} mode quick/full，作为 `--mode` 传给被见证的命令
 * @param {boolean} json
 * @returns {Promise<number>} 退出码
 */
async function runAttestation(target, mode, json) {
  const { attestCommand } = await import('./lib/repo-attest.mjs')
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')

  const witnessRoot = mkdtempSync(join(tmpdir(), 'gate-attest-'))
  const verdict = await attestCommand({
    repoRoot,
    command: process.execPath,
    args: [target, '--mode', mode, '--json'],
    tmpRoot: witnessRoot,
    timeoutMs: 30 * 60 * 1000,
  })
  const report = {
    schemaVersion: 1,
    kind: 'gate-attestation',
    mode,
    target,
    witnessRoot,
    authority: 'L2-local',
    outcome: verdict.outcome,
    exitCode: verdict.exitCode,
    exitSignal: verdict.exitSignal,
    identical: verdict.identical,
    unexplained: verdict.unexplained,
    concurrentActivity: verdict.concurrentActivity,
    beforeDigest: verdict.beforeDigest,
    afterDigest: verdict.afterDigest,
    diffCount: verdict.diffCount,
    diffs: verdict.diffs,
    plan: verdict.plan,
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    process.stdout.write(
      `${verdict.identical ? 'ok' : 'fail'} 见证 ${target}（mode=${mode}）：`
      + `before=${verdict.beforeDigest.slice(0, 16)} after=${verdict.afterDigest.slice(0, 16)} `
      + `identical=${verdict.identical} 差异=${verdict.diffCount}\n`,
    )
    for (const diff of verdict.diffs) {
      process.stdout.write(`     - ${diff.kind} ${diff.path}\n`)
    }
    process.stdout.write(`     见证者临时根（证据，不入库）：${witnessRoot}\n`)
  }

  // 通过时把见证者根收掉，判红时**留着**。
  //
  // 这条不是顺手加的：本卡在自己的结论里刚数过「2,066 个残留根来自从不清理的临时目录」，
  // 而 `--attest` 每次成功都会建一个空根——不清理就是同一个缺陷换了个地方复发。
  // 反向的那一半同样重要：判红时留下的证据是「为什么红」的唯一现场，删掉它等于
  // 把失败变成一句无法复查的话。
  if (verdict.identical) {
    try {
      rmSync(witnessRoot, { recursive: true, force: true })
    } catch { /* 删不掉不影响判定；临时目录不是判据面 */ }
  }
  report.witnessRootRetained = !verdict.identical
  return verdict.identical ? 0 : 1
}

/** 程序入口：解析参数、跑校验、按失败数设置退出码。 */
function main() {
  const { mode, list, json, requireNoSkip, attest, error } = parseArgs(process.argv.slice(2))
  if (error) {
    process.stderr.write(`${error}\n`)
    process.exitCode = 2
    return
  }
  if (attest !== null) {
    // 异步入口：见证要等子进程真的结束（含信号路径），不能靠顶层 await 之外的
    // 同步流程。退出码由 runAttestation 决定，与门禁自身的失败数分开。
    runAttestation(attest, mode, json).then((code) => {
      process.exitCode = code
    }, (failure) => {
      process.stderr.write(`见证失败：${failure?.message ?? String(failure)}\n`)
      process.exitCode = 2
    })
    return
  }
  if (list) {
    const checks = CHECKS.map((check) => ({ name: check.name, modes: check.modes ?? MODES }))
    process.stdout.write(json
      ? `${JSON.stringify({ schemaVersion: 1, kind: 'gate-list', checks }, null, 2)}\n`
      : `${checks.map((check) => check.name).join('\n')}\n`)
    return
  }

  // 分母的两半由**同一个谓词**推出：跑哪些（`isCheckActive`）与哪些没跑
  // （`computeNotCovered` = 它的补集）。两者一旦各写各的，就会出现「既没跑、
  // 也没报未覆盖」的项，而守恒（跑到的 + 未覆盖的 = 注册表全量）正是这条读数
  // 唯一的判据（ADR-0102）。
  const active = CHECKS.filter((check) => isCheckActive(check, mode))
  // 未被本模式覆盖的校验项（`scripts-runnable` 等 7 条是 full-only）。它们不进入分母，
  // 因此必须**在读数里被说出来**：否则「75/76 项通过」会被读成「门禁看过了 76 项，
  // 其余不存在」，而实际是这个模式根本没碰过它们。2026-09-16 的 typecheck 回归
  // （10 处 TS2339 + 6 处测试类型错）正是这样对提交前门禁隐形的——只跑了 quick 就
  // 声称通过，是 P-04 的变体。
  const notCovered = computeNotCovered(CHECKS, mode)
  const report = runGateChecks(active, { requireNoSkip, notCovered })
  if (json) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      kind: 'gate-report',
      mode,
      requireNoSkip,
      summary: report.summary,
      results: report.results,
    }, null, 2)}\n`)
  } else {
    for (const result of report.results) {
      const label = result.status === 'pass' ? 'ok  ' : result.status === 'skip' ? 'skip' : 'fail'
      const accounting = `expected=${result.expected}, discovered=${result.discovered}, checked=${result.checked}, skipped=${result.skipped}, failed=${result.failed}`
      process.stdout.write(`${label} contract ${result.name} [${accounting}]（${result.note ?? result.reason}）\n`)
      if (result.status === 'fail') {
        for (const violation of result.violations) process.stdout.write(`     - ${violation}\n`)
        if (result.remediation) process.stdout.write(`     → ${result.remediation}\n`)
      }
    }

    const summary = report.summary
    const skipTail = summary.skipped > 0 ? `，跳过 ${summary.skipped}` : ''
    const strictTail = requireNoSkip ? '，strict=no-skip' : ''
    const prefix = report.exitCode === 0 ? 'ok' : 'fail'
    process.stdout.write(
      `${prefix} ${summary.passed}/${summary.total} 项通过（mode=${mode}${skipTail}${strictTail}；`
      + `objects: expected=${summary.expected}, discovered=${summary.discovered}, checked=${summary.checked}, skipped=${summary.skippedObjects}, failed=${summary.failedObjects}）\n`,
    )
    // 分母的另一半：这个模式没跑到的那些，逐条点名。用 `MODES` 的反集而不是写死
    // 「full」，是因为射程随模式集合变化，写死会在加第三个模式时静默说谎（P-06）。
    if (summary.notCovered.length > 0) {
      const otherModes = MODES.filter((candidate) => candidate !== mode).join('/')
      process.stdout.write(
        `     本次未覆盖 ${summary.notCovered.length} 条（仅 ${otherModes}）：${summary.notCovered.join('、')}\n`,
      )
    }
  }
  process.exitCode = report.exitCode
}

main()
