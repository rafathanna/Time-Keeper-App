import { format, differenceInMinutes, parseISO } from "date-fns";

export const calculateWorkedHours = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return "0.00";
  const start = typeof checkIn === "string" ? parseISO(checkIn) : checkIn;
  const end = typeof checkOut === "string" ? parseISO(checkOut) : checkOut;

  const minutes = differenceInMinutes(end, start);
  const hours = minutes / 60;
  return hours.toFixed(2);
};

export const formatTime = (date) => {
  if (!date) return "--:--";
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "h:mm a");
};

// --- HELPER: Convert Time to Excel Fraction (0.0 - 1.0) ---
const getTimeFraction = (date) => {
  if (!date) return null;
  const d = typeof date === "string" ? parseISO(date) : date;
  if (isNaN(d.getTime())) return null;

  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();

  return (hours + minutes / 60 + seconds / 3600) / 24;
};

// Helper: Infer Job Title if missing
const getJobTitle = (emp) => {
  if (emp.job && emp.job.trim() !== "") return emp.job;

  const dept = emp.department || "";
  if (dept === "Construction") return "Site Engineer";
  if (dept === "Quality Control") return "QC Engineer";
  if (dept === "Technical office") return "Technical Office Eng";
  if (dept === "HSE") return "Safety Officer";
  if (dept === "Surveying") return "Surveyor";
  if (dept === "Finance") return "Accountant";
  if (dept === "IT") return "IT Specialist";
  if (dept === "Security") return "Security Guard";
  if (dept === "Human Resources") return "HR Specialist";
  if (dept === "Admin") return "Administrator";
  if (dept === "Equipment") return "Equipment Manager";

  return "Employee";
};

export const getTodayStr = () => {
  return format(new Date(), "yyyy-MM-dd");
};

// --- PREMIUM STYLING CONSTANTS ---

const FILL_DEPT = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF102542" }, // Night Blue
};

const FONT_DEPT = {
  name: "Arial",
  size: 20,
  bold: true,
  color: { argb: "FFFFFFFF" },
};

const FONT_DATA = {
  name: "Arial",
  size: 20,
  color: { argb: "FF000000" },
  bold: true,
};

const FONT_DATA_BOLD = {
  name: "Arial",
  size: 20,
  color: { argb: "FF000000" },
  bold: true,
};

const BORDER_FULL = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

const FILL_TOTAL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE0E0E0" },
};

const addSignatureBlock = (worksheet, currentRow) => {
  currentRow += 2;
  const sigRow = worksheet.getRow(currentRow);
  sigRow.height = 40;

  const cellManager = sigRow.getCell(2);
  cellManager.value = "General Manager";
  cellManager.font = { name: "Arial", size: 20, bold: true, underline: true };
  cellManager.alignment = { horizontal: "center", vertical: "middle" };

  const cellHR = sigRow.getCell(6);
  cellHR.value = "Human Resources";
  cellHR.font = { name: "Arial", size: 20, bold: true, underline: true };
  cellHR.alignment = { horizontal: "center", vertical: "middle" };

  currentRow += 4;

  const lineRow = worksheet.getRow(currentRow);
  lineRow.height = 30;

  const lineCellManager = lineRow.getCell(2);
  lineCellManager.value = ".........................";
  lineCellManager.font = { name: "Arial", size: 20, bold: true };
  lineCellManager.alignment = { horizontal: "center", vertical: "bottom" };

  const lineCellHR = lineRow.getCell(6);
  lineCellHR.value = ".........................";
  lineCellHR.font = { name: "Arial", size: 20, bold: true };
  lineCellHR.alignment = { horizontal: "center", vertical: "bottom" };

  return currentRow;
};

const sortDepartments = (depts) => {
  return depts.sort((a, b) => {
    if (a === "Construction") return -1;
    if (b === "Construction") return 1;
    return a.localeCompare(b);
  });
};

export const exportToExcel = async (data, dateStr) => {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const { parseISO: pISO, format: formatDt } = await import("date-fns");
    const { ar } = await import("date-fns/locale");
    const response = await fetch("/Daily Attendance 2.xlsx");
    const arrayBuffer = await response.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.getWorksheet(1);
    worksheet.views = [
      { rightToLeft: true, showGridLines: false, zoomScale: 110 },
    ];

    // Set Column Widths to fit Font 20
    worksheet.getColumn(1).width = 12; // ID
    worksheet.getColumn(2).width = 50; // Name
    worksheet.getColumn(3).width = 35; // Job
    worksheet.getColumn(4).width = 25; // In
    worksheet.getColumn(5).width = 25; // Out
    worksheet.getColumn(6).width = 22; // Overtime
    worksheet.getColumn(7).width = 22;
    worksheet.getColumn(8).width = 22;

    // Format date in Arabic: "الخميس 6 فبراير 2026"
    const dateObj = pISO(dateStr);
    const formattedDate = formatDt(dateObj, "EEEE d MMMM yyyy", { locale: ar });

    const dateCell = worksheet.getCell("B3");
    dateCell.value = `   Attendance Report (Contracts) - ${formattedDate}    `;
    dateCell.font = {
      name: "Arial",
      size: 20,
      bold: true,
      color: { argb: "FF000000" },
    };

    const byDepartment = {};
    data.forEach((emp) => {
      const dept = emp.department || "General";
      if (!byDepartment[dept]) byDepartment[dept] = [];
      byDepartment[dept].push(emp);
    });

    // Clear Old Data
    const maxRows = Math.max(worksheet.rowCount, 500);
    for (let r = 7; r <= maxRows; r++) {
      try {
        worksheet.unMergeCells(r, 1, r, 8);
      } catch (e) {}
      const row = worksheet.getRow(r);
      row.height = 32;
      for (let c = 1; c <= 20; c++) {
        const cell = row.getCell(c);
        cell.value = null;
        cell.style = {};
      }
    }

    let currentRow = 7;
    let counter = 1;
    const sortedDepts = sortDepartments(Object.keys(byDepartment));

    for (const dept of sortedDepts) {
      const deptRow = worksheet.getRow(currentRow);
      deptRow.height = 42;
      worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
      const deptCell = worksheet.getCell(`A${currentRow}`);
      deptCell.value = dept;
      deptCell.style = {
        font: FONT_DEPT,
        fill: FILL_DEPT,
        alignment: { vertical: "middle", horizontal: "center" },
        border: BORDER_FULL,
      };
      currentRow++;

      byDepartment[dept].forEach((emp) => {
        const hoursWorked = calculateWorkedHours(emp.checkIn, emp.checkOut);
        const overtime =
          parseFloat(hoursWorked) > 8
            ? (parseFloat(hoursWorked) - 8).toFixed(2)
            : "";
        const jobTitle = getJobTitle(emp);
        const checkInFrac = getTimeFraction(emp.checkIn);
        const checkOutFrac = getTimeFraction(emp.checkOut);

        const row = worksheet.getRow(currentRow);
        row.height = 40; // Increased for wrapped text

        const setCell = (colIdx, val, isBold = false) => {
          const cell = row.getCell(colIdx);
          cell.value = val;
          cell.font = isBold ? FONT_DATA_BOLD : FONT_DATA;
          cell.border = BORDER_FULL;
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFFFFF" },
          };
        };

        setCell(1, counter++, true);
        setCell(2, emp.name, true);
        setCell(3, jobTitle, false);
        row.getCell(3).font = { ...FONT_DATA, size: 16 };
        row.getCell(3).alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };

        // If employee has status (leave/absence), show it instead of time
        if (emp.status) {
          setCell(4, emp.status, true);
          setCell(5, "", true);
          setCell(6, "", true);
          try {
            worksheet.mergeCells(currentRow, 4, currentRow, 5);
          } catch(e) {}
          row.getCell(4).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFEF3C7" }, // Amber background
          };
          row.getCell(4).font = {
            ...FONT_DATA_BOLD,
            color: { argb: "FFD97706" }, // Amber text
          };
        } else {
          if (emp.checkInStatus) {
            setCell(4, emp.checkInStatus, true);
            row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
            row.getCell(4).font = { ...FONT_DATA_BOLD, color: { argb: "FFD97706" } };
          } else {
            setCell(4, checkInFrac, true);
            if (checkInFrac !== null) row.getCell(4).numFmt = "h:mm AM/PM";
          }
          
          if (emp.checkOutStatus) {
            setCell(5, emp.checkOutStatus, true);
            row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
            row.getCell(5).font = { ...FONT_DATA_BOLD, color: { argb: "FFD97706" } };
          } else {
            setCell(5, checkOutFrac, true);
            if (checkOutFrac !== null) row.getCell(5).numFmt = "h:mm AM/PM";
          }

          setCell(6, overtime ? parseFloat(overtime) : "", true);
          if (parseFloat(overtime) > 0) {
            row.getCell(6).numFmt = "0.00";
            row.getCell(6).font = {
              ...FONT_DATA_BOLD,
              color: { argb: "FFD90429" },
            };
          }
        }

        setCell(7, "", false);
        setCell(8, "", false);
        currentRow++;
      });

      const totalRow = worksheet.getRow(currentRow);
      totalRow.height = 35;
      totalRow.getCell(2).value = "Total Department:";
      totalRow.getCell(2).font = { ...FONT_DATA_BOLD, size: 20 };
      totalRow.getCell(2).alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      totalRow.getCell(3).value = byDepartment[dept].length;
      totalRow.getCell(3).font = { ...FONT_DATA_BOLD, size: 20 };
      totalRow.getCell(3).alignment = {
        vertical: "middle",
        horizontal: "center",
      };

      for (let c = 1; c <= 8; c++) {
        const cell = totalRow.getCell(c);
        cell.fill = FILL_TOTAL;
        cell.border = BORDER_FULL;
      }
      currentRow++;
    }

    addSignatureBlock(worksheet, currentRow);
    worksheet.pageSetup = {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.2,
        right: 0.2,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
      printTitlesRow: "1:6",
    };
    if (!worksheet.headerFooter) worksheet.headerFooter = {};
    worksheet.headerFooter.oddFooter = "";

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Daily_Attendance_${dateStr}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Export error:", error);
    alert("حدث خطأ أثناء الExport: " + error.message);
  }
};

export const exportAllHistory = async (history) => {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const { parseISO: pISO, format: formatDt } = await import("date-fns");
    const { ar } = await import("date-fns/locale");
    const workbook = new ExcelJS.Workbook();
    const masterResponse = await fetch("/Daily Attendance 2.xlsx");
    const masterBuffer = await masterResponse.arrayBuffer();
    const masterWb = new ExcelJS.Workbook();
    await masterWb.xlsx.load(masterBuffer);
    const masterSheet = masterWb.getWorksheet(1);
    const sortedDates = Object.keys(history).sort().reverse();

    const copyS = (src, tgt) => {
      if (!src || !tgt || !src.style) return;
      try {
        tgt.style = JSON.parse(JSON.stringify(src.style));
      } catch (e) {
        if (src.font) tgt.font = { ...src.font };
        if (src.fill) tgt.fill = { ...src.fill };
        if (src.border) tgt.border = { ...src.border };
        if (src.alignment) tgt.alignment = { ...src.alignment };
      }
    };

    for (const date of sortedDates) {
      const data = history[date];
      const worksheet = workbook.addWorksheet(date);
      worksheet.views = [
        { rightToLeft: true, showGridLines: false, zoomScale: 110 },
      ];

      masterSheet.columns.forEach((col, idx) => {
        worksheet.getColumn(idx + 1).width = col.width;
      });

      masterSheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 6) {
          const newRow = worksheet.getRow(rowNumber);
          newRow.height = row.height;
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const newCell = newRow.getCell(colNumber);
            newCell.value = cell.value;
            copyS(cell, newCell);
          });
        }
      });
      if (masterSheet.model.merges) {
        masterSheet.model.merges.forEach((m) => {
          try {
            const [start] = m.split(":");
            const rr = parseInt(start.replace(/\D/g, ""));
            if (rr <= 6) worksheet.mergeCells(m);
          } catch (e) {}
        });
      }

      // Format date in Arabic
      const dateObj = pISO(date);
      const formattedDate = formatDt(dateObj, "EEEE d MMMM yyyy", {
        locale: ar,
      });

      const dateCell = worksheet.getCell("B3");
      dateCell.value = `   Attendance Report (Contracts) - ${formattedDate}    `;
      dateCell.font = {
        name: "Arial",
        size: 18,
        bold: true,
        color: { argb: "FF000000" },
      };

      const byDepartment = {};
      data.forEach((emp) => {
        const dept = emp.department || "General";
        if (!byDepartment[dept]) byDepartment[dept] = [];
        byDepartment[dept].push(emp);
      });

      let currentRow = 7;
      let counter = 1;
      const sortedDepts = sortDepartments(Object.keys(byDepartment));

      for (const dept of sortedDepts) {
        const deptRow = worksheet.getRow(currentRow);
        deptRow.height = 42;
        worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
        const deptCell = worksheet.getCell(`A${currentRow}`);
        deptCell.value = dept;
        deptCell.style = {
          font: FONT_DEPT,
          fill: FILL_DEPT,
          alignment: { vertical: "middle", horizontal: "center" },
          border: BORDER_FULL,
        };
        currentRow++;

        byDepartment[dept].forEach((emp) => {
          const hoursWorked = calculateWorkedHours(emp.checkIn, emp.checkOut);
          const overtime =
            parseFloat(hoursWorked) > 8
              ? (parseFloat(hoursWorked) - 8).toFixed(2)
              : "";
          const jobTitle = getJobTitle(emp);
          const checkInFrac = getTimeFraction(emp.checkIn);
          const checkOutFrac = getTimeFraction(emp.checkOut);

          const row = worksheet.getRow(currentRow);
          row.height = 32;

          const setCell = (colIdx, val, isBold = false) => {
            const cell = row.getCell(colIdx);
            cell.value = val;
            cell.font = isBold ? FONT_DATA_BOLD : FONT_DATA;
            cell.border = BORDER_FULL;
            cell.alignment = { vertical: "middle", horizontal: "center" };
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFFFFF" },
            };
          };

          setCell(1, counter++, true);
          setCell(2, emp.name, true);
          setCell(3, jobTitle, false);

          // If employee has status (leave/absence), show it instead of time
          if (emp.status) {
            setCell(4, emp.status, true);
            setCell(5, "", true);
            setCell(6, "", true);
            try {
              worksheet.mergeCells(currentRow, 4, currentRow, 5);
            } catch(e) {}
            row.getCell(4).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFEF3C7" }, // Amber background
            };
            row.getCell(4).font = {
              ...FONT_DATA_BOLD,
              color: { argb: "FFD97706" }, // Amber text
            };
          } else {
            if (emp.checkInStatus) {
              setCell(4, emp.checkInStatus, true);
              row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
              row.getCell(4).font = { ...FONT_DATA_BOLD, color: { argb: "FFD97706" } };
            } else {
              setCell(4, checkInFrac, true);
              if (checkInFrac !== null) row.getCell(4).numFmt = "h:mm AM/PM";
            }
            
            if (emp.checkOutStatus) {
              setCell(5, emp.checkOutStatus, true);
              row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
              row.getCell(5).font = { ...FONT_DATA_BOLD, color: { argb: "FFD97706" } };
            } else {
              setCell(5, checkOutFrac, true);
              if (checkOutFrac !== null) row.getCell(5).numFmt = "h:mm AM/PM";
            }

            setCell(6, overtime ? parseFloat(overtime) : "", true);
            if (parseFloat(overtime) > 0) {
              row.getCell(6).numFmt = "0.00";
              row.getCell(6).font = {
                ...FONT_DATA_BOLD,
                color: { argb: "FFD90429" },
              };
            }
          }
          setCell(7, "", false);
          setCell(8, "", false);
          currentRow++;
        });

        const totalRow = worksheet.getRow(currentRow);
        totalRow.height = 35;
        totalRow.getCell(2).value = "Total Department:";
        totalRow.getCell(2).font = { ...FONT_DATA_BOLD, size: 13 };
        totalRow.getCell(3).value = byDepartment[dept].length;
        totalRow.getCell(3).font = { ...FONT_DATA_BOLD, size: 14 };
        totalRow.getCell(3).alignment = {
          vertical: "middle",
          horizontal: "center",
        };

        for (let c = 1; c <= 8; c++) {
          const cell = totalRow.getCell(c);
          cell.fill = FILL_TOTAL;
          cell.border = BORDER_FULL;
        }
        currentRow++;
      }

      addSignatureBlock(worksheet, currentRow);
      worksheet.pageSetup = {
        paperSize: 9,
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        margins: {
          left: 0.2,
          right: 0.2,
          top: 0.4,
          bottom: 0.4,
          header: 0.2,
          footer: 0.2,
        },
        printTitlesRow: "1:6",
      };
      if (!worksheet.headerFooter) worksheet.headerFooter = {};
      worksheet.headerFooter.oddFooter =
        '&C&"Arial,Regular"&8Developed By Rafat Hanna';
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `History_All_${getTodayStr()}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Export error:", error);
    alert("حدث خطأ أثناء الExport: " + error.message);
  }
};

export const exportIndividualTimeSheets = async (
  employees,
  history,
  referenceDate = getTodayStr(),
) => {
  console.log("Starting Individual Export...", {
    employeesCount: employees?.length,
    referenceDate,
  });
  try {
    const ExcelJS = (await import("exceljs")).default;
    const {
      startOfMonth,
      endOfMonth,
      eachDayOfInterval,
      format: formatDt,
    } = await import("date-fns");

    if (!employees || employees.length === 0) {
      alert("برجاء اختيار Empsين أولاً");
      return;
    }

    const workbook = new ExcelJS.Workbook();

    // 1. Load the MASTER template for branding/logos
    let templateWb;
    try {
      const response = await fetch("/Daily Attendance 2.xlsx");
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        templateWb = new ExcelJS.Workbook();
        await templateWb.xlsx.load(arrayBuffer);
      }
    } catch (err) {
      console.warn("Template fetch/load failed, using basic layout:", err);
    }
    const templateSheet = templateWb ? templateWb.getWorksheet(1) : null;

    const refDateObj = parseISO(referenceDate);
    const monthStart = startOfMonth(refDateObj);
    const monthEnd = endOfMonth(refDateObj);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const monthNameEng = formatDt(refDateObj, "MMMM yyyy");

    const copyStyle = (source, target) => {
      if (!source || !target || !source.style) return;
      try {
        target.style = JSON.parse(JSON.stringify(source.style));
      } catch (e) {
        if (source.font) target.font = { ...source.font };
        if (source.fill) target.fill = { ...source.fill };
        if (source.border) target.border = { ...source.border };
        if (source.alignment) target.alignment = { ...source.alignment };
      }
    };

    let sheetIdx = 1;
    for (const emp of employees) {
      if (!emp?.name) continue;

      const cleanName = emp.name.replace(/[\\\/\?\*\:\[\]]/g, "_");
      const safeName = `${sheetIdx++}-${cleanName}`.substring(0, 31);

      const ws = workbook.addWorksheet(safeName);
      ws.views = [{ rightToLeft: true, showGridLines: false, zoomScale: 100 }];

      if (templateSheet) {
        for (let i = 1; i <= 15; i++) {
          const col = templateSheet.getColumn(i);
          if (col?.width) ws.getColumn(i).width = col.width;
        }
        for (let r = 1; r <= 6; r++) {
          const tR = templateSheet.getRow(r);
          const nR = ws.getRow(r);
          if (tR.height) nR.height = tR.height;
          tR.eachCell({ includeEmpty: true }, (cell, cIdx) => {
            const nC = nR.getCell(cIdx);
            nC.value = cell.value;
            copyStyle(cell, nC);
          });
        }
        if (templateSheet.model.merges) {
          templateSheet.model.merges.forEach((m) => {
            try {
              const [start] = m.split(":");
              const rRow = parseInt(start.replace(/\D/g, ""));
              if (rRow <= 6) ws.mergeCells(m);
            } catch (e) {}
          });
        }
        const images = templateSheet.getImages();
        images.forEach((img) => {
          const media = templateWb.model.media.find(
            (m) => m.index === img.imageId,
          );
          if (media && img.range.tl.row <= 6) {
            try {
              const nid = workbook.addImage({
                buffer: media.buffer,
                extension: media.extension,
              });
              ws.addImage(nid, img.range);
            } catch (e) {}
          }
        });
      }

      // OVERRIDE WIDTHS for Font 20
      ws.getColumn(1).width = 12; // M
      ws.getColumn(2).width = 30; // Date
      ws.getColumn(3).width = 25; // Day
      ws.getColumn(4).width = 25; // In
      ws.getColumn(5).width = 25; // Out
      ws.getColumn(6).width = 40; // Notes

      // Title & Info
      ws.getCell("B3").value = `MONTHLY TIME SHEET: ${emp.name}`;
      ws.getCell("B3").font = {
        name: "Arial",
        size: 20,
        bold: true,
        color: { argb: "FF102542" },
      };

      const r5 = ws.getRow(5);
      r5.getCell(2).value = `Dept: ${emp.department || "-"}`;
      r5.getCell(4).value = `Job: ${emp.job || "-"}`;
      r5.getCell(6).value = `Month: ${monthNameEng}`;

      // Table Header Row 6
      const labels = [
        "No.",
        "Date",
        "Day",
        "Check-In / In",
        "Check-Out / Out",
        "Notes",
      ];
      labels.forEach((l, i) => {
        const c = ws.getCell(6, i + 1);
        c.value = l;
        c.font = { bold: true, size: 20, color: { argb: "FFFFFFFF" } };
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF212529" },
        };
        c.alignment = { horizontal: "center", vertical: "middle" };
        c.border = BORDER_FULL;
      });

      // Rows
      let curr = 7;
      daysInMonth.forEach((day, idx) => {
        const ds = formatDt(day, "yyyy-MM-dd");
        const dnAr = new Intl.DateTimeFormat("ar-EG", {
          weekday: "long",
        }).format(day);
        const att = (history[ds] || []).find((h) => h.name === emp.name);

        const row = ws.getRow(curr);
        row.height = 30;

        const sc = (col, val, f = null, b = false) => {
          const c = row.getCell(col);
          c.value = val;
          c.border = BORDER_FULL;
          c.alignment = { horizontal: "center", vertical: "middle" };
          c.font = { name: "Arial", size: 20, bold: true };
          if (f) c.numFmt = f;
          if (idx % 2 !== 0)
            c.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF8F9FA" },
            };
        };

        sc(1, idx + 1);
        sc(2, ds);
        sc(3, dnAr);
        if (att && att.status) {
          sc(4, att.status);
          sc(5, "");
          sc(6, "");
          try {
            ws.mergeCells(curr, 4, curr, 5);
          } catch(e) {}
          row.getCell(4).font = { name: "Arial", size: 18, bold: true, color: { argb: "FFD97706" } };
        } else {
          if (att && att.checkInStatus) {
            sc(4, att.checkInStatus);
            row.getCell(4).font = { name: "Arial", size: 16, bold: true, color: { argb: "FFD97706" } };
          } else {
            sc(4, att ? getTimeFraction(att.checkIn) : null, "h:mm AM/PM", true);
          }

          if (att && att.checkOutStatus) {
            sc(5, att.checkOutStatus);
            row.getCell(5).font = { name: "Arial", size: 16, bold: true, color: { argb: "FFD97706" } };
          } else {
            sc(5, att ? getTimeFraction(att.checkOut) : null, "h:mm AM/PM", true);
          }
          sc(6, "");
        }

        curr++;
      });

      // Signatures
      curr += 2;
      const sr = ws.getRow(curr);
      sr.height = 35;
      const dSi = (col, txt) => {
        const c = sr.getCell(col);
        c.value = txt;
        c.font = { bold: true, size: 20, underline: true };
        c.alignment = { horizontal: "center", vertical: "middle" };
      };
      dSi(2, "الEmps / Employee");
      dSi(4, "HR Signature");
      dSi(6, "Manager Signature");

      ws.pageSetup = {
        paperSize: 9,
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      };
      if (!ws.headerFooter) ws.headerFooter = {};
      ws.headerFooter.oddFooter = "";
    }

    const buf = await workbook.xlsx.writeBuffer();
    const blb = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const u = URL.createObjectURL(blb);
    const downloadLink = document.createElement("a");
    downloadLink.href = u;
    downloadLink.download = `Monthly_TimeSheets_${monthNameEng.replace(" ", "_")}.xlsx`;
    downloadLink.click();
    URL.revokeObjectURL(u);
  } catch (err) {
    console.error("Export Trace:", err);
    alert("حدث خطأ أثناء الExport: " + err.message);
  }
};

// --- FLAT DAILY TIME SHEET EXPORT ---
export const exportDailyTimeSheet = async (data, dateStr) => {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const { parseISO: pISO, format: formatDt } = await import("date-fns");
    const { ar } = await import("date-fns/locale");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Daily Sheet");
    worksheet.views = [
      { rightToLeft: true, showGridLines: false, zoomScale: 110 },
    ];

    // Column widths
    worksheet.getColumn(1).width = 6;
    worksheet.getColumn(2).width = 42;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 20;
    worksheet.getColumn(5).width = 22;
    worksheet.getColumn(6).width = 22;
    worksheet.getColumn(7).width = 14;
    worksheet.getColumn(8).width = 14;
    worksheet.getColumn(9).width = 18;

    // Title row
    const dateObj = pISO(dateStr);
    const formattedDate = formatDt(dateObj, "EEEE d MMMM yyyy", { locale: ar });
    worksheet.mergeCells("A1:I1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = `Attendance Report - ${formattedDate}`;
    titleCell.font = { name: "Arial", size: 22, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF102542" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 48;

    // Header row
    const headers = ["No.", "Name", "Job", "Department", "Check-In", "Check-Out", "Hours", "Overtime", "الStatus"];
    const headerRow = worksheet.getRow(2);
    headerRow.height = 38;
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFFFFFFF" } },
        bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
        left: { style: "thin", color: { argb: "FFFFFFFF" } },
        right: { style: "thin", color: { argb: "FFFFFFFF" } },
      };
    });

    // Sort: present first, then status, then absent
    const sorted = [...data].sort((a, b) => {
      const aScore = (a.checkIn || a.checkInStatus) ? 0 : a.status ? 1 : 2;
      const bScore = (b.checkIn || b.checkInStatus) ? 0 : b.status ? 1 : 2;
      if (aScore !== bScore) return aScore - bScore;
      if (a.checkIn && b.checkIn) return new Date(a.checkIn) - new Date(b.checkIn);
      return 0;
    });

    const BORDER = {
      top: { style: "thin", color: { argb: "FFDDDDDD" } },
      bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
      left: { style: "thin", color: { argb: "FFDDDDDD" } },
      right: { style: "thin", color: { argb: "FFDDDDDD" } },
    };

    sorted.forEach((emp, idx) => {
      const rowNum = idx + 3;
      const row = worksheet.getRow(rowNum);
      row.height = 36;

      const hoursWorked = calculateWorkedHours(emp.checkIn, emp.checkOut);
      const hoursNum = parseFloat(hoursWorked);
      const overtime = hoursNum > 8 ? (hoursNum - 8).toFixed(2) : "";

      const checkInFrac = (() => {
        if (!emp.checkIn) return null;
        const d = typeof emp.checkIn === "string" ? pISO(emp.checkIn) : emp.checkIn;
        if (isNaN(d.getTime())) return null;
        return (d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600) / 24;
      })();
      const checkOutFrac = (() => {
        if (!emp.checkOut) return null;
        const d = typeof emp.checkOut === "string" ? pISO(emp.checkOut) : emp.checkOut;
        if (isNaN(d.getTime())) return null;
        return (d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600) / 24;
      })();

      const isEven = idx % 2 === 0;
      const bgColor = isEven ? "FFFFFFFF" : "FFF5F9FF";

      const sc = (col, val, fmt = null, fontOverride = null) => {
        const cell = row.getCell(col);
        cell.value = val;
        cell.font = fontOverride || { name: "Arial", size: 14, bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = BORDER;
        if (fmt) cell.numFmt = fmt;
      };

      sc(1, idx + 1);
      sc(2, emp.name, null, { name: "Arial", size: 15, bold: true });
      sc(3, getJobTitle(emp), null, { name: "Arial", size: 13 });
      sc(4, emp.department || "-", null, { name: "Arial", size: 13 });
      
      if (emp.status) {
        sc(5, emp.status, null, { name: "Arial", size: 14, bold: true, color: { argb: "FFD97706" } });
        row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9E6" } };
        sc(6, "");
        sc(7, "");
        sc(8, "");
        sc(9, "");
        try {
          worksheet.mergeCells(rowNum, 5, rowNum, 6);
        } catch(e) {}
      } else {
        if (emp.checkInStatus) {
          sc(5, emp.checkInStatus, null, { name: "Arial", size: 14, bold: true, color: { argb: "FFD97706" } });
          row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9E6" } };
        } else {
          sc(5, checkInFrac, "h:mm AM/PM");
        }
        
        if (emp.checkOutStatus) {
          sc(6, emp.checkOutStatus, null, { name: "Arial", size: 14, bold: true, color: { argb: "FFD97706" } });
          row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9E6" } };
        } else {
          sc(6, checkOutFrac, "h:mm AM/PM");
        }
        
        if (hoursNum > 0) {
          sc(7, hoursNum, "0.00", { name: "Arial", size: 14, bold: true, color: { argb: "FF0369A1" } });
        } else {
          sc(7, "");
        }
        
        if (parseFloat(overtime) > 0) {
          sc(8, parseFloat(overtime), "0.00", { name: "Arial", size: 14, bold: true, color: { argb: "FFD90429" } });
        } else {
          sc(8, "");
        }
        sc(9, (emp.checkIn || emp.checkInStatus) && (!emp.checkOut && !emp.checkOutStatus) ? "Working" : (emp.checkOut || emp.checkOutStatus) ? "Checked Out" : "-");
      }
    });

    // Summary row
    const summaryRowNum = sorted.length + 3;
    const summaryRow = worksheet.getRow(summaryRowNum);
    summaryRow.height = 38;
    worksheet.mergeCells(`A${summaryRowNum}:B${summaryRowNum}`);
    
    const presentCount = sorted.filter(e => e.checkIn || e.checkInStatus).length;
    const completedCount = sorted.filter(e => e.checkOut || e.checkOutStatus).length;
    const absentCount = sorted.filter(e => !e.checkIn && !e.checkInStatus && !e.status).length;
    
    const sc2 = (col, val, color = "FF102542") => {
      const cell = summaryRow.getCell(col);
      cell.value = val;
      cell.font = { name: "Arial", size: 15, bold: true, color: { argb: color } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = BORDER;
    };
    
    sc2(1, `الTotal: ${sorted.length} Emps`);
    sc2(3, `Present: ${presentCount}`);
    sc2(4, `انصرف: ${completedCount}`, "FF059669");
    sc2(5, "");
    sc2(6, "");
    sc2(7, "");
    sc2(8, "");
    sc2(9, "");

    worksheet.pageSetup = {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.2, right: 0.2, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `TimeSheet_${dateStr}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Export error:", error);
    alert("حدث خطأ أثناء الExport: " + error.message);
  }
};

export const exportDashReport = async (data, dateStr) => {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const { parseISO: pISO, format: formatDt } = await import("date-fns");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Dashboard");
    
    // Set landscape and STRICTLY 1 page
    worksheet.pageSetup = {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.1, right: 0.1, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1 },
    };
    worksheet.views = [{ rightToLeft: true, showGridLines: false, zoomScale: 90 }];

    const dateObj = pISO(dateStr);
    const formattedDate = formatDt(dateObj, "EEEE d MMMM yyyy");
    
    // Group by department
    const grouped = {};
    data.filter(e => e.name).forEach(emp => {
      const d = emp.department || "General";
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(emp);
    });

    const flatList = [];
    Object.keys(grouped).sort().forEach(dept => {
      flatList.push({ type: 'dept', name: dept });
      grouped[dept].sort((a, b) => a.name.localeCompare(b.name, 'ar')).forEach(emp => {
        flatList.push({ type: 'emp', data: emp });
      });
    });

    const CHUNK_SIZE = 35; // Maximum rows per column block to fit safely on one landscape page
    const numChunks = Math.max(1, Math.ceil(flatList.length / CHUNK_SIZE));
    
    // Header Row for Title
    worksheet.mergeCells(1, 1, 1, numChunks * 3);
    const title = worksheet.getCell(1, 1);
    title.value = `تقرير الحضور والانصراف (الداش بورد) - ${formattedDate}`;
    title.font = { name: "Arial", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    title.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 40;

    // Set widths and Headers
    const headerRow = worksheet.getRow(2);
    headerRow.height = 25;
    
    for (let c = 0; c < numChunks; c++) {
      worksheet.getColumn(c * 3 + 1).width = 25; // Name
      worksheet.getColumn(c * 3 + 2).width = 12; // In
      worksheet.getColumn(c * 3 + 3).width = 12; // Out
      
      const offset = c * 3;
      ['الاسم', 'حضور', 'انصراف'].forEach((h, i) => {
        const cell = headerRow.getCell(offset + i + 1);
        cell.value = h;
        cell.font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
      });
    }

    // Write Data
    flatList.forEach((item, index) => {
      const chunkIndex = Math.floor(index / CHUNK_SIZE);
      const rowIndex = 3 + (index % CHUNK_SIZE);
      const colOffset = chunkIndex * 3;
      
      const row = worksheet.getRow(rowIndex);
      
      if (item.type === 'dept') {
        worksheet.mergeCells(rowIndex, colOffset + 1, rowIndex, colOffset + 3);
        const cDept = row.getCell(colOffset + 1);
        cDept.value = item.name;
        cDept.font = { name: "Arial", size: 13, bold: true, color: { argb: "FF1E293B" } };
        cDept.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        cDept.alignment = { horizontal: "center", vertical: "middle" };
        cDept.border = { top:{style:'medium', color:{argb:"FFCBD5E1"}}, bottom:{style:'medium', color:{argb:"FFCBD5E1"}}, left:{style:'medium', color:{argb:"FFCBD5E1"}}, right:{style:'medium', color:{argb:"FFCBD5E1"}} };
      } else {
        const emp = item.data;
        // Name
        const cName = row.getCell(colOffset + 1);
        cName.value = emp.name;
        cName.font = { name: "Arial", size: 11, bold: true };
        cName.alignment = { horizontal: "right", vertical: "middle" };
        cName.border = { top:{style:'thin', color:{argb:"FFCBD5E1"}}, bottom:{style:'thin', color:{argb:"FFCBD5E1"}}, left:{style:'thin', color:{argb:"FFCBD5E1"}}, right:{style:'thin', color:{argb:"FFCBD5E1"}} };
        
        // In
        const cIn = row.getCell(colOffset + 2);
        cIn.value = emp.checkInStatus || (emp.checkIn ? formatTime(emp.checkIn) : "-");
        cIn.font = { name: "Arial", size: 11, color: emp.checkInStatus ? {argb:"FFD97706"} : (emp.checkIn ? {argb:"FF059669"} : {argb:"FF94A3B8"}) };
        cIn.alignment = { horizontal: "center", vertical: "middle" };
        cIn.border = { top:{style:'thin', color:{argb:"FFCBD5E1"}}, bottom:{style:'thin', color:{argb:"FFCBD5E1"}}, left:{style:'thin', color:{argb:"FFCBD5E1"}}, right:{style:'thin', color:{argb:"FFCBD5E1"}} };

        // Out
        const cOut = row.getCell(colOffset + 3);
        cOut.value = emp.checkOutStatus || (emp.checkOut ? formatTime(emp.checkOut) : "-");
        cOut.font = { name: "Arial", size: 11, color: emp.checkOutStatus ? {argb:"FFD97706"} : (emp.checkOut ? {argb:"FF059669"} : {argb:"FF94A3B8"}) };
        cOut.alignment = { horizontal: "center", vertical: "middle" };
        cOut.border = { top:{style:'thin', color:{argb:"FFCBD5E1"}}, bottom:{style:'thin', color:{argb:"FFCBD5E1"}}, left:{style:'thin', color:{argb:"FFCBD5E1"}}, right:{style:'thin', color:{argb:"FFCBD5E1"}} };
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Dashboard_${dateStr}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Dashboard Export Error", err);
    alert("Export Error: " + err.message);
  }
};
