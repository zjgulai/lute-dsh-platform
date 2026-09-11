/**
 * dsh-my-quotes（「我说」）— Host 半。
 * 只读扫描 ~/.dsh/sessions/<项目>/<会话>/session.jsonl(.zstd)，
 * 抽取用户本人发出的 ≥30 字消息 → 规则 9 类意图分类 → 本地索引（~/.dsh/my-quotes/）。
 * 索引是派生品：损坏即重建；绝不写会话源文件。
 */
import { zstdDecompressSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readdir, readFile, stat, mkdir, rename, writeFile } from 'node:fs/promises'

const name = 'dsh-my-quotes'
const inject = ['connection', 'llm']
const CHANNEL = '/my-quotes'
const ROOT = join(homedir(), '.dsh', 'sessions')
const INDEX_DIR = join(homedir(), '.dsh', 'my-quotes')
const INDEX_FILE = join(INDEX_DIR, 'index.jsonl')
const META_FILE = join(INDEX_DIR, 'meta.json')
const OVERRIDES_FILE = join(INDEX_DIR, 'overrides.json')
const MIN_LEN = 30
const SCAN_CONCURRENCY = 8
const SNIPPET_LEN = 160

const CATS = {
  task: '任务指令', qa: '咨询问答', content: '内容创作', code: '代码开发',
  design: '设计品牌', ecom: '选品电商', research: '数据研究', system: '系统配置', other: '其他',
}

const RULES = [
  { id: 'code', kw: ['代码', 'bug', '函数', '接口', 'api', '重构', '测试用例', '报错', 'git', '组件', '前端', '后端', 'python', 'javascript', 'typescript', '数据库', 'sql', '依赖', '模块', '写个脚本', '编译'] },
  { id: 'design', kw: ['设计', 'ui', 'ux', '图标', 'icon', '头像', '品牌', '配色', '海报', '视觉', 'logo', '样式', '美化', '主题', '风格'] },
  { id: 'ecom', kw: ['选品', '亚马逊', 'amazon', 'tiktok', '跨境', 'listing', '卖家', '竞品', '供应链', 'sku', 'asin', 'shopify', '达人', 'kol', '红人'] },
  { id: 'content', kw: ['写一篇', '写个', '文案', '标题', '翻译', '润色', '总结一下', '改写', '演讲稿', '邮件', '推文', '文章', '脚本', '话术', '命名', '取名', '生成文案'] },
  { id: 'research', kw: ['分析', '调研', '研究', '数据', '报告', '市场', '趋势', '洞察', '对比', '评估'] },
  { id: 'system', kw: ['设置', '配置', '插件', '安装', '升级', '环境', '版本', '重启', '权限', 'dsh', '桌面端', '打包', '部署', '发布', 'skill', '技能'] },
  { id: 'qa', kw: ['是什么', '为什么', '怎么', '如何', '是否', '哪些', '区别', '原理', '介绍', '请问', '吗', '呢', '多少', '哪个', '解释'] },
]

/**
 * 从 catch/未知值中取出可读消息。
 * @param {unknown} reason 捕获到的值
 * @returns {string} 消息文本
 */
function errorMessage(reason) {
  return reason instanceof Error ? reason.message : String(reason);
}

function classify(text) {
  const t = (' ' + text.toLowerCase().replace(/\s+/g, '') + ' ')
  const scores = {}
  let hit = false
  for (const r of RULES) {
    let s = 0
    for (const k of r.kw) if (t.includes(k.toLowerCase())) s++
    if (s > 0) { scores[r.id] = (scores[r.id] || 0) + s; hit = true }
  }
  if (/^(请|帮我|麻烦|需要你|给我|帮我把|优化|修改|生成|实现|打包|修复|制定|梳理|整理|更新|调整|完成)/.test(text.trim())) {
    scores.task = (scores.task || 0) + 2; hit = true
  }
  if (!hit) return { catId: 'other', category: CATS.other, lowConfidence: true }
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  return { catId: top[0], category: CATS[top[0]], lowConfidence: top[1] <= 2 }
}

function projectNameOf(slug) {
  const m = /^--Users-[^-]+-project-(.+)--$/.exec(slug)
  return m ? m[1] : '默认'
}

function fpOf(sessionId, seq, text) {
  return sessionId + ':' + seq + ':' + createHash('sha1').update(text).digest('hex').slice(0, 12)
}


// ---- Zstandard 多帧容器解码（与官方 dsh-session-persistence-jsonl 同构，纯 JS 无依赖）----
const ZSTD_MAGIC = 4247762216
function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return { frames }
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) return { frames }
    offset += 4
    if (offset === buffer.length) return { frames }
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : (1 << contentSizeFlag)
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) return { frames }
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return { frames }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) return { frames }
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return { frames }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames }
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return { frames }
}
function decodeSessionLog(raw) {
  if (raw.length >= 4 && raw.readUInt32LE(0) === ZSTD_MAGIC) {
    const { frames } = scanZstdFrames(raw)
    const parts = []
    for (const { start, end } of frames) parts.push(zstdDecompressSync(raw.subarray(start, end)))
    return Buffer.concat(parts).toString('utf8')
  }
  return raw.toString('utf8')
}

async function readJson(pathname) {
  try { return JSON.parse(await readFile(pathname, 'utf8')) } catch { return null }
}

async function atomicWrite(pathname, content) {
  await mkdir(INDEX_DIR, { recursive: true })
  const tmp = pathname + '.tmp'
  await writeFile(tmp, content)
  await rename(tmp, pathname)
}

class QuoteService {
  constructor(ctx) {
    this.ctx = ctx
    this.records = []
    this.overrides = {}
    this.loaded = false
    this.scanning = false
  }

  async ensureLoaded() {
    if (this.loaded) return
    this.overrides = (await readJson(OVERRIDES_FILE)) || {}
    const meta = await readJson(META_FILE)
    if (meta && meta.total > 0 && (meta.schemaVersion || 1) >= 2) {
      try {
        const raw = await readFile(INDEX_FILE, 'utf8')
        this.records = raw.split('\n').filter(Boolean).map(l => JSON.parse(l))
        this.applyOverrides()
        this.loaded = true
        return
      } catch { /* 索引损坏 → 重建 */ }
    }
    await this.rescan(true)
    this.loaded = true
  }

  applyOverrides() {
    for (const r of this.records) {
      const o = this.overrides[r.fp]
      if (o) { r.catId = o.catId; r.category = CATS[o.catId] || o.catId; r.overridden = true }
    }
  }

  async walkSessions() {
    const out = []
    let projects
    try { projects = await readdir(ROOT) } catch { return out }
    for (const slug of projects) {
      if (!slug.startsWith('--')) continue
      const pdir = join(ROOT, slug)
      let st; try { st = await stat(pdir) } catch { continue }
      if (!st.isDirectory()) continue
      const ids = await readdir(pdir).catch(() => [])
      for (const id of ids) {
        const sdir = join(pdir, id)
        out.push({
          fileKey: join(slug, id),
          projectSlug: slug,
          project: projectNameOf(slug),
          sessionId: id,
          zstd: join(sdir, 'session.jsonl.zstd'),
          plain: join(sdir, 'session.jsonl'),
        })
      }
    }
    return out
  }

  async parseSession(f) {
    let raw
    try { raw = await readFile(f.zstd) } catch { try { raw = await readFile(f.plain) } catch { return { skip: true, records: [], title: '' } } }
    let text
    try { text = decodeSessionLog(raw) } catch { text = raw.toString('utf8') }
    const records = []
    let header = null
    let title = ''
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let ev
      try { ev = JSON.parse(line) } catch { continue }
      if (ev.type === 'session' && header === null) {
        header = ev
        if (ev.origin === 'subagent' || (ev.delegationDepth || 0) > 0) return { skip: true, records: [], title }
        continue
      }
      if (ev.type === 'session/title' && ev.data && typeof ev.data.title === 'string') {
        title = ev.data.title.trim().slice(0, 60)
        continue
      }
      if (ev.type === 'user/message') {
        const d = ev.data || {}
        if (!d || d.source?.kind !== 'user') continue
        const parts = Array.isArray(d.content)
          ? d.content.filter(c => c && c.type === 'text').map(c => c.text).join('')
          : ''
        const t = parts.trim()
        if (!t || t.startsWith('<system-reminder')) continue
        if (t.replace(/\s+/g, '').length <= MIN_LEN) continue
        const c = classify(t)
        records.push({
          fp: fpOf(f.sessionId, ev.seq ?? 0, t),
          sessionId: f.sessionId,
          project: f.project,
          projectSlug: f.projectSlug,
          title,
          text: t,
          snippet: t.slice(0, SNIPPET_LEN),
          time: ev.time || 0,
          catId: c.catId,
          category: c.category,
          lowConfidence: c.lowConfidence,
          fileKey: f.fileKey,
        })
      }
    }
    // 标题事件通常晚于首批用户消息 → 行扫结束后用会话最终标题回填空标题记录
    for (const rec of records) if (!rec.title) rec.title = title
    return { skip: false, records, title }
  }

  async rescan(full = false) {
    if (this.scanning) return { skipped: true }
    this.scanning = true
    const started = Date.now()
    try {
      await mkdir(INDEX_DIR, { recursive: true })
      const files = await this.walkSessions()
      const meta = (await readJson(META_FILE)) || { files: {} }
      const oldByKey = new Map()
      for (const r of this.records) {
        if (!oldByKey.has(r.fileKey)) oldByKey.set(r.fileKey, [])
        oldByKey.get(r.fileKey).push(r)
      }
      const newMetaFiles = {}
      const next = []
      const queue = files.slice()
      const workers = Array.from({ length: Math.min(SCAN_CONCURRENCY, queue.length) }, async () => {
        while (queue.length) {
          const f = queue.shift()
          let st
          try { st = await stat(f.zstd) } catch { try { st = await stat(f.plain) } catch { st = null } }
          if (st === null) continue
          const sig = st.mtimeMs + ':' + st.size
          newMetaFiles[f.fileKey] = sig
          const prev = meta.files?.[f.fileKey]
          if (!full && prev === sig && oldByKey.has(f.fileKey)) {
            next.push(...oldByKey.get(f.fileKey))
            continue
          }
          const parsed = await this.parseSession(f)
          if (parsed.skip) continue
          next.push(...parsed.records)
        }
      })
      await Promise.all(workers)
      next.sort((a, b) => b.time - a.time)
      this.records = next
      this.applyOverrides()
      await atomicWrite(INDEX_FILE, next.map(r => JSON.stringify(r)).join('\n') + (next.length ? '\n' : ''))
      await atomicWrite(META_FILE, JSON.stringify({ version: 1, schemaVersion: 2, total: next.length, scannedAt: Date.now(), files: newMetaFiles }))
      this.loaded = true
      return { total: next.length, ms: Date.now() - started }
    } finally {
      this.scanning = false
    }
  }

  counts() {
    const categories = {}
    const projects = {}
    for (const r of this.records) {
      categories[r.catId] = (categories[r.catId] || 0) + 1
      projects[r.project] = (projects[r.project] || 0) + 1
    }
    return { total: this.records.length, categories, projects }
  }

  async reclassify(fp, catId) {
    if (!CATS[catId]) return { ok: false, error: 'bad category' }
    this.overrides[fp] = { catId }
    await atomicWrite(OVERRIDES_FILE, JSON.stringify(this.overrides))
    const r = this.records.find(x => x.fp === fp)
    if (r) { r.catId = catId; r.category = CATS[catId]; r.overridden = true }
    return { ok: true }
  }

  async llmClassify(text) {
    const prompt = '请把下面这条用户消息按意图分为九类之一：任务指令(task)、咨询问答(qa)、内容创作(content)、代码开发(code)、设计品牌(design)、选品电商(ecom)、数据研究(research)、系统配置(system)、其他(other)。只输出一行 JSON：{"catId":"..."}\n\n消息：' + text.slice(0, 500)
    const pick = res => {
      const t = String(res?.content ?? res?.text ?? res?.choices?.[0]?.message?.content ?? res ?? '')
      const m = /\{\s*"catId"\s*:\s*"([a-z]+)"\s*\}/.exec(t)
      return m && CATS[m[1]] ? m[1] : null
    }
    let llm
    try { llm = this.ctx.get('llm') } catch { return null }
    if (!llm) return null
    const attempts = [
      () => llm.chat({ messages: [{ role: 'user', content: prompt }], maxTokens: 40 }),
      () => llm.generate({ prompt, maxTokens: 40 }),
      () => llm.complete({ prompt, maxTokens: 40 }),
    ]
    for (const call of attempts) {
      try { const id = pick(await call()); if (id) return id } catch { /* 换下一个调用形态 */ }
    }
    return null
  }

  async refine(fp) {
    const r = this.records.find(x => x.fp === fp)
    if (!r) return { ok: false, error: 'not found' }
    const id = await this.llmClassify(r.text)
    if (id) {
      await this.reclassify(fp, id)
      return { ok: true, catId: id, category: CATS[id], llm: true }
    }
    return { ok: false, error: 'llm-unavailable', fallback: r.catId }
  }

  async refineBatch(fps) {
    const list = fps.slice(0, 20)
    const done = []
    for (const fp of list) done.push(await this.refine(fp))
    return { done }
  }
}

function createHandler(ctx, service) {
  return async (endpoint, rawPayload, signal) => {
    try {
      await service.ensureLoaded()
      switch (endpoint) {
        case 'status': return { ok: true, value: service.counts() }
        case 'list': {
          const p = rawPayload || {}
          const query = String(p.query || '').trim().toLowerCase()
          const catId = p.catId || 'all'
          const project = p.project || 'all'
          const limit = Math.min(100, Math.max(1, Number(p.limit) || 50))
          const offset = Math.max(0, Number(p.offset) || 0)
          const filtered = service.records.filter(r =>
            (catId === 'all' || r.catId === catId) &&
            (project === 'all' || r.project === project) &&
            (query === '' || (r.text.toLowerCase().includes(query) || r.title.toLowerCase().includes(query)))
          )
          return { ok: true, value: { items: filtered.slice(offset, offset + limit), total: filtered.length } }
        }
        case 'rescan': {
          const full = !!(rawPayload || {}).full
          return { ok: true, value: await service.rescan(full) }
        }
        case 'reclassify': {
          const v = await service.reclassify(rawPayload.fp, rawPayload.catId)
          return v.ok ? { ok: true, value: { updated: true } } : { ok: false, error: { code: 'bad-request', message: v.error } }
        }
        case 'refine': return { ok: true, value: await service.refine(rawPayload.fp) }
        case 'refineBatch': return { ok: true, value: await service.refineBatch(rawPayload.fps || []) }
        default: return { ok: false, error: { code: 'bad-request', message: 'unknown endpoint ' + endpoint } }
      }
    } catch (error) {
      return { ok: false, error: { code: 'internal', message: String(errorMessage(error)) } }
    }
  }
}

export function apply(ctx) {
  const service = new QuoteService(ctx)
  ctx.logger?.info('dsh-my-quotes: host mounted (channel ' + CHANNEL + ')')
  ctx.inject(['connection'], (connectionCtx) => {
    connectionCtx.connection.rpc.handle(CHANNEL, createHandler(ctx, service), { authority: 'loopback' })
  })
  // 自动保持新鲜：每 5 分钟增量重扫（只重扫 mtime+size 变化的会话文件，
  // 增量扫描自带 skipping 守卫）。「我说」页面的内容无需手动刷新即跟随最新对话。
  ctx.effect(() => {
    const timer = setInterval(() => {
      service.rescan(false).catch((error) => {
        ctx.logger?.warn?.('dsh-my-quotes: periodic rescan failed: ' + (errorMessage(error)))
      })
    }, 5 * 60 * 1000)
    timer.unref?.()
    return () => clearInterval(timer)
  }, 'dsh-my-quotes: periodic rescan')
}

export { name, inject, QuoteService, createHandler }
