import React, { useState, useRef, useEffect, useMemo } from "react";
import { useApp } from "../AppContext";
import {
  ScheduleData,
  WBSNode,
  Task,
  LaborAssignment,
  DailyReport,
} from "../types";
import { cn, formatDate, formatNumber } from "../lib/utils";
import {
  Upload,
  Search,
  Calendar,
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  Info,
  X,
  FileText,
  User,
  Clock,
  ChevronLeft,
  Download,
  Share2,
  ListTodo,
} from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { sharePdfFile, downloadPdfBlob } from "../lib/shareUtils";
import { openGooglePicker } from "../lib/googlePicker";
import FloatingCalendarModal from "../components/FloatingCalendarModal";

const PIXELS_PER_DAY: Record<string, number> = { day: 30, week: 10, month: 3 };

export default function GanttViewer() {
  const { state, updateState, notify } = useApp();
  const [timeScale, setTimeScale] = useState<"day" | "week" | "month">("week");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const [wbsExpanded, setWbsExpanded] = useState<Record<string, boolean>>({});
  const [isTaskPanelHidden, setIsTaskPanelHidden] = useState(false);
  const [taskPanelWidth, setTaskPanelWidth] = useState(480);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedDayReports, setSelectedDayReports] = useState<{
    date: string;
    reports: DailyReport[];
    taskName?: string;
    wbsName?: string;
  } | null>(null);
  const [reportModalDate, setReportModalDate] = useState<string | null>(null);

  const [showTopPanel, setShowTopPanel] = useState(true);

  const completedTaskCount = useMemo(() => {
    if (!state.scheduleData?.tasks) return 0;
    const completedTaskIds = new Set<string>();

    if (state.dailyReports) {
      state.dailyReports.forEach((r: any) => {
        if (r.status === 'listo') {
          if (r.taskId) {
            completedTaskIds.add(String(r.taskId));
          } else {
            const match = state.scheduleData.tasks.find((t: any) =>
              t.name?.trim().toLowerCase() === r.tipo?.trim().toLowerCase()
            );
            if (match) {
              completedTaskIds.add(match.id);
            }
          }
        }
      });
    }

    return completedTaskIds.size;
  }, [state.scheduleData?.tasks, state.dailyReports]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const taskListRef = useRef<HTMLDivElement>(null);
  const ganttChartRef = useRef<HTMLDivElement>(null);
  const ganttHeaderRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollLeftRef = useRef<number>(0);

  // Sync scroll
  const handleScrollSet = (source: "taskList" | "ganttChart") => {
    const currentScrollLeft = ganttChartRef.current
      ? ganttChartRef.current.scrollLeft
      : 0;

    if (ganttHeaderRef.current) {
      ganttHeaderRef.current.scrollLeft = currentScrollLeft;
    }
  };

  const autoExpandedScheduleRef = useRef<string | null>(null);

  // Ensure Gantt is expanded on load to show absolutely everything, but don't re-expand on minor syncs
  useEffect(() => {
    if (state.scheduleData) {
      const scheduleId = state.scheduleData.calendarName + state.scheduleData.startDate;
      if (autoExpandedScheduleRef.current === scheduleId) return; // Already auto-expanded this schedule
      
      const all: Record<string, boolean> = {};
      const walk = (nodes: any[]) =>
        nodes.forEach((n) => {
          all[n.id] = true;
          if (n.children) walk(n.children);
        });
      walk(state.scheduleData.rootWbs);
      setWbsExpanded(all);
      autoExpandedScheduleRef.current = scheduleId;
    }
  }, [state.scheduleData]);

  // Resizer handling
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(300, Math.min(e.clientX, 1000));
      setTaskPanelWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Handle global XER upload event
  useEffect(() => {
    const handleGlobalUpload = (e: any) => {
      const file = e.detail.file;
      if (file) {
        handleFileUpload({ target: { files: [file] } } as any);
      }
    };
    window.addEventListener("upload-xer", handleGlobalUpload);
    return () => window.removeEventListener("upload-xer", handleGlobalUpload);
  }, [state, updateState]);

  // XER Parser Logic
  const parseXER = (content: string) => {
    const lines = content.split(/\r?\n/);
    const data: any = {
      projects: [],
      wbs: [],
      tasks: [],
      calendars: [],
      taskrsrc: [],
    };
    let currentSection: string | null = null;
    let currentFields: string[] = [];

    for (let line of lines) {
      line = line.replace(/^\uFEFF/, "").trim();
      if (!line || line.startsWith("ERMHDR")) continue;

      if (line.startsWith("%T\t")) {
        currentSection = line.substring(3).trim();
        currentFields = [];
      } else if (line.startsWith("%F\t")) {
        currentFields = line.substring(3).split("\t");
      } else if (line.startsWith("%R\t")) {
        const values = line.substring(3).split("\t");
        const record: any = {};
        currentFields.forEach((field, i) => {
          record[field] = values[i] ? values[i].trim() : null;
        });
        if (currentSection === "PROJECT") data.projects.push(record);
        if (currentSection === "PROJWBS") data.wbs.push(record);
        if (currentSection === "TASK") data.tasks.push(record);
        if (currentSection === "CALENDAR") data.calendars.push(record);
        if (currentSection === "TASKRSRC") data.taskrsrc.push(record);
      }
    }
    return data;
  };

  const parseDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const value = String(dateStr).trim().replace(/\*/g, "");
    const matchISO = value.match(
      /(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/,
    );
    if (matchISO) {
      return new Date(
        parseInt(matchISO[1]),
        parseInt(matchISO[2]) - 1,
        parseInt(matchISO[3]),
        matchISO[4] ? parseInt(matchISO[4]) : 0,
        matchISO[5] ? parseInt(matchISO[5]) : 0,
      );
    }
    const matchShort = value.match(
      /(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?: (\d{2}):(\d{2}))?/,
    );
    if (matchShort) {
      let year = parseInt(matchShort[3]);
      if (year < 100) year += 2000;
      return new Date(
        year,
        parseInt(matchShort[2]) - 1,
        parseInt(matchShort[1]),
        matchShort[4] ? parseInt(matchShort[4]) : 0,
        matchShort[5] ? parseInt(matchShort[5]) : 0,
      );
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  };

  const processXerBlob = async (blob: Blob, fileName: string) => {
    try {
      const buffer = await blob.arrayBuffer();
      const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      let xerData = parseXER(utf8);

      if (xerData.projects.length === 0) {
        throw new Error("No se encontró la tabla PROJECT");
      }

      const project = xerData.projects[0];
      const wbsMap: Record<string, any> = {};
      const rootWbs: any[] = [];

      xerData.wbs.forEach((w: any) => {
        wbsMap[w.wbs_id] = {
          id: w.wbs_id,
          name: w.wbs_name,
          parentId: w.parent_wbs_id,
          seqNum: parseInt(w.seq_num) || 0,
          children: [],
          tasks: [],
        };
      });

      Object.values(wbsMap).forEach((w) => {
        if (w.parentId && wbsMap[w.parentId]) {
          wbsMap[w.parentId].children.push(w);
        } else {
          rootWbs.push(w);
        }
      });

      let stats = {
        total: 0,
        completed: 0,
        active: 0,
        milestones: 0,
        wbsCount: Object.keys(wbsMap).length,
        sumActualHrs: 0,
        sumTotalHrs: 0,
        sumPlannedHrs: 0,
      };

      // Calendar and Roster detection
      let detectedCalendarName = "";
      let detectedCycleDays = 14;

      const detectShift = (text: string) => {
        if (!text) return null;
        // Normalizar texto para mejor detección
        const clean = text.toUpperCase().replace(/[^A-Z0-9X ]/g, " ");
        const patterns = [
          /(\d{1,2})\s*X\s*(\d{1,2})/,
          /(?:JORNADA|TURNO|CYCLE|ROSTER)\s*(\d{1,2})\s*X\s*(\d{1,2})/i,
          /(?:JORNADA|TURNO|CYCLE|ROSTER)\s*(?:DE\s+)?(\d{1,2})/i,
          /(\d{1,2})\s*DIAS/i,
        ];
        for (const p of patterns) {
          const m = clean.match(p);
          if (m) return parseInt(m[1]);
        }
        return null;
      };

      const projShift = detectShift(
        project.proj_name || project.proj_short_name || "",
      );
      if (projShift) {
        detectedCycleDays = projShift;
        detectedCalendarName = `Proyecto [${projShift}x${projShift}]`;
      }

      if (xerData.calendars && xerData.calendars.length > 0) {
        for (const c of xerData.calendars) {
          const shift = detectShift(c.clndr_name);
          if (shift) {
            detectedCycleDays = shift;
            detectedCalendarName =
              c.clndr_name || `Calendario ${shift}x${shift}`;
            break;
          }
        }
      }

      // Si no detectamos nada pero hay un nombre de calendario sospechoso
      if (!detectedCalendarName && xerData.calendars?.[0]?.clndr_name) {
        detectedCalendarName = xerData.calendars[0].clndr_name;
      }

      // Pre-process task resource assignments (TASKRSRC) to sum budgeted labor/non-labor units (target_qty) per task
      const taskRsrcMap: Record<string, number> = {};
      let totalAssignedLabor = 0;
      if (xerData.taskrsrc) {
        xerData.taskrsrc.forEach((tr: any) => {
          const taskId = tr.task_id;
          if (taskId) {
            const qty = parseFloat(tr.target_qty) || 0;
            taskRsrcMap[taskId] = (taskRsrcMap[taskId] || 0) + qty;
            totalAssignedLabor += qty;
          }
        });
      }

      // Check if any t.target_work_qty has units set in raw tasks
      let totalTaskWorkQty = 0;
      if (xerData.tasks) {
        xerData.tasks.forEach((t: any) => {
          totalTaskWorkQty += parseFloat(t.target_work_qty) || 0;
        });
      }

      const scheduleHasLaborAssignments =
        totalAssignedLabor > 0 || totalTaskWorkQty > 0;

      let unassignedWbsNode: any = null;

      const allTasks: Task[] = xerData.tasks.map((t: any) => {
        // Try all possible candidate start and end date fields to maximize coverage of P6 schema variants
        let start =
          parseDate(t.act_start_date) ||
          parseDate(t.early_start_date) ||
          parseDate(t.target_start_date) ||
          parseDate(t.plan_start_date) ||
          parseDate(t.sched_start_date) ||
          parseDate(t.late_start_date) ||
          parseDate(t.start_date);

        let end =
          parseDate(t.act_end_date) ||
          parseDate(t.early_end_date) ||
          parseDate(t.target_end_date) ||
          parseDate(t.plan_end_date) ||
          parseDate(t.sched_end_date) ||
          parseDate(t.late_end_date) ||
          parseDate(t.expect_end_date) ||
          parseDate(t.end_date);

        // Task raw duration in hours (for fallback rendering/milestones assessment)
        const rawDurationHrs =
          parseFloat(t.target_drtn_hr_cnt) || parseFloat(t.target_drtn) || 0;
        const isMilestone =
          rawDurationHrs === 0 ||
          t.task_type === "TT_Mile" ||
          t.task_type === "TT_FinMile";

        // Infer one date from another if one of them is available to ensure we don't drop any task
        const durationDays =
          rawDurationHrs > 0 ? Math.ceil(rawDurationHrs / 12) : 1;
        if (!start && end) {
          start = new Date(end.getTime() - durationDays * 24 * 60 * 60 * 1000);
        } else if (start && !end) {
          end = new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000);
        }

        // Calculate task duration in calendar days (inclusive of active bounds)
        const taskDays =
          !isMilestone && start && end
            ? Math.ceil(
                (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
              )
            : 0;

        // Strict 12-hour workday rule: durationHrs of a task is taskDays * 12 (milestones remain 0)
        const durationHrs = isMilestone
          ? 0
          : taskDays > 0
            ? taskDays * 12
            : rawDurationHrs;
        const progress = parseInt(t.phys_complete_pct) || 0;

        stats.total++;
        if (t.status_code === "TK_Complete") stats.completed++;
        if (t.status_code === "TK_Active") stats.active++;
        if (isMilestone) stats.milestones++;

        const taskObj = {
          id: t.task_id,
          name: t.task_name,
          status: t.status_code,
          startDate: start?.toISOString() || null,
          endDate: end?.toISOString() || null,
          durationHrs,
          wbsId: t.wbs_id,
          wbsName: wbsMap[t.wbs_id]?.name || "ACTIVIDADES GENERALES",
          isMilestone,
          progress,
        };

        if (wbsMap[t.wbs_id]) {
          wbsMap[t.wbs_id].tasks.push(taskObj);
        } else {
          if (!unassignedWbsNode) {
            unassignedWbsNode = {
              id: "unassigned-wbs",
              name: "ACTIVIDADES GENERALES (SIN WBS)",
              parentId: null,
              seqNum: 9999,
              children: [],
              tasks: [],
            };
          }
          unassignedWbsNode.tasks.push(taskObj);
        }

        return taskObj;
      }); // DO NOT drop any activities - we want 100% full list representation

      // Register the unclassified top-level WBS node if we detected unassigned activities
      if (unassignedWbsNode) {
        wbsMap[unassignedWbsNode.id] = unassignedWbsNode;
        rootWbs.push(unassignedWbsNode);
      }

      // Harmonize the project overall stats based on the active timeframe of the project under the strict rule (304 days = 3648 hours)
      const validStarts = allTasks
        .map((t) => t.startDate)
        .filter(Boolean) as string[];
      const validEnds = allTasks
        .map((t) => t.endDate)
        .filter(Boolean) as string[];

      const projStart = validStarts.length
        ? new Date(validStarts.sort()[0])
        : new Date();
      const projEnd = validEnds.length
        ? new Date(validEnds.sort().reverse()[0])
        : new Date(projStart.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Secondary pass to assign fallback absolute dates for any tasks still lacking start/end coordinates so they are properly rendered
      allTasks.forEach((t: any) => {
        if (!t.startDate) {
          t.startDate = projStart.toISOString();
        }
        if (!t.endDate) {
          const durDays = t.durationHrs > 0 ? Math.ceil(t.durationHrs / 12) : 1;
          const s = new Date(t.startDate);
          s.setDate(s.getDate() + durDays);
          t.endDate = s.toISOString();
        }
      });

      let projectDays = 0;
      if (projStart && projEnd) {
        projectDays = Math.ceil(
          (projEnd.getTime() - projStart.getTime()) / (1000 * 60 * 60 * 24),
        );
      }

      const targetTotalHrs = projectDays * 12;

      let sumTaskPlannedHrs = 0;
      let sumTaskActualHrs = 0;
      let sumTaskPlannedToDate = 0;
      const now = new Date();

      allTasks.forEach((tk: any) => {
        if (!tk.isMilestone) {
          sumTaskPlannedHrs += tk.durationHrs;
          sumTaskActualHrs += tk.durationHrs * ((tk.progress || 0) / 100);

          if (tk.startDate && tk.endDate) {
            const s = new Date(tk.startDate);
            const e = new Date(tk.endDate);
            const totalDuration = e.getTime() - s.getTime();
            if (now > s && totalDuration > 0) {
              const elapsed = Math.min(
                totalDuration,
                now.getTime() - s.getTime(),
              );
              sumTaskPlannedToDate +=
                tk.durationHrs * (elapsed / totalDuration);
            } else if (now >= e) {
              sumTaskPlannedToDate += tk.durationHrs;
            }
          }
        }
      });

      // Use a scaling ratio to link raw cumulative tasks hours to the linear/sequential project duration
      const scaleFactor =
        sumTaskPlannedHrs > 0 ? targetTotalHrs / sumTaskPlannedHrs : 1;

      stats.sumTotalHrs = targetTotalHrs;
      stats.sumActualHrs = sumTaskActualHrs * scaleFactor;
      stats.sumPlannedHrs = sumTaskPlannedToDate * scaleFactor;

      const hydrateWbs = (node: any) => {
        node.children.forEach(hydrateWbs);
        let minStart: number | null = null;
        let maxEnd: number | null = null;
        let totalHrs = 0;
        [...node.children, ...node.tasks].forEach((item) => {
          if (item.startDate) {
            const s = new Date(item.startDate).getTime();
            if (!minStart || s < minStart) minStart = s;
          }
          if (item.endDate) {
            const e = new Date(item.endDate).getTime();
            if (!maxEnd || e > maxEnd) maxEnd = e;
          }
          totalHrs += item.durationHrs || 0;
        });
        node.startDate = minStart ? new Date(minStart).toISOString() : null;
        node.endDate = maxEnd ? new Date(maxEnd).toISOString() : null;
        node.durationHrs = totalHrs;
      };
      rootWbs.forEach(hydrateWbs);

      const sortWbs = (node: any) => {
        node.children.sort((a: any, b: any) => a.seqNum - b.seqNum);
        node.tasks.sort((a: any, b: any) => {
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return a.startDate.localeCompare(b.startDate);
        });
        node.children.forEach(sortWbs);
      };
      rootWbs.sort((a, b) => a.seqNum - b.seqNum).forEach(sortWbs);

      const scheduleData: ScheduleData = {
        id: project.proj_id,
        name: project.proj_name || project.proj_short_name,
        fileName: fileName,
        startDate: validStarts.length ? validStarts.sort()[0] : null,
        endDate: validEnds.length ? validEnds.sort().reverse()[0] : null,
        calendarName: detectedCalendarName,
        stats,
        rootWbs,
        tasks: allTasks,
        primaryLabors: [],
        secondaryLabors: [],
      };

      const primary: LaborAssignment[] = [];
      const secondary: LaborAssignment[] = [];
      const walkTree = (nodes: any[], level: number, parentPrimary?: any) => {
        nodes.forEach((n) => {
          let currentPrimary = parentPrimary;
          if (n.durationHrs >= 1500 && level <= 3) {
            currentPrimary = { id: n.id, name: n.name };
            primary.push({
              id: n.id,
              name: n.name,
              startDate: n.startDate,
              endDate: n.endDate,
              durationHrs: n.durationHrs,
              taskCount: n.tasks?.length || 0,
            });
          }
          if (n.durationHrs < 1500 && n.durationHrs >= 100) {
            secondary.push({
              id: n.id,
              name: n.name,
              primaryWbsId: currentPrimary?.id || "",
              primaryWbsName: currentPrimary?.name || "GENÉRICO",
              startDate: n.startDate,
              endDate: n.endDate,
              durationHrs: n.durationHrs,
              subTasks: n.tasks.map((t: any) => t.name),
              taskCount: n.tasks.length,
            });
          }
          if (
            n.durationHrs < 100 &&
            (n.tasks.length > 0 ||
              (n.children.length === 0 && n.durationHrs > 0))
          ) {
            secondary.push({
              id: n.id,
              name: n.name,
              primaryWbsId: currentPrimary?.id || "",
              primaryWbsName: currentPrimary?.name || "DETALLADO",
              startDate: n.startDate,
              endDate: n.endDate,
              durationHrs: n.durationHrs,
              subTasks: n.tasks.map((t: any) => t.name),
              taskCount: n.tasks.length,
            });
          }
          if (n.children) walkTree(n.children, level + 1, currentPrimary);
        });
      };
      walkTree(rootWbs, 0, undefined);
      scheduleData.primaryLabors = primary;
      scheduleData.secondaryLabors = secondary;

      updateState({
        scheduleData,
        shiftConfig: {
          anchorDate: scheduleData.startDate
            ? scheduleData.startDate.split("T")[0]
            : state.shiftConfig?.anchorDate || "",
          anchorShift: state.shiftConfig?.anchorShift || "A",
          cycleDays: detectedCalendarName
            ? detectedCycleDays
            : state.shiftConfig?.cycleDays || 14,
          hoursPerShift: state.shiftConfig?.hoursPerShift || 12,
        },
        syncMeta: {
          ...state.syncMeta,
          lastScheduleSync: new Date().toISOString(),
        },
      });

      const allExpanded: Record<string, boolean> = {};
      const walkAll = (nodes: any[]) =>
        nodes.forEach((n) => {
          allExpanded[n.id] = true;
          if (n.children) walkAll(n.children);
        });
      walkAll(rootWbs);
      setWbsExpanded(allExpanded);
      notify(
        "success",
        `Cronograma (XER) "${fileName}" cargado correctamente.`,
      );
    } catch (error: any) {
      console.error(error);
      notify("error", "Error al procesar el archivo XER: " + error.message);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processXerBlob(file, file.name);
  };

  const handleLoadFromGoogleDrive = async () => {
    try {
      await openGooglePicker({
        onPicked: async (file, blob) => {
          await processXerBlob(blob, file.name);
        },
        notify: (type, msg) => notify(type === "warning" ? "info" : type, msg),
      });
    } catch (err: any) {
      console.error(err);
      notify(
        "error",
        "Error al cargar cronograma desde Google Drive: " + err.message,
      );
    }
  };

  useEffect(() => {
    const handleGlobalPicker = () => {
      handleLoadFromGoogleDrive();
    };
    window.addEventListener("load-gantt-drive", handleGlobalPicker);
    return () =>
      window.removeEventListener("load-gantt-drive", handleGlobalPicker);
  }, []);

  const targetDateForGantt = useMemo(() => {
    if (state.selectedDate) {
      const d = new Date(state.selectedDate + "T12:00:00");
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [state.selectedDate]);

  const ganttRange = useMemo(() => {
    if (!state.scheduleData?.startDate || !state.scheduleData?.endDate)
      return null;
    const projectStart = new Date(state.scheduleData.startDate);
    const start = new Date(Math.min(projectStart.getTime(), targetDateForGantt.getTime()));
    start.setDate(start.getDate() - 14);
    start.setHours(0, 0, 0, 0);
    const end = new Date(state.scheduleData.endDate);
    end.setDate(end.getDate() + 21);
    const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000);
    return { start, end, dayCount };
  }, [state.scheduleData, targetDateForGantt]);

  const reportsByTask = useMemo(() => {
    const map: Record<string, DailyReport[]> = {};
    (state.dailyReports || []).forEach((r) => {
      if (!map[r.tipo]) map[r.tipo] = [];
      map[r.tipo].push(r);
    });
    return map;
  }, [state.dailyReports]);

  const reportsByWbs = useMemo(() => {
    const map: Record<string, DailyReport[]> = {};
    (state.dailyReports || []).forEach((r) => {
      if (!map[r.wbs]) map[r.wbs] = [];
      map[r.wbs].push(r);
    });
    return map;
  }, [state.dailyReports]);

  const filteredWbs = useMemo(() => {
    if (!state.scheduleData) return [];
    if (!searchQuery.trim()) return state.scheduleData.rootWbs;

    const query = searchQuery.toLowerCase().trim();

    const filterNode = (node: WBSNode): WBSNode | null => {
      const matchNode = node.name.toLowerCase().includes(query);
      const filteredTasks = node.tasks.filter((t) =>
        t.name.toLowerCase().includes(query),
      );
      const filteredChildren = node.children
        .map(filterNode)
        .filter(Boolean) as WBSNode[];

      if (
        matchNode ||
        filteredTasks.length > 0 ||
        filteredChildren.length > 0
      ) {
        return {
          ...node,
          tasks: matchNode ? node.tasks : filteredTasks,
          children: filteredChildren,
        };
      }
      return null;
    };

    return state.scheduleData.rootWbs
      .map(filterNode)
      .filter(Boolean) as WBSNode[];
  }, [state.scheduleData, searchQuery]);

  // Auto-expand all when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      const all: Record<string, boolean> = {};
      const walk = (nodes: WBSNode[]) =>
        nodes.forEach((n) => {
          all[n.id] = true;
          walk(n.children);
        });
      walk(filteredWbs);
      setWbsExpanded(all);
    }
  }, [searchQuery, filteredWbs]);

  // Unified Focus Function
  const focusToday = (isInitial = false) => {
    if (!ganttRange || (!ganttChartRef.current && !taskListRef.current)) return;

    const today = new Date(targetDateForGantt);
    const rangeStart = new Date(ganttRange.start);
    rangeStart.setHours(0, 0, 0, 0);

    const diffDays = (today.getTime() - rangeStart.getTime()) / 86400000;
    const pxPerDay = PIXELS_PER_DAY[timeScale];
    const behavior = isInitial ? "auto" : "smooth";

    // 1. Horizontal Focus - Today at 33% from left as in user image
    if (ganttChartRef.current) {
      const chartWidth = ganttChartRef.current.clientWidth;
      const scrollLeft = diffDays * pxPerDay - chartWidth * 0.33;
      ganttChartRef.current.scrollTo({
        left: Math.max(0, scrollLeft),
        behavior,
      });
    }

    // 2. Vertical Focus - Seek the most specific active task (Detailed view)
    const activeElements = document.querySelectorAll(
      '[data-active-now="true"]',
    );
    let target: HTMLElement | null = null;
    if (activeElements.length > 0) {
      // Find the deepest level active element (highest data-level)
      // This ensures we focus on the specific tasks mentioned like "STAND BY 3"
      const sortedByLevel = Array.from(activeElements).sort((a, b) => {
        const lvlA = parseInt(a.getAttribute("data-level") || "0");
        const lvlB = parseInt(b.getAttribute("data-level") || "0");
        return lvlB - lvlA;
      });
      // Prefer task rows (last children)
      target = (sortedByLevel.find(
        (el) => el.getAttribute("data-task-row") === "true",
      ) || sortedByLevel[0]) as HTMLElement;
    } else {
      target = document.querySelector("[data-node-id]") as HTMLElement;
    }

    if (target) {
      const mainScroll = document.getElementById("main-scroll-container");
      if (mainScroll) {
        const targetRect = target.getBoundingClientRect();
        const mainScrollRect = mainScroll.getBoundingClientRect();
        const currentScrollTop = mainScroll.scrollTop;
        const targetOffsetTop = targetRect.top - mainScrollRect.top + currentScrollTop;
        
        const finalScrollTop = Math.max(0, targetOffsetTop - Math.floor(mainScrollRect.height / 3)); // Position task around 1/3 down the screen
        mainScroll.scrollTo({ top: finalScrollTop, behavior });
      }
    }
  };

  // Run on load, tab change, and scale changes
  useEffect(() => {
    if (state.activeTab !== "gantt" && state.activeTab !== undefined) return;
    if (!state.scheduleData) return;

    // Only attempt focus once comfortably after render, to avoid hijacking user scroll indefinitely
    const timers = [300, 800].map((ms) =>
      setTimeout(() => focusToday(true), ms),
    );

    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeScale, state.activeTab, state.selectedDate]);

  // Handle search date changes separately
  useEffect(() => {
    if (!searchDate || !ganttRange) return;

    const targetDate = new Date(searchDate + "T12:00:00");
    const projectStart = new Date(ganttRange.start);
    const diffDays = (targetDate.getTime() - projectStart.getTime()) / 86400000;
    const pxPerDay = PIXELS_PER_DAY[timeScale];

    if (ganttChartRef.current) {
      const chartWidth = ganttChartRef.current.clientWidth;
      ganttChartRef.current.scrollTo({
        left: Math.max(0, diffDays * pxPerDay - chartWidth / 2),
        behavior: "smooth",
      });
    }
  }, [searchDate, timeScale, ganttRange]);

  const handleDownloadGanttPdf = async () => {
    const element = document.getElementById("gantt-root-container");
    if (!element) return;

    try {
      notify("info", "Generando y descargando PDF de la carta Gantt...");

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: state.theme === "dark" ? "#0d1117" : "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a3",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const margin = 10;
      const availableWidth = pdfWidth - margin * 2;
      const availableHeight = pdfHeight - margin * 2;

      const imgProps = pdf.getImageProperties(imgData);
      const imgRatio = imgProps.width / imgProps.height;

      let finalWidth = availableWidth;
      let finalHeight = availableWidth / imgRatio;

      if (finalHeight > availableHeight) {
        finalHeight = availableHeight;
        finalWidth = availableHeight * imgRatio;
      }

      const x = (pdfWidth - finalWidth) / 2;
      const y = (pdfHeight - finalHeight) / 2;

      pdf.addImage(imgData, "PNG", x, y, finalWidth, finalHeight);

      const pdfBlob = pdf.output("blob");
      downloadPdfBlob(pdfBlob, `Carta_Gantt_Solgramia.pdf`);
      notify("success", "Carta Gantt descargada exitosamente como PDF");
    } catch (err: any) {
      console.error(err);
      notify("error", "Error al descargar el PDF de la Gantt: " + err.message);
    }
  };

  const handleShareGanttPdf = async () => {
    const element = document.getElementById("gantt-root-container");
    if (!element) return;

    try {
      notify("info", "Generando PDF de la carta Gantt para compartir...");

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: state.theme === "dark" ? "#0d1117" : "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a3",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const margin = 10;
      const availableWidth = pdfWidth - margin * 2;
      const availableHeight = pdfHeight - margin * 2;

      const imgProps = pdf.getImageProperties(imgData);
      const imgRatio = imgProps.width / imgProps.height;

      let finalWidth = availableWidth;
      let finalHeight = availableWidth / imgRatio;

      if (finalHeight > availableHeight) {
        finalHeight = availableHeight;
        finalWidth = availableHeight * imgRatio;
      }

      const x = (pdfWidth - finalWidth) / 2;
      const y = (pdfHeight - finalHeight) / 2;

      pdf.addImage(imgData, "PNG", x, y, finalWidth, finalHeight);

      const pdfBlob = pdf.output("blob");

      const success = await sharePdfFile(
        pdfBlob,
        `Carta_Gantt_Solgramia.pdf`,
        "Carta Gantt del Proyecto",
      );

      if (success) {
        notify("success", "Acción de compartir completada");
      }
    } catch (err: any) {
      console.error(err);
      notify("error", "Error al generar el PDF de la Gantt: " + err.message);
    }
  };

  const renderTimeline = () => {
    if (!ganttRange) return null;
    const pxPerDay = PIXELS_PER_DAY[timeScale];
    const months = [];
    const weeks = [];

    let current = new Date(ganttRange.start);
    for (let i = 0; i < ganttRange.dayCount; i++) {
      const date = new Date(current);
      date.setDate(date.getDate() + i);

      if (i === 0 || date.getDate() === 1) {
        const daysInMonth = new Date(
          date.getFullYear(),
          date.getMonth() + 1,
          0,
        ).getDate();
        months.push(
          <div
            key={`m-${i}`}
            className={cn(
              "flex items-center justify-center text-[10px] font-black border-r uppercase tracking-tighter",
              state.theme === "dark"
                ? "bg-[#142042] border-[#1f2a44] text-[#ffb703]"
                : "bg-gray-200 border-gray-300 text-gray-700",
            )}
            style={{ minWidth: daysInMonth * pxPerDay }}
          >
            {date.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}{" "}
            {date.getFullYear().toString().slice(-2)}
          </div>,
        );
      }

      if (i % 7 === 0) {
        weeks.push(
          <div
            key={`w-${i}`}
            className={cn(
              "flex items-center justify-center text-[9px] border-r",
              state.theme === "dark"
                ? "border-[#1f2a44] text-[#7d8590]"
                : "border-gray-200 text-gray-500",
            )}
            style={{ minWidth: 7 * pxPerDay }}
          >
            {date.toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "2-digit",
            })}
          </div>,
        );
      }
    }

    return { months, weeks };
  };

  const timeline = renderTimeline();

  const isTodayActive = (
    startDate?: string | null,
    endDate?: string | null,
  ) => {
    if (!startDate || !endDate) return false;
    const today = new Date(targetDateForGantt);
    const s = new Date(startDate);
    s.setHours(0, 0, 0, 0);
    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);

    // Add a bit of slack (1 day) to be safe
    const startSlack = new Date(s);
    startSlack.setDate(startSlack.getDate() - 1);
    const endSlack = new Date(e);
    endSlack.setDate(endSlack.getDate() + 1);

    return today >= startSlack && today <= endSlack;
  };

  const renderWbsTree = (nodes: WBSNode[], level = 0) => {
    const list = Array.isArray(nodes) ? nodes : [];
    return list.flatMap((node) => {
      const isExpanded = wbsExpanded[node.id];
      const hasChildren = node.children.length > 0 || node.tasks.length > 0;
      const isSelected = state.selectedWbsId === node.id;
      const isActiveNow = isTodayActive(node.startDate, node.endDate);

      const row = (
        <div
          key={node.id}
          data-active-now={isActiveNow}
          data-node-id={node.id}
          data-level={level}
          className={cn(
            "grid grid-cols-1 md:grid-cols-[1fr_85px_85px] items-center h-8 px-4 border-b cursor-pointer group transition-colors overflow-hidden",
            state.theme === "dark"
              ? "border-[#161b22] hover:bg-[#161b22]"
              : "border-gray-200 hover:bg-gray-100",
            level === 0 &&
              (state.theme === "dark"
                ? "bg-[#1a2230] border-l-4 border-[#ffb703] font-bold"
                : "bg-gray-200 border-l-4 border-orange-400 font-bold"),
            level === 1 &&
              (state.theme === "dark"
                ? "bg-[#141a23] border-l-4 border-blue-500"
                : "bg-gray-100 border-l-4 border-blue-500"),
            level > 1 && `pl-[${level * 16}px]`,
            isSelected && "bg-blue-500/20",
            isActiveNow &&
              (state.theme === "dark" ? "bg-blue-900/10" : "bg-blue-50"),
          )}
          style={{ paddingLeft: level * 16 + 12 }}
          onClick={() => {
            if (hasChildren)
              setWbsExpanded((prev) => ({
                ...prev,
                [node.id]: !prev[node.id],
              }));
            updateState({ selectedWbsId: node.id, selectedTaskId: null });
          }}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown size={14} className="text-[#ffb703]" />
              ) : (
                <ChevronRight size={14} className="text-[#7d8590]" />
              )
            ) : (
              <div className="w-3.5" />
            )}
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="truncate text-[10px] uppercase tracking-tight">
                {node.name}
              </span>
              {isActiveNow && (
                <span className="text-[7.5px] bg-blue-500 text-white px-1 rounded-sm font-black uppercase whitespace-nowrap">
                  Hoy
                </span>
              )}
            </div>
          </div>
          <div className="hidden md:block text-[9px] font-mono text-gray-400 text-center">
            {formatDate(node.startDate)}
          </div>
          <div className="hidden md:block text-[9px] font-mono text-gray-400 text-center">
            {formatDate(node.endDate)}
          </div>
        </div>
      );

      let childrenRows: any[] = [];
      if (isExpanded) {
        childrenRows = [
          ...renderWbsTree(node.children, level + 1),
          ...node.tasks.map((task) => {
            const isSelected = state.selectedTaskId === task.id;
            const taskActiveNow = isTodayActive(task.startDate, task.endDate);
            return (
              <div
                key={task.id}
                data-active-now={taskActiveNow}
                data-task-id={task.id}
                data-task-row="true"
                className={cn(
                  "grid grid-cols-1 md:grid-cols-[1fr_85px_85px] items-center h-8 px-4 border-b cursor-pointer group transition-colors overflow-hidden",
                  state.theme === "dark"
                    ? "border-[#161b22] hover:bg-[#161b22]"
                    : "border-gray-200 hover:bg-gray-50",
                  isSelected && "bg-blue-500/20",
                  taskActiveNow &&
                    (state.theme === "dark"
                      ? "bg-blue-900/10 shadow-[inset_4px_0_0_#3b82f6]"
                      : "bg-blue-50 shadow-[inset_4px_0_0_#3b82f6]"),
                )}
                style={{ paddingLeft: (level + 1) * 16 + 12 }}
                onClick={() =>
                  updateState({ selectedTaskId: task.id, selectedWbsId: null })
                }
              >
                <div
                  className={cn(
                    "flex items-center gap-2 overflow-hidden",
                    state.theme === "dark" ? "text-[#b8c2cc]" : "text-gray-700",
                  )}
                >
                  <div className="w-3 text-[10px] text-gray-600">▶</div>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="truncate text-[10px] uppercase font-medium">
                      {task.name}
                    </span>
                    {taskActiveNow && (
                      <span className="text-[7.5px] bg-blue-600 text-white px-1 rounded-sm font-black uppercase whitespace-nowrap">
                        H
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden md:block text-[9px] font-mono text-gray-500 text-center">
                  {formatDate(task.startDate)}
                </div>
                <div className="hidden md:block text-[9px] font-mono text-gray-500 text-center">
                  {formatDate(task.endDate)}
                </div>
              </div>
            );
          }),
        ];
      }

      return [row, ...childrenRows];
    });
  };

  const renderRowReportMarkers = (rowName: string, rowType: "task" | "wbs") => {
    if (!ganttRange || !state.dailyReports) return null;
    const pxPerDay = PIXELS_PER_DAY[timeScale];

    const rowReports =
      rowType === "task"
        ? reportsByTask[rowName] || []
        : reportsByWbs[rowName] || [];

    if (rowReports.length === 0) return null;

    const reportedDates = Array.from(new Set(rowReports.map((r) => r.date)));

    return reportedDates.map((dateStr) => {
      const date = new Date(dateStr + "T12:00:00");
      const diffDays = Math.floor(
        (date.getTime() - ganttRange.start.getTime()) / 86400000,
      );

      if (diffDays < 0 || diffDays >= ganttRange.dayCount) return null;

      const size = Math.min(pxPerDay - 4, 18);

      return (
        <button
          key={dateStr}
          onClick={(e) => {
            e.stopPropagation();
            const dateReports = rowReports.filter((r) => r.date === dateStr);
            setSelectedDayReports({
              date: dateStr,
              reports: dateReports,
              taskName: rowType === "task" ? rowName : undefined,
              wbsName: rowType === "wbs" ? rowName : undefined,
            });
          }}
          className="absolute inset-y-0 z-20 flex items-center justify-center cursor-pointer hover:bg-blue-500/10 transition-colors"
          style={{
            left: diffDays * pxPerDay,
            width: pxPerDay,
          }}
        >
          <div
            className={cn(
              "rounded-[4px] shadow-[0_0_10px_rgba(59,130,246,0.3)] border transition-transform hover:scale-125",
              state.theme === "dark"
                ? "bg-blue-500 border-blue-400"
                : "bg-blue-600 border-blue-700",
            )}
            style={{ width: size, height: size }}
          />
        </button>
      );
    });
  };

  const renderGanttRows = (nodes: WBSNode[], level = 0): any[] => {
    if (!ganttRange) return [];
    const pxPerDay = PIXELS_PER_DAY[timeScale];
    const list = Array.isArray(nodes) ? nodes : [];

    return list.flatMap((node) => {
      const isExpanded = wbsExpanded[node.id];
      const hasChildren = node.children.length > 0 || node.tasks.length > 0;
      const isActiveNow = isTodayActive(node.startDate, node.endDate);

      const nodeStart = node.startDate ? new Date(node.startDate) : null;
      const nodeEnd = node.endDate ? new Date(node.endDate) : null;

      let bar = null;
      if (nodeStart && nodeEnd) {
        const daysFromStart =
          (nodeStart.getTime() - ganttRange.start.getTime()) / 86400000;
        const durationDays = Math.max(
          1,
          (nodeEnd.getTime() - nodeStart.getTime()) / 86400000,
        );

        bar = (
          <div
            className={cn(
              "absolute h-1.5 rounded-full bg-blue-500 opacity-80 flex items-center",
              level === 0 &&
                "h-2.5 bg-gradient-to-r from-blue-400 to-[#ffb703] opacity-100 shadow-[0_0_8px_rgba(255,183,3,0.3)]",
              isActiveNow &&
                "shadow-[0_0_12px_rgba(59,130,246,0.5)] border border-white/20",
            )}
            style={{
              left: daysFromStart * pxPerDay,
              width: durationDays * pxPerDay,
            }}
          >
            <span className="absolute left-full ml-3 text-[8px] font-black uppercase text-blue-500/60 whitespace-nowrap">
              {node.name}
            </span>
          </div>
        );
      }

      const row = (
        <div
          key={`g-${node.id}`}
          data-active-now={isActiveNow}
          className={cn(
            "h-8 border-b relative group/grow bg-transparent overflow-hidden",
            state.theme === "dark" ? "border-[#161b22]" : "border-gray-200",
            level === 0 &&
              (state.theme === "dark"
                ? "bg-white/[0.02] border-b-[#2a3343]"
                : "bg-gray-400/[0.05] border-b-gray-300"),
            isActiveNow &&
              (state.theme === "dark"
                ? "bg-blue-500/10 shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]"
                : "bg-blue-500/5 shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]"),
          )}
        >
          {renderRowReportMarkers(node.name, "wbs")}
          <div className="absolute inset-0 pointer-events-none z-10">{bar}</div>
        </div>
      );

      let childrenRows: any[] = [];
      if (isExpanded) {
        childrenRows = [
          ...renderGanttRows(node.children, level + 1),
          ...node.tasks.map((task) => {
            const tStart = task.startDate ? new Date(task.startDate) : null;
            const tEnd = task.endDate ? new Date(task.endDate) : null;
            const taskActiveNow = isTodayActive(task.startDate, task.endDate);
            let tBar = null;
            if (tStart && tEnd) {
              const days =
                (tStart.getTime() - ganttRange.start.getTime()) / 86400000;
              const duration = Math.max(
                1,
                (tEnd.getTime() - tStart.getTime()) / 86400000,
              );

              const statusClass =
                task.status === "TK_Complete"
                  ? "bg-[#2ea043]"
                  : task.status === "TK_Active"
                    ? "bg-[#d29922]"
                    : state.theme === "dark"
                      ? "bg-[#30363d]"
                      : "bg-gray-300";

              if (task.isMilestone) {
                tBar = (
                  <div
                    className="absolute w-2.5 h-2.5 bg-white transform rotate-45 border border-gray-400"
                    style={{
                      left: days * pxPerDay - 5,
                      top: "50%",
                      marginTop: -5,
                    }}
                  />
                );
              } else {
                tBar = (
                  <div
                    className={cn(
                      "absolute h-3 rounded-sm shadow-sm flex items-center transition-all",
                      statusClass,
                      taskActiveNow &&
                        "ring-2 ring-blue-500 ring-offset-1 ring-offset-transparent shadow-[0_0_10px_rgba(59,130,246,0.5)]",
                    )}
                    style={{
                      left: days * pxPerDay,
                      width: Math.max(4, duration * pxPerDay),
                      top: "50%",
                      marginTop: -6,
                    }}
                  >
                    <span className="absolute left-full ml-2 text-[7px] whitespace-nowrap text-gray-500 font-bold uppercase pointer-events-none group-hover:text-blue-400 transition-colors">
                      {task.name}
                    </span>
                  </div>
                );
              }
            }

            return (
              <div
                key={`g-t-${task.id}`}
                data-active-now={taskActiveNow}
                className={cn(
                  "h-8 border-b relative group/gtask overflow-hidden",
                  state.theme === "dark"
                    ? "border-[#161b22]"
                    : "border-gray-200",
                  taskActiveNow &&
                    (state.theme === "dark"
                      ? "bg-blue-500/5 transition-colors"
                      : "bg-blue-50/30 transition-colors"),
                )}
              >
                {renderRowReportMarkers(task.name, "task")}
                <div className="absolute inset-0 pointer-events-none z-10">
                  {tBar}
                </div>
              </div>
            );
          }),
        ];
      }

      return [row, ...childrenRows];
    });
  };

  return (
    <div className="flex flex-col min-h-full overflow-x-hidden">
      {/* Top Section: Dashboard Summary */}
      {!state.scheduleData ? (
        <div className="p-20 flex flex-col items-center justify-center text-center gap-6">
          <div className="p-8 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500">
            <Upload size={48} />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">
              Cargar Cronograma Primavera P6
            </h2>
            <p className="text-sm text-gray-500 max-w-md">
              Selecciona un archivo .xer para visualizar el WBS, el Gantt y
              sincronizar el estado del proyecto.
            </p>
          </div>
          <div className="flex gap-4 flex-wrap justify-center items-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all min-w-[160px] justify-center border shadow-xl cursor-pointer",
                state.theme === "dark"
                  ? "bg-[#ffb703] text-black border-[#ffb703] hover:bg-[#ffb703]/90"
                  : "bg-blue-600 text-white border-none hover:bg-blue-700",
              )}
            >
              <Upload size={18} />
              CARGAR XER
            </button>
          </div>
          <input
            id="xer-upload-input"
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".xer"
            onChange={handleFileUpload}
          />
        </div>
      ) : (
        <>
          {/* Collapsible Top Panel (Legend and Stats Grid) */}
          <div
            className={cn(
              "transition-all duration-300 ease-in-out overflow-hidden shrink-0 border-b",
              showTopPanel
                ? "max-h-[300px] opacity-100"
                : "max-h-0 opacity-0 pointer-events-none",
            )}
            style={{
              borderColor: state.theme === "dark" ? "#1f2a44" : "#e5e7eb",
            }}
          >
            {/* Context Legend */}
            <div
              className={cn(
                "p-2 px-4 md:px-6 flex flex-col md:flex-row justify-between items-start md:items-center border-b gap-2",
                state.theme === "dark"
                  ? "border-[#1f2a44] bg-[#0d1117]"
                  : "bg-gray-100 border-gray-200",
              )}
            >
              <div className="flex flex-wrap gap-2 md:gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase text-gray-500">
                    Indicador Hoy
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-black uppercase text-gray-500">
                    En Ejecución
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-blue-500/30 border border-blue-400 shadow-[0_0_5px_rgba(59,130,246,0.5)]" />
                  <span className="text-[10px] font-black uppercase text-blue-500">
                    Reportado Diariamente
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button
                    onClick={handleDownloadGanttPdf}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase shadow-sm transition-all border active:scale-95 cursor-pointer",
                      state.theme === "dark"
                        ? "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                        : "bg-red-50 text-red-600 border-red-100 hover:bg-red-100",
                    )}
                    title="Generar y Descargar Carta Gantt como PDF"
                  >
                    <Download size={13} className="text-red-500" /> Descargar
                    PDF
                  </button>
                  <button
                    onClick={handleShareGanttPdf}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase shadow-sm transition-all border active:scale-95 cursor-pointer",
                      state.theme === "dark"
                        ? "bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20"
                        : "bg-violet-50 text-violet-600 border-violet-100 hover:bg-violet-100",
                    )}
                    title="Generar y Compartir Carta Gantt por menú del dispositivo"
                  >
                    <Share2 size={13} className="text-violet-500" /> Compartir
                  </button>
                </div>
                <div className="text-[9px] md:text-[10px] font-bold text-gray-400 italic">
                  Sincronización:{" "}
                  {new Date().toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </div>
            </div>

            <div className="hidden md:block">
              <div
                className={cn(
                  "grid grid-cols-4 md:grid-cols-9",
                  state.theme === "dark" ? "bg-[#11151c]" : "bg-white",
                )}
              >
                <div
                  className={cn(
                    "p-3 border-r flex flex-col justify-center",
                    state.theme === "dark"
                      ? "border-[#1f2a44]"
                      : "border-gray-200",
                  )}
                >
                  <span className="text-[9px] font-bold text-gray-500 uppercase">
                    PROYECTO
                  </span>
                  <div className="text-sm font-bold truncate">
                    {state.scheduleData.name}
                  </div>
                </div>
                <div
                  className={cn(
                    "p-3 border-r flex flex-col justify-center col-span-2",
                    state.theme === "dark"
                      ? "border-[#1f2a44]"
                      : "border-gray-200",
                  )}
                >
                  <span className="text-[9px] font-bold text-gray-500 uppercase">
                    AVANCE P6
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold font-mono">
                      {(
                        (state.scheduleData.stats.sumActualHrs /
                          state.scheduleData.stats.sumTotalHrs) *
                        100
                      ).toFixed(1)}
                      %
                    </span>
                    <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{
                          width: `${(state.scheduleData.stats.sumActualHrs / state.scheduleData.stats.sumTotalHrs) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    "p-3 border-r flex flex-col justify-center",
                    state.theme === "dark"
                      ? "border-[#1f2a44]"
                      : "border-gray-200",
                  )}
                >
                  <span className="text-[9px] font-bold text-gray-500 uppercase">
                    TAREAS
                  </span>
                  <div className="text-lg font-bold font-mono">
                    {state.scheduleData.stats.total}
                  </div>
                  <div className="text-[9px] text-gray-500">
                    {state.scheduleData.stats.wbsCount} WBS
                  </div>
                </div>
                <div
                  className={cn(
                    "p-3 border-r flex flex-col justify-center",
                    state.theme === "dark"
                      ? "border-[#1f2a44]"
                      : "border-gray-200",
                  )}
                >
                  <span className="text-[9px] font-bold text-green-600 uppercase">
                    HECHAS
                  </span>
                  <div className="text-lg font-bold font-mono text-green-500">
                    {completedTaskCount}
                  </div>
                </div>
                <div
                  className={cn(
                    "p-3 border-r flex flex-col justify-center",
                    state.theme === "dark"
                      ? "border-[#1f2a44]"
                      : "border-gray-200",
                  )}
                >
                  <span className="text-[9px] font-bold text-yellow-600 uppercase">
                    HITOS
                  </span>
                  <div className="text-lg font-bold font-mono text-yellow-500">
                    {state.scheduleData.stats.milestones}
                  </div>
                </div>
                <div
                  className={cn(
                    "p-3 border-r flex flex-col justify-center",
                    state.theme === "dark"
                      ? "border-[#1f2a44]"
                      : "border-gray-200",
                  )}
                >
                  <span className="text-[9px] font-bold text-gray-500 uppercase">
                    INICIO
                  </span>
                  <div className="text-xs font-mono">
                    {formatDate(state.scheduleData.startDate)}
                  </div>
                </div>
                <div
                  className={cn(
                    "p-3 border-r flex flex-col justify-center",
                    state.theme === "dark"
                      ? "border-[#1f2a44]"
                      : "border-gray-200",
                  )}
                >
                  <span className="text-[9px] font-bold text-gray-500 uppercase">
                    FIN
                  </span>
                  <div className="text-xs font-mono">
                    {formatDate(state.scheduleData.endDate)}
                  </div>
                </div>
                <div className="p-3 flex flex-col justify-center">
                  <span className="text-[9px] font-bold text-gray-500 uppercase">
                    DÍAS
                  </span>
                  <div className="text-lg font-bold font-mono">
                    {Math.ceil(
                      (new Date(state.scheduleData.endDate!).getTime() -
                        new Date(state.scheduleData.startDate!).getTime()) /
                        86400000,
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "flex items-center gap-6 px-6 py-2 border-b overflow-x-auto text-xs whitespace-nowrap scrollbar-hide",
              state.theme === "dark" ? "border-[#1f2a44]" : "border-gray-200",
            )}
          >
            <div className="flex items-center gap-3">
              <span className="font-black text-[10px] text-blue-500 uppercase tracking-widest bg-blue-500/10 px-2 py-1 rounded">
                Ir a fecha
              </span>
              <div className="flex gap-2">
                <div className="relative">
                  <Calendar
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500"
                  />
                  <input
                    type="date"
                    value={searchDate}
                    onChange={(e) => setSearchDate(e.target.value)}
                    className={cn(
                      "border-2 rounded-xl pl-10 pr-3 py-2 w-44 focus:outline-none focus:ring-4 focus:ring-blue-500/20 font-black text-xs transition-all",
                      state.theme === "dark"
                        ? "bg-[#1a2440] border-blue-500/30 text-blue-400"
                        : "bg-white border-blue-100 text-blue-600 shadow-sm",
                    )}
                  />
                </div>
                {searchDate || true ? (
                  <button
                    onClick={() => {
                      setSearchDate("");
                      focusToday();
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ring-1 ring-blue-500/20",
                      state.theme === "dark"
                        ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/40"
                        : "bg-blue-50 text-blue-600 hover:bg-blue-100",
                    )}
                  >
                    ENFOCAR HOY
                  </button>
                ) : null}
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Buscar actividad..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={cn(
                      "border rounded-xl pl-10 pr-4 py-2 w-48 focus:outline-none focus:border-blue-500 text-xs transition-all",
                      state.theme === "dark"
                        ? "bg-[#1a2440] border-[#1f2a44]"
                        : "bg-white border-gray-200",
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-[10px] text-gray-500 uppercase tracking-wider">
                Escala
              </span>
              <div
                className={cn(
                  "flex border rounded overflow-hidden",
                  state.theme === "dark"
                    ? "bg-[#1a2440] border-[#1f2a44]"
                    : "bg-white border-gray-300",
                )}
              >
                {(["day", "week", "month"] as const).map((scale) => (
                  <button
                    key={scale}
                    onClick={() => setTimeScale(scale)}
                    className={cn(
                      "px-3 py-1.5 capitalize transition-colors",
                      timeScale === scale
                        ? "bg-blue-500 text-white font-bold"
                        : state.theme === "dark"
                          ? "text-gray-400 hover:text-white"
                          : "text-gray-500 hover:text-gray-900",
                    )}
                  >
                    {scale === "day" ? "Día" : scale === "week" ? "Sem" : "Mes"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsTaskPanelHidden(!isTaskPanelHidden)}
                className={cn(
                  "px-4 py-1.5 border rounded transition-colors",
                  state.theme === "dark"
                    ? "bg-[#1a2440] border-[#1f2a44] hover:bg-[#23315a]"
                    : "bg-white border-gray-300 hover:bg-gray-50",
                )}
              >
                {isTaskPanelHidden ? "Mostrar tareas" : "Ocultar tareas"}
              </button>
            </div>

            <div className="ml-auto flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-1.5 rounded-sm bg-[#2ea043]" />{" "}
                <span className="text-[10px] text-gray-500">Completada</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-1.5 rounded-sm bg-[#d29922]" />{" "}
                <span className="text-[10px] text-gray-500">En curso</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    "w-2.5 h-1.5 rounded-sm",
                    state.theme === "dark" ? "bg-[#30363d]" : "bg-gray-300",
                  )}
                />{" "}
                <span className="text-[10px] text-gray-500">No iniciada</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    "w-2 h-2 rotate-45",
                    state.theme === "dark"
                      ? "bg-white"
                      : "bg-black border border-gray-400",
                  )}
                />{" "}
                <span className="text-[10px] text-gray-500">Hito</span>
              </div>
            </div>
          </div>

          <div
            id="gantt-root-container"
            className="flex flex-none relative"
          >
            <div
              className={cn(
                "flex flex-col flex-none transition-all border-r",
                isTaskPanelHidden ? "w-0 opacity-0" : "opacity-100",
                state.theme === "dark"
                  ? "bg-[#0a0e14] border-[#1f2a44]"
                  : "bg-white border-gray-300",
              )}
              style={{
                width: isTaskPanelHidden
                  ? 0
                  : typeof window !== "undefined" && window.innerWidth < 768
                    ? "45vw"
                    : taskPanelWidth,
                maxWidth: "calc(100vw - 20px)",
              }}
            >
              <div
                className={cn(
                  "grid grid-cols-1 md:grid-cols-[1fr_85px_85px] h-[40px] items-center px-4 border-b text-[9px] font-black text-gray-500 uppercase tracking-widest sticky top-0 z-30",
                  state.theme === "dark"
                    ? "bg-[#11151c] border-[#1f2a44]"
                    : "bg-gray-100 border-gray-200",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap">Actividad / WBS</span>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setWbsExpanded({});
                      }}
                      className={cn(
                        "w-6 h-6 flex items-center justify-center border rounded shadow-sm transition-colors",
                        state.theme === "dark"
                          ? "border-gray-800 bg-gray-900 hover:text-white"
                          : "border-gray-300 bg-white hover:text-gray-900",
                      )}
                    >
                      <Minus size={10} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const all: Record<string, boolean> = {};
                        const walk = (nodes: WBSNode[]) =>
                          nodes.forEach((n) => {
                            all[n.id] = true;
                            walk(n.children);
                          });
                        if (state.scheduleData)
                          walk(state.scheduleData.rootWbs);
                        setWbsExpanded(all);
                      }}
                      className={cn(
                        "w-6 h-6 flex items-center justify-center border rounded shadow-sm transition-colors",
                        state.theme === "dark"
                          ? "border-gray-800 bg-gray-900 hover:text-white"
                          : "border-gray-300 bg-white hover:text-gray-900",
                      )}
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                </div>
                <div className="text-center hidden md:block">Inicio</div>
                <div className="text-center hidden md:block">Fin</div>
              </div>
              <div
                ref={taskListRef}
                id="gantt-task-list"
                className="flex-none"
              >
                {renderWbsTree(filteredWbs)}
              </div>
            </div>

            <div
              onMouseDown={() => setIsResizing(true)}
              className={cn(
                "w-1 cursor-col-resize hover:bg-blue-500 transition-colors z-10",
                state.theme === "dark" ? "bg-[#1f2a44]" : "bg-gray-300",
                isTaskPanelHidden && "hidden",
              )}
            />

            <div
              className={cn(
                "flex-1 flex flex-col min-w-0",
                state.theme === "dark" ? "bg-[#0a0e14]" : "bg-white",
              )}
            >
              <div
                className={cn(
                  "h-[40px] border-b overflow-hidden sticky top-0 z-30",
                  state.theme === "dark"
                    ? "border-[#1f2a44] bg-[#11151c]"
                    : "border-gray-200 bg-gray-100",
                )}
              >
                <div
                  ref={ganttHeaderRef}
                  className="overflow-hidden flex flex-col h-full"
                >
                  <div
                    className={cn(
                      "flex h-5 border-b",
                      state.theme === "dark"
                        ? "border-[#1f2a44]"
                        : "border-gray-200",
                    )}
                  >
                    {timeline?.months}
                  </div>
                  <div className="flex h-5">{timeline?.weeks}</div>
                </div>
              </div>
              <div
                ref={ganttChartRef}
                id="gantt-chart-container"
                onScroll={() => handleScrollSet("ganttChart")}
                className="overflow-x-auto relative scrolling-touch"
              >
                {ganttRange && state.scheduleData && (
                  <div
                    className="relative min-h-full flex flex-col"
                    style={{
                      width:
                        ganttRange.dayCount * PIXELS_PER_DAY[timeScale] + 1000,
                    }}
                  >
                    {/* Capa 0: Cuadrícula de Fondo (Cuadritos) con SVG para estabilidad */}
                    <div className="absolute inset-0 pointer-events-none z-0">
                      <svg
                        width="100%"
                        height="100%"
                        className={
                          state.theme === "dark" ? "opacity-30" : "opacity-20"
                        }
                      >
                        <defs>
                          <pattern
                            id="ganttGrid"
                            width={PIXELS_PER_DAY[timeScale]}
                            height="32"
                            patternUnits="userSpaceOnUse"
                          >
                            <path
                              d={`M ${PIXELS_PER_DAY[timeScale]} 0 L 0 0 0 32`}
                              fill="none"
                              stroke={
                                state.theme === "dark" ? "white" : "black"
                              }
                              strokeWidth="0.5"
                            />
                          </pattern>
                        </defs>
                        <rect
                          width="100%"
                          height="100%"
                          fill="url(#ganttGrid)"
                        />
                      </svg>
                    </div>

                    {/* Capa 1: Celdas de interacción (Capturan clics) */}
                    <div
                      className="absolute inset-0 flex pointer-events-none z-10"
                      style={{
                        width: ganttRange.dayCount * PIXELS_PER_DAY[timeScale],
                      }}
                    >
                      {Array.from({ length: ganttRange.dayCount }).map(
                        (_, i) => {
                          const date = new Date(ganttRange.start);
                          date.setDate(date.getDate() + i);
                          const dateStr = date.toISOString().slice(0, 10);
                          const dayReports = state.dailyReports.filter(
                            (r) => r.date === dateStr,
                          );
                          const hasReports = dayReports.length > 0;
                          const isWeekend =
                            date.getDay() === 0 || date.getDay() === 6;

                          return (
                            <div
                              key={i}
                              onClick={() => {
                                setSelectedDayReports({
                                  date: dateStr,
                                  reports: dayReports,
                                });
                              }}
                              className={cn(
                                "border-r transition-all relative group/day cursor-pointer pointer-events-auto",
                                state.theme === "dark"
                                  ? "border-white/[0.08]"
                                  : "border-gray-300/30",
                                isWeekend &&
                                  (state.theme === "dark"
                                    ? "bg-white/[0.02]"
                                    : "bg-gray-100/20"),
                                hasReports &&
                                  (state.theme === "dark"
                                    ? "bg-blue-500/10"
                                    : "bg-blue-500/5"),
                              )}
                              style={{
                                width: PIXELS_PER_DAY[timeScale],
                                height: "100%",
                              }}
                            >
                              {hasReports && (
                                <div className="absolute inset-x-0 top-1 flex flex-col items-center justify-start pointer-events-none">
                                  <div className="p-0.5 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(59,130,246,0.8)]">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                  </div>
                                  <div className="text-[7px] font-black mt-1 uppercase tracking-tighter px-1 rounded bg-blue-600 text-white border border-blue-400">
                                    REP
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>

                    {/* Capa 2: Hoy Marker (Visible pero sin bloquear clics) */}
                    {(() => {
                      const today = new Date(targetDateForGantt);
                      const start = new Date(ganttRange.start);
                      start.setHours(0, 0, 0, 0);
                      const diffDays = Math.floor(
                        (today.getTime() - start.getTime()) / 86400000,
                      );

                      if (diffDays >= 0 && diffDays < ganttRange.dayCount) {
                        const pxPerDay = PIXELS_PER_DAY[timeScale];
                        return (
                          <div
                            className="absolute inset-y-0 pointer-events-none z-20"
                            style={{
                              left: diffDays * pxPerDay,
                              width: pxPerDay,
                            }}
                          >
                            <div className="absolute inset-0 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]" />
                            <div className="absolute inset-y-0 border-l-2 border-red-600 z-50">
                              <div className="absolute top-1 left-0 transform -translate-x-1/2 flex flex-col items-center">
                                <div className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded-full shadow-lg border border-white/20 flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                  HOY
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <div className="relative z-30 pointer-events-none">
                      {renderGanttRows(filteredWbs)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {selectedDayReports && (
             <FloatingCalendarModal
               isOpen={!!selectedDayReports}
               onClose={() => setSelectedDayReports(null)}
               initialDate={selectedDayReports.date}
             />
          )}
        </>
      )}
    </div>
  );
}
