const ExcelJS = require("exceljs");

async function inspect() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile("public/Daily Attendance 2.xlsx");
  const sheet = workbook.getWorksheet(1);

  for (let r = 1; r <= 8; r++) {
    const row = sheet.getRow(r);
    console.log(`Row ${r}:`);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      console.log(
        `  Col ${col}: Value="${cell.value}", Font=${JSON.stringify(cell.font)}, Fill=${JSON.stringify(cell.fill)}, Alignment=${JSON.stringify(cell.alignment)}`,
      );
    });
  }
}
inspect();
