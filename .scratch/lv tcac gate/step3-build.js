// Step 3: rebuild Params, rename Channels → 门控矩阵, build Actions.
workbook.getSheetByName('Channels').setName('门控矩阵');

const F = (s) => ({ f: s });
const N = (v, pattern) => (pattern ? { v, t: 2, s: { n: { pattern } } } : { v, t: 2 });
const T = (v) => ({ v, t: 1 });

const ST = {
  title: { bg: { rgb: '#0E5A4A' }, cl: { rgb: '#FFFFFF' }, bl: 1, fs: 12 },
  head: { bg: { rgb: '#E3F1EC' }, cl: { rgb: '#0E5A4A' }, bl: 1 },
  warn: { bg: { rgb: '#FDECEC' }, cl: { rgb: '#A32020' }, bl: 1 },
  good: { bg: { rgb: '#E8F6EE' }, cl: { rgb: '#12703A' }, bl: 1 },
  param: { bg: { rgb: '#FFF8E7' } },
  note: { bg: { rgb: '#F4F7F6' }, cl: { rgb: '#3A4A45' } },
};

// ---------- Params ----------
const p = workbook.getSheetByName('Params');
p.getRange('A1:F40').clearContent();
p.getRange('A1:F40').clear();

const grid = {
  0: { 0: { v: 'LTV/CAC 渠道获客门控 · 参数与口径（改这里，全表自动生效）', t: 1, s: ST.title } },
  1: { 0: { v: '参数项', t: 1, s: ST.head }, 1: { v: '数值', t: 1, s: ST.head }, 2: { v: '单位', t: 1, s: ST.head }, 3: { v: '说明与护栏', t: 1, s: ST.head } },
};
const params = [
  ['暂停阈值 pause_threshold', 3, '倍', '比值 < 3.0：停新客投放预算，仅保留品牌保底'],
  ['扩投阈值 boost_threshold', 5, '倍', '比值 ≥ 5.0：加投，单渠道单月最多 +20%'],
  ['扩投比例 boost_ratio', 0.2, '倍', '加投上限 ＝ 当月在投预算 × 该比例'],
  ['最小新客数 min_new_customers', 50, '人', '当月新客 < 50：样本不足，不评估，维持原预算'],
  ['品牌保底预算 min_brand_budget', 500, '元/月', '暂停 ≠ 关停：保底只用于品牌词防守与内容留存'],
  ['保底预算比例 min_floor_ratio', 0.05, '倍', '保底 ＝ max(500 元, 原预算 × 5%)'],
  ['暂停观察天数 pause_observation_days', 7, '天', '暂停后第 7 天看直搜/自然量，满 30 天必须复评'],
  ['连续扩投次数上限 max_boost_rounds', 2, '次', '同一渠道连续扩投 2 个月后转人工复核'],
  ['数据滞后天数 data_lag_days', 3, '天', '每月 3 日前锁上月数据，6 日前出调整指令'],
];
params.forEach((r, i) => {
  const row = 2 + i;
  grid[row] = { 0: { v: r[0], t: 1, s: ST.param }, 1: { v: r[1], t: 2, s: ST.param }, 2: { v: r[2], t: 1, s: ST.param }, 3: { v: r[3], t: 1, s: ST.param } };
});
grid[12] = { 0: { v: '常量（供公式引用，勿改）', t: 1, s: ST.head }, 1: { v: '取值', t: 1, s: ST.head }, 2: { v: '单位', t: 1, s: ST.head }, 3: { v: '说明', t: 1, s: ST.head } };
grid[13] = { 0: T('释放预算吸收比例 max_absorb_ratio'), 1: { v: 1, t: 2, s: { n: { pattern: '0.0#' } } }, 2: T('倍'), 3: T('高效渠道合计吸收量 ＝ 释放预算；按各渠道加投上限比例分') };
grid[14] = { 0: T('总预算硬上限 total_budget_cap'), 1: N(110000, '#,##0'), 2: T('元'), 3: T('加投后总盘不得超过此值，超出则按比值截断') };

grid[16] = { 4: { v: '口径（三个数必须同月份、同口径、同币种）', t: 1, s: ST.title } };
grid[17] = { 4: { v: '指标', t: 1, s: ST.head }, 5: { v: '定义', t: 1, s: ST.head } };
grid[18] = { 4: T('新客 LTV（12 月）'), 5: T('当月新客同期群、未来 12 个月的累计毛利贡献（收入 − 货品成本 − 履约 − 售后退换 − 平台佣金），近 3 月移动平均平滑；不含首单收入') };
grid[19] = { 4: T('CAC'), 5: T('（媒体投放 + 平台佣金与技术费 + 内容素材 + 样品寄送 + 代运营）÷ 当月新客数') };
grid[20] = { 4: T('新客数'), 5: T('当月该渠道首次成交客户数，去重后口径；用于最小样本门控') };
grid[21] = { 4: T('当月预算'), 5: T('该渠道当月已投放的获客预算（不含品牌保底部分）') };
p.getRange('A1:F22').setValues(new Array(22).fill(0).map((_, r) => new Array(6).fill(0).map((_, c) => grid[r] && grid[r][c] ? grid[r][c] : {})));
p.getRange('A1:D1').merge();
p.getRange('E17:F17').merge();
p.getRange('E19:F19').merge({ isForceMerge: true });
p.getRange('E20:F20').merge({ isForceMerge: true });
p.getRange('E21:F21').merge({ isForceMerge: true });
p.getRange('E22:F22').merge({ isForceMerge: true });
p.getRange('B3:B11').setNumberFormat('0.0#');
p.getRange('E1:F22').setWrap(true);
p.getRange('A1:F22').setVerticalAlignment('middle');
p.setRowHeight(0, 36);
p.setRowHeight(12, 22);
p.setRowHeight(16, 28);
p.setColumnWidth(0, 250);
p.setColumnWidth(1, 84);
p.setColumnWidth(2, 62);
p.setColumnWidth(3, 380);
p.setColumnWidth(4, 130);
p.setColumnWidth(5, 420);

// ---------- Channels ----------
const c = workbook.getSheetByName('门控矩阵');
c.getRange('A1:V40').clearContent();
c.getRange('A1:V40').clear();

const cg = {
  0: { 0: { v: 'LTV/CAC 渠道获客门控 · 判定与预算调整指令', t: 1, s: ST.title } },
  1: {
    0: { v: '月份', t: 1, s: ST.head }, 1: { v: '渠道', t: 1, s: ST.head }, 2: { v: '预测/平滑LTV(元)', t: 1, s: ST.head },
    3: { v: 'CAC(元)', t: 1, s: ST.head }, 4: { v: '新客数(人)', t: 1, s: ST.head }, 5: { v: '当月预算(元)', t: 1, s: ST.head },
    6: { v: '保底预算(元)', t: 1, s: ST.head }, 7: { v: '样本门控', t: 1, s: ST.head }, 8: { v: 'LTV/CAC', t: 1, s: ST.head },
    9: { v: '判定', t: 1, s: ST.head }, 10: { v: '加投上限(元)', t: 1, s: ST.head }, 11: { v: '新客预算(元)', t: 1, s: ST.head },
    12: { v: '本月调整(元)', t: 1, s: ST.head }, 13: { v: '系统指令', t: 1, s: ST.head }, 14: { v: '复评日', t: 1, s: ST.head }, 15: { v: '谁执行', t: 1, s: ST.head },
    16: { v: '释放预算(元)', t: 1, s: ST.head }, 17: { v: '吸收上限(元)', t: 1, s: ST.head }, 18: { v: '建议转入(元)', t: 1, s: ST.head }, 19: { v: '本月新客(按调整后)', t: 1, s: ST.head },
    20: { v: '预算合计校验(元)', t: 1, s: ST.head }, 21: { v: '总盘校验', t: 1, s: ST.head },
  },
};
c.getRange('A1').setValue({ v: 'LTV/CAC 渠道获客门控 · 判定与预算调整指令（月更：0–15 列填数，16–21 列自动算）', t: 1, s: ST.title });

const sample = [
  ['2025-08', '拼多多', 85, 40.4, 120, 26000, '有'],
  ['2025-08', '抖音', 248, 40, 320, 15000, '有'],
  ['2025-08', '视频号', 155, 33, 95, 5000, '有'],
  ['2025-08', '私域社群', 268, 44, 197, 11000, '有'],
  ['2025-08', '小红书', 198, 45, 70, 12000, '有'],
  ['2025-08', '线下活动', 176, 50, 200, 10000, '有'],
  ['2025-08', '知乎', 118, 40, 30, 4000, '待填'],
  ['2025-08', 'B站', 210, 46, 60, 6000, '待填'],
];
sample.forEach((r, i) => {
  const row = 2 + i;
  cg[row] = {
    0: T(r[0]), 1: T(r[1]), 2: N(r[2]), 3: N(r[3]), 4: N(r[4]), 5: N(r[5]),
    6: F(`=ROUND(MAX(Params!$B$7,H${row}*Params!$B$8),0)`),
    7: F(`=IF(E${row}>=Params!$B$6,"通过","不足")`),
    8: F(`=IFERROR(ROUND(C${row}/D${row},2),"")`),
    9: F(`=IF(N(G${row})="不足","样本不足",IF(N(I${row})>=Params!$B$4,"扩投",IF(N(I${row})<Params!$B$3,"暂停","维持")))`),
    10: F(`=IF(J${row}="扩投",ROUND((F${row}+O${row})*1.2,0),0)`),
    11: F(`=IF(J${row}="暂停",G${row},IF(J${row}="扩投",ROUND(MIN(K${row},F${row}+O${row}+Q${row}),0),F${row}))`),
    12: F(`=L${row}-F${row}`),
    13: F(`=IF(J${row}="暂停","停新客投放，仅保品牌词与内容留存","")&IF(J${row}="扩投","加投至新客预算上限","")&IF(J${row}="维持","持平，下月复评","")&IF(J${row}="样本不足","样本不足不评估，维持原预算","")`),
    14: F(`=IF(J${row}="暂停",TEXT(DATE(YEAR(A${row}),MONTH(A${row})+1,1)+Params!$B$9-1,"m月d日"),"")`),
    15: F(`=IF(J${row}="暂停","投放负责人+品牌负责人","")&IF(J${row}="扩投","投放负责人","")`),
    16: F(`=IF(J${row}="暂停",-N${row},0)`),
    17: F(`=M${row}`),
    18: F(`=IF(K${row}>0,ROUND($H$2*M${row}/$H$3,0),0)`),
    19: F(`=ROUND(E${row}*L${row}/F${row},0)`),
    20: T(''),
    21: T(''),
  };
});
// 留空行（下月直接改名沿用）
[10, 11, 12, 13, 14].forEach((i) => {
  const row = 2 + i;
  cg[row] = {
    7: F(`=IF(E${row}=0,"",IF(E${row}>=Params!$B$6,"通过","不足"))`),
    8: F(`=IFERROR(ROUND(C${row}/D${row},2),"")`),
    9: F(`=IF(E${row}=0,"",IF(N(G${row})="不足","样本不足",IF(N(I${row})>=Params!$B$4,"扩投",IF(N(I${row})<Params!$B$3,"暂停","维持"))))`),
    6: F(`=ROUND(MAX(Params!$B$7,H${row}*Params!$B$8),0)`),
    10: F(`=IF(J${row}="扩投",ROUND((F${row}+O${row})*1.2,0),0)`),
    11: F(`=IF(J${row}="暂停",G${row},IF(J${row}="扩投",ROUND(MIN(K${row},F${row}+O${row}+Q${row}),0),F${row}))`),
    12: F(`=IF(E${row}=0,0,L${row}-F${row})`),
    13: F(`=IF(E${row}=0,"",IF(J${row}="暂停","停新客投放，仅保品牌词与内容留存","")&IF(J${row}="扩投","加投至新客预算上限","")&IF(J${row}="维持","持平，下月复评","")&IF(J${row}="样本不足","样本不足不评估，维持原预算",""))`),
    14: F(`=IF(J${row}="暂停",TEXT(DATE(YEAR(A${row}),MONTH(A${row})+1,1)+Params!$B$9-1,"m月d日"),"")`),
    15: F(`=IF(J${row}="暂停","投放负责人+品牌负责人","")&IF(J${row}="扩投","投放负责人","")`),
    16: F(`=IF(J${row}="暂停",-N${row},0)`),
    17: F(`=IF(E${row}=0,0,M${row})`),
    18: F(`=IF(K${row}>0,ROUND($H$2*M${row}/$H$3,0),0)`),
    19: F(`=IF(F${row}=0,0,ROUND(E${row}*L${row}/F${row},0))`),
  };
});
cg[2] = Object.assign(cg[2], {
  16: F('=SUM(Q3:Q16)'),
  17: F('=SUM(R3:R16)'),
  18: F('=SUM(S3:S16)'),
  19: F('=SUM(T3:T16)'),
  20: F('=SUMIF(S3:S16,">0",S3:S16)'),
  21: F('=IF(SUM(L3:L16)>Params!$B$15,"超总盘上限","通过")'),
  16: Object.assign(cg[2][16], { s: ST.warn }),
});
cg[2][17].s = ST.note; cg[2][18].s = ST.good; cg[2][19].s = ST.note;
cg[2][20].s = ST.note; cg[2][21].s = ST.good;
c.getRange('A1:V17').setValues(new Array(17).fill(0).map((_, r) => new Array(22).fill(0).map((_, col) => (cg[r] && cg[r][col]) ? cg[r][col] : {})));

c.getRange('A1').setValue({ v: 'LTV/CAC 渠道获客门控 · 判定与预算调整指令｜月更：填 0–15 列，16–21 列自动算｜示例月份 2025-08', t: 1, s: ST.title });
c.getRange('F2:H3').setNumberFormat('#,##0');
c.getRange('K3:M16').setNumberFormat('#,##0');
c.getRange('Q3:T16').setNumberFormat('#,##0');
c.getRange('O2:P2').setNumberFormat('#,##0');
c.getRange('H2').setNumberFormat('#,##0');
c.getRange('B3:B16').setFontWeight('bold');
c.getRange('J3:J16').setFontWeight('bold');
c.getRange('A2:V2').setWrap(true);
c.getRange('J3:N16').setWrap(true);
c.getRange('A1:V17').setVerticalAlignment('middle');
c.setRowHeight(0, 32);
c.setRowHeight(1, 46);
c.setColumnWidth(0, 78);
c.setColumnWidth(1, 96);
c.setColumnWidth(2, 96);
c.setColumnWidth(3, 76);
c.setColumnWidth(4, 78);
c.setColumnWidth(5, 96);
c.setColumnWidth(6, 92);
c.setColumnWidth(7, 72);
c.setColumnWidth(8, 76);
c.setColumnWidth(9, 80);
c.setColumnWidth(10, 92);
c.setColumnWidth(11, 96);
c.setColumnWidth(12, 92);
c.setColumnWidth(13, 250);
c.setColumnWidth(14, 80);
c.setColumnWidth(15, 140);
c.setColumnWidth(16, 100);
c.setColumnWidth(17, 96);
c.setColumnWidth(18, 96);
c.setColumnWidth(19, 110);
c.setColumnWidth(20, 118);
c.setColumnWidth(21, 86);

return { ok: true };
