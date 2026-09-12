import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'
import { ROLE_ASSIGNMENTS } from '../lib/role-map.js'
import { SKILLS } from '../lib/catalog.js'

/**
 * dsh-overseas-skills — 宿主路由契约测试。
 *
 * 为什么要有这一层：四层下钻的负载走一条新路由 `/org`，而宿主路由**只有重启进程
 * 才会注册**（`docs/architecture.md` 第 1 节的生效契约）。开发过程中真实观察到过
 * 「代码写完、单测全绿、页面却永远显示加载中」——因为跑着的进程里那条路由根本不存在。
 * 光测纯函数（org-tree）证明不了路由被注册、也证明不了处理函数拼出来的负载是对的。
 *
 * 所以这里直接 apply 一遍插件、把 webServer.register 的 handler 截下来真的调用：
 *
 *   - 路由表：六条路径一个不少（漏一条就是页面上一个功能静默消失）
 *   - 围栏：非回环 → 401；方法不对 → 405
 *   - **负载本身**：/org 的 body 形状与数字必须与 manifest、catalog 对得上
 *
 * 读的是真机 preset 目录（~/.dsh/.agent-presets）。取不到时**跳过并说明原因**，
 * 不静默通过——静默通过等于把这条契约换成一句空话。
 */

/** 回环请求的基线（Host 头也必须是回环，见 isLoopbackRequest）。 */
const LOOPBACK = {
  method: 'GET',
  url: '/',
  socket: { remoteAddress: '127.0.0.1' },
  headers: { host: '127.0.0.1:43120' },
}

/** 跑一遍 apply，截下路由表。 */
function routes() {
  const table = new Map()
  apply({
    credentials: undefined,
    get: () => undefined,
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    webServer: {
      register(spec) {
        table.set(spec.path, spec.handler)
        return () => {}
      },
    },
  })
  return table
}

/** 调一次 handler，收集状态码与响应体。 */
function call(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 0,
      body: '',
      writeHead(status) {
        this.statusCode = status
      },
      end(chunk) {
        this.body = chunk === undefined ? '' : String(chunk)
        resolve(this)
      },
    }
    handler(req, res)
  })
}

const BASE = '/api/dsh-overseas-skills'

test('路由表：六条路径全部注册（漏一条 = 页面上一个功能静默消失）', () => {
  const table = routes()
  for (const path of ['/list', '/fullstack-list', '/org', '/toggle', '/prompt-template', '/credential']) {
    assert.ok(table.has(BASE + path), `路由没注册：${BASE}${path}`)
  }
  assert.equal(table.size, 6, `注册了 ${table.size} 条，期望 6 条：${[...table.keys()].join(', ')}`)
})

test('/org：非回环请求一律 401，方法不对一律 405', async () => {
  const handler = routes().get(BASE + '/org')
  assert.ok(handler, '/org 没注册')

  const outsider = await call(handler, { ...LOOPBACK, socket: { remoteAddress: '10.0.0.7' } })
  assert.equal(outsider.statusCode, 401, '非回环 socket 必须 401')

  const hostHeader = await call(handler, { ...LOOPBACK, headers: { host: 'evil.example.com' } })
  assert.equal(hostHeader.statusCode, 401, 'Host 头不是回环必须 401（只有 socket 回环不够）')

  const wrongMethod = await call(handler, { ...LOOPBACK, method: 'POST' })
  assert.equal(wrongMethod.statusCode, 405, 'POST 必须 405')
})

test('/org：负载形状与数字必须与 manifest、catalog 对得上', async (t) => {
  const handler = routes().get(BASE + '/org')
  assert.ok(handler, '/org 没注册')

  const res = await call(handler, LOOPBACK)
  assert.equal(res.statusCode, 200, '回环 GET 应当 200，实际 ' + res.statusCode + '：' + res.body.slice(0, 200))
  const body = JSON.parse(res.body)

  assert.equal(body.ok, true)

  // preset 骨架：真机没有 50 个 preset 时跳过并说明（不静默通过）
  if (body.presets.count !== 50) {
    t.diagnostic(
      `真机 preset 只有 ${body.presets.count} 个（期望 50），跳过骨架断言。目录：${body.presets.dir}` +
        (body.presets.problems.length ? `；问题：${body.presets.problems.join(' / ')}` : ''),
    )
    return
  }

  assert.equal(body.tree.stats.roles, 50, '树上必须有 50 个岗位')
  assert.equal(body.tree.scenarios.length, 8, 'L1 必须是 8 个场景')
  for (const sc of body.tree.scenarios) {
    assert.ok(sc.planes.length > 0, `场景 ${sc.title} 一个面都没有`)
    for (const pl of sc.planes) {
      assert.ok(pl.domains.length > 0, `面 ${pl.name} 一个责任域都没有`)
      for (const dm of pl.domains) {
        for (const rl of dm.roles) {
          assert.match(rl.id, /^AGT-\d{3}$/, `岗位 id 形状不对：${rl.id}`)
        }
      }
    }
  }

  // 与 catalog 对得上：树上承载的是 222 张出海技能卡，一张不多一张不少
  const catalogNames = new Set(SKILLS.map((s) => s.name))
  const onTree = new Set()
  for (const sc of body.tree.scenarios) {
    for (const pl of sc.planes) for (const dm of pl.domains) for (const rl of dm.roles) for (const n of rl.cards) onTree.add(n)
    for (const n of sc.unassigned.cards) onTree.add(n)
  }
  assert.equal(onTree.size, catalogNames.size, `树上出现 ${onTree.size} 张卡，catalog 有 ${catalogNames.size} 张`)
  for (const n of onTree) assert.ok(catalogNames.has(n), `树上有 catalog 里没有的卡：${n}`)

  assert.equal(body.tree.stats.cards, catalogNames.size)
  assert.equal(body.tree.stats.cardsAssigned + body.tree.stats.cardsUnassigned, body.tree.stats.cards, '归位 + 未归岗必须等于卡片总数')

  // 头像：岗位 50 枚、层 12 枚（4 面 + 8 责任域）；岗位头像走平面 map 而不是塞进节点
  assert.equal(Object.keys(body.roleIcons).length, 50, '岗位头像应当是 50 枚')
  assert.equal(Object.keys(body.layerIcons).length, 12, '层头像应当是 12 枚（4 面 + 8 责任域）')
  const layerIds = Object.keys(body.layerIcons)
  for (const sc of body.tree.scenarios) {
    for (const pl of sc.planes) assert.ok(layerIds.includes(pl.id), `面 ${pl.id} 没有头像`)
  }
  assert.equal(body.roles.length, 50)
  for (const r of body.roles) {
    assert.ok(r.planeId && r.domainId, `岗位 ${r.id} 缺面/责任域`)
    assert.ok(Array.isArray(r.responsibilities) && r.responsibilities.length > 0, `岗位 ${r.id} 没有责任名`)
  }

  // 归位表元信息：宿主把 manifest 的覆盖率一并带出来，页面据此说明「本轮判定」有多少
  assert.equal(typeof body.assignmentMeta.skills, 'number')
  // ROLE_ASSIGNMENTS 是按技能名索引的对象（不是数组），长度用 Object.keys 量
  const assignmentNames = Object.keys(ROLE_ASSIGNMENTS)
  assert.equal(assignmentNames.length, body.assignmentMeta.skills, '归位表条数与 meta 对不上')
  assert.ok(assignmentNames.length >= 251, `归位表应当至少 251 条，实际 ${assignmentNames.length}`)
  assert.equal(body.assignmentMeta.withRoles + body.assignmentMeta.withoutRoles, body.assignmentMeta.skills, '有岗 + 无岗必须等于总数')
})

test('/org：缓存 30 秒，重复请求返回同一个对象（不重复读盘、不重复算树）', async () => {
  const handler = routes().get(BASE + '/org')
  assert.ok(handler, '/org 没注册')
  const a = JSON.parse((await call(handler, LOOPBACK)).body)
  const b = JSON.parse((await call(handler, LOOPBACK)).body)
  assert.equal(a.generatedAt, b.generatedAt, '两次请求的 generatedAt 不同——缓存没生效')
})
