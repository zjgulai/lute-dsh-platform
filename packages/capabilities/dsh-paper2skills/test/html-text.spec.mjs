/**
 * lib/html-text.js 的判据。
 *
 * 每一条「保留 <pre> 缩进」都对应一次真实事故：`strip()` 曾对整段文本做
 * `.replace(/[ \t]+/g, ' ')`，把 1338 张卡的 Python 缩进压成 1 个空格。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { strip, preText, decodeEntities } from '../lib/html-text.js'

test('decodeEntities：十进制与十六进制数字引用都解', () => {
  assert.equal(decodeEntities('&#39;'), "'")
  assert.equal(decodeEntities('&#x27;'), "'") // 源站用的就是这一种
  assert.equal(decodeEntities('&#x2F;'), '/')
  assert.equal(decodeEntities('&#8212;'), '—')
})

test('decodeEntities：具名实体，且 &amp; 最后解（不得二次解码）', () => {
  assert.equal(decodeEntities('&lt;b&gt;'), '<b>')
  assert.equal(decodeEntities('&quot;x&quot;'), '"x"')
  assert.equal(decodeEntities('&nbsp;'), ' ')
  // 若先解 &amp; 就会把 &amp;lt; 变成 < —— 这是错的，它代表字面量 &lt;
  assert.equal(decodeEntities('&amp;lt;'), '&lt;')
})

test('strip：<pre> 内的缩进逐字保留', () => {
  const html = '<p>前文</p><pre><code>class Item:\n    item_id: str\n    def f(self):\n        return 1\n</code></pre>'
  const out = strip(html)
  assert.ok(out.includes('    item_id: str'), `丢了 4 空格缩进：${JSON.stringify(out)}`)
  assert.ok(out.includes('        return 1'), `丢了 8 空格缩进：${JSON.stringify(out)}`)
})

test('strip：<pre> 内的单引号实体解成真单引号（回归：&#x27;）', () => {
  const html = "<pre><code>p[&#x27;l&#x27;] * p[&#x27;w&#x27;]</code></pre>"
  assert.equal(strip(html), "p['l'] * p['w']")
})

test('strip：<pre> 外的空白照旧压平（不能因为保 <pre> 就整体不压）', () => {
  assert.equal(strip('<p>a    b\t\tc</p>'), 'a b c')
})

test('strip：<pre> 内的空行不被并成两行', () => {
  const html = '<pre><code>a\n\n\n\nb</code></pre>'
  assert.equal(strip(html), 'a\n\n\n\nb')
})

test('strip：<pre> 外的连续空行仍并成一行空行', () => {
  assert.equal(strip('<p>a</p><p></p><p></p><p></p><p>b</p>'), 'a\n\nb')
})

test('strip：script / style 整块丢弃，<br> 还原成换行', () => {
  assert.equal(strip('<script>var x=1</script><p>a</p>'), 'a')
  assert.equal(strip('<style>.a{}</style><p>a</p>'), 'a')
  assert.equal(strip('a<br>b'), 'a\nb')
})

test('strip：多个 <pre> 块各自保真，且按原顺序放回', () => {
  const html = '<pre><code>    one</code></pre><p>mid</p><pre><code>        two</code></pre>'
  const out = strip(html)
  assert.ok(out.indexOf('    one') < out.indexOf('mid'))
  assert.ok(out.indexOf('mid') < out.indexOf('        two'))
  assert.ok(out.includes('        two'))
})

test('strip：<pre> 里的比较符与泛型不被当成标签吃掉', () => {
  // 语料实测：424 个 pre 块用 &lt;、0 个裸 <。两种形态都不得吃掉代码。
  assert.ok(strip('<pre><code>if a &lt; b:\n    x = dict[str, int]()</code></pre>').includes('if a < b:'))
  assert.ok(strip('<pre><code>if a < b:\n    x = dict[str, int]()</code></pre>').includes('if a < b:'))
  const out = strip('<pre><code>if a < b:\n    x = dict[str, int]()</code></pre>')
  assert.ok(out.includes('dict[str, int]()'), out)
})

test('preText：只解实体去标签，不 trim 内部缩进', () => {
  assert.equal(preText('\n    a\n        b\n'), '    a\n        b')
  assert.equal(preText('<span>&#x27;</span>'), "'")
})
