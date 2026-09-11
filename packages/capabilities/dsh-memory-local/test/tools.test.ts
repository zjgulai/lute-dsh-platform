import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BRAIN_TOOLS,
  CORE_TOOLS,
  RISK_TOOLS,
  extractText,
  isToolConcurrencySafe,
  schemaToParameters,
  selectTools,
} from '../src/tools.js'

/**
 * 本包此前没有测试目录，而 package.json 的 test 脚本引用 `test/*.test.ts` ——
 * 运行 `node --import tsx --test` 时匹配 0 个文件、退出码 0，形成**假绿**。
 * 这里为导出面中的纯函数补上真实契约测试。
 */

test('selectTools：core 只保留核心工具集', () => {
  const all = ['remember', 'recall', 'run_command', 'unknown_tool']

  assert.deepEqual(selectTools(all, 'core'), ['remember', 'recall'])
  assert.deepEqual(selectTools(all, 'core'), all.filter(n => CORE_TOOLS.includes(n as never)))
})

test('selectTools：brain 保留大脑工具集（比 core 更宽）', () => {
  const all = ['remember', 'think', 'distill', 'blindspots', 'run_command']

  assert.deepEqual(selectTools(all, 'brain'), ['remember', 'think', 'distill', 'blindspots'])
  assert.ok(BRAIN_TOOLS.length > CORE_TOOLS.length, '大脑工具集应比核心集更宽')
})

test('selectTools：all 排除宿主级风险工具（动态扩权防线）', () => {
  const all = ['remember', 'run_command', 'designer_decide', 'see', 'world3d', 'recall']

  const selected = selectTools(all, 'all')

  assert.deepEqual(selected, ['remember', 'recall'])
  for (const name of selected) assert.ok(!RISK_TOOLS.has(name), `${name} 不应出现在 all 的结果中`)
})

test('selectTools：显式名称数组不受 RISK_TOOLS 限制（配置者已明确选择）', () => {
  const all = ['run_command', 'remember', 'see']

  assert.deepEqual(selectTools(all, ['run_command', 'see']), ['run_command', 'see'])
})

test('selectTools：结果保持输入顺序，且不返回未在 all 中出现的名字', () => {
  const all = ['b', 'a', 'c']

  assert.deepEqual(selectTools(all, ['c', 'b']), ['b', 'c'])
  assert.deepEqual(selectTools(all, ['a', 'zzz']), ['a'])
})

test('RISK_TOOLS 覆盖全部宿主级危险类别', () => {
  // 命令执行 / 权限裁决 / 外部设备 / 视觉身体 / 生命周期 / 角色卡写入
  for (const name of ['run_command', 'designer_decide', 'device_call', 'see', 'start_lifecycle', 'role_create']) {
    assert.ok(RISK_TOOLS.has(name), `${name} 应被列为风险工具`)
  }
})

test('isToolConcurrencySafe：只读工具并发安全，写工具不安全', () => {
  assert.equal(isToolConcurrencySafe('recall'), true)
  assert.equal(isToolConcurrencySafe('remember'), false)
  assert.equal(isToolConcurrencySafe('不存在的工具'), false)
})

test('schemaToParameters：缺失或畸形 schema 返回空对象而非抛错', () => {
  assert.deepEqual(schemaToParameters(undefined), {})
  assert.deepEqual(schemaToParameters({}), {})
  assert.deepEqual(schemaToParameters({ properties: null }), {})
})

test('schemaToParameters：按 required 标记必填项', () => {
  const spec = schemaToParameters({
    type: 'object',
    properties: {
      query: { type: 'string', description: '检索词' },
      limit: { type: 'integer' },
    },
    required: ['query'],
  })

  assert.equal(spec['query']?.required, true)
  assert.equal(spec['query']?.description, '检索词')
  assert.equal(spec['limit']?.required, undefined, '未列入 required 的字段不应标记必填')
})

test('extractText：拼接文本块并忽略非文本块', () => {
  assert.equal(extractText([]), '')
  assert.equal(
    extractText([{ type: 'text', text: '第一段' }, { type: 'image' }]),
    '第一段',
  )
  assert.equal(
    extractText([{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }]),
    'A\nB',
  )
  assert.equal(extractText([{ type: 'text' }]), '', 'text 缺失时按空串处理，不产生 undefined')
})
