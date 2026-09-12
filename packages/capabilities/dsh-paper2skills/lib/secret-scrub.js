/**
 * lib/secret-scrub.js — 凭证脱敏的唯一出口。
 *
 * 为什么单独一个模块：恢复出的**完整实现**（`references/implementation.py`）与卡页八段
 * 是两条不同的写盘路径，若各留一份模式表，迟早会漏。实测差距是真实的——
 * 卡页八段里只有 1 张卡带真实 API Key，而 vault 的完整代码里有 **3 张**
 * （`Skill-FActScore-Claim-Verification-Pipeline`、`Skill-RankGPT-Listwise-Reranking`、
 * `Skill-iText2KG-Schema-Free-KG-Induction`，同一个 key）。
 * 只脱一处，另一处就会把 key 写进已装技能库。
 *
 * 纯函数 + 可注入回调，便于单测；调用方决定命中记在哪。
 *
 * 口径说明（沿用 ADR 与 AGENTS.md 的「凭证不落仓库」红线）：
 *  - 只抓**赋值形式的** key，以及有固定前缀的令牌串；不做全局 `sk-` 替换——
 *    `Task-Decomposition` 这类技能名里含 `sk-`，朴素替换会误伤正文。
 *  - PEM 私钥整段替换，保留首尾行以便读者知道这里原本有东西。
 */

/** @typedef {{ id: string, re: RegExp, to: string }} SecretPattern */

/** @type {readonly SecretPattern[]} */
export const SECRET_PATTERNS = Object.freeze([
  {
    id: 'assign-key',
    re: /(api[_-]?key|apikey|access[_-]?token|secret|password)(\s*[=:]\s*)(["'])([A-Za-z0-9_./+-]{16,})\3/gi,
    to: '$1$2$3<REDACTED-见 references/SECURITY.md>$3',
  },
  { id: 'openai-style', re: /(sk-(?:ant-)?[A-Za-z0-9]{20,})/g, to: '<REDACTED-API-KEY>' },
  { id: 'aws', re: /(AKIA[0-9A-Z]{16})/g, to: '<REDACTED-AWS-KEY>' },
  { id: 'github', re: /(gh[pousr]_[A-Za-z0-9]{30,})/g, to: '<REDACTED-GITHUB-TOKEN>' },
  { id: 'google', re: /(AIza[0-9A-Za-z_-]{30,})/g, to: '<REDACTED-GOOGLE-KEY>' },
  { id: 'slack', re: /(xox[baprs]-[A-Za-z0-9-]{10,})/g, to: '<REDACTED-SLACK-TOKEN>' },
  { id: 'bearer', re: /(Bearer\s+)([A-Za-z0-9._-]{24,})/g, to: '$1<REDACTED-TOKEN>' },
  {
    id: 'pem',
    re: /(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/g,
    to: '$1<REDACTED>$2',
  },
])

/**
 * 就地脱敏。
 *
 * @param {string} text
 * @param {(hit: { id: string, sample: string }) => void} [onHit] 每命中一处回调一次
 * @returns {string} 脱敏后的文本
 */
export function redactSecrets(text, onHit) {
  let out = String(text ?? '')
  for (const { id, re, to } of SECRET_PATTERNS) {
    // 每个模式都带 /g：`replace` 会自行重置 lastIndex，无需手动归零。
    out = out.replace(re, (...args) => {
      const groups = args.slice(0, -2)
      onHit?.({ id, sample: String(groups[0]).slice(0, 24) })
      return to.replace(/\$(\d)/g, (_, d) => String(groups[Number(d)] ?? ''))
    })
  }
  return out
}

/**
 * 只探测不替换——给「恢复出的代码是否还需要脱敏」这类清点用。
 *
 * @param {string} text
 * @returns {number} 命中处数
 */
export function countSecrets(text) {
  let n = 0
  redactSecrets(text, () => { n += 1 })
  return n
}
