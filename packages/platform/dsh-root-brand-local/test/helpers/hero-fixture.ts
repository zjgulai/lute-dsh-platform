/**
 * 测试辅助：在 happy-dom 里复刻官方 hero 的真实 DOM 结构，并装载真实插件产物。
 *
 * 纯 DOM 操作，不引入 React —— 避免与 bundle 内部压缩符号发生顶层命名冲突。
 */
import { loaderEntries } from '../setup'

/** 官方 hero 三个元素的完整类名（真值来自官方产物，由调用方解析传入）。 */
export interface HeroClasses {
  headline: string
  headlineText: string
  previewBadge: string
}

/** 插件渲染的品牌句：期望值来自用户可见需求（规格 User Story 1），不是实现里的常量。 */
export const BRAND_PHRASE = 'Artificial Business Intelligence Agentic'

/**
 * 把官方某个模块的**完整 CSS 文本**注册成官方形态的样式标签
 * （官方产物就是这么做的：`style[data-plugin-css="<包路径>/<模块>.module.css"]`）。
 */
export function installOfficialStyle(moduleId: string, css: string): void {
  const tag = document.createElement('style')
  tag.dataset.pluginCss = moduleId
  tag.textContent = css
  document.head.appendChild(tag)
}

export interface HeroFixture {
  hero: HTMLElement
  headlineText: HTMLElement
  previewBadge: HTMLElement
  fishHitbox: HTMLElement
}

/**
 * 复刻官方 HeroShell：`.<hash>_headline` 栅格三子元素。
 * 插件内容（品牌标 + 品牌句）按产品真实状态放进 `fishHitbox`。
 */
export function renderHeroFixture(classes: HeroClasses, brandMarkHtml: string): HeroFixture {
  const root = document.createElement('div')
  root.innerHTML =
    `<div class="${classes.headline}">` +
    `<span class="fishHitbox"></span>` +
    `<span class="${classes.headlineText}">探索未至之境</span>` +
    `<span class="${classes.previewBadge}">预览版</span>` +
    `</div>`
  const hero = root.firstElementChild as HTMLElement
  const [fishHitbox, headlineText, previewBadge] = [...hero.children] as HTMLElement[]
  ;(fishHitbox as HTMLElement).innerHTML = brandMarkHtml
  document.body.appendChild(hero)
  return {
    hero,
    fishHitbox: fishHitbox as HTMLElement,
    headlineText: headlineText as HTMLElement,
    previewBadge: previewBadge as HTMLElement,
  }
}

/** 复刻插件在 hero 席位渲染的内容：ROOT 字标 + 品牌句。 */
export function brandMarkHtml(): string {
  return (
    '<div data-plugin="dsh-root-brand" class="dsh-rb-hero">' +
    '<svg viewBox="0 0 61 32" width="46" height="24"><rect x="6.5" y="26" width="16.5" height="5" fill="#58B848"/></svg>' +
    `<span class="dsh-rb-hero-name">${BRAND_PHRASE}</span>` +
    '</div>'
  )
}

/** 当前可见（未被 display:none 命中）的文本节点内容。 */
export function visibleTexts(root: HTMLElement, needle: string): string[] {
  const found: string[] = []
  const walk = (node: Element): void => {
    for (const child of [...node.children]) {
      if (getComputedStyle(child).display === 'none') continue
      if (child.textContent?.includes(needle) === true) {
        found.push(child.textContent)
        continue
      }
      walk(child)
    }
  }
  walk(root)
  return found
}

type ApplyFn = (ctx: unknown) => void

interface PluginExports {
  apply: ApplyFn
}

/** 从 ModuleLoader 捕获的入口取出插件导出。 */
export function pluginExports(): PluginExports {
  const entry = loaderEntries().find((item) => item.id === 'dsh-root-brand')
  if (entry === undefined) throw new Error('未捕获到 dsh-root-brand 的 ModuleLoader 入口')
  return entry.factory(() => ({})) as PluginExports
}

/**
 * 装载插件：提供最小 ctx（slots 注册 + effect 生命周期），返回 dispose。
 * slot 登记在测试里不参与渲染（DOM 由 fixture 直接构造），
 * 只保证插件启动路径与产品一致。
 */
export function installPlugin(): { dispose: () => void } {
  const disposers: Array<() => void> = []
  const ctx = {
    effect: (fn: () => void | (() => void)) => {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    slots: {
      inject: (_slot: string, register: () => unknown) => register(),
      register: () => () => {},
    },
  }
  pluginExports().apply(ctx)
  return {
    dispose: () => {
      for (const dispose of disposers) dispose()
    },
  }
}
