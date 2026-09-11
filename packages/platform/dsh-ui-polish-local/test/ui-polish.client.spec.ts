import { afterEach, describe, expect, it } from 'vitest'
import '../lib/client.js'

import { loaderEntries } from './setup'

/** 插件导出的应用函数：接收 ctx 并注册 effect。 */
type ApplyFn = (ctx: { effect: (fn: () => void | (() => void), label?: string) => void }) => void

/** 从 ModuleLoader 捕获的入口取出插件导出（bundle 由 setup 的桩在导入时记录）。 */
function pluginExports(): { apply: ApplyFn } {
  const entry = loaderEntries().find(item => item.id === 'dsh-ui-polish')
  if (entry === undefined) throw new Error('未捕获到 dsh-ui-polish 的 ModuleLoader 入口')
  // 工厂直接返回模块导出对象（bundle 内 `return module.exports`）。
  return entry.factory(() => ({})) as { apply: ApplyFn }
}

/** 安装插件并同步执行其注册的 effect。 */
function install(): { dispose: () => void } {
  const { apply } = pluginExports()
  const disposers: Array<() => void> = []
  apply({ effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d) } })
  return { dispose: () => { for (const d of disposers) d() } }
}

const STYLE_ID = 'dsh-ui-polish-css'

afterEach(() => {
  document.getElementById(STYLE_ID)?.remove()
})

describe('dsh-ui-polish：CSS 注入', () => {
  it('安装后写入带固定 id 的 style 标签，并设置正文宽度 token', () => {
    const { dispose } = install()

    const tag = document.getElementById(STYLE_ID)
    expect(tag).not.toBeNull()
    expect(tag?.textContent).toContain('--dsh-chat-content-width: 960px')
    dispose()
  })

  it('重复安装不产生重复标签（幂等）', () => {
    const first = install()
    const second = install()

    expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1)
    first.dispose()
    second.dispose()
  })

  it('disposer 移除标签，页面回到无注入状态', () => {
    const { dispose } = install()
    expect(document.getElementById(STYLE_ID)).not.toBeNull()

    dispose()

    expect(document.getElementById(STYLE_ID)).toBeNull()
  })
})
