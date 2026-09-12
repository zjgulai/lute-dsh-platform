/**
 * lib/secret-scrub.js 的判据。
 *
 * 为什么值得单测：这是**唯一**的脱敏出口，而它守着的东西实测存在——
 * 卡页八段里 1 张卡带真实 API Key，vault 的完整代码里 3 张带同一个 key。
 * 之前这段逻辑内联在装配器里、零测试；抽出模块时一并补上。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { redactSecrets, countSecrets, SECRET_PATTERNS } from '../lib/secret-scrub.js'

const PKG = join(fileURLToPath(new URL('.', import.meta.url)), '..')

// 真实形态但**不是**真实凭证：来自语料那三张卡的字段名与长度。
const FAKE = 'sk-' + 'a1b2c3d4'.repeat(4)

test('assign-key：赋值形式的 key 被替换，字段名与引号保留', () => {
  const out = redactSecrets(`client = OpenAI(api_key="${FAKE}", base_url="https://api.deepseek.com")`)
  assert.ok(!out.includes(FAKE), '原 key 不得残留')
  assert.match(out, /api_key="<REDACTED/)
  assert.match(out, /base_url="https:\/\/api\.deepseek\.com"/, '无关字段不得被改动')
})

test('assign-key：单引号与冒号写法同样命中', () => {
  assert.ok(!redactSecrets(`password: '${FAKE}'`).includes(FAKE))
  assert.ok(!redactSecrets(`secret = "${FAKE}"`).includes(FAKE))
})

test('赋值的**字段名**是判据的一部分：无关变量名不触发 assign-key', () => {
  // 这条钉住口径：命中靠「字段名 + 赋值 + 长串」三者同时成立，
  // 不是见到长串就替换——否则正文里的哈希、base64 会被打洞。
  const hits = []
  redactSecrets('a = "Zm9vYmFyYmF6cXV1eDEyMzQ1Njc4OTA="', (h) => hits.push(h.id))
  assert.deepEqual(hits, [], '无关字段名不得命中 assign-key')
})

test('openai-style：裸 key 串单独命中', () => {
  const out = redactSecrets(`KEY=${FAKE}`)
  assert.equal(out, 'KEY=<REDACTED-API-KEY>')
})

test('同一处 key 只脱一次：先命中的模式吃掉后，后续模式不再重复替换', () => {
  const hits = []
  const out = redactSecrets(`api_key="${FAKE}"`, (h) => hits.push(h.id))
  assert.deepEqual(hits, ['assign-key'], 'assign-key 命中后 key 已消失，openai-style 不应再记一次')
  assert.match(out, /api_key="<REDACTED/)
})

test('不做全局 sk- 替换：技能名里的 sk- 子串不得被误伤', () => {
  // 语料里确有 `Task-Decomposition` 这类名字含 `sk-` 的相邻串；
  // 若做成全局替换，正文会被打出洞。
  const text = 'Task-Decomposition 与 Task-skill-mapping 是两个章节名'
  assert.equal(redactSecrets(text), text)
})

test('各前缀令牌逐个命中', () => {
  const cases = [
    ['AKIAIOSFODNN7EXAMPLE', 'AWS'],
    [`ghp_${'a'.repeat(36)}`, 'GITHUB'],
    [`AIza${'b'.repeat(35)}`, 'GOOGLE'],
    [`xoxb-${'1'.repeat(12)}`, 'SLACK'],
  ]
  for (const [token, tag] of cases) {
    const out = redactSecrets(`token = "${token}"`)
    assert.ok(!out.includes(token), `${tag} 未脱敏`)
    assert.match(out, new RegExp(`REDACTED-${tag}-`))
  }
})

test('bearer 与 PEM 私钥', () => {
  const b = redactSecrets(`Authorization: Bearer ${'c'.repeat(40)}`)
  assert.ok(!b.includes('c'.repeat(40)))
  assert.match(b, /Bearer <REDACTED-TOKEN>/)

  const pem = redactSecrets(
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nmore\n-----END RSA PRIVATE KEY-----',
  )
  assert.ok(!pem.includes('MIIEowIBAAKCAQEA'), '私钥正文不得残留')
  assert.match(pem, /BEGIN RSA PRIVATE KEY-----<REDACTED>-----END/)
})

test('onHit 逐处回调，id 是模式名不是正则串', () => {
  const hits = []
  redactSecrets(`api_key="${FAKE}"\ntoken = "ghp_${'a'.repeat(36)}"`, (h) => hits.push(h))
  assert.equal(hits.length, 2)
  assert.deepEqual(hits.map((h) => h.id), ['assign-key', 'github'])
})

test('countSecrets 只数不改', () => {
  const text = `k="${FAKE}"`
  assert.equal(countSecrets(text), 1)
  assert.equal(text, `k="${FAKE}"`, '原字符串不得被就地改动')
})

test('干净文本原样返回（含中文、emoji、很长的非密钥串）', () => {
  const text = '# 安全库存与补货策略\n\ndef calculate(demand_std, lead_time):\n    return 1.65 * demand_std\n'
  assert.equal(redactSecrets(text), text)
})

test('每个模式都带 /g：多行文本里的第 2 处也必须命中', () => {
  // 曾经的隐患：正则若漏 /g，`replace` 只替换第一处，后面的 key 会原样写进技能库。
  for (const { id, re } of SECRET_PATTERNS) {
    assert.ok(re.global, `${id} 缺 /g`)
  }
})

test('入库面自身零凭证：data/ manifest/ docs/ lib/ scripts/ 逐文件用同一套模式复扫', () => {
  // 上面全是「脱敏函数对不对」，这条问的是另一件事：**要提交的东西干净吗**。
  // 2026-09-12 实测：语料 vault 的完整代码里有 3 张卡带真实 API Key（同一个 key），
  // 其中 1 张连卡页八段也带。索引一旦入库，key 就跟着入库 —— 红线（凭证不落仓库）
  // 必须在**提交粒度**上被机器守住，而不是靠某轮记得手动扫一遍。
  //
  // 排除项各有理由：generated/ 与 staging/ 是派生且被 .gitignore 挡在库外；
  // test/ 是被测夹具（AWS 官方示例串 AKIAIOSFODNN7EXAMPLE 之类，故意要命中）。
  const SKIP_DIRS = new Set(['node_modules', 'generated', 'staging', 'test', '__pycache__', 'out'])
  const EXT = /\.(json|md|mjs|js|py|ts)$/
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (EXT.test(entry)) files.push(path)
    }
  }
  walk(PKG)

  // 「扫了个寂寞」也要红：目录规则一改就把文件全排掉的话，下面是 0 命中假绿。
  assert.ok(files.length >= 30, `只扫到 ${files.length} 个入库文件，排除规则可能写坏了`)

  const violations = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const { id, re } of SECRET_PATTERNS) {
      for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))) {
        // 断言消息里**不许回显命中的串** —— 否则报错日志自己就成了泄露渠道。
        violations.push(`${relative(PKG, file)}:${text.slice(0, m.index).split('\n').length} [${id}]`)
      }
    }
  }
  assert.deepEqual(violations, [], `入库面带凭证：${violations.join(' / ')}`)
})
