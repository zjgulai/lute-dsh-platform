/**
 * dsh-overseas-skills — Host 侧纯函数边界。
 *
 * 这些函数承载宿主插件与外部世界交界处的判断，**不含 I/O**：
 * 文件写入由调用方完成，因此行为可在无 cordis 运行时的情况下验证。
 * 其中 rebuildFrontmatter 重写的是用户 ~/.dsh/skills 下的真实 SKILL.md，
 * 是最需要回归保护的一处。
 */

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * 把任意抛出值归一化为可读的错误文本。
 *
 * 动机：`catch (e)` 的 e 在 checkJs 下是未知类型，直接读 `e?.message` 会得到
 * undefined 并把「undefined」写进面向用户的提示（本包有 7 处此类读取）。
 * @param {unknown} value 抛出值
 * @returns {string} 错误文本；无法归一化时返回空串而非 "undefined"
 */
export function errorMessage(value) {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * 技能名是否可作为目录名安全使用。
 *
 * 名称直接参与 `join(SKILLS_DIR, name, "SKILL.md")`，因此必须拒绝一切
 * 可能逃出 skills 目录或指向意外的输入（`..`、`/`、绝对路径、空串等）。
 * @param {unknown} name 待校验名称
 * @returns {boolean} 是否为安全的 kebab-case 名称
 */
export function isValidSkillName(name) {
  return typeof name === 'string' && NAME_PATTERN.test(name)
}

/**
 * 重写 SKILL.md 的开关字段，其余内容逐字保留。
 *
 * 语义（与既有实现一致）：
 *  - `disable-model-invocation` 取 !enabled（enabled=模型可用）
 *  - `user-invocable` 恒为 true（"/" 菜单始终可见）
 *  - 两个字段都是**替换**而非追加，因此重复调用必须得到相同结果（幂等）
 *  - 正文（frontmatter 之后的所有内容）不得被触碰
 * @param {string} text 原始文件文本
 * @param {boolean} enabled 目标开关状态
 * @returns {string|null} 重写后的文本；没有 frontmatter 时返回 null（调用方据此返回 400，绝不写盘）
 */
export function rebuildFrontmatter(text, enabled) {
  if (typeof text !== 'string') return null
  const match = FRONTMATTER_PATTERN.exec(text)
  if (!match) return null
  const kept = match[1]
    .split(/\r?\n/)
    .filter((line) => !/^(disable-model-invocation|user-invocable):/.test(line))
  const nextFm = [
    ...kept,
    `disable-model-invocation: ${String(!enabled)}`,
    'user-invocable: true',
  ].join('\n')
  return text.slice(0, match.index) + '---\n' + nextFm + '\n---' + text.slice(match.index + match[0].length)
}

/**
 * 校验技能目录快照的内部一致性。
 *
 * catalog.js 是**快照数据**，与真实 skills 目录及分类表之间没有任何结构性约束：
 * 分类改名或技能被移除后，界面会静默丢卡片（不报错、不显示）。此处把这类漂移
 * 变成可机器发现的清单。
 * @param {Array<{key: string, subs?: Array<{key: string}>}>} categories 分类表
 * @param {Array<{name: string, category?: string, subcategory?: string}>} skills 技能清单
 * @returns {string[]} 不一致项的中文描述；一致时为空数组
 */
export function findCatalogInconsistencies(categories, skills) {
  const issues = []
  const categoryKeys = new Set(categories.map((category) => category.key))
  const subKeys = new Set()
  for (const category of categories) {
    for (const sub of category.subs ?? []) subKeys.add(sub.key)
  }
  const seen = new Set()
  for (const skill of skills) {
    const name = String(skill?.name ?? '')
    if (!isValidSkillName(name)) {
      issues.push(`${name || '(空名称)'}: 名称非法（只允许 kebab-case）`)
      continue
    }
    if (seen.has(name)) issues.push(`${name}: 重复登记`)
    seen.add(name)
    if (!categoryKeys.has(String(skill?.category ?? ''))) {
      issues.push(`${name}: 未知 category ${String(skill?.category ?? '')}`)
    }
    if (!subKeys.has(String(skill?.subcategory ?? ''))) {
      issues.push(`${name}: 未知 subcategory ${String(skill?.subcategory ?? '')}`)
    }
  }
  return issues
}
