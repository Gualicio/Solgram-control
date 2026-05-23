import { useApp } from '../AppContext';
import { cn, formatDate, formatNumber } from '../lib/utils';
import { Info, Calendar, Clock, BarChart3, ListChecks, Users, User, ArrowLeft, ChevronRight, Activity } from 'lucide-react';
import { useMemo } from 'react';
import { motion } from 'motion/react';

export default function ActivityDetail() {
  const { state, updateState } = useApp();
  const { selectedTaskId, selectedWbsId, scheduleData, dailyReports } = state;

  const selectedActivity = useMemo(() => {
    if (!scheduleData) {
      if (selectedTaskId) {
        const matchingReport = dailyReports.find(r => String(r.id) === selectedTaskId);
        if (matchingReport) {
          return {
            id: `REP-${matchingReport.id}`,
            name: matchingReport.tipo,
            status: matchingReport.status === 'ejecucion' ? 'EN EJECUCIÓN' : 'COMPLETADO',
            startDate: matchingReport.date,
            endDate: matchingReport.date,
            durationHrs: matchingReport.hours,
            wbsId: 'Reporte',
            wbsName: matchingReport.wbs || 'General',
            isMilestone: false,
            progress: 100
          };
        }
      }
      return null;
    }
    
    if (selectedTaskId) {
      const task = scheduleData.tasks.find(t => t.id === selectedTaskId);
      if (task) return task;

      // Fallback: If selectedTaskId is indeed a daily report ID
      const matchingReport = dailyReports.find(r => String(r.id) === selectedTaskId);
      if (matchingReport) {
        return {
          id: `REP-${matchingReport.id}`,
          name: matchingReport.tipo,
          status: matchingReport.status === 'ejecucion' ? 'EN EJECUCIÓN' : 'COMPLETADO',
          startDate: matchingReport.date,
          endDate: matchingReport.date,
          durationHrs: matchingReport.hours,
          wbsId: 'Terreno',
          wbsName: matchingReport.wbs || 'Reportes Manuales',
          isMilestone: false,
          progress: 100
        };
      }
    }
    
    if (selectedWbsId) {
      // Find WBS in tree
      const findWbs = (nodes: any[]): any => {
        for (const node of nodes) {
          if (node.id === selectedWbsId) return node;
          if (node.children) {
            const found = findWbs(node.children);
            if (found) return found;
          }
        }
        return null;
      };
      return findWbs(scheduleData.rootWbs);
    }
    
    return null;
  }, [selectedTaskId, selectedWbsId, scheduleData, dailyReports]);

  const activityReports = useMemo(() => {
    if (!selectedActivity) return [];
    return dailyReports.filter(r => r.tipo === selectedActivity.name);
  }, [selectedActivity, dailyReports]);

  const activeReports = useMemo(() => {
    return (dailyReports || []).filter(r => r.status === 'ejecucion' && r.date === state.selectedDate);
  }, [dailyReports, state.selectedDate]);

  const stats = useMemo(() => {
    const hours = activityReports.reduce((acc, r) => acc + r.hours, 0);
    return {
      reportedHours: hours,
      progress: selectedActivity?.durationHrs ? (hours / selectedActivity.durationHrs) * 100 : 0
    };
  }, [activityReports, selectedActivity]);

  if (!scheduleData && activeReports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 opacity-50">
        <Info size={48} className="mb-4" />
        <h2 className="text-xl font-bold uppercase tracking-tight">Sin Cronograma Activo</h2>
        <p className="text-xs">Cargue un archivo XER para ver detalles de actividades.</p>
      </div>
    );
  }

  if (!selectedActivity) {
    if (activeReports.length > 0) {
      return (
        <div className="p-4 md:p-6 space-y-6 w-full max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                </span>
                <h2 className="text-lg font-black uppercase tracking-tight">Actividades en Ejecución</h2>
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                Monitoreo de tareas activas en terreno y asignación de personal
              </p>
            </div>
            <div className={cn(
              "px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 self-start sm:self-auto",
              state.theme === 'dark' ? "bg-blue-500/10 border-blue-500/25 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-700"
            )}>
              <Users size={12} />
              <span>{activeReports.reduce((acc, r) => acc + (r.workers?.length || 0), 0)} Operadores en Vivo</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {activeReports.map((report) => (
              <div 
                key={report.id} 
                className={cn(
                  "p-5 rounded-2xl border shadow-lg flex flex-col gap-4 transition-all hover:border-blue-500/20",
                  state.theme === 'dark' ? "bg-[#161b22] border-[#30363d]" : "bg-white border-gray-150"
                )}
              >
                {/* Header */}
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider leading-none bg-blue-500/10 text-blue-400 border border-blue-500/25">
                        {report.wbs || 'General'}
                      </span>
                      <span className="text-[9.5px] text-gray-500 font-bold uppercase font-mono">
                        {formatDate(report.date)}
                      </span>
                    </div>
                    <h3 className={cn(
                      "text-sm font-black uppercase tracking-tight leading-tight truncate-two-lines",
                      state.theme === 'dark' ? "text-white" : "text-gray-900"
                    )}>
                      {report.tipo}
                    </h3>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[11px] font-black text-amber-500 font-mono leading-none flex items-center justify-end gap-1">
                      <Clock size={11} className="text-amber-500" />
                      {report.hours.toFixed(1)} HH
                    </span>
                    <span className="text-[9px] text-gray-400 font-bold block mt-1 uppercase">SUP: {report.sup || 'N/A'}</span>
                  </div>
                </div>

                {/* Workers Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-t border-dashed border-gray-500/10 pt-2.5">
                    <h4 className="text-[9.5px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1">
                      <Users size={11} className="text-blue-500" />
                      <span>Cuadrilla Asignada ({report.workersDetail?.length || report.workers?.length || 0})</span>
                    </h4>
                  </div>
                  
                  {(!report.workersDetail || report.workersDetail.length === 0) ? (
                    <div className="text-[10px] text-gray-500 font-bold italic px-2 py-2.5 bg-black/5 rounded-xl border border-dashed border-gray-500/10">
                      Sin operarios cargados para hoy.
                    </div>
                  ) : (
                    <div className="grid gap-1.5 grid-cols-1 sm:grid-cols-2 max-h-[145px] overflow-y-auto pr-1 scrollbar-thin">
                      {report.workersDetail.map((w, idx) => (
                        <div 
                          key={idx}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-xl border shadow-xs leading-none",
                            state.theme === 'dark' ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-150"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-5.5 h-5.5 rounded bg-blue-500/10 border border-blue-500/15 flex items-center justify-center text-[9px] font-black text-blue-400 uppercase flex-shrink-0">
                              {w.name ? w.name.trim().charAt(0) : '?'}
                            </div>
                            <span className="text-[11px] font-extrabold truncate max-w-[130px]" title={w.name}>
                              {w.name}
                            </span>
                          </div>
                          <span className="text-[10px] font-black uppercase text-blue-500 flex-shrink-0 font-mono">
                            {w.hours}h
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-end gap-2 border-t border-gray-500/10 pt-3 mt-auto">
                  <button
                    type="button"
                    onClick={() => {
                      updateState({ selectedTaskId: String(report.id), selectedWbsId: null });
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider cursor-pointer transition-all active:scale-95 flex items-center gap-1 border",
                      state.theme === 'dark' 
                        ? "bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/20" 
                        : "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                    )}
                  >
                    <span>Detalle Operacional</span>
                    <ChevronRight size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full p-8 opacity-50">
        <BarChart3 size={48} className="mb-4" />
        <h2 className="text-xl font-bold uppercase tracking-tight">Sin Actividades en Ejecución</h2>
        <p className="text-xs">Seleccione una actividad en el Gantt o registre un reporte diario con estado "En Ejecución".</p>
      </div>
    );
  }

  const isWbs = 'children' in selectedActivity;

  return (
    <div className="p-8 space-y-8 w-full px-4 md:px-8">
      {/* Back button to clear selection and view all active reports */}
      <div className="flex items-center justify-start">
        <button
          onClick={() => updateState({ selectedTaskId: null, selectedWbsId: null })}
          className={cn(
            "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 border",
            state.theme === 'dark' 
              ? "bg-[#1f293d] hover:bg-[#253556] border-[#2e3f66] text-blue-400" 
              : "bg-blue-50 hover:bg-blue-100 border-blue-250 text-blue-700"
          )}
        >
          <ArrowLeft size={12} className="stroke-[3]" />
          <span>Ver Todas en Ejecución</span>
        </button>
      </div>

      <div className="flex items-center gap-4 border-b border-white/5 pb-6">
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center shadow-lg",
          state.theme === 'dark' ? "bg-blue-500/20 text-blue-400" : "bg-blue-500 text-white"
        )}>
          {isWbs ? <BarChart3 size={24} /> : <ListChecks size={24} />}
        </div>
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight leading-none text-white dark:text-white">{selectedActivity.name}</h2>
          <p className="text-xs text-gray-400 mt-1 uppercase font-bold tracking-widest">
            {isWbs ? `WBS: ${selectedActivity.id}` : `TAREA: ${selectedActivity.id}`} — {selectedActivity.status || '---'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={cn(
          "p-6 rounded-2xl border shadow-xl flex flex-col items-center justify-center text-center",
          state.theme === 'dark' ? "bg-[#161b22] border-[#30363d]" : "bg-white border-gray-100"
        )}>
          <Calendar className="mb-2 text-blue-500" size={20} />
          <span className="text-[10px] font-bold text-gray-500 uppercase">Inicio Programado</span>
          <div className="text-lg font-black font-mono mt-1">{formatDate(selectedActivity.startDate)}</div>
        </div>
        
        <div className={cn(
          "p-6 rounded-2xl border shadow-xl flex flex-col items-center justify-center text-center",
          state.theme === 'dark' ? "bg-[#161b22] border-[#30363d]" : "bg-white border-gray-100"
        )}>
          <Calendar className="mb-2 text-red-500" size={20} />
          <span className="text-[10px] font-bold text-gray-500 uppercase">Término Programado</span>
          <div className="text-lg font-black font-mono mt-1">{formatDate(selectedActivity.endDate)}</div>
        </div>

        <div className={cn(
          "p-6 rounded-2xl border shadow-xl flex flex-col items-center justify-center text-center",
          state.theme === 'dark' ? "bg-[#161b22] border-[#30363d]" : "bg-white border-gray-100"
        )}>
          <Clock className="mb-2 text-green-500" size={20} />
          <span className="text-[10px] font-bold text-gray-500 uppercase">Horas Estimadas</span>
          <div className="text-lg font-black font-mono mt-1">{formatNumber(selectedActivity.durationHrs)}h</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className={cn(
          "p-8 rounded-2xl border shadow-xl flex flex-col justify-center",
          state.theme === 'dark' ? "bg-[#161b22] border-[#30363d]" : "bg-white border-gray-100"
        )}>
          <div className="flex justify-between items-end mb-4">
             <div>
                <h3 className="text-sm font-black uppercase tracking-tight">Avance Reportado</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase italic">Comparativa HH Real vs Plan</p>
             </div>
             <div className="text-3xl font-black text-blue-500 font-mono">
               {stats.progress.toFixed(1)}%
             </div>
          </div>
          <div className="w-full h-8 bg-black/20 rounded-full overflow-hidden border border-white/5 relative">
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${Math.min(100, stats.progress)}%` }}
               className="h-full bg-gradient-to-r from-blue-600 to-blue-400"
             />
             <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest mix-blend-overlay">
               {formatNumber(stats.reportedHours)}h reportadas
             </div>
          </div>
          <div className="flex justify-between mt-4 text-[10px] font-bold text-gray-500 uppercase">
             <span>0%</span>
             <span>Meta: {formatNumber(selectedActivity.durationHrs)}h</span>
             <span>100%</span>
          </div>
        </div>

        <div className={cn(
          "p-8 rounded-2xl border shadow-xl flex flex-col",
          state.theme === 'dark' ? "bg-[#161b22] border-[#30363d]" : "bg-white border-gray-100"
        )}>
          <h3 className="text-sm font-black uppercase mb-4 tracking-tight">Historial de Reportes</h3>
          <div className="flex-1 overflow-auto max-h-[250px] space-y-2 pr-2 scrollbar-thin">
            {activityReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-gray-500 italic text-xs">
                No hay reportes de terreno para esta actividad todavía.
              </div>
            ) : (
              [...activityReports].reverse().map(report => (
                <div key={report.id} className="p-4 rounded-xl bg-black/10 border border-white/5 flex justify-between items-center group hover:bg-black/20 transition-all">
                  <div>
                    <div className="text-xs font-bold text-white">{report.date}</div>
                    <div className="text-[10px] text-gray-500 font-medium">{report.sup}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-blue-400">{report.hours.toFixed(1)}h</div>
                    <div className={cn(
                      "text-[9px] font-black uppercase px-2 py-0.5 rounded",
                      report.status === 'listo' ? "bg-green-500/20 text-green-500" : "bg-yellow-500/20 text-yellow-500"
                    )}>
                      {report.status || 'En curso'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
