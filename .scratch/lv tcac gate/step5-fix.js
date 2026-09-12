// Step 5: repair — rebuild 门控矩阵 body, columns:
// A月份 B渠道 C LTV D CAC E新客数 F当月预算 G保底 H样本门控 I比值 J判定
// K释放预算 L吸收上限 M加投上限 N新客预算 O本月调整 P系统指令 Q复评日 R谁执行
// S建议转入 T本月新客(预测) U预算合计校验 V总盘校验
const T = (v) => ({ v, t: 1 });
const N = (v) => ({ v, t: 2 });

const ST = {
  title: { bg: { rgb: '#0E5A4A' }, cl: { rgb: '#FFFFFF' }, bl: 1, fs: 12 },
  head: { bg: { rgb: '#E3F1EC' }, cl: { rgb: '#0E5A4A' }, bl: 1 },
  warn: { bg: { rgb: '#FDECEC' }, cl: { rgb: '#A32020' }, bl: 1 },
  good: { bg: { rgb: '#E8F6EE' }, cl: { rgb: '#12703A' }, bl: 1 },
  note: { bg: { rgb: '#F4F7F6' }, cl: { rgb: '#3A4A45' } },
};

const c = workbook.getSheetByName('门控矩阵');
c.getRange('A1:V40').clear();
c.getRange('A1:V40').clearContent();

c.getRange('A1').setValue({ v: 'LTV/CAC 渠道获客门控 · 判定与预算调整指令｜月更只填 A–F 列，G–V 全自动｜示例月份 2025-08', t: 1, s: ST.title });
c.getRange('A1:V1').merge();

const headers = ['月份', '渠道', '预测/平滑LTV(元)', 'CAC(元)', '新客数(人)', '当月预算(元)', '保底预算(元)', '样本门控', 'LTV/CAC', '判定', '释放预算(元)', '吸收上限(元)', '加投上限(元)', '新客预算(元)', '本月调整(元)', '系统指令', '复评日', '谁执行', '建议转入(元)', '本月新客(预测)', '预算合计(元)', '总盘校验'];
c.getRange('A2:V2').setValues([headers.map((h) => ({ v: h, t: 1, s: ST.head }))]);

const samples = [
  ['2025-08', '拼多多', 85, 40.4, 120, 26000],
  ['2025-08', '抖音', 248, 40, 320, 15000],
  ['2025-08', '视频号', 155, 33, 95, 5000],
  ['2025-08', '私域社群', 268, 44, 197, 11000],
  ['2025-08', '小红书', 198, 45, 70, 12000],
  ['2025-08', '线下活动', 176, 50, 200, 10000],
  ['2025-08', '知乎', 118, 40, 30, 4000],
  ['2025-08', 'B站', 210, 46, 60, 6000],
];
for (let i = 0; i < 13; i++) {
  const r = 3 + i;
  const d = samples[i];
  const row = new Array(22).fill({});
  if (d) {
    row[0] = T(d[0]); row[1] = T(d[1]);
    row[2] = N(d[2]); row[3] = N(d[3]); row[4] = N(d[4]); row[5] = N(d[5]);
  }
  c.getRange(`A${r}:V${r}`).setValues([row]);
}

const at = (col, r) => `${col}${r}`;
const f = { G: [], H: [], I: [], J: [], K: [], L: [], M: [], N: [], O: [], P: [], Q: [], R: [], S: [], T: [], U: [], V: [] };
for (let r = 3; r <= 15; r++) {
  f.G.push([`=ROUND(MAX(Params!$B$7,F${r}*Params!$B$8),0)`]);
  f.H.push([`=IF(E${r}=0,"",IF(E${r}>=Params!$B$6,"通过","不足"))`]);
  f.I.push([`=IF(E${r}=0,"",ROUND(C${r}/D${r},2))`]);
  f.J.push([`=IF(E${r}=0,"",IF(H${r}="不足","样本不足",IF(I${r}>=Params!$B$4,"扩投",IF(I${r}<Params!$B$3,"暂停","维持"))))`]);
  f.K.push([`=IF(E${r}=0,0,IF(J${r}="暂停",G${r},0))`]);
  f.L.push([`=IF(E${r}=0,0,IF(J${r}="扩投",F${r}*1.2,0))`]);
  f.M.push([`=IF(J${r}="扩投",ROUND(F${r}*1.2,0),0)`]);
  f.N.push([`=IF(J${r}="暂停",G${r},IF(J${r}="扩投",ROUND(MIN(M${r},F${r}+S${r}),0),F${r}))`]);
  f.O.push([`=IF(E${r}=0,0,N${r}-F${r})`]);
  f.P.push([`=IF(E${r}=0,"",IF(J${r}="暂停","停新客投放，仅保品牌词与内容留存","")&IF(J${r}="扩投","加投至新客预算上限","")&IF(J${r}="维持","持平，下月复评","")&IF(J${r}="样本不足","样本不足不评估，维持原预算",""))`]);
  f.Q.push([`=IF(J${r}="暂停",TEXT(DATE(YEAR(A${r}),MONTH(A${r})+1,1)+Params!$B$9-1,"m月d日"),"")`]);
  f.R.push([`=IF(J${r}="暂停","投放负责人+品牌负责人","")&IF(J${r}="扩投","投放负责人","")`]);
  f.S.push([`=IF(L${r}>0,ROUND($K$18*M${r}/$L$18,0),0)`]);
  f.T.push([`=IF(F${r}=0,0,ROUND(E${r}*N${r}/F${r},0))`]);
  f.U.push([`=IF(F${r}=0,0,N${r})`]);
  f.V.push([`=IF(F${r}=0,0,IF(E${r}>0,N${r},0))`]);
}
Object.entries(f).forEach(([col, vals]) => c.getRange(`${col}3:${col}15`).setFormulas(vals));

// 释放/吸收/加投合计（放在 K18:L21，避免与表体冲突）
c.getRange('J18:L18').setValues([[{ v: '释放预算合计', t: 1, s: ST.note }, { f: '=SUM(K3:K15)', s: ST.warn }, { v: '元/月', t: 1, s: ST.note }]]);
c.getRange('J19:L19').setValues([[{ v: '吸收上限合计（=各加投上限之和）', t: 1, s: ST.note }, { f: '=SUM(L3:L15)', s: ST.good }, { v: '元/月', t: 1, s: ST.note }]]);
c.getRange('J20:L20').setValues([[{ v: '加投合计', t: 1, s: ST.note }, { f: '=SUM(M3:M15)', s: ST.good }, { v: '元/月', t: 1, s: ST.note }]]);
c.getRange('J21:L21').setValues([[{ v: '加投后新客预算总盘', t: 1, s: ST.note }, { f: '=SUM(N3:N15)', s: ST.note }, { v: '元', t: 1, s: ST.note }]]);
c.getRange('J22:L22').setValues([[{ v: '总盘校验（上限见 Params B15）', t: 1, s: ST.note }, { f: '=IF(SUM(N3:N15)>Params!B15,"超上限：按比值截断加投","通过：未超总盘上限")', s: ST.good }, { v: '', t: 1 }]]);
c.getRange('K18:K21').setNumberFormat('#,##0');

// '#VALUE!' 修复：确保 K18 等被引用的合计单元格先算出来，再算 S 列
c.getRange('F3:G15').setNumberFormat('#,##0');
c.getRange('K3:O15').setNumberFormat('#,##0');
c.getRange('S3:V15').setNumberFormat('#,##0');
c.getRange('A2:V2').setWrap(true);
c.getRange('P3:R15').setWrap(true);
c.getRange('B3:B15').setFontWeight('bold');
c.getRange('A1:V15').setVerticalAlignment('middle');
c.setRowHeight(1, 44);
c.setRowHeight(14, 28);
c.setColumnWidth(15, 240);
c.setColumnWidth(16, 78);
c.setColumnWidth(17, 130);
c.setColumnWidth(18, 100);
c.setColumnWidth(21, 104);
c.setColumnWidth(22, 104);

const done = api.getFormula().onCalculationResultApplied();
api.getFormula().executeCalculation();
await done;
const errs = workbook.getAllFormulaError().slice(0, 6).map((e) => `${e.row}:${e.column}:${e.errorType}:${e.formula}`);
return {
  errs,
  decisions: c.getRange('J3:J15').getDisplayValues().flat(),
  ratio: c.getRange('I3:I15').getDisplayValues().flat(),
  newBudget: c.getRange('N3:N15').getDisplayValues().flat(),
  totals: c.getRange('K18:K22').getDisplayValues().flat(),
};
