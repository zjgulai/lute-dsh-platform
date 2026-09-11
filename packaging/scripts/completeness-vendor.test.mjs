import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * assemble.sh 的 completeness.json 生成器不能在测试里"抄一份"验证——抄一份就测不出脚本自身的漂移。
 * 这里从 assemble.sh 原文抽出 vendor 过滤谓词与映射表达式，用 new Function 编译后对受控依赖表求值：
 * 跑的是脚本里的真实代码，只是绕开了 bash 双引号 heredoc 的转义层（`\`\`\`` 与 `\$` 是 bash 语法，
 * 直接把原文喂给 node 会语法错——首次尝试即栽在这里）。
 *
 * 动机（2026-09-11 实测）：生成器只匹配 `file:/Users/...` 与 `file:../../../project/...`，
 * 但 assemble.sh 自己在前一步（scripts/rewrite-file-deps.mjs）已把依赖改写成
 * `file:./vendor/<name>`，于是 vendor 被记成 2 条（真实 18 条 + dsh-patches = 19），
 * 冒烟里唯一那项失败（expected=1 actual=18）即由此而来。
 */

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const assemblePath = join(packageRoot, 'assemble.sh')

/** 从 start 处的 '(' 起做括号配平，返回括号内文本（跳过字符串字面量里的括号）。 */
function balanced(text, openIndex) {
  let depth = 0
  let quote = null
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i]
    if (quote !== null) {
      if (ch === quote && text[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue }
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return text.slice(openIndex + 1, i)
    }
  }
  return undefined
}

/**
 * 从 assemble.sh 取出 vendor 提取所用的「谓词」与「映射」源文本。两点都是实测踩过的坑：
 * ① 必须从 completeness.json 写入点**反向**定位：assemble.sh 更早处还有一段
 *    `.filter(([,v])=>…)` 是「拷贝 profile vendor 到暂存区」用的；取错了得到恒假谓词，
 *    表现为 mapped=[null,…]（看着像「没过滤」，实为压根没匹配上）。
 * ② 用括号配平而非正则：正则在 startsWith('…') 的右括号处提前截断。
 */
async function extractVendorExpressions() {
  const text = await readFile(assemblePath, 'utf8')
  const writerAt = text.indexOf("'/completeness.json'")
  assert.ok(writerAt > 0, 'assemble.sh 里应能找到 completeness.json 写入点')
  const filterAt = text.lastIndexOf('.filter(([,v])=>', writerAt)
  assert.ok(filterAt > 0, 'completeness 生成段里应能找到 vendor 的 filter 表达式')
  const predicate = balanced(text, text.indexOf('(', filterAt + '.filter'.length))
  const mapAt = text.indexOf('.map(([,v])=>', filterAt)
  assert.ok(mapAt > 0 && mapAt < writerAt, 'completeness 生成段里应能找到 vendor 的 map 表达式')
  const mapper = balanced(text, text.indexOf('(', mapAt + '.map'.length))
  assert.ok(predicate && mapper, '谓词与映射都应被完整抽出')
  return { predicate, mapper }
}

/**
 * 用脚本里的真实表达式，从依赖表算出 vendor 列表。
 * 表达式引用的变量：v（依赖值）。字符串前缀是字面量，直接可用。
 */
function computeVendor(dependencies, { predicate, mapper }) {
  const entries = Object.entries(dependencies)
  // predicate/mapper 已是完整箭头函数 `([,v])=>…`，不能再套一层：
  // 套一层会让该层参数变成「一个函数」而非 [k,v] 对 → 谓词恒假、map 原样返回函数。
  const filtered = new Function('deps', `return deps.filter(${predicate})`)(entries)
  const mapped = new Function('deps', `return deps.map(${mapper})`)(filtered)
  const vendor = [...new Set([...mapped, 'dsh-patches'])].sort()
  return vendor
}

test('完整性清单必须收录 file:./vendor/<name> 形态的依赖（交付形态）', async () => {
  const expr = await extractVendorExpressions()
  const vendor = computeVendor(
    { 'dsh-alpha': 'file:./vendor/dsh-alpha', 'dsh-beta': 'file:./vendor/dsh-beta', lodash: '^4.0.0' },
    expr,
  )

  assert.ok(
    vendor.includes('dsh-alpha') && vendor.includes('dsh-beta'),
    `file:./vendor/ 形态的依赖必须进 vendor 清单，实际=${JSON.stringify(vendor)}`,
  )
  assert.deepEqual(vendor, ['dsh-alpha', 'dsh-beta', 'dsh-patches'], `vendor 应恰为这三个，实际=${JSON.stringify(vendor)}`)
})

test('非 file: 依赖不得混进 vendor 清单', async () => {
  const expr = await extractVendorExpressions()
  const vendor = computeVendor({ lodash: '^4.0.0', 'dsh-beta': 'file:./vendor/dsh-beta' }, expr)
  assert.deepEqual(vendor, ['dsh-beta', 'dsh-patches'])
})

test('绝对路径形态的依赖仍被收录（不得为修新形态而打破旧形态）', async () => {
  const expr = await extractVendorExpressions()
  const vendor = computeVendor(
    {
      'dsh-gamma': 'file:/Users/lute/project/Magpie-Horch/packages/platform/dsh-theme-local',
      'dsh-delta': 'file:../../../project/Magpie-Horch/packages/platform/dsh-ui-polish-local',
    },
    expr,
  )
  assert.ok(
    vendor.includes('packages/platform/dsh-theme-local'),
    `绝对路径形态应被收录，实际=${JSON.stringify(vendor)}`,
  )
  assert.ok(
    vendor.includes('packages/platform/dsh-ui-polish-local'),
    `相对根路径形态应被收录，实际=${JSON.stringify(vendor)}`,
  )
})
