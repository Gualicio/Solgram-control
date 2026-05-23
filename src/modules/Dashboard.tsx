import React, { useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { 
  Activity, BarChart3, TrendingUp, Users, Clock, AlertTriangle,
  AlertCircle, ArrowUpRight, Search, X 
} from 'lucide-react';
import { cn, formatNumber, formatDate } from '../lib/utils';
import ActivityDetail from './ActivityDetail';
import AvanceCurve from './AvanceCurve';

export default function Dashboard() {
  const { state } = useApp();

  const [activeModal, setActiveModal] = useState<{
    type: 'tasks' | 'turno' | 'descanso' | 'sin_turno' | 'licencia';
    title: string;
    description: string;
  } | null>(null);

  const [searchTerm, setSearchTerm] = useState('');

  const schedule = state.scheduleData;
  const reports = state.dailyReports;
  const hps = state.shiftConfig?.hoursPerShift || 12;

  const projectPlazoDays = useMemo(() => {
    if (!schedule?.startDate || !schedule?.endDate) return 0;
    const s = new Date(schedule.startDate);
    const e = new Date(schedule.endDate);
    return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  }, [schedule]);


  const stats = useMemo(() => {
    const planned = schedule?.stats.sumPlannedHrs || 0;
    
    // Calculate scale factor to translate task duration to project hours
    const rawSumTotalTasksHrs = (schedule?.tasks || []).reduce((acc, tk) => {
      if (!tk.isMilestone && tk.startDate && tk.endDate && tk.durationHrs > 0) {
        return acc + tk.durationHrs;
      }
      return acc;
    }, 0);
    const scaleFactor = (rawSumTotalTasksHrs > 0) ? ((schedule?.stats.sumTotalHrs || 0) / rawSumTotalTasksHrs) : 1;

    // Calculate actual hours based on gantt planned times for reports marked as 'listo'
    let totalAvanceReal = 0;
    (state.dailyReports || []).forEach(report => {
      if (report.status === 'listo') {
        let matchedTask = null;
        if (report.taskId) {
           matchedTask = schedule?.tasks.find(t => t.id === report.taskId);
        } else {
           matchedTask = schedule?.tasks.find(t => t.name.trim().toLowerCase() === report.tipo?.trim().toLowerCase());
        }
        
        if (matchedTask && matchedTask.startDate && matchedTask.endDate && matchedTask.durationHrs > 0) {
           const s = new Date(matchedTask.startDate);
           const e = new Date(matchedTask.endDate);
           const diffDays = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000));
           const hrsPerDay = (matchedTask.durationHrs * scaleFactor) / diffDays;
           totalAvanceReal += hrsPerDay;
        }
      }
    });

    const actual = totalAvanceReal;
      
    const total = schedule?.stats.sumTotalHrs || 1;
    
    const plannedPct = (planned / total) * 100;
    const actualPct = (actual / total) * 100;
    const variance = actualPct - plannedPct;
    const hourVariance = actual - planned;

    return { plannedPct, actualPct, variance, hourVariance, actual, planned };
  }, [schedule, state.dailyReports]);

  const delayedLabors = useMemo(() => {
    const primaryLabors = state.scheduleData?.primaryLabors || [];
    const today = new Date().toISOString().slice(0, 10);
    return primaryLabors.filter(p => p.endDate && p.endDate.slice(0, 10) < today);
  }, [state.scheduleData]);

  const extraHoursTotal = useMemo(() => {
    if (!state.workerExtraHoursAggregate) return 0;
    return Object.values(state.workerExtraHoursAggregate).reduce((a, b) => (a as number) + (b as number), 0);
  }, [state.workerExtraHoursAggregate]);

  const filteredModalData = useMemo(() => {
    if (!activeModal) return [];
    const s = searchTerm.toLowerCase().trim();

    if (activeModal.type === 'tasks') {
      const ts = schedule?.tasks || [];
      if (!s) return ts;
      return ts.filter(t => 
        (t.name || '').toLowerCase().includes(s) || 
        (t.id || '').toLowerCase().includes(s) || 
        (t.wbsName || '').toLowerCase().includes(s)
      );
    } else {
      const workers = state.workers || [];
      let groupWorkers: any[] = [];
      if (activeModal.type === 'turno') {
        groupWorkers = workers.filter(w => w.estado === 'Turno');
      } else if (activeModal.type === 'descanso') {
        groupWorkers = workers.filter(w => w.estado === 'Descanso');
      } else if (activeModal.type === 'sin_turno') {
        groupWorkers = workers.filter(w => w.estado === 'Sin Turno');
      } else if (activeModal.type === 'licencia') {
        groupWorkers = workers.filter(w => w.estado === 'Licencia');
      }

      if (!s) return groupWorkers;
      return groupWorkers.filter(w => 
        (w.nombre || '').toLowerCase().includes(s) || 
        (w.rut || '').toLowerCase().includes(s) || 
        (w.cargo || '').toLowerCase().includes(s) || 
        (w.grupo || '').toLowerCase().includes(s)
      );
    }
  }, [activeModal, searchTerm, schedule, state.workers]);

  const shiftRotationInfo = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
    const manualOffset = (state.syncMeta as any)?.turnOffset || 0;
    
    let daysRemaining = 0;
    let currentShiftWorkingGroups: string[] = [];
    let currentShiftRestingGroups: string[] = [];

    if (state.shiftConfig && state.shiftConfig.anchorDate) {
      const { anchorDate, anchorShift, cycleDays } = state.shiftConfig;
      const anchor = new Date(anchorDate + 'T12:00:00');
      anchor.setHours(12, 0, 0, 0);
      
      const currentMidDay = new Date(today.getTime());
      currentMidDay.setHours(12, 0, 0, 0);
      
      let diffAnchor = Math.floor((currentMidDay.getTime() - anchor.getTime()) / 86400000);
      diffAnchor += manualOffset;
      
      const cycleTotalGlobal = cycleDays * 2;
      const posInGlobalCycle = ((diffAnchor % cycleTotalGlobal) + cycleTotalGlobal) % cycleTotalGlobal;
      const isAWorking = posInGlobalCycle < cycleDays; 
      
      if (posInGlobalCycle < cycleDays) {
        daysRemaining = cycleDays - posInGlobalCycle;
      } else {
        daysRemaining = cycleTotalGlobal - posInGlobalCycle;
      }

      const isAWorkingNow = anchorShift === 'A' ? isAWorking : !isAWorking;
      if (isAWorkingNow) {
        currentShiftWorkingGroups = ['A', 'C'];
        currentShiftRestingGroups = ['B', 'D'];
      } else {
        currentShiftWorkingGroups = ['B', 'D'];
        currentShiftRestingGroups = ['A', 'C'];
      }
    } else {
      let diffDays = Math.floor((today.getTime() - baseDate.getTime()) / 86400000);
      diffDays += manualOffset;
      const positionInCycle = ((diffDays % cycleTotal) + cycleTotal) % cycleTotal;
      
      if (positionInCycle < t) {
        daysRemaining = t - positionInCycle;
        currentShiftWorkingGroups = ['A', 'C'];
        currentShiftRestingGroups = ['B', 'D'];
      } else {
        daysRemaining = cycleTotal - positionInCycle;
        currentShiftWorkingGroups = ['B', 'D'];
        currentShiftRestingGroups = ['A', 'C'];
      }
    }

    const activeRealGroups = new Set<string>();
    const restingRealGroups = new Set<string>();
    (state.workers || []).forEach(w => {
      let g = (w.grupo || '').toUpperCase().trim();
      if (g && g !== 'S/G' && g !== 'S/N' && g !== 'S' && g !== 'SN' && g !== 'SIN GRUPO' && g !== '-' && g !== '') {
        if (w.estado === 'Turno') activeRealGroups.add(g);
        else if (w.estado === 'Descanso') restingRealGroups.add(g);
      }
    });

    if (activeRealGroups.size > 0) {
      currentShiftWorkingGroups = Array.from(activeRealGroups).sort();
    }
    if (restingRealGroups.size > 0) {
      currentShiftRestingGroups = Array.from(restingRealGroups).sort();
    }

    const finalDaysRemaining = Math.max(1, daysRemaining);

    return {
      daysRemaining: finalDaysRemaining,
      workingGroups: currentShiftWorkingGroups.join(', ') || 'A/C',
      restingGroups: currentShiftRestingGroups.join(', ') || 'B/D'
    };
  }, [state.workers, state.shiftConfig, state.scheduleData, state.syncMeta]);

  const completedCount = useMemo(() => {
    if (!schedule?.tasks) return 0;
    const completedTaskIds = new Set<string>();
    
    // Calculate strictly from daily reports marked as "listo" (Completed/Listo)
    if (reports) {
      reports.forEach((r: any) => {
        if (r.status === 'listo') {
          if (r.taskId) {
            completedTaskIds.add(r.taskId);
          } else {
            const match = schedule.tasks.find((t: any) => 
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
  }, [schedule, reports]);

  const kpis = [
    { 
      label: 'Tareas Activas', 
      type: 'tasks' as const,
      value: schedule?.stats.total || 0, 
      sub: `${completedCount} completadas`, 
      icon: Activity, 
      color: 'text-blue-500',
      extra: (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-white/5 flex flex-col gap-0.5 font-sans">
          <span className="text-[9px] font-black text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded w-max tracking-wider uppercase">
             P6 Activo
          </span>
          <span className="text-[8.5px] text-gray-400 font-bold mt-0.5 uppercase tracking-wide">
             {schedule?.tasks.length || 0} de P6 total
          </span>
        </div>
      )
    },
    { 
      label: 'Personal en Turno', 
      type: 'turno' as const,
      value: state.personnelData?.onDutyCount || 0, 
      sub: 'Activos hoy', 
      icon: Users, 
      color: 'text-cyan-500',
      extra: (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-white/5 flex flex-col gap-0.5 font-sans">
          <span className="text-[9px] font-black text-cyan-500 bg-cyan-500/10 px-1.5 py-0.5 rounded w-max tracking-wider uppercase">
             Grupo {shiftRotationInfo.workingGroups}
          </span>
          <span className="text-[8.5px] text-gray-400 font-bold mt-0.5 uppercase tracking-wide">
             Cambio en {shiftRotationInfo.daysRemaining} {shiftRotationInfo.daysRemaining === 1 ? 'día' : 'días'}
          </span>
        </div>
      )
    },
    { 
      label: 'En Descanso', 
      type: 'descanso' as const,
      value: state.personnelData?.offDutyCount || 0, 
      sub: 'Turno en bajada', 
      icon: Users, 
      color: 'text-orange-500',
      extra: (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-white/5 flex flex-col gap-0.5 font-sans">
          <span className="text-[9px] font-black text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded w-max tracking-wider uppercase">
             Grupo {shiftRotationInfo.restingGroups}
          </span>
          <span className="text-[8.5px] text-gray-400 font-bold mt-0.5 uppercase tracking-wide">
             Retorno en {shiftRotationInfo.daysRemaining} {shiftRotationInfo.daysRemaining === 1 ? 'día' : 'días'}
          </span>
        </div>
      )
    },
    { 
      label: 'S/N (Sin Turno)', 
      type: 'sin_turno' as const,
      value: state.workers?.filter(w => w.estado === 'Sin Turno').length || 0, 
      sub: 'Grupo S / Sin asignar', 
      icon: Users, 
      color: 'text-emerald-500',
      extra: (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-white/5 flex flex-col gap-0.5 font-sans">
          <span className="text-[9px] font-black text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded w-max tracking-wider uppercase">
             Disponibles
          </span>
          <span className="text-[8.5px] text-gray-400 font-bold mt-0.5 uppercase tracking-wide">
             Personal de retén
          </span>
        </div>
      )
    },
    { 
      label: 'Alertas Médicas', 
      type: 'licencia' as const,
      value: state.personnelData?.licenciaCount || 0, 
      sub: 'Bajas activas', 
      icon: AlertCircle, 
      color: 'text-red-500',
      extra: (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-white/5 flex flex-col gap-0.5 font-sans">
          <span className="text-[9px] font-black text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded w-max tracking-wider uppercase">
             Excluidos
          </span>
          <span className="text-[8.5px] text-gray-400 font-bold mt-0.5 uppercase tracking-wide">
             Bajas temporales
          </span>
        </div>
      )
    },
  ];

  return (
    <div className="p-4 md:p-8 w-full space-y-6 animate-in fade-in duration-500">
      {/* Master Operational Dashboard Panel */}
      <section className={cn(
        "p-6 rounded-2xl border shadow-xl flex flex-col gap-5 overflow-hidden relative",
        state.theme === 'dark' ? "bg-[#111c34] border-[#293754]" : "bg-white border-gray-100"
      )}>
        {/* Glow effect for dark theme */}
        {state.theme === 'dark' && (
          <div className="absolute top-0 right-0 w-[500px] h-full bg-blue-500/5 blur-[80px] pointer-events-none" />
        )}

        {/* TOP ROW: Project Info, Core Stats & Progress Bar */}
        <div className="z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left Column: Project Name & Timeline Metadata */}
          <div className="flex flex-col min-w-fit">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              <h1 className={cn(
                "text-lg font-black tracking-tight uppercase",
                state.theme === 'dark' ? "text-white" : "text-gray-900"
              )}>
                {schedule?.name || "Esperando cronograma"}
              </h1>
            </div>
            <p className="text-[10.5px] text-gray-400 dark:text-gray-400 font-bold mt-1 ml-4 uppercase tracking-wide">
              {schedule 
                ? `${schedule.fileName} • ${formatDate(schedule.startDate)} al ${formatDate(schedule.endDate)}` 
                : "Carga un archivo .xer para iniciar"}
            </p>
          </div>

          {/* Central Column: HH Programmed, Plazo, HH Reales, Desv. */}
          <div className="flex flex-wrap gap-4 md:gap-6 font-sans py-3 px-4 rounded-xl bg-white dark:bg-black/25 border border-gray-200 dark:border-white/5 w-full lg:w-auto shadow-sm">
            {/* HH Programadas */}
            <div className="flex flex-col min-w-max justify-center">
              <span className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-0.5">HH Prog.</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-amber-600 dark:text-[#ffb703] leading-none">{formatNumber(schedule?.stats.sumTotalHrs || 0)} <span className="text-xs">h</span></span>
                <span className="text-[10px] font-bold text-amber-600/70 dark:text-[#ffb703]/80 leading-none">({formatNumber(Math.round((schedule?.stats.sumTotalHrs || 0) / hps))} DH)</span>
              </div>
            </div>
            {/* Plazo Cronograma */}
            <div className={cn(
              "flex flex-col min-w-max border-l pl-4 md:pl-5 justify-center",
              state.theme === 'dark' ? "border-white/10" : "border-gray-200"
            )}>
              <span className="text-[9px] font-black text-orange-600 dark:text-amber-500 uppercase tracking-widest mb-0.5">Plazo</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-orange-600 dark:text-amber-500 leading-none">{projectPlazoDays} <span className="text-xs">días</span></span>
                <span className="text-[10px] font-bold text-orange-600/70 dark:text-amber-500/80 leading-none">(Corr.)</span>
              </div>
            </div>
            {/* Avance Real */}
            <div className={cn(
              "flex flex-col min-w-max border-l pl-4 md:pl-5 justify-center",
              state.theme === 'dark' ? "border-white/10" : "border-gray-200"
            )}>
              <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-0.5">Avance Real</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-blue-600 dark:text-blue-500 leading-none">{formatNumber(stats.actual || 0)} <span className="text-xs">h</span></span>
                <span className="text-[10px] font-bold text-blue-600/70 dark:text-blue-500/80 leading-none">({formatNumber(Math.round((stats.actual || 0) / hps))} DH)</span>
              </div>
            </div>
            {/* Avance Esperado */}
            <div className={cn(
              "flex flex-col min-w-max border-l pl-4 md:pl-5 justify-center",
              state.theme === 'dark' ? "border-white/10" : "border-gray-200"
            )}>
              <span className="text-[9px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-0.5">Avance Esperado</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-purple-600 dark:text-purple-500 leading-none">{formatNumber(stats.planned || 0)} <span className="text-xs">h</span></span>
                <span className="text-[10px] font-bold text-purple-600/70 dark:text-purple-500/80 leading-none">({formatNumber(Math.round((stats.planned || 0) / hps))} DH)</span>
              </div>
            </div>
            {/* Desviacion */}
            <div className={cn(
              "flex flex-col min-w-max border-l pl-4 md:pl-5 justify-center",
              state.theme === 'dark' ? "border-white/10" : "border-gray-200"
            )}>
              <span className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-0.5">Desv.</span>
              <div className="flex items-baseline gap-1.5">
                <span className={cn(
                  "text-lg font-black transition-colors leading-none",
                  stats.hourVariance >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500"
                )}>
                  {stats.hourVariance >= 0 ? "+" : ""}{stats.hourVariance.toFixed(1)} <span className="text-xs">h</span>
                </span>
                <span className={cn(
                  "text-[10px] font-bold opacity-80 leading-none",
                  stats.hourVariance >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500"
                )}>
                  ({stats.hourVariance >= 0 ? "+" : ""}{(stats.hourVariance / hps).toFixed(1)} DH)
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Progress bar, delay/extra alert pills */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 lg:min-w-[280px]">
            {/* Progress bar container */}
            <div className="flex-1 w-full flex flex-col gap-1">
              <div className="flex justify-between items-center text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <span>P6: {stats.plannedPct.toFixed(1)}%</span>
                <span className={cn("px-1.5 py-0.5 rounded text-[8.5px] font-black", stats.variance >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500")}>
                  {stats.variance >= 0 ? "+" : ""}{stats.variance.toFixed(1)}%
                </span>
              </div>
              <div className={cn(
                "h-3 rounded-full overflow-hidden p-0.5 border w-full",
                state.theme === 'dark' ? "bg-black/40 border-white/5" : "bg-gray-100 border-gray-200"
              )}>
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-1000",
                    state.theme === 'dark' ? "bg-gradient-to-r from-blue-500 to-green-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]" : "bg-blue-600"
                  )}
                  style={{ width: `${stats.actualPct}%` }}
                />
              </div>
            </div>

            {/* Quick alert badges */}
            <div className="flex gap-2 self-stretch md:self-auto items-center">
              {delayedLabors.length > 0 && (
                <div className={cn(
                  "px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 h-max",
                  state.theme === 'dark' ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-100"
                )}>
                  <AlertTriangle size={12} className="text-red-500" />
                  <span className="text-[9px] font-black text-red-500 font-mono">-{delayedLabors.length} ACTV</span>
                </div>
              )}

              {extraHoursTotal > 0 && (
                <div className={cn(
                  "px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 h-max",
                  state.theme === 'dark' ? "bg-yellow-500/10 border-yellow-500/20" : "bg-yellow-50 border-yellow-200"
                )}>
                  <Clock size={12} className="text-yellow-500" />
                  <span className="text-[9px] font-black text-yellow-500 font-mono">{extraHoursTotal.toFixed(1)}H EXTRAS</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Divider line */}
        <div className="h-px w-full bg-gray-100 dark:bg-white/10" />

        {/* BOTTOM ROW: Operational Pillar KPIs integrated seamlessly */}
        <div className="z-10 grid grid-cols-2 md:grid-cols-5 gap-px bg-gray-200/60 dark:bg-white/10 rounded-2xl overflow-hidden border border-gray-200/60 dark:border-white/10 shadow-inner">
          {kpis.map((kpi, idx) => (
            <div 
              key={idx} 
              onClick={() => {
                setSearchTerm('');
                setActiveModal({
                  type: kpi.type,
                  title: kpi.label,
                  description: kpi.sub
                });
              }}
              className={cn(
                "p-4 transition-all duration-300 scale-100 hover:bg-gray-50/70 dark:hover:bg-white/5 cursor-pointer flex flex-col justify-between min-h-[145px] hover:shadow-inner",
                state.theme === 'dark' ? "bg-[#141f37]" : "bg-white",
                idx === 4 ? "col-span-2 md:col-span-1" : ""
              )}
            >
              <div>
                <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-black/5 dark:border-white/5">
                  <div className="flex items-center gap-1.5">
                    <kpi.icon className={kpi.color} size={15} />
                    <span className="text-[9.5px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider leading-none">
                      {kpi.label}
                    </span>
                  </div>
                  <ArrowUpRight size={11} className="text-gray-450 dark:text-gray-500" />
                </div>
                
                <div className="flex items-baseline gap-1 mt-1">
                  <span className={cn(
                    "text-2xl font-black tracking-tight",
                    state.theme === 'dark' ? "text-white" : "text-gray-900"
                  )}>{kpi.value}</span>
                  <span className="text-[10px] text-gray-450 dark:text-gray-500 font-bold tracking-tight pr-0.5">{kpi.sub}</span>
                </div>
              </div>

              {kpi.extra}
            </div>
          ))}
        </div>
      </section>

      {/* Avance Curve Section */}
      <section className={cn(
        "p-4 md:p-8 rounded-3xl border shadow-2xl overflow-hidden flex flex-col relative min-h-[450px]",
        state.theme === 'dark' ? "bg-[#0d1117] border-[#30363d]" : "bg-white border-gray-200"
      )}>
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 blur-[120px] pointer-events-none" />
        <div className="flex-1 relative">
          <AvanceCurve />
        </div>
      </section>




      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-4">
          <div className={cn(
            "p-8 rounded-3xl border shadow-xl flex flex-col h-full",
            state.theme === 'dark' ? "bg-[#18243d] border-[#293754]" : "bg-white border-gray-200"
          )}>
            <div className="mb-6">
              <h2 className={cn(
                "text-xl font-black uppercase tracking-tight flex items-center gap-2",
                state.theme === 'dark' ? "text-white" : "text-gray-900"
              )}>
                <Activity className="text-blue-500" size={20} />
                Actividad Actual
              </h2>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Detalle de Tarea Seleccionada</p>
            </div>
            <div className="flex-1">
               <ActivityDetail />
            </div>
          </div>
        </div>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
        <div className={cn(
          "p-6 rounded-3xl border shadow-xl flex flex-col justify-center",
          state.theme === 'dark' ? "bg-[#18243d] border-[#293754]" : "bg-white border-gray-100"
        )}>
          <div className="space-y-6">
             <div className="space-y-4">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold border border-blue-500/20">
                     {state.personnelData?.byGroup ? Object.keys(state.personnelData.byGroup).length : 0}
                  </div>
                  <div>
                     <div className="text-xs font-bold">Dotaciones (Grupos)</div>
                     <p className="text-[10px] text-gray-500">Cantidad de grupos o cuadrillas distintas identificadas en el listado de personal cargado.</p>
                  </div>
               </div>
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500 font-bold border border-green-500/20">
                     {reports.length}
                  </div>
                  <div>
                     <div className="text-xs font-bold">Reportes Consolidados</div>
                     <p className="text-[10px] text-gray-500">{formatNumber(state.totalReportedHours)} horas hombre totales</p>
                  </div>
               </div>
             </div>
          </div>
        </div>

        <div className={cn(
          "lg:col-span-2 p-8 rounded-3xl border shadow-xl bg-opacity-20",
          state.theme === 'dark' ? "bg-red-500/5 border-red-500/20" : "bg-red-50 border-red-100 font-bold"
        )}>
           <h3 className="text-xl font-black uppercase text-red-500 mb-6 flex items-center justify-between">
             Estado de Sincronización
             <AlertCircle size={22} />
           </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className={cn(
                  "flex justify-between items-center p-4 rounded-xl border",
                  state.theme === 'dark' ? "bg-black/20 border-white/5" : "bg-gray-50 border-gray-200"
                )}>
                   <div className="flex flex-col">
                      <span className="text-[10px] text-gray-500 font-bold uppercase">Cronograma P6</span>
                      <span className={cn(
                        "text-sm font-bold",
                        state.theme === 'dark' ? "text-white" : "text-gray-900"
                      )}>{schedule?.fileName || "Pendiente"}</span>
                   </div>
                   <span className={cn("px-3 py-1 rounded text-[10px] font-black uppercase", state.scheduleData ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500")}>
                     {state.scheduleData ? "SINC" : "EMPTY"}
                   </span>
                </div>
                <div className={cn(
                  "flex justify-between items-center p-4 rounded-xl border",
                  state.theme === 'dark' ? "bg-black/20 border-white/5" : "bg-gray-50 border-gray-200"
                )}>
                   <div className="flex flex-col">
                      <span className="text-[10px] text-gray-500 font-bold uppercase">Base de Personal</span>
                      <span className={cn(
                        "text-sm font-bold",
                        state.theme === 'dark' ? "text-white" : "text-gray-900"
                      )}>{state.personnelData?.totalWorkers || 0} Trabajadores</span>
                   </div>
                   <span className={cn("px-3 py-1 rounded text-[10px] font-black uppercase", state.personnelData ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500")}>
                     {state.personnelData ? "ACTIVE" : "EMPTY"}
                   </span>
                </div>
              </div>

              <div className="flex flex-col justify-center bg-blue-500/5 p-6 rounded-2xl border border-blue-500/10">
                 <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">Última Actualización</div>
                 <div className="text-2xl font-black text-blue-500">
                    {state.syncMeta.lastReportSync ? new Date(state.syncMeta.lastReportSync).toLocaleTimeString() : '---'}
                 </div>
                 <p className="text-[10px] text-gray-500 mt-2 font-medium">Los datos se consolidan automáticamente al cargar nuevos reportes diarios o archivos de personal.</p>
              </div>
           </div>
        </div>
      </div>

      {activeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={cn(
            "w-full max-w-4xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200",
            state.theme === 'dark' ? "bg-[#0d1117] border-[#30363d]" : "bg-white border-gray-200"
          )}>
            {/* Modal Header */}
            <div className={cn(
              "flex justify-between items-center p-6 border-b",
              state.theme === 'dark' ? "border-[#30363d]/30" : "border-gray-100"
            )}>
              <div>
                <h3 className={cn(
                  "text-xl font-black uppercase tracking-tight font-sans",
                  state.theme === 'dark' ? "text-white" : "text-gray-900"
                )}>{activeModal.title}</h3>
                <p className="text-xs text-gray-500 font-bold uppercase mt-1">
                  Total: {filteredModalData.length} {activeModal.type === 'tasks' ? 'Tareas' : 'Colaboradores'} {searchTerm && `(Filtrado)`}
                </p>
              </div>
              <button 
                onClick={() => {
                  setActiveModal(null);
                  setSearchTerm('');
                }}
                className="p-2 hover:bg-gray-500/20 rounded-full transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Search Box */}
            <div className={cn(
              "p-4 border-b flex items-center gap-3",
              state.theme === 'dark' ? "bg-[#161b22] border-[#30363d]/30" : "bg-gray-50 border-gray-100"
            )}>
              <Search size={16} className="text-gray-400" />
              <input 
                type="text"
                placeholder={activeModal.type === 'tasks' ? "Buscar tarea por nombre, ID o WBS..." : "Buscar persona por nombre, RUT, cargo o grupo..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent text-sm w-full focus:outline-none placeholder-gray-400 font-medium text-left"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="text-xs uppercase font-black text-gray-500 hover:text-gray-700 whitespace-nowrap"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto">
              {filteredModalData.length === 0 ? (
                <div className="p-12 text-center text-gray-500 uppercase font-black text-xs tracking-wider">
                  No se encontraron resultados
                </div>
              ) : activeModal.type === 'tasks' ? (
                /* Tasks Table Layout */
                <table className="w-full text-left border-collapse">
                  <thead className={cn(
                    "sticky top-0 z-10 uppercase text-[10px] font-black tracking-wider",
                    state.theme === 'dark' ? "bg-[#1a1d24] text-gray-400" : "bg-gray-100 text-gray-500"
                  )}>
                    <tr>
                      <th className="px-6 py-4">ID / Nombre</th>
                      <th className="px-6 py-4">Ubicación WBS</th>
                      <th className="px-6 py-4">Duración</th>
                      <th className="px-6 py-4">Plazo</th>
                      <th className="px-6 py-4 text-right">Progreso</th>
                    </tr>
                  </thead>
                  <tbody className={cn(
                    "divide-y text-xs",
                    state.theme === 'dark' ? "divide-[#30363d]/30" : "divide-gray-100"
                  )}>
                    {filteredModalData.map((task: any, idx: number) => (
                      <tr key={idx} className={cn(
                        "transition-colors",
                        state.theme === 'dark' ? "hover:bg-white/5" : "hover:bg-gray-50"
                      )}>
                        <td className="px-6 py-4">
                          <div className="font-mono text-[10px] text-blue-400 font-bold">{task.id}</div>
                          <div className={cn(
                            "font-bold text-sm mt-0.5",
                            state.theme === 'dark' ? "text-white" : "text-gray-900"
                          )}>{task.name}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-500 font-medium">
                          {task.wbsName || 'Sin WBS'}
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-gray-400">
                          {task.durationHrs || 0} Hrs
                        </td>
                        <td className="px-6 py-4 text-gray-500 font-medium">
                          <div className="whitespace-nowrap">Ini: {task.startDate ? formatDate(task.startDate) : '-'}</div>
                          <div className="whitespace-nowrap mt-0.5">Fin: {task.endDate ? formatDate(task.endDate) : '-'}</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className={cn(
                              "font-mono font-bold text-sm",
                              task.progress === 100 ? "text-green-500" : task.progress > 0 ? "text-blue-400" : "text-gray-400"
                            )}>
                              {task.progress != null ? `${task.progress}%` : '0%'}
                            </span>
                            <div className="w-16 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full rounded-full",
                                  task.progress === 100 ? "bg-green-500" : "bg-blue-500"
                                )}
                                style={{ width: `${task.progress || 0}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                /* Workers Table Layout */
                <table className="w-full text-left border-collapse">
                  <thead className={cn(
                    "sticky top-0 z-10 uppercase text-[10px] font-black tracking-wider",
                    state.theme === 'dark' ? "bg-[#1a1d24] text-gray-400" : "bg-gray-100 text-gray-500"
                  )}>
                    <tr>
                      <th className="px-6 py-4">Nombre</th>
                      <th className="px-6 py-4">RUT</th>
                      <th className="px-6 py-4">Grupo</th>
                      <th className="px-6 py-4">Cargo / Jornada</th>
                      <th className="px-6 py-4 text-right">Horas Acumuladas</th>
                    </tr>
                  </thead>
                  <tbody className={cn(
                    "divide-y text-xs",
                    state.theme === 'dark' ? "divide-[#30363d]/30" : "divide-gray-100"
                  )}>
                    {filteredModalData.map((worker: any, idx: number) => {
                      const baseHh = worker.hh || 0;
                      const aggHh = state.workerHoursAggregate[worker.nombre] || 0;
                      const xtraHh = state.workerExtraHoursAggregate?.[worker.nombre] || 0;
                      const normalHh = baseHh + aggHh;

                      return (
                        <tr key={idx} className={cn(
                          "transition-colors",
                          state.theme === 'dark' ? "hover:bg-white/5" : "hover:bg-gray-50"
                        )}>
                          <td className="px-6 py-4">
                            <div className={cn(
                              "font-bold text-sm",
                              state.theme === 'dark' ? "text-white" : "text-gray-900"
                            )}>{worker.nombre}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-mono text-blue-400">{worker.rut}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className={cn(
                              "flex items-center gap-2 px-2 py-1 rounded-lg border text-[10px] font-black w-fit uppercase font-sans",
                              worker.grupo === 'S/G' || worker.grupo === 'S/N' || !worker.grupo ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-blue-500/10 border-blue-500/20 text-blue-500"
                            )}>
                              {worker.grupo || "S/G"}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-[10px] text-gray-500 font-medium font-sans">
                              <span className="font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap">{worker.cargo || 'Sin Cargo'}</span> <br/> 
                              <span className="opacity-70">{worker.jornada || 'Ordinaria'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold">
                            <div className="flex flex-col items-end">
                              <span className="text-blue-500 dark:text-blue-400">{normalHh} Hrs</span>
                              {xtraHh > 0 && <span className="text-[10px] text-yellow-600 dark:text-yellow-500 font-semibold font-sans">({xtraHh} H. Ext)</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className={cn(
              "p-4 border-t text-right",
              state.theme === 'dark' ? "border-[#30363d]/30" : "border-gray-100"
            )}>
              <button 
                onClick={() => {
                  setActiveModal(null);
                  setSearchTerm('');
                }}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                  state.theme === 'dark' ? "bg-[#21262d] text-white hover:bg-[#30363d]" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
     </div>
  );
}
