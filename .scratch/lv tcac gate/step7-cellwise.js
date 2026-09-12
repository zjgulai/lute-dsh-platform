// Step 7: rebuild 门控矩阵 with position-exact setValue calls only.
// Layout: A月份 B渠道 C LTV D CAC E新客数 F当月预算 │ G保底 H样本门控 I比值 J判定
// K释放预算 L吸收上限 M加投上限 N新客预算 O本月调整 P系统指令 Q复评日 R谁执行 S建议转入 T本月新客 U预算合计 V总盘校验
const t = (v, s) => (s ? { v, t: 1, s } : { v, t: 1 });
const n = (v, s) => (s ? { v, t: 2, s } : { v, t: 2 });
const F = (f, s) => (s ? { f, s } : { f });
const CLR = { v: null, f: null, p: null, si: null, custom: null };
const S = {
  title: { bg: { rgb: '#0E5A4A' }, cl: { rgb: '#FFFFFF' }, bl: 1, fs: 12 },
  head: { bg: { rgb: '#E3F1EC' }, cl: { rgb: '#0E5A4A' }, bl: 1 },
  warn: { bg: { rgb: '#FDECEC' }, cl: { rgb: '#A32020' }, bl: 1 },
  good: { bg: { rgb: '#E8F6EE' }, cl: { rgb: '#12703A' }, bl: 1 },
  note: { bg: { rgb: '#F4F7F6' }, cl: { rgb: '#3A4A45' } },
  bold: { bl: 1 },
};

const c = workbook.getSheetByName('门控矩阵');
const put = (row, col, cell) => c.getRange(row - 1, col - 1).setValue(cell);

// clear A1:V24
for (let r = 1; r <= 24; r++) for (let col = 1; col <= 22; col++) put(r, col, CLR);

const H = ['月份', '渠道', '预测/平滑LTV(元)', 'CAC(元)', '新客数(人)', '当月预算(元)', '保底预算(元)', '样本门控', 'LTV/CAC', '判定', '释放预算(元)', '吸收上限(元)', '加投上限(元)', '新客预算(元)', '本月调整(元)', '系统指令', '复评日', '谁执行', '建议转入(元)', '本月新客(预测)', '预算合计(元)', '总盘校验'];
H.forEach((h, i) => put(2, i + 1, t(h, S.head)));

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
  const r = 3 + i;
  put(r, 1, t(d[0])); put(r, 2, t(d[1], S.bold));
  put(r, 3, n(d[2])); put(r, 4, n(d[3])); put(r, 5, n(d[4]));
  put(r, 6, { v: d[5], t: 2, s: { n: { pattern: '#,##0' } } });
});

const fmt0 = { n: { pattern: '#,##0' } };
for (let r = 3; r <= 15; r++) {
  put(r, 7, F(`=ROUND(MAX(Params!$B$7,F${r}*Params!$B$8),0)`, fmt0));
  put(r, 8, F(`=IF(E${r}=0,"",IF(E${r}>=Params!$B$6,"通过","不足"))`));
  put(r, 9, F(`=IF(E${r}=0,"",ROUND(C${r}/D${r},2))`));
  put(r, 10, F(`=IF(E${r}=0,"",IF(H${r}="不足","样本不足",IF(I${r}>=Params!$B$4,"扩投",IF(I${r}<Params!$B$3,"暂停","维持"))))`));
  put(r, 11, F(`=IF(F${r}=0,0,IF(J${r}="暂停",G${r},0))`, fmt0));
  put(r, 12, F(`=IF(F${r}=0,0,IF(J${r}="扩投",F${r}*1.2,0))`, fmt0));
  put(r, 13, F(`=IF(J${r}="扩投",ROUND(F${r}*1.2,0),0)`, fmt0));
  put(r, 14, F(`=IF(F${r}=0,0,IF(J${r}="暂停",G${r},IF(J${r}="扩投",ROUND(MIN(M${r},F${r}+S${r}),0),F${r})))`, fmt0));
  put(r, 15, F(`=IF(F${r}=0,0,N${r}-F${r})`, fmt0));
  put(r, 16, F(`=IF(F${r}=0,"",IF(J${r}="暂停","停新客投放，仅保品牌词与内容留存","")&IF(J${r}="扩投","加投至新客预算上限","")&IF(J${r}="维持","持平，下月复评","")&IF(J${r}="样本不足","样本不足不评估，维持原预算",""))`));
  put(r, 17, F(`=IF(J${r}="暂停",TEXT(DATE(YEAR(A${r}),MONTH(A${r})+1,1)+Params!$B$9-1,"m月d日"),"")`));
  put(r, 18, F(`=IF(J${r}="暂停","投放负责人+品牌负责人","")&IF(J${r}="扩投","投放负责人","")`));
  put(r, 19, F(`=IF(L${r}>0,ROUND($K$18*M${r}/$L$18,0),0)`, fmt0));
  put(r, 20, F(`=IF(F${r}=0,0,ROUND(E${r}*N${r}/F${r},0))`, fmt0));
  put(r, 21, F(`=IF(F${r}=0,0,N${r})`, fmt0));
  put(r, 22, F(`=IF(F${r}=0,0,IF(E${r}>0,N${r},0))`, fmt0));
}

put(18, 10, t('释放预算合计', S.note)); put(18, 11, F('=SUM(K3:K15)', S.warn)); put(18, 12, t('元/月', S.note));
put(19, 10, t('吸收上限合计', S.note)); put(19, 11, F('=SUM(L3:L15)', S.good)); put(19, 12, t('元/月', S.note));
put(20, 10, t('加投合计', S.note)); put(20, 11, F('=SUM(M3:M15)', S.good)); put(20, 12, t('元/月', S.note));
put(21, 10, t('加投后新客预算总盘', S.note)); put(21, 11, F('=SUM(N3:N15)', S.note)); put(21, 12, t('元', S.note));
put(22, 10, t('总盘校验', S.note)); put(22, 11, F('=IF(SUM(N3:N15)>Params!B15,"超上限：按比值截断加投","通过：未超总盘上限")', S.good)); put(22, 12, t('', S.note));
c.getRange('K18:K21').setNumberFormat('#,##0');

put(1, 1, t('LTV/CAC 渠道获客门控 · 判定与预算调整指令｜月更只填 A–F 列，G–V 全自动｜示例月份 2025-08', S.title));
c.getRange('A2:V2').setWrap(true);
c.getRange('P3:R15').setWrap(true);
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

const show = (a1) => { const d = c.getRange(a1).getCellData(); return `${a1}=${d && d.v !== undefined && d.v !== null ? String(d.v).slice(0, 20) : 'empty'}${d && d.f ? '[f]' : ''}`; };
return {
  anchors: ['A1', 'A2', 'B3', 'C3', 'F3', 'G3', 'H3', 'I3', 'J3', 'N3', 'O3', 'P3', 'Q3', 'S3', 'K18', 'K22'].map(show),
  decisions: c.getRange('J3:J15').getDisplayValues().flat(),
  errs: workbook.getAllFormulaError().filter((e) => e.sheetName === '门控矩阵').length,
};