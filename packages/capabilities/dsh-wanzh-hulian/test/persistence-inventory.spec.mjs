import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * dsh-wanzh-hulian — 持久化清单（SEC-RT-006 的"静态清单禁止直接覆盖最终路径"）。
 *
 * 为什么要有这一条：本卡的第一版修复只覆盖了任务点名的那四个 JSON 状态文件，
 * 而同一类缺陷（`writeFile` 直写最终路径）在这个包里还有**九个家**——四份技能
 * Markdown。清单靠记性维护时，"改完点名的那些"看起来就是改完了（本仓 P-07）。
 *
 * 所以这里把清单变成判据的两个方向：
 *
 *  1. **静态**：`lib/` 下除原子写入器自身外，不得出现任何直写文件的调用；
 *  2. **动态**：真的 `apply()` 一次，检查清单里的**每一个文件**都被原子写入器
 *     创建出来了（权限位正确、同目录不留临时文件）——只写在注释里的清单不算数。
 */

const FAKE_HOME = mkdtempSync(join(tmpdir(), 'wanzh-inventory-'))
process.env.HOME = FAKE_HOME

const { apply } = await import('../lib/index.js')

const DSH = join(FAKE_HOME, '.dsh')

/** 本包持久化的**全部**文件（= 插件会写出的东西；新增一处就必须登记到这里）。 */
const INVENTORY = [
  { file: join(DSH, 'integrations', 'getnote', 'config.json'), mode: 0o600, owner: '连接总开关 / 模型自动调用 / 默认知识库' },
  { file: join(DSH, 'integrations', 'wanzh-hulian', 'connections.json'), mode: 0o600, owner: '连接注册表' },
  { file: join(DSH, 'integrations', 'wanzh-hulian', 'mcp-servers.json'), mode: 0o600, owner: 'MCP 服务器清单' },
  { file: join(DSH, 'integrations', 'wanzh-hulian', 'oauth-pixpix.json'), mode: 0o600, owner: 'PixPix OAuth token', live: true },
  { file: join(DSH, 'skills', 'getnote-brain', 'SKILL.md'), mode: 0o644, owner: '得到大脑引导技能' },
  { file: join(DSH, 'skills', 'pixpix-ecommerce', 'SKILL.md'), mode: 0o644, owner: 'PixPix 电商技能' },
  { file: join(DSH, 'skills', 'shopify-store-ops', 'SKILL.md'), mode: 0o644, owner: 'Shopify 店铺运营技能' },
  { file: join(DSH, 'skills', 'apify-mcp', 'SKILL.md'), mode: 0o644, owner: 'Apify MCP 技能' },
]

/** 直写最终路径的调用（原子写入器**自身**除外，它才是唯一允许出现这些调用的地方）。 */
const DIRECT_WRITE_RE = /\b(writeFile|appendFile|createWriteStream|writeFileSync|appendFileSync)\s*\(/g

const LOOPBACK = {
  method: 'GET',
  url: '/',
  socket: { remoteAddress: '127.0.0.1' },
  headers: { host: '127.0.0.1:43120' },
}

const BASE = '/api/dsh-wanzh-hulian'

/** @param {{ method?: string, body?: string }} [init] 方法与该次请求的原始 body。 */
function request({ method = 'GET', body } = {}) {
  return {
    ...LOOPBACK,
    method,
    on(event, cb) {
      if (body === undefined) return this
      if (event === 'data') cb(Buffer.from(body, 'utf8'))
      if (event === 'end') cb()
      return this
    },
  }
}

function call(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 0,
      body: '',
      writeHead(status) { this.statusCode = status },
      end(chunk) { this.body = chunk === undefined ? '' : String(chunk); resolve(this) },
    }
    handler(req ?? request(), res)
  })
}

function bootApply() {
  const table = new Map()
  apply({
    credentials: { resolve: async () => ({ value: '' }), set: async () => {}, describe: async () => ({}) },
    get: () => undefined,
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    tools: { register() {} },
    webServer: {
      register(spec) {
        table.set(spec.path, spec.handler)
        return () => {}
      },
    },
  })
  return table
}

/** apply() 里的技能写入是 fire-and-forget 的 effect，需要给它们一点时间落地。 */
async function settle(ms = 300) {
  await new Promise((r) => setTimeout(r, ms))
}

/** 走真实写入口，让每个 store 自己把文件写出来（而不是靠测试预先塞文件）。 */
async function exerciseWrites(table) {
  const toggles = [
    { id: 'getnote-brain', field: 'modelInvoke', value: true },
    { id: 'getnote-brain', field: 'enabled', value: false },
  ]
  for (const payload of toggles) {
    const res = await call(table.get(BASE + '/toggle'), request({ method: 'POST', body: JSON.stringify(payload) }))
    assert.equal(res.statusCode, 200, `写入口必须成功：${JSON.stringify(payload)} → ${res.body}`)
  }
  const mcp = await call(table.get(BASE + '/mcp-servers'), request({ method: 'POST', body: JSON.stringify({ id: 'pixpix', enabled: false }) }))
  assert.equal(mcp.statusCode, 200)
}

test.after(() => rmSync(FAKE_HOME, { recursive: true, force: true }))

test('静态：lib/ 下不存在直写最终路径的调用（唯一写入器是 atomic-store）', () => {
  const offenders = []
  for (const name of readdirSync(new URL('../lib', import.meta.url))) {
    if (!name.endsWith('.js')) continue
    if (name === 'atomic-store.js') continue
    const text = readFileSync(new URL(`../lib/${name}`, import.meta.url), 'utf8')
    for (const match of text.matchAll(DIRECT_WRITE_RE)) {
      const line = text.slice(0, match.index).split('\n').length
      offenders.push(`${name}:${line} ${match[1]}(…)`)
    }
  }
  assert.deepEqual(offenders, [], '落盘必须只经 atomic-store；这里出现直写就等于又长了一个家')
})

test('动态：走真实写入口后，清单里的每个文件都由原子写入器创建且权限正确', async () => {
  const table = bootApply()
  await settle()
  await exerciseWrites(table)

  const problems = []
  for (const entry of INVENTORY.filter((e) => e.live !== true)) {
    try {
      const mode = statSync(entry.file).mode & 0o777
      if (mode !== entry.mode) problems.push(`${entry.file}（${entry.owner}）权限 ${mode.toString(8)} ≠ ${entry.mode.toString(8)}`)
    } catch {
      problems.push(`${entry.file}（${entry.owner}）不存在`)
    }
  }
  assert.deepEqual(problems, [], '清单里的每个离线可触发的文件都必须被真实写入口原子写出')

  // 联机专属条目：标注它、并证明**没有任何离线路径**写出它。
  // 少了这条，清单会把"没测"读成"覆盖到了"（本仓 P-02 的空射程形态）。
  const liveOnly = INVENTORY.filter((e) => e.live === true)
  assert.equal(liveOnly.length, 1, '需要联机的条目应恰好是 OAuth token；多了说明有写入路径没被离线覆盖')
  for (const entry of liveOnly) {
    assert.equal(existsSync(entry.file), false, `${entry.file} 不得被任何离线路径写出（它只应由真实 token 交换创建）`)
  }
})

test('动态：任何一次写入都不留临时文件', async () => {
  const table = bootApply()
  await settle()
  await exerciseWrites(table)

  const stray = []
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name)
      if (name.isDirectory()) walk(full)
      else if (name.name.endsWith('.tmp')) stray.push(full)
    }
  }
  walk(DSH)
  assert.deepEqual(stray, [], '原子替换不得留下临时文件')
})

test('动态：清单与实现一致——插件写出的文件没有清单外的新家', async () => {
  const table = bootApply()
  await settle()
  await exerciseWrites(table)

  const known = new Set(INVENTORY.map((e) => e.file))
  const found = []
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name)
      if (name.isDirectory()) walk(full)
      else found.push(full)
    }
  }
  walk(DSH)

  const unlisted = found.filter((f) => !known.has(f))
  assert.deepEqual(unlisted, [], '插件写出的文件必须全部登记在 INVENTORY 里（新增一处就登记一处）')
})

test('登记表本身不许腐烂：每个条目必须写明 owner，且技能目录在射程内', () => {
  for (const entry of INVENTORY) {
    assert.equal(typeof entry.owner, 'string')
    assert.ok(entry.owner.length > 0, `${entry.file} 缺少 owner 说明`)
  }
  const hasSkills = INVENTORY.some((e) => e.file.split('/').includes('skills'))
  assert.ok(hasSkills, '技能目录必须在射程内——它就是上一轮被漏掉的那九个家')
  // OAuth token 文件没有"可离线触发"的写入路径（要靠真实 token 交换），
  // 因此它由静态判据 + 写入器单测覆盖，不在这里假装写出过。这一点写在这里，免得被读成全量覆盖。
  assert.ok(INVENTORY.some((e) => e.file.endsWith('oauth-pixpix.json')))
})
