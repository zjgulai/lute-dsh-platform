import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, inject, name } from '../lib/index.js'

/**
 * 公开 seam：apply(ctx) 注册的三个工具、一个 skill，以及 /api/task-board 路由。
 * 该路由带 LUTE 安全加固（loopback 地址 + Host 头双校验），是本包最需要锁定的行为。
 */


/**
 * @typedef {{ id: string, parent_id: string | null, title: string, completed: boolean, kind?: string, children?: Task[] }} Task
 * @typedef {{ tasks: Task[] }} Board
 */

let home

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'task-board-'))
  process.env.DSH_HOME = home
})

after(async () => {
  delete process.env.DSH_HOME
  await rm(home, { recursive: true, force: true })
})

/** 构造可控 ctx：录制工具/skill/路由注册。 */
function context() {
  /** @type {Map<string, { name: string, execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>> }>} */
  const tools = new Map()
  /** @type {{ tools: string[], skills: string[], routes: Array<{ path: string, handler: (req: unknown, res: unknown) => Promise<void> }> }} */
  const registrations = { tools: [], skills: [], routes: [] }
  /** @type {Record<string, unknown>} */
  const ctx = {
    logger: { info: () => {}, warn: () => {} },
    get: (/** @type {string} */ key) => {
      if (key === 'tools') return { register: (tool) => { tools.set(tool.name, tool); registrations.tools.push(tool.name); return () => {} } }
      if (key === 'skills') return { register: (skill) => { registrations.skills.push(skill.name); return () => {} } }
      if (key === 'webServer') return { register: (route) => { registrations.routes.push(route); return () => {} } }
      if (key === 'sessions') return {}
      return undefined
    },
    effect: (fn) => { const d = fn(); return () => { if (typeof d === 'function') d() } },
  }
  return { ctx, tools, registrations }
}

/**
 * 调用工具并返回看板（结果不合格即失败，避免测试里到处断言 undefined）。
 * @param {Map<string, { execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>> }>} tools 工具表
 * @param {string} name 工具名
 * @param {Record<string, unknown>} args 入参
 * @returns {Promise<Board>}
 */
async function runTool(tools, name, args) {
  const tool = tools.get(name)
  assert.ok(tool, `未注册工具 ${name}`)
  const result = await tool.execute(args)
  const board = /** @type {Board | undefined} */ (result.tasks === undefined ? undefined : result)
  assert.ok(board && Array.isArray(board.tasks), `${name} 应返回含 tasks 数组的看板`)
  return board
}

/** 模拟一次路由请求。 */
async function request(route, { ip = '127.0.0.1', host = '127.0.0.1:3080', body = {} } = {}) {
  const chunks = [Buffer.from(JSON.stringify(body))]
  const req = {
    socket: { remoteAddress: ip },
    headers: { host },
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk },
  }
  const captured = {}
  const res = {
    writeHead: (status, headers) => { captured.status = status; captured.headers = headers },
    end: (payload) => { captured.body = JSON.parse(payload) },
  }
  await route.handler(req, res)
  return captured
}

test('注册三个任务工具、一个 skill 与看板路由，且 inject 声明完整', () => {
  const { ctx, registrations, tools } = context()
  apply(ctx)

  assert.deepEqual(
    [...tools.keys()].sort(),
    ['board_get', 'board_revision', 'board_sync', 'task_create', 'task_delete', 'task_update'],
    '读/同步工具与任务 CRUD 工具都应注册',
  )
  assert.equal(registrations.skills.length, 1)
  assert.equal(registrations.routes.length, 1)
  assert.equal(registrations.routes[0].path, '/api/task-board')
  assert.equal(name, 'task-board')
  assert.deepEqual(inject, ['tools', 'skills', 'webServer', 'sessions'])
})

test('安全加固：非 loopback 来源一律 403，且不读不写看板', async () => {
  const { ctx, registrations } = context()
  apply(ctx)
  const route = registrations.routes[0]

  for (const ip of ['10.0.0.5', '192.168.0.196', '203.0.113.7', '']) {
    const result = await request(route, { ip, body: { op: 'load', projectPath: '/tmp/x' } })
    assert.equal(result.status, 403, `来源 ${String(ip)} 应被拒绝`)
    assert.equal(result.body.error, 'task-board api is loopback-only')
  }

  // 缺失 socket / remoteAddress 也必须拒绝（不能因「读不到地址」而放行）
  for (const socket of [undefined, {}, { remoteAddress: undefined }]) {
    const captured = {}
    const req = {
      ...(socket === undefined ? {} : { socket }),
      headers: { host: '127.0.0.1:3080' },
      async *[Symbol.asyncIterator]() { yield Buffer.from('{}') },
    }
    const res = { writeHead: (status) => { captured.status = status }, end: () => {} }
    await route.handler(req, res)
    assert.equal(captured.status, 403, `socket=${JSON.stringify(socket)} 应被拒绝`)
  }
})

test('安全加固：伪造的 Host 头一律 403（防 DNS rebinding）', async () => {
  const { ctx, registrations } = context()
  apply(ctx)
  const route = registrations.routes[0]

  for (const host of ['evil.example.com', 'attacker.test:3080', '127.0.0.1.evil.com']) {
    const result = await request(route, { host, body: { op: 'load', projectPath: '/tmp/x' } })
    assert.equal(result.status, 403, `Host ${host} 应被拒绝`)
  }
})

test('安全加固：合法 loopback 来源放行（含 IPv6 与 IPv4 映射形态）', async () => {
  const { ctx, registrations } = context()
  apply(ctx)
  const route = registrations.routes[0]

  const cases = [
    { ip: '127.0.0.1', host: '127.0.0.1:3080' },
    { ip: '127.0.0.5', host: 'localhost:3080' },
    { ip: '::1', host: '[::1]:3080' },
    { ip: '::ffff:127.0.0.1', host: 'localhost' },
  ]
  for (const { ip, host } of cases) {
    const result = await request(route, { ip, host, body: { op: 'load', projectPath: join(home, 'proj') } })
    assert.notEqual(result.status, 403, `来源 ${ip} / Host ${host} 应放行`)
  }
})

test('未知 op 返回 ok:false 且带可读原因（不崩路由）', async () => {
  const { ctx, registrations } = context()
  apply(ctx)

  const result = await request(registrations.routes[0], { body: { op: 'no-such-op' } })

  assert.equal(result.status, 200)
  assert.equal(result.body.ok, false)
  assert.match(result.body.error, /unknown op: no-such-op/)
})

test('任务工具端到端：创建 → 更新 → 删除（经真实 DSH_HOME 隔离）', async () => {
  const { ctx, tools } = context()
  apply(ctx)
  const projectPath = join(home, 'project-a')

  const created = await runTool(tools, 'task_create', { project_path: projectPath, title: '第一项任务' })
  const tasks = created.tasks
  assert.ok(Array.isArray(tasks) && tasks.length === 1, `应创建 1 个任务，实际 ${JSON.stringify(created).slice(0, 200)}`)
  assert.equal(tasks[0].title, '第一项任务')

  const taskId = tasks[0].id
  const updated = await runTool(tools, 'task_update', { project_path: projectPath, task_id: taskId, title: '改后的标题', completed: true })
  const updatedTask = updated.tasks.find((task) => task.id === taskId)
  assert.ok(updatedTask, '更新后应仍能查到该任务')
  assert.equal(updatedTask.title, '改后的标题')
  assert.equal(updatedTask.completed, true)

  const deleted = await runTool(tools, 'task_delete', { project_path: projectPath, task_id: taskId })
  assert.equal(deleted.tasks.find((task) => task.id === taskId), undefined)
})

test('任务工具：父子任务树（parent_id 建立层级）', async () => {
  const { ctx, tools } = context()
  apply(ctx)
  const projectPath = join(home, 'project-b')

  const parent = await runTool(tools, 'task_create', { project_path: projectPath, title: '父任务' })
  const parentTask0 = parent.tasks[0]
  assert.ok(parentTask0, '应创建父任务')
  const parentId = parentTask0.id
  const child = await runTool(tools, 'task_create', { project_path: projectPath, parent_id: parentId, title: '子任务' })

  const childTask = child.tasks.find((task) => task.title === '子任务')
  assert.ok(childTask, '应创建子任务')
  assert.equal(childTask.parent_id, parentId, '子任务应挂在父任务下（字段名 parent_id）')
  assert.equal(childTask.kind, 'subtask', '子任务的 kind 应为 subtask')
})
