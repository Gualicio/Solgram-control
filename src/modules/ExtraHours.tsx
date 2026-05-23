import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import { cn } from '../lib/utils';
import { Clock, Plus, Trash2, Calendar, User, Search } from 'lucide-react';

export default function ExtraHoursModule() {
  const { state, updateState } = useApp();
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedWorker, setSelectedWorker] = useState('');
  const [hours, setHours] = useState('');

  const activePersonnel = state.personnelData?.personalActivo || [];
  const reports = state.extraHoursReports || [];

  // Sync with global date selection
  useEffect(() => {
    if (state.selectedDate) {
      setReportDate(state.selectedDate);
    }
  }, [state.selectedDate]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportDate || !selectedWorker || !hours || parseFloat(hours) <= 0) return;

    const newReport = {
      id: Math.random().toString(36).substr(2, 9),
      date: reportDate,
      workerName: selectedWorker,
      hours: parseFloat(hours),
    };

    const newReports = [...reports, newReport];
    
    const workerExtraHoursAggregate: Record<string, number> = { ...(state.workerExtraHoursAggregate || {}) };
    workerExtraHoursAggregate[selectedWorker] = (workerExtraHoursAggregate[selectedWorker] || 0) + newReport.hours;

    updateState({
      extraHoursReports: newReports,
      workerExtraHoursAggregate
    });

    setSelectedWorker('');
    setHours('');
  };

  const handleRemove = (id: string, workerName: string, removedHours: number) => {
    if (!confirm("¿Eliminar este registro de horas extras?")) return;

    const newReports = reports.filter(r => r.id !== id);
    const workerExtraHoursAggregate: Record<string, number> = { ...(state.workerExtraHoursAggregate || {}) };
    
    if (workerExtraHoursAggregate[workerName]) {
      workerExtraHoursAggregate[workerName] -= removedHours;
      if (workerExtraHoursAggregate[workerName] < 0) workerExtraHoursAggregate[workerName] = 0;
    }

    updateState({
      extraHoursReports: newReports,
      workerExtraHoursAggregate
    });
  };

  return (
    <div className="p-8 w-full space-y-8 px-4 md:px-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black tracking-tight mb-2 uppercase flex items-center gap-3">
            <Clock className="text-yellow-500" />
            Horas Extraordinarias
          </h2>
          <p className="text-sm text-gray-400 font-medium">Registro de HH adicionales del personal</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <form onSubmit={handleAdd} className={cn(
          "col-span-1 p-6 rounded-2xl border shadow-xl space-y-6 h-fit",
          state.theme === 'dark' ? "bg-yellow-950/10 border-yellow-500/20" : "bg-yellow-50 border-yellow-200"
        )}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fecha</label>
              <input 
                type="date" 
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-yellow-500"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Trabajador</label>
              <select 
                value={selectedWorker}
                onChange={(e) => setSelectedWorker(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-yellow-500"
                required
              >
                <option value="">Seleccionar...</option>
                {activePersonnel.map(p => (
                  <option key={p.rut} value={p.nombre}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cantidad (HH)</label>
              <input 
                type="number"
                step="0.5"
                min="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-yellow-500 font-mono"
                placeholder="Ej: 2.5"
                required
              />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-4 bg-yellow-500 hover:bg-yellow-600 text-black font-black uppercase tracking-widest rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            Agregar Horas
          </button>
        </form>

        <div className={cn(
          "col-span-2 p-6 rounded-2xl border shadow-xl flex flex-col",
          state.theme === 'dark' ? "bg-[#161b22] border-[#30363d]" : "bg-white border-gray-100"
        )}>
          <h3 className="text-xl font-black uppercase mb-6 tracking-tight">
            Registros
          </h3>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#0f172a] text-gray-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Trabajador</th>
                  <th className="px-4 py-3 text-center">HH Extra</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-gray-500 italic">
                      No hay horas extra registradas.
                    </td>
                  </tr>
                ) : (
                  [...reports].reverse().map(r => (
                    <tr key={r.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-mono">{r.date}</td>
                      <td className="px-4 py-3 font-bold text-gray-300">{r.workerName}</td>
                      <td className="px-4 py-3 text-center font-black text-yellow-500">+{r.hours}</td>
                      <td className="px-4 py-3 text-center">
                        <button 
                          onClick={() => handleRemove(r.id, r.workerName, r.hours)}
                          className="text-gray-500 hover:text-red-500 transition-colors inline-block"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
