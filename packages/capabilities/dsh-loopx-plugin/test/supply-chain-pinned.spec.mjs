import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const INIT_FILE = join(HERE, '..', 'lib', 'init-command.js')

test('SEC-RT-002: LoopX 运行时依赖必须绝对固定确切版本，禁止浮动版本和 --upgrade', () => {
  const content = readFileSync(INIT_FILE, 'utf8')

  // 1. 验证 LOOPX_REQUIREMENT 严格固定
  assert.ok(
    content.includes('const LOOPX_REQUIREMENT = "loopx==0.5.4";'),
    'LOOPX_REQUIREMENT 必须锁定为 loopx==0.5.4'
  )
  assert.ok(
    !content.includes('loopx>='),
    '禁止出现范围表达式（如 loopx>=...）'
  )

  // 2. 验证 pip install 参数不含 --upgrade 且包含 --no-deps
  assert.ok(
    !content.includes('"--upgrade"'),
    'pip install 参数不得包含 --upgrade 标志'
  )
  assert.ok(
    content.includes('"--no-deps"'),
    'pip install 必须带 --no-deps 标志确保离线和不可变'
  )
})
