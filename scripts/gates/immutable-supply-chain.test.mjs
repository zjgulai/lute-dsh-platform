import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkImmutableSupplyChain } from './immutable-supply-chain.mjs'

test('checkImmutableSupplyChain: 完整固化的配置能顺利通过', () => {
  const result = checkImmutableSupplyChain({
    mcpServersSource: 'args: ["-y", "shopify-mcp@1.0.8"] ... args: ["-y", "@getnote/mcp@1.7.2"] ... oauthCmd: "npx @getnote/cli@1.7.2 auth login"',
    loopxInitSource: 'const LOOPX_REQUIREMENT = "loopx==0.5.4"; pip install --no-deps',
    thirdPartyInventory: {
      repos: [
        { id: 'pm', repo: 'phuryn/pm-skills', commit: '8607e3b077817f89bf4a9b623246219734ac3be0' },
        { id: 'mp', repo: 'mattpocock/skills', commit: '74ca5fe077456a0b3b2f5310cf9430999fd0b5fd' },
      ],
    },
    thirdPartyFetchSource: 'listTree(repo, commit) ... trees/${commit}',
  })
  assert.equal(result.passed, true)
  assert.equal(result.violations.length, 0)
})

test('checkImmutableSupplyChain: 捕获浮动 npx/latest/loopx 范围及 HEAD 引用', () => {
  const result = checkImmutableSupplyChain({
    mcpServersSource: 'args: ["-y", "shopify-mcp"] ... oauthCmd: "npx @getnote/cli@latest auth login"',
    loopxInitSource: 'const LOOPX_REQUIREMENT = "loopx>=0.5.4"; pip install --upgrade',
    thirdPartyInventory: {
      repos: [
        { id: 'pm', repo: 'phuryn/pm-skills' }, // missing commit
      ],
    },
    thirdPartyFetchSource: 'trees/HEAD?recursive=1',
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length >= 4, true)
  assert.ok(result.violations.some((v) => v.includes('shopify-mcp')))
  assert.ok(result.violations.some((v) => v.includes('@latest')))
  assert.ok(result.violations.some((v) => v.includes('loopx>=')))
  assert.ok(result.violations.some((v) => v.includes('--upgrade')))
  assert.ok(result.violations.some((v) => v.includes('缺少合法的 40 位不可变 commit SHA')))
  assert.ok(result.violations.some((v) => v.includes('HEAD 浮动引用')))
})
