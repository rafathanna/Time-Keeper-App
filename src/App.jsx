import React, { useState, useEffect, useMemo, useRef } from "react";
import { db } from "./firebase";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
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
  Layers,
  Edit2,
  Save,
  Settings,
  X,
  FileText,
  Share2,
  Moon,
  Sun,
  Database,
  Upload,
  Lock,
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
} from "./utils";

function App() {
  // Data State
  const [employees, setEmployees] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + "_employees_v2");
    return saved ? JSON.parse(saved) : DEFAULT_EMPLOYEES;
  });

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + "_history_v2");
    return saved ? JSON.parse(saved) : {};
  });

  // UI State
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [filter, setFilter] = useState("All");
  const [deptFilter, setDeptFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState("General");
  const [newJob, setNewJob] = useState("");
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editJob, setEditJob] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [showSummary, setShowSummary] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [customStatusEmployee, setCustomStatusEmployee] = useState(null);
  const [customStatusValue, setCustomStatusValue] = useState("");
  const [editingTime, setEditingTime] = useState(null); // { name, field, value }
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isCloudLoaded, setIsCloudLoaded] = useState(false);
  const lastCloudData = useRef(null);

  // Stable stringify to compare data regardless of key order
  const getStableData = (emps, hist) => {
    try {
      // Sort history keys (dates) and employee lists to ensure stable comparison
      const sortedHist = {};
      if (hist) {
        Object.keys(hist)
          .sort()
          .forEach((key) => {
            sortedHist[key] = hist[key];
          });
      }
      return JSON.stringify({ emps, hist: sortedHist });
    } catch (e) {
      return "";
    }
  };

  // Theme State
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") || "light";
    }
    return "light";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const departments = useMemo(() => {
    const depts = new Set(employees.map((e) => e.department));
    return ["All", ...Array.from(depts).sort()];
  }, [employees]);

  // Update clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 3. Local Persistence (Optional backup)
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY + "_employees_v2",
      JSON.stringify(employees),
    );
  }, [employees]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + "_history_v2", JSON.stringify(history));
  }, [history]);

  // 4. Data Derivation (Memoized)
  const attendanceForDate = useMemo(() => {
    if (!employees || !Array.isArray(employees)) return [];

    const data = (history && history[selectedDate]) || [];
    const updatedData = Array.isArray(data) ? [...data] : [];

    employees.forEach((emp) => {
      if (!emp || !emp.name) return;
      const exists = updatedData.some((e) => e && e.name === emp.name);
      if (!exists) {
        updatedData.push({ ...emp, checkIn: null, checkOut: null });
      } else {
        const idx = updatedData.findIndex((e) => e && e.name === emp.name);
        updatedData[idx] = {
          ...updatedData[idx],
          department: emp.department,
          job: emp.job,
        };
      }
    });

    return updatedData.filter(
      (e) => e && employees.some((emp) => emp && emp.name === e.name),
    );
  }, [history, selectedDate, employees]);

  useEffect(() => {
    setIsSyncing(true);
    const unsubscribe = onSnapshot(
      doc(db, "data", "master"),
      (docSnap) => {
        if (docSnap.exists()) {
          const cloudData = docSnap.data();
          const stableCloud = getStableData(
            cloudData.employees,
            cloudData.history,
          );

          // Update local state ONLY if cloud data is genuinely different
          if (stableCloud !== lastCloudData.current) {
            lastCloudData.current = stableCloud;
            if (cloudData.employees) setEmployees(cloudData.employees);
            if (cloudData.history) setHistory(cloudData.history);
          }
        }
        setIsCloudLoaded(true);
        setIsSyncing(false);
      },
      (error) => {
        console.error("Firestore Listen Error:", error);
        setIsSyncing(false);
      },
    );
    return () => unsubscribe();
  }, []);

  // Sync LOCAL to CLOUD (with debounce and check)
  useEffect(() => {
    if (!isCloudLoaded) return;

    const stableLocal = getStableData(employees, history);

    // Only push if the local data has changed compared to what we last saw from cloud
    if (stableLocal !== lastCloudData.current) {
      const timer = setTimeout(async () => {
        try {
          setIsSyncing(true);
          // Set lastCloudData first to prevent loop if onSnapshot fires before setDoc completes
          lastCloudData.current = stableLocal;
          await setDoc(doc(db, "data", "master"), {
            employees,
            history,
            lastUpdated: new Date().toISOString(),
          });
        } catch (err) {
          console.error("Firestore Save Error:", err);
          // Revert lastCloudData on error to allow retry
          lastCloudData.current = null;
        } finally {
          setIsSyncing(false);
        }
      }, 2000); // 2 second debounce for stability
      return () => clearTimeout(timer);
    }
  }, [employees, history, isCloudLoaded]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const filteredAttendance = useMemo(() => {
    return attendanceForDate.filter((emp) => {
      const matchesSearch = emp.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesFilter =
        filter === "All" ||
        (filter === "Not Checked-In" && !emp.checkIn && !emp.status) ||
        (filter === "Not Checked-Out" && emp.checkIn && !emp.checkOut) ||
        (filter === "Completed" && emp.checkIn && emp.checkOut) ||
        (filter === "On Leave" &&
          (emp.status === "إجازة" || emp.status === "مرضي")) ||
        (filter === "Absent" && emp.status === "غياب") ||
        (filter === "Time Sheet" && emp.status === "time sheet");
      const matchesDept = deptFilter === "All" || emp.department === deptFilter;

      return matchesSearch && matchesFilter && matchesDept;
    });
  }, [attendanceForDate, filter, searchTerm, deptFilter]);

  const stats = useMemo(() => {
    const safeAttendance = Array.isArray(attendanceForDate)
      ? attendanceForDate
      : [];
    const total = Array.isArray(employees) ? employees.length : 0;

    return {
      total: total,
      present: safeAttendance.filter((e) => e && e.checkIn).length,
      completed: safeAttendance.filter((e) => e && e.checkOut).length,
      remaining: safeAttendance.filter((e) => e && !e.checkIn).length,
    };
  }, [attendanceForDate, employees]);

  // Actions
  const updateAttendance = (name, field, value) => {
    setHistory((prev) => {
      const currentDayData = [...(prev[selectedDate] || attendanceForDate)];
      const index = currentDayData.findIndex((e) => e.name === name);

      if (index > -1) {
        currentDayData[index] = { ...currentDayData[index], [field]: value };
      }

      return { ...prev, [selectedDate]: currentDayData };
    });
  };

  const handleAddEmployee = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (employees.some((e) => e.name === newName.trim())) {
      alert("Name already exists");
      return;
    }
    setEmployees((prev) => [
      ...prev,
      { name: newName.trim(), job: newJob.trim(), department: newDept },
    ]);
    setNewName("");
    setNewJob("");
  };

  const handleRemoveEmployee = (name) => {
    if (window.confirm(`Are you sure you want to remove ${name}?`)) {
      setEmployees((prev) => prev.filter((e) => e.name !== name));
    }
  };

  const handleStartEdit = (emp) => {
    setEditingEmployee(emp.name);
    setEditName(emp.name);
    setEditDept(emp.department);
    setEditJob(emp.job || "");
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) return;

    setEmployees((prev) =>
      prev.map((e) =>
        e.name === editingEmployee
          ? { name: editName.trim(), job: editJob.trim(), department: editDept }
          : e,
      ),
    );

    // Update history with new name
    setHistory((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((date) => {
        updated[date] = updated[date].map((e) =>
          e.name === editingEmployee
            ? {
                ...e,
                name: editName.trim(),
                job: editJob.trim(),
                department: editDept,
              }
            : e,
        );
      });
      return updated;
    });

    setEditingEmployee(null);
  };

  const handleCancelEdit = () => {
    setEditingEmployee(null);
    setEditName("");
    setEditDept("");
    setEditJob("");
  };

  const handleResetDay = () => {
    if (window.confirm("Reset all check-ins for the selected date?")) {
      setHistory((prev) => ({
        ...prev,
        [selectedDate]: employees.map((emp) => ({
          ...emp,
          checkIn: null,
          checkOut: null,
        })),
      }));
    }
  };

  const changeDate = (days) => {
    const current = parseISO(selectedDate);
    const next = addDays(current, days);
    setSelectedDate(format(next, "yyyy-MM-dd"));
  };

  const handleBackupExport = () => {
    const backupData = {
      employees,
      history,
      version: "1.0",
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: "application/json",
    });
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

    if (
      !window.confirm(
        "استيراد النسخة الاحتياطية سيؤدي إلى استبدال كافة البيانات الحالية. هل أنت متأكد؟",
      )
    ) {
      e.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.employees && data.history) {
          setEmployees(data.employees);
          setHistory(data.history);
          alert("تم استيراد البيانات بنجاح!");
        } else {
          alert("ملف غير صالح");
        }
      } catch (err) {
        alert("خطأ في قراءة ملف النسخة الاحتياطية");
      }
    };
    reader.readAsText(file);
    e.target.value = null; // Reset input
  };

  // --- BATCH ACTIONS ---
  const handleBatchUpdate = (field, value) => {
    if (selectedEmployees.length === 0) return;

    setHistory((prev) => {
      const currentDayData = [...(prev[selectedDate] || attendanceForDate)];

      selectedEmployees.forEach((name) => {
        const index = currentDayData.findIndex((e) => e.name === name);
        if (index > -1) {
          if (field === "status") {
            currentDayData[index] = {
              ...currentDayData[index],
              status: value,
              checkIn: null,
              checkOut: null,
            };
          } else if (field === "checkIn") {
            currentDayData[index] = {
              ...currentDayData[index],
              checkIn: value,
              status: null,
            };
          } else {
            currentDayData[index] = {
              ...currentDayData[index],
              [field]: value,
            };
          }
        }
      });

      return { ...prev, [selectedDate]: currentDayData };
    });
    setSelectedEmployees([]);
  };

  const handleEditTimeSave = (e) => {
    if (e.key === "Enter" || e.type === "blur") {
      const { name, field, value } = editingTime;
      // Convert time string "HH:mm" back to ISO date
      if (value) {
        const [hours, minutes] = value.split(":");
        const newDate = parseISO(selectedDate);
        newDate.setHours(parseInt(hours), parseInt(minutes));
        updateAttendance(name, field, newDate.toISOString());
      }
      setEditingTime(null);
    }
  };

  return (
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans transition-colors duration-300">
      {/* --- PREMIUM APP HEADER --- */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-30 flex-shrink-0 transition-colors duration-300">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <div className="p-1.5 sm:p-2 bg-primary-600 rounded-xl shadow-lg shadow-primary-500/30">
                <Briefcase className="w-3.5 h-3.5 sm:w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xs sm:text-base font-black text-slate-900 dark:text-white leading-tight">
                  Time Keeper
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {/* CLOUD SYNC INDICATOR */}
              <div className="flex items-center gap-1 sm:gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                <button
                  onClick={() => {
                    lastCloudData.current = null;
                    setIsCloudLoaded(false);
                    window.location.reload();
                  }}
                  title="تحديث إجباري"
                  className="p-1 sm:p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                >
                  <RefreshCcw
                    className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 ${isSyncing ? "animate-spin" : ""}`}
                  />
                </button>
                <div
                  className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isOnline ? (isSyncing ? "bg-blue-500 animate-pulse" : "bg-green-500") : "bg-rose-500 animate-ping"}`}
                />
                <span className="text-[8px] sm:text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-tighter ml-0.5 hidden sm:inline">
                  {isSyncing ? "مزامنة" : isOnline ? "متصل" : "أوفلاين"}
                </span>
              </div>

              <button
                onClick={toggleTheme}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
              >
                {theme === "light" ? (
                  <Moon className="w-5 h-5" />
                ) : (
                  <Sun className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className={`flex items-center gap-2 p-2.5 sm:px-3.5 sm:py-2.5 rounded-xl transition-all border shadow-sm flex-shrink-0 ${showSettings ? "bg-primary-600 border-primary-600 text-white" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-primary-500/50 active:scale-90"}`}
              >
                <Settings className="w-5 h-5" />
                <span className="text-xs font-black hidden sm:inline">
                  إدارة الموظفين
                </span>
              </button>
              <button
                onClick={() => setShowHelp(true)}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 dark:hover:text-primary-400 transition-all active:scale-95 flex-shrink-0"
              >
                <X className="w-5 h-5 rotate-45" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* --- SUB-HEADER: DATE & CLOCK --- */}
      <div className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 px-4 py-2 sm:py-3 z-20 flex-shrink-0 transition-colors duration-300">
        <div className="max-w-4xl mx-auto flex flex-col xs:flex-row items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm w-full xs:w-auto justify-between sm:justify-start transition-colors duration-300">
            <button
              onClick={() => changeDate(-1)}
              className="p-1.5 sm:p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg sm:rounded-xl active:scale-90 text-slate-600 dark:text-slate-300"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 px-1">
              <Calendar className="w-3.5 h-3.5 sm:w-4 h-4 text-primary-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent font-black text-slate-900 dark:text-white outline-none text-xs sm:text-sm border-none p-0 focus:ring-0 w-24 xs:w-auto"
              />
            </div>
            <button
              onClick={() => changeDate(1)}
              className="p-1.5 sm:p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg sm:rounded-xl active:scale-90 text-slate-600 dark:text-slate-300"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 h-5" />
            </button>
          </div>

          <div className="bg-slate-900 dark:bg-slate-800 text-white px-3 py-1.5 sm:px-4 sm:py-2.5 rounded-xl sm:rounded-2xl flex items-center justify-center gap-2 sm:gap-3 shadow-xl shadow-slate-900/10 dark:shadow-black/20 w-fit xs:w-auto transition-colors duration-300">
            <Clock className="w-3.5 h-3.5 sm:w-4 h-4 text-primary-400" />
            <span className="font-black text-[10px] sm:text-sm tabular-nums tracking-tight">
              {format(currentTime, "hh:mm:ss a")}
            </span>
          </div>
        </div>
      </div>

      {/* Settings Modal (Manage Employees) */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xl z-[100] flex items-end md:items-center justify-center p-0 md:p-4 touch-auto">
          <div className="bg-white dark:bg-slate-900 w-full h-[100dvh] md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-[2.5rem] shadow-2xl flex flex-col animate-in slide-in-from-bottom-full duration-300 transition-colors">
            <div className="px-8 py-6 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
              <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-xl text-primary-600 dark:text-primary-400">
                  <Users className="w-5 h-5" />
                </div>
                إدارة الموظفين والبيانات
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl transition-all active:scale-90"
              >
                <X className="w-6 h-6 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
              {/* Backup & Restore Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={handleBackupExport}
                  className="flex-1 flex items-center justify-center gap-3 bg-slate-900 text-white py-5 rounded-[2rem] font-black text-sm hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-900/10"
                >
                  <Download className="w-5 h-5" />
                  حفظ نسخة
                </button>
              </div>
              <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleBackupImport}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                <div className="flex items-center justify-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-100 dark:border-blue-800/50 rounded-[2rem] text-blue-700 dark:text-blue-400 font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all shadow-sm">
                  <Upload className="w-5 h-5" />
                  استعادة بيانات
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-black/40 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4 uppercase tracking-widest text-center">
                  إضافة موظف جديد
                </h3>
                <form
                  onSubmit={handleAddEmployee}
                  className="flex flex-col gap-3"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="اسم الموظف..."
                      className="w-full px-5 py-4 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-900 dark:text-white rounded-2xl outline-none focus:border-primary-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="الوظيفة..."
                      className="w-full px-5 py-4 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-900 dark:text-white rounded-2xl outline-none focus:border-primary-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      value={newJob}
                      onChange={(e) => setNewJob(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3">
                    <select
                      className="flex-1 px-5 py-4 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-900 dark:text-white rounded-2xl outline-none focus:border-primary-500 transition-all font-bold appearance-none"
                      value={newDept}
                      onChange={(e) => setNewDept(e.target.value)}
                    >
                      {departments
                        .filter((d) => d !== "All")
                        .map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                    </select>
                    <button
                      type="submit"
                      className="bg-primary-600 text-white px-8 rounded-2xl font-black shadow-lg shadow-primary-500/30 active:scale-95 transition-all"
                    >
                      إضافة
                    </button>
                  </div>
                </form>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-black text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-widest px-2">
                  قائمة الموظفين ({employees.length})
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {employees.map((emp) => (
                    <div
                      key={emp.name}
                      className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-50 dark:border-slate-700 shadow-sm group hover:border-primary-100 dark:hover:border-primary-900 transition-all"
                    >
                      {editingEmployee === emp.name ? (
                        <div className="flex-1 flex flex-col gap-3">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-4 py-2 border-2 border-primary-500 rounded-xl font-bold outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editJob}
                              onChange={(e) => setEditJob(e.target.value)}
                              className="flex-1 px-4 py-2 border-2 border-slate-100 dark:border-slate-700 rounded-xl font-bold outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                            <select
                              value={editDept}
                              onChange={(e) => setEditDept(e.target.value)}
                              className="px-4 py-2 border-2 border-slate-100 dark:border-slate-700 rounded-xl font-bold outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            >
                              {departments
                                .filter((d) => d !== "All")
                                .map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={handleSaveEdit}
                              className="p-3 bg-green-500 text-white rounded-xl shadow-lg shadow-green-500/20 active:scale-90 transition-all"
                            >
                              <Save className="w-5 h-5" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-3 bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-300 rounded-xl active:scale-90 transition-all"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center font-black text-slate-500 dark:text-slate-300 uppercase tracking-tighter">
                              {emp.name.substring(0, 2)}
                            </div>
                            <div>
                              <span className="font-black text-slate-900 dark:text-white block">
                                {emp.name}
                              </span>
                              <div className="flex gap-2 mt-0.5">
                                <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-black px-2 py-0.5 rounded-md uppercase">
                                  {emp.department}
                                </span>
                                <span className="text-[10px] bg-primary-50 text-primary-600 font-black px-2 py-0.5 rounded-md uppercase">
                                  {emp.job}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleStartEdit(emp)}
                              className="p-3 text-blue-500 bg-blue-50 rounded-xl active:scale-90 transition-all"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRemoveEmployee(emp.name)}
                              className="p-3 text-rose-500 bg-rose-50 rounded-xl active:scale-90 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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

      <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50/50 scroll-smooth">
        <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-4">
          {/* --- INFO LEGEND (ULTRA COMPACT) --- */}
          <div className="bg-white/40 backdrop-blur-sm px-4 py-2 rounded-2xl border border-slate-200/50 flex items-center justify-between">
            <div className="flex items-center gap-1.5 grayscale opacity-70">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
              <span className="text-[8px] font-black text-slate-500 uppercase">
                انتظار
              </span>
            </div>
            <div className="flex items-center gap-1.5 grayscale opacity-70">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
              <span className="text-[8px] font-black text-blue-600 uppercase">
                موجود
              </span>
            </div>
            <div className="flex items-center gap-1.5 grayscale opacity-70">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              <span className="text-[8px] font-black text-emerald-600 uppercase">
                انصراف
              </span>
            </div>
          </div>

          {/* --- DASHBOARD STATS (VIBRANT GRID) --- */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            {[
              {
                label: "الكل",
                val: stats.total,
                icon: Users,
                theme: "blue",
                bg: "bg-blue-500",
              },
              {
                label: "حاضر",
                val: stats.present,
                icon: UserCheck,
                theme: "emerald",
                bg: "bg-emerald-500",
              },
              {
                label: "تم",
                val: stats.completed,
                icon: CheckCircle2,
                theme: "indigo",
                bg: "bg-indigo-500",
              },
              {
                label: "باقي",
                val: stats.total - stats.present,
                icon: UserMinus,
                theme: "rose",
                bg: "bg-rose-500",
              },
            ].map((s, i) => (
              <div
                key={i}
                className={`${s.bg} p-3 sm:p-5 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-lg shadow-${s.theme}-500/20 flex flex-col justify-between h-24 sm:h-36 relative overflow-hidden group border-none`}
              >
                <div className="bg-white/20 w-7 h-7 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
                  <s.icon className="w-3.5 h-3.5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="relative z-10">
                  <p className="text-white/70 text-[7px] sm:text-[10px] font-black uppercase tracking-widest leading-none mb-1">
                    {s.label}
                  </p>
                  <p className="text-lg sm:text-3xl font-black text-white tabular-nums leading-none">
                    {s.val}
                  </p>
                </div>
                <s.icon className="absolute -right-3 -bottom-3 w-16 h-16 sm:w-24 sm:h-24 text-white/10 group-hover:rotate-12 transition-transform duration-500" />
              </div>
            ))}
          </div>

          {/* --- SEARCHBAR --- */}
          <div className="relative group">
            <div className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 p-2 bg-primary-50 dark:bg-primary-900/30 rounded-lg sm:rounded-xl group-focus-within:bg-primary-600 transition-colors">
              <Search className="w-4 h-4 sm:w-5 h-5 text-primary-500 dark:text-primary-400 group-focus-within:text-white transition-colors" />
            </div>
            <input
              type="text"
              placeholder="ابحث عن اسم الموظف هنا..."
              className="w-full pl-12 sm:pl-16 pr-6 sm:pr-8 py-4 sm:py-6 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-[1.5rem] sm:rounded-[2.5rem] outline-none focus:border-primary-500/50 dark:focus:border-primary-500/50 transition-all shadow-xl shadow-slate-200/10 dark:shadow-black/20 text-base sm:text-xl font-black text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* --- FILTERS & CATEGORIES --- */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 px-1">
              {departments.map((dept) => (
                <button
                  key={dept}
                  onClick={() => setDeptFilter(dept)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black transition-all border-2 active:scale-95 ${
                    deptFilter === dept
                      ? "bg-slate-900 dark:bg-slate-100 border-slate-900 dark:border-slate-100 text-white dark:text-slate-900 shadow-lg shadow-slate-900/10"
                      : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {dept}
                </button>
              ))}
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 px-1">
              {[
                { id: "All", label: "الكل", icon: Users },
                { id: "Not Checked-In", label: "انتظار", icon: Clock },
                { id: "Not Checked-Out", label: "موجود", icon: UserCheck },
                { id: "Completed", label: "انصراف", icon: CheckCircle2 },
                { id: "On Leave", label: "إجازة", icon: Calendar },
                { id: "Absent", label: "غياب", icon: UserMinus },
                { id: "Time Sheet", label: "T.Sheet", icon: FileText },
              ].map((tab) => {
                const isActive = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setFilter(tab.id)}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-[11px] font-black transition-all border-2 flex items-center gap-2 active:scale-95 ${
                      isActive
                        ? "bg-primary-600 border-primary-600 text-white shadow-lg shadow-primary-500/20"
                        : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* --- MAIN ACTION BUTTONS --- */}
          <div className="flex gap-3 px-1">
            <button
              onClick={handleResetDay}
              className="p-5 bg-white dark:bg-slate-900 text-slate-400 hover:text-rose-500 border-2 border-slate-100 dark:border-slate-800 rounded-[2rem] active:scale-95 transition-all"
              title="إعادة ضبط اليوم"
            >
              <RefreshCcw className="w-6 h-6" />
            </button>
          </div>

          {/* --- BATCH ACTION BAR --- */}
          {selectedEmployees.length > 0 && (
            <div className="sticky top-20 z-40 bg-primary-600 text-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl shadow-xl shadow-primary-500/30 flex flex-col xs:flex-row items-center justify-between gap-3 animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="bg-white/20 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-black">
                  {selectedEmployees.length}
                </span>
                <span className="text-xs sm:text-sm font-bold">
                  عملية جماعية
                </span>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                <button
                  onClick={() =>
                    handleBatchUpdate("checkIn", new Date().toISOString())
                  }
                  className="bg-white text-primary-600 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black hover:bg-primary-50 active:scale-95"
                >
                  حضور
                </button>
                <button
                  onClick={() =>
                    handleBatchUpdate("checkOut", new Date().toISOString())
                  }
                  className="bg-white/10 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black hover:bg-white/20 border border-white/20 active:scale-95"
                >
                  انصراف
                </button>
                <button
                  onClick={() => handleBatchUpdate("status", "إجازة")}
                  className="bg-amber-500 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black hover:bg-amber-600 active:scale-95"
                >
                  إجازة
                </button>
                <button
                  onClick={() => handleBatchUpdate("status", "غياب")}
                  className="bg-rose-500 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black hover:bg-rose-600 active:scale-95"
                >
                  غياب
                </button>
                <button
                  onClick={() => setSelectedEmployees([])}
                  className="bg-slate-900 text-white p-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl active:scale-95"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* --- EMPLOYEE LIST --- */}
          <div className="space-y-4">
            <div className="sticky top-0 z-10 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md py-2 sm:py-4 transition-all">
              <div
                className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-5 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl sm:rounded-[2.5rem] shadow-sm"
                dir="rtl"
              >
                <div className="flex items-center gap-2 sm:gap-4">
                  <button
                    onClick={() => {
                      if (
                        selectedEmployees.length ===
                          filteredAttendance.length &&
                        filteredAttendance.length > 0
                      ) {
                        setSelectedEmployees([]);
                      } else {
                        setSelectedEmployees(
                          filteredAttendance.map((e) => e.name),
                        );
                      }
                    }}
                    className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl border-2 flex items-center justify-center transition-all ${
                      selectedEmployees.length === filteredAttendance.length &&
                      filteredAttendance.length > 0
                        ? "bg-primary-600 border-primary-600 text-white"
                        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {selectedEmployees.length === filteredAttendance.length &&
                      filteredAttendance.length > 0 && (
                        <CheckCircle2 className="w-4 h-4 sm:w-5 h-5" />
                      )}
                  </button>
                  <span className="font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                    تحديد الكل ({filteredAttendance.length})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] sm:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase bg-slate-100 dark:bg-slate-800 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full">
                    {filteredAttendance.length} موظف
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {filteredAttendance.length > 0 ? (
                filteredAttendance.map((emp) => (
                  <div
                    key={emp.name}
                    dir="rtl"
                    onClick={() => {
                      if (selectedEmployees.includes(emp.name)) {
                        setSelectedEmployees((prev) =>
                          prev.filter((n) => n !== emp.name),
                        );
                      } else {
                        setSelectedEmployees((prev) => [...prev, emp.name]);
                      }
                    }}
                    className={`p-3 sm:p-4 rounded-2xl sm:rounded-3xl transition-all border-2 active:scale-[0.99] relative overflow-hidden group cursor-pointer ${
                      selectedEmployees.includes(emp.name)
                        ? "bg-primary-50/30 border-primary-500 shadow-sm"
                        : "bg-white border-white shadow-sm hover:border-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      {/* Status Dot */}
                      <div
                        className={`w-1 sm:w-1.5 h-10 sm:h-12 rounded-full shrink-0 ${
                          emp.status
                            ? "bg-amber-500"
                            : emp.checkOut
                              ? "bg-emerald-500"
                              : emp.checkIn
                                ? "bg-blue-500"
                                : "bg-slate-200 dark:bg-slate-800"
                        }`}
                      />

                      {/* Name & Basic Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate tracking-tight">
                            {emp.name}
                          </h3>
                          {emp.checkIn && !emp.checkOut && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
                          <span className="text-[10px] font-black text-slate-400 uppercase">
                            {emp.job}
                          </span>
                          <span className="text-[10px] text-slate-200">•</span>
                          <span className="text-[10px] font-black text-primary-500/70 uppercase">
                            {emp.department}
                          </span>
                        </div>
                      </div>

                      {/* Times (Compact) */}
                      <div className="flex items-center gap-2 sm:gap-4 px-2 sm:px-4 border-r border-slate-100 dark:border-slate-800">
                        <div
                          className="text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 p-0.5 sm:p-1 rounded-lg transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (emp.checkIn) {
                              setEditingTime({
                                name: emp.name,
                                field: "checkIn",
                                value: format(parseISO(emp.checkIn), "HH:mm"),
                              });
                            }
                          }}
                        >
                          <p className="text-[6px] sm:text-[8px] font-black text-slate-300 dark:text-slate-600 uppercase leading-none mb-0.5 sm:mb-1">
                            دخول
                          </p>
                          {editingTime?.name === emp.name &&
                          editingTime?.field === "checkIn" ? (
                            <input
                              type="time"
                              value={editingTime.value}
                              onChange={(e) =>
                                setEditingTime({
                                  ...editingTime,
                                  value: e.target.value,
                                })
                              }
                              onBlur={handleEditTimeSave}
                              onKeyDown={handleEditTimeSave}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] sm:text-xs font-black bg-white dark:bg-slate-800 border-2 border-primary-500 rounded p-0.5 outline-none w-16 sm:w-auto"
                            />
                          ) : (
                            <p className="text-[10px] sm:text-xs font-black text-slate-600 dark:text-slate-300 tabular-nums">
                              {formatTime(emp.checkIn) || "--:--"}
                            </p>
                          )}
                        </div>
                        <div
                          className="text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 p-0.5 sm:p-1 rounded-lg transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (emp.checkOut) {
                              setEditingTime({
                                name: emp.name,
                                field: "checkOut",
                                value: format(parseISO(emp.checkOut), "HH:mm"),
                              });
                            }
                          }}
                        >
                          <p className="text-[6px] sm:text-[8px] font-black text-slate-300 dark:text-slate-600 uppercase leading-none mb-0.5 sm:mb-1">
                            خروج
                          </p>
                          {editingTime?.name === emp.name &&
                          editingTime?.field === "checkOut" ? (
                            <input
                              type="time"
                              value={editingTime.value}
                              onChange={(e) =>
                                setEditingTime({
                                  ...editingTime,
                                  value: e.target.value,
                                })
                              }
                              onBlur={handleEditTimeSave}
                              onKeyDown={handleEditTimeSave}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] sm:text-xs font-black bg-white dark:bg-slate-800 border-2 border-primary-500 rounded p-0.5 outline-none w-16 sm:w-auto"
                            />
                          ) : (
                            <p className="text-[10px] sm:text-xs font-black text-slate-600 dark:text-slate-300 tabular-nums">
                              {formatTime(emp.checkOut) || "--:--"}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Worked Hours / Action Button */}
                      <div className="flex items-center gap-2">
                        <div className="text-center bg-slate-50 dark:bg-slate-800 px-2 py-1.5 rounded-xl min-w-[50px]">
                          <p className="text-[8px] font-black text-slate-400 uppercase leading-none mb-0.5">
                            ساعة
                          </p>
                          <p
                            className={`text-sm font-black ${emp.checkOut ? "text-primary-600 dark:text-primary-400" : "text-slate-300 dark:text-slate-600"}`}
                          >
                            {calculateWorkedHours(emp.checkIn, emp.checkOut)}
                          </p>
                        </div>

                        {/* Status/Action Buttons */}
                        <div className="flex items-center gap-2">
                          {/* Custom Status Input */}
                          {customStatusEmployee === emp.name ? (
                            <div
                              className="flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                value={customStatusValue}
                                onChange={(e) =>
                                  setCustomStatusValue(e.target.value)
                                }
                                placeholder="اكتب الحالة..."
                                className="px-2 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border-2 border-amber-500 rounded-lg text-slate-900 dark:text-white outline-none w-24"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (
                                    e.key === "Enter" &&
                                    customStatusValue.trim()
                                  ) {
                                    updateAttendance(
                                      emp.name,
                                      "status",
                                      customStatusValue.trim(),
                                    );
                                    updateAttendance(emp.name, "checkIn", null);
                                    updateAttendance(
                                      emp.name,
                                      "checkOut",
                                      null,
                                    );
                                    setCustomStatusEmployee(null);
                                    setCustomStatusValue("");
                                  } else if (e.key === "Escape") {
                                    setCustomStatusEmployee(null);
                                    setCustomStatusValue("");
                                  }
                                }}
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (customStatusValue.trim()) {
                                    updateAttendance(
                                      emp.name,
                                      "status",
                                      customStatusValue.trim(),
                                    );
                                    updateAttendance(emp.name, "checkIn", null);
                                    updateAttendance(
                                      emp.name,
                                      "checkOut",
                                      null,
                                    );
                                  }
                                  setCustomStatusEmployee(null);
                                  setCustomStatusValue("");
                                }}
                                className="p-1.5 bg-amber-600 text-white rounded-lg text-xs"
                              >
                                ✓
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomStatusEmployee(null);
                                  setCustomStatusValue("");
                                }}
                                className="p-1.5 bg-slate-300 text-slate-600 rounded-lg text-xs"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <>
                              {/* Status Dropdown for Absence/Leave */}
                              {!emp.checkIn && (
                                <select
                                  value={emp.status || ""}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    const status = e.target.value;
                                    if (status === "custom") {
                                      setCustomStatusEmployee(emp.name);
                                      setCustomStatusValue("");
                                    } else if (status) {
                                      updateAttendance(
                                        emp.name,
                                        "status",
                                        status,
                                      );
                                      updateAttendance(
                                        emp.name,
                                        "checkIn",
                                        null,
                                      );
                                      updateAttendance(
                                        emp.name,
                                        "checkOut",
                                        null,
                                      );
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 outline-none focus:border-amber-500 transition-all"
                                >
                                  <option value="">حالة...</option>
                                  <option value="إجازة">إجازة</option>
                                  <option value="غياب">غياب</option>
                                  <option value="مرضي">مرضي</option>
                                  <option value="مأمورية">مأمورية</option>
                                  <option value="time sheet">time sheet</option>
                                  <option value="custom">أخرى...</option>
                                </select>
                              )}
                            </>
                          )}

                          {/* Check-in/out buttons */}
                          {!emp.checkIn && !emp.status ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateAttendance(
                                  emp.name,
                                  "checkIn",
                                  new Date().toISOString(),
                                );
                                // Clear status when checking in
                                updateAttendance(emp.name, "status", null);
                              }}
                              className="w-10 h-10 bg-primary-600 text-white rounded-xl shadow-lg shadow-primary-500/20 active:scale-90 transition-all flex items-center justify-center shrink-0"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                          ) : emp.checkIn && !emp.checkOut ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateAttendance(
                                  emp.name,
                                  "checkOut",
                                  new Date().toISOString(),
                                );
                              }}
                              className="w-10 h-10 bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-500/20 active:scale-90 transition-all flex items-center justify-center shrink-0"
                            >
                              <UserMinus className="w-5 h-5" />
                            </button>
                          ) : emp.checkOut ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("هل تريد إلغاء الخروج؟"))
                                  updateAttendance(emp.name, "checkOut", null);
                              }}
                              className="w-10 h-10 bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-xl active:scale-90 transition-all flex items-center justify-center shrink-0"
                            >
                              <CheckCircle2 className="w-5 h-5" />
                            </button>
                          ) : emp.status ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("هل تريد إلغاء الحالة؟"))
                                  updateAttendance(emp.name, "status", null);
                              }}
                              className="px-3 py-1.5 text-xs font-bold bg-amber-100 text-amber-600 border border-amber-200 rounded-xl active:scale-90 transition-all"
                            >
                              {emp.status}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Mobile Times (Visible only on very small screens if needed) */}
                    {(emp.checkIn || emp.checkOut) && (
                      <div className="flex sm:hidden items-center gap-3 mt-2 pr-4 text-[10px] font-bold text-slate-400 border-t border-slate-50 pt-2">
                        <span className="flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />{" "}
                          {formatTime(emp.checkIn) || "لم يسجل"}
                        </span>
                        <span className="text-slate-200">|</span>
                        <span className="flex items-center gap-1">
                          <UserMinus className="w-3 h-3" />{" "}
                          {formatTime(emp.checkOut) || "مستمر"}
                        </span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-20 flex flex-col items-center text-center px-10">
                  <div className="w-32 h-32 bg-slate-100 dark:bg-slate-900 rounded-[3rem] flex items-center justify-center mb-6">
                    <Search className="w-12 h-12 text-slate-300 dark:text-slate-700" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                    القائمة فارغة
                  </h3>
                  <p className="text-slate-400 text-slate-500 font-bold">
                    لم نجد أي موظف في هذا القسم أو يطابق بحثك
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* --- QUICK ACTION FOOTER --- */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-6 py-4 flex-shrink-0 z-30 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] dark:shadow-black/20 transition-colors">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={() => exportToExcel(attendanceForDate, selectedDate)}
            className="flex-1 p-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl font-black text-base flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl shadow-emerald-500/30"
          >
            <Download className="w-6 h-6" /> اليومية
          </button>
          <button
            onClick={() => {
              if (selectedEmployees.length === 0) {
                alert("برجاء اختيار موظفين أولاً");
                return;
              }
              const chosenItems = employees.filter((e) =>
                selectedEmployees.includes(e.name),
              );
              exportIndividualTimeSheets(chosenItems, history, selectedDate);
            }}
            className="flex-1 p-5 bg-primary-600 hover:bg-primary-500 text-white rounded-3xl font-black text-base flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl shadow-primary-500/30"
          >
            <Clock className="w-6 h-6" /> Time Sheet
            {selectedEmployees.length > 0 && (
              <span className="bg-white text-primary-600 w-6 h-6 rounded-full flex items-center justify-center text-[10px]">
                {selectedEmployees.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Daily Summary Modal */}
      {showSummary && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-end md:items-center justify-center p-0 md:p-4 touch-auto">
          <div className="bg-white w-full h-[100dvh] md:h-auto md:max-w-md md:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full duration-300 flex flex-col">
            <div className="p-8 pb-4 flex justify-between items-start border-b border-slate-50 flex-shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  تقرير اليوم
                </h3>
                <p className="text-slate-500 font-bold text-sm">
                  {format(parseISO(selectedDate), "EEEE, MMMM do")}
                </p>
              </div>
              <button
                onClick={() => setShowSummary(false)}
                className="p-4 bg-slate-100/50 hover:bg-slate-100 rounded-2xl transition-colors active:scale-90"
              >
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 pt-6 space-y-8">
              {/* stats content */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-600 p-6 rounded-[2rem] text-white shadow-xl shadow-blue-500/20">
                  <p className="text-blue-100 text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">
                    حضر
                  </p>
                  <p className="text-4xl font-black">{stats.present}</p>
                </div>
                <div className="bg-amber-500 p-6 rounded-[2rem] text-white shadow-xl shadow-amber-500/20">
                  <p className="text-amber-100 text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">
                    غادر
                  </p>
                  <p className="text-4xl font-black">{stats.completed}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-5 bg-slate-50 rounded-[1.5rem] border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-xl shadow-sm">
                      <Users className="w-4 h-4 text-slate-400" />
                    </div>
                    <span className="text-slate-600 font-black text-sm">
                      العدد الكلي
                    </span>
                  </div>
                  <span className="font-black text-slate-900 text-lg">
                    {stats.total}
                  </span>
                </div>
                <div className="flex items-center justify-between p-5 bg-primary-50 rounded-[1.5rem] border border-primary-100/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-xl shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary-500" />
                    </div>
                    <span className="text-primary-700 font-black text-sm">
                      نسبة الحضور
                    </span>
                  </div>
                  <span className="font-black text-primary-600 text-lg">
                    {Math.round((stats.present / stats.total) * 100)}%
                  </span>
                </div>
                <div className="flex items-center justify-between p-5 bg-rose-50 rounded-[1.5rem] border border-rose-100/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-xl shadow-sm">
                      <Clock className="w-4 h-4 text-rose-500" />
                    </div>
                    <span className="text-rose-700 font-black text-sm">
                      قيد العمل
                    </span>
                  </div>
                  <span className="font-black text-rose-600 text-lg">
                    {stats.present - stats.completed}
                  </span>
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-4 pb-8">
                <button
                  onClick={() => {
                    const msg = `📊 *تقرير الحضور اليومي* - ${selectedDate}
-------------------------
👤 العدد الكلي: ${stats.total}
✅ الحضور: ${stats.present}
🚪 غادروا: ${stats.completed}
❌ غائب: ${stats.total - stats.present}
⏳ قيد العمل: ${stats.present - stats.completed}
-------------------------
تم التوليد بواسطة *Time Keeper*`;
                    window.open(
                      `https://wa.me/?text=${encodeURIComponent(msg)}`,
                      "_blank",
                    );
                  }}
                  className="btn bg-green-600 hover:bg-green-700 text-white w-full py-5 rounded-[1.5rem] shadow-xl shadow-green-500/30 font-black flex items-center justify-center gap-2 text-lg active:scale-95 transition-transform"
                >
                  <Share2 className="w-6 h-6" />
                  مشاركة عبر واتساب
                </button>
                <button
                  onClick={() => {
                    const text = `📊 تقرير الحضور اليومي - ${selectedDate}\n العدد الكلي: ${stats.total}\n الحضور: ${stats.present}\n غادروا: ${stats.completed}\n قيد العمل: ${stats.present - stats.completed}`;
                    navigator.clipboard.writeText(text);
                    alert("تم نسخ التقرير بنجاح");
                  }}
                  className="text-slate-400 font-black text-sm hover:text-slate-600 transition-colors py-2 active:scale-95"
                >
                  نسخ النص فقط
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[200] flex items-center justify-center p-6"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-white rounded-[3rem] p-10 max-w-md w-full shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-20 h-20 bg-primary-100 text-primary-600 rounded-[2rem] flex items-center justify-center mb-6 mx-auto">
              <Briefcase className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-center text-slate-900 mb-6">
              كيفية استخدام النظام
            </h2>
            <div className="space-y-6">
              <div className="flex gap-4 text-right" dir="rtl">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-xs text-slate-500 shrink-0">
                  1
                </div>
                <p className="text-slate-600 font-bold text-sm leading-relaxed">
                  اضغط على زر{" "}
                  <span className="text-primary-600 font-black">
                    تسجيل دخول
                  </span>{" "}
                  عند وصول الموظف.
                </p>
              </div>
              <div className="flex gap-4 text-right" dir="rtl">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-xs text-slate-500 shrink-0">
                  2
                </div>
                <p className="text-slate-600 font-bold text-sm leading-relaxed">
                  عند الانتهاء، اضغط على{" "}
                  <span className="text-rose-600 font-black">تسجيل خروج</span>{" "}
                  لحساب عدد الساعات.
                </p>
              </div>
              <div className="flex gap-4 text-right" dir="rtl">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-xs text-slate-500 shrink-0">
                  3
                </div>
                <p className="text-slate-600 font-bold text-sm leading-relaxed">
                  استخدم الفلاتر في الأعلى لعرض أقسام معينة أو البحث بالاسم.
                </p>
              </div>
              <div className="flex gap-4 text-right" dir="rtl">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-xs text-slate-500 shrink-0">
                  4
                </div>
                <p className="text-slate-600 font-bold text-sm leading-relaxed">
                  اضغط على{" "}
                  <span className="text-amber-500 font-black">اليومية</span>{" "}
                  للحصول على تقرير سريع ومشاركته واتساب.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="w-full mt-10 bg-slate-900 text-white font-black py-4 rounded-2xl active:scale-95 transition-all text-sm uppercase tracking-widest"
            >
              فهمت ذلك
            </button>
          </div>
        </div>
      )}
      {/* --- FOOTER BRANDS --- */}
      <footer className="py-8 text-center bg-slate-50/50 dark:bg-black/20 mt-auto border-t border-slate-100 dark:border-slate-800/50">
        <p className="text-[10px] sm:text-xs font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]">
          Developed By{" "}
          <span className="text-primary-500 dark:text-primary-400">
            Rafat Hanna
          </span>
        </p>
      </footer>
    </div>
  );
}

export default App;
