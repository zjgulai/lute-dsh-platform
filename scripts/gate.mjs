#!/usr/bin/env node
/**
 * LUTE 门禁入口。退出码即契约（ADR-0014）：
 *   0 = 全部校验通过
 *   1 = 存在失败校验
 *   2 = 用法错误
 *
 * 用法：node scripts/gate.mjs [--mode quick|full] [--list]
 *   quick（默认）提交前使用；full 推送前使用（含变更包 typecheck/test，二期接入 git 钩子后启用）。
 */
import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync, statSync } from 'node:fs'
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
  checkScriptsRunnable,
  checkShellVarAdjacentMultibyte,
  checkTccPaneGuidance,
  checkTrackedIgnored,
} from './gates/checks.mjs'
import { buildOutputRoot, checkDependencyReproducibility, packageScriptOrder } from './gates/dependency-reproducibility.mjs'
import { checkProfileBundleSync, checkProfileFilesSync, checkProfileMetadata } from './gates/sync-profile.mjs'
import { checkSharedSync } from './gates/sync-shared.mjs'
import { checkThemeTokens } from './gates/theme-tokens.mjs'
import { checkWorktableFence } from './gates/worktable-fence.mjs'
import { checkNodeInterpreter } from './gates/node-interpreter.mjs'
import { runScript } from './lib/run-script.mjs'
import { collectPackages } from './gates/package-collect.mjs'
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
    name: 'package-identity',
    remediation: '在每个受管 package.json 补 luteOrigin / luteOwner / lutePublish（ADR-0012）',
    run() {
      return checkPackageIdentity(repoRoot, collectManifests())
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
      if (current === '') return { passed: true, violations: [] }
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
    remediation: '运行 node scripts/sync-profile.mjs --apply --only-metadata 同步内嵌副本（profile/vendor，非装载点）的 package.json',
    run() {
      // 注意：vendor/ 不是装载点（DSH 从 profile/node_modules 解析包）。本项只保证
      // 内嵌副本的元数据不漂；「改动是否生效」由下面的 profile-bundle-sync 断言。
      const profileVendor = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop', 'vendor')
      if (!existsSync(profileVendor)) return { passed: true, violations: [] }
      return checkProfileMetadata(
        collectManifests()
          .filter((entry) => entry.dir !== '.')
          .map((entry) => ({
            name: entry.dir,
            sourceDir: join(repoRoot, entry.dir),
            targetDir: join(profileVendor, entry.dir.split('/').pop()),
          })),
      )
    },
  },
  {
    name: 'profile-files-sync',
    remediation: '按 package.json 的 files 清单修正：陈旧条目从 files 中删除；真缺件用 tmp+mv 语义补齐 profile 副本（勿直接覆盖）',
    run() {
      const profile = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop')
      // 盯 node_modules：`file:` 依赖是硬链接实体副本，且这是 DSH 真实装载点
      // （2026-09-11 实测报错路径即 profiles/desktop/node_modules/dsh-preset-lint-local/lib/...）。
      // vendor/ 是另一份命名不同的副本，两份都缺 linter——本项只对装载点断言。
      const target = join(profile, 'node_modules')
      if (!existsSync(target)) return { passed: true, violations: [] }
      const packages = new Map(collectManifests().filter((entry) => entry.dir !== '.').map((entry) => [entry.dir.split('/').pop(), entry]))
      const pairs = []
      for (const [name, spec] of Object.entries(installedProfileDependencies(profile))) {
        if (!spec.startsWith('file:')) continue
        const sourceDir = spec.slice('file:'.length)
        if (!existsSync(join(sourceDir, 'package.json'))) continue
        const entry = packages.get(sourceDir.split('/').pop())
        pairs.push({
          name,
          sourceDir,
          targetDir: join(target, name),
          files: entry?.manifest.files ?? [],
        })
      }
      return checkProfileFilesSync(pairs)
    },
  },
  {
    name: 'profile-bundle-sync',
    remediation: '运行 node scripts/sync-profile.mjs --apply --loadpoint 把仓库产物按 tmp+mv 同步到装载点（否则应用重启后仍跑旧字节）',
    run() {
      const profile = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop')
      const target = join(profile, 'node_modules')
      if (!existsSync(target)) return { passed: true, violations: [] }
      const packages = new Map(collectManifests().filter((entry) => entry.dir !== '.').map((entry) => [entry.dir.split('/').pop(), entry]))
      const pairs = []
      for (const [name, spec] of Object.entries(installedProfileDependencies(profile))) {
        if (!spec.startsWith('file:')) continue
        const sourceDir = spec.slice('file:'.length)
        if (!existsSync(join(sourceDir, 'package.json'))) continue
        const entry = packages.get(sourceDir.split('/').pop())
        // 只判本仓库受管的包：别的项目的 file: 依赖漂移是那个项目的事，
        // 挂到这里只会让本仓库门禁为别人的状态变红，然后被加豁免。
        if (entry === undefined) continue
        pairs.push({
          name,
          sourceDir,
          targetDir: join(target, name),
          files: entry.manifest.files ?? [],
        })
      }
      return checkProfileBundleSync(pairs)
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
      '出货 README 的授权段必须写全「辅助功能 / 屏幕录制 / 输入监控」三项：写错一项不报错，用户会照着授了「自动化」而 mac.key/mac.click 静默失败（ADR-0063）',
    run() {
      return checkDmgReadmeTccPanes({
        assembleScript: readIfExists(join(repoRoot, 'packaging', 'assemble.sh')) ?? '',
      })
    },
  },
  {
    name: 'tcc-pane-guidance',
    remediation:
      '把该处授权指引改成「辅助功能 / 屏幕录制 / 输入监控」：第三项在「输入监控」下而非「自动化」下，写错不会报错，用户会照着一个不存在的授权静默失败（ADR-0063 / ADR-0009）',
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
    name: 'changed-packages',
    remediation: '为本次改动的包补 typecheck 与 test 脚本，或按 ADR-0014 登记豁免（只减不增）',
    run() {
      const manifests = collectManifests().filter((entry) => entry.dir !== '.')
      const exempted = JSON.parse(readIfExists(EXEMPTIONS_PATH) || '[]').map((row) => row.package)
      return checkChangedPackages({
        changed: changedPackages(manifests),
        packages: manifests,
        exempted,
      })
    },
  },
  {
    name: 'exemptions-frozen',
    remediation: '不得新增豁免条目；补齐后请删除条目，期限不可延后（ADR-0014）',
    run() {
      const baselineExists = baselineExemptionsExist()
      return checkExemptions({
        exemptions: JSON.parse(readIfExists(EXEMPTIONS_PATH) || '[]'),
        baseline: baselineExists ? readBaselineExemptions() : [],
        today: new Date().toISOString().slice(0, 10),
        baselineExists,
      })
    },
  },
  {
    name: 'patch-anchors',
    modes: ['full'],
    remediation: '运行 packaging/verify-patches-v2.sh 看 MISSING/FAIL 明细；补丁确实丢失时需重打并按 ADR-0018 的教训改用稳定锚（勿依赖内容哈希文件名）',
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
      //   ① 本机 /Applications —— 开发机运行时真值（未安装则跳过，不假绿）；
      //   ② packaging/staging/*/app —— **打包面**。加这一处是因为「装配产物里补丁丢了」
      //      与「本机 app 里补丁在」可以同时成立：P0-9(RootOutlet) 曾长期只在本机 app 上，
      //      而 staging 树发的是 pristine（.scratch/pre-dmg-diagnosis B3）。旧 staging 是
      //      历史快照，不重建就必然红——这是设计意图：陈旧产物不该被当成可发布物。
      const targets = []
      const appDir = join('/', 'Applications', 'DSH Desktop.app')
      if (existsSync(join(appDir, 'Contents', 'Resources', 'app.asar.unpacked'))) targets.push(appDir)
      const stagingRoot = join(repoRoot, 'packaging', 'staging')
      if (existsSync(stagingRoot)) {
        for (const version of readdirSync(stagingRoot).sort()) {
          const tree = join(stagingRoot, version, 'app', 'DSH Desktop.app')
          if (existsSync(join(tree, 'Contents', 'Resources', 'app.asar.unpacked'))) targets.push(tree)
        }
      }
      if (targets.length === 0) return { passed: true, violations: [] }
      const violations = []
      for (const tree of targets) {
        const { passed, lines } = checkTree(tree)
        if (!passed) violations.push(...lines.map((line) => `${relative(repoRoot, tree)}: ${line}`))
      }
      return { passed: violations.length === 0, violations }
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
      if (!existsSync(stagingRoot)) return { passed: true, violations: [] }
      const pairs = [
        ['payload/tools/verify-patches-v2.sh', 'packaging/verify-patches-v2.sh'],
        ['payload/tools/rewrite-file-deps.mjs', 'packaging/scripts/rewrite-file-deps.mjs'],
        ['payload/tools/reloc-aeis.sh', 'packaging/scripts/reloc-aeis.sh'],
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
    name: 'theme-tokens',
    modes: ['full'],
    remediation: '改用真实 token（官方主题包或 dsh-theme-local 供给的名字）；存量违规登记在 scripts/gates/theme-tokens-baseline.json，该文件只减不增、条目失效即拒绝（ADR-0014、ADR-0028 的 C2 验收）',
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
]

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
 * 找出本次改动涉及的受管包（未提交改动 ∪ 与 main 的差异）。
 * @param {Array<{dir: string}>} manifests 受管包清单
 * @returns {string[]} 包相对路径
 */
function changedPackages(manifests) {
  const files = new Set()
  for (const args of [
    ['diff', '--name-only', 'HEAD'],
    ['diff', '--name-only', '--cached'],
    ['diff', '--name-only', 'main...HEAD'],
  ]) {
    try {
      const out = execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      for (const line of out.split('\n')) if (line) files.add(line)
    } catch {
      // main 不存在或仓库无该引用时忽略该来源
    }
  }
  const changed = new Set()
  for (const entry of manifests) {
    const prefix = `${entry.dir}/`
    if ([...files].some((file) => file === entry.dir || file.startsWith(prefix))) changed.add(entry.dir)
  }
  return [...changed]
}

/**
 * 判断豁免登记文件是否已存在于 git HEAD（未入库即处于初始登记引导期）。
 * @returns {boolean}
 */
function baselineExemptionsExist() {
  try {
    execFileSync('git', ['-C', repoRoot, 'cat-file', '-e', `HEAD:${EXEMPTIONS_PATH}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * 从 git HEAD 读取豁免登记基线；文件尚未入库或仓库尚无提交时返回空数组。
 * @returns {Array<Record<string, unknown>>}
 */
function readBaselineExemptions() {
  try {
    const text = execFileSync('git', ['-C', repoRoot, 'show', `HEAD:${EXEMPTIONS_PATH}`], {
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

/**
 * 收集仓库根与全部受管包的清单（根包自身也受身份契约约束）。
 * 与目录墙生成器共用 collectPackages，避免两侧包集合分叉。
 * @returns {Array<{dir: string, manifest: Record<string, unknown>}>}
 */
function collectManifests() {
  const { rootManifest, packages } = collectPackages(repoRoot)
  return [
    { relPath: '.', dir: '.', manifest: rootManifest },
    ...packages.map((entry) => ({
      relPath: entry.relPath,
      dir: entry.relPath,
      group: entry.group,
      manifest: entry.manifest,
    })),
  ]
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
 * 读取 live profile 的已安装依赖表（package.json 的 dependencies）。
 * 返回空对象表示该 profile 未安装或不可读——调用方据此跳过校验。
 */
function installedProfileDependencies(profileDir) {
  const manifest = join(profileDir, 'package.json')
  if (!existsSync(manifest)) return {}
  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).dependencies ?? {}
  } catch {
    return {}
  }
}

function parseArgs(argv) {
  let mode = 'quick'
  let list = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--list') list = true
    else if (argv[i] === '--mode') {
      mode = argv[i + 1]
      i += 1
    } else {
      return { error: `未知参数：${argv[i]}` }
    }
  }
  if (!MODES.includes(mode)) return { error: `未知模式：${mode}（可用：${MODES.join(' / ')}）` }
  return { mode, list }
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

/** 程序入口：解析参数、跑校验、按失败数设置退出码。 */
function main() {
  const { mode, list, error } = parseArgs(process.argv.slice(2))
  if (error) {
    process.stderr.write(`${error}\n`)
    process.exitCode = 2
    return
  }
  if (list) {
    process.stdout.write(`${CHECKS.map((check) => check.name).join('\n')}\n`)
    return
  }

  const active = CHECKS.filter((check) => !check.modes || check.modes.includes(mode))
  let failed = 0
  for (const check of active) {
    const result = check.run()
    if (result.passed) {
      process.stdout.write(`ok   contract ${check.name}\n`)
      continue
    }
    failed += 1
    process.stdout.write(`fail contract ${check.name}\n`)
    for (const violation of result.violations) process.stdout.write(`     - ${violation}\n`)
    process.stdout.write(`     → ${check.remediation}\n`)
  }

  const passed = active.length - failed
  process.stdout.write(
    failed === 0
      ? `ok ${passed}/${active.length} 项通过（mode=${mode}）\n`
      : `fail ${passed}/${active.length} 项通过（mode=${mode}）\n`,
  )
  process.exitCode = failed === 0 ? 0 : 1
}

main()
