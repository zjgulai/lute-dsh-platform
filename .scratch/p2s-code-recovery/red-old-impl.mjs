/**
 * 红测取证：把本轮的判据喂给**上一轮的真实实现**（fenceCodeIfNeeded，原样重建），
 * 证明这些断言不是走过场 —— 旧实现上它们必须红。
 * 旧实现源码见本轮改动前的 lib/card-render.js（head 保留三行元数据 + 补围栏）。
 */
import { renderCodeSection } from '../../packages/capabilities/dsh-paper2skills/lib/card-render.js'

function oldFenceCodeIfNeeded(key, body) {
  if (!key.startsWith('7.')) return body
  const lines = body.split('\n')
  if (lines.length <= 3) return body
  const head = lines.slice(0, 3).map((l) => l.trim()).join('\n').trim()
  const code = lines.slice(3).join('\n').replace(/^\n+|\n+$/g, '')
  if (!code) return body
  const lang = /python/i.test(lines[2]) ? 'python' : 'text'
  return `${head}\n\n\`\`\`${lang}\n${code}\n\`\`\``
}

const BODY = '代码块数量：3 · 路径：paper2skills-code/logistics/x\n\n Python60 行 · 可运行复制\nclass Item:\n    x = 1'
const AVAIL = {
  declared_lines: 60, lines: 59, capped: true, parses: false,
  syntax_error: '第 58 行：unexpected EOF while parsing',
  declared_blocks: 3, path: 'paper2skills-code/logistics/x', path_claimed: true, lang: 'python',
}

const old = oldFenceCodeIfNeeded('7. 代码模板', BODY)
const neu = renderCodeSection(AVAIL, BODY)

const CRITERIA = [
  ['说清这是节选不是实现', (s) => /预览节选，不是完整实现/.test(s)],
  ['说清顶到了 60 行上限', (s) => /已顶到上限/.test(s)],
  ['说清截断了不能直接运行', (s) => /不能直接运行/.test(s)],
  ['不转发源站「可运行复制」', (s) => !/可运行复制/.test(s)],
  ['点明代码树不在本包内', (s) => /该代码树不在本包内/.test(s)],
]

let red = 0
console.log('判据                               旧实现   新实现')
for (const [name, fn] of CRITERIA) {
  const o = fn(old), n = fn(neu)
  if (!o) red++
  console.log(`${name.padEnd(32)} ${o ? ' 绿 ' : ' 红 '}     ${n ? ' 绿 ' : ' 红 '}`)
}
console.log(`\n旧实现红 ${red}/${CRITERIA.length} · 新实现绿 ${CRITERIA.filter(([, f]) => f(neu)).length}/${CRITERIA.length}`)
console.log('\n--- 旧实现卡面（暴露的就是被证伪的自述）---')
console.log(old)
process.exit(red === CRITERIA.length ? 0 : 1)
