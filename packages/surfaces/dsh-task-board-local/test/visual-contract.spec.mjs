import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const clientSource = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

test('看板视觉合同：使用语义 token、克制层级并支持 reduced motion', () => {
  assert.match(clientSource, /var\(--dsw-alias-bg-base\)/)
  assert.match(clientSource, /transition:border-color 180ms ease/)
  assert.match(clientSource, /prefers-reduced-motion: reduce/)
  assert.match(clientSource, /--dsw-alias-state-warn-primary/)
  assert.doesNotMatch(clientSource, /background(?:-image)?:linear-gradient/)
})
