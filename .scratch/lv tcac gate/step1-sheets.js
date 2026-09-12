// Step 1: rename the default sheet and create the other two sheets.
const s1 = workbook.getActiveSheet();
s1.setName('Params');
const ch = workbook.create('Channels', 60, 24);
const ac = workbook.create('Actions', 60, 8);

const names = workbook.getSheets().map((s) => s.getSheetName());
return { sheets: names, paramsId: s1.getSheetId(), channelsId: ch.getSheetId(), actionsId: ac.getSheetId() };
