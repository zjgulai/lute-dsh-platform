import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveUpload, sanitizeFilename } from '../lib/index.js'

/**
 * 每个用例注册为真实测试：先前的自定义 harness 只在单文件里跑断言，
 * `node --test` 只能看到 1 个测试、无法定位失败（实测），故改为注册式。
 */
let root
before(async () => { root = await mkdtemp(join(tmpdir(), 'dsh-fu-')) })

test('sanitize：普通文件名原样保留', () => {
  assert.equal(sanitizeFilename('report.pdf'), 'report.pdf')
})

test('sanitize：路径分隔符归一为下划线', () => {
  assert.equal(sanitizeFilename('a/b\\c.txt'), 'a_b_c.txt')
})

test('sanitize：前导点被剥离', () => {
  assert.equal(sanitizeFilename('...secret'), 'secret')
})

test('sanitize：空白名回退为 upload.bin', () => {
  assert.equal(sanitizeFilename('   '), 'upload.bin')
})

test('sanitize：路径穿越不可逃出目标目录', () => {
  const out = sanitizeFilename('../../etc/passwd')
  assert.ok(!out.includes('/'), `不得含路径分隔符：${out}`)
  assert.ok(!out.includes('\\'), `不得含反斜杠：${out}`)
  assert.ok(!out.startsWith('.'), `不得以点开头：${out}`)
  assert.notEqual(out, '.')
  assert.notEqual(out, '..')
})

test('save：写入字节并返回相对路径', async () => {
  const { absolute, relativePath } = await saveUpload(root, 'hello.txt', Buffer.from('hi'))
  assert.equal(relativePath, 'uploads/hello.txt')
  assert.equal(await readFile(absolute, 'utf8'), 'hi')
})

test('save：重名时以 -1 后缀去重', async () => {
  const base = `dedupe-${Date.now()}.txt`
  await saveUpload(root, base, Buffer.from('a'))
  const second = await saveUpload(root, base, Buffer.from('b'))
  const stem = base.slice(0, -4)
  assert.equal(second.relativePath, `uploads/${stem}-1.txt`)
})

test('save：去重时保留扩展名', async () => {
  const result = await saveUpload(root, 'data.json', Buffer.from('{}'))
  assert.equal(result.relativePath, 'uploads/data.json')
})

test('save：workspace 根不可用时抛错（不静默写入）', async () => {
  await assert.rejects(() => saveUpload('', 'x.txt', Buffer.from('x')), /workspace root is unavailable/)
})
