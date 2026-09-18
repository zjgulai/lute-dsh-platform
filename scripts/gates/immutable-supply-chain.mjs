/**
 * 校验供应链不可变性（SEC-RT-002 / ADR-0113）：
 * 1. 禁止浮动的 HEAD、latest 声明在第三方取件和 MCP 配置中。
 * 2. 禁止未锁版本的 npx -y 或未固化的 pip 依赖范围（如 loopx>=0.5.4）。
 * 3. 第三方技能来源必须绑定明确的 40 位不可变 Commit SHA。
 * 
 * @param {{
 *   mcpServersSource: string,
 *   loopxInitSource: string,
 *   thirdPartyInventory: any,
 *   thirdPartyFetchSource: string
 * }} input
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkImmutableSupplyChain({
  mcpServersSource,
  loopxInitSource,
  thirdPartyInventory,
  thirdPartyFetchSource,
}) {
  const violations = []

  // 1. 检查 MCP 服务器配置：禁止浮动 npx -y 或未锁版本
  if (mcpServersSource) {
    if (mcpServersSource.includes('npx -y shopify-mcp"') || mcpServersSource.includes('"shopify-mcp"')) {
      violations.push('mcp-servers: shopify-mcp 必须固定到确定版本（如 shopify-mcp@1.0.8），禁止未带版本的动态拉取')
    }
    if (mcpServersSource.includes('npx -y @getnote/mcp"') || mcpServersSource.includes('"@getnote/mcp"')) {
      violations.push('mcp-servers: @getnote/mcp 必须固定到确定版本（如 @getnote/mcp@1.7.2），禁止未带版本的动态拉取')
    }
    if (mcpServersSource.includes('@latest')) {
      violations.push('mcp-servers: 包含浮动的 @latest 标签，必须替换为确切版本号')
    }
  }

  // 2. 检查 LoopX 运行时：禁止浮动版本和隐式在线升包
  if (loopxInitSource) {
    if (loopxInitSource.includes('loopx>=')) {
      violations.push('loopx-plugin: LOOPX_REQUIREMENT 包含范围表达式（loopx>=...），必须固定为确切版本（如 loopx==0.5.4）')
    }
    if (loopxInitSource.includes('--upgrade')) {
      violations.push('loopx-plugin: pip install 包含 --upgrade 标志，违反离线不可变原则')
    }
  }

  // 3. 检查第三方技能清单：必须包含 40 位 hex commit
  if (thirdPartyInventory && Array.isArray(thirdPartyInventory.repos)) {
    for (const repo of thirdPartyInventory.repos) {
      if (!repo.commit || !/^[0-9a-f]{40}$/i.test(repo.commit)) {
        violations.push(`third-party-inventory: repo ${repo.id || repo.repo} 缺少合法的 40 位不可变 commit SHA`)
      }
    }
  }

  // 4. 检查第三方技能拉取脚本：禁止在 URL 或接口中出现 HEAD 浮动指针
  if (thirdPartyFetchSource) {
    if (thirdPartyFetchSource.includes('trees/HEAD') || thirdPartyFetchSource.includes('/HEAD/')) {
      violations.push('fetch-third-party-skills: 代码中仍残留 HEAD 浮动引用，必须使用不可变 commit')
    }
  }

  return { passed: violations.length === 0, violations }
}
