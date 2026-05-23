export interface Task {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  durationHrs: number;
  wbsId: string;
  wbsName: string;
  isMilestone: boolean;
  progress?: number;
}

export interface WBSNode {
  id: string;
  name: string;
  parentId: string | null;
  seqNum: number;
  startDate: string | null;
  endDate: string | null;
  durationHrs: number;
  children: WBSNode[];
  tasks: Task[];
}

export interface LaborAssignment {
  id: string;
  name: string;
  parentId?: string | null;
  primaryWbsId?: string;
  primaryWbsName?: string;
  startDate: string | null;
  endDate: string | null;
  durationHrs: number;
  durationDays?: number;
  taskCount?: number;
  subTasks?: string[];
  status?: string;
  isMilestone?: boolean;
}

export interface ScheduleData {
  id: string;
  name: string;
  fileName: string;
  startDate: string | null;
  endDate: string | null;
  calendarName?: string;
  stats: {
    total: number;
    completed: number;
    active: number;
    milestones: number;
    wbsCount: number;
    sumActualHrs: number;
    sumTotalHrs: number;
    sumPlannedHrs: number;
  };
  rootWbs: WBSNode[];
  tasks: Task[];
  primaryLabors: LaborAssignment[];
  secondaryLabors: LaborAssignment[];
}

export interface ProjectWorker {
  nombre: string;
  rut: string;
  cargo: string;
  ubicacion?: string;
  grupo: string;
  jornada: string;
  hh: number;
  hhe: number;
  estado: 'Turno' | 'Descanso' | 'Licencia' | 'Sin Turno';
  id?: string | number;
}

export interface PersonnelData {
  allWorkers: ProjectWorker[];
  onDutyWorkers: string[];
  supervisors: string[];
  personalActivo: ProjectWorker[];
  totalWorkers: number;
  onDutyCount: number;
  offDutyCount: number;
  licenciaCount: number;
  permisoCount: number;
  byGroup: Record<string, {
    total: number;
    onDuty: number;
    workers: string[];
    onDutyWorkers: string[];
  }>;
  updatedAt: string;
}

export interface WorkerDetail {
  name: string;
  hours: number;
}

export interface SubLabor {
  name: string;
  hours: number;
  status: 'pendiente' | 'ejecucion' | 'listo';
}

export interface DailyReport {
  id: string;
  date: string;
  sup: string;
  wbs: string;
  tipo: string;
  detalle: string;
  workers: string[];
  workersDetail: WorkerDetail[];
  hours: number;
  subLabors: SubLabor[];
  p6Matched: boolean;
  source: string;
  extraHours?: { workerName: string; hours: number }[];
  status?: 'pendiente' | 'ejecucion' | 'listo';
  images?: string[];
  taskId?: string;
}

export interface License {
  nombre: string;
  rut: string;
  cargo: string;
  grupo: string;
  desde: string;
  hasta: string;
  dias: number;
}

export interface ExtraHoursReport {
  id: string;
  date: string;
  workerName: string;
  hours: number;
}

export interface ChatEntry {
  role: 'user' | 'model';
  message: string;
  timestamp: string;
}

export type ModuleKey = 'resumen' | 'gantt' | 'periodo' | 'calendario' | 'reporte' | 'personal';
export type UserRole = 'admin' | 'worker';

export interface SharedState {
  theme: 'light' | 'dark';
  userRole?: UserRole;
  activeTab?: ModuleKey;
  scheduleData: ScheduleData | null;
  personnelData: PersonnelData | null;
  dailyReports: DailyReport[];
  workers?: ProjectWorker[];
  extraHoursReports?: ExtraHoursReport[];
  licenses: License[];
  workerHoursAggregate: Record<string, number>;
  workerExtraHoursAggregate?: Record<string, number>;
  totalReportedHours: number;
  selectedDate: string | null;
  selectedTaskId: string | null;
  selectedWbsId: string | null;
  chatHistory: ChatEntry[];
  syncMeta: {
    lastScheduleSync?: string;
    lastPersonnelSync?: string;
    lastReportSync?: string;
    selectedDateSource?: string;
    selectedDateAt?: string;
    source?: string;
    turnOffset?: number;
  };
  shiftConfig?: {
    anchorDate: string;
    anchorShift: 'A' | 'B';
    cycleDays: number;
    hoursPerShift: number;
  };
}
