import ExcelJS from "exceljs";
import fs from "fs";

const filePath = "public/Daily Attendance 2.xlsx";

async function inspectExcel() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.getWorksheet(1);

  console.log("=== WORKSHEET INFO ===");
  console.log("Name:", worksheet.name);
  console.log("Views:", JSON.stringify(worksheet.views, null, 2));

  console.log("\n=== FIRST 10 ROWS ===");
  for (let i = 1; i <= 10; i++) {
    const row = worksheet.getRow(i);
    console.log(`\nRow ${i}:`);
    console.log("  Height:", row.height);

    for (let j = 1; j <= 8; j++) {
      const cell = row.getCell(j);
      if (cell.value || cell.style) {
        console.log(`  Cell ${String.fromCharCode(64 + j)}${i}:`);
        console.log("    Value:", cell.value);
        if (cell.font) console.log("    Font:", JSON.stringify(cell.font));
        if (cell.fill) console.log("    Fill:", JSON.stringify(cell.fill));
        if (cell.alignment)
          console.log("    Alignment:", JSON.stringify(cell.alignment));
        if (cell.border)
          console.log("    Border:", JSON.stringify(cell.border));
      }
    }
  }

  console.log("\n=== MERGED CELLS ===");
  worksheet.model.merges.forEach((merge, i) => {
    console.log(`Merge ${i}:`, merge);
  });

  console.log("\n=== COLUMN WIDTHS ===");
  worksheet.columns.forEach((col, i) => {
    console.log(`Column ${i + 1}:`, col.width);
  });

  console.log("\n=== PAGE SETUP ===");
  console.log("Page Setup:", JSON.stringify(worksheet.pageSetup, null, 2));

  console.log("\n=== PRINT SETTINGS ===");
  console.log("Print Area:", worksheet.pageSetup.printArea);
  console.log("Print Titles:", worksheet.pageSetup.printTitlesRow);
}

inspectExcel().catch(console.error);
