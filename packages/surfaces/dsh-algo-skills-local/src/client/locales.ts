/**
 * 算法技能 settings-section copy (zh source, en mirror).
 *
 * The vocabulary is deliberately the one the material already uses: 「面」 /
 * 「责任域」 / 「岗位」 are the organization graph's own three levels, and
 * 「技能」 is what the platform calls a SKILL. 「技术族」 is the corpus's own
 * word for its source grouping. Nothing here invents a synonym for a level the
 * user already has a name for — a fifth word for 岗位 would make this page look
 * like a separate organization.
 */

export const zh = {
  nav: '算法技能',
  title: '算法技能库',
  subtitle: '论文算法沉淀的技能卡，按组织骨架归位：面 → 责任域 → 岗位',
  refresh: '重新读取',
  expandAll: '全部展开',
  collapseAll: '全部折叠',
  searchPlaceholder: '搜索技能名、能力描述、岗位或责任',
  loading: '正在读取技能库…',
  empty: '没有匹配的技能',
  emptyTree: '本机没有扫描到 p2s- 技能卡；先运行 dsh-paper2skills 的安装脚本。',

  'stat.skills': '已装技能卡',
  'stat.placed': '已归位',
  'stat.unplaced': '未归类',
  'stat.wired': '本岗已接线',
  'stat.emptyRoles': '空白岗位',
  'stat.roles': '岗位',
  'stat.hits': '命中',

  'issues.title': '一致性诊断',
  'issues.count': '{count} 条',
  'issues.none': '无异常',

  'role.empty': '本岗暂无卡',
  'role.responsibility': '责任',
  'role.artifact': '标准产物',
  'role.metrics': '考核口径',
  'role.skills': '{count} 张',

  'chip.wired': '本岗已接线',
  'chip.drift': '接线到 {role}',
  'chip.unwired': '未接线',
  'chip.also': '兼 {name}',
  'chip.off': '模型不可自动调用',

  'unplaced.title': '未归类（矩阵空白）',
  'unplaced.note':
    '这些卡在语料里没有任何一条责任能装下（多为人文、伦理、可持续等跨域主题），因此不进任何岗位；'
    + '它们照常安装、可用斜杠调用，只是不参与岗位接线。',
} as const

export type AlgoSkillKey = keyof typeof zh

export const en: Record<AlgoSkillKey, string> = {
  nav: 'Algorithm Skills',
  title: 'Algorithm skill library',
  subtitle: 'Paper-derived skill cards placed on the organization skeleton: plane → domain → role',
  refresh: 'Reload',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  searchPlaceholder: 'Search skill, capability, role or responsibility',
  loading: 'Reading the skill library…',
  empty: 'No matching skills',
  emptyTree: 'No p2s- skill cards found on this machine; run the dsh-paper2skills installer first.',

  'stat.skills': 'Installed cards',
  'stat.placed': 'Placed',
  'stat.unplaced': 'Unclassified',
  'stat.wired': 'Wired to own role',
  'stat.emptyRoles': 'Empty roles',
  'stat.roles': 'Roles',
  'stat.hits': 'Matches',

  'issues.title': 'Consistency diagnostics',
  'issues.count': '{count}',
  'issues.none': 'None',

  'role.empty': 'No cards yet',
  'role.responsibility': 'Responsibilities',
  'role.artifact': 'Standard artifact',
  'role.metrics': 'Metric',
  'role.skills': '{count}',

  'chip.wired': 'wired here',
  'chip.drift': 'wired to {role}',
  'chip.unwired': 'not wired',
  'chip.also': 'also {name}',
  'chip.off': 'model cannot self-invoke',

  'unplaced.title': 'Unclassified (matrix blank)',
  'unplaced.note':
    'No responsibility in the corpus could hold these cards (mostly cross-domain themes such as humanities, '
    + 'ethics and sustainability), so they belong to no role. They install and stay slash-invocable; they simply '
    + 'take part in no role wiring.',
}
