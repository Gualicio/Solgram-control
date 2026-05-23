import React, { useState, useMemo } from 'react';
import { useApp } from '../AppContext';
import { cn } from '../lib/utils';
import { X, Search, Check, CheckSquare, Square, Users, Filter } from 'lucide-react';

interface WorkerMultiSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableWorkers: { nombre: string; cargo: string; grupo?: string; rut?: string }[];
  alreadySelectedNames: string[];
  onConfirm: (selectedNames: string[]) => void;
  title: string;
  subtitle?: string;
}

export default function WorkerMultiSelectModal({
  isOpen,
  onClose,
  availableWorkers,
  alreadySelectedNames,
  onConfirm,
  title,
  subtitle
}: WorkerMultiSelectModalProps) {
  const { state } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');

  // Initialize selected names from alreadySelectedNames when modal is opened
  React.useEffect(() => {
    if (isOpen) {
      setSelectedNames([]);
      setSearchTerm('');
      setSelectedGroupFilter('all');
    }
  }, [isOpen]);

  // Extract all unique groups for filtering
  const groups = useMemo(() => {
    const list = new Set<string>();
    availableWorkers.forEach(w => {
      if (w.grupo) list.add(w.grupo);
    });
    return Array.from(list).sort();
  }, [availableWorkers]);

  // Filter workers based on search term AND group selection, excluding already added workers
  const eligibleWorkers = useMemo(() => {
    return availableWorkers.filter(w => !alreadySelectedNames.includes(w.nombre));
  }, [availableWorkers, alreadySelectedNames]);

  const filteredWorkers = useMemo(() => {
    return eligibleWorkers.filter(w => {
      const matchesSearch = 
        w.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.cargo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.grupo && w.grupo.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesGroup = 
        selectedGroupFilter === 'all' || 
        w.grupo === selectedGroupFilter;

      return matchesSearch && matchesGroup;
    });
  }, [eligibleWorkers, searchTerm, selectedGroupFilter]);

  const handleToggleWorker = (name: string) => {
    setSelectedNames(prev => 
      prev.includes(name) 
        ? prev.filter(n => n !== name) 
        : [...prev, name]
    );
  };

  const handleSelectAllFiltered = () => {
    const filteredNames = filteredWorkers.map(w => w.nombre);
    setSelectedNames(prev => {
      const otherSelected = prev.filter(n => !filteredNames.includes(n));
      const allNew = [...otherSelected, ...filteredNames];
      return allNew;
    });
  };

  const handleDeselectAllFiltered = () => {
    const filteredNames = filteredWorkers.map(w => w.nombre);
    setSelectedNames(prev => prev.filter(n => !filteredNames.includes(n)));
  };

  const handleConfirmSelection = () => {
    onConfirm(selectedNames);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />

      {/* Modal Container */}
      <div className={cn(
        "relative w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border animate-in zoom-in-95 duration-200",
        state.theme === 'dark' 
          ? "bg-[#0d1220] border-gray-800 text-white" 
          : "bg-white border-gray-100 text-gray-900"
      )}>
        {/* Header */}
        <div className={cn(
          "px-6 py-5 border-b flex justify-between items-start",
          state.theme === 'dark' ? "border-white/5 bg-white/5" : "border-gray-100 bg-gray-50/50"
        )}>
          <div>
            <h3 className="text-base font-black uppercase tracking-wider flex items-center gap-2">
              <Users size={18} className="text-blue-500" />
              {title}
            </h3>
            {subtitle && (
              <p className={cn(
                "text-xs font-semibold mt-1",
                state.theme === 'dark' ? "text-gray-400" : "text-gray-500"
              )}>
                {subtitle}
              </p>
            )}
          </div>
          <button 
            onClick={onClose}
            className={cn(
              "p-2 rounded-xl transition-colors",
              state.theme === 'dark' ? "hover:bg-white/5 text-gray-400" : "hover:bg-gray-100 text-gray-500"
            )}
          >
            <X size={18} />
          </button>
        </div>

        {/* Filters Panel */}
        <div className={cn(
          "p-5 border-b space-y-4",
          state.theme === 'dark' ? "border-white/5" : "border-gray-100"
        )}>
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text"
              placeholder="Buscar trabajador por nombre, cargo o grupo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={cn(
                "w-full rounded-2xl pl-10 pr-4 py-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all",
                state.theme === 'dark'
                  ? "bg-black/30 border border-white/5 text-white placeholder:text-gray-500"
                  : "bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400"
              )}
            />
          </div>

          {/* Group Fast Filters */}
          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                <Filter size={12} /> Grupo:
              </span>
              <button
                onClick={() => setSelectedGroupFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all",
                  selectedGroupFilter === 'all'
                    ? "bg-blue-500 text-white"
                    : state.theme === 'dark'
                      ? "bg-white/5 hover:bg-white/10 text-gray-300"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                )}
              >
                Todos
              </button>
              {groups.map(g => (
                <button
                  key={g}
                  onClick={() => setSelectedGroupFilter(g)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all",
                    selectedGroupFilter === g
                      ? "bg-blue-500 text-white"
                      : state.theme === 'dark'
                        ? "bg-white/5 hover:bg-white/10 text-gray-300"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          )}

          {/* Selection Control Help Bar */}
          <div className="flex justify-between items-center text-[10px]">
            <span className={cn(
              "font-bold uppercase tracking-tight",
              state.theme === 'dark' ? "text-gray-400" : "text-gray-500"
            )}>
              Mostrando {filteredWorkers.length} trabajadores de {eligibleWorkers.length} disponibles
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                disabled={filteredWorkers.length === 0}
                className="text-blue-500 hover:text-blue-600 font-black uppercase tracking-tight disabled:opacity-50"
              >
                ✓ Seleccionar todos
              </button>
              <span className="opacity-30">|</span>
              <button
                type="button"
                onClick={handleDeselectAllFiltered}
                disabled={filteredWorkers.length === 0}
                className="text-red-500 hover:text-red-600 font-black uppercase tracking-tight disabled:opacity-50"
              >
                ✕ Desmarcar todos
              </button>
            </div>
          </div>
        </div>

        {/* Worker Checklist Grid */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          {filteredWorkers.length === 0 ? (
            <div className="py-12 text-center">
              <p className={cn(
                "text-xs font-semibold italic",
                state.theme === 'dark' ? "text-gray-500" : "text-gray-400"
              )}>
                {eligibleWorkers.length === 0 
                  ? "Todos los trabajadores ya están añadidos." 
                  : "No se encontraron trabajadores que coincidan con la búsqueda."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredWorkers.map((p) => {
                const isChecked = selectedNames.includes(p.nombre);
                return (
                  <div
                    key={p.nombre}
                    onClick={() => handleToggleWorker(p.nombre)}
                    className={cn(
                      "flex items-center gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all select-none hover:scale-[1.01] duration-150",
                      isChecked
                        ? state.theme === 'dark'
                          ? "bg-blue-500/10 border-blue-500/50"
                          : "bg-blue-50 border-blue-200"
                        : state.theme === 'dark'
                          ? "bg-black/20 border-white/5 hover:border-white/10"
                          : "bg-white border-gray-100 hover:border-gray-200"
                    )}
                  >
                    <div className="flex-shrink-0 text-blue-500">
                      {isChecked ? (
                        <CheckSquare size={18} className="fill-current text-blue-500 text-white" />
                      ) : (
                        <Square size={18} className={cn(
                          state.theme === 'dark' ? "text-gray-600" : "text-gray-300"
                        )} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate uppercase tracking-tight">
                        {p.nombre}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                          state.theme === 'dark' ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-600"
                        )}>
                          {p.cargo || 'Operador'}
                        </span>
                        {p.grupo && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-blue-500/10 text-blue-500">
                            Gr: {p.grupo}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={cn(
          "px-6 py-4 border-t flex items-center justify-between",
          state.theme === 'dark' ? "border-white/5 bg-white/5" : "border-gray-100 bg-gray-50/50"
        )}>
          <span className={cn(
            "text-xs font-black uppercase tracking-tight",
            selectedNames.length > 0 
              ? "text-blue-500" 
              : state.theme === 'dark' ? "text-gray-500" : "text-gray-400"
          )}>
            {selectedNames.length} seleccionados
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors border",
                state.theme === 'dark'
                  ? "border-[#30363d] text-gray-400 hover:bg-white/5"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              )}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmSelection}
              disabled={selectedNames.length === 0}
              className={cn(
                "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md",
                selectedNames.length > 0
                  ? "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer active:scale-95"
                  : "bg-gray-500/10 text-gray-400 cursor-not-allowed"
              )}
            >
              <Check size={14} /> Añadir seleccionados
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
