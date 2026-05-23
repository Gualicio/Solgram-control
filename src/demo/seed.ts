/**
 * Datos de ejemplo que poblan la Firestore mock en la primera visita.
 * Mismas colecciones que la app real:
 *   - /admins/{uid}            → reconoce al admin demo
 *   - /workers/{id}            → personal con grupos y estados
 *   - /reports/{id}            → reportes diarios de muestra
 *   - /config/global           → metadata global
 *   - /config/schedule         → cronograma con WBS, tareas y stats
 *   - /config/shift            → configuración de turnos 14×14
 *   - /config/licenses         → licencias activas
 *   - /config/extraHours       → horas extra
 */

interface SeedAPI {
  put(path: string, data: Record<string, any>): void;
}

const todayISO = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function seedDemoStore(api: SeedAPI): void {
  // ---- Admin demo ---------------------------------------------------
  api.put("admins/demo-admin", {
    grantedAt: todayISO(),
    grantedBy: "demo-seed",
  });

  // ---- Workers ------------------------------------------------------
  const workers = [
    { nombre: "Carlos Pérez",     rut: "12.345.678-9", cargo: "Supervisor",          grupo: "A", jornada: "14x14", estado: "Turno",    hh: 312, hhe:  18 },
    { nombre: "Marcela Soto",     rut: "13.456.789-K", cargo: "Capataz",             grupo: "A", jornada: "14x14", estado: "Turno",    hh: 288, hhe:  12 },
    { nombre: "Rodrigo González", rut: "14.567.890-1", cargo: "Supervisor",          grupo: "C", jornada: "14x14", estado: "Turno",    hh: 264, hhe:  20 },
    { nombre: "Felipe Núñez",     rut: "15.678.901-2", cargo: "Maestro Carpintero",  grupo: "A", jornada: "14x14", estado: "Turno",    hh: 240, hhe:   6 },
    { nombre: "Ana Riquelme",     rut: "16.789.012-3", cargo: "Maestro Albañil",     grupo: "C", jornada: "14x14", estado: "Turno",    hh: 228, hhe:   8 },
    { nombre: "Pedro Muñoz",      rut: "17.890.123-4", cargo: "Ayudante",            grupo: "B", jornada: "14x14", estado: "Descanso", hh: 192, hhe:   0 },
    { nombre: "Lorena Vidal",     rut: "18.901.234-5", cargo: "Maestro Eléctrico",   grupo: "B", jornada: "14x14", estado: "Descanso", hh: 168, hhe:   4 },
    { nombre: "Diego Henríquez",  rut: "19.012.345-6", cargo: "Operador Maquinaria", grupo: "D", jornada: "14x14", estado: "Descanso", hh: 156, hhe:  10 },
    { nombre: "Camila Toro",      rut: "20.123.456-7", cargo: "Prevencionista",      grupo: "A", jornada: "14x14", estado: "Licencia", hh:  84, hhe:   0 },
    { nombre: "Javier Rojas",     rut: "21.234.567-8", cargo: "Jornal",              grupo: "C", jornada: "14x14", estado: "Turno",    hh: 144, hhe:   2 },
    { nombre: "Patricia Lagos",   rut: "22.345.678-9", cargo: "Bodeguera",           grupo: "A", jornada: "14x14", estado: "Turno",    hh: 192, hhe:   0 },
    { nombre: "Tomás Fuentes",    rut: "23.456.789-0", cargo: "Operario Soldador",   grupo: "B", jornada: "14x14", estado: "Descanso", hh: 132, hhe:  14 },
  ];
  workers.forEach((w) => {
    const cleanRut = w.rut.toLowerCase().replace(/[^a-z0-9]/g, "");
    api.put(`workers/rut_${cleanRut}`, w);
  });

  // ---- Schedule (Carta Gantt) ---------------------------------------
  const tasks = [
    { id: "T-01", name: "Movimiento de tierra",  status: "TK_Complete", startDate: daysFromNow(-90), endDate: daysFromNow(-60), durationHrs: 2880, wbsId: "W-1", wbsName: "Mov. Tierra",          isMilestone: false },
    { id: "T-02", name: "Fundaciones Edif. A",   status: "TK_Complete", startDate: daysFromNow(-65), endDate: daysFromNow(-30), durationHrs: 3360, wbsId: "W-2", wbsName: "Estructura · Edif. A", isMilestone: false },
    { id: "T-03", name: "Estructura Edif. A",    status: "TK_Active",   startDate: daysFromNow(-30), endDate: daysFromNow( 25), durationHrs: 5280, wbsId: "W-2", wbsName: "Estructura · Edif. A", isMilestone: false },
    { id: "T-04", name: "Fundaciones Edif. B",   status: "TK_Active",   startDate: daysFromNow(-15), endDate: daysFromNow( 20), durationHrs: 3360, wbsId: "W-3", wbsName: "Estructura · Edif. B", isMilestone: false },
    { id: "T-05", name: "Estructura Edif. B",    status: "TK_Pending",  startDate: daysFromNow( 20), endDate: daysFromNow( 80), durationHrs: 5760, wbsId: "W-3", wbsName: "Estructura · Edif. B", isMilestone: false },
    { id: "T-06", name: "Instalaciones MEP",     status: "TK_Pending",  startDate: daysFromNow( 60), endDate: daysFromNow(120), durationHrs: 4320, wbsId: "W-4", wbsName: "Instalaciones",        isMilestone: false },
    { id: "T-07", name: "Terminaciones",         status: "TK_Pending",  startDate: daysFromNow(110), endDate: daysFromNow(160), durationHrs: 3600, wbsId: "W-5", wbsName: "Terminaciones",        isMilestone: false },
    { id: "T-08", name: "Entrega Provisoria",    status: "TK_Pending",  startDate: daysFromNow(160), endDate: daysFromNow(160), durationHrs:    0, wbsId: "W-6", wbsName: "Entrega",              isMilestone: true },
  ];

  const wbsNodes = [
    { id: "W-1", name: "Movimiento de Tierra",   parentId: null, seqNum: 1, startDate: daysFromNow(-90), endDate: daysFromNow(-60), durationHrs: 2880, children: [], tasks: [tasks[0]] },
    { id: "W-2", name: "Estructura · Edif. A",   parentId: null, seqNum: 2, startDate: daysFromNow(-65), endDate: daysFromNow( 25), durationHrs: 8640, children: [], tasks: [tasks[1], tasks[2]] },
    { id: "W-3", name: "Estructura · Edif. B",   parentId: null, seqNum: 3, startDate: daysFromNow(-15), endDate: daysFromNow( 80), durationHrs: 9120, children: [], tasks: [tasks[3], tasks[4]] },
    { id: "W-4", name: "Instalaciones",          parentId: null, seqNum: 4, startDate: daysFromNow( 60), endDate: daysFromNow(120), durationHrs: 4320, children: [], tasks: [tasks[5]] },
    { id: "W-5", name: "Terminaciones",          parentId: null, seqNum: 5, startDate: daysFromNow(110), endDate: daysFromNow(160), durationHrs: 3600, children: [], tasks: [tasks[6]] },
    { id: "W-6", name: "Entrega",                parentId: null, seqNum: 6, startDate: daysFromNow(160), endDate: daysFromNow(160), durationHrs:    0, children: [], tasks: [tasks[7]] },
  ];

  const primaryLabors = wbsNodes.map((w) => ({
    id: w.id,
    name: w.name,
    parentId: null,
    primaryWbsId: w.id,
    primaryWbsName: w.name,
    startDate: w.startDate,
    endDate: w.endDate,
    durationHrs: w.durationHrs,
    durationDays: Math.round(w.durationHrs / 12),
    taskCount: w.tasks.length,
    subTasks: w.tasks.map((t) => t.name),
    status: w.tasks[0]?.status || "TK_Pending",
    isMilestone: false,
  }));

  const scheduleData = {
    id: "PROY-001",
    name: "Edificio Solgram · Torre A+B",
    fileName: "solgram-torre-ab.xer",
    startDate: daysFromNow(-90),
    endDate: daysFromNow(160),
    calendarName: "14x14",
    stats: {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === "TK_Complete").length,
      active: tasks.filter((t) => t.status === "TK_Active").length,
      milestones: 1,
      wbsCount: wbsNodes.length,
      sumActualHrs: 9812,
      sumTotalHrs: 12480,
      sumPlannedHrs: 9600,
    },
    rootWbs: wbsNodes,
    tasks,
    primaryLabors,
    secondaryLabors: [],
  };

  api.put("config/schedule", { scheduleData });

  // ---- Shift config -------------------------------------------------
  api.put("config/shift", {
    anchorDate: daysFromNow(-7),
    anchorShift: "A",
    cycleDays: 14,
    hoursPerShift: 12,
  });

  // ---- Licenses -----------------------------------------------------
  api.put("config/licenses", {
    licenses: [
      {
        nombre: "Camila Toro",
        rut: "20.123.456-7",
        cargo: "Prevencionista",
        grupo: "A",
        desde: daysFromNow(-3),
        hasta: daysFromNow(7),
        dias: 10,
      },
    ],
  });

  // ---- Extra hours --------------------------------------------------
  api.put("config/extraHours", {
    extraHoursReports: [
      { id: "EH-1", date: daysFromNow(-2), workerName: "Carlos Pérez",     hours: 4 },
      { id: "EH-2", date: daysFromNow(-2), workerName: "Rodrigo González", hours: 3 },
      { id: "EH-3", date: daysFromNow(-1), workerName: "Marcela Soto",     hours: 2 },
    ],
  });

  // ---- Daily reports ------------------------------------------------
  const reports = [
    {
      id: "R-001",
      date: daysFromNow(0),
      sup: "Carlos Pérez",
      wbs: "Estructura · Edif. A",
      tipo: "Hormigonado losa nivel 3",
      detalle:
        "Hormigonado completo de losa N3 en sector poniente. Curado iniciado a las 17:30. Sin novedades de seguridad.",
      workers: ["Felipe Núñez", "Ana Riquelme", "Patricia Lagos"],
      workersDetail: [
        { name: "Felipe Núñez",  hours: 12 },
        { name: "Ana Riquelme",  hours: 12 },
        { name: "Patricia Lagos", hours: 10 },
      ],
      hours: 34,
      subLabors: [],
      p6Matched: true,
      source: "Manual",
      status: "listo",
      images: [],
      taskId: "T-03",
      updatedAt: todayISO(),
    },
    {
      id: "R-002",
      date: daysFromNow(0),
      sup: "Marcela Soto",
      wbs: "Estructura · Edif. A",
      tipo: "Instalación enfierradura pilares",
      detalle: "Avance 70%. Pendiente terminar P-12 y P-13 mañana.",
      workers: ["Carlos Pérez"],
      workersDetail: [{ name: "Carlos Pérez", hours: 12 }],
      hours: 12,
      subLabors: [],
      p6Matched: true,
      source: "Manual",
      status: "ejecucion",
      images: [],
      taskId: "T-03",
      updatedAt: todayISO(),
    },
    {
      id: "R-003",
      date: daysFromNow(-1),
      sup: "Rodrigo González",
      wbs: "Estructura · Edif. B",
      tipo: "Excavación zanja Nº 4",
      detalle: "Zanja terminada a profundidad de 1,80 m. Listo para enfierradura.",
      workers: ["Diego Henríquez", "Javier Rojas"],
      workersDetail: [
        { name: "Diego Henríquez", hours: 12 },
        { name: "Javier Rojas",    hours: 12 },
      ],
      hours: 24,
      subLabors: [],
      p6Matched: true,
      source: "Manual",
      status: "listo",
      images: [],
      taskId: "T-04",
      updatedAt: todayISO(),
    },
    {
      id: "R-004",
      date: daysFromNow(-1),
      sup: "Carlos Pérez",
      wbs: "Estructura · Edif. B",
      tipo: "Aseguramiento de losa",
      detalle: "Apuntalamiento completo en losa N2.",
      workers: ["Felipe Núñez", "Ana Riquelme"],
      workersDetail: [
        { name: "Felipe Núñez", hours: 8 },
        { name: "Ana Riquelme", hours: 8 },
      ],
      hours: 16,
      subLabors: [],
      p6Matched: false,
      source: "Manual",
      status: "listo",
      images: [],
      updatedAt: todayISO(),
    },
    {
      id: "R-005",
      date: daysFromNow(-2),
      sup: "Marcela Soto",
      wbs: "Estructura · Edif. B",
      tipo: "Encofrado pilares P-12",
      detalle: "En proceso. Faltan caras norte y este.",
      workers: ["Pedro Muñoz", "Tomás Fuentes"],
      workersDetail: [
        { name: "Pedro Muñoz",   hours: 12 },
        { name: "Tomás Fuentes", hours: 11 },
      ],
      hours: 23,
      subLabors: [],
      p6Matched: false,
      source: "Manual",
      status: "ejecucion",
      images: [],
      updatedAt: todayISO(),
    },
  ];
  reports.forEach((r) => {
    const { id, ...data } = r;
    api.put(`reports/${id}`, data);
  });

  // ---- Global timestamp ---------------------------------------------
  api.put("config/global", { updatedAt: todayISO() });

  // ---- Test connection (firebase.ts hace getDocFromServer aquí) ----
  api.put("test/connection", { ok: true });

  console.log(
    "%c[Solgram DEMO] Datos de ejemplo cargados",
    "background:#ffb703;color:black;padding:2px 6px;border-radius:3px;font-weight:bold"
  );
}
