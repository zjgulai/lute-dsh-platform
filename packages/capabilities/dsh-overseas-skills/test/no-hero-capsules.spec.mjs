import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * dsh-overseas-skills — 「输入框上方两胶囊必须消失」的契约测试。
 *
 * 为什么要有这一层：R1 要求移除 hero 上方那两个胶囊（出海技能 / AI全栈技能），
 * 但它们不是页面，是**一次 slot 注册**——注册代码删干净了功能才算真的没了；
 * 只删 UI 组件、留着注册，胶囊会照旧出现在每个空会话上，而单测全绿。
 *
 * 注册发生在**客户端 bundle**里（`lib/client.js` 的 `apply(ctx)`），不在宿主
 * `lib/index.js` 里——第一版测试就是因为 apply 了宿主模块，一个注册都没抓到。
 *
 * 同时它守住另一半：移除胶囊**不得**连带打掉技能中心。两件事共用同一次装载，
 * 所以「少了什么」与「还在什么」在同一个捕获里一起断言——只断言前者，把整个
 * bundle 装载弄坏了也会绿。
 *
 * 反空转：捕获要先自证有效（确实抓到了注册），否则「没注册 input.dock」只是
 * 因为什么都没抓到。
 */

const CLIENT_BUNDLE = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')

/** bundle 只在渲染期用 React；注册期只需要它存在。 */
const REACT_STUB = {
  createElement: () => null,
  Fragment: 'fragment',
  useState: () => [null, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
}

/** 最小 DOM 桩：client bundle 的 css effect 会 createElement('style') 并挂到 head。 */
const DOCUMENT_STUB = {
  createElement: () => ({ style: {}, textContent: '', setAttribute: () => {} }),
  head: { appendChild: () => {} },
  querySelector: () => null,
}

/**
 * 按客户端加载器的形状装载 bundle，并跑一遍它的 apply，截下所有 slot 注册。
 *
 * 用真的 bundle 而不是重写一遍注册逻辑：重写测的是替身，产品 bundle 照样可能坏。
 * @returns 注册的 slot 描述与注入过的 slot 名。
 */
function capture() {
  const registered = []
  const injected = []
  /**
   * 装载器交进来的模块描述。
   *
   * 必须显式注解：赋值发生在闭包里，checkJs 的「演化式 let」看不到它，
   * 会把 `spec` 推成 `undefined`，下面的 `assert.ok` 收窄成 `never` 就再也读不到
   * `factory`。
   * @type {{ id: string, factory: (require: (name: string) => unknown) => { apply: (ctx: unknown) => void } } | undefined}
   */
  let spec
  const windowStub = {
    __ModuleLoader__: { load(loaded) { spec = loaded } },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const requireStub = (name) => {
    if (name === 'react') return REACT_STUB
    throw new Error(`client bundle 请求了未预期的模块：${name}`)
  }
  // eslint-disable-next-line no-new-func -- 装载浏览器 bundle 就必须真的执行它
  new Function('window', 'document', 'require', readFileSync(CLIENT_BUNDLE, 'utf8'))(
    windowStub, DOCUMENT_STUB, requireStub,
  )
  assert.ok(spec !== undefined, `客户端 bundle 没有调用 window.__ModuleLoader__.load：${CLIENT_BUNDLE}`)
  const factory = spec.factory(requireStub)
  assert.equal(typeof factory.apply, 'function', '客户端 bundle 没导出 apply(ctx)')

  factory.apply({
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    locale: { register: () => {}, bind: () => (key) => key },
    slots: {
      inject(name, fn) {
        injected.push(name)
        const dispose = fn()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      register(slot) {
        registered.push(slot)
        return () => {}
      },
    },
  })
  return { registered, injected }
}

test('捕获本身有效：装载 bundle 后确实抓到 slot 注册（否则下面的断言都是空转）', () => {
  const { registered } = capture()
  assert.ok(registered.length > 0, '一个 slot 都没捕获到——装载桩或 bundle 已坏')
})

test('R1：不再向上方输入框坞（conversation.input.dock）注册任何面', () => {
  const { registered, injected } = capture()
  const docked = registered.filter((slot) => slot.name === 'conversation.input.dock')
  assert.deepEqual(
    docked, [],
    `输入框上方仍有注册：${docked.map((s) => s.id).join('、')}——R1 要求这里彻底为空`,
  )
  assert.ok(
    !injected.includes('conversation.input.dock'),
    '仍在 inject conversation.input.dock（注册虽没发生，注入点还挂着）',
  )
})

test('R1 的另一半：技能中心两页仍在注册（移除不得连带打掉插件本体）', () => {
  const { registered } = capture()
  const settings = registered.filter((slot) => slot.name === 'settings.section')
  const ids = settings.map((s) => s.id)
  assert.ok(ids.includes('overseas-skills'), `出海技能页没注册：实际 ${ids.join('、') || '无'}`)
  assert.ok(ids.includes('fullstack-skills'), `AI全栈技能页没注册：实际 ${ids.join('、') || '无'}`)
})
