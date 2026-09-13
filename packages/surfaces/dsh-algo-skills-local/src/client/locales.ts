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

  'stat.skills': '技能卡总数',
  'stat.placed': '已分到岗位',
  'stat.unplaced': '没分到岗位',
  'stat.wired': '已设为岗位自带',
  'stat.emptyRoles': '还没配卡的岗位',
  'stat.roles': '岗位',
  'stat.hits': '命中',

  'stat.skills.hint': '本机装好的技能卡总数',
  'stat.placed.hint': '已归到某个岗位名下的卡；其余卡没有岗位收',
  'stat.unplaced.hint': '没有哪条岗位责任装得下它们，不参与岗位装配',
  'stat.wired.hint': '岗位预设一开就自带的卡；其余卡要在设置里打开，模型才会自动调用',
  'stat.emptyRoles.hint': '岗位已经建好，但库里还没有对得上的卡',

  'legend.title': '这些数字怎么看',
  'legend.body':
    '每张技能卡归到一个岗位名下（已分到岗位）；'
    + '岗位预设一开就自带它名下的卡（已设为岗位自带）。'
    + '卡右上角的开关管的是「模型能不能自动调用它」：'
    + '关着时卡还在、斜杠仍能手动调用，只是模型不会自己挑它。'
    + '岗位会话里由岗位装配决定——本岗带上的卡照常自动调用，开关管的是岗位之外的会话。',

  'switch.on': '模型可以自动调用它；点一下关掉',
  'switch.off': '模型不会自动调用它；点一下打开',

  'issues.title': '一致性诊断',
  'issues.count': '{count} 条',
  'issues.none': '无异常',

  'role.empty': '本岗暂无卡',
  'role.responsibility': '责任',
  'role.artifact': '标准产物',
  'role.metrics': '考核口径',
  'role.skills': '{count} 张',

  'chip.wired': '本岗会带上',
  'chip.drift': '在 {role} 会带上',
  'chip.unwired': '暂无岗位会带',
  'chip.also': '兼 {name}',
  'chip.off': '本岗之外不自动调用',
  'chip.off.fix':
    '本岗会带上它、在本岗会话里照常自动调用；卡右上角的开关管的是本岗之外的会话——'
    + '关着时模型在别处不会自己挑它。点开关可以打开。',

  'unplaced.title': '没分到岗位的卡（矩阵空白）',
  'unplaced.note':
    '这些卡在语料里没有任何一条责任能装下（多为人文、伦理、可持续等跨域主题），因此不进任何岗位；'
    + '它们照常安装、可用斜杠调用，只是不参与岗位装配。',
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

  'stat.skills': 'Cards installed',
  'stat.placed': 'Assigned to a role',
  'stat.unplaced': 'No role to hold them',
  'stat.wired': 'Shipped with a role',
  'stat.emptyRoles': 'Roles with no cards yet',
  'stat.roles': 'Roles',
  'stat.hits': 'Matches',

  'stat.skills.hint': 'Every skill card installed on this machine',
  'stat.placed.hint': 'Filed under a role; the remaining cards have no role to hold them',
  'stat.unplaced.hint': 'No role responsibility in the corpus can hold them, so they take part in no role assembly',
  'stat.wired.hint': 'Cards a role preset carries on open; every other card has to be switched on in settings before the model can pick it',
  'stat.emptyRoles.hint': 'The role exists, but the library has no card that answers it',

  'legend.title': 'How to read these numbers',
  'legend.body':
    'Every skill card is filed under one role (Assigned to a role); '
    + 'a role preset carries its own cards on open (Shipped with a role). '
    + 'The switch on a card governs one thing only — whether the MODEL may pick it up on its own: '
    + 'switched off, the card is still installed and still callable by slash command, the model just will not reach for it. '
    + 'Inside a role session the role\'s own assembly decides: the cards that role carries are invoked as usual, '
    + 'and the switch governs sessions outside it.',

  'switch.on': 'Model may pick this card up on its own; click to switch off',
  'switch.off': 'Model will not pick this card up on its own; click to switch on',

  'issues.title': 'Consistency diagnostics',
  'issues.count': '{count}',
  'issues.none': 'None',

  'role.empty': 'No cards yet',
  'role.responsibility': 'Responsibilities',
  'role.artifact': 'Standard artifact',
  'role.metrics': 'Metric',
  'role.skills': '{count}',

  'chip.wired': 'this role carries it',
  'chip.drift': 'carried by {role}',
  'chip.unwired': 'no role carries it',
  'chip.also': 'also {name}',
  'chip.off': 'not self-invoked outside this role',
  'chip.off.fix':
    'This role carries it and the model will pick it up inside this role\'s session; the switch governs '
    + 'sessions outside this role — switched off, the model will not reach for it elsewhere. Click the switch to turn it on.',

  'unplaced.title': 'Cards with no role (matrix blank)',
  'unplaced.note':
    'No responsibility in the corpus could hold these cards (mostly cross-domain themes such as humanities, '
    + 'ethics and sustainability), so they belong to no role. They install and stay slash-invocable; they simply '
    + 'take part in no role assembly.',
}
