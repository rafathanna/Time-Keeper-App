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
  cellManager.value = "المدير المسؤول";
  cellManager.font = { name: "Arial", size: 20, bold: true, underline: true };
  cellManager.alignment = { horizontal: "center", vertical: "middle" };

  const cellHR = sigRow.getCell(6);
  cellHR.value = "الموارد البشرية";
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
    dateCell.value = `   كشف حضور وانصراف (عقود) - ${formattedDate}    `;
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
          row.getCell(4).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFEF3C7" }, // Amber background
          };
          row.getCell(4).font = {
            ...FONT_DATA_BOLD,
            color: { argb: "FFD97706" }, // Amber text
          };
          setCell(5, "", true);
          setCell(6, "", true);
        } else {
          setCell(4, checkInFrac, true);
          if (checkInFrac !== null) row.getCell(4).numFmt = "h:mm AM/PM";
          setCell(5, checkOutFrac, true);
          if (checkOutFrac !== null) row.getCell(5).numFmt = "h:mm AM/PM";
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
      totalRow.getCell(2).value = "إجمالي القسم:";
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
    alert("حدث خطأ أثناء التصدير: " + error.message);
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
      dateCell.value = `   كشف حضور وانصراف (عقود) - ${formattedDate}    `;
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
            row.getCell(4).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFEF3C7" }, // Amber background
            };
            row.getCell(4).font = {
              ...FONT_DATA_BOLD,
              color: { argb: "FFD97706" }, // Amber text
            };
            setCell(5, "", true);
            setCell(6, "", true);
          } else {
            setCell(4, checkInFrac, true);
            if (checkInFrac !== null) row.getCell(4).numFmt = "h:mm AM/PM";
            setCell(5, checkOutFrac, true);
            if (checkOutFrac !== null) row.getCell(5).numFmt = "h:mm AM/PM";
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
        totalRow.getCell(2).value = "إجمالي القسم:";
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
    alert("حدث خطأ أثناء التصدير: " + error.message);
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
      alert("برجاء اختيار موظفين أولاً");
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
        "م",
        "التاريخ / Date",
        "اليوم / Day",
        "حضور / In",
        "انصراف / Out",
        "ملاحظات",
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
        sc(4, att ? getTimeFraction(att.checkIn) : null, "h:mm AM/PM", true);
        sc(5, att ? getTimeFraction(att.checkOut) : null, "h:mm AM/PM", true);
        sc(6, "");

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
      dSi(2, "الموظف / Employee");
      dSi(4, "HR / شؤون العاملين");
      dSi(6, "Manager / اعتماد");

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
    alert("حدث خطأ أثناء التصدير: " + err.message);
  }
};
