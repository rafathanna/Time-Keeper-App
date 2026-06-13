import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { db } from "./firebase";
import {
  doc,
  collection,
  setDoc,
  onSnapshot,
  getDoc,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";
import {
  Users,
  Clock,
  Download,
  RefreshCcw,
  CheckCircle2,
  Search,
  UserCheck,
  UserMinus,
  Briefcase,
  Plus,
  Trash2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Save,
  Settings,
  X,
  FileText,
  Share2,
  Moon,
  Sun,
  Upload,
  Lock,
  Unlock,
  BarChart2,
  AlarmClock,
} from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { DEFAULT_EMPLOYEES, STORAGE_KEY } from "./constants";
import {
  calculateWorkedHours,
  formatTime,
  getTodayStr,
  exportToExcel,
  exportAllHistory,
  exportIndividualTimeSheets,
  exportDailyTimeSheet,
  exportDashReport,
} from "./utils";

// ─── HELPERS ────────────────────────────────────────────────────────────────

const nowTimeStr = () => format(new Date(), "HH:mm");

const timeStrToISO = (timeStr, dateStr) => {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(":");
  const d = parseISO(dateStr);
  d.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  return d.toISOString();
};

// ─── APP ─────────────────────────────────────────────────────────────────────

function App() {
  // ── Data State ──────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + "_employees_v2");
    return saved ? JSON.parse(saved) : DEFAULT_EMPLOYEES;
  });

  const [dayData, setDayData] = useState([]); // attendance for selectedDate (from Firestore)
  const [historyCache, setHistoryCache] = useState(() => {
    // Keep local cache of other dates for time-sheet exports
    const saved = localStorage.getItem(STORAGE_KEY + "_history_v2");
    return saved ? JSON.parse(saved) : {};
  });

  // ── UI State ────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [filter, setFilter] = useState("All");
  const [deptFilter, setDeptFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [showExports, setShowExports] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState("General");
  const [newJob, setNewJob] = useState("");
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editJob, setEditJob] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [batchTime, setBatchTime] = useState(nowTimeStr());
  const [showSummary, setShowSummary] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [statusModalEmployee, setStatusModalEmployee] = useState(null);
  const [statusModalScope, setStatusModalScope] = useState("whole_day");
  const [customStatus, setCustomStatus] = useState("");
  const [editingTime, setEditingTime] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const STATUS_OPTIONS = [
    "Mission",
    "Leave",
    "Annual Leave",
    "Missing Punch",
    "Sick Leave",
    "Permission",
    "Transportation Issues",
    "Time Sheet",
  ];
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isCloudLoaded, setIsCloudLoaded] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);

  const lastSentDayData = useRef(null);
  const lastSentEmployees = useRef(null);
  const dayListenerUnsub = useRef(null);
  const empListenerUnsub = useRef(null);

  // ── Theme ────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [isReadOnly, setIsReadOnly] = useState(
    () => localStorage.getItem("isReadOnly") === "true"
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("isReadOnly", isReadOnly.toString());
  }, [isReadOnly]);

  const toggleTheme = () => setTheme((p) => (p === "light" ? "dark" : "light"));

  // ── Online/Offline ───────────────────────────────────────────────────────
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── Clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Local Persistence ────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + "_employees_v2", JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + "_history_v2", JSON.stringify(historyCache));
  }, [historyCache]);

  // ── Departments ──────────────────────────────────────────────────────────
  const departments = useMemo(() => {
    const depts = new Set(employees.map((e) => e.department));
    return ["All", ...Array.from(depts).sort()];
  }, [employees]);

  // ── MIGRATION: Move old data/master → new structure ──────────────────────
  useEffect(() => {
    const runMigration = async () => {
      try {
        const masterSnap = await getDoc(doc(db, "data", "master"));
        if (!masterSnap.exists()) { setMigrationDone(true); return; }
        const old = masterSnap.data();
        if (!old) { setMigrationDone(true); return; }

        const batch = writeBatch(db);

        // Migrate employees
        if (old.employees) {
          batch.set(doc(db, "data", "employees"), { list: old.employees, updatedAt: new Date().toISOString() });
        }

        // Migrate history: one doc per date
        if (old.history) {
          Object.entries(old.history).forEach(([date, records]) => {
            batch.set(doc(db, "daily_history", date), { records, updatedAt: new Date().toISOString() });
          });
        }

        // Delete old master doc
        batch.delete(doc(db, "data", "master"));
        await batch.commit();
        console.log("Migration complete ✓");
      } catch (e) {
        console.warn("Migration skipped or failed:", e.message);
      }
      setMigrationDone(true);
    };
    runMigration();
  }, []);

  // ── CLOUD SYNC: Employees ────────────────────────────────────────────────
  useEffect(() => {
    if (!migrationDone) return;
    setIsSyncing(true);
    const unsub = onSnapshot(
      doc(db, "data", "employees"),
      (snap) => {
        if (snap.exists()) {
          const { list } = snap.data();
          if (list) {
            const str = JSON.stringify(list);
            if (str !== lastSentEmployees.current) {
              lastSentEmployees.current = str;
              setEmployees(list);
            }
          }
        }
        setIsCloudLoaded(true);
        setIsSyncing(false);
      },
      (err) => { console.error("Employees listener error:", err); setIsSyncing(false); setIsCloudLoaded(true); }
    );
    empListenerUnsub.current = unsub;
    return () => unsub();
  }, [migrationDone]);

  // ── CLOUD SYNC: All History ───────────────────────────────────────────────
  useEffect(() => {
    if (!migrationDone) return;

    setIsSyncing(true);
    const unsub = onSnapshot(
      collection(db, "daily_history"),
      (snap) => {
        const newHistory = {};
        snap.forEach((docSnap) => {
          newHistory[docSnap.id] = docSnap.data().records;
        });
        setHistoryCache(newHistory);
        setIsSyncing(false);
      },
      (err) => { console.error("History listener error:", err); setIsSyncing(false); }
    );
    return () => unsub();
  }, [migrationDone]);

  // Sync selectedDate data from historyCache
  useEffect(() => {
    if (historyCache[selectedDate]) {
      const str = JSON.stringify(historyCache[selectedDate]);
      if (str !== lastSentDayData.current) {
        lastSentDayData.current = str;
        setDayData(historyCache[selectedDate]);
      }
    } else {
      lastSentDayData.current = null;
      setDayData([]);
    }
  }, [selectedDate, historyCache]);

  // ── Push employees to cloud ───────────────────────────────────────────────
  useEffect(() => {
    if (!isCloudLoaded) return;
    const str = JSON.stringify(employees);
    if (str === lastSentEmployees.current) return;
    const t = setTimeout(async () => {
      try {
        setIsSyncing(true);
        lastSentEmployees.current = str;
        await setDoc(doc(db, "data", "employees"), {
          list: employees,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error("Push employees error:", e);
        lastSentEmployees.current = null;
      } finally { setIsSyncing(false); }
    }, 800);
    return () => clearTimeout(t);
  }, [employees, isCloudLoaded]);

  // ── Attendance for selected date (merged with employee list) ──────────────
  const attendanceForDate = useMemo(() => {
    const data = Array.isArray(dayData) ? [...dayData] : [];

    employees.forEach((emp) => {
      if (!emp?.name) return;
      const exists = data.some((e) => e?.name === emp.name);
      if (!exists) {
        data.push({ ...emp, checkIn: null, checkOut: null });
      } else {
        const idx = data.findIndex((e) => e?.name === emp.name);
        data[idx] = { ...data[idx], department: emp.department, job: emp.job };
      }
    });

    return data
      .filter((e) => e && employees.some((emp) => emp?.name === e.name))
      .sort((a, b) => {
        if (a.checkIn && b.checkIn) return new Date(a.checkIn) - new Date(b.checkIn);
        if (a.checkIn) return -1;
        if (b.checkIn) return 1;
        return 0;
      });
  }, [dayData, employees]);

  // ── Push attendance update to cloud ──────────────────────────────────────
  const pushDayData = useCallback(
    async (newRecords) => {
      const str = JSON.stringify(newRecords);
      lastSentDayData.current = str;
      try {
        setIsSyncing(true);
        await setDoc(doc(db, "daily_history", selectedDate), {
          records: newRecords,
          updatedAt: new Date().toISOString(),
        });
        setHistoryCache((prev) => ({ ...prev, [selectedDate]: newRecords }));
      } catch (e) {
        console.error("Push day data error:", e);
        lastSentDayData.current = null;
      } finally { setIsSyncing(false); }
    },
    [selectedDate]
  );

  // ── ACTIONS ───────────────────────────────────────────────────────────────

  const updateAttendance = useCallback(
    (name, fieldOrUpdates, value) => {
      setDayData((prev) => {
        const current = Array.isArray(prev) ? [...prev] : [...attendanceForDate];
        const index = current.findIndex((e) => e.name === name);
        let updated;
        
        const updates = typeof fieldOrUpdates === 'object' ? fieldOrUpdates : { [fieldOrUpdates]: value };

        if (index > -1) {
          updated = current.map((e, i) => (i === index ? { ...e, ...updates } : e));
        } else {
          const emp = employees.find((e) => e.name === name) || { name };
          updated = [...current, { ...emp, checkIn: null, checkOut: null, ...updates }];
        }
        pushDayData(updated);
        return updated;
      });
    },
    [attendanceForDate, employees, pushDayData]
  );

  const handleAddEmployee = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (employees.some((e) => e.name === newName.trim())) { alert("Name موجود بالفعل"); return; }
    setEmployees((prev) => [...prev, { name: newName.trim(), job: newJob.trim(), department: newDept }]);
    setNewName(""); setNewJob("");
  };

  const handleRemoveEmployee = (name) => {
    if (window.confirm(`هل أنت متأكد من حذف ${name}؟`)) {
      setEmployees((prev) => prev.filter((e) => e.name !== name));
    }
  };

  const handleStartEdit = (emp) => {
    setEditingEmployee(emp.name); setEditName(emp.name);
    setEditDept(emp.department); setEditJob(emp.job || "");
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) return;
    setEmployees((prev) =>
      prev.map((e) =>
        e.name === editingEmployee
          ? { name: editName.trim(), job: editJob.trim(), department: editDept }
          : e
      )
    );
    setEditingEmployee(null);
  };

  const handleCancelEdit = () => {
    setEditingEmployee(null); setEditName(""); setEditDept(""); setEditJob("");
  };

  const handleResetDay = () => {
    if (window.confirm("إعادة ضبط جميع الCheck-In لهذا اليوم؟")) {
      const reset = employees.map((emp) => ({ ...emp, checkIn: null, checkOut: null, status: null }));
      setDayData(reset);
      pushDayData(reset);
    }
  };

  const changeDate = (days) => {
    const next = addDays(parseISO(selectedDate), days);
    setSelectedDate(format(next, "yyyy-MM-dd"));
  };

  const handleBackupExport = () => {
    const data = { employees, history: historyCache, version: "2.0", exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `TimeKeeper_Backup_${format(new Date(), "yyyy-MM-dd")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleBackupImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.confirm("استيراد النسخة الاحتياطية سيؤدي إلى استبدال كافة البيانات الحالية. هل أنت متأكد؟")) {
      e.target.value = null; return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.employees) setEmployees(data.employees);
        if (data.history) setHistoryCache(data.history);
        alert("تم استيراد البيانات بنجاح!");
      } catch { alert("ملف غير صالح"); }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  // ── BATCH ACTIONS ────────────────────────────────────────────────────────
  const handleBatchUpdate = (field, value) => {
    if (selectedEmployees.length === 0) return;

    let updates = {};
    if (field === "checkIn") updates = { checkIn: timeStrToISO(batchTime, selectedDate), status: null, checkInStatus: null };
    else if (field === "checkOut") updates = { checkOut: timeStrToISO(batchTime, selectedDate), checkOutStatus: null };
    else if (field === "status") updates = { status: value, checkIn: null, checkOut: null, checkInStatus: null, checkOutStatus: null };
    else updates = { [field]: value };

    setDayData((prev) => {
      const current = Array.isArray(prev) ? [...prev] : [...attendanceForDate];
      const updated = current.map((emp) => {
        if (!selectedEmployees.includes(emp.name)) return emp;
        return { ...emp, ...updates };
      });
      pushDayData(updated);
      return updated;
    });
    setSelectedEmployees([]);
  };

  const handleEditTimeSave = (e) => {
    if (e.key === "Enter" || e.type === "blur") {
      const { name, field, value } = editingTime;
      if (value) {
        const iso = timeStrToISO(value, selectedDate);
        const updates = { [field]: iso };
        if (field === "checkIn") {
           updates.status = null;
           updates.checkInStatus = null;
        }
        if (field === "checkOut") {
           updates.checkOutStatus = null;
        }
        updateAttendance(name, updates);
      }
      setEditingTime(null);
    }
    if (e.key === "Escape") setEditingTime(null);
  };

  // ── DERIVED STATE ─────────────────────────────────────────────────────────
  const filteredAttendance = useMemo(() => {
    return attendanceForDate.filter((emp) => {
      const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter =
        filter === "All" ||
        (filter === "Not Checked-In" && !emp.checkIn && !emp.status) ||
        (filter === "Not Checked-Out" && emp.checkIn && !emp.checkOut) ||
        (filter === "Completed" && emp.checkIn && emp.checkOut) ||
        (filter === "On Leave" && (emp.status === "Leave" || emp.status === "مرضي")) ||
        (filter === "Absent" && emp.status === "غياب") ||
        (filter === "Time Sheet" && emp.status === "time sheet");
      const matchesDept = deptFilter === "All" || emp.department === deptFilter;
      return matchesSearch && matchesFilter && matchesDept;
    });
  }, [attendanceForDate, filter, searchTerm, deptFilter]);

  const stats = useMemo(() => ({
    total: employees.length,
    present: attendanceForDate.filter((e) => e?.checkIn).length,
    completed: attendanceForDate.filter((e) => e?.checkOut).length,
    remaining: attendanceForDate.filter((e) => !e?.checkIn).length,
  }), [attendanceForDate, employees]);

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans transition-colors duration-300">

      {/* ── HEADER & EXPORTS ─────────────────────────────────────────────────────── */}
      <header className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 z-30 flex-shrink-0 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-2">
            
            {/* Title & Sync */}
            <div className="flex items-center justify-between sm:justify-start gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <div className="p-1.5 sm:p-2 bg-gradient-to-tr from-primary-600 to-indigo-500 rounded-xl shadow-lg shadow-primary-500/30">
                  <Briefcase className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight">
                    Time Keeper
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1 sm:gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                  <button onClick={() => window.location.reload()} title="Refresh" className="p-1 sm:p-1.5 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all">
                    <RefreshCcw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 dark:text-slate-400 ${isSyncing ? "animate-spin" : ""}`} />
                  </button>
                  <div className={`w-2 h-2 rounded-full ${isOnline ? (isSyncing ? "bg-blue-500 animate-pulse" : "bg-green-500") : "bg-rose-500 animate-ping"}`} />
                  <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-tighter ml-0.5 hidden sm:inline">
                    {isSyncing ? "Saving..." : isOnline ? "Online" : "Offline"}
                  </span>
                </div>

                <button onClick={toggleTheme} className="p-2 sm:p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all active:scale-95">
                  {theme === "light" ? <Moon className="w-4 h-4 sm:w-5 sm:h-5" /> : <Sun className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>

                <button
                  onClick={() => setIsReadOnly(!isReadOnly)}
                  className={`p-2 sm:p-2.5 rounded-xl transition-all active:scale-95 ${isReadOnly ? "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" : "bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"}`}
                  title={isReadOnly ? "Unlock" : "Lock"}
                >
                  {isReadOnly ? <Lock className="w-4 h-4 sm:w-5 sm:h-5" /> : <Unlock className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>

                {!isReadOnly && (
                  <button onClick={() => setShowSettings(true)} className={`p-2 sm:p-2.5 rounded-xl transition-all border flex-shrink-0 ${showSettings ? "bg-primary-600 border-primary-600 text-white" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-primary-500/50 active:scale-90"}`}>
                    <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Date & Exports Container */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0 w-full sm:w-auto mt-2 sm:mt-0">
              
              {/* Date & Clock */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-300 shrink-0">
                <button onClick={() => changeDate(-1)} className="p-1 sm:p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg active:scale-90 text-slate-600 dark:text-slate-400">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5 px-1">
                  <Calendar className="w-3.5 h-3.5 text-primary-500" />
                  <input
                    type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent font-black text-slate-900 dark:text-white outline-none text-[10px] sm:text-xs border-none p-0 focus:ring-0 w-[85px] sm:w-[95px] text-center"
                  />
                </div>
                <button onClick={() => changeDate(1)} className="p-1 sm:p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg active:scale-90 text-slate-600 dark:text-slate-400">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Exports - Time Sheet, Dash, Daily Report */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => exportIndividualTimeSheets(employees, historyCache, selectedDate)} className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95">
                  <BarChart2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Time Sheet</span>
                </button>
                <button onClick={() => exportDashReport(attendanceForDate, selectedDate)} className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-600 dark:text-amber-500 border border-amber-200 dark:border-amber-500/20 px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95">
                  <Clock className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Dash</span><span className="sm:hidden">Dash</span>
                </button>
                <button onClick={() => exportToExcel(attendanceForDate, selectedDate)} className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95">
                  <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Daily Report</span><span className="sm:hidden">Daily</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      </header>

      {/* ── SETTINGS MODAL ─────────────────────────────────────────────── */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xl z-[100] flex items-end md:items-center justify-center p-0 md:p-4 touch-auto">
          <div className="bg-white dark:bg-slate-900 w-full h-[100dvh] md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-[2.5rem] shadow-2xl flex flex-col animate-in slide-in-from-bottom-full duration-300 transition-colors">
            <div className="px-6 sm:px-8 py-5 sm:py-6 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-xl text-primary-600 dark:text-primary-400">
                  <Users className="w-5 h-5" />
                </div>
                إدارة الEmpsين والبيانات
              </h2>
              <button onClick={() => setShowSettings(false)} className="p-3 sm:p-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl transition-all active:scale-90">
                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-5">
              {/* Backup/Restore */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleBackupExport} className="flex items-center justify-center gap-2 bg-slate-900 text-white py-4 rounded-[1.5rem] font-black text-sm hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-900/10">
                  <Download className="w-5 h-5" /> حفظ نسخة
                </button>
                <div className="relative">
                  <input type="file" accept=".json" onChange={handleBackupImport} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                  <div className="flex items-center justify-center gap-2 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-100 dark:border-blue-800/50 rounded-[1.5rem] text-blue-700 dark:text-blue-400 font-bold hover:bg-blue-100 transition-all">
                    <Upload className="w-5 h-5" /> استعادة
                  </div>
                </div>
              </div>

              {/* Add Employee */}
              <div className="bg-slate-50 dark:bg-black/40 p-5 sm:p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4 uppercase tracking-widest text-center">إضافة Emps جديد</h3>
                <form onSubmit={handleAddEmployee} className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input type="text" placeholder="اسم الEmps..." className="w-full px-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-900 dark:text-white rounded-2xl outline-none focus:border-primary-500 transition-all font-bold placeholder:text-slate-400" value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <input type="text" placeholder="Job..." className="w-full px-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-900 dark:text-white rounded-2xl outline-none focus:border-primary-500 transition-all font-bold placeholder:text-slate-400" value={newJob} onChange={(e) => setNewJob(e.target.value)} />
                  </div>
                  <div className="flex gap-3">
                    <select className="flex-1 px-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-900 dark:text-white rounded-2xl outline-none focus:border-primary-500 transition-all font-bold appearance-none" value={newDept} onChange={(e) => setNewDept(e.target.value)}>
                      {departments.filter((d) => d !== "All").map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <button type="submit" className="bg-primary-600 text-white px-6 rounded-2xl font-black shadow-lg shadow-primary-500/30 active:scale-95 transition-all">إضافة</button>
                  </div>
                </form>
              </div>

              {/* Employee List */}
              <div className="space-y-3">
                <h3 className="text-sm font-black text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-widest px-2">قائمة الEmpsين ({employees.length})</h3>
                <div className="grid grid-cols-1 gap-3">
                  {employees.map((emp) => (
                    <div key={emp.name} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-50 dark:border-slate-700 shadow-sm group hover:border-primary-100 dark:hover:border-primary-900 transition-all">
                      {editingEmployee === emp.name ? (
                        <div className="flex-1 flex flex-col gap-3">
                          <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-4 py-2 border-2 border-primary-500 rounded-xl font-bold outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
                          <div className="flex gap-2">
                            <input type="text" value={editJob} onChange={(e) => setEditJob(e.target.value)} className="flex-1 px-4 py-2 border-2 border-slate-100 dark:border-slate-700 rounded-xl font-bold outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
                            <select value={editDept} onChange={(e) => setEditDept(e.target.value)} className="px-4 py-2 border-2 border-slate-100 dark:border-slate-700 rounded-xl font-bold outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                              {departments.filter((d) => d !== "All").map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button onClick={handleSaveEdit} className="p-3 bg-green-500 text-white rounded-xl shadow-lg shadow-green-500/20 active:scale-90 transition-all"><Save className="w-5 h-5" /></button>
                            <button onClick={handleCancelEdit} className="p-3 bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-300 rounded-xl active:scale-90 transition-all"><X className="w-5 h-5" /></button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center font-black text-slate-500 dark:text-slate-300 text-xs">
                              {emp.name.substring(0, 2)}
                            </div>
                            <div>
                              <span className="font-black text-slate-900 dark:text-white block text-sm">{emp.name}</span>
                              <div className="flex gap-2 mt-0.5">
                                <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-black px-2 py-0.5 rounded-md">{emp.department}</span>
                                <span className="text-[10px] bg-primary-50 text-primary-600 font-black px-2 py-0.5 rounded-md">{emp.job}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleStartEdit(emp)} className="p-2.5 text-blue-500 bg-blue-50 rounded-xl active:scale-90 transition-all"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleRemoveEmployee(emp.name)} className="p-2.5 text-rose-500 bg-rose-50 rounded-xl active:scale-90 transition-all"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ───────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50/50 dark:bg-slate-950/50 scroll-smooth">
        <div className="max-w-7xl mx-auto p-3 sm:p-6 space-y-5 sm:space-y-6">

          {/* Stats - Glassmorphic Aesthetic */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
            {[
              { label: "All", val: stats.total, icon: Users, color: "from-blue-500/90 to-blue-600/90", shadow: "shadow-blue-500/20" },
              { label: "Present", val: stats.present, icon: UserCheck, color: "from-emerald-500/90 to-emerald-600/90", shadow: "shadow-emerald-500/20" },
              { label: "Check-Out", val: stats.completed, icon: CheckCircle2, color: "from-indigo-500/90 to-indigo-600/90", shadow: "shadow-indigo-500/20" },
              { label: "Absent", val: stats.total - stats.present, icon: UserMinus, color: "from-rose-500/90 to-rose-600/90", shadow: "shadow-rose-500/20" },
            ].map((s, i) => (
              <div key={i} className={`bg-gradient-to-br ${s.color} backdrop-blur-xl border border-white/20 dark:border-white/10 p-4 sm:p-6 rounded-3xl shadow-xl ${s.shadow} flex flex-col justify-between h-32 sm:h-44 relative overflow-hidden group`}>
                <div className="bg-white/20 w-10 h-10 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center backdrop-blur-md">
                  <s.icon className="w-5 h-5 sm:w-7 sm:h-7 text-white drop-shadow-md" />
                </div>
                <div className="relative z-10 mt-3 sm:mt-2">
                  <p className="text-white/90 text-[10px] sm:text-xs font-black uppercase tracking-[0.15em] leading-none mb-1.5 sm:mb-2">{s.label}</p>
                  <p className="text-3xl sm:text-5xl font-black text-white tabular-nums leading-none drop-shadow-lg">{s.val}</p>
                </div>
                <s.icon className="absolute -right-4 -bottom-4 w-24 h-24 sm:w-36 sm:h-36 text-white/10 group-hover:rotate-12 group-hover:scale-110 transition-transform duration-500" />
              </div>
            ))}
          </div>

          {/* Controls Bar: Search + Filters */}
          <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between bg-white dark:bg-slate-900 p-2 sm:p-3 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm">
            
            {/* Search */}
            <div className="relative group w-full xl:w-96 shrink-0">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-slate-100 dark:bg-slate-800 rounded-xl group-focus-within:bg-primary-50 dark:group-focus-within:bg-primary-900/30 transition-colors">
                <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-primary-500 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="ابحث عن Emps..."
                className="w-full pl-14 pr-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-none rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/50 transition-all text-sm sm:text-base font-black text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full xl:w-auto overflow-hidden">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full xl:w-auto">
                {departments.map((dept) => (
                  <button key={dept} onClick={() => setDeptFilter(dept)}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 border-2 ${deptFilter === dept ? "bg-slate-900 dark:bg-white border-slate-900 dark:border-white text-white dark:text-slate-900 shadow-md" : "bg-transparent border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                    {dept}
                  </button>
                ))}
              </div>
              <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 hidden sm:block shrink-0" />
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full xl:w-auto">
                {[
                  { id: "All", label: "All", icon: Users },
                  { id: "Not Checked-In", label: "انتظار", icon: Clock },
                  { id: "Not Checked-Out", label: "موجود", icon: UserCheck },
                  { id: "Completed", label: "Check-Out", icon: CheckCircle2 },
                  { id: "On Leave", label: "Leave", icon: Calendar },
                  { id: "Absent", label: "غياب", icon: UserMinus },
                ].map((tab) => (
                  <button key={tab.id} onClick={() => setFilter(tab.id)}
                    className={`flex-shrink-0 px-3 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 active:scale-95 border-2 ${filter === tab.id ? "bg-primary-50 dark:bg-primary-900/20 border-primary-500 text-primary-600 dark:text-primary-400 shadow-sm" : "bg-transparent border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
                
                {/* Reset button */}
                <button onClick={handleResetDay} disabled={isReadOnly}
                  className="shrink-0 p-2.5 sm:px-3 bg-rose-50 dark:bg-rose-900/20 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-xl active:scale-95 transition-all flex items-center gap-1.5 ml-1"
                  title="Reset Day">
                  <RefreshCcw className="w-4 h-4" />
                  <span className="text-xs font-black hidden sm:inline">Reset</span>
                </button>
              </div>
            </div>
          </div>

          {/* ── BATCH ACTION BAR ──────────────────────────────────────── */}
          {!isReadOnly && selectedEmployees.length > 0 && (
            <div className="sticky top-20 z-40 bg-primary-600 text-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl shadow-xl shadow-primary-500/30 flex flex-col gap-3 animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-black">{selectedEmployees.length}</span>
                  <span className="text-sm font-bold">Batch Process</span>
                </div>
                <button onClick={() => setSelectedEmployees([])} className="p-1.5 bg-black/20 rounded-lg active:scale-95">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Batch time picker */}
              <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-3 py-2">
                <AlarmClock className="w-4 h-4 shrink-0" />
                <span className="text-xs font-black">Time:</span>
                <input
                  type="time"
                  value={batchTime}
                  onChange={(e) => setBatchTime(e.target.value)}
                  className="flex-1 bg-transparent font-black text-sm outline-none border-none text-white min-w-0"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => handleBatchUpdate("checkIn")} className="flex-1 bg-white text-primary-600 py-2 px-3 rounded-xl text-xs font-black hover:bg-primary-50 active:scale-95 min-w-[70px]">
                  ✓ Check-In
                </button>
                <button onClick={() => handleBatchUpdate("checkOut")} className="flex-1 bg-white/10 text-white border border-white/20 py-2 px-3 rounded-xl text-xs font-black hover:bg-white/20 active:scale-95 min-w-[70px]">
                  ↩ Check-Out
                </button>
                <select onChange={(e) => { if(e.target.value) handleBatchUpdate("status", e.target.value); e.target.value=""; }} className="flex-1 bg-amber-500 text-white py-2 px-3 rounded-xl text-xs font-black hover:bg-amber-600 active:scale-95 outline-none min-w-[90px]">
                  <option value="">Status for all...</option>
                  {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* ── EMPLOYEE LIST ─────────────────────────────────────────── */}
          <div className="space-y-3">
            {/* List header */}
            <div className="sticky top-0 z-10 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md py-2">
              <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm" dir="rtl">
                <div className="flex items-center gap-3">
                  {!isReadOnly && (
                    <button
                      onClick={() => {
                        if (selectedEmployees.length === filteredAttendance.length && filteredAttendance.length > 0) {
                          setSelectedEmployees([]);
                        } else {
                          setSelectedEmployees(filteredAttendance.map((e) => e.name));
                        }
                      }}
                      className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${selectedEmployees.length === filteredAttendance.length && filteredAttendance.length > 0 ? "bg-primary-600 border-primary-600 text-white" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`}
                    >
                      {selectedEmployees.length === filteredAttendance.length && filteredAttendance.length > 0 && <CheckCircle2 className="w-4 h-4" />}
                    </button>
                  )}
                  <span className="font-black text-slate-900 dark:text-white text-sm">تحديد All ({filteredAttendance.length})</span>
                </div>
                <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full">{filteredAttendance.length} Emps</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
              {filteredAttendance.length > 0 ? (
                filteredAttendance.map((emp) => {
                  const isSelected = selectedEmployees.includes(emp.name);
                  const statusColor = emp.status ? "bg-amber-500" : emp.checkOut ? "bg-emerald-500" : emp.checkIn ? "bg-blue-500" : "bg-slate-200 dark:bg-slate-700";

                  return (
                    <div
                      key={emp.name}
                      dir="rtl"
                      onClick={() => {
                        if (isReadOnly) return;
                        setSelectedEmployees((prev) =>
                          prev.includes(emp.name) ? prev.filter((n) => n !== emp.name) : [...prev, emp.name]
                        );
                      }}
                      className={`rounded-3xl transition-all border-2 flex flex-col relative overflow-hidden group ${isSelected ? "bg-primary-50/50 dark:bg-primary-900/20 border-primary-500 shadow-md ring-2 ring-primary-500/20" : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-primary-200 dark:hover:border-primary-900"} ${isReadOnly ? "cursor-default" : "cursor-pointer active:scale-[0.98]"}`}
                    >
                      {/* Top color indicator stripe */}
                      <div className={`absolute top-0 left-0 right-0 h-1.5 ${statusColor}`} />

                      <div className="p-4 sm:p-5 flex-1 flex flex-col pt-5 sm:pt-6">
                        {/* Header: Avatar, Name, Job, Action */}
                        <div className="flex items-start gap-3 mb-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-sm ${emp.checkOut ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : emp.checkIn ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : emp.status ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
                            {emp.name.substring(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-black text-base sm:text-lg text-slate-900 dark:text-white truncate">{emp.name}</h3>
                              {emp.checkIn && !emp.checkOut && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                              <span className="text-[10px] sm:text-xs font-black text-primary-600 bg-primary-50 dark:bg-primary-900/30 dark:text-primary-400 px-2 py-0.5 rounded-md truncate">{emp.job}</span>
                              <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 truncate">{emp.department}</span>
                            </div>
                          </div>
                          <div onClick={(e) => e.stopPropagation()} className="shrink-0 -mr-2 -mt-2">
                            {renderActionButton(emp, isReadOnly, updateAttendance, setStatusModalEmployee)}
                          </div>
                        </div>

                        {/* Times & Hours - Unified Grid */}
                        <div className="grid grid-cols-3 gap-2 sm:gap-3 bg-slate-50 dark:bg-slate-800/50 p-2 sm:p-3 rounded-2xl mt-auto">
                          
                          {/* Check-In Block */}
                          <div className="flex flex-col items-center justify-center text-center relative border-l border-slate-200 dark:border-slate-700/50"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isReadOnly) return;
                              setEditingTime({ name: emp.name, field: "checkIn", value: emp.checkIn ? format(parseISO(emp.checkIn), "HH:mm") : format(new Date(), "HH:mm") });
                            }}>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">حضور</p>
                            {editingTime?.name === emp.name && editingTime?.field === "checkIn" ? (
                              <div className="flex flex-col items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <input type="time" value={editingTime.value} onChange={(e) => setEditingTime({ ...editingTime, value: e.target.value })} onBlur={handleEditTimeSave} onKeyDown={handleEditTimeSave} autoFocus className="text-xs font-black bg-white dark:bg-slate-800 border-2 border-primary-500 rounded p-1 outline-none w-20 text-center" />
                                {(emp.checkIn || emp.checkInStatus) && (
                                  <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); updateAttendance(emp.name, { checkIn: null, checkInStatus: null }); setEditingTime(null); }} className="p-1 bg-rose-100 text-rose-600 rounded hover:bg-rose-200 w-full flex justify-center mt-1" title="Cancel">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              emp.checkInStatus ? <span className="text-[10px] text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded font-bold">{emp.checkInStatus}</span> : <p className={`text-xs sm:text-sm font-black tabular-nums ${emp.checkIn ? "text-blue-600 dark:text-blue-400" : "text-slate-300 dark:text-slate-600"}`}>{formatTime(emp.checkIn)}</p>
                            )}
                          </div>

                          {/* Check-Out Block */}
                          <div className="flex flex-col items-center justify-center text-center relative border-l border-slate-200 dark:border-slate-700/50"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isReadOnly) return;
                              setEditingTime({ name: emp.name, field: "checkOut", value: emp.checkOut ? format(parseISO(emp.checkOut), "HH:mm") : format(new Date(), "HH:mm") });
                            }}>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">انصراف</p>
                            {editingTime?.name === emp.name && editingTime?.field === "checkOut" ? (
                              <div className="flex flex-col items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <input type="time" value={editingTime.value} onChange={(e) => setEditingTime({ ...editingTime, value: e.target.value })} onBlur={handleEditTimeSave} onKeyDown={handleEditTimeSave} autoFocus className="text-xs font-black bg-white dark:bg-slate-800 border-2 border-primary-500 rounded p-1 outline-none w-20 text-center" />
                                {(emp.checkOut || emp.checkOutStatus) && (
                                  <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); updateAttendance(emp.name, { checkOut: null, checkOutStatus: null }); setEditingTime(null); }} className="p-1 bg-rose-100 text-rose-600 rounded hover:bg-rose-200 w-full flex justify-center mt-1" title="Cancel">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              emp.checkOutStatus ? <span className="text-[10px] text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded font-bold">{emp.checkOutStatus}</span> : <p className={`text-xs sm:text-sm font-black tabular-nums ${emp.checkOut ? "text-emerald-600 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600"}`}>{formatTime(emp.checkOut)}</p>
                            )}
                          </div>

                          {/* Hours Block */}
                          <div className="flex flex-col items-center justify-center text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">ساعات</p>
                            <p className={`text-xs sm:text-sm font-black tabular-nums ${emp.checkOut ? "text-slate-900 dark:text-white" : "text-slate-300 dark:text-slate-600"}`}>
                              {calculateWorkedHours(emp.checkIn, emp.checkOut)}
                            </p>
                          </div>

                        </div>

                        {/* Status badge if set manually */}
                        {emp.status && (
                          <div className="mt-3 flex justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); if (isReadOnly) return; if (confirm("Cancel الStatus؟")) updateAttendance(emp.name, "status", null); }}
                              className="px-3 py-1.5 text-[10px] font-black bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 rounded-xl hover:bg-amber-200 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm"
                            >
                              <span>{emp.status}</span>
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-16 flex flex-col items-center text-center px-10">
                  <div className="w-24 h-24 bg-slate-100 dark:bg-slate-900 rounded-[2.5rem] flex items-center justify-center mb-4">
                    <Search className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">القائمة فارغة</h3>
                  <p className="text-slate-400 font-bold text-sm">لم نجد أي Emps يطابق بحثك</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── EXPORTS MOVED TO HEADER ─────────────────────────────────────────────────────── */}

      {/* ── DAILY SUMMARY MODAL ─────────────────────────────────────────── */}
      {showSummary && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white dark:bg-slate-900 w-full h-[100dvh] md:h-auto md:max-w-md md:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full duration-300 flex flex-col">
            <div className="p-6 pb-4 flex justify-between items-start border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">تقرير اليوم</h3>
                <p className="text-slate-500 font-bold text-sm">{format(parseISO(selectedDate), "EEEE, MMMM do")}</p>
              </div>
              <button onClick={() => setShowSummary(false)} className="p-3 bg-slate-100/50 hover:bg-slate-100 rounded-2xl transition-colors active:scale-90">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-600 p-5 rounded-[2rem] text-white shadow-xl shadow-blue-500/20">
                  <p className="text-blue-100 text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">حضر</p>
                  <p className="text-4xl font-black">{stats.present}</p>
                </div>
                <div className="bg-amber-500 p-5 rounded-[2rem] text-white shadow-xl shadow-amber-500/20">
                  <p className="text-amber-100 text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">غادر</p>
                  <p className="text-4xl font-black">{stats.completed}</p>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { label: "العدد Allي", val: stats.total, icon: Users, color: "text-slate-400", bg: "bg-slate-50 dark:bg-slate-800" },
                  { label: "نسبة الCheck-In", val: `${Math.round((stats.present / stats.total) * 100)}%`, icon: CheckCircle2, color: "text-primary-500", bg: "bg-primary-50 dark:bg-primary-900/20" },
                  { label: "Working", val: stats.present - stats.completed, icon: Clock, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-900/20" },
                ].map((item, i) => (
                  <div key={i} className={`flex items-center justify-between p-4 ${item.bg} rounded-[1.5rem] border border-slate-100 dark:border-slate-800`}>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white dark:bg-slate-900 rounded-xl shadow-sm">
                        <item.icon className={`w-4 h-4 ${item.color}`} />
                      </div>
                      <span className="font-black text-sm text-slate-600 dark:text-slate-300">{item.label}</span>
                    </div>
                    <span className="font-black text-slate-900 dark:text-white text-lg">{item.val}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 flex flex-col gap-3 pb-6">
                <button
                  onClick={() => {
                    const msg = `📊 *تقرير الCheck-In اليومي* - ${selectedDate}\n-------------------------\n👤 Allي: ${stats.total}\n✅ Present: ${stats.present}\n🚪 غادر: ${stats.completed}\n❌ غائب: ${stats.total - stats.present}\n⏳ Working: ${stats.present - stats.completed}\n-------------------------\nتم التوليد بواسطة *Time Keeper*`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white w-full py-4 rounded-[1.5rem] shadow-xl shadow-green-500/30 font-black flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Share2 className="w-5 h-5" /> مشاركة واتساب
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`📊 تقرير الCheck-In - ${selectedDate}\nAllي: ${stats.total} | Present: ${stats.present} | غادر: ${stats.completed}`);
                    alert("تم النسخ بنجاح");
                  }}
                  className="text-slate-400 font-black text-sm py-2 active:scale-95 hover:text-slate-600 transition-colors"
                >
                  نسخ النص
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STATUS MODAL ─────────────────────────────────────────────────── */}
      {statusModalEmployee && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => { setStatusModalEmployee(null); setCustomStatus(""); }}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 w-full max-w-xs shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4 text-center">Add Status for {statusModalEmployee}</h3>
            
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4 gap-1">
              <button onClick={() => setStatusModalScope('checkIn')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${statusModalScope === 'checkIn' ? 'bg-white dark:bg-slate-700 shadow text-primary-600 dark:text-primary-400' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>Check-In</button>
              <button onClick={() => setStatusModalScope('checkOut')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${statusModalScope === 'checkOut' ? 'bg-white dark:bg-slate-700 shadow text-primary-600 dark:text-primary-400' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>Check-Out</button>
              <button onClick={() => setStatusModalScope('whole_day')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${statusModalScope === 'whole_day' ? 'bg-white dark:bg-slate-700 shadow text-primary-600 dark:text-primary-400' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>Whole Day</button>
            </div>

            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
              {STATUS_OPTIONS.map(opt => (
                <button key={opt} onClick={() => {
                  let updates = {};
                  if (statusModalScope === 'checkIn') updates = { checkInStatus: opt, checkIn: null, status: null };
                  if (statusModalScope === 'checkOut') updates = { checkOutStatus: opt, checkOut: null, status: null };
                  if (statusModalScope === 'whole_day') updates = { status: opt, checkIn: null, checkOut: null, checkInStatus: null, checkOutStatus: null };
                  updateAttendance(statusModalEmployee, updates);
                  setStatusModalEmployee(null);
                  setCustomStatus("");
                }} className="w-full text-right px-4 py-3 rounded-xl bg-slate-50 hover:bg-primary-50 dark:bg-slate-800 dark:hover:bg-primary-900/30 font-bold text-sm text-slate-700 dark:text-slate-200 transition-colors border border-transparent hover:border-primary-200 dark:hover:border-primary-800">
                  {opt}
                </button>
              ))}
            </div>
            
            <div className="mt-3 flex gap-2">
              <input 
                type="text" 
                placeholder="اكتب حالة مخصصة..." 
                value={customStatus} 
                onChange={(e) => setCustomStatus(e.target.value)}
                className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm font-bold border-2 border-transparent outline-none focus:border-primary-500 text-slate-900 dark:text-white"
              />
              <button 
                onClick={() => {
                  if(!customStatus.trim()) return;
                  let updates = {};
                  if (statusModalScope === 'checkIn') updates = { checkInStatus: customStatus.trim(), checkIn: null, status: null };
                  if (statusModalScope === 'checkOut') updates = { checkOutStatus: customStatus.trim(), checkOut: null, status: null };
                  if (statusModalScope === 'whole_day') updates = { status: customStatus.trim(), checkIn: null, checkOut: null, checkInStatus: null, checkOutStatus: null };
                  updateAttendance(statusModalEmployee, updates);
                  setStatusModalEmployee(null);
                  setCustomStatus("");
                }}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 rounded-xl font-bold text-sm active:scale-95 transition-all"
              >
                إضافة
              </button>
            </div>

            <button onClick={() => { setStatusModalEmployee(null); setCustomStatus(""); }} className="w-full mt-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black py-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── HELP MODAL ─────────────────────────────────────────────────── */}
      {showHelp && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[200] flex items-center justify-center p-6" onClick={() => setShowHelp(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-8 max-w-md w-full shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-[2rem] flex items-center justify-center mb-5 mx-auto">
              <Briefcase className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-center text-slate-900 dark:text-white mb-5">How to Use</h2>
            <div className="space-y-5">
              {[
                { num: 1, text: "اضغط على زر + لتسجيل Check-In الEmps، وزر الإشارة الحمراء للCheck-Out." },
                { num: 2, text: "اضغط على أي وقت (حتى --:--) لتعديله يدوياً." },
                { num: 3, text: "استخدم زر القائمة لاختيار Status مخصصة للCheck-In أو الCheck-Out أو اليوم بالكامل." },
                { num: 4, text: "حدد Empsين وستظهر لوحة العمليات الجماعية مع اختيار الوقت." },
                { num: 5, text: "Daily: Grouped report. Time Sheet: Flat list. Monthly: Per-employee sheet." },
              ].map((step) => (
                <div key={step.num} className="flex gap-3 text-right" dir="rtl">
                  <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-xs text-slate-500 dark:text-slate-400 shrink-0">{step.num}</div>
                  <p className="text-slate-600 dark:text-slate-300 font-bold text-sm leading-relaxed">{step.text}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setShowHelp(false)} className="w-full mt-8 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black py-4 rounded-2xl active:scale-95 transition-all text-sm uppercase tracking-widest">Got it</button>
          </div>
        </div>
      )}

      <footer className="py-4 text-center bg-slate-50/50 dark:bg-black/20 flex-shrink-0 border-t border-slate-100 dark:border-slate-800/50">
        <p className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]">
          Developed By <span className="text-primary-500 dark:text-primary-400">Rafat Hanna</span>
        </p>
      </footer>
    </div>
  );
}

// ─── ACTION BUTTON RENDERER ───────────────────────────────────────────────────
function renderActionButton(emp, isReadOnly, updateAttendance, setStatusModalEmployee) {
  if (isReadOnly) return null;

  return (
    <div className="flex flex-col gap-2 min-w-[100px]">
       {/* Main Action Button */}
       {(!emp.checkIn && !emp.status && !emp.checkInStatus) && (
          <button
            onClick={(e) => { e.stopPropagation(); updateAttendance(emp.name, { checkIn: new Date().toISOString(), status: null, checkInStatus: null }); }}
            className="w-full h-10 bg-primary-600 text-white rounded-xl shadow-lg shadow-primary-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 font-black text-xs"
          >
            <Plus className="w-4 h-4" />
            حضور
          </button>
       )}
       {((emp.checkIn || emp.checkInStatus) && !emp.checkOut && !emp.status && !emp.checkOutStatus) && (
          <button
            onClick={(e) => { e.stopPropagation(); updateAttendance(emp.name, { checkOut: new Date().toISOString(), checkOutStatus: null }); }}
            className="w-full h-10 bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 font-black text-xs"
          >
            <UserMinus className="w-4 h-4" />
            انصراف
          </button>
       )}
       {(emp.checkOut || emp.checkOutStatus) && !emp.status && (
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm("Cancel الCheck-Out؟")) updateAttendance(emp.name, { checkOut: null, checkOutStatus: null }); }}
            className="w-full h-10 bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 font-black text-xs"
          >
            <CheckCircle2 className="w-4 h-4" />
            مكتمل
          </button>
       )}
       
       {/* Status Menu Button */}
       <button
         onClick={(e) => { e.stopPropagation(); setStatusModalEmployee(emp.name); }}
         className="w-full h-9 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-xl border border-amber-200 dark:border-amber-800/50 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 hover:bg-amber-200 dark:hover:bg-amber-800/50 text-xs font-black"
       >
         Status
       </button>
    </div>
  );
}

export default App;
