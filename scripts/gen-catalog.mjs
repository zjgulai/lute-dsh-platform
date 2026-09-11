/**
 * 受管包目录墙生成器（ADR-0011）。
 * 目录墙是从各 package.json 生成的只读产物：手改会被门禁 `catalog-fresh` 拒绝，
 * 唯一正确的更新方式是运行本脚本。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { discoverPackages } from './gates/package-layout.mjs'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 能力组顺序即目录墙顺序。 */
export const GROUPS = ['capabilities', 'surfaces', 'platform', 'contract', 'infra']

/** 目录名 → 能力组。未列出的目录按 infra 处理，并在目录墙中显式标注。 */
const GROUP_BY_DIR = {
  'dsh-overseas-skills': 'capabilities',
  'dsh-overseas-tools': 'capabilities',
  'dsh-wanzh-hulian': 'capabilities',
  'dsh-deepresearch-local': 'capabilities',
  'dsh-browser-local': 'capabilities',
  'dsh-memory-local': 'capabilities',
  'dsh-loopx-plugin': 'capabilities',
  'dsh-agent-team-gui-local': 'surfaces',
  'dsh-skill-center-local': 'surfaces',
  'dsh-task-board-local': 'surfaces',
  'dsh-my-quotes': 'surfaces',
  'dsh-theme-local': 'platform',
  'dsh-root-brand-local': 'platform',
  'dsh-ui-polish-local': 'platform',
  'dsh-file-upload-local': 'platform',
  'dsh-rename-conversations': 'platform',
  'dsh-auto-compact-local': 'platform',
  'dsh-skill-subset': 'contract',
  'dsh-preset-lint-local': 'contract',
  'dsh-team-hub': 'infra',
  'dsh-patches': 'infra',
  'dsh-renderer-heal': 'infra',
  'dsh-rootoutlet-heal': 'infra',
  'dsh-skill-title-fix': 'platform',
  'dsh-reverse-skill-local': 'capabilities',
}

/**
 * 返回目录名所属能力组。
 * @param {string} dir 受管目录名
 * @returns {string} 五组之一
 */
export function groupOf(dir) {
  return GROUP_BY_DIR[dir] ?? 'infra'
}

/**
 * 渲染目录墙 Markdown。
 * @param {{packages: Array<{dir: string, manifest: Record<string, unknown>}>}} input 受管包清单
 * @returns {string} 目录墙内容
 */
export function renderCatalog({ packages }) {
  const rows = packages
    .filter((entry) => entry.manifest.luteOrigin !== undefined)
    .map((entry) => ({
      dir: entry.relPath ?? entry.dir,
      group: entry.group ?? groupOf(entry.dir),
      name: String(entry.manifest.name ?? '—'),
      origin: String(entry.manifest.luteOrigin),
      owner: String(entry.manifest.luteOwner ?? '—'),
      publish: String(entry.manifest.lutePublish ?? '—'),
    }))
    .sort((a, b) => (a.group === b.group ? a.dir.localeCompare(b.dir) : GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group)))

  const lines = [
    '# 受管包目录墙',
    '',
    '本文件由 `scripts/gen-catalog.mjs` 从各包 `package.json` 生成，**请勿手改**——手改会被门禁 `catalog-fresh` 拒绝（ADR-0011）。',
    '',
    `受管包总数：**${rows.length}**。分组规则见 [docs/architecture.md](../architecture.md#0-仓库构成与门禁2026-09-11-起) 与 [ADR-0011](../adr/ADR-0011.md)。`,
    '',
    '| 组 | 目录 | 包名 | 来源 | owner | 发布 npm |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  for (const row of rows) {
    lines.push(`| ${row.group} | \`${row.dir}\` | \`${row.name}\` | \`${row.origin}\` | \`${row.owner}\` | \`${row.publish}\` |`)
  }

  lines.push('', '## 分组统计', '', '| 组 | 包数 |', '| --- | --- |')
  for (const group of GROUPS) {
    lines.push(`| ${group} | ${rows.filter((row) => row.group === group).length} |`)
  }
  lines.push('')
  return lines.join('\n')
}

/** 收集仓库顶层受管包（含根包）。 */
function collect() {
  const packages = [
    { dir: '.', manifest: JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) },
  ]
  for (const entry of discoverPackages(repoRoot)) {
    const group = entry.relPath.startsWith('packages/') ? entry.relPath.split('/')[1] : undefined
    packages.push({
      relPath: entry.relPath,
      dir: entry.relPath,
      group,
      manifest: JSON.parse(readFileSync(join(entry.dir, 'package.json'), 'utf8')),
    })
  }
  return packages
}

function main() {
  const output = renderCatalog({ packages: collect() })
  const target = join(repoRoot, 'docs', 'catalog', 'packages.md')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, output)
  process.stdout.write(`ok 已生成 docs/catalog/packages.md（${output.split('\n').length} 行）\n`)
}

if (process.argv[1] && process.argv[1].endsWith('gen-catalog.mjs')) main()
