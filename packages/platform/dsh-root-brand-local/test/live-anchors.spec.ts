/**
 * 纵切 1：官方 hero 标题必须在真实产物上被插件隐藏（"同一句只出现一次"）。
 *
 * seam：真实产物 lib/client.js —— 经 ModuleLoader 桩载入后在 happy-dom 中执行 apply。
 * 真值：官方 CSS 文本与类名从官方产物（本机 app 包 / 已入库 2.0.4 归档）解析，不写死在测试里。
 */
import { afterEach, describe, expect, it } from 'vitest'

import '../lib/client.js'

import {
  BRAND_PHRASE,
  brandMarkHtml,
  installOfficialStyle,
  installPlugin,
  renderHeroFixture,
  visibleTexts,
} from './helpers/hero-fixture'
import {
  CONVERSATION_CLIENT_CANDIDATES,
  HERO_SHELL_MODULE_ID,
  extractModuleCss,
  firstExisting,
  officialHeroClasses,
} from './official-artifacts'

const conversationClient = firstExisting(CONVERSATION_CLIENT_CANDIDATES)

describe.skipIf(conversationClient === undefined)('hero 品牌唯一性（真实产物 seam）', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('插件生效后：官方标题被隐藏，插件标题可见 —— 同一句只出现一次', () => {
    const bundle = conversationClient as string
    const classes = officialHeroClasses(bundle)
    installOfficialStyle(HERO_SHELL_MODULE_ID, extractModuleCss(bundle, HERO_SHELL_MODULE_ID))
    const fixture = renderHeroFixture(classes, brandMarkHtml())

    installPlugin()

    expect(getComputedStyle(fixture.headlineText).display).toBe('none')
    expect(visibleTexts(fixture.hero, BRAND_PHRASE)).toEqual([BRAND_PHRASE])
    expect(fixture.fishHitbox.querySelector('svg')).not.toBeNull()
  })
})

describe.skipIf(conversationClient === undefined)('hero 覆盖规则的级联顺序无关性（真实产物 seam）', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  /**
   * 故障复现（2.0.5 实测）：官方 HeroShell 规则与本插件锚点规则**特异性相同**
   * （都是单类名 0-1-0），谁在 head 里靠后谁赢。插件启动时官方样式标签尚未注入 →
   * 锚点标签先建、规则后填，位置却永远停在官方标签之前 → 官方
   * `grid-template-columns: 34px auto auto` 反压，品牌槽（约 400px）被塞进 34px
   * 轨道并溢出，与 `previewBadge` 重叠 —— 空会话 hero 的 Preview 角标错位。
   *
   * 本测试把「先装插件、后注入官方样式」的敌意顺序固化下来：修复前两条断言必红。
   */
  it('插件先装载、官方样式后到：规则仍带 !important 且标签居 head 末尾', async () => {
    const bundle = conversationClient as string
    const classes = officialHeroClasses(bundle)

    const fixture = renderHeroFixture(classes, brandMarkHtml())
    const plugin = installPlugin()
    await new Promise((resolve) => setTimeout(resolve, 5))

    // 官方样式此刻才到 —— 追加在插件标签之后。
    installOfficialStyle(HERO_SHELL_MODULE_ID, extractModuleCss(bundle, HERO_SHELL_MODULE_ID))
    await new Promise((resolve) => setTimeout(resolve, 10))

    const anchorTag = document.getElementById('dsh-root-brand-anchors') as HTMLStyleElement | null
    expect(anchorTag).not.toBeNull()
    const styles = [...document.head.querySelectorAll('style')]
    // 第二道保险：写入后移到末尾，同特异性下恒胜。
    expect(styles.at(-1)).toBe(anchorTag)
    // 第一道保险：覆盖声明带 !important，顺序无关。
    expect(anchorTag?.textContent).toContain('!important')
    expect(getComputedStyle(fixture.headlineText).display).toBe('none')

    plugin.dispose()
    fixture.hero.remove()
  })
})

describe.skipIf(conversationClient === undefined)('hero 预览角标文案（真实产物 seam）', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('角标显示 Preview；React 回写后仍然成立；卸载可还原', async () => {
    const bundle = conversationClient as string
    const classes = officialHeroClasses(bundle)
    installOfficialStyle(HERO_SHELL_MODULE_ID, extractModuleCss(bundle, HERO_SHELL_MODULE_ID))
    const fixture = renderHeroFixture(classes, brandMarkHtml())

    const plugin = installPlugin()

    // 文案真值来自官方 en 词典（同一产物里的 hero.preview: "Preview"）。
    expect(fixture.previewBadge.textContent).toBe('Preview')

    // React 把它写回中文后，插件必须重新改写（同一元素、同一观测点）。
    fixture.previewBadge.textContent = '预览版'
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(fixture.previewBadge.textContent).toBe('Preview')

    // 卸载后还原官方文案，不留残余（在清理 DOM 之前断言）。
    plugin.dispose()
    expect(fixture.previewBadge.textContent).toBe('预览版')
    fixture.hero.remove()
  })
})
