/**
 * Role matrix surface copy: zh is the key source, en mirrors every key.
 * The panel speaks in the material's own vocabulary (岗位分身 / 组织平面 /
 * 责任域 / 标准产物), because that vocabulary is what the 50 presets carry.
 */

export const zh = {
  'entry.label': '岗位矩阵',
  'entry.tooltip': '岗位矩阵：按组织平面查看 50 个 AI 分身',

  'panel.title': '岗位矩阵',
  'panel.subtitle': '50 个 AI 岗位分身 · 四平面 × 八责任域',
  'panel.close': '关闭',

  'search.placeholder': '搜索岗位（别名 / 岗位名 / 产物 / 技能 / 编号）…',
  'search.empty': '没有匹配的岗位。换个关键词试试。',
  'search.clear': '清空搜索',

  'state.retry': '重试',

  'totals.roles': '{count} 个岗位',
  'totals.planes': '{count} 个平面',
  'totals.domains': '{count} 个责任域',

  'list.loading': '正在读取预设…',
  'list.loadFailed': '读取失败：{error}',
  'list.empty': '没有找到岗位 preset。请确认 {root} 下有 agt-NNN 目录。',
  'list.degraded': '{count} 个岗位的 manifest 不完整，已归入「未分类」。',

  'card.artifact': '标准产物',
  'card.skills': '技能',
  'card.gaps': '缺口',
  'card.draft': '草案',
  'card.draftTip': '设计期草案：材料中 production_authorized=false，不构成生产授权。',
  'card.expand': '展开',
  'card.collapse': '收起',

  'detail.metrics': '岗位指标',
  'detail.materialSkills': '材料业务技能',
  'detail.subset': '已装配技能',
  'detail.gaps': '平台无供给',
  'detail.gapsHint': '材料声明但技能库无对应供给；不编造技能名。',
  'detail.flows': '参与价值流',
  'detail.scenarios': '业务场景',
  'detail.collaborates': '协作岗位',
  'detail.playbooks': '对应手册',
  'detail.none': '无',

  'footer.hint': '本面板只读。切换默认预设请用官方「设置 → 预设」，开新会话时在输入框上方选择岗位。',
} as const

export type RoleMatrixKey = keyof typeof zh

export const en: Record<RoleMatrixKey, string> = {
  'entry.label': 'Role Matrix',
  'entry.tooltip': 'Role matrix: browse the 50 AI role profiles by organization plane',

  'panel.title': 'Role Matrix',
  'panel.subtitle': '50 AI role profiles · 4 planes × 8 responsibility domains',
  'panel.close': 'Close',

  'search.placeholder': 'Search roles (alias / title / artifact / skill / id)…',
  'search.empty': 'No role matches. Try another keyword.',
  'search.clear': 'Clear search',

  'state.retry': 'Retry',

  'totals.roles': '{count} roles',
  'totals.planes': '{count} planes',
  'totals.domains': '{count} domains',

  'list.loading': 'Reading presets…',
  'list.loadFailed': 'Load failed: {error}',
  'list.empty': 'No role preset found. Check that {root} holds agt-NNN directories.',
  'list.degraded': '{count} role(s) have an incomplete manifest and are grouped under “Unclassified”.',

  'card.artifact': 'Artifact',
  'card.skills': 'skills',
  'card.gaps': 'gaps',
  'card.draft': 'draft',
  'card.draftTip': 'Design-time draft: the material records production_authorized=false; this is not a production authorization.',
  'card.expand': 'Expand',
  'card.collapse': 'Collapse',

  'detail.metrics': 'Metric',
  'detail.materialSkills': 'Material business skills',
  'detail.subset': 'Installed skills',
  'detail.gaps': 'No platform supply',
  'detail.gapsHint': 'Declared by the material with no matching skill in the library; names are never invented.',
  'detail.flows': 'Value flows',
  'detail.scenarios': 'Scenarios',
  'detail.collaborates': 'Collaborates with',
  'detail.playbooks': 'Playbooks',
  'detail.none': 'none',

  'footer.hint': 'This panel is read-only. Set the default preset in Settings → Presets; pick a role above the composer when starting a new session.',
}
