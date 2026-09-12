// Step 8: break the circular reference and finish the matrix sheet.
// Absorption allocation uses only adjacent columns: L (加投上限) → S (建议转入) → N (新客预算).
const t = (v, s) => (s ? { v, t: 1, s } : { v, t: 1 });
const F = (f, s) => (s ? { f, s } : { f });
const fmt0 = { n: { pattern: '#,##0' } };
const Sgood = { bg: { rgb: '#E8F6EE' }, cl: { rgb: '#12703A' }, bl: 1 };
const note = { bg: { rgb: '#F4F7F6' }, cl: { rgb: '#3A4A45' } };

const c = workbook.getSheetByName('门控矩阵');
const put = (row, col, cell) => c.getRange(row - 1, col - 1).setValue(cell);

for (let r = 3; r <= 15; r++) {
  put(r, 12, F(`=IF(F${r}=0,0,IF(J${r}="扩投",F${r}*1.2,0))`, fmt0));
  put(r, 19, F(`=IF(L${r}>0,ROUND($S$18*M${r}/$L$18,0),0)`, fmt0));
  put(r, 14, F(`=IF(F${r}=0,0,IF(J${r}="暂停",G${r},IF(J${r}="扩投",ROUND(MIN(M${r},F${r}+S${r}),0),F${r})))`, fmt0));
  put(r, 15, F(`=IF(F${r}=0,0,N${r}-F${r})`, fmt0));
  put(r, 20, F(`=IF(F${r}=0,0,ROUND(E${r}*N${r}/F${r},0))`, fmt0));
  put(r, 21, F(`=IF(F${r}=0,0,N${r})`, fmt0));
  put(r, 22, F(`=IF(F${r}=0,0,IF(E${r}>0,N${r},0))`, fmt0));
}
// 释放预算 (K) and its total (K18) sit downstream of N, so no other formula may read K18.
put(11, 12 - 1, F('=SUM(K3:K15)', { bg: { rgb: '#FDECEC' }, cl: { rgb: '#A32020' }, bl: 1 }));
put(18, 19, F('=SUM(L3:L15)', Sgood));
put(18, 10, t('释放预算合计（暂停渠道）', note));
put(19, 10, t('可吸收上限合计（扩投渠道）', note));
put(20, 10, t('本月加投合计', note));
put(21, 10, t('加投后新客预算总盘', note));
put(22, 10, t('总盘校验', note));
put(22, 11, F('=IF(SUM(N3:N15)>Params!B15,"超上限：按比值截断加投","通过：未超总盘上限")', Sgood));
put(18, 11, F('=SUM(L3:L15)', Sgood));
put(19, 11, F('=SUM(M3:M15)', Sgood));
put(20, 11, F('=SUM(N3:N15)', note));
put(20, 12, t('元', note));
put(18, 12, t('元/月', note));
put(19, 12, t('元/月', note));
put(21, 11, F('=IF(SUM(N3:N15)>Params!B15,"超上限：按比值截断加投","通过：未超总盘上限")', Sgood));
c.getRange('K18:K22').setNumberFormat('#,##0');

const done = api.getFormula().onCalculationResultApplied();
api.getFormula().executeCalculation();
await done;

const out = [];
for (const r of [3, 4, 5, 6]) {
  const row = [];
  for (const col of ['J', 'K', 'L', 'M', 'N', 'O', 'S', 'T']) {
    const d = c.getRange(`${col}${r}`).getCellData();
    row.push(`${col}${r}=${d && d.v !== undefined && d.v !== null ? String(d.v) : 'empty'}`);
  }
  out.push(row.join(' '));
}
const cells = ['K18', 'K19', 'K20', 'K21', 'K22'].map((a) => { const d = c.getRange(a).getCellData(); return `${a}=${d && d.v !== undefined ? String(d.v) : 'empty'}`; });
return { rows: out, totals: cells, errs: workbook.getAllFormulaError().filter((e) => e.sheetName === '门控矩阵').length };