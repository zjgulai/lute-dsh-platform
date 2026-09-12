// Step 4: Actions sheet — contract, decision rules, cadence, guardrails + summary-linked status.
const F = (s) => ({ f: s });
const N = (v, pattern) => (pattern ? { v, t: 2, s: { n: { pattern } } } : { v, t: 2 });
const T = (v) => ({ v, t: 1 });

const ST = {
  title: { bg: { rgb: '#0E5A4A' }, cl: { rgb: '#FFFFFF' }, bl: 1, fs: 12 },
  head: { bg: { rgb: '#E3F1EC' }, cl: { rgb: '#0E5A4A' }, bl: 1 },
  sub: { bg: { rgb: '#F4F7F6' }, cl: { rgb: '#3A4A45' }, bl: 1 },
  warn: { bg: { rgb: '#FDECEC' }, cl: { rgb: '#A32020' }, bl: 1 },
  good: { bg: { rgb: '#E8F6EE' }, cl: { rgb: '#12703A' }, bl: 1 },
  key: { bl: 1 },
  mono: { bg: { rgb: '#F5F7F6' }, cl: { rgb: '#3A4A45' } },
};

workbook.getSheetByName('Actions').setName('执行清单');
const a = workbook.getSheetByName('执行清单');
a.getRange('A1:D60').clearContent();
a.getRange('A1:D60').clear();

const g = {};
const put = (row, col, cell) => { (g[row] = g[row] || {})[col] = cell; };

put(0, 0, { v: 'LTV/CAC 渠道获客门控 · 执行清单（阈值与口径同 Params 页；矩阵页自动出判定）', t: 1, s: ST.title });

put(1, 0, { v: '一、判定规则（按顺序判断，命中即停）', t: 1, s: ST.sub });
put(2, 0, { v: '序', t: 1, s: ST.head });
put(2, 1, { v: '规则', t: 1, s: ST.head });
put(2, 2, { v: '阈值 / 判据', t: 1, s: ST.head });
put(2, 3, { v: '动作', t: 1, s: ST.head });

const rules = [
  ['1', '样本门控', '当月新客 ≥ 50 人', '不足则标记「样本不足」，不评估、维持原预算（含知乎、B站示例）'],
  ['2', 'LTV/CAC 比值', '平滑 LTV ÷ 当月 CAC（近 3 月移动平均）', '四舍五入到 2 位，作为唯一排序与判定依据'],
  ['3', '暂停闸门', '比值 < 3.0', '停该渠道新客投放预算，仅留品牌保底；7 天后看自然量，30 天内必须复评'],
  ['4', '扩投闸门', '比值 ≥ 5.0', '按 max(当月预算 × 1.2, 当月预算 + 释放预算 × 吸收比例) 加投'],
  ['5', '观察区', '3.0 ≤ 比值 < 5.0', '持平不追加；连续 2 个月落在观察区转人工复核素材与定向'],
];
rules.forEach((r, i) => {
  const row = 3 + i;
  put(row, 0, T(r[0])); put(row, 1, { v: r[1], t: 1, s: ST.key }); put(row, 2, T(r[2])); put(row, 3, T(r[3]));
});

put(9, 0, { v: '二、本月预算调整指令（数值实时取自「门控矩阵」，随矩阵页改动自动更新）', t: 1, s: ST.sub });
const summary = [
  ['暂停渠道释放的预算', '=门控矩阵!Q3', '元/月', { ...ST.warn }, '#,##0'],
  ['高效渠道可吸收上限（合计）', '=门控矩阵!R3', '元/月', { ...ST.good }, '#,##0'],
  ['本月加投金额合计', '=门控矩阵!S3', '元/月', { ...ST.good }, '#,##0'],
  ['调整后新客预算总盘', '=SUM(门控矩阵!L3:L16)', '元', {}, '#,##0'],
  ['总盘硬上限（110% 校验）', '=Params!B15', '元', {}, '#,##0'],
  ['释放预留：品牌保底合计', '=SUM(门控矩阵!G3:G16)', '元/月', {}, '#,##0'],
];
summary.forEach((r, i) => {
  const row = 10 + i;
  put(row, 0, T(r[0])); put(row, 1, { f: r[1], s: r[3] }); put(row, 2, T(r[2])); put(row, 3, T('自动计算'));
});
put(10, 4, { f: '=IF(门控矩阵!V3="通过","✔ 未超总盘上限","✘ 超上限，按比值截断加投")', s: ST.good });

put(17, 0, { v: '三、每月 6 步闭环（谁在哪天做什么）', t: 1, s: ST.sub });
const cadence = [
  ['D3', '锁数', '结算月 3 日前，冻结上月各渠道 LTV / CAC / 新客数 / 预算；数据不全的渠道标「样本不足」'],
  ['D4-5', '跑门控', '在「门控矩阵」填 0–15 列，16–21 列与上表自动出判定与金额，逐条核对系统指令'],
  ['D6', '批指令', '投放负责人确认暂停/加投清单，品牌负责人确认保底金额，形成当月预算调整单'],
  ['D25-31', '执行', '渠道后台改预算与出价；暂停渠道只保留品牌词防守与内容留存，不得整店关停'],
  ['D+7', '看护', '暂停渠道第 7 天看品牌直搜量、自然进店量是否掉超 15%，掉了就把保底上调至原预算 10%'],
  ['D30', '复评', '满 30 天强制复评：比值回到 ≥ 3.0 才恢复投放，否则进入下一轮观察或改素材与人群'],
];
cadence.forEach((r, i) => {
  const row = 18 + i;
  put(row, 0, { v: r[0], t: 1, s: ST.mono }); put(row, 1, { v: r[1], t: 1, s: ST.key });
  put(row, 2, T('—')); put(row, 3, T(r[2]));
});

put(25, 0, { v: '四、硬约束（越线即停，防止跑飞）', t: 1, s: ST.sub });
const guards = [
  ['暂停 ≠ 关停', '任何渠道暂停后必须留保底 = max(500 元, 原预算 × 5%)，用于品牌词防守与内容留存'],
  ['暂停有时限', '单次暂停最长 30 天必须复评，观察期 7 天；禁止一次性永久关停渠道'],
  ['加投有上限', '单渠道单月 +20%，连续扩投不超过 2 个月，之后转人工复核'],
  ['总盘不超支', '加投后总盘 ≤ 110%；释放预算优先转给比值最高的渠道，无人接就留池'],
  ['口径唯一', 'LTV 用 12 个月毛利贡献（非收入）、CAC 用全成本；三数同月同口径同币种'],
  ['合规', '客户 ID 加密存储、行为数据脱敏；暂停期间的再触达须有用户明确同意'],
];
guards.forEach((r, i) => {
  const row = 26 + i;
  put(row, 0, { v: r[0], t: 1, s: ST.key }); put(row, 1, T(r[1]));
});
a.getRange('A1:D32').setValues(new Array(32).fill(0).map((_, r) => new Array(4).fill(0).map((_, c) => (g[r] && g[r][c]) ? g[r][c] : {})));
a.getRange('A1:D1').merge();
a.getRange('A17:D17').merge();
a.getRange('A9:D9').merge();
a.getRange('A26:B31').merge({ isForceMerge: true });
a.getRange('B11:B16').setNumberFormat('#,##0');
a.getRange('A1:D32').setVerticalAlignment('middle');
a.getRange('A1:D32').setWrap(true);
a.setRowHeight(0, 34);
a.setRowHeight(1, 24);
a.setRowHeight(9, 24);
a.setRowHeight(17, 24);
a.setRowHeight(25, 24);
[18, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30, 31].forEach((r) => a.setRowHeight(r, 40));
a.setColumnWidth(0, 190);
a.setColumnWidth(1, 150);
a.setColumnWidth(2, 240);
a.setColumnWidth(3, 560);

// Conditional formatting: row 10 (释放预算) turns bold-red when > 0
const rule = a.getRange('B11').createConditionalFormattingRule()
  .whenNumberGreaterThan(0).setBold(true).setBackground('#FDECEC').setFontColor('#A32020').build();
a.addConditionalFormattingRule(rule);

return { sheet: a.getSheetName(), sheets: workbook.getSheets().map((s) => s.getSheetName()) };
