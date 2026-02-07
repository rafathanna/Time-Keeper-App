import * as XLSX from "xlsx";
import fs from "fs";

const filePath = "public/Daily Attendance 2.xlsx";
const fileBuffer = fs.readFileSync(filePath);
const workbook = XLSX.read(fileBuffer, { cellStyles: true });
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

console.log("Sheet Name:", sheetName);
console.log("Range:", worksheet["!ref"]);
console.log("\n=== First 15 rows ===\n");

const range = XLSX.utils.decode_range(worksheet["!ref"]);

for (let R = 0; R <= Math.min(15, range.e.r); R++) {
  let row = [];
  for (let C = 0; C <= Math.min(10, range.e.c); C++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: C });
    const cell = worksheet[addr];
    if (cell) {
      row.push(cell.v);
    } else {
      row.push("");
    }
  }
  console.log(`Row ${R}:`, JSON.stringify(row));
}

console.log("\n=== Merges ===");
if (worksheet["!merges"]) {
  worksheet["!merges"].forEach((merge, i) => {
    console.log(`Merge ${i}:`, merge);
  });
}

console.log("\n=== Column Widths ===");
if (worksheet["!cols"]) {
  worksheet["!cols"].forEach((col, i) => {
    console.log(`Col ${i}:`, col);
  });
}
