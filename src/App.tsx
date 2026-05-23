import { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, GanttChart, CalendarDays, Calendar, FileText, Users, TrendingUp, Moon, Sun, AlertTriangle, Clock, Trash2, Upload, ShieldCheck, UserCircle, LogOut, ListTodo, Cloud, CloudUpload } from 'lucide-react';
import { AppProvider, useApp } from './AppContext';
import Dashboard from './modules/Dashboard';
import GanttViewer from './modules/GanttViewer';
import PersonnelControl from './modules/PersonnelControl';
import SolgramiaChat from './components/SolgramiaChat';
import LoginScreen from './modules/LoginScreen';
import ConfirmModal from './components/ConfirmModal';
import FloatingCalendarModal from './components/FloatingCalendarModal';
import DriveSyncModal from './components/DriveSyncModal';
import { cn } from './lib/utils';
import { useScrollDirection } from './hooks/useScrollDirection';

type ModuleKey = 'resumen' | 'gantt' | 'calendario' | 'reporte' | 'personal';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-900 text-white p-6">
          <AlertTriangle size={64} className="text-red-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Algo salió mal</h1>
          <p className="text-gray-400 mb-4">Error interno inesperado de la aplicación.</p>
          <pre className="bg-gray-800 p-4 rounded-lg overflow-auto max-w-full text-xs text-red-300">
            {this.state.error?.message}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-bold"
          >
            Recargar Página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { state, updateState, resetAllData, dbHasSchedule, notify, saveWorkersBulk } = useApp();
  const activeTab = state.activeTab || 'resumen';
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const isHeaderCompressed = useScrollDirection(activeTab);

  // Auto-reset purge confirm after 3 seconds
  useEffect(() => {
    if (purgeConfirm) {
      const timer = setTimeout(() => setPurgeConfirm(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [purgeConfirm]);

  const delayedLaborsCount = useMemo(() => {
    const primaryLabors = state.scheduleData?.primaryLabors || [];
    const today = new Date().toISOString().slice(0, 10);
    return primaryLabors.filter(p => p.endDate && p.endDate.slice(0, 10) < today).length;
  }, [state.scheduleData]);

  const extraHoursTotal = useMemo(() => {
    if (!state.workerExtraHoursAggregate) return 0;
    return Object.values(state.workerExtraHoursAggregate).reduce((a, b) => (a as number) + (b as number), 0);
  }, [state.workerExtraHoursAggregate]);

  const toggleTheme = () => {
    updateState({ theme: state.theme === 'dark' ? 'light' : 'dark' });
  };

  useEffect(() => {
    const root = window.document.documentElement;
    // Debounce or at least ensure single write
    requestAnimationFrame(() => {
      root.classList.remove('light', 'dark');
      root.classList.add(state.theme || 'dark');
      // Force repaint
      root.style.colorScheme = state.theme || 'dark';
    });
  }, [state.theme]);

  const isAdmin = state.userRole === 'admin';
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [showDriveSyncModal, setShowDriveSyncModal] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const tabs = useMemo(() => {
    if (isAdmin) {
      return [
        { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
        { id: 'gantt', label: 'Carta Gantt', icon: GanttChart },
        { id: 'calendario', label: 'Calendario', icon: Calendar },
        { id: 'personal', label: 'Personal', icon: Users },
      ];
    }
    return [
      { id: 'calendario', label: 'Calendario', icon: Calendar },
    ];
  }, [isAdmin]);

  // Redirect restricted users from forbidden tabs
  useEffect(() => {
    if (!isAdmin) {
      const allowedWorkerTabs = ['calendario'];
      if (!allowedWorkerTabs.includes(activeTab)) {
        updateState({ activeTab: 'calendario' });
      }
    }
  }, [isAdmin, activeTab, updateState]);

  if (!state.userRole) {
    return <LoginScreen />;
  }

  return (
    <div className={cn(
      "h-[100dvh] flex flex-col transition-colors duration-300 w-full overflow-hidden",
      state.theme === 'dark' ? "bg-[#0b1220] text-[#e6edf7]" : "bg-[#eef4fb] text-[#162033]"
    )}>
      <header className={cn(
        "sticky top-0 z-50 flex flex-col px-4 lg:px-6 border-b-2 w-full overflow-hidden transition-all duration-300 shadow-sm shrink-0",
        state.theme === 'dark' 
          ? "bg-gradient-to-r from-[#0b1220] to-[#142042] border-[#ffb703]" 
          : "bg-gradient-to-r from-white to-[#eef4fb] border-[#0f6fff]",
        isHeaderCompressed ? "hidden" : "py-3"
      )}>
        {/* ROW 1: BRAND LOGO & UTILITIES TOOLBAR */}
        <div className={cn(
          "w-full flex flex-col md:flex-row items-center justify-between transition-all duration-300",
          isHeaderCompressed 
            ? "pb-1 gap-1.5 border-b-0" 
            : "pb-2.5 gap-3 border-b border-black/5 dark:border-white/5"
        )}>
          {/* Logo brand */}
          <div className="flex items-center gap-4 shrink-0 justify-center md:justify-start w-full md:w-auto">
            <h1 className={cn(
              "font-black tracking-tighter uppercase transition-all duration-300 flex items-center flex-wrap gap-2 justify-center md:justify-start",
              state.theme === 'dark' ? "text-[#ffb703]" : "text-[#0f6fff]",
              isHeaderCompressed ? "text-base" : "text-lg lg:text-xl"
            )}>
              SOLGRAM CONTROL
              {isAdmin && (
                <span className="text-[9px] normal-case bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
                  Admin: solgramcontrol@gmail.com
                </span>
              )}
            </h1>
          </div>

          {/* Quick Toolbar / Utilities */}
          <div className={cn(
            "flex flex-wrap items-center justify-center md:justify-end w-full md:w-auto transition-all duration-300",
            isHeaderCompressed ? "gap-1.5" : "gap-2.5"
          )}>
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={cn(
                "flex items-center gap-1.5 rounded-xl font-semibold border transition-all truncate",
                state.theme === 'dark' 
                  ? "bg-[#1a2440] text-[#e6edf7] border-[#1f2a44] hover:bg-[#23315a]" 
                  : "bg-white text-[#162033] border-gray-200 hover:bg-[#f3f8ff]",
                isHeaderCompressed ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-xs"
              )}
            >
              {state.theme === 'dark' ? <Moon size={11} /> : <Sun size={11} />}
              <span className="text-[10px]">{state.theme === 'dark' ? "Oscuro" : "Claro"}</span>
            </button>

            {/* Admin Upload triggers */}
            {isAdmin && (
              <div className={cn(
                "flex items-center p-1 bg-black/10 dark:bg-black/20 rounded-xl border border-white/5 shrink-0 transition-all",
                isHeaderCompressed ? "gap-1" : "gap-1.5"
              )}>
                {activeTab === 'gantt' && (
                  <div className="flex gap-1 items-center">
                    <button
                      onClick={() => document.getElementById('xer-upload-input')?.click()}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg font-black transition-all border-none uppercase tracking-tighter shadow-sm cursor-pointer",
                        state.theme === 'dark' ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-blue-600 text-white hover:bg-blue-700",
                        isHeaderCompressed ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]"
                      )}
                    >
                      <Upload size={11} />
                      Cargar XER
                    </button>
                  </div>
                )}
                
                {activeTab === 'personal' && (
                  <div className="flex gap-1 items-center">
                    <button
                      onClick={() => document.getElementById('personnel-excel-upload')?.click()}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg font-black transition-all border-none uppercase tracking-tighter shadow-sm cursor-pointer",
                        state.theme === 'dark' ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-blue-600 text-white hover:bg-blue-700",
                        isHeaderCompressed ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]"
                      )}
                    >
                      <Upload size={11} />
                      Cargar Excel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Export & Command Action Group */}
            <div className={cn(
              "flex items-center p-1 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 shrink-0 transition-all",
              isHeaderCompressed ? "gap-1" : "gap-1.5"
            )}>
              <button
                onClick={() => updateState({ userRole: undefined })}
                className={cn(
                  "flex items-center gap-1 rounded-lg font-bold transition-all border shadow-sm",
                  state.theme === 'dark' 
                    ? "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-650 hover:text-white" 
                    : "bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white",
                  isHeaderCompressed ? "px-1.5 py-1 text-[9px]" : "px-2 py-1.5 text-[10px]"
                )}
                title="Cerrar sesión"
              >
                <LogOut size={11} />
                <span className="uppercase font-bold text-[9px]">Cerrar Sesión</span>
              </button>

              {isAdmin && state.scheduleData && (
                <button
                  type="button"
                  id="btn-cloud-sync"
                  onClick={async () => {
                    notify('info', 'Sincronizando datos locales con el servidor en tiempo real...');
                    try {
                      await updateState({
                        scheduleData: state.scheduleData,
                        shiftConfig: state.shiftConfig,
                        licenses: state.licenses,
                        extraHoursReports: state.extraHoursReports,
                      });
                      if (state.workers && state.workers.length > 0) {
                        await saveWorkersBulk(state.workers);
                      }
                      notify('success', '¡Datos sincronizados con éxito en la nube! Todos los dispositivos ya pueden visualizarlos.');
                    } catch (e: any) {
                      notify('error', 'Error al sincronizar: ' + e.message);
                    }
                  }}
                  className={cn(
                    "flex items-center justify-center rounded-lg transition-all border gap-1 shadow-sm font-bold uppercase cursor-pointer",
                    dbHasSchedule === false
                      ? "bg-amber-500/20 text-amber-450 border-amber-500/30 animate-pulse hover:bg-amber-500 hover:text-white"
                      : "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-650 hover:text-white",
                    isHeaderCompressed ? "px-1.5 py-1 text-[9px]" : "px-2 py-1.5 text-[10px]"
                  )}
                  title={dbHasSchedule === false 
                    ? "¡ATENCIÓN! Tus datos están guardados localmente pero no en la nube. Haz click aquí para sincronizarlos con todos los dispositivos." 
                    : "Forzar resubida y sincronización de datos de planificación locales con la nube"}
                >
                  <Cloud size={11} className={cn(dbHasSchedule === false && "animate-bounce")} />
                  <span>{dbHasSchedule === false ? "Sincronizar Nube" : "Sincronizado"}</span>
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={() => setShowDriveSyncModal(true)}
                  className={cn(
                    "flex items-center justify-center rounded-lg transition-all border gap-1 shadow-sm font-bold uppercase",
                    state.theme === 'dark' 
                      ? "bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-600 hover:text-white" 
                      : "bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-600 hover:text-white",
                    isHeaderCompressed ? "px-1.5 py-1 text-[9px]" : "px-2 py-1.5 text-[10px]"
                  )}
                  title="Respaldo Total a Google Drive y Correo"
                >
                  <CloudUpload size={11} />
                  <span>Respaldo Drive</span>
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={() => setShowPurgeModal(true)}
                  className={cn(
                    "flex items-center justify-center rounded-lg transition-all border gap-1 shadow-sm",
                    state.theme === 'dark' 
                      ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-[#ffb703] hover:text-black" 
                      : "bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white",
                    isHeaderCompressed ? "px-1.5 py-1 text-[9px]" : "px-2 py-1.5 text-[10px]"
                  )}
                  title="Purgar plantilla (Borrar todo)"
                >
                  <Trash2 size={11} />
                  <span className="text-[9px] font-bold uppercase">Purgar Todo</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ROW 2: PRIMARY MODULE NAVIGATION (FULL DEDICATED WIDTH) */}
        <div className={cn(
          "w-full flex justify-center transition-all duration-300",
          isHeaderCompressed ? "pt-1" : "pt-2"
        )}>
          <nav className={cn(
            "flex flex-wrap items-center justify-center w-full transition-all duration-300",
            isHeaderCompressed ? "gap-1 md:gap-1.5" : "gap-1.5 md:gap-2.5"
          )}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => updateState({ activeTab: tab.id as ModuleKey })}
                  className={cn(
                    "flex items-center rounded-xl font-semibold transition-all shadow-sm shrink-0",
                    isActive
                      ? (state.theme === 'dark' ? "bg-[#ffb703] text-[#1a1a1a] font-bold scale-[1.03]" : "bg-[#0f6fff] text-white font-bold scale-[1.03]")
                      : (state.theme === 'dark' ? "bg-[#1a2440] text-[#e6edf7] hover:bg-[#23315a]" : "bg-white text-[#162033] hover:bg-[#f3f8ff] border border-gray-200"),
                    isHeaderCompressed 
                      ? "gap-1 px-2.5 py-1 text-[11px]" 
                      : "gap-1.5 px-3 py-1.5 md:px-4 md:py-2 text-xs"
                  )}
                >
                  <Icon size={isHeaderCompressed ? 12 : 14} className={cn(isActive && "animate-pulse")} />
                  {/* Always show full text for tabs */}
                  <span className={isHeaderCompressed ? "text-[11px]" : "text-xs"}>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            id="main-scroll-container"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 overflow-auto"
          >
            {activeTab === 'resumen' && <Dashboard />}
            {activeTab === 'gantt' && <GanttViewer />}
            {activeTab === 'calendario' && <FloatingCalendarModal isInline />}
            {activeTab === 'personal' && <PersonnelControl />}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className={cn(
        "flex flex-col sm:flex-row gap-2 justify-between items-center px-4 py-2 text-[10px] uppercase tracking-wider border-t z-50",
        state.theme === 'dark' 
          ? "bg-[#0f1830] text-[#9fb0d6] border-[#1f2a44]" 
          : "bg-white text-[#5f6f89] border-gray-200"
      )}>
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 font-bold text-green-500 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Nube Activa (Firestore Realtime)
          </span>
          <span className="opacity-40">|</span>
          <div>
            Última sync: {state.syncMeta.lastReportSync ? new Date(state.syncMeta.lastReportSync).toLocaleTimeString() : 'En tiempo real'}
          </div>
        </div>
        <div className="flex gap-4">
          <span className="flex items-center gap-1">
            <span className={cn("w-1.5 h-1.5 rounded-full", state.scheduleData ? "bg-green-500" : "bg-red-500")} />
            Cronograma {state.scheduleData ? "Activo" : "No cargado"}
          </span>
          <span>Tema activo: {state.theme === 'dark' ? "oscuro" : "claro"}</span>
        </div>
      </footer>
      <SolgramiaChat />
      


      <ConfirmModal 
        isOpen={showPurgeModal}
        onClose={() => setShowPurgeModal(false)}
        onConfirm={resetAllData}
        title="Purgar Base de Datos"
        message="¿Estás seguro de que deseas eliminar permanentemente toda la información? Se borrarán todos los reportes diarios, lista de personal, configuraciones y archivo XER cargado. Esta acción no se puede deshacer."
        confirmText="Sí, borrar todo"
        cancelText="No, cancelar"
      />

      <DriveSyncModal
        isOpen={showDriveSyncModal}
        onClose={() => setShowDriveSyncModal(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <DemoBanner />
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}

/**
 * Banner pequeño en la esquina superior cuando se compila con
 * VITE_DEMO_MODE=true.  Recuerda al usuario que los datos son simulados.
 */
function DemoBanner() {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return null;
  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[300] pointer-events-none">
      <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500 text-black shadow-lg shadow-amber-500/30 flex items-center gap-1.5 pointer-events-auto">
        <span className="w-1.5 h-1.5 bg-black rounded-full animate-pulse" />
        Modo demo · datos locales
        <button
          onClick={() => {
            if (confirm('¿Restablecer los datos demo a su estado inicial?')) {
              localStorage.removeItem('solgram-demo-firestore-v1');
              localStorage.removeItem('solgram-demo-firestore-seeded-v1');
              localStorage.removeItem('solgram_local_state');
              window.location.reload();
            }
          }}
          className="ml-1 underline-offset-2 hover:underline"
          title="Restablecer datos de la demo"
        >
          (reset)
        </button>
      </div>
    </div>
  );
}
