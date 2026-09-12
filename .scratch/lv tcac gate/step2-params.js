// Step 2: Params sheet — thresholds / guardrails / metric definitions.
const s = workbook.getSheetByName('Params');

const TITLE = { bg: { rgb: '#0E5A4A' }, cl: { rgb: '#FFFFFF' }, bl: 1, fs: 12 };
const HDR = { bg: { rgb: '#E3F1EC' }, bl: 1, cl: { rgb: '#0E5A4A' } };
const BOLD = { bl: 1 };
const MONO = { bg: { rgb: '#F5F7F6' }, cl: { rgb: '#3A4A45' }, bl: 1 };
const PARAMROW = { bg: { rgb: '#FFF8E7' } };

s.getRange('A1:D1').merge();
s.getRange('A1').setValue({ v: 'LTV/CAC 渠道获客门控 · 参数与口径（改这里，全表自动生效）', t: 1 });
s.getRange('A1:D1').setStyle(TITLE);
s.setRowHeight(0, 34);

s.getRange('A2:D2').setValues([[
  { v: '参数项', t: 1 },
  { v: '数值', t: 1 },
  { v: '单位', t: 1 },
  { v: '说明与护栏', t: 1 },
]]);
s.getRange('A2:D2').setStyle(HDR);

const paramRows = [
  ['暂停阈值 pause_threshold', 3.0, '倍', '比值 < 3.0：停新客投放预算，仅保留品牌保底'],
  ['扩投阈值 boost_threshold', 5.0, '倍', '比值 ≥ 5.0：加投，单渠道单月最多 +20%'],
  ['扩投比例 boost_ratio', 0.2, '倍', '加投上限＝当月在投预算 × 该比例'],
  ['最小新客数 min_new_customers', 50, '人', '当月新客 < 50：样本不足，不评估、维持原预算'],
  ['品牌保底预算 min_brand_budget', 500, '元/月', '暂停≠关停：保底用于品牌词防守＋内容留存'],
  ['保底预算比例 min_floor_ratio', 0.05, '倍', '保底取 max(500元, 原预算×5%)'],
  ['暂停观察天数 pause_observation_days', 7, '天', '暂停后第 7 天看直搜/自然量，满 30 天必须复评'],
  ['连续扩投次数上限 max_boost_rounds', 2, '次', '同一渠道连续扩投 2 个月后转人工复核'],
  ['数据滞后滞后天数 data_lag_days', 3, '天', '每月 3 日前锁上月数据，6 日前出调整指令'],
];
s.getRange('A3:D11').setValues(paramRows.map((r) => [
  { v: r[0], t: 1 }, { v: r[1], t: 2 }, { v: r[2], t: 1 }, { v: r[3], t: 1 },
]));
s.getRange('A3:D11').setStyle(PARAMROW);
s.getRange('B3:B11').setNumberFormat('0.0#');

// Constant names used by the Channels formulas
s.getRange('A13:D13').setValues([[
  { v: '常量（供公式引用，勿改）', t: 1 }, { v: 'PAUSE', t: 1 }, { v: 'BOOST', t: 1 }, { v: 'HOLD', t: 1 },
]]);
s.getRange('A13:D13').setStyle(HDR);
s.getRange('A14:D15').setValues([
  [{ v: '低效释放预算可被高效渠道吸收的上限', t: 1 }, { v: '0.5', t: 2 }, { v: '倍', t: 1 }, { v: '单渠道最多吸收释放预算的 50%，其余留池或下沉品牌保底', t: 1 }],
  [{ v: '本月总预算硬上限', t: 1 }, { v: '110000', t: 2 }, { v: '元', t: 1 }, { v: '加投后总额不得超过总盘 110%', t: 1 }],
]);

// Metric definitions
s.getRange('A17:F17').merge();
s.getRange('A17').setValue({ v: '口径（三个数必须同月份、同口径、同币种）', t: 1 });
s.getRange('A17:F17').setStyle(TITLE);

const defs = [
  ['F', 'pause_threshold', 'B3', '暂停阈值', 'LTV/CAC 低于此值即停新客'],
  ['G', 'boost_threshold', 'B4', '扩投阈值', 'LTV/CAC 达到此值即加投'],
  ['H', 'boost_ratio', 'B5', '扩投比例', '单渠道单月加投上限比例'],
  ['I', 'min_new_customers', 'B6', '最小新客数', '样本不足则不评估'],
  ['J', 'min_brand_budget', 'B7', '品牌保底预算', '暂停后的最低保留额'],
  ['K', 'min_floor_ratio', 'B8', '保底比例', '保底取原预算的此比例与固定额孰高'],
  ['L', 'max_absorb_ratio', 'B14', '释放吸收上限', '高效渠道最多吸收释放预算的比例'],
  ['M', 'total_budget_cap', 'B15', '总预算硬上限', '加投后总盘上限'],
];
s.getRange('A19').setValue({ v: '公式常量', t: 1 });
s.getRange('B19').setValue({ v: '取数位置', t: 1 });
s.getRange('C19').setValue({ v: '定义', t: 1 });
s.getRange('A19:C19').setStyle(HDR);
s.getRange('A20:C27').setValues(defs.map((d) => [
  { v: d[1], t: 1 }, { v: `Params!${d[2]}`, t: 1 }, { v: `${d[3]}：${d[4]}`, t: 1 },
]));
s.getRange('A20:A27').setStyle(MONO);

s.getRange('E1:F1').merge();
s.getRange('E1').setValue({ v: '指标口径', t: 1 });
s.getRange('E1:F1').setStyle(TITLE);
s.getRange('E2:F2').setValues([[{ v: '指标', t: 1 }, { v: '定义', t: 1 }]]);
s.getRange('E2:F2').setStyle(HDR);
s.getRange('E3:F3').merge();
s.getRange('E3:F3').setValues([[
  { v: '新客 LTV（12 月）', t: 1 },
  { v: '当月新客同期群、未来 12 个月的累计毛利贡献（收入 − 货品成本 − 履约 − 售后/退换 − 平台佣金），用近 3 月移动平均平滑，不含首单收入', t: 1 },
]]);
s.getRange('E4:F4').setValues([[
  { v: 'CAC', t: 1 },
  { v: '（媒体投放 + 平台佣金/技术服务费 + 内容与素材 + 样品寄送 + 代运营）÷ 当月新客数', t: 1 },
]]);

s.setColumnWidth(0, 250);
s.setColumnWidth(1, 90);
s.setColumnWidth(2, 70);
s.setColumnWidth(3, 380);
s.setColumnWidth(4, 130);
s.setColumnWidth(5, 520);

return s.getRange('A1:D15').getDisplayValues();
