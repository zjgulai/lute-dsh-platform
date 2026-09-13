/**
 * New App launcher copy: zh is the key source, en mirrors every key.
 *
 * The vocabulary is deliberately the one the user already sees: 「新应用」 is
 * the launcher's own label, 「岗位」 the role matrix's. Inventing a new word for
 * either would make the page look like a third product sitting on top of two.
 *
 * 「产品」 is the page's one noun, and it is earned: an Agent product is the
 * thing that has a `product.json`, a preset it belongs to, and features it
 * declares. Neither 岗位 (an organization slot) nor 目录 (where the files
 * happen to live) means that, and keying the page on either would put it back
 * to listing something a person cannot start.
 *
 * 「工作台项目」 is gone from this file entirely: nothing on this page reads the
 * worktable any more, so copy that named it would be copy for a row that does
 * not exist (ADR-0045).
 */

export const zh = {
  'entry.label': '新应用',
  'entry.tooltip': '新应用：本机已经产品化的 Agent，点开直接用',

  'panel.title': '应用矩阵',
  'panel.subtitle': '本机已经产品化的 Agent——一张卡一个产品，点开直接跑',
  'panel.close': '关闭',
  'panel.refresh': '重新读取',

  'state.loading': '正在读取产品声明…',
  'state.loadFailed': '读取失败：{error}',
  'state.retry': '重试',
  'state.empty': '配置的扫描根下还没有任何目录。扫描根写在插件配置的 productRoots 里，默认为空——不填就不扫。',
  'state.emptyUndeclared': '扫描了 {count} 个目录，没有一个带 product.json。在哪个目录里放一份 product.json，哪个目录就会在这里长出卡片。',

  'scan.title': '本次扫描的读取情况：',
  'scan.failedTitle': '产品声明没有读到',
  'scan.noRoots': '没有配置扫描根（productRoots 为空）——因此一个目录都没有读。',
  'scan.roots': '扫描根：{roots}',
  'scan.skipped': '根目录 {root} 没扫成：{reason}',
  'scan.unreadable': '目录 {dir} 的 product.json 没用上：{reason}',
  'scan.truncated': '卡片数量已达上限，列表被截断。',

  'totals.products': '{count} 个产品',

  'section.products': '产品',
  'search.placeholder': '搜索产品（名称 / 目录 / 岗位 / 编号）…',
  'search.empty': '没有匹配的产品。换个关键词试试。',

  'product.statusDraft': '草案',
  'product.statusReady': '可用',
  'product.preset': '岗位 {preset}',
  'product.features': '{count} 个功能',
  'product.version': 'v{version}',
  'product.featureLine': '{label}（{inputs} 个输入 · {steps} 步）',

  'open.panel': '打开',
  'open.session': '开会话',
  'open.disabled': '不可用',
  'open.busy': '打开中…',
  'open.fallbackNote': '入口服务未安装，将新建会话并选中该岗位',

  'blocked.noPreset': '声明里没有 preset——产品必须先归属一个岗位（ADR-0033）。',
  'blocked.noPresetInstalled': '声明的岗位不在本机名册里，也没有注册入口服务。',

  'footer.hint': '本页面只读。产品是各自目录里的 product.json，岗位名册归官方预设——这里只做连接，不复制、不代管。',
  'footer.undeclared': '另有 {count} 个目录尚未产品化（没有可用的 product.json），不在本页列出。',

  // ── 业务系统（外部域名）────────────────────────────────────────────────
  //
  // 「业务系统」是这一段的唯一名词，刻意不与「产品」「岗位」混用：产品是**本机**
  // 已产品化的 Agent（点开直接跑），岗位是组织里的一个位置，而业务系统是**别人的
  // 站点**（点开离开本应用）。三个词各指一件事，混用会让用户分不清哪个按钮会
  // 把他带到别处。
  'systems.section': '业务系统',
  'systems.subtitle': '路特主域名下的系统入口——点开在系统默认浏览器里打开',
  'systems.search': '搜索系统（名称 / 英文名 / 岗位 / 域名）…',
  'systems.searchEmpty': '没有匹配的系统。换个关键词试试。',
  'systems.coverage': '{systems} 个系统 · 覆盖 {touched}/{total} 个岗位 · 可达性读数 {date}',
  'systems.coverageNoRoster': '{systems} 个系统 · 岗位名册未读到，分组按编号显示',
  'systems.loading': '正在读取系统清单…',
  'systems.empty': '系统清单是空的。catalog/systems.json 由 scripts/sync-systems.mjs 生成。',
  'systems.dropped': '有 {count} 条清单记录没有通过校验，未在此列出：',
  'systems.open': '打开系统',
  'systems.opening': '打开中…',
  'systems.opened': '已交给系统默认浏览器',
  'systems.roleUnknown': '岗位名册里没有这个编号',
  'systems.unreachable': '上次巡检不可达',
  'systems.loginRequired': '入口即登录页',
  'systems.alsoMore': '+{count}',
  'systems.count': '{count} 个',
  'systems.readOnly': '这里只列入口，不代理登录——各系统的账号归各系统。',

  'systems.blocked.noHref': '清单里没有可用地址。',
  'systems.blocked.noOpener': '宿主半边未加载，无法调用系统浏览器（重启后生效）。',
} as const

export type NewAppKey = keyof typeof zh

export const en: Record<NewAppKey, string> = {
  'entry.label': 'New App',
  'entry.tooltip': 'New app: the Agent products this machine already has, ready to start',

  'panel.title': 'Application Matrix',
  'panel.subtitle': 'The Agent products this machine has — one card per product, ready to start',
  'panel.close': 'Close',
  'panel.refresh': 'Reload',

  'state.loading': 'Reading product declarations…',
  'state.loadFailed': 'Load failed: {error}',
  'state.retry': 'Retry',
  'state.empty': 'No directory under the configured scan roots. The roots live in the plugin config (productRoots) and default to empty — nothing is scanned unless you name it.',
  'state.emptyUndeclared': 'Scanned {count} directories and none carries a product.json. Put a product.json in one of them and a card appears here.',

  'scan.title': 'What this scan actually read:',
  'scan.failedTitle': 'Product declarations could not be read',
  'scan.noRoots': 'No scan root configured (productRoots is empty) — so no directory was read at all.',
  'scan.roots': 'Scan roots: {roots}',
  'scan.skipped': 'Root {root} could not be scanned: {reason}',
  'scan.unreadable': '{dir}/product.json could not be used: {reason}',
  'scan.truncated': 'The card list hit its cap and was truncated.',

  'totals.products': '{count} products',

  'section.products': 'Products',
  'search.placeholder': 'Search products (name / directory / preset / id)…',
  'search.empty': 'No product matches. Try another keyword.',

  'product.statusDraft': 'draft',
  'product.statusReady': 'ready',
  'product.preset': 'preset {preset}',
  'product.features': '{count} features',
  'product.version': 'v{version}',
  'product.featureLine': '{label} ({inputs} inputs · {steps} steps)',

  'open.panel': 'Open',
  'open.session': 'Start session',
  'open.disabled': 'Unavailable',
  'open.busy': 'Opening…',
  'open.fallbackNote': 'entry service not installed — a session will be started on the declared preset',

  'blocked.noPreset': 'The declaration names no preset — a product must belong to a role (ADR-0033).',
  'blocked.noPresetInstalled': 'The declared preset is not in this machine\'s roster, and no entry service is registered.',

  'footer.hint': 'This page is read-only. Products are the product.json files in their own directories; the roster owns the presets — this surface only joins them.',
  'footer.undeclared': '{count} more directories are not productized (no usable product.json) and are not listed here.',

  'systems.section': 'Business systems',
  'systems.subtitle': 'Entry points under the LUTE domain — opening one leaves this app for your default browser',
  'systems.search': 'Search systems (name / English name / role / host)…',
  'systems.searchEmpty': 'No system matches. Try another keyword.',
  'systems.coverage': '{systems} systems · {touched}/{total} roles covered · reachability read {date}',
  'systems.coverageNoRoster': '{systems} systems · roster unread, groups show role ids',
  'systems.loading': 'Reading the systems catalog…',
  'systems.empty': 'The systems catalog is empty. catalog/systems.json is produced by scripts/sync-systems.mjs.',
  'systems.dropped': '{count} catalog entries did not pass validation and are not listed:',
  'systems.open': 'Open system',
  'systems.opening': 'Opening…',
  'systems.opened': 'Handed to the default browser',
  'systems.roleUnknown': 'the roster has no such id',
  'systems.unreachable': 'unreachable at the last probe',
  'systems.loginRequired': 'entry is the login page',
  'systems.alsoMore': '+{count}',
  'systems.count': '{count}',
  'systems.readOnly': 'This section only lists entry points and never proxies a login — each system keeps its own account.',

  'systems.blocked.noHref': 'The catalog holds no usable address for this system.',
  'systems.blocked.noOpener': 'The host half is not loaded, so the default browser cannot be called (restart to apply).',
}
