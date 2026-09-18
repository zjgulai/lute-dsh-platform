import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const INDEX_FILE = join(HERE, '..', 'lib', 'index.js')

test('SEC-RT-002: DEFAULT_MCP_SERVERS 与 OAuth 命令中禁止出现浮动版本或未锁版本的 npx -y', () => {
  const content = readFileSync(INDEX_FILE, 'utf8')

  // 1. 验证 shopify-mcp 必须固定确切版本
  assert.ok(
    content.includes('shopify-mcp@1.0.8'),
    'DEFAULT_MCP_SERVERS 中 shopify-mcp 必须显式固定版本 1.0.8'
  )
  assert.ok(
    !content.includes('args: ["-y", "shopify-mcp"]'),
    '禁止出现未带版本的 shopify-mcp 动态执行'
  )

  // 2. 验证 @getnote/mcp 必须固定确切版本
  assert.ok(
    content.includes('@getnote/mcp@1.7.2'),
    'DEFAULT_MCP_SERVERS 中 @getnote/mcp 必须显式固定版本 1.7.2'
  )
  assert.ok(
    !content.includes('args: ["-y", "@getnote/mcp"]'),
    '禁止出现未带版本的 @getnote/mcp 动态执行'
  )

  // 3. 验证 oauthCmd 中禁止出现 @latest 标签
  assert.ok(
    !content.includes('@latest'),
    '禁止在任何连接器命令或 oauthCmd 中使用 @latest'
  )
  assert.ok(
    content.includes('@getnote/cli@1.7.2'),
    'oauthCmd 必须显式固定确切版本'
  )
})
