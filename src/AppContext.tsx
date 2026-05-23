import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SharedState, DailyReport, PersonnelData, ScheduleData, ExtraHoursReport, License, ProjectWorker } from './types';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { NotificationType, NotificationContainer } from './components/Notification';
import { cn } from './lib/utils';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  setDoc,
  deleteDoc,
  query,
  limit,
  getDoc,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { exportScheduleToGoogleCalendar } from './lib/calendar';
import { loginWithGoogleServices, getCachedAccessToken } from './lib/drive';
import { CheckCircle, AlertTriangle, Loader2, X, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LZString from 'lz-string';

interface AppContextType {
  state: SharedState;
  updateState: (updates: Partial<SharedState>) => void;
  addDailyReport: (report: Omit<DailyReport, 'id'>) => Promise<void>;
  updateDailyReport: (id: string, report: Partial<DailyReport>) => Promise<void>;
  deleteDailyReport: (id: string) => Promise<void>;
  updateTaskStatus: (taskId: string, newStatus: string) => Promise<void>;
  saveWorker: (worker: Partial<ProjectWorker>, id?: string) => Promise<void>;
  saveWorkersBulk: (workers: ProjectWorker[]) => Promise<void>;
  deleteWorker: (id: string) => Promise<void>;
  resetAllData: () => void;
  exportAsTxt: () => void;
  exportToCalendar: () => Promise<void>;
  notify: (type: NotificationType, message: string) => void;
  dbHasSchedule: boolean | null;
}

const STORAGE_LOCAL_KEY = 'solgram_local_state';
const LOCAL_KEYS: (keyof SharedState)[] = [
  'theme', 
  'activeTab', 
  'selectedDate', 
  'selectedTaskId', 
  'selectedWbsId',
  'userRole',
  'scheduleData',
  'personnelData',
  'dailyReports',
  'workers',
  'licenses',
  'extraHoursReports',
  'shiftConfig'
];

const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ensureWbsIsArray = (wbs: any): any[] => {
  if (!wbs) return [];
  
  let arrayToProcess: any[] = [];
  if (Array.isArray(wbs)) {
    arrayToProcess = wbs;
  } else if (typeof wbs === 'object') {
    const keys = Object.keys(wbs)
      .filter(key => /^\d+$/.test(key))
      .sort((a, b) => parseInt(a) - parseInt(b));
    
    if (keys.length > 0) {
      arrayToProcess = keys.map(key => wbs[key]);
    }
  }

  return arrayToProcess.map(node => {
    if (!node || typeof node !== 'object') return node;
    
    let childrenArr: any[] = [];
    if (node.children) {
      childrenArr = ensureWbsIsArray(node.children);
    }

    return {
      ...node,
      children: childrenArr,
      tasks: Array.isArray(node.tasks) ? node.tasks : []
    };
  });
};

const sanitizeScheduleData = (schedule: any): any => {
  if (!schedule) return schedule;
  
  let cleaned = { ...schedule };
  if (cleaned.rootWbs) {
    cleaned.rootWbs = ensureWbsIsArray(cleaned.rootWbs);
  }

  if (!cleaned.startDate || !cleaned.endDate) return cleaned;
  
  const s = new Date(cleaned.startDate);
  const e = new Date(cleaned.endDate);
  const projectDays = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  if (projectDays <= 0) return cleaned;

  const targetTotalHrs = projectDays * 12;
  
  if (cleaned.stats && cleaned.stats.sumTotalHrs !== targetTotalHrs) {
    const oldTotal = cleaned.stats.sumTotalHrs || 1;
    const factor = targetTotalHrs / oldTotal;

    return {
      ...cleaned,
      stats: {
        ...cleaned.stats,
        sumTotalHrs: targetTotalHrs,
        sumActualHrs: (cleaned.stats.sumActualHrs || 0) * factor,
        sumPlannedHrs: (cleaned.stats.sumPlannedHrs || 0) * factor,
      }
    };
  }
  return cleaned;
};

const DEFAULT_STATE: SharedState = {
  theme: 'dark',
  userRole: undefined,
  activeTab: 'resumen',
  scheduleData: null,
  personnelData: {
    allWorkers: [],
    onDutyWorkers: [],
    supervisors: [],
    personalActivo: [],
    totalWorkers: 0,
    onDutyCount: 0,
    offDutyCount: 0,
    licenciaCount: 0,
    permisoCount: 0,
    byGroup: {},
    updatedAt: new Date().toISOString()
  },
  dailyReports: [],
  licenses: [],
  workerHoursAggregate: {},
  workerExtraHoursAggregate: {},
  extraHoursReports: [],
  totalReportedHours: 0,
  selectedDate: getTodayStr(),
  selectedTaskId: null,
  selectedWbsId: null,
  chatHistory: [],
  syncMeta: {},
  shiftConfig: {
    anchorDate: new Date().toISOString().split('T')[0],
    anchorShift: 'A',
    cycleDays: 14,
    hoursPerShift: 12
  }
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SharedState>(() => {
    const today = getTodayStr();
    try {
      const savedLocal = localStorage.getItem(STORAGE_LOCAL_KEY);
      if (savedLocal) {
        const parsed = JSON.parse(savedLocal);
        if (parsed.scheduleData) {
          parsed.scheduleData = sanitizeScheduleData(parsed.scheduleData);
        }
        return { ...DEFAULT_STATE, ...parsed, selectedDate: today, userRole: parsed.userRole ?? undefined };
      }
    } catch (e) {}
    return { ...DEFAULT_STATE, selectedDate: today };
  });

  // If we already have cached schedule data/reports and user profile, we can load instantly without a blocking spinner.
  const [isLoading, setIsLoading] = useState(() => {
    try {
      const savedLocal = localStorage.getItem(STORAGE_LOCAL_KEY);
      if (savedLocal) {
        const parsed = JSON.parse(savedLocal);
        if (parsed.userRole && parsed.scheduleData) {
          return false; // Skip initial full-screen block loader for cached sessions
        }
      }
    } catch (e) {}
    return true;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [dbHasSchedule, setDbHasSchedule] = useState<boolean | null>(null);
  const [notifications, setNotifications] = useState<{ id: string; type: NotificationType; message: string }[]>([]);
  const [exportModal, setExportModal] = useState<{
    isOpen: boolean;
    type: 'calendar';
    mode: 'confirm' | 'loading' | 'success' | 'error';
    linkUrl?: string;
    errorMessage?: string;
    calendarOption?: 'primary' | 'new';
    excludeCompleted?: boolean;
  }>({
    isOpen: false,
    type: 'calendar',
    mode: 'confirm',
    calendarOption: 'new',
    excludeCompleted: true
  });

  const notify = useCallback((type: NotificationType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, type, message }]);
  }, []);

  const closeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // 1. Manage Firebase Authentication and admin status
  useEffect(() => {
    let unsubAdminDoc: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Limpia listener anterior del documento /admins/{uid}.
      if (unsubAdminDoc) { unsubAdminDoc(); unsubAdminDoc = null; }

      if (user) {
        setIsAuthenticated(true);

        // Verifica el rol de admin SOLO leyendo (no escribiendo) el doc en /admins.
        // El cliente nunca debe poder escribir esa colección.
        unsubAdminDoc = onSnapshot(doc(db, 'admins', user.uid), (snap) => {
          const isAdmin = snap.exists();
          setState(prev => {
            if (isAdmin && prev.userRole !== 'admin') {
              return { ...prev, userRole: 'admin' };
            }
            // Si dejó de ser admin (por revocación o cierre de sesión),
            // y el state local creía que lo era, baja el rol.
            if (!isAdmin && prev.userRole === 'admin') {
              return { ...prev, userRole: 'worker' };
            }
            return prev;
          });
        }, (err) => {
          console.warn('No se pudo verificar rol de admin:', err);
        });
      } else {
        setIsAuthenticated(false);
        // Mantener sesión anónima para que la app siga funcionando para
        // supervisores que aún no eligieron perfil.
        signInAnonymously(auth).catch((error) => {
          console.error("Anonymous authentication failed:", error);
        });
      }
    });

    // Failsafe to guarantee loader closes within 1.5s under any network speed limit
    const failsafeTimer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);

    return () => {
      unsubscribe();
      if (unsubAdminDoc) unsubAdminDoc();
      clearTimeout(failsafeTimer);
    };
  }, []);

  // 2. Firestore listeners
  useEffect(() => {
    const unsubReports = onSnapshot(collection(db, 'reports'), (snapshot) => {
      let reports = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as unknown as DailyReport));
      setState(prev => ({ ...prev, dailyReports: reports }));
    }, (error) => {
      console.warn("Firestore reports listen error:", error);
    });

    const unsubWorkers = onSnapshot(collection(db, 'workers'), (snapshot) => {
      let workers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as unknown as ProjectWorker));
      setState(prev => ({ ...prev, workers }));
    }, (error) => {
      console.warn("Firestore workers listen error:", error);
    });

    const unsubConfig = onSnapshot(collection(db, 'config'), (snapshot) => {
      let loadedSchedule: any = null;
      let loadedShiftConfig: any = null;
      let loadedLicenses: any = null;
      let loadedExtraHours: any = null;
      let hasScheduleDoc = false;

      snapshot.docs.forEach(docSnap => {
        const id = docSnap.id;
        const data = docSnap.data();
        if (id === 'global') {
          if (data.scheduleData !== undefined) {
            loadedSchedule = data.scheduleData;
            if (loadedSchedule) hasScheduleDoc = true;
          }
          if (data.shiftConfig !== undefined) loadedShiftConfig = data.shiftConfig;
          if (data.licenses !== undefined) loadedLicenses = data.licenses;
          if (data.extraHoursReports !== undefined) loadedExtraHours = data.extraHoursReports;
        } else if (id === 'schedule') {
          if (data.compressedSchedule) {
            try {
              const decompressed = LZString.decompressFromUTF16(data.compressedSchedule);
              if (decompressed) {
                 loadedSchedule = JSON.parse(decompressed);
                 hasScheduleDoc = true;
              }
            } catch (err) {
              console.error("Failed to decompress schedule data", err);
            }
          }
          if (!loadedSchedule) {
            loadedSchedule = data.scheduleData || data;
            if (loadedSchedule) hasScheduleDoc = true;
          }
        } else if (id === 'personnel') {
           let loadedWorkers: ProjectWorker[] | null = null;
           if (data.compressedPersonnel) {
             try {
                const decompressed = LZString.decompressFromUTF16(data.compressedPersonnel);
                if (decompressed) {
                  const pData = JSON.parse(decompressed);
                  if (pData && pData.allWorkers) {
                     loadedWorkers = pData.allWorkers;
                  }
                }
             } catch(err) {
                console.error("Failed to decompress personnel data", err);
             }
          }
          if (!loadedWorkers) {
            const loadedPersonnel = data.personnelData || data;
            if (loadedPersonnel && loadedPersonnel.allWorkers) {
              loadedWorkers = loadedPersonnel.allWorkers;
            }
          }
          if (loadedWorkers && loadedWorkers.length > 0) {
            // Auto-migrate to workers collection.
            // Las reglas de Firestore garantizan que sólo un admin puede
            // ejecutar la migración (allow write en /workers requiere admin).
            // Si la escritura es rechazada por permisos, simplemente se
            // ignora el error: cuando un admin abra la app la migración
            // se completará.
            const batch = writeBatch(db);
            let migratedCount = 0;
            loadedWorkers.slice(0, 400).forEach((w: any) => {
              let docRef;
              const rutKey = String(w.rut || "").trim().toLowerCase();
              const nameKey = String(w.nombre || "").trim().toUpperCase();

              if (rutKey && rutKey !== "-" && rutKey !== "0") {
                const cleanRut = rutKey.replace(/[^a-z0-9]/g, '');
                docRef = doc(db, 'workers', `rut_${cleanRut}`);
              } else if (nameKey && nameKey !== "-") {
                const cleanName = nameKey.replace(/[^A-Z0-9]/g, '');
                docRef = doc(db, 'workers', `name_${cleanName}`);
              } else {
                docRef = doc(collection(db, 'workers'));
              }
              const { id, ...dataToSave } = w;
              batch.set(docRef, dataToSave, { merge: true });
              migratedCount++;
            });
            if (migratedCount > 0) {
              batch.commit().then(() => {
                deleteDoc(doc(db, 'config', 'personnel')).catch(() => {});
              }).catch((err) => {
                if (err?.code !== 'permission-denied') {
                  console.warn('Personnel migration failed:', err);
                }
              });
            }
          }
        } else if (id === 'shift') {
          loadedShiftConfig = data;
        } else if (id === 'licenses') {
          loadedLicenses = data.licenses;
        } else if (id === 'extraHours') {
          loadedExtraHours = data.extraHoursReports || data.extraHours;
        }
      });

      if (loadedSchedule) {
        loadedSchedule = sanitizeScheduleData(loadedSchedule);
      }

      setDbHasSchedule(hasScheduleDoc);

      setState(prev => {
        const next = { ...prev };
        if (loadedSchedule) next.scheduleData = loadedSchedule;
        if (loadedShiftConfig) next.shiftConfig = loadedShiftConfig;
        if (loadedLicenses) next.licenses = loadedLicenses;
        if (loadedExtraHours) next.extraHoursReports = loadedExtraHours;
        return next;
      });
      setIsLoading(false);
    }, (error) => {
       console.warn("Firestore config listen error:", error);
       setDbHasSchedule(false);
       setIsLoading(false);
    });

    return () => {
      unsubReports();
      unsubWorkers();
      unsubConfig();
    };
  }, []);

  // Aggregate worker hours whenever reports change
  useEffect(() => {
    const hoursAgg: Record<string, number> = {};
    const extraAgg: Record<string, number> = {};
    let totalH = 0;

    state.dailyReports.forEach(report => {
      // Normal hours from workersDetail
      if (report.workersDetail) {
        report.workersDetail.forEach(wd => {
          if (wd.name) {
            hoursAgg[wd.name] = (hoursAgg[wd.name] || 0) + (wd.hours || 0);
            totalH += (wd.hours || 0);
          }
        });
      }

      // Extra hours from extraHours field in the report
      if (report.extraHours) {
        report.extraHours.forEach(eh => {
          if (eh.workerName) {
            extraAgg[eh.workerName] = (extraAgg[eh.workerName] || 0) + (eh.hours || 0);
          }
        });
      }
    });

    // Also include specialized extra hours reports if any
    if (state.extraHoursReports) {
      state.extraHoursReports.forEach(ehr => {
        if (ehr.workerName) {
          extraAgg[ehr.workerName] = (extraAgg[ehr.workerName] || 0) + (ehr.hours || 0);
        }
      });
    }

    setState(prev => ({
      ...prev,
      workerHoursAggregate: hoursAgg,
      workerExtraHoursAggregate: extraAgg,
      totalReportedHours: totalH
    }));
  }, [state.dailyReports]);

  // Re-calculate personnelData dynamically in AppContext so it is always up to date on all devices/roles instantly
  useEffect(() => {
    const list = state.workers || [];
    const onDuty = list.filter(w => String(w.estado || '').trim() === 'Turno');
    const byGroup: Record<string, { total: number; onDuty: number; workers: string[]; onDutyWorkers: string[] }> = {};
    
    list.forEach(p => {
      const g = String(p.grupo || 'S/G').toUpperCase();
      if (!byGroup[g]) {
        byGroup[g] = { total: 0, onDuty: 0, workers: [], onDutyWorkers: [] };
      }
      byGroup[g].total++;
      if (p.nombre) byGroup[g].workers.push(String(p.nombre));
      if (String(p.estado || '').trim() === 'Turno') {
        byGroup[g].onDuty++;
        if (p.nombre) byGroup[g].onDutyWorkers.push(String(p.nombre));
      }
    });

    const supKeywords = ['supervisor', 'capataz', 'jefe', 'lider', 'coordinador', 'l\u00edder'];
    const supervisors = list
      .filter(p => supKeywords.some(kw => String(p.cargo || '').toLowerCase().includes(kw)))
      .map(p => String(p.nombre || ''));

    const dedupedLicensesMap = new Map<string, any>();
    (state.licenses || []).forEach(l => {
      const k = `${String(l.rut || "").trim()}-${String(l.nombre || "").trim().toUpperCase()}`;
      dedupedLicensesMap.set(k, l);
    });

    const data: PersonnelData = {
      allWorkers: list,
      onDutyWorkers: [...new Set(onDuty.map(w => w.nombre).filter(Boolean))].map(String),
      supervisors: supervisors.length ? supervisors : [...new Set(onDuty.map(w => w.nombre).filter(Boolean))].map(String),
      personalActivo: list.map(p => ({ 
        nombre: String(p.nombre || ''), 
        rut: String(p.rut || ''), 
        cargo: String(p.cargo || ''), 
        grupo: String(p.grupo || ''), 
        estado: String(p.estado || '') as 'Turno' | 'Descanso' | 'Licencia' | 'Sin Turno',
        jornada: String(p.jornada || ''),
        hh: (Number(p.hh) || 0) + (Number(state.workerHoursAggregate?.[String(p.nombre || '')]) || 0),
        hhe: (Number(p.hhe) || 0) + (Number(state.workerExtraHoursAggregate?.[String(p.nombre || '')]) || 0),
        id: p.id
      })),
      totalWorkers: list.length,
      onDutyCount: onDuty.length,
      offDutyCount: list.length - onDuty.length,
      licenciaCount: dedupedLicensesMap.size, 
      permisoCount: 0,  
      byGroup,
      updatedAt: new Date().toISOString()
    };

    setState(prev => {
      const oldTotal = prev.personnelData?.totalWorkers || 0;
      const oldOnDuty = prev.personnelData?.onDutyCount || 0;
      const oldLicenses = prev.personnelData?.licenciaCount || 0;
      
      if (
        oldTotal === list.length && 
        oldOnDuty === onDuty.length && 
        oldLicenses === dedupedLicensesMap.size &&
        JSON.stringify(prev.personnelData?.allWorkers) === JSON.stringify(data.allWorkers) &&
        JSON.stringify(prev.personnelData?.supervisors) === JSON.stringify(data.supervisors)
      ) {
        return prev;
      }
      return { ...prev, personnelData: data };
    });
  }, [state.workers, state.licenses, state.workerHoursAggregate, state.workerExtraHoursAggregate]);

  useEffect(() => {
    const localState: Partial<SharedState> = {};
    LOCAL_KEYS.forEach(key => {
      // @ts-ignore
      localState[key] = state[key];
    });
    try {
      localStorage.setItem(STORAGE_LOCAL_KEY, JSON.stringify(localState));
    } catch (e) {
      console.warn("Failed to persist state to localStorage", e);
    }
  }, [state]);

  const updateState = useCallback(async (updates: Partial<SharedState>) => {
    // 1. Update local state immediately
    setState((prev) => ({ ...prev, ...updates }));

    // 2. Identify shared updates and push to Firestore
    try {
      // Si el usuario decidió cambiar su rol a worker o cerrar sesión,
      // invalida la sesión Firebase para evitar reusar credenciales admin.
      if ('userRole' in updates && (updates.userRole === undefined || updates.userRole === 'worker')) {
        if (auth.currentUser && !auth.currentUser.isAnonymous) {
          try {
            await auth.signOut();
            await signInAnonymously(auth);
          } catch (e) {
            console.warn('Could not reset auth session', e);
          }
        }
      }

      if (updates.dailyReports) {
        // This is tricky because we might be adding/updating one report
        // In the current architecture, updateState is called with the whole array
        // We'll try to find what changed or just sync the delta if we had a better pattern
        // But for now, we'll implement a simple "last item" check or full sync if it's feasible
        // However, the user said "connect forms to save". 
        // We should ideally have individual functions like addReport(report)
      }

      // Handle config sync (schedule, shiftConfig)
      if (updates.scheduleData || updates.shiftConfig) {
        if (updates.scheduleData) {
          const sRef = doc(db, 'config', 'schedule');
          const cleanSchedule = sanitizeScheduleData(updates.scheduleData);
          try {
            const compressed = LZString.compressToUTF16(JSON.stringify(cleanSchedule));
            await setDoc(sRef, { compressedSchedule: compressed, scheduleData: null }, { merge: true });
          } catch (compressErr) {
            console.error("LZ compression failed", compressErr);
            await setDoc(sRef, { scheduleData: cleanSchedule }, { merge: true });
          }
        }
        if (updates.shiftConfig) {
          const sfRef = doc(db, 'config', 'shift');
          await setDoc(sfRef, updates.shiftConfig, { merge: true });
        }
        
        // Touch global timestamp
        await setDoc(doc(db, 'config', 'global'), { updatedAt: new Date().toISOString() }, { merge: true });
      }

      // Handle licenses and extra hours as part of global config
      if (updates.licenses || updates.extraHoursReports) {
        if (updates.licenses) {
          await setDoc(doc(db, 'config', 'licenses'), { licenses: updates.licenses }, { merge: true });
        }
        if (updates.extraHoursReports) {
          await setDoc(doc(db, 'config', 'extraHours'), { extraHoursReports: updates.extraHoursReports }, { merge: true });
        }
        
        // Touch global timestamp
        await setDoc(doc(db, 'config', 'global'), { updatedAt: new Date().toISOString() }, { merge: true });
      }

    } catch (error) {
      console.error("Error updating Firestore:", error);
      notify('error', `Error de Sincronización en la Nube: ${error instanceof Error ? error.message : String(error)}. Por favor verifique su perfil de acceso.`);
    }
  }, []);

  // Specialized helper to update a task status globally in the schedule configurations
  const updateTaskStatus = useCallback(async (taskId: string, newStatus: string) => {
    let updatedScheduleData: any = null;

    setState(prev => {
      if (!prev.scheduleData || !prev.scheduleData.tasks) return prev;

      const updatedTasks = prev.scheduleData.tasks.map((t: any) => 
        t.id === taskId ? { ...t, status: newStatus } : t
      );

      const updateTaskInWbs = (nodesOrNode: any): any => {
        if (Array.isArray(nodesOrNode)) {
          return nodesOrNode.map(node => updateTaskInWbs(node));
        }
        const node = nodesOrNode;
        if (!node) return node;
        const updatedNodeTasks = node.tasks ? node.tasks.map((t: any) => 
          t.id === taskId ? { ...t, status: newStatus } : t
        ) : [];
        const updatedChildren = node.children ? node.children.map((child: any) => 
          updateTaskInWbs(child)
        ) : [];
        return {
          ...node,
          tasks: updatedNodeTasks,
          children: updatedChildren
        };
      };

      const updatedRootWbs = updateTaskInWbs(prev.scheduleData.rootWbs);

      updatedScheduleData = {
        ...prev.scheduleData,
        tasks: updatedTasks,
        rootWbs: updatedRootWbs,
        stats: {
          ...prev.scheduleData.stats,
          active: updatedTasks.filter((t: any) => t.status === 'TK_Active').length,
          completed: updatedTasks.filter((t: any) => t.status === 'TK_Complete').length
        }
      };

      return {
        ...prev,
        scheduleData: updatedScheduleData
      };
    });

    // Push to Firestore in background
    setTimeout(async () => {
      if (updatedScheduleData) {
        try {
          const sRef = doc(db, 'config', 'schedule');
          const cleanSchedule = sanitizeScheduleData(updatedScheduleData);
          try {
            const compressed = LZString.compressToUTF16(JSON.stringify(cleanSchedule));
            await setDoc(sRef, { compressedSchedule: compressed, scheduleData: null }, { merge: true });
          } catch (compressErr) {
            await setDoc(sRef, { scheduleData: cleanSchedule }, { merge: true });
          }
          await setDoc(doc(db, 'config', 'global'), { updatedAt: new Date().toISOString() }, { merge: true });
        } catch (error) {
          console.error("Error setting task status in Firestore:", error);
        }
      }
    }, 50);
  }, []);

  // Specialized helpers for forms to use Firestore directly
  const addDailyReport = async (report: Omit<DailyReport, 'id'>) => {
    try {
      await addDoc(collection(db, 'reports'), {
        ...report,
        updatedAt: new Date().toISOString()
      });

      // Synchronize matching scheduling/calendar tasks
      if (state.scheduleData && state.scheduleData.tasks) {
        const matchingTask = state.scheduleData.tasks.find((t: any) => {
          if (t.name?.trim().toLowerCase() !== report.tipo?.trim().toLowerCase()) return false;
          if (report.wbs && t.wbsName && t.wbsName.trim().toLowerCase() !== report.wbs.trim().toLowerCase()) return false;
          if (!t.startDate) return false;
          const startStr = typeof t.startDate === 'string' ? t.startDate.slice(0, 10) : new Date(t.startDate).toISOString().slice(0, 10);
          const endStr = t.endDate ? (typeof t.endDate === 'string' ? t.endDate.slice(0, 10) : new Date(t.endDate).toISOString().slice(0, 10)) : startStr;
          return report.date >= startStr && report.date <= endStr;
        });

        if (matchingTask) {
          // Si se hace un reporte de la tarea (ejecución o listo para hoy), la tarea global entra en ejecución,
          // a menos que ya esté completada globalmente, no la sobreescribimos a TK_Complete solo por un día "listo".
          const newStatus = (report.status === 'ejecucion' || report.status === 'listo') ? 'TK_Active' : 'TK_Pending';
          
          if (matchingTask.status === 'TK_Pending' && newStatus === 'TK_Active') {
            await updateTaskStatus(matchingTask.id, 'TK_Active');
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reports');
    }
  };

  const updateDailyReport = async (id: string, report: Partial<DailyReport>) => {
    try {
      await updateDoc(doc(db, 'reports', id), {
        ...report,
        updatedAt: new Date().toISOString()
      });

      // Synchronize matching scheduling/calendar tasks
      const originalReport = state.dailyReports.find(r => String(r.id) === String(id));
      const finalReport = originalReport ? { ...originalReport, ...report } : null;
      if (finalReport && finalReport.date && finalReport.tipo && state.scheduleData && state.scheduleData.tasks) {
        const matchingTask = state.scheduleData.tasks.find((t: any) => {
          if (t.name?.trim().toLowerCase() !== finalReport.tipo?.trim().toLowerCase()) return false;
          if (finalReport.wbs && t.wbsName && t.wbsName.trim().toLowerCase() !== finalReport.wbs.trim().toLowerCase()) return false;
          if (!t.startDate) return false;
          const startStr = typeof t.startDate === 'string' ? t.startDate.slice(0, 10) : new Date(t.startDate).toISOString().slice(0, 10);
          const endStr = t.endDate ? (typeof t.endDate === 'string' ? t.endDate.slice(0, 10) : new Date(t.endDate).toISOString().slice(0, 10)) : startStr;
          return finalReport.date >= startStr && finalReport.date <= endStr;
        });

        if (matchingTask) {
          // Si se hace un reporte de la tarea (ejecución o listo para hoy), la tarea global entra en ejecución,
          // a menos que ya esté completada globalmente, no la sobreescribimos a TK_Complete solo por un día "listo".
          const newStatus = (finalReport.status === 'ejecucion' || finalReport.status === 'listo') ? 'TK_Active' : 'TK_Pending';
          
          if (matchingTask.status === 'TK_Pending' && newStatus === 'TK_Active') {
            await updateTaskStatus(matchingTask.id, 'TK_Active');
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reports/${id}`);
    }
  };

  const deleteDailyReport = async (id: string | number) => {
    try {
      const originalReport = state.dailyReports.find(r => String(r.id) === String(id));
      await deleteDoc(doc(db, 'reports', String(id)));

      // Synchronize matching scheduling/calendar tasks back to TK_Pending if matching report was deleted
      if (originalReport && originalReport.date && originalReport.tipo && state.scheduleData && state.scheduleData.tasks) {
        const matchingTask = state.scheduleData.tasks.find((t: any) => {
          if (t.name?.trim().toLowerCase() !== originalReport.tipo?.trim().toLowerCase()) return false;
          if (originalReport.wbs && t.wbsName && t.wbsName.trim().toLowerCase() !== originalReport.wbs.trim().toLowerCase()) return false;
          if (!t.startDate) return false;
          const startStr = typeof t.startDate === 'string' ? t.startDate.slice(0, 10) : new Date(t.startDate).toISOString().slice(0, 10);
          const endStr = t.endDate ? (typeof t.endDate === 'string' ? t.endDate.slice(0, 10) : new Date(t.endDate).toISOString().slice(0, 10)) : startStr;
          return originalReport.date >= startStr && originalReport.date <= endStr;
        });

        if (matchingTask && matchingTask.status !== 'TK_Pending') {
          // Verify if there are other reports for this exact same global task
          const otherReportsExist = state.dailyReports.some(r => 
            String(r.id) !== String(id) && 
            r.tipo?.trim().toLowerCase() === matchingTask.name?.trim().toLowerCase() &&
            (r.wbs ? r.wbs.trim().toLowerCase() === (matchingTask.wbsName || '').trim().toLowerCase() : true)
          );

          if (!otherReportsExist) {
            await updateTaskStatus(matchingTask.id, 'TK_Pending');
          }
        }
      }
    } catch (error) {
       handleFirestoreError(error, OperationType.DELETE, `reports/${id}`);
    }
  };

  const saveWorker = async (worker: Partial<ProjectWorker>, id?: string) => {
    try {
      if (id) {
        await updateDoc(doc(db, 'workers', id), worker);
      } else {
        await addDoc(collection(db, 'workers'), worker);
      }
    } catch (error) {
      handleFirestoreError(error, id ? OperationType.UPDATE : OperationType.CREATE, `workers/${id || ''}`);
    }
  };

  const deleteWorker = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'workers', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `workers/${id}`);
    }
  };

  const saveWorkersBulk = async (workers: ProjectWorker[]) => {
    try {
      // Chunk workers into groups of 400 to respect Firestore batch limit of 500
      const chunkSize = 400;
      for (let i = 0; i < workers.length; i += chunkSize) {
        const chunk = workers.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach(w => {
          if (!w) return;
          let docRef;
          const rutKey = String(w.rut || "").trim().toLowerCase();
          const nameKey = String(w.nombre || "").trim().toUpperCase();
          
          if (w.id && String(w.id).length > 5) {
            docRef = doc(db, 'workers', String(w.id));
          } else if (rutKey !== "-" && rutKey !== "" && rutKey !== "0") {
            const cleanRut = rutKey.replace(/[^a-z0-9]/g, '');
            docRef = doc(db, 'workers', `rut_${cleanRut}`);
          } else if (nameKey !== "" && nameKey !== "-") {
            const cleanName = nameKey.replace(/[^A-Z0-9]/g, '');
            docRef = doc(db, 'workers', `name_${cleanName}`);
          } else {
            docRef = doc(collection(db, 'workers'));
          }
          
          const { id, ...data } = w;
          batch.set(docRef, data, { merge: true });
        });
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'workers_bulk');
    }
  };

  const resetAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      localStorage.removeItem(STORAGE_LOCAL_KEY);
      localStorage.removeItem('solgram_daily_reports');
      localStorage.removeItem('solgram_all_workers');
      
      // 1. Clear Global Config docs
      await deleteDoc(doc(db, 'config', 'global'));
      await deleteDoc(doc(db, 'config', 'schedule'));
      await deleteDoc(doc(db, 'config', 'personnel'));
      await deleteDoc(doc(db, 'config', 'shift'));
      await deleteDoc(doc(db, 'config', 'licenses'));
      await deleteDoc(doc(db, 'config', 'extraHours'));
      
      // 2. Clear Workers
      const workersSnap = await getDocs(collection(db, 'workers'));
      if (!workersSnap.empty) {
        const batch = writeBatch(db);
        workersSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // 3. Clear Reports
      const reportsSnap = await getDocs(collection(db, 'reports'));
      if (!reportsSnap.empty) {
        const batch = writeBatch(db);
        reportsSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // 4. Clear Extra Hours
      const extraSnap = await getDocs(collection(db, 'extraHours'));
      if (!extraSnap.empty) {
        const batch = writeBatch(db);
        extraSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // 5. Clear Licenses
      const licenseSnap = await getDocs(collection(db, 'licenses'));
      if (!licenseSnap.empty) {
        const batch = writeBatch(db);
        licenseSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      setState(prev => ({
        ...DEFAULT_STATE,
        theme: prev.theme,
        userRole: prev.userRole 
      }));

      notify('success', 'Base de datos reiniciada con éxito.');
      setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      console.error("Error resetting data:", error);
      notify('error', 'Error al reiniciar los datos.');
      setIsLoading(false);
    }
  }, [notify]);

  const exportAsTxt = useCallback(() => {
    let content = `REPORTE DE PROYECTO - SOLGRAM\n`;
    content += `Fecha de exportación: ${new Date().toLocaleString()}\n`;
    content += `Usuario: ${state.userRole || 'No identificado'}\n`;
    content += `==========================================\n\n`;

    if (state.scheduleData) {
      content += `DATOS DE CRONOGRAMA (XER)\n`;
      content += `ID/Nombre: ${state.scheduleData.name || state.scheduleData.id}\n`;
      content += `Archivo: ${state.scheduleData.fileName}\n`;
      content += `Actividades Totales: ${state.scheduleData.tasks.length}\n`;
      content += `Estadísticas: ${state.scheduleData.stats.completed} completadas / ${state.scheduleData.stats.active} activas\n`;
      content += `------------------------------------------\n\n`;
    }

    content += `PERSONAL ACTIVO (${state.personnelData?.personalActivo?.length || 0})\n`;
    state.personnelData?.personalActivo?.forEach((p) => {
      p.nombre && (content += `- ${p.nombre} | RUT: ${p.rut} | Cargo: ${p.cargo} | Grupo: ${p.grupo}\n`);
    });
    content += `------------------------------------------\n\n`;

    content += `REPORTES DIARIOS (${state.dailyReports.length})\n`;
    state.dailyReports.forEach((r) => {
      content += `FECHA: ${r.date} | SUP: ${r.sup}\n`;
      content += `Estado: ${r.status || 'ejecución'}\n`;
      content += `Detalle: ${r.detalle}\n`;
      content += `Tipo: ${r.tipo}\n`;
      content += `HH Real: ${r.hours} | Trabajadores: ${r.workers.length}\n`;
      if (r.subLabors && r.subLabors.length > 0) {
        content += `Subtareas:\n`;
        r.subLabors.forEach(s => content += `  * ${s.name} (${s.hours}hh - ${s.status})\n`);
      }
      content += `-------------------\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Proyecto_Solgram_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const exportToCalendar = useCallback(async () => {
    if (!state.scheduleData || state.scheduleData.tasks.length === 0) {
      notify('error', 'No hay tareas en el cronograma para exportar.');
      return;
    }
    setExportModal({
      isOpen: true,
      type: 'calendar',
      mode: 'confirm',
      calendarOption: 'new',
      excludeCompleted: false
    });
  }, [state.scheduleData, notify]);

  const handleExecuteExport = async () => {
    const type = exportModal.type;
    setExportModal(prev => ({ ...prev, mode: 'loading' }));

    try {
      let token = getCachedAccessToken();
      if (!token) {
        notify('info', 'Conectando con Google Services...');
        token = await loginWithGoogleServices();
      }

      if (type === 'calendar') {
        notify('info', 'Exportando cronograma a Google Calendar...');
        const result = await exportScheduleToGoogleCalendar(
          token,
          state,
          exportModal.calendarOption || 'new',
          !!exportModal.excludeCompleted
        );
        
        notify('success', `¡Sincronización de ${result.count} tareas completada!`);
        setExportModal({
          isOpen: true,
          type: 'calendar',
          mode: 'success',
          linkUrl: result.calendarUrl
        });
      }
    } catch (err: any) {
      console.error(err);
      notify('error', 'Error al exportar: ' + err.message);
      setExportModal({
        isOpen: true,
        type,
        mode: 'error',
        errorMessage: err.message || 'Error de permisos o conexión de Google'
      });
    }
  };

  return (
    <AppContext.Provider value={{ 
      state, 
      updateState, 
      addDailyReport, 
      updateDailyReport, 
      deleteDailyReport, 
      updateTaskStatus,
      saveWorker,
      saveWorkersBulk,
      deleteWorker,
      resetAllData, 
      exportAsTxt,
      exportToCalendar,
      notify,
      dbHasSchedule
    }}>
      {isLoading ? (
        <div className={cn(
          "fixed inset-0 flex items-center justify-center z-[200] transition-colors duration-500",
          state.theme === 'dark' ? "bg-[#0b1220]" : "bg-[#eef4fb]"
        )}>
          <div className="flex flex-col items-center gap-4">
            <div className={cn(
              "w-12 h-12 border-4 border-t-transparent rounded-full animate-spin",
              state.theme === 'dark' ? "border-blue-500" : "border-blue-600"
            )} />
            <p className={cn(
              "font-bold animate-pulse text-xs uppercase tracking-widest",
              state.theme === 'dark' ? "text-blue-500" : "text-blue-600"
            )}>Sincronizando con Servidor...</p>
          </div>
        </div>
      ) : (
        <>
          {children}
          <NotificationContainer notifications={notifications} onClose={closeNotification} />

          {/* Export Google Workspace Modal */}
          <AnimatePresence>
            {exportModal.isOpen && (
              <div id="export-workspace-modal-container" className="fixed inset-0 z-[250] flex items-center justify-center p-4">
                {/* Backdrop with fade-in */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/65 backdrop-blur-sm"
                  onClick={() => exportModal.mode !== 'loading' && setExportModal(prev => ({ ...prev, isOpen: false }))}
                />

                {/* Modal Container with scale-in */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  className={cn(
                    "relative w-full max-w-md rounded-2xl border p-6 shadow-2xl z-10 transition-colors duration-300",
                    state.theme === 'dark' 
                      ? "bg-slate-900 border-slate-800 text-white" 
                      : "bg-white border-gray-100 text-slate-900"
                  )}
                >
                  {/* Close button (only when not loading) */}
                  {exportModal.mode !== 'loading' && (
                    <button
                      type="button"
                      id="close-export-modal-btn"
                      onClick={() => setExportModal(prev => ({ ...prev, isOpen: false }))}
                      className={cn(
                        "absolute top-4 right-4 p-1.5 rounded-lg transition-colors",
                        state.theme === 'dark' ? "hover:bg-white/5 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-950"
                      )}
                    >
                      <X size={18} />
                    </button>
                  )}

                  {exportModal.mode === 'confirm' && (
                    <div id="export-confirm-step" className="space-y-5">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-3 rounded-xl",
                          state.theme === 'dark' ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-50 text-indigo-600"
                        )}>
                          <Calendar size={24} />
                        </div>
                        <div>
                          <h3 className="font-black text-sm uppercase tracking-wider text-left">
                            Sincronizar con Google Calendar
                          </h3>
                          <p className={cn("text-[10px] font-bold uppercase tracking-wider text-left", state.theme === 'dark' ? "text-slate-400" : "text-slate-500")}>
                            Integración con Google Workspace
                          </p>
                        </div>
                      </div>

                      <div className={cn("text-xs leading-relaxed space-y-4 text-left", state.theme === 'dark' ? "text-slate-300" : "text-slate-600")}>
                        <div className="space-y-3.5">
                          <p>
                            Sincroniza y crea eventos en tu cuenta de Google Calendar para visualizar las actividades de tu planificación en línea:
                          </p>
                          
                          {/* Option selection */}
                          <div className="space-y-2.5 p-3.5 rounded-xl border text-xs bg-black/5 dark:bg-black/20 border-slate-700/30">
                            <span className="block font-black text-[10px] tracking-wider uppercase opacity-80 mb-1.5">Destino del Calendario:</span>
                            <label className="flex items-start gap-2.5 cursor-pointer select-none">
                              <input
                                type="radio"
                                name="calendarOpt"
                                className="mt-0.5"
                                checked={exportModal.calendarOption === 'new'}
                                onChange={() => setExportModal(prev => ({ ...prev, calendarOption: 'new' }))}
                              />
                              <div>
                                <span className="block font-bold leading-none text-xs">Crear nuevo calendario</span>
                                <span className="block text-[10px] opacity-60 mt-1 leading-normal">Se creará un calendario separado llamado "Solgram: {state.scheduleData?.name || 'Cronograma'}"</span>
                              </div>
                            </label>
                            <label className="flex items-start gap-2.5 cursor-pointer select-none mt-2">
                              <input
                                type="radio"
                                name="calendarOpt"
                                className="mt-0.5"
                                checked={exportModal.calendarOption === 'primary'}
                                onChange={() => setExportModal(prev => ({ ...prev, calendarOption: 'primary' }))}
                              />
                              <div>
                                <span className="block font-bold leading-none text-xs">Calendario Principal</span>
                                <span className="block text-[10px] opacity-60 mt-1 leading-normal">Añade los eventos directamente en tu calendario personal predeterminado</span>
                              </div>
                            </label>
                          </div>

                          {/* Exclusion filter */}
                          <label className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-black/20 cursor-pointer select-none border border-black/5 dark:border-white/5">
                            <input
                              type="checkbox"
                              checked={!!exportModal.excludeCompleted}
                              onChange={(e) => setExportModal(prev => ({ ...prev, excludeCompleted: e.target.checked }))}
                            />
                            <span className="text-xs font-bold uppercase tracking-wider text-[10px]">Excluir actividades completadas</span>
                          </label>

                          <p className="pl-3 border-l-2 border-indigo-500/50 text-[11px] font-medium opacity-80 whitespace-pre-line">
                            • Sincroniza todas las actividades de la carta Gantt.{"\n"}
                            • Genera bloques de fechas precisos (eventos de días enteros) en tu huso horario.
                          </p>
                        </div>

                        <div className={cn(
                          "p-3 rounded-lg text-[11px] font-medium leading-normal flex gap-2.5 items-start",
                          state.theme === 'dark' ? "bg-slate-800/40 border border-slate-700/30 text-slate-300" : "bg-amber-50/50 border border-amber-100 text-amber-800"
                        )}>
                          <div className="shrink-0 mt-0.5">
                            <AlertTriangle size={14} className={state.theme === 'dark' ? "text-slate-400" : "text-amber-600"} />
                          </div>
                          <p>
                            Se requerirá que inicies sesión en tu cuenta de Google y permitas el acceso a la aplicación para poder crear y escribir los datos.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2.5 pt-2">
                        <button
                          type="button"
                          id="btn-export-cancel"
                          onClick={() => setExportModal(prev => ({ ...prev, isOpen: false }))}
                          className={cn(
                            "flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors border",
                            state.theme === 'dark' 
                              ? "bg-transparent border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white" 
                              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                          )}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          id="btn-export-confirm"
                          onClick={handleExecuteExport}
                          className={cn(
                            "flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all text-white shadow-md flex items-center justify-center gap-1.5 bg-indigo-650 hover:bg-indigo-750 active:scale-[0.98]"
                          )}
                        >
                          Confirmar y Exportar
                        </button>
                      </div>
                    </div>
                  )}

                  {exportModal.mode === 'loading' && (
                    <div id="export-loading-step" className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
                      <div className="relative">
                        <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
                      </div>
                      <div className="space-y-1.5">
                        <h4 className="font-black text-sm uppercase tracking-wider">
                          Sincronizando con Google...
                        </h4>
                        <p className={cn("text-xs font-medium max-w-[280px] mx-auto", state.theme === 'dark' ? "text-slate-400" : "text-slate-500")}>
                          Creando y sincronizando eventos en tu Google Calendar...
                        </p>
                      </div>
                      <p className="text-[10px] uppercase font-black tracking-widest animate-pulse opacity-60">
                        No cierres esta ventana
                      </p>
                    </div>
                  )}

                  {exportModal.mode === 'success' && (
                    <div id="export-success-step" className="space-y-5 text-center">
                      <div className="flex flex-col items-center justify-center pt-2 space-y-3">
                        <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-500">
                          <CheckCircle size={36} />
                        </div>
                        <div>
                          <h3 className="font-black text-sm uppercase tracking-wider">
                            ¡Sincronización Exitosa!
                          </h3>
                          <p className={cn("text-[10px] font-bold uppercase tracking-wider mt-0.5", state.theme === 'dark' ? "text-slate-400" : "text-slate-500")}>
                            Calendario Sincronizado Correctamente
                          </p>
                        </div>
                      </div>

                      <p className={cn("text-xs leading-relaxed max-w-[320px] mx-auto", state.theme === 'dark' ? "text-slate-300" : "text-slate-600")}>
                        Las actividades operativas han sido añadidas a tu Google Calendar. Puedes verlas y compartirlas con tu equipo desde cualquier dispositivo.
                      </p>

                      <div className="flex flex-col gap-2 pt-2">
                        {exportModal.linkUrl && (
                          <a
                            href={exportModal.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            id="btn-open-workspace-link"
                            className="w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider text-white shadow-lg transition-all text-center block active:scale-[0.98] bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-900/20"
                          >
                            Abrir Google Calendar
                          </a>
                        )}
                        <button
                          type="button"
                          id="btn-export-success-close"
                          onClick={() => setExportModal(prev => ({ ...prev, isOpen: false }))}
                          className={cn(
                            "w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors",
                            state.theme === 'dark' ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-[#162033] hover:bg-slate-200"
                          )}
                        >
                          Cerrar Ventana
                        </button>
                      </div>
                    </div>
                  )}

                  {exportModal.mode === 'error' && (
                    <div id="export-error-step" className="space-y-5">
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl bg-red-500/10 text-red-500">
                          <AlertTriangle size={24} />
                        </div>
                        <div>
                          <h3 className="font-black text-sm uppercase tracking-wider text-red-500">
                            Error al Sincronizar
                          </h3>
                          <p className={cn("text-[10px] font-bold uppercase tracking-wider", state.theme === 'dark' ? "text-slate-400" : "text-slate-500")}>
                            No se pudo completar la operación
                          </p>
                        </div>
                      </div>

                      <div className={cn(
                        "p-3.5 rounded-xl text-xs font-medium font-mono leading-relaxed break-words border text-left",
                        state.theme === 'dark' ? "bg-red-500/5 border-red-500/10 text-red-400" : "bg-red-50 border-red-100 text-red-700"
                      )}>
                        {exportModal.errorMessage || 'Ha ocurrido un error inesperado al interactuar con el servidor de Google.'}
                      </div>

                      <div className="flex gap-2.5 pt-2">
                        <button
                          type="button"
                          id="btn-export-error-close"
                          onClick={() => setExportModal(prev => ({ ...prev, isOpen: false }))}
                          className={cn(
                            "flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors",
                            state.theme === 'dark' ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-[#162033] hover:bg-slate-200"
                          )}
                        >
                          Cerrar
                        </button>
                        <button
                          type="button"
                          id="btn-export-error-retry"
                          onClick={() => setExportModal(prev => ({ ...prev, mode: 'confirm' }))}
                          className="flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider text-white shadow bg-red-600 hover:bg-red-700 active:scale-[0.98] transition-all"
                        >
                          Reintentar
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
