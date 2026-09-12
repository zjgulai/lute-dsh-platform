// Step 10: rebuild 执行清单 cell-exact (array writes shift cells in this build).
const t = (v, s) => (s ? { v, t: 1, s } : { v, t: 1 });
const F = (f, s) => (s ? { f, s } : { f });
const CLR = { v: null, f: null, p: null, si: null, custom: null };
const S = {
  title: { bg: { rgb: '#0E5A4A' }, cl: { rgb: '#FFFFFF' }, bl: 1, fs: 12 },
  head: { bg: { rgb: '#E3F1EC' }, cl: { rgb: '#0E5A4A' }, bl: 1 },
  sub: { bg: { rgb: '#F4F7F6' }, cl: { rgb: '#3A4A45' }, bl: 1 },
  warn: { bg: { rgb: '#FDECEC' }, cl: { rgb: '#A32020' }, bl: 1 },
  good: { bg: { rgb: '#E8F6EE' }, cl: { rgb: '#12703A' }, bl: 1 },
  bold: { bl: 1 },
  mono: { bg: { rgb: '#F5F7F6' }, cl: { rgb: '#3A4A45' } },
};

const a = workbook.getSheetByName('执行清单');
const put = (row, col, cell) => a.getRange(row - 1, col - 1).setValue(cell);
for (let r = 1; r <= 34; r++) for (let col = 1; col <= 4; col++) put(r, col, CLR);

put(1, 1, t('LTV/CAC 渠道获客门控 · 执行清单｜阈值口径见 Params 页，判定与金额见「门控矩阵」页（示例月份 2025-07）', S.title));
put(2, 1, t('一、判定规则（按序判断，命中即停）', S.sub));
put(3, 1, t('序', S.head)); put(3, 2, t('规则', S.head)); put(3, 3, t('阈值 / 判据', S.head)); put(3, 4, t('动作', S.head));
const rules = [
  ['1', '样本门控', '当月新客 ≥ 50 人', '不足则标「样本不足」：不评估、维持原预算（示例中的知乎）'],
  ['2', 'LTV/CAC 比值', '平滑 LTV ÷ 当月 CAC（近 3 月移动平均）', '保留 2 位小数，作为唯一判定与排序依据'],
  ['3', '暂停闸门', '比值 < 3.0', '停该渠道新客投放预算，只留品牌保底；7 天后看自然量，满 30 天必须复评'],
  ['4', '扩投闸门', '比值 ≥ 5.0', '加投至 min(当月预算×1.2, 当月预算 + 释放预算按加投上限分摊额)'],
  ['5', '观察区', '3.0 ≤ 比值 < 5.0', '持平不追加；连续 2 个月落在观察区，转人工复核素材与人群'],
];
rules.forEach((r, i) => {
  const row = 4 + i;
  put(row, 1, t(r[0], S.mono)); put(row, 2, t(r[1], S.bold)); put(row, 3, t(r[2])); put(row, 4, t(r[3]));
});

put(10, 1, t('二、本月预算调整指令（实时取自「门控矩阵」，改矩阵即自动更新）', S.sub));
const sum = [
  ['暂停渠道释放的预算', '=门控矩阵!B19', '元/月', S.warn],
  ['扩投渠道可吸收上限（加投上限合计）', '=门控矩阵!B20', '元/月', S.good],
  ['本月加投金额合计', '=门控矩阵!B21', '元/月', S.good],
  ['调整后新客预算总盘', '=门控矩阵!B22', '元', S.sub],
  ['总盘上限（110%）', '=Params!B15', '元', S.sub],
  ['其中：品牌保底预留（暂停渠道）', '=SUM(门控矩阵!G3:G15)', '元/月', S.sub],
];
sum.forEach((r, i) => {
  const row = 11 + i;
  put(row, 1, t(r[0], S.bold)); put(row, 2, F(r[1], r[3])); put(row, 3, t(r[2], S.sub)); put(row, 4, t('自动计算', S.sub));
});
a.getRange('B11:B16').setNumberFormat('#,##0');
put(11, 5, F('=IF(门控矩阵!B23="通过：未超总盘上限","✔ 未超总盘上限","✘ 超上限：按比值截断加投")', S.good));

put(18, 1, t('三、每月 6 步闭环（谁在哪天做什么）', S.sub));
const cadence = [
  ['D3', '锁数', '结算月 3 日前冻结各渠道 LTV / CAC / 新客数 / 当月预算；数据不全的渠道一律标「样本不足」'],
  ['D4-5', '跑门控', '在「门控矩阵」A–F 列填数，G–V 与汇总自动出判定与金额；逐行核对系统指令栏'],
  ['D6', '批指令', '投放负责人确认暂停/加投清单，品牌负责人确认保底金额，形成当月一张预算调整单'],
  ['D25-31', '执行', '渠道后台改预算与出价；暂停渠道只保留品牌词防守与内容留存，不得整店关停'],
  ['D+7', '看护', '暂停渠道第 7 天看品牌直搜量与自然进店量，跌幅超 15% 则把保底上调至原预算的 10%'],
  ['D30', '复评', '满 30 天强制复评：比值回到 ≥ 3.0 才恢复投放，否则进入下一轮观察或改素材与人群'],
];
cadence.forEach((r, i) => {
  const row = 19 + i;
  put(row, 1, t(r[0], S.mono)); put(row, 2, t(r[1], S.bold)); put(row, 3, t('—', S.sub)); put(row, 4, t(r[2]));
});

put(26, 1, t('四、硬约束（越线即停，防止跑飞）', S.sub));
const guards = [
  ['暂停 ≠ 关停', '任何渠道暂停后必须留保底 = max(500 元, 原预算 × 5%)，用于品牌词防守与内容留存'],
  ['暂停有时限', '单次暂停最长 30 天必须复评，观察期 7 天；禁止一次性永久关停渠道'],
  ['加投有上限', '单渠道单月 +20%，连续扩投不超过 2 个月，之后转人工复核'],
  ['总盘不超支', '加投后总盘 ≤ 110%；释放预算优先转给比值最高的渠道，无人接就留池不硬花'],
  ['口径唯一', 'LTV 用 12 个月毛利贡献（非收入）、CAC 用全成本；三数必须同月、同口径、同币种'],
  ['合规', '客户 ID 加密存储、行为数据脱敏；暂停期间的再触达必须有用户明确同意'],
];
guards.forEach((r, i) => {
  const row = 27 + i;
  put(row, 1, t(r[0], S.bold)); put(row, 2, t(r[1])); put(row, 3, t('', S.sub)); put(row, 4, t('', S.sub));
});
for (let r = 1; r <= 32; r++) a.getRange(r, 1, 1, 4).setWrap(true);
a.getRange('A1:D32').setVerticalAlignment('middle');
a.setRowHeight(0, 40); a.setRowHeight(1, 24); a.setRowHeight(9, 24); a.setRowHeight(17, 24); a.setRowHeight(25, 24);
for (const r of [3, 4, 17, 18, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30, 31]) a.setRowHeight(r, r === 3 ? 18 : 42);
a.setColumnWidth(0, 230); a.setColumnWidth(1, 250); a.setColumnWidth(2, 260); a.setColumnWidth(3, 520);

const done = api.getFormula().onCalculationResultApplied();
api.getFormula().executeCalculation();
await done;
const show = (a1) => { const d = a.getRange(a1).getCellData(); return `${a1}=${d && d.v !== undefined && d.v !== null ? String(d.v).slice(0, 24) : 'empty'}`; };
return { sum: ['B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'E11', 'A4', 'B4', 'D27'].map(show), errs: workbook.getAllFormulaError().length };