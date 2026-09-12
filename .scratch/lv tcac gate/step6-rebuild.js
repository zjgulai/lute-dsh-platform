// Step 6: clean, deterministic rebuild of 门控矩阵 (no merges, measure layout as we go).
const t = (v, s) => (s ? { v, t: 1, s } : { v, t: 1 });
const n = (v, s) => (s ? { v, t: 2, s } : { v, t: 2 });
const S = {
  title: { bg: { rgb: '#0E5A4A' }, cl: { rgb: '#FFFFFF' }, bl: 1, fs: 12 },
  head: { bg: { rgb: '#E3F1EC' }, cl: { rgb: '#0E5A4A' }, bl: 1 },
  warn: { bg: { rgb: '#FDECEC' }, cl: { rgb: '#A32020' }, bl: 1 },
  good: { bg: { rgb: '#E8F6EE' }, cl: { rgb: '#12703A' }, bl: 1 },
  note: { bg: { rgb: '#F4F7F6' }, cl: { rgb: '#3A4A45' } },
};

const c = workbook.getSheetByName('门控矩阵');
const H = ['月份', '渠道', '预测/平滑LTV(元)', 'CAC(元)', '新客数(人)', '当月预算(元)', '保底预算(元)', '样本门控', 'LTV/CAC', '判定', '释放预算(元)', '吸收上限(元)', '加投上限(元)', '新客预算(元)', '本月调整(元)', '系统指令', '复评日', '谁执行', '建议转入(元)', '本月新客(预测)', '预算合计(元)', '总盘校验'];

// 1) hard reset the sheet (values + formats + merges), then re-write in strict order
c.getRange('A1:V40').clear();

c.getRange('A2:V2').setValues([H.map((h) => t(h, S.head))]);
const data = [
  ['2025-08', '拼多多', 85, 40.4, 120, 26000],
  ['2025-08', '抖音', 248, 40, 320, 15000],
  ['2025-08', '视频号', 155, 33, 95, 5000],
  ['2025-08', '私域社群', 268, 44, 197, 11000],
  ['2025-08', '小红书', 198, 45, 70, 12000],
  ['2025-08', '线下活动', 176, 50, 200, 10000],
  ['2025-08', '知乎', 118, 40, 30, 4000],
  ['2025-08', 'B站', 210, 46, 60, 6000],
];
data.forEach((d, i) => {
  c.getRange(2 + i, 1, 1, 6).setValues([[t(d[0]), t(d[1]), n(d[2]), n(d[3]), n(d[4]), n(d[5])]]);
});
for (let r = 3; r <= 15; r++) {
  const g = [];
  g.push([`=ROUND(MAX(Params!$B$7,F${r}*Params!$B$8),0)`]);
  g.push([`=IF(E${r}=0,"",IF(E${r}>=Params!$B$6,"通过","不足"))`]);
  g.push([`=IF(E${r}=0,"",ROUND(C${r}/D${r},2))`]);
  g.push([`=IF(E${r}=0,"",IF(H${r}="不足","样本不足",IF(I${r}>=Params!$B$4,"扩投",IF(I${r}<Params!$B$3,"暂停","维持"))))`]);
  g.push([`=IF(F${r}=0,0,IF(J${r}="暂停",G${r},0))`]);
  g.push([`=IF(F${r}=0,0,IF(J${r}="扩投",F${r}*1.2,0))`]);
  g.push([`=IF(J${r}="扩投",ROUND(F${r}*1.2,0),0)`]);
  g.push([`=IF(F${r}=0,0,IF(J${r}="暂停",G${r},IF(J${r}="扩投",ROUND(MIN(M${r},F${r}+S${r}),0),F${r})))`]);
  g.push([`=IF(F${r}=0,0,N${r}-F${r})`]);
  g.push([`=IF(F${r}=0,"",IF(J${r}="暂停","停新客投放，仅保品牌词与内容留存","")&IF(J${r}="扩投","加投至新客预算上限","")&IF(J${r}="维持","持平，下月复评","")&IF(J${r}="样本不足","样本不足不评估，维持原预算",""))`]);
  g.push([`=IF(J${r}="暂停",TEXT(DATE(YEAR(A${r}),MONTH(A${r})+1,1)+Params!$B$9-1,"m月d日"),"")`]);
  g.push([`=IF(J${r}="暂停","投放负责人+品牌负责人","")&IF(J${r}="扩投","投放负责人","")`]);
  g.push([`=IF(L${r}>0,ROUND($K$18*M${r}/$L$18,0),0)`]);
  g.push([`=IF(F${r}=0,0,ROUND(E${r}*N${r}/F${r},0))`]);
  g.push([`=IF(F${r}=0,0,N${r})`]);
  g.push([`=IF(F${r}=0,0,IF(E${r}>0,N${r},0))`]);
  c.getRange(r, 7, 1, 16).setFormulas([g.map((x) => x[0])]);
}
c.getRange('J18:L18').setValues([[t('释放预算合计', S.note), { f: '=SUM(K3:K15)', s: S.warn }, t('元/月', S.note)]]);
c.getRange('J19:L19').setValues([[t('吸收上限合计', S.note), { f: '=SUM(L3:L15)', s: S.good }, t('元/月', S.note)]]);
c.getRange('J20:L20').setValues([[t('加投合计', S.note), { f: '=SUM(M3:M15)', s: S.good }, t('元/月', S.note)]]);
c.getRange('J21:L21').setValues([[t('加投后新客预算总盘', S.note), { f: '=SUM(N3:N15)', s: S.note }, t('元', S.note)]]);
c.getRange('J22:L22').setValues([[t('总盘校验', S.note), { f: '=IF(SUM(N3:N15)>Params!B15,"超上限：按比值截断加投","通过：未超总盘上限")', s: S.good }, t('', S.note)]]);

c.getRange('A1').setValues([[t('LTV/CAC 渠道获客门控 · 判定与预算调整指令｜月更只填 A–F 列，G–V 全自动｜示例月份 2025-08', S.title)]]);
c.getRange('F3:G15').setNumberFormat('#,##0');
c.getRange('K3:O15').setNumberFormat('#,##0');
c.getRange('S3:V15').setNumberFormat('#,##0');
c.getRange('K18:K21').setNumberFormat('#,##0');
c.getRange('A2:V2').setWrap(true);
c.getRange('P3:R15').setWrap(true);
c.getRange('B3:B15').setFontWeight('bold');
c.getRange('A1:V15').setVerticalAlignment('middle');
c.setRowHeight(1, 44);
c.setColumnWidth(15, 240);
c.setColumnWidth(16, 78);
c.setColumnWidth(17, 130);
c.setColumnWidth(18, 100);
c.setColumnWidth(21, 104);
c.setColumnWidth(22, 104);

const done = api.getFormula().onCalculationResultApplied();
api.getFormula().executeCalculation();
await done;

const probe = (row) => {
  const cs = c.getRange(row, 0, 1, 22).getCellDatas()[0];
  return cs.map((cell, i) => (cell && cell.v !== null && cell.v !== '' ? `${String.fromCharCode(65 + i)}=${String(cell.v).slice(0, 14)}` : null)).filter(Boolean);
};
return {
  row2: probe(2).slice(0, 3),
  row3: probe(3).slice(0, 3),
  decisions: c.getRange('J3:J15').getDisplayValues().flat(),
  newBudget: c.getRange('N3:N15').getDisplayValues().flat(),
  totals: c.getRange('K18:K22').getDisplayValues().flat(),
  errs: workbook.getAllFormulaError().slice(0, 4).map((e) => `${e.row}:${e.column}:${e.errorType}`),
};
