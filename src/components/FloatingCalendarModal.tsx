import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, ListTodo, Search, Filter, PlusCircle, Check, Users, Briefcase, Clock, FileText, User, Info, Loader2, Trash2, Camera } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { useApp } from '../AppContext';
import { DailyReport } from '../types';
import ConfirmModal from './ConfirmModal';

interface FloatingCalendarModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  isInline?: boolean;
  initialDate?: string;
}

const DAYS_OF_WEEK = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function FloatingCalendarModal({ isOpen = false, onClose, isInline = false, initialDate }: FloatingCalendarModalProps) {
  const { state, exportToCalendar, updateState, addDailyReport, updateDailyReport, updateTaskStatus, deleteDailyReport, notify } = useApp();
  const [currentDate, setCurrentDate] = useState(initialDate ? new Date(initialDate + "T12:00:00") : new Date());
  const [selectedDayInfo, setSelectedDayInfo] = useState<{ dateObj: Date, dateStr: string, tasks: any[] } | null>(null);
  const [viewingHistoryDayReports, setViewingHistoryDayReports] = useState<{ dateStr: string, dateObj: Date, reports: DailyReport[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'TK_Active' | 'TK_Complete' | 'pending'>('all');
  const [viewingReport, setViewingReport] = useState<DailyReport | null>(null);
  const [reportToDelete, setReportToDelete] = useState<DailyReport | null>(null);

  const extraReports = useMemo(() => {
    if (!selectedDayInfo) return [];
    return state.dailyReports?.filter(r => 
      r.date === selectedDayInfo.dateStr && 
      !r.p6Matched
    ) || [];
  }, [state.dailyReports, selectedDayInfo]);

  const hasProgrammed = selectedDayInfo ? selectedDayInfo.tasks.length > 0 : false;

  // Dynamically detect actually used groups in active personnel
  const allAvailableGroups = useMemo(() => {
    const groups = new Set<string>();
    (state.personnelData?.personalActivo || []).forEach(p => {
      const g = (p.grupo || '').trim().toUpperCase();
      if (g && g !== 'S/G' && g !== 'S/N' && g !== 'S' && g !== 'SN' && g !== 'SIN GRUPO' && g !== '-' && g !== '') {
        groups.add(g);
      }
    });
    return Array.from(groups).sort();
  }, [state.personnelData]);

  // getWorkingGroupForDate logic
  const getWorkingGroupForDate = (targetDate: Date): string[] => {
    let manualOffset = (state.syncMeta as any)?.turnOffset || 0;
    let rawGroups: string[] = [];
    
    if (state.shiftConfig && state.shiftConfig.anchorDate) {
      const { anchorDate, anchorShift, cycleDays } = state.shiftConfig;
      const anchor = new Date(anchorDate + 'T12:00:00');
      anchor.setHours(12, 0, 0, 0);
      
      const currentMidDay = new Date(targetDate.getTime());
      currentMidDay.setHours(12, 0, 0, 0);
      
      let diffAnchor = Math.floor((currentMidDay.getTime() - anchor.getTime()) / 86400000);
      diffAnchor += manualOffset;
      
      const cycleTotalGlobal = cycleDays * 2;
      const posInGlobalCycle = ((diffAnchor % cycleTotalGlobal) + cycleTotalGlobal) % cycleTotalGlobal;
      const isAWorking = posInGlobalCycle < cycleDays; 
      
      const isAWorkingNow = anchorShift === 'A' ? isAWorking : !isAWorking;
      rawGroups = isAWorkingNow ? ['A', 'C'] : ['B', 'D'];
    } else {
      let baseDate: Date;
      if (state.scheduleData?.startDate) {
        baseDate = new Date(state.scheduleData.startDate + 'T00:00:00');
      } else {
        baseDate = new Date(2024, 0, 1);
      }
      baseDate.setHours(0, 0, 0, 0);

      let t = 14;
      let d = 14;

      if (state.scheduleData?.calendarName) {
        const match = state.scheduleData.calendarName.match(/(\d{1,2})\s*[xX]\s*(\d{1,2})/i);
        if (match) {
          t = parseInt(match[1]);
          d = parseInt(match[2]);
        } else {
          const dMatch = state.scheduleData.calendarName.match(/(\d{1,2})/);
          if (dMatch) {
            t = parseInt(dMatch[1]);
            d = parseInt(dMatch[1]);
          }
        }
      } else if (state.shiftConfig?.cycleDays) {
        t = state.shiftConfig.cycleDays;
        d = state.shiftConfig.cycleDays;
      }

      const cycleTotal = t + d;
      let diffDays = Math.floor((targetDate.getTime() - baseDate.getTime()) / 86400000);
      diffDays += manualOffset;
      const positionInCycle = ((diffDays % cycleTotal) + cycleTotal) % cycleTotal;
      
      if (positionInCycle < t) {
        rawGroups = ['A', 'C'];
      } else {
        rawGroups = ['B', 'D'];
      }
    }

    // Filter to show ONLY the groups that are actually detected in the system!
    if (allAvailableGroups.length > 0) {
      const detected = rawGroups.filter(g => allAvailableGroups.includes(g));
      if (detected.length > 0) {
        return detected;
      }
    }
    return rawGroups;
  };

  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (initialDate && isOpen && state.scheduleData && state.scheduleData.tasks) {
      if (selectedDayInfo && selectedDayInfo.dateStr === initialDate) return;
      const dateObj = new Date(initialDate + "T12:00:00");
      const dateStr = initialDate;
      const dayTasks: any[] = [];
      const lowerSearch = searchQuery.toLowerCase();

      for (const t of state.scheduleData.tasks) {
        try {
          let startStr = t.startDate ? (typeof t.startDate === 'string' ? t.startDate.slice(0, 10) : new Date(t.startDate).toISOString().slice(0, 10)) : null;
          let endStr = t.endDate ? (typeof t.endDate === 'string' ? t.endDate.slice(0, 10) : new Date(t.endDate).toISOString().slice(0, 10)) : startStr;
          
          if (!startStr) continue;
          if (!endStr) endStr = startStr;

          if (dateStr >= startStr && dateStr <= endStr) {
            dayTasks.push(t);
          }
        } catch (e) {}
      }
      setSelectedDayInfo({ dateObj, dateStr, tasks: dayTasks });
    } else if (isInline && !autoOpenedRef.current && state.scheduleData && state.scheduleData.tasks) {
      const today = new Date();
      const y = today.getFullYear(); 
      const m = String(today.getMonth() + 1).padStart(2, '0'); 
      const day = String(today.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      
      const todayTasks: any[] = [];
      const lowerSearch = searchQuery.toLowerCase();

      for (const t of state.scheduleData.tasks) {
        try {
          let startStr = t.startDate ? (typeof t.startDate === 'string' ? t.startDate.slice(0, 10) : new Date(t.startDate).toISOString().slice(0, 10)) : null;
          let endStr = t.endDate ? (typeof t.endDate === 'string' ? t.endDate.slice(0, 10) : new Date(t.endDate).toISOString().slice(0, 10)) : startStr;
          
          if (!startStr) continue;
          if (!endStr) endStr = startStr;

          if (statusFilter !== 'all') {
            if (statusFilter === 'pending' && (t.status === 'TK_Complete' || t.status === 'TK_Active')) continue;
            if (statusFilter !== 'pending' && t.status !== statusFilter) continue;
          }

          if (lowerSearch && !t.name?.toLowerCase().includes(lowerSearch) && !t.wbsName?.toLowerCase().includes(lowerSearch)) {
            continue;
          }

          if (dateStr >= startStr && dateStr <= endStr) {
            todayTasks.push(t);
          }
        } catch (e) {}
      }

      setSelectedDayInfo({
        dateObj: today,
        dateStr: dateStr,
        tasks: todayTasks
      });
      autoOpenedRef.current = true;
    }
  }, [isOpen, initialDate, isInline, state.scheduleData, searchQuery, statusFilter]);

  // Report Form States
  const [reportForm, setReportForm] = useState<{
    laborName: string;
    parentWbsName: string;
    supervisor: string;
    detalle: string;
    selectedWorkers: { name: string; hours: number }[];
    status: 'pendiente' | 'ejecucion' | 'listo';
    taskId?: string;
    id?: string;
  } | null>(null);
  
  const [selectedPrimaryWbsId, setSelectedPrimaryWbsId] = useState<string>('');
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerGroupFilter, setWorkerGroupFilter] = useState<string>('TODOS');
  const [isSavingReport, setIsSavingReport] = useState(false);

  // Camera capture state for adding photos to an existing report
  const [cameraReportToUpdate, setCameraReportToUpdate] = useState<DailyReport | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveCapturedPhoto, setLiveCapturedPhoto] = useState<string | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = async (mode: 'environment' | 'user' = cameraFacingMode) => {
    setIsCameraLoading(true);
    setCameraError(null);
    setLiveCapturedPhoto(null);
    
    if (cameraStream) {
      try {
        cameraStream.getTracks().forEach((track) => track.stop());
      } catch (e) {}
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError(
        "El navegador o entorno de iframe no admite la cámara en vivo aquí. Use el botón 'Tomar Foto Nativa / Selector' para abrir la cámara de su teléfono."
      );
      setIsCameraLoading(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera access failed:", err);
      try {
        // Simple video fallback
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        setCameraStream(fallbackStream);
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
        }
      } catch (fallbackErr: any) {
        setCameraError(
          "Entorno de transmisión de cámara en vivo no disponible. Puede usar el botón de abajo para tomar fotos directamente con su cámara nativa o subir una imagen de su galería."
        );
        notify("info", "La cámara en vivo requiere permisos. Use la opción de Cámara Nativa o Galería.");
      }
    } finally {
      setIsCameraLoading(false);
    }
  };

  const handleNativePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    
    if (!file.type.startsWith("image/")) {
      notify("error", "Por favor seleccione solo archivos de imagen (formats JPG, PNG, WEBP).");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      notify("error", "La imagen supera el límite de 3MB.");
      return;
    }
    
    setIsCameraLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setLiveCapturedPhoto(event.target.result as string);
        notify("success", "Imagen cargada. Puede confirmar y guardar para añadirla al reporte.");
      }
      setIsCameraLoading(false);
    };
    reader.onerror = () => {
      notify("error", "Error al leer el archivo de imagen.");
      setIsCameraLoading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset file index
  };

  const stopCamera = () => {
    if (cameraStream) {
      try {
        cameraStream.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      setCameraStream(null);
    }
    setLiveCapturedPhoto(null);
    setCameraError(null);
    setIsCameraActive(false);
    setCameraReportToUpdate(null);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      const ctx = canvas.getContext("2d");
      if (ctx) {
        if (cameraFacingMode === 'user') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setLiveCapturedPhoto(dataUrl);
        
        // Flash visual
        const flash = document.createElement("div");
        flash.className = "fixed inset-0 bg-white/90 z-[300] pointer-events-none transition-opacity duration-300";
        document.body.appendChild(flash);
        setTimeout(() => {
          flash.style.opacity = "0";
          setTimeout(() => flash.remove(), 250);
        }, 30);
      }
    } catch (err: any) {
      console.error("Error capturing photo:", err);
      notify("error", "Error al capturar imagen: " + err.message);
    }
  };

  const saveLiveCapturedPhoto = async () => {
    if (liveCapturedPhoto && cameraReportToUpdate) {
      const currentImages = cameraReportToUpdate.images || [];
      const updatedImages = [...currentImages, liveCapturedPhoto];
      
      try {
        await updateDailyReport(String(cameraReportToUpdate.id), { images: updatedImages });
        notify("success", "Fotografía capturada y guardada en el reporte diario.");
        stopCamera();
      } catch (err: any) {
        console.error("Error updating report with photo:", err);
        notify("error", "Error al guardar foto: " + err.message);
      }
    }
  };

  const toggleCameraFacing = () => {
    const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(nextMode);
    startCamera(nextMode);
  };

  useEffect(() => {
    return () => {
      if (cameraStream) {
        try {
          cameraStream.getTracks().forEach((track) => track.stop());
        } catch (e) {}
      }
    };
  }, [cameraStream]);

  const handleStartReportForm = (task: any | null) => {
    let matchedWbsId = '';
    const primaryLabors = state.scheduleData?.primaryLabors || [];
    if (task && task.wbsId) {
      const match = primaryLabors.find(p => p.id === task.wbsId);
      if (match) matchedWbsId = match.id;
    }
    if (!matchedWbsId && primaryLabors.length > 0) {
      matchedWbsId = primaryLabors[0].id;
    }

    // Match if there is an existing report for this task on this day
    const existingReport = selectedDayInfo && task
      ? state.dailyReports?.find(r => 
          r.date === selectedDayInfo.dateStr && 
          (r.taskId === task.id || r.tipo?.trim().toLowerCase() === task.name?.trim().toLowerCase())
        )
      : null;

    if (existingReport && existingReport.wbs) {
      const matchWbs = primaryLabors.find(p => p.name === existingReport.wbs);
      if (matchWbs) matchedWbsId = matchWbs.id;
    }
    setSelectedPrimaryWbsId(matchedWbsId);

    const supervisorValue = existingReport?.sup || '';
    const detalleValue = existingReport?.detalle || '';
    const statusValue = existingReport?.status || (task?.status === 'TK_Complete' ? 'listo' : (task?.status === 'TK_Active' ? 'ejecucion' : 'pendiente'));
    const workersValue = existingReport?.workersDetail || existingReport?.workers?.map((w: string) => ({ name: w, hours: 12.0 })) || [];

    setReportForm({
      id: existingReport?.id ? String(existingReport.id) : undefined,
      laborName: existingReport?.tipo || (task ? task.name : ''),
      parentWbsName: existingReport?.wbs || (task ? (task.wbsName || 'General') : ''),
      supervisor: supervisorValue,
      detalle: detalleValue,
      selectedWorkers: workersValue,
      status: statusValue as any,
      taskId: task?.id
    });
    setWorkerSearch('');
    
    // Default to the working group active on this day!
    if (selectedDayInfo) {
      const workingGrps = getWorkingGroupForDate(selectedDayInfo.dateObj);
      const mainGroup = workingGrps.find(g => allAvailableGroups.includes(g)) || workingGrps[0];
      if (mainGroup) {
        setWorkerGroupFilter(mainGroup.toUpperCase());
      } else {
        setWorkerGroupFilter('TODOS');
      }
    } else {
      setWorkerGroupFilter('TODOS');
    }
  };

  const activePersonnelOnShift = useMemo(() => {
    if (!selectedDayInfo) return [];

    const targetDate = selectedDayInfo.dateObj;
    const targetDateStr = selectedDayInfo.dateStr;
    const activeGroups = getWorkingGroupForDate(targetDate);

    // Identify which workers are on sick leave (License) on this specific target date
    const leaveWorkerRuts = new Set(
      (state.licenses || [])
        .filter((l) => {
          if (!l.desde || !l.hasta) return false;
          return targetDateStr >= l.desde && targetDateStr <= l.hasta;
        })
        .map((l) => String(l.rut || "").trim().toUpperCase())
    );

    const leaveWorkerNames = new Set(
      (state.licenses || [])
        .filter((l) => {
          if (!l.desde || !l.hasta) return false;
          return targetDateStr >= l.desde && targetDateStr <= l.hasta;
        })
        .map((l) => String(l.nombre || "").trim().toUpperCase())
    );

    return (state.personnelData?.personalActivo || []).filter((p) => {
      const cleanRut = String(p.rut || "").trim().toUpperCase();
      const cleanName = String(p.nombre || "").trim().toUpperCase();

      if (leaveWorkerRuts.has(cleanRut) || leaveWorkerNames.has(cleanName)) {
        return false;
      }

      const g = (p.grupo || "S/N").toUpperCase().trim();
      const hasNoGroup = (g === "S/G" || g === "S/N" || g === "S" || g === "SN" || g === "SIN GRUPO" || g === "-" || g === "" || g.includes("SIN GRUPO"));
      if (hasNoGroup) {
        return false;
      }

      // Check if their group is active on this day
      return activeGroups.some((ag) => g.includes(ag) || ag.includes(g));
    });
  }, [state.personnelData, state.licenses, selectedDayInfo, allAvailableGroups]);

  const busyWorkersOnThisDay = useMemo(() => {
    if (!selectedDayInfo) return new Set<string>();
    const dateStr = selectedDayInfo.dateStr;
    const busy = new Set<string>();

    const currentLaborName = reportForm?.laborName || '';

    (state.dailyReports || []).forEach(r => {
      if (r.date === dateStr && r.tipo !== currentLaborName) {
        const isListo = r.status === 'listo';
        if (!isListo) {
          (r.workers || []).forEach((wName: string) => {
            busy.add(wName);
          });
        }
      }
    });

    return busy;
  }, [state.dailyReports, selectedDayInfo, reportForm?.laborName]);

  const filteredPersonnel = useMemo(() => {
    return activePersonnelOnShift.filter(p => {
      if (busyWorkersOnThisDay.has(p.nombre)) {
        return false;
      }
      const g = (p.grupo || 'S/N').toUpperCase().trim();
      
      if (workerGroupFilter !== 'TODOS') {
        if (workerGroupFilter === 'S/N') {
          if (g !== 'S/N' && g !== 'S/G' && g !== 'S' && g !== 'SN' && g !== 'SIN GRUPO' && g !== '-' && g !== '') {
            return false;
          }
        } else {
          if (g !== workerGroupFilter) return false;
        }
      }
      
      if (workerSearch.trim() !== '') {
        const query = workerSearch.toLowerCase();
        return (
          p.nombre?.toLowerCase().includes(query) ||
          p.rut?.toLowerCase().includes(query) ||
          p.cargo?.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [activePersonnelOnShift, workerSearch, workerGroupFilter, busyWorkersOnThisDay]);

  const handleToggleWorker = (workerName: string) => {
    if (!reportForm) return;
    const exists = reportForm.selectedWorkers.some(w => w.name === workerName);
    let updated: { name: string; hours: number }[];
    if (exists) {
      updated = reportForm.selectedWorkers.filter(w => w.name !== workerName);
    } else {
      updated = [...reportForm.selectedWorkers, { name: workerName, hours: 12.0 }];
    }
    setReportForm({ ...reportForm, selectedWorkers: updated });
  };

  const handleWorkerHoursChange = (workerName: string, h: number) => {
    if (!reportForm) return;
    const updated = reportForm.selectedWorkers.map(w => 
      w.name === workerName ? { ...w, hours: h } : w
    );
    setReportForm({ ...reportForm, selectedWorkers: updated });
  };

  const handleSelectAllFilteredWorkers = () => {
    if (!reportForm) return;
    const toAdd = filteredPersonnel.map(p => ({ name: p.nombre, hours: 12.0 }));
    const current = [...reportForm.selectedWorkers];
    toAdd.forEach(item => {
      if (!current.some(c => c.name === item.name)) {
        current.push(item);
      }
    });
    setReportForm({ ...reportForm, selectedWorkers: current });
  };

  const handleDeselectAllFilteredWorkers = () => {
    if (!reportForm) return;
    const filteredNames = filteredPersonnel.map(p => p.nombre);
    const remaining = reportForm.selectedWorkers.filter(w => !filteredNames.includes(w.name));
    setReportForm({ ...reportForm, selectedWorkers: remaining });
  };

  const handleSaveDailyReport = async () => {
    if (!selectedDayInfo || !reportForm) return;
    if (!reportForm.supervisor) {
      notify?.('error', 'Debe seleccionar un supervisor.');
      return;
    }
    if (!selectedPrimaryWbsId) {
      notify?.('error', 'Debe escoger un WBS principal.');
      return;
    }
    if (!reportForm.laborName.trim()) {
      notify?.('error', 'Debe especificar el nombre de la labor.');
      return;
    }
    if (reportForm.selectedWorkers.length === 0) {
      notify?.('error', 'Debe asignar al menos un trabajador a la labor.');
      return;
    }

    try {
      setIsSavingReport(true);
      const primaryLabors = state.scheduleData?.primaryLabors || [];
      const primaryName = primaryLabors.find(p => p.id === selectedPrimaryWbsId)?.name || "General";
      const secondaryLabors = state.scheduleData?.secondaryLabors || [];

      if (reportForm.id) {
        // Update existing report
        await updateDailyReport(reportForm.id, {
          sup: reportForm.supervisor,
          wbs: primaryName,
          tipo: reportForm.laborName,
          detalle: reportForm.detalle,
          workers: reportForm.selectedWorkers.map(w => w.name),
          workersDetail: reportForm.selectedWorkers,
          hours: reportForm.selectedWorkers.reduce((acc, w) => acc + w.hours, 0),
          status: reportForm.status
        });
      } else {
        // Create new report
        const reportObject = {
          date: selectedDayInfo.dateStr,
          sup: reportForm.supervisor,
          wbs: primaryName,
          tipo: reportForm.laborName,
          detalle: reportForm.detalle,
          workers: reportForm.selectedWorkers.map(w => w.name),
          workersDetail: reportForm.selectedWorkers,
          hours: reportForm.selectedWorkers.reduce((acc, w) => acc + w.hours, 0),
          subLabors: [],
          p6Matched: secondaryLabors.some(sl => sl.name === reportForm.laborName),
          source: "Manual",
          status: reportForm.status,
          images: []
        };
        await addDailyReport(reportObject);
      }

      if (reportForm.taskId) {
        const taskToCheck = state.scheduleData?.tasks.find(t => t.id === reportForm.taskId);
        // Only auto-start the task globally if it was pending. 
        // Do NOT auto-complete the global task just because a single daily report is "Listo".
        if (taskToCheck && taskToCheck.status === 'TK_Pending') {
          await handleUpdateTaskStatus(reportForm.taskId, 'TK_Active');
        }
      }

      notify?.('success', reportForm.id ? 'Reporte actualizado con éxito.' : 'Reporte creado y sincronizado con éxito.');
      setReportForm(null);
    } catch (err: any) {
      notify?.('error', `Error al registrar el reporte: ${err.message || err}`);
    } finally {
      setIsSavingReport(false);
    }
  };

  const handleQuickDayStatusChange = async (task: any, newStatus: string, matchedReport: any) => {
    if (!selectedDayInfo) return;
    
    setIsSavingReport(true);
    try {
      const statusMapForReport: Record<string, 'pendiente' | 'ejecucion' | 'listo'> = {
        'TK_Pending': 'pendiente',
        'TK_Active': 'ejecucion',
        'TK_Complete': 'listo'
      };
      
      const reportStatus = statusMapForReport[newStatus] || 'pendiente';
      
      if (matchedReport) {
        await updateDailyReport(String(matchedReport.id), { status: reportStatus });
      } else {
        const primaryName = task.wbsName || 'General';

        const reportObject = {
          id: String(Date.now()), // Generate a temporary ID that might be replaced by the context
          date: selectedDayInfo.dateStr,
          sup: '',
          wbs: primaryName,
          tipo: task.name || 'Sin título',
          detalle: 'Estado actualizado rápidamente desde el calendario',
          workers: [],
          workersDetail: [],
          hours: 0,
          subLabors: [],
          p6Matched: true,
          source: "Manual",
          status: reportStatus,
          images: [],
          taskId: task.id
        };
        await addDailyReport(reportObject);
      }
      
      // Update global task to active if it was pending and user marked the day as active or complete
      if (task.status === 'TK_Pending' && (newStatus === 'TK_Active' || newStatus === 'TK_Complete')) {
        await updateTaskStatus(task.id, 'TK_Active');
      }
      
      notify?.('success', 'Estado del día actualizado exitosamente.');
    } catch (err: any) {
      notify?.('error', 'Error actualizando estado del día: ' + err.message);
    } finally {
      setIsSavingReport(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    if (!state.scheduleData) return;

    // Call global context updater to change the task status in Firestore and core states
    await updateTaskStatus(taskId, newStatus);

    // Update local selectedDayInfo state to reflect immediately in the UI grid
    setSelectedDayInfo(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tasks: prev.tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
      };
    });

    // Automatically synchronize with Daily Report history
    const task = state.scheduleData.tasks.find(t => t.id === taskId);
    if (task) {
      const taskDateStr = selectedDayInfo?.dateStr || (task.startDate ? (typeof task.startDate === 'string' ? task.startDate.slice(0, 10) : new Date(task.startDate).toISOString().slice(0, 10)) : '');
      
      if (taskDateStr) {
        // Find if a report with this date and name already exists
        const matchedReport = state.dailyReports?.find(r => 
          r.date === taskDateStr && 
          r.tipo?.trim().toLowerCase() === task.name?.trim().toLowerCase()
        );

        const statusMapForReport: Record<string, 'pendiente' | 'ejecucion' | 'listo'> = {
          'TK_Pending': 'pendiente',
          'TK_Active': 'ejecucion',
          'TK_Complete': 'listo'
        };
        const mappedReportStatus = statusMapForReport[newStatus] || 'pendiente';

        if (matchedReport) {
          // If a matching daily report exists, update its status so it syncs
          await updateDailyReport(String(matchedReport.id), { status: mappedReportStatus });
          notify?.('success', 'Reporte diario sincronizado con el nuevo estado.');
        }
      }
    }
  };

  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month - 1, 1));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month + 1, 1));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));
    }
  };

  const handleToday = () => setCurrentDate(new Date());

  // Generate calendar grid
  const calendarGrid = useMemo(() => {
    const startDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const days = [];
    
    for (let i = startDayOfMonth - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrevMonth - i);
      const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
      days.push({ day: d.getDate(), isCurrentMonth: false, dateObj: d, dateStr: `${y}-${m}-${day}` });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
      days.push({ day: d.getDate(), isCurrentMonth: true, dateObj: d, dateStr: `${y}-${m}-${day}` });
    }
    const remainingCells = 42 - days.length;
    for (let i = 1; i <= remainingCells; i++) {
      const d = new Date(year, month + 1, i);
      const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
      days.push({ day: d.getDate(), isCurrentMonth: false, dateObj: d, dateStr: `${y}-${m}-${day}` });
    }
    return days;
  }, [year, month]);

  // Generate week grid (7 days including currentDate) starting from Sunday of that week
  const weekGrid = useMemo(() => {
    const currentDayOfWeek = currentDate.getDay(); // 0 is Sunday, etc.
    const days = [];
    for (let i = 0; i < 7; i++) {
      const diff = i - currentDayOfWeek;
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + diff);
      const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
      days.push({ 
        day: d.getDate(), 
        isCurrentMonth: d.getMonth() === currentDate.getMonth(), 
        dateObj: d, 
        dateStr: `${y}-${m}-${day}` 
      });
    }
    return days;
  }, [currentDate]);

  const activeGrid = useMemo(() => {
    return viewMode === 'month' ? calendarGrid : weekGrid;
  }, [viewMode, calendarGrid, weekGrid]);

  const visibleGroupsText = useMemo(() => {
    const groups = new Set<string>();
    const gridToUse = activeGrid;
    for (const d of gridToUse) {
      const g = getWorkingGroupForDate(d.dateObj);
      g.forEach(grp => groups.add(grp));
    }
    return Array.from(groups).sort().join(' / ');
  }, [activeGrid, state.shiftConfig, state.scheduleData]);

  const historyDays = useMemo(() => {
    if (!state.dailyReports || state.dailyReports.length === 0) return [];
    const grouped = new Map<string, DailyReport[]>();
    
    state.dailyReports.forEach(r => {
      if (!grouped.has(r.date)) {
        grouped.set(r.date, []);
      }
      grouped.get(r.date)!.push(r);
    });
    
    const sortedDates = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));
    
    return sortedDates.map(dateStr => {
      const reports = grouped.get(dateStr)!;
      return {
        dateStr,
        dateObj: new Date(dateStr + 'T12:00:00'),
        reports
      };
    });
  }, [state.dailyReports]);

  const tasksByDay = useMemo(() => {
    const gridMap = new Map<string, any[]>();
    for (const cell of activeGrid) {
      gridMap.set(cell.dateStr, []);
    }

    if (!state.scheduleData || !state.scheduleData.tasks) return gridMap;

    const firstStr = activeGrid[0].dateStr;
    const lastStr = activeGrid[activeGrid.length - 1].dateStr;
    const lowerSearch = searchQuery.toLowerCase();

    for (const t of state.scheduleData.tasks) {
      try {
        let startStr = t.startDate ? (typeof t.startDate === 'string' ? t.startDate.slice(0, 10) : new Date(t.startDate).toISOString().slice(0, 10)) : null;
        let endStr = t.endDate ? (typeof t.endDate === 'string' ? t.endDate.slice(0, 10) : new Date(t.endDate).toISOString().slice(0, 10)) : startStr;
        
        if (!startStr) continue;
        if (!endStr) endStr = startStr;

        // Apply filters
        if (statusFilter !== 'all') {
          if (statusFilter === 'pending' && (t.status === 'TK_Complete' || t.status === 'TK_Active')) continue;
          if (statusFilter !== 'pending' && t.status !== statusFilter) continue;
        }

        if (lowerSearch && !t.name?.toLowerCase().includes(lowerSearch) && !t.wbsName?.toLowerCase().includes(lowerSearch)) {
          continue;
        }

        if (startStr <= lastStr && endStr >= firstStr) {
           for (const cell of activeGrid) {
              if (cell.dateStr >= startStr && cell.dateStr <= endStr) {
                 gridMap.get(cell.dateStr)!.push(t);
              }
           }
        }
      } catch(e) {
        // Skip corrupted data silently
      }
    }
    return gridMap;
  }, [state.scheduleData, activeGrid, searchQuery, statusFilter]);

  const todayStr = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear(); 
    const m = String(today.getMonth() + 1).padStart(2, '0'); 
    const day = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const modalWrapper = (children: React.ReactNode) => {
    if (isInline) {
      return (
        <div className="w-full flex flex-col overflow-visible">
          {/* Header Bar */}
          <div className={cn(
            "px-6 py-4 border-b flex justify-between items-center shrink-0",
            state.theme === 'dark' 
              ? "bg-[#0b1220] border-[#1f2a44] text-[#e6edf7]" 
              : "bg-white border-gray-100 text-[#162033]"
          )}>
            <div>
              <h2 className={cn(
                "text-2xl font-black tracking-tight uppercase leading-none mb-1",
                state.theme === 'dark' ? "text-white" : "text-gray-900"
              )}>
                Calendario Operativo
              </h2>
              <p className={cn(
                "text-[10px] font-bold uppercase tracking-wider",
                state.theme === 'dark' ? "text-[#9fb0d6]/70" : "text-[#5f6f89]"
              )}>
                Turnos, grupos de trabajo y labores programadas
              </p>
            </div>
            <div className="flex gap-4 items-center">
              <CalendarIcon size={18} className={state.theme === 'dark' ? "text-[#ffb755]" : "text-blue-600"} />
              <div className={cn("h-6 w-px", state.theme === 'dark' ? "bg-gray-800" : "bg-gray-200")} />
              <p className={cn(
                "text-[9px] font-bold uppercase tracking-widest text-right leading-none",
                state.theme === 'dark' ? "text-[#9fb0d6]" : "text-[#5f6f89]"
              )}>
                VINCULADO <br /> <span className="text-[10px] font-black italic text-[#ffb703] dark:text-[#ffb703]">{state.scheduleData?.name || "S/G"}</span>
              </p>
            </div>
          </div>

          {/* Calendar content takes full remaining space */}
          <div className="w-full flex flex-col overflow-visible">
            {children}
          </div>
        </div>
      );
    }

    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "w-full max-w-7xl h-[85vh] sm:max-h-[90vh] flex flex-col rounded-2xl sm:rounded-3xl shadow-2xl border overflow-hidden",
                state.theme === 'dark' 
                  ? "bg-[#0b1120] border-[#1f2a44] text-[#e6edf7]" 
                  : "bg-white border-gray-200 text-[#162033]"
              )}
            >
              {children}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  return (
    <>
      {modalWrapper(
        <>
              {/* Header inside floating modal (only) */}
              {!isInline && (
                <div className={cn(
                  "px-4 sm:px-6 py-4 border-b flex items-center justify-between shrink-0",
                  state.theme === 'dark' ? "border-[#1f2a44] bg-[#070b14]" : "border-gray-200 bg-[#f8fbff]"
                )}>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <CalendarIcon size={20} className={cn("hidden sm:block", state.theme === 'dark' ? "text-[#ffb703]" : "text-[#0f6fff]")} />
                    <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight">Calendario Operativo</h2>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="relative group hidden sm:block w-48">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500" />
                      <input
                        type="text"
                        placeholder="Buscar labor..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={cn(
                          "w-full bg-transparent border rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all",
                          state.theme === 'dark' ? "border-[#1f2a44] text-white focus:bg-[#161d2b]" : "border-gray-200 text-gray-900 focus:bg-white focus:border-blue-300"
                        )}
                      />
                    </div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className={cn(
                        "hidden sm:block text-xs font-bold uppercase rounded-lg border px-2 py-1.5 focus:outline-none cursor-pointer",
                        state.theme === 'dark' ? "bg-[#0b1120] border-[#1f2a44] text-gray-300" : "bg-white border-gray-200 text-gray-700"
                      )}
                    >
                      <option value="all">Todas</option>
                      <option value="TK_Active">Activas</option>
                      <option value="TK_Complete">Completadas</option>
                      <option value="pending">Pendientes</option>
                    </select>
                    {!isInline && onClose && (
                      <button 
                        onClick={onClose}
                        className={cn(
                          "p-2 rounded-xl transition-colors cursor-pointer",
                          state.theme === 'dark' ? "hover:bg-white/10 text-gray-400" : "hover:bg-black/5 text-gray-500"
                        )}
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Controls */}
              <div className={cn(
                "px-4 sm:px-6 py-3 sm:py-4 flex flex-col lg:flex-row items-center justify-between gap-3 sm:gap-4 border-b shrink-0",
                state.theme === 'dark' ? "border-[#1f2a44]" : "border-gray-200"
              )}>
                <div className="flex flex-col text-center sm:text-left w-full sm:w-auto">
                  <h3 className="text-xl sm:text-2xl font-black uppercase tracking-wider tabular-nums leading-none">
                    {viewMode === 'month' ? (
                      `${MONTHS[month]} ${year}`
                    ) : (
                      `Semana del ${weekGrid[0].day} ${MONTHS[weekGrid[0].dateObj.getMonth()].slice(0, 3)} al ${weekGrid[6].day} ${MONTHS[weekGrid[6].dateObj.getMonth()].slice(0, 3)} ${weekGrid[6].dateObj.getFullYear()}`
                    )}
                  </h3>
                  <p className="text-[9px] sm:text-[10px] uppercase font-bold text-[#ffb703] mt-1 sm:mt-1.5 tracking-widest truncate max-w-[200px] sm:max-w-none flex items-center justify-center sm:justify-start gap-1.5">
                    <span>Semana Grupo {visibleGroupsText}</span>
                    <span className="opacity-40">•</span>
                    <span className="text-gray-500 font-medium">Sincronizado {state.scheduleData?.name ? `(${state.scheduleData.name})` : ''}</span>
                  </p>
                </div>
                
                {/* Search & Filter when inline or mobile */}
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-center lg:justify-end">
                  {isInline && (
                    <>
                      {/* Search box */}
                      <div className="relative group w-full sm:w-48">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500" />
                        <input
                          type="text"
                          placeholder="Buscar labor..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className={cn(
                            "w-full bg-transparent border rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all",
                            state.theme === 'dark' ? "border-[#1f2a44] text-white focus:bg-[#161d2b]" : "border-gray-200 text-gray-900 focus:bg-white focus:border-blue-300"
                          )}
                        />
                      </div>
                      
                      {/* Status select dropdown */}
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className={cn(
                          "w-full sm:w-auto text-xs font-bold uppercase rounded-lg border px-2 py-1.5 focus:outline-none cursor-pointer",
                          state.theme === 'dark' ? "bg-[#0b1120] border-[#1f2a44] text-gray-300" : "bg-white border-gray-200 text-gray-700"
                        )}
                      >
                        <option value="all">Todas las labores</option>
                        <option value="TK_Active">Activas</option>
                        <option value="TK_Complete">Completadas</option>
                        <option value="pending">Pendientes</option>
                      </select>
                    </>
                  )}

                  {!isInline && (
                    /* Mobile Search/Filter (Visible only on mobile for floating modal) */
                    <div className="flex w-full sm:hidden relative">
                      <input
                        type="text"
                        placeholder="Buscar..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={cn(
                          "flex-grow bg-transparent border rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none transition-all",
                          state.theme === 'dark' ? "border-[#1f2a44] text-white" : "border-gray-200 text-gray-900"
                        )}
                      />
                    </div>
                  )}

                  {/* Switcher de Vista */}
                  <div className="flex rounded-xl overflow-hidden border border-gray-500/15 p-0.5 bg-gray-500/5 select-none shrink-0">
                    <button
                      onClick={() => setViewMode('month')}
                      className={cn(
                        "px-3 py-1.5 text-xs font-black uppercase rounded-lg transition-all cursor-pointer",
                        viewMode === 'month'
                          ? (state.theme === 'dark' ? "bg-[#ffb703] text-black" : "bg-blue-600 text-white shadow-sm")
                          : "text-gray-400 hover:text-gray-200"
                      )}
                    >
                      Mes
                    </button>
                    <button
                      onClick={() => setViewMode('week')}
                      className={cn(
                        "px-3 py-1.5 text-xs font-black uppercase rounded-lg transition-all cursor-pointer",
                        viewMode === 'week'
                          ? (state.theme === 'dark' ? "bg-[#ffb703] text-black" : "bg-blue-600 text-white shadow-sm")
                          : "text-gray-400 hover:text-gray-200"
                      )}
                    >
                      Semana
                    </button>
                  </div>

                  {/* Botones de navegación */}
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={handlePrev}
                      className={cn(
                        "p-2 rounded-xl transition-colors border cursor-pointer",
                        state.theme === 'dark' ? "border-[#1f2a44] hover:bg-white/10" : "border-gray-200 hover:bg-black/5"
                      )}
                      title={viewMode === 'month' ? "Mes Anterior" : "Semana Anterior"}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button 
                      onClick={handleToday}
                      className={cn(
                        "px-4 py-2 text-xs font-black uppercase rounded-xl transition-colors border shadow-sm mx-1 cursor-pointer",
                        state.theme === 'dark' ? "border-[#1f2a44] hover:bg-white/10 bg-[#0f1830]" : "border-gray-200 hover:bg-black/5 bg-white"
                      )}
                    >
                      Hoy
                    </button>
                    <button 
                      onClick={handleNext}
                      className={cn(
                        "p-2 rounded-xl transition-colors border cursor-pointer",
                        state.theme === 'dark' ? "border-[#1f2a44] hover:bg-white/10" : "border-gray-200 hover:bg-black/5"
                      )}
                      title={viewMode === 'month' ? "Mes Siguiente" : "Semana Siguiente"}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Grid */}
              <div className={cn(
                "bg-black/5 dark:bg-black/20 p-2 sm:p-4",
                isInline ? "w-full flex flex-col overflow-visible" : "flex flex-col flex-1 overflow-visible md:overflow-hidden min-h-0"
              )}>
                <div className="grid grid-cols-7 mb-2 shrink-0">
                  {DAYS_OF_WEEK.map((day) => (
                    <div key={day} className="text-center text-[9px] sm:text-xs font-black uppercase tracking-widest opacity-60 pb-1">
                      {day}
                    </div>
                  ))}
                </div>
                <div id="calendar-grid-scroll" className={cn(
                  "grid grid-cols-7 gap-1 sm:gap-1.5 pr-1 pb-4 custom-scrollbar",
                  isInline ? "overflow-visible h-auto" : "flex-1 min-h-0 overflow-y-auto"
                )}>
                  {activeGrid.map((date, i) => {
                    const dayTasks = tasksByDay.get(date.dateStr) || [];
                    const currentToday = (date.dateStr === todayStr);
                    const dayGroups = getWorkingGroupForDate(date.dateObj);
                    const groupStr = dayGroups.join('/');
                    const isGroupA = groupStr.includes('A');
                    
                    return (
                      <div 
                        key={i} 
                        onClick={() => setSelectedDayInfo({ dateObj: date.dateObj, dateStr: date.dateStr, tasks: dayTasks })}
                        className={cn(
                          "flex flex-col p-1.5 sm:p-2 rounded-lg sm:rounded-xl border transition-all overflow-hidden relative cursor-pointer active:scale-95",
                          viewMode === 'week' 
                            ? "min-h-[220px] sm:min-h-[320px] flex-1" 
                            : "min-h-[85px] sm:min-h-[120px] max-h-[180px]",
                          !date.isCurrentMonth 
                            ? (state.theme === 'dark' ? "bg-[#0b1120]/50 border-white/5 opacity-40 hover:opacity-100" : "bg-gray-50 border-gray-100 opacity-40 hover:opacity-100")
                            : (state.theme === 'dark' ? "bg-[#161d2b] border-[#1f2a44] hover:border-[#ffb703]/50" : "bg-white border-gray-200 shadow-sm hover:border-blue-300"),
                          currentToday && (state.theme === 'dark' ? "border-[#ffb703] shadow-[0_0_15px_rgba(255,183,3,0.15)] bg-[#21251c]" : "border-[#0f6fff] shadow-sm bg-blue-50/30")
                        )}
                      >
                        {/* Cell Header: Day Number and Duty Group Badge */}
                        <div className="flex items-center justify-between mb-1.5 shrink-0">
                          {/* Duty Group Badge */}
                          <span 
                            className={cn(
                              "text-[7px] sm:text-[9px] font-black tracking-wider uppercase px-1 py-0.5 rounded-md leading-none border select-none",
                              isGroupA
                                ? (state.theme === 'dark' ? "bg-amber-500/10 text-[#ffb703] border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200")
                                : (state.theme === 'dark' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-750 border-blue-200")
                            )}
                            title={`Turno de trabajo para Grupo ${isGroupA ? "A y C" : "B y D"}`}
                          >
                            {viewMode === 'week' ? `Grupo ${groupStr}` : `G-${groupStr}`}
                          </span>

                          {/* Day Number */}
                          <div className={cn(
                            "w-5 h-5 sm:w-7 sm:h-7 flex items-center justify-center text-[10px] sm:text-xs rounded-full font-black flex-shrink-0 transition-transform",
                            currentToday 
                              ? (state.theme === 'dark' ? "bg-[#ffb703] text-black" : "bg-[#0f6fff] text-white")
                              : (state.theme === 'dark' ? "text-gray-400" : "text-gray-600")
                          )}>
                            {date.day}
                          </div>
                        </div>
                        
                        {/* Tasks List */}
                        <div className="flex flex-col gap-0.5 sm:gap-1 overflow-y-auto pr-0.5 mt-auto sm:mt-0 custom-scrollbar flex-1 max-h-full">
                          {dayTasks.slice(0, viewMode === 'week' ? 12 : 6).map((task, idx) => {
                            if (!task) return null;
                            const hasReport = state.dailyReports?.find(r => 
                              r.date === date.dateStr && 
                              r.tipo?.trim().toLowerCase() === task.name?.trim().toLowerCase()
                            );
                            
                            let chipStyle = state.theme === 'dark' ? "bg-white/5 text-gray-300 border-white/10" : "bg-gray-100 text-gray-700 border-gray-200";
                            
                            if (hasReport) {
                              if (hasReport.status === 'listo') {
                                chipStyle = "bg-green-500/10 text-green-600 border-green-500/20";
                              } else if (hasReport.status === 'ejecucion') {
                                chipStyle = "bg-blue-500/10 text-blue-600 border-blue-500/20";
                              }
                            } else {
                              // If no report for this specific day, it cannot be considered "listo" or "ejecucion" automatically.
                              // Must remain pending until a report says so.
                            }
                            
                            return (
                              <div 
                                key={task.id ? `${task.id}-${idx}` : `task-${idx}`}
                                className={cn(
                                  "text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-[4px] sm:rounded truncate font-bold border leading-tight transition-colors flex-shrink-0 flex items-center justify-between gap-1",
                                  chipStyle
                                )}
                                title={task.name ? `${task.name}${hasReport ? ' (Reporte Registrado)' : ''}` : 'Tarea'}
                              >
                                <span className="truncate flex-1">{task.name || '...'}</span>
                                {hasReport && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 animate-pulse" title="Reporte Registrado" />
                                )}
                              </div>
                            );
                          })}
                          {dayTasks.length > (viewMode === 'week' ? 12 : 6) && (
                            <div className="text-[8px] font-black text-gray-500 text-center pt-0.5 opacity-85 shrink-0">
                              + {dayTasks.length - (viewMode === 'week' ? 12 : 6)} lab.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {isInline && (
                <div className="mt-8 px-2 sm:px-4 pb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText size={20} className={state.theme === 'dark' ? "text-[#ffb703]" : "text-blue-600"} />
                    <h2 className="text-lg sm:text-lg font-black uppercase tracking-tight">
                      Historial de Reportes Diarios
                    </h2>
                  </div>
                  
                  {historyDays.length === 0 ? (
                    <div className="text-sm font-bold opacity-60 italic p-6 border border-dashed rounded-xl text-center">
                      Aún no hay reportes diarios guardados.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {historyDays.map((hd) => {
                        return (
                          <div 
                            key={hd.dateStr}
            onClick={() => {
              setViewingHistoryDayReports({ dateObj: hd.dateObj, dateStr: hd.dateStr, reports: hd.reports });
            }}
                            className={cn(
                              "p-3.5 rounded-xl border transition-all hover:scale-[1.02] cursor-pointer flex flex-col gap-2 min-h-[100px]",
                              state.theme === 'dark' ? "bg-white/5 border-white/5 hover:border-white/20" : "bg-white border-gray-200 hover:border-blue-300 shadow-sm hover:shadow"
                            )}
                          >
                            <div className="flex items-center justify-between border-b pb-2 mb-1" style={{ borderColor: state.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                              <span className="text-[12px] font-black uppercase text-blue-500">{formatDate(hd.dateStr)}</span>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-black uppercase",
                                state.theme === 'dark' ? "bg-amber-500/10 text-[#ffb703]" : "bg-amber-50 text-amber-700"
                              )}>
                                {hd.reports.length} report{hd.reports.length !== 1 ? 'es' : ''}
                              </span>
                            </div>
                            
                            <div className="flex flex-col gap-1 text-[10px] sm:text-[10px]">
                              {hd.reports.slice(0, 3).map((r, i) => (
                                <div key={i} className={cn(
                                  "truncate flex items-center justify-between gap-1.5 rounded px-1.5 py-0.5",
                                  state.theme === 'dark' ? "bg-black/20" : "bg-gray-50"
                                )}>
                                    <span className="truncate flex-1 font-bold opacity-90">{r.tipo || 'Sin título'}</span>
                                    <span className={cn(
                                        "text-[8px] px-1 py-0.5 rounded font-black uppercase leading-none border",
                                        r.status === 'listo' ? "bg-green-500/10 text-green-600 border-green-500/20" :
                                        r.status === 'ejecucion' ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                                        "bg-gray-500/10 text-gray-500 border-gray-500/20"
                                    )}>
                                        {r.status === 'ejecucion' ? 'EN EJEC' : r.status.substring(0, 4)}
                                    </span>
                                </div>
                              ))}
                              {hd.reports.length > 3 && (
                                <span className="text-[9px] text-gray-500 font-bold ml-1.5 mt-0.5">
                                  + {hd.reports.length - 3} archivo(s) más...
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

      <AnimatePresence>
        {selectedDayInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedDayInfo(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "w-full max-w-4xl max-h-[85vh] flex flex-col rounded-3xl shadow-2xl border overflow-hidden",
                state.theme === 'dark' 
                  ? "bg-[#0b1120] border-[#1f2a44] text-[#e6edf7]" 
                  : "bg-white border-gray-200 text-[#162033]"
              )}
            >
              <div className={cn(
                "px-6 py-5 border-b flex items-center justify-between shrink-0 flex-wrap gap-4",
                state.theme === 'dark' ? "border-[#1f2a44] bg-[#070b14]" : "border-gray-200 bg-[#f8fbff]"
              )}>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-widest leading-none opacity-70">
                      {reportForm ? "Registrar Reporte Diario" : "Detalle del Día"}
                    </span>
                    {!reportForm && (
                      <>
                        <span className="text-[10px] opacity-40">•</span>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-widest leading-none",
                          state.theme === 'dark' ? "bg-[#ffb703]/10 text-[#ffb703]" : "bg-[#0f6fff]/10 text-[#0f6fff]"
                        )}>
                          Grupo Activo: {getWorkingGroupForDate(selectedDayInfo.dateObj).join(' / ')}
                        </span>
                      </>
                    )}
                  </div>
                  <h2 className="text-xl font-black uppercase tracking-tight">
                    {formatDate(selectedDayInfo.dateStr)}
                  </h2>
                </div>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      if (reportForm) {
                        setReportForm(null);
                      } else {
                        setSelectedDayInfo(null);
                      }
                    }}
                    className={cn(
                      "p-2 rounded-xl transition-colors",
                      state.theme === 'dark' ? "hover:bg-white/10 text-gray-400" : "hover:bg-black/5 text-gray-500"
                    )}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {reportForm ? (
                  /* Create Daily Report Form */
                  <div className="space-y-4">
                    {/* Header Details */}
                    <div className="p-4 rounded-2xl border bg-gray-500/5 border-gray-500/10 space-y-4">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#ffb703]">
                        <Info size={14} />
                        <span>Información del Reporte</span>
                      </div>
                      
                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* WBS Principal */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">WBS Principal / Categoría</label>
                          <select
                            value={selectedPrimaryWbsId}
                            onChange={(e) => setSelectedPrimaryWbsId(e.target.value)}
                            className={cn(
                              "w-full rounded-xl border p-2.5 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all",
                              state.theme === "dark" ? "bg-[#161d2b] border-[#1f2a44] text-white" : "bg-white border-gray-200 text-gray-900"
                            )}
                            required
                          >
                            <option value="">-- Seleccionar --</option>
                            {state.scheduleData?.primaryLabors?.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Supervisor */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Supervisor Responsable</label>
                          <select
                            value={reportForm.supervisor}
                            onChange={(e) => setReportForm({ ...reportForm, supervisor: e.target.value })}
                            className={cn(
                              "w-full rounded-xl border p-2.5 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all",
                              state.theme === "dark" ? "bg-[#161d2b] border-[#1f2a44] text-white" : "bg-white border-gray-200 text-gray-900"
                            )}
                            required
                          >
                            <option value="">-- Seleccionar --</option>
                            {state.personnelData?.supervisors?.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>

                        {/* Labor name */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nombre de la Labor (Detallada)</label>
                          <input
                            type="text"
                            value={reportForm.laborName}
                            onChange={(e) => setReportForm({ ...reportForm, laborName: e.target.value })}
                            className={cn(
                              "w-full rounded-xl border p-2.5 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all",
                              state.theme === "dark" ? "bg-[#161d2b] border-[#1f2a44] text-white" : "bg-white border-gray-200 text-gray-900"
                            )}
                            placeholder="Escriba la labor del día..."
                            required
                          />
                        </div>

                        {/* Status */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Estado del Trabajo</label>
                          <select
                            value={reportForm.status}
                            onChange={(e) => setReportForm({ ...reportForm, status: e.target.value as any })}
                            className={cn(
                              "w-full rounded-xl border p-2.5 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all",
                              state.theme === "dark" ? "bg-[#161d2b] border-[#1f2a44] text-white" : "bg-white border-gray-200 text-gray-900"
                            )}
                          >
                            <option value="pendiente">Pendiente</option>
                            <option value="ejecucion">En Ejecución (Activo)</option>
                            <option value="listo">Listo (Día Completado)</option>
                          </select>
                        </div>
                      </div>

                      {/* Small Description of the Day / Comments */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                          <FileText size={12} /> Descripción / Observaciones del día
                        </label>
                        <textarea
                          value={reportForm.detalle}
                          onChange={(e) => setReportForm({ ...reportForm, detalle: e.target.value })}
                          className={cn(
                            "w-full rounded-xl border p-2.5 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all h-20 resize-none",
                            state.theme === "dark" ? "bg-[#161d2b] border-[#1f2a44] text-white" : "bg-white border-gray-200 text-gray-900"
                          )}
                          placeholder="Escriba aquí los avances, observaciones o rendimiento del día..."
                        />
                      </div>
                    </div>

                    {/* Choose active workers */}
                    <div className="space-y-3 pt-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-1.5">
                            <Users size={16} className="text-blue-500" />
                            <span>Trabajadores en este trabajo ({reportForm.selectedWorkers.length})</span>
                          </h3>
                          <p className="text-[10px] text-[#ffb703] font-black uppercase mt-0.5">Asignar con sus horas correspondientes (Total: {reportForm.selectedWorkers.reduce((sum, w) => sum + w.hours, 0).toFixed(1)} HH)</p>
                        </div>

                        {/* Bulk operations */}
                        <div className="flex gap-3 text-[10px] font-black uppercase self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={handleSelectAllFilteredWorkers}
                            className="text-blue-500 hover:underline cursor-pointer"
                          >
                            Marcar Filtrados
                          </button>
                          <span className="text-gray-500">|</span>
                          <button
                            type="button"
                            onClick={handleDeselectAllFilteredWorkers}
                            className="text-red-500 hover:underline cursor-pointer"
                          >
                            Desmarcar Filtrados
                          </button>
                        </div>
                      </div>

                      {/* Workers Search & Group Tabs */}
                      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                        {/* Tab filters */}
                        <div className="flex rounded-lg overflow-hidden border border-gray-500/10 p-0.5 shrink-0 bg-gray-500/5">
                          {['TODOS', ...allAvailableGroups, 'S/N'].map((g) => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => setWorkerGroupFilter(g)}
                              className={cn(
                                "flex-1 py-1 text-[9px] font-black uppercase rounded-md transition-all cursor-pointer",
                                workerGroupFilter === g
                                  ? (state.theme === 'dark' ? "bg-[#ffb703]/25 text-[#ffb703] font-black" : "bg-[#0f6fff]/25 text-[#0f6fff] font-black shadow-sm")
                                  : "text-gray-400 hover:text-gray-200"
                              )}
                            >
                              GRUPO {g}
                            </button>
                          ))}
                        </div>

                        {/* Worker query search */}
                        <div className="relative">
                          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Buscar trabajador en turno..."
                            value={workerSearch}
                            onChange={(e) => setWorkerSearch(e.target.value)}
                            className={cn(
                              "w-full bg-transparent border rounded-lg pl-8 pr-3 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all",
                              state.theme === 'dark' ? "border-[#1f2a44] text-white" : "border-gray-200 text-gray-900"
                            )}
                          />
                        </div>
                      </div>

                      {/* Workers List on Shift */}
                      {filteredPersonnel.length === 0 ? (
                        <div className="text-center py-6 border border-dashed rounded-xl border-gray-500/10 opacity-60 text-xs text-gray-400">
                          {activePersonnelOnShift.length === 0 
                            ? "No hay personal marcado en Turno hoy (revisa Control de Personal)."
                            : "Ningún trabajador coincide con los criterios de búsqueda o grupo."
                          }
                        </div>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2 max-h-[160px] overflow-y-auto pr-1 pad-1 content-start custom-scrollbar">
                          {filteredPersonnel.map((p) => {
                            const isChecked = reportForm.selectedWorkers.some(sw => sw.name === p.nombre);
                            const matchedWorker = reportForm.selectedWorkers.find(sw => sw.name === p.nombre);
                            
                            return (
                              <div
                                key={p.rut || p.nombre}
                                onClick={() => handleToggleWorker(p.nombre)}
                                className={cn(
                                  "flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]",
                                  isChecked
                                    ? (state.theme === 'dark' ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-blue-50 border-blue-200 text-blue-900")
                                    : (state.theme === 'dark' ? "bg-white/5 border-white/5 text-gray-300" : "bg-gray-50 border-gray-100 text-gray-900")
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className="shrink-0 text-[#ffb703]">
                                    {isChecked ? (
                                      <div className={cn("w-4 h-4 rounded text-black flex items-center justify-center font-black", state.theme === 'dark' ? "bg-[#ffb703]" : "bg-blue-600 text-white")}>
                                        <Check size={10} strokeWidth={4} />
                                      </div>
                                    ) : (
                                      <div className={cn("w-4 h-4 rounded border-2", state.theme === 'dark' ? "border-gray-650" : "border-gray-300")} />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-[11px] truncate leading-tight">{p.nombre}</p>
                                    <p className="text-[9px] text-gray-450 font-mono flex items-center gap-1.5 mt-0.5 leading-none">
                                      <span className="uppercase">{p.cargo}</span>
                                      <span className="opacity-50">•</span>
                                      <span className="opacity-80">GRUPO {p.grupo || 'S/N'}</span>
                                    </p>
                                  </div>
                                </div>

                                {/* Hours assignment */}
                                {isChecked && (
                                  <div 
                                    className="ml-2 shrink-0 flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="number"
                                      min="0"
                                      max="24"
                                      step="0.5"
                                      value={matchedWorker?.hours ?? 12.0}
                                      onChange={(e) => handleWorkerHoursChange(p.nombre, parseFloat(e.target.value) || 0)}
                                      className={cn(
                                        "w-12 text-center rounded border px-1 py-0.5 font-bold font-mono text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500",
                                        state.theme === 'dark' ? "bg-[#0b1120] border-gray-750 text-white" : "bg-white border-gray-300 text-gray-950"
                                      )}
                                      title="Horas trabajadas"
                                    />
                                    <span className="text-[9px] font-black text-gray-450 font-mono">Hr</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Save Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-500/10">
                      <button
                        type="button"
                        onClick={() => setReportForm(null)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-black uppercase transition-all border cursor-pointer active:scale-95",
                          state.theme === 'dark' 
                            ? "border-[#1f2a44] bg-transparent text-gray-400 hover:bg-white/5" 
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        )}
                        disabled={isSavingReport}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveDailyReport}
                        className={cn(
                          "px-5 py-2 rounded-xl text-xs font-black uppercase transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-[0.98]",
                          state.theme === 'dark'
                            ? "bg-[#ffb703] text-black hover:bg-[#ffb703]/90"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                        )}
                        disabled={isSavingReport}
                      >
                        {isSavingReport ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            Guardando...
                          </>
                        ) : (
                          <>
                            <Check size={14} strokeWidth={3} />
                            Guardar Reporte
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                    <div className="w-full space-y-4">
                      {!hasProgrammed && (
                        <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-2xl border-gray-500/15 min-h-[250px]">
                          <CalendarIcon size={36} className="mb-3 opacity-40 text-gray-400" />
                          <p className="font-extrabold uppercase tracking-wider text-xs">No hay labores de cronograma hoy</p>
                          <p className="text-[11px] mt-1.5 opacity-60 mb-4 max-w-xs leading-relaxed">No se registran actividades en el cronograma actual para este día.</p>
                          <button
                            onClick={() => handleStartReportForm(null)}
                            className={cn(
                              "px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xl border transition-all flex items-center gap-1.5 shadow-sm cursor-pointer",
                              state.theme === "dark" 
                                ? "bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-[#ffb703]" 
                                : "bg-amber-100/10 border-amber-200 hover:bg-amber-100 text-amber-700"
                            )}
                          >
                            <PlusCircle size={13} strokeWidth={2.5} />
                            Agregar Reporte Manual
                          </button>
                        </div>
                      )}
                      
                      {hasProgrammed && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-wider opacity-60">
                              Labores Programadas ({selectedDayInfo.tasks.length})
                            </span>
                            <button
                              onClick={() => handleStartReportForm(null)}
                              className={cn(
                                "px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg border transition-all flex items-center gap-1 shadow-sm cursor-pointer",
                                state.theme === "dark" 
                                  ? "bg-blue-500/15 hover:bg-blue-500/25 border-blue-500/30 text-blue-400" 
                                  : "bg-blue-50 border-blue-100 hover:bg-blue-100 text-blue-700"
                              )}
                            >
                              <PlusCircle size={11} strokeWidth={2.5} />
                              Reportar Otra Labor
                            </button>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-1">
                            {selectedDayInfo.tasks.map((task, idx) => {
                              const matchedReport = state.dailyReports?.find(r => 
                                r.date === selectedDayInfo.dateStr && 
                                r.tipo?.trim().toLowerCase() === task.name?.trim().toLowerCase()
                              );

                              let taskCardStyle = state.theme === 'dark' ? "bg-white/5 border-white/5 shadow-md bg-[#161d2b]" : "bg-gray-50 border-gray-200";

                              if (matchedReport) {
                                if (matchedReport.status === 'listo') {
                                  taskCardStyle = "bg-green-500/5 border-green-500/20";
                                } else if (matchedReport.status === 'ejecucion') {
                                  taskCardStyle = "bg-blue-500/5 border-blue-500/20";
                                }
                              } else {
                                // Default strictly to pending style if there's no report
                              }

                              return (
                                <div 
                                  key={task.id ? `${task.id}-${idx}` : `dtask-${idx}`}
                                  className={cn(
                                    "flex flex-col gap-2 p-4 rounded-xl border transition-colors relative hover:shadow-lg",
                                    taskCardStyle
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <h4 className="font-black text-sm leading-tight tracking-tight">
                                      {task.name || 'Tarea sin nombre'}
                                    </h4>
                                    {matchedReport && (
                                      <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-[#ffb703]/15 text-[#ffb703] border border-[#ffb703]/25 flex items-center gap-1 shrink-0">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#ffb703] animate-pulse" />
                                        REPORTE CARGADO
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="flex flex-wrap items-center justify-between gap-2 mt-auto pt-2 border-t border-gray-500/5">
                                    <div className="flex items-center gap-1.5 opacity-70 text-xs">
                                      <ListTodo size={14} />
                                      <span className="font-bold truncate max-w-[120px]">{task.wbsName || 'General'}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      {matchedReport ? (
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            onClick={() => setViewingReport(matchedReport)}
                                            className={cn(
                                              "px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg border transition-all flex items-center gap-1 shadow-sm cursor-pointer",
                                              state.theme === "dark" 
                                                ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20" 
                                                : "bg-[#eef2ff] border-indigo-200 text-indigo-700 hover:bg-[#e0e7ff]"
                                            )}
                                          >
                                            <FileText size={12} className="text-indigo-500" />
                                            <span>Ver y Editar Reporte</span>
                                          </button>
                                          
                                          <button
                                            onClick={() => {
                                              setCameraReportToUpdate(matchedReport);
                                              setIsCameraActive(true);
                                              startCamera(cameraFacingMode);
                                            }}
                                            className={cn(
                                              "p-1.5 rounded-lg border transition-all flex items-center gap-1 shadow-sm cursor-pointer",
                                              state.theme === "dark" 
                                                ? "bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20" 
                                                : "bg-[#fffaf0] border-orange-200 text-orange-700 hover:bg-orange-100"
                                            )}
                                            title="Agregar Fotos con Cámara"
                                          >
                                            <Camera size={13} className="text-orange-500" />
                                          </button>
                                          
                                          <button
                                            onClick={() => handleStartReportForm(task)}
                                            className={cn(
                                              "p-1.5 rounded-lg border transition-all flex items-center gap-1 shadow-sm cursor-pointer",
                                              state.theme === "dark" 
                                                ? "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20" 
                                                : "bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-700"
                                            )}
                                            title="Editar Reporte"
                                          >
                                            <svg className="w-3.5 h-3.5 text-amber-550" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => handleStartReportForm(task)}
                                          className={cn(
                                            "px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg border transition-all flex items-center gap-1 shadow-sm cursor-pointer",
                                            state.theme === "dark" 
                                              ? "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20" 
                                              : "bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-700"
                                          )}
                                        >
                                          <PlusCircle size={11} strokeWidth={3} />
                                          <span>Reporte</span>
                                        </button>
                                      )}
                                      
                                      <select
                                        value={matchedReport 
                                          ? (matchedReport.status === 'listo' ? 'TK_Complete' : matchedReport.status === 'ejecucion' ? 'TK_Active' : 'TK_Pending')
                                          : 'TK_Pending'}
                                        onChange={(e) => handleQuickDayStatusChange(task, e.target.value, matchedReport)}
                                        className={cn(
                                          "text-[10px] font-black uppercase tracking-wider rounded-lg px-2.5 py-1 border cursor-pointer focus:outline-none transition-all shadow-sm",
                                          (matchedReport && matchedReport.status === 'listo')
                                            ? "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/20"
                                            : (matchedReport && matchedReport.status === 'ejecucion')
                                            ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
                                            : "bg-gray-500/10 border-gray-500/30 text-gray-500 dark:text-gray-400 hover:bg-gray-500/20"
                                        )}
                                      >
                                        <option value="TK_Pending" className={state.theme === 'dark' ? "bg-[#0b1120] text-white" : "bg-white text-gray-900"}>Pendiente</option>
                                        <option value="TK_Active" className={state.theme === 'dark' ? "bg-[#0b1120] text-white" : "bg-white text-gray-900"}>En Ejecución</option>
                                        <option value="TK_Complete" className={state.theme === 'dark' ? "bg-[#0b1120] text-white" : "bg-white text-gray-900"}>Listo</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Viewing Written Report Floating Modal */}
      <AnimatePresence>
        {viewingReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setViewingReport(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl shadow-2xl border overflow-hidden",
                state.theme === 'dark' 
                  ? "bg-[#0b1120] border-[#1f2a44] text-[#e6edf7]" 
                  : "bg-white border-gray-200 text-[#162033]"
              )}
            >
              {/* Header */}
              <div className={cn(
                "px-6 py-5 border-b flex items-center justify-between shrink-0 bg-[#070b14]/40 backdrop-blur-sm",
                state.theme === 'dark' ? "border-[#1f2a44]" : "border-gray-200 bg-gray-50/50"
              )}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#ffb703]">
                      Reporte Registrado (Historial)
                    </span>
                    <span className="text-gray-500">•</span>
                    <span className="text-[10.5px] font-extrabold uppercase text-indigo-400">
                      WBS: {viewingReport.wbs || 'General'}
                    </span>
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-tight">
                    {viewingReport.tipo || 'Labor'}
                  </h3>
                </div>
                <button
                  onClick={() => setViewingReport(null)}
                  className={cn(
                    "p-2 rounded-xl transition-colors cursor-pointer",
                    state.theme === 'dark' ? "hover:bg-white/10 text-gray-400" : "hover:bg-black/5 text-gray-500"
                  )}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                {/* Visual statistics cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className={cn(
                    "p-4 rounded-2xl border flex flex-col justify-center shadow-sm",
                    state.theme === 'dark' ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-200"
                  )}>
                    <div className="flex items-center gap-2 text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">
                      <User size={12} className="text-indigo-500" />
                      <span>Supervisor</span>
                    </div>
                    <span className="text-sm font-black truncate">{viewingReport.sup || 'No asignado'}</span>
                  </div>

                  <div className={cn(
                    "p-4 rounded-2xl border flex flex-col justify-center shadow-sm",
                    state.theme === 'dark' ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-200"
                  )}>
                    <div className="flex items-center gap-2 text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">
                      <Clock size={12} className="text-[#ffb703]" />
                      <span>Total HH</span>
                    </div>
                    <span className="text-sm font-black text-[#ffb703]">
                      {(viewingReport.hours || 0).toFixed(1)} <span className="text-[10px] font-bold opacity-60">HH</span>
                    </span>
                  </div>
                </div>

                {/* Date of Report */}
                <div className="flex items-center gap-2.5 text-xs font-semibold px-1">
                  <CalendarIcon size={14} className="text-gray-400" />
                  <span className="text-gray-400">Fecha de labor:</span>
                  <span className="font-extrabold text-blue-500">{formatDate(viewingReport.date)}</span>
                </div>

                {/* Report status */}
                <div className="flex items-center gap-2.5 text-xs font-semibold px-1">
                  <span className="text-gray-400">Estado de la labor:</span>
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider leading-none border",
                    viewingReport.status === 'listo' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                    viewingReport.status === 'ejecucion' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                    "bg-gray-500/10 text-gray-400 border-gray-500/20"
                  )}>
                    {viewingReport.status === 'listo' ? 'Listo (Día Completado)' : 
                     viewingReport.status === 'ejecucion' ? 'En Ejecución' : 'Pendiente'}
                  </span>
                </div>

                {/* Details / Comments */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Observaciones ingresadas</h4>
                  <div className={cn(
                    "p-4 rounded-2xl border text-xs leading-relaxed font-semibold italic",
                    state.theme === 'dark' ? "bg-black/20 border-white/5 text-gray-300" : "bg-gray-50/50 border-gray-150 text-gray-700"
                  )}>
                    {viewingReport.detalle ? `"${viewingReport.detalle}"` : '"Sin observaciones registradas para esta jornada."'}
                  </div>
                </div>

                {/* Dynamic Personnel list */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                    <Users size={12} className="text-indigo-400" />
                    <span>Personal Registrado ({viewingReport.workers?.length || 0})</span>
                  </h4>
                  {(!viewingReport.workers || viewingReport.workers.length === 0) ? (
                    <p className="text-xs text-gray-500 font-bold italic px-1">Sin personal cargado para esta labor.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                      {viewingReport.workers.map((name, idx) => {
                        const specificDetail = viewingReport.workersDetail?.find(wd => wd.name === name);
                        const loggedHours = specificDetail ? specificDetail.hours : 12;
                        return (
                          <div 
                            key={idx}
                            className={cn(
                              "flex items-center justify-between p-2.5 rounded-xl border shadow-sm",
                              state.theme === 'dark' ? "bg-white/5 border-white/5" : "bg-white border-gray-100"
                            )}
                          >
                            <span className="text-[11px] font-extrabold truncate max-w-[170px]">{name}</span>
                            <span className="text-[10px] font-black uppercase text-blue-500">{loggedHours} hrs</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Image gallery if any */}
                {viewingReport.images && viewingReport.images.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Archivos adjuntos</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {viewingReport.images.map((img: string, idx: number) => (
                        <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-gray-500/10 group">
                          <img 
                            src={img} 
                            alt={`Evidencia ${idx + 1}`} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className={cn(
                "px-6 py-4 border-t flex justify-end gap-3 bg-[#070b14]/20",
                state.theme === 'dark' ? "border-[#1f2a44]" : "border-gray-200"
              )}>
                <button
                  onClick={() => {
                    if (!viewingReport) return;
                    
                    const reportDateStr = viewingReport.date;
                    const dateObj = new Date(reportDateStr + "T12:00:00");
                    
                    // If the modal was opened from history, day details might not be open. Open it.
                    if (!selectedDayInfo) {
                       setSelectedDayInfo({ 
                         dateObj, 
                         dateStr: reportDateStr, 
                         tasks: [] 
                       });
                       setViewingHistoryDayReports(null); 
                    }

                    let matchedWbsId = '';
                    const primaryLabors = state.scheduleData?.primaryLabors || [];
                    if (viewingReport.wbs) {
                      const matchWbs = primaryLabors.find(p => p.name === viewingReport.wbs);
                      if (matchWbs) matchedWbsId = matchWbs.id;
                    }
                    setSelectedPrimaryWbsId(matchedWbsId);

                    setReportForm({
                      id: viewingReport.id ? String(viewingReport.id) : undefined,
                      laborName: viewingReport.tipo || '',
                      parentWbsName: viewingReport.wbs || 'General',
                      supervisor: viewingReport.sup || '',
                      detalle: viewingReport.detalle || '',
                      selectedWorkers: viewingReport.workersDetail || viewingReport.workers?.map((w: string) => ({ name: w, hours: 12.0 })) || [],
                      status: (viewingReport.status || 'pendiente') as any,
                      taskId: viewingReport.taskId
                    });
                    
                    setWorkerSearch('');
                    const workingGrps = getWorkingGroupForDate(dateObj);
                    const mainGroup = workingGrps.find(g => allAvailableGroups.includes(g)) || workingGrps[0];
                    setWorkerGroupFilter(mainGroup ? mainGroup.toUpperCase() : 'TODOS');

                    setViewingReport(null);
                  }}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black uppercase cursor-pointer transition-all active:scale-95 flex items-center gap-1.5",
                    state.theme === 'dark' 
                      ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 border border-amber-500/30" 
                      : "bg-amber-50 hover:bg-amber-100/80 text-amber-700 border border-amber-200"
                  )}
                >
                  <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Editar Reporte</span>
                </button>

                <button
                  onClick={() => setViewingReport(null)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black uppercase cursor-pointer transition-all active:scale-95",
                    state.theme === 'dark' 
                      ? "bg-white/5 hover:bg-white/10 text-white" 
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  )}
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Viewing History Day Reports Modal */}
        {viewingHistoryDayReports && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setViewingHistoryDayReports(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className={cn(
                "w-full max-w-4xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden",
                state.theme === 'dark' ? "bg-[#0b1120] border-[#1f2a44] text-white" : "bg-white border-gray-200 text-gray-900"
              )}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className={cn(
                "px-6 py-4 border-b flex items-center justify-between shrink-0",
                state.theme === 'dark' ? "border-[#1f2a44] bg-[#161d2b]" : "border-gray-200 bg-gray-50"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm",
                    state.theme === 'dark' ? "bg-[#ffb703] text-black border-[#ffb703]/20" : "bg-blue-600 text-white border-blue-700"
                  )}>
                    <FileText size={20} className="stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Reportes del Día</h3>
                    <p className="text-sm font-bold opacity-75">{formatDate(viewingHistoryDayReports.dateStr)}</p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingHistoryDayReports(null)}
                  className="p-2 rounded-xl hover:bg-gray-500/10 transition-colors opacity-75 hover:opacity-100 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                {viewingHistoryDayReports.reports.length === 0 ? (
                  <div className="text-center py-10 opacity-60 font-bold italic">No hay reportes para este día.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {viewingHistoryDayReports.reports.map((report, idx) => (
                      <div key={idx} className={cn(
                        "p-4 rounded-xl border flex flex-col gap-3 shadow-sm relative",
                        state.theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
                      )}>
                        {/* Report Header */}
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <span className="text-[10px] font-black uppercase opacity-60 block tracking-widest">{report.wbs || 'General'}</span>
                            <h4 className="text-sm font-black uppercase tracking-tight mt-0.5">{report.tipo || 'Sin título'}</h4>
                          </div>
                          <span className={cn(
                            "px-2 py-1 rounded text-[9px] font-black uppercase border tracking-widest ml-2",
                            report.status === 'listo' ? "bg-green-500/10 text-green-600 border-green-500/20" :
                            report.status === 'ejecucion' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                            "bg-gray-500/10 text-gray-500 border-gray-500/20"
                          )}>
                            {report.status === 'listo' ? 'Listo (Completado)' : 
                             report.status === 'ejecucion' ? 'En Ejecución' : 'Pendiente'}
                          </span>
                        </div>

                        {/* Report Details */}
                        {report.detalle && (
                          <div className={cn(
                            "p-3 rounded-lg text-xs leading-relaxed italic border-l-2",
                            state.theme === 'dark' ? "bg-[#060913] border-white/20 text-gray-300" : "bg-gray-50 border-gray-300 text-gray-600"
                          )}>
                            {report.detalle}
                          </div>
                        )}

                        {/* Sublabors */}
                        {report.subLabors && report.subLabors.length > 0 && (
                          <div className="space-y-1 mt-1">
                            <span className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1">
                              <ListTodo size={12} />
                              Sub-Labores ({report.subLabors.length})
                            </span>
                            <div className="grid gap-1">
                              {report.subLabors.map((sl, index) => (
                                <div key={index} className="flex justify-between items-center text-[10px] bg-black/5 dark:bg-black/20 p-1.5 rounded">
                                  <span className="font-bold truncate" title={sl.name}>{sl.name}</span>
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded uppercase font-black tracking-wider text-[8px]",
                                    sl.status === 'listo' ? "bg-green-500/20 text-green-600" :
                                    sl.status === 'ejecucion' ? "bg-blue-500/20 text-blue-500" : "bg-gray-500/20 text-gray-500"
                                  )}>
                                    {sl.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Personnel */}
                        <div className="space-y-1 mt-1">
                          <span className="text-[10px] font-bold uppercase opacity-60 flex items-center gap-1">
                            <Users size={12} />
                            Personal ({report.workers?.length || 0})
                          </span>
                          {(!report.workers || report.workers.length === 0) ? (
                            <div className="text-[10px] opacity-50 italic">Sin personal</div>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {report.workers.map((workerName, wIdx) => {
                                const wd = report.workersDetail?.find(d => d.name === workerName);
                                return (
                                  <span key={wIdx} className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded text-[9px] font-black flex items-center gap-1">
                                    {workerName}
                                    {wd && <span className="opacity-60">({wd.hours}h)</span>}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Evidence */}
                        {report.images && report.images.length > 0 && (
                          <div className="space-y-1 mt-1 font-bold text-[10px] flex items-center gap-1 text-orange-500">
                            <Camera size={12} />
                            Evidencias ({report.images.length})
                          </div>
                        )}

                        {/* View Full Button */}
                        <div className="mt-auto pt-3 flex justify-end">
                          <button
                            onClick={() => {
                              setViewingHistoryDayReports(null);
                              setViewingReport(report);
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-colors cursor-pointer border shadow-sm",
                              state.theme === 'dark' ? "bg-white/5 hover:bg-white/10" : "bg-gray-50 hover:bg-gray-100 border-gray-200"
                            )}
                          >
                            Ver Reporte Completo
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {isCameraActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#060913]/80 backdrop-blur-md z-[250] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className={cn(
                "w-full max-w-lg rounded-2xl border p-5 shadow-2xl flex flex-col gap-4 overflow-hidden relative",
                state.theme === 'dark' ? "bg-[#0b1120] border-[#1f2a44] text-white" : "bg-white border-gray-200 text-gray-900"
              )}
            >
              <div className="flex items-center justify-between border-b pb-3 border-gray-500/10">
                <div className="flex items-center gap-2">
                  <div className="p-1 px-2.5 rounded-full text-[10px] uppercase font-black tracking-widest bg-orange-500/10 text-orange-400 border border-orange-500/25 flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping" />
                    Cámara en Vivo
                  </div>
                </div>
                <button
                  onClick={stopCamera}
                  className="p-1.5 rounded-lg hover:bg-gray-500/10 transition-colors opacity-75 hover:opacity-100 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Contenedor del video o foto capturada */}
              <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-gray-500/10 flex items-center justify-center">
                {isCameraLoading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#060913]/90 text-white">
                    <Loader2 className="animate-spin text-orange-500" size={32} />
                    <span className="text-xs font-bold uppercase tracking-wider opacity-75">Iniciando cámara...</span>
                  </div>
                )}

                {cameraError ? (
                  <div className="absolute inset-0 z-10 p-6 flex flex-col items-center justify-center text-center gap-3 bg-[#060913]/95 text-white">
                    <div className="p-3 bg-red-500/15 text-red-500 rounded-full border border-red-500/20">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <span className="text-xs font-bold leading-relaxed">{cameraError}</span>
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                      <button
                        onClick={() => startCamera(cameraFacingMode)}
                        className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md"
                      >
                        Reintentar conexión
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center gap-1"
                      >
                        <Camera size={13} className="stroke-[2.5]" />
                        Tomar Foto Nativa / Galería
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Si hay una foto capturada y lista para confirmar */}
                {liveCapturedPhoto ? (
                  <img
                    src={liveCapturedPhoto}
                    alt="Foto capturada"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={cn(
                      "w-full h-full object-cover",
                      cameraFacingMode === 'user' && "-scale-x-100"
                    )}
                  />
                )}
              </div>

              {/* Hidden native input capture for system camera/gallery */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleNativePhotoCapture}
                className="hidden"
              />

              {/* Detalles del reporte destino */}
              {cameraReportToUpdate && (
                <div className="p-3 rounded-xl border border-dashed border-gray-500/15 bg-gray-500/5 text-left">
                  <div className="text-[9px] font-black uppercase tracking-widest opacity-60">Reporte Destino</div>
                  <div className="text-xs font-bold mt-1 tracking-tight truncate">
                    {cameraReportToUpdate.tipo || "Reporte Diario"} ({cameraReportToUpdate.date})
                  </div>
                  {cameraReportToUpdate.detalle && (
                    <div className="text-[11px] opacity-75 mt-0.5 line-clamp-1">{cameraReportToUpdate.detalle}</div>
                  )}
                </div>
              )}

              {/* Botones de control */}
              <div className="flex items-center justify-between border-t pt-3 border-gray-500/10">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={stopCamera}
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-xs font-black uppercase transition-all tracking-wider cursor-pointer active:scale-95",
                      state.theme === 'dark' 
                        ? "bg-white/5 hover:bg-white/10 text-white" 
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    )}
                  >
                    Cerrar / Cancelar
                  </button>

                  {!liveCapturedPhoto && !cameraError && (
                    <button
                      type="button"
                      disabled={isCameraLoading}
                      onClick={toggleCameraFacing}
                      className={cn(
                        "p-2 rounded-xl border transition-all active:scale-95 cursor-pointer disabled:opacity-50",
                        state.theme === 'dark' 
                          ? "bg-white/5 hover:bg-white/10 border-[#1f2a44] text-gray-300" 
                          : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600"
                      )}
                      title="Rotar Cámara"
                    >
                      <svg className={cn("w-4 h-4 stroke-[2.5]", isCameraLoading && "animate-spin")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 15h-.582" />
                      </svg>
                    </button>
                  )}

                  {!liveCapturedPhoto && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "p-2 py-2 px-3 rounded-xl border transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-black uppercase",
                        state.theme === 'dark' 
                          ? "bg-[#1f2a44] hover:bg-[#253556] border-[#2e3f66] text-orange-400" 
                          : "bg-orange-50 hover:bg-orange-100 border-orange-250 text-orange-700"
                      )}
                      title="Subir o Tomar Foto con Cámara Nativa"
                    >
                      <Camera size={13} className="stroke-[2.5]" />
                      <span>Foto Nativa / Galería</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {liveCapturedPhoto ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setLiveCapturedPhoto(null)}
                        className={cn(
                          "px-3.5 py-2 rounded-xl text-xs font-black uppercase transition-all tracking-wider border border-dashed cursor-pointer active:scale-95",
                          state.theme === 'dark'
                            ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                            : "border-amber-300 text-amber-700 hover:bg-amber-50"
                        )}
                      >
                        Repetir Foto
                      </button>

                      <button
                        type="button"
                        onClick={saveLiveCapturedPhoto}
                        className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl text-xs font-black uppercase transition-all tracking-wider shadow-lg flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Check size={14} className="stroke-[3]" />
                        Confirmar y Guardar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isCameraLoading || !!cameraError}
                      onClick={capturePhoto}
                      className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white rounded-xl text-xs font-black uppercase transition-all tracking-wider disabled:opacity-50 shadow-lg flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Camera size={14} className="stroke-[2.5]" />
                      Capturar Foto
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!reportToDelete}
        onClose={() => setReportToDelete(null)}
        onConfirm={async () => {
          if (reportToDelete) {
            try {
              await deleteDailyReport(String(reportToDelete.id));
              notify('success', 'Reporte eliminado con éxito');
            } catch (err) {
              console.error(err);
              notify('error', 'Error al eliminar el reporte');
            }
            setReportToDelete(null);
          }
        }}
        title="Eliminar Reporte"
        message="¿Está seguro de que desea eliminar este reporte adicional/manual del calendario? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
      />
    </>
  );
}


