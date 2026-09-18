import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicStore, createAtomicStore, createSerialQueue, CORRUPT } from '../lib/atomic-store.js'

/**
 * dsh-wanzh-hulian — 持久化原子性契约（SEC-RT-006）。
 *
 * 公开 seam：`createAtomicStore()` 返回的 store 是**唯一**写盘入口
 * （`writeJson` / `writeText` / `readJson` / `updateJson`）。
 *
 * 覆盖动机（每项对应一次真实的读数为证）：
 *  - 旧 `writeState()`/`writeMcpServers()`/`writeConnections()`/`writeOauthToken()`
 *    直接 `writeFile` 最终路径：进程在写中途消失即留下截断 JSON，而截断文件在
 *    下一次读取时**静默回退默认值**，于是配置丢失看起来像「恢复了出厂设置」。
 *  - 既有 0644 文件写后仍是 0644：`writeFile` 的 `mode` 只在**创建**时生效。
 *  - 损坏文件既没有 fail-closed，也没有保留取证字节——重写会直接抹掉证据。
 *
 * 失败注入用**注入 ops** 而不是 monkey-patch：模块本身是 I/O 边界，把
 * fs 门面当依赖注入既让「rename 前崩溃」这类时序可确定性重放，又不必在生产
 * 代码里埋测试钩子（同 `fetchShopifyAdmin(fetch, …)` 的既有约定）。
 */

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'wanzh-atomic-'))
}

function opsFailingAt(faultPoint) {
  const real = { ...defaultOpsForTest() }
  return {
    ...real,
    rename: (from, to) => {
      if (faultPoint === 'rename') throw new Error('EIO: injected rename failure')
      return real.rename(from, to)
    },
  }
}

/** 从模块本体取真实实现，测试只覆盖一个故障点。 */
function defaultOpsForTest() {
  return atomicStore.ops
}

test('writeJson：写入后可读回，权限 0600，且不留下临时文件', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'config.json')
    await atomicStore.writeJson(file, { enabled: false, modelInvoke: true })
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { enabled: false, modelInvoke: true })
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.deepEqual(readdirSync(dir), ['config.json'], '同目录临时文件必须已被 rename 消费')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeJson：预建 0644 文件在成功写入后被收紧到 0600', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'connections.json')
    writeFileSync(file, '{"connections":[]}')
    chmodSync(file, 0o644)
    assert.equal(statSync(file).mode & 0o777, 0o644)

    await atomicStore.writeJson(file, { connections: [{ id: 'pixpix' }] })
    assert.equal(statSync(file).mode & 0o777, 0o600, '既有 0644 必须在写后变 0600')
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { connections: [{ id: 'pixpix' }] })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeJson：父目录不存在时按 0700 建立再写', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'nested', 'deep', 'state.json')
    await atomicStore.writeJson(file, { enabled: true })
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.equal(statSync(join(dir, 'nested', 'deep')).mode & 0o777, 0o700)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readJson：缺失与损坏是两种不同的失败，且都不抛异常', async () => {
  const dir = tempDir()
  try {
    const missing = await atomicStore.readJson(join(dir, 'nope.json'))
    assert.equal(missing.ok, false)
    assert.equal(missing.reason, 'missing')

    const corruptFile = join(dir, 'broken.json')
    writeFileSync(corruptFile, '{"enabled": tru')
    const corrupt = await atomicStore.readJson(corruptFile)
    assert.equal(corrupt.ok, false)
    assert.equal(corrupt.reason, CORRUPT)
    assert.equal(corrupt.raw, '{"enabled": tru', '损坏时必须把原字节交回调用方')
    assert.equal(typeof corrupt.error, 'string')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readJson：损坏文件不会被读取动作改写（原字节可继续取证）', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'config.json')
    const original = '{"enabled": fal'
    writeFileSync(file, original)
    await atomicStore.readJson(file)
    assert.equal(readFileSync(file, 'utf8'), original)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('updateJson：损坏文件上拒绝写入，原字节逐字节不变（不许拿默认值覆盖证据）', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'config.json')
    const original = 'not json at all'
    writeFileSync(file, original)

    await assert.rejects(
      () => atomicStore.updateJson(file, () => ({ enabled: true }), { initial: { enabled: true } }),
      (/** @type {any} */ e) => e.code === 'CORRUPT_STATE',
    )
    assert.equal(readFileSync(file, 'utf8'), original)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('updateJson：缺失文件用 initial 起步，返回合并后的值', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'config.json')
    const next = await atomicStore.updateJson(file, (cur) => ({ ...cur, modelInvoke: true }), {
      initial: { enabled: false, modelInvoke: false },
    })
    assert.deepEqual(next, { enabled: false, modelInvoke: true })
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { enabled: false, modelInvoke: true })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('kill-before-rename：rename 之前失败时旧文件逐字节完整，临时文件不残留', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'config.json')
    const original = JSON.stringify({ enabled: true, marker: 'old-bytes' })
    writeFileSync(file, original)

    const store = createAtomicStore(opsFailingAt('rename'))
    await assert.rejects(() => store.writeJson(file, { enabled: false, marker: 'new-bytes' }), /injected rename failure/)

    assert.equal(readFileSync(file, 'utf8'), original, '写失败必须保留旧文件')
    assert.deepEqual(readdirSync(dir), ['config.json'], '失败路径必须清理自己的临时文件')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('updateJson：100 次并发读-改-写不损坏 JSON 且不丢已确认更新', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'config.json')
    const N = 100
    await atomicStore.writeJson(file, { counters: [] })

    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        atomicStore.updateJson(file, (cur) => ({ counters: [...cur.counters, i] }), { initial: { counters: [] } }),
      ),
    )

    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(parsed.counters.length, N, '每次已确认的更新都必须留下')
    assert.deepEqual([...parsed.counters].sort((a, b) => a - b), Array.from({ length: N }, (_, i) => i))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeJson：100 次并发直写同一路径，读回来的永远是某一次的完整值', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'token.json')
    await Promise.all(
      Array.from({ length: 100 }, (_, i) => atomicStore.writeJson(file, { seq: i, filler: 'x'.repeat(64) })),
    )
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(typeof parsed.seq, 'number')
    assert.equal(parsed.filler.length, 64)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('createSerialQueue：任务严格按提交顺序执行，失败不阻断后续任务', async () => {
  const queue = createSerialQueue()
  const order = []
  const first = queue.run(async () => {
    await new Promise((r) => setTimeout(r, 20))
    order.push('a')
  })
  const boom = queue.run(async () => {
    order.push('b')
    throw new Error('fail-b')
  })
  const third = queue.run(async () => {
    order.push('c')
  })

  await first
  await assert.rejects(() => boom, /fail-b/)
  await third
  assert.deepEqual(order, ['a', 'b', 'c'])
})

test('writeText：技能等文本文件同样原子替换并保留给定权限', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'SKILL.md')
    mkdirSync(dir, { recursive: true })
    await atomicStore.writeText(file, '---\nname: x\n---\n', { mode: 0o644 })
    assert.equal(readFileSync(file, 'utf8'), '---\nname: x\n---\n')
    assert.equal(statSync(file).mode & 0o777, 0o644)
    assert.equal(existsSync(file), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeText：受限 umask 下仍得到请求的权限位（chmod 是承重件，不是装饰）', async () => {
  const dir = tempDir()
  const before = process.umask(0o077)
  try {
    const file = join(dir, 'SKILL.md')
    // umask 077 会把 open 的 0644 削成 0600；只有显式 chmod 才能拿回 0644。
    await atomicStore.writeText(file, 'x', { mode: 0o644 })
    assert.equal(statSync(file).mode & 0o777, 0o644, 'umask 077 下 0644 必须靠 chmod 拿回')
    const secret = join(dir, 'config.json')
    await atomicStore.writeJson(secret, { enabled: false })
    assert.equal(statSync(secret).mode & 0o777, 0o600)
  } finally {
    process.umask(before)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('提交顺序：rename 之前先落盘文件、rename 之后落盘目录（结构性断言，非崩溃证明）', async () => {
  // 射程声明：这条只证明「提交序列里有这两步」，**不证明断电后不丢**。
  // 目录/文件 fsync 的断裂只有真实崩溃（断电、内核 panic）才观测得到，
  // 进程级测试观测不到——所以这里不写「已调用＝已安全」的假断言，
  // 只把顺序钉住：文件 sync → rename → 目录 sync。
  const dir = tempDir()
  try {
    const events = []
    const real = atomicStore.ops
    const ops = {
      ...real,
      open: async (path, flags, mode) => {
        const handle = await real.open(path, flags, mode)
        if (flags === 'r') return handle
        return {
          writeFile: (...a) => handle.writeFile(...a),
          close: (...a) => handle.close(...a),
          sync: async () => {
            events.push('file-sync')
            return handle.sync()
          },
        }
      },
      rename: async (from, to) => {
        events.push('rename')
        return real.rename(from, to)
      },
      fsyncDir: async (d) => {
        events.push('dir-sync')
        return real.fsyncDir(d)
      },
    }
    await createAtomicStore(ops).writeJson(join(dir, 'config.json'), { enabled: false })
    assert.deepEqual(events, ['file-sync', 'rename', 'dir-sync'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('权限无法收紧时拒绝 rename：宽权限文件绝不落成最终路径（失败方向＝不出货）', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'config.json')
    const ops = { ...atomicStore.ops }
    // 模拟一个「mode 与 chmod 都不生效」的文件系统（如某些网络盘/挂载盘）。
    ops.open = async (path, flags, _mode) => atomicStore.ops.open(path, flags, 0o644)
    ops.chmod = async () => {}

    const store = createAtomicStore(ops)
    await assert.rejects(() => store.writeJson(file, { enabled: false }), /权限校验失败/)
    assert.equal(existsSync(file), false, '校验失败时最终路径不得出现该文件')
    assert.deepEqual(readdirSync(dir), [], '临时文件也必须被清掉')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
