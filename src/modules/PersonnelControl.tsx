import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../AppContext';
import { ProjectWorker, PersonnelData } from '../types';
import { cn, formatNumber, formatDate } from '../lib/utils';
import { Search, Plus, Calendar, Hospital, House, Briefcase, Trash2, Edit2, Download, UserPlus, Database, RefreshCw, PieChart as PieIcon, ArrowRightLeft, TrendingUp, X, Users, Clock, Upload } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { openGooglePicker } from '../lib/googlePicker';

export default function PersonnelControl() {
  const { state, updateState, saveWorker, saveWorkersBulk, deleteWorker, notify } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const allWorkers = state.workers || [];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const uniqueLicensesRender = useMemo(() => {
    const map = new Map<string, any>();
    
    // 1. Agregar licencias explícitas de la base de datos/excel licencias
    (state.licenses || []).forEach(l => {
      const k = `${String(l.rut || "").trim()}-${String(l.nombre || "").trim().toUpperCase()}`;
      map.set(k, l);
    });
    
    // 2. Agregar trabajadores detectados dinámicamente con estado 'Licencia'
    allWorkers.forEach(w => {
      if (w.estado === 'Licencia') {
        const k = `${String(w.rut || "").trim()}-${String(w.nombre || "").trim().toUpperCase()}`;
        if (!map.has(k)) {
          map.set(k, {
            nombre: w.nombre,
            rut: w.rut,
            cargo: w.cargo,
            grupo: w.grupo,
            desde: 'Detectado en Planilla',
            hasta: '-',
            dias: 0
          });
        }
      }
    });
    
    return Array.from(map.values()).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
  }, [state.licenses, allWorkers]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [cargoFilter, setCargoFilter] = useState<'Turno' | 'Descanso' | 'Todos'>('Todos');
  const [cargoDetails, setCargoDetails] = useState<{ title: string; workers: ProjectWorker[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Local state for the form
  const [formData, setFormData] = useState<Partial<ProjectWorker>>({
    nombre: '',
    rut: '',
    cargo: '',
    grupo: '',
    jornada: '',
    hh: 0,
    hhe: 0
  });

  // We need a persistent local list of workers
  // DEPRECATED - Now using state.workers from AppContext
  // const [allWorkers, setAllWorkers] = useState<Worker[]>(...);

  const calcEstado = React.useCallback((jornada: string, rut: string, grupo: string, estadoExcel?: string): 'Turno' | 'Descanso' | 'Licencia' | 'Sin Turno' => {
    const g = (grupo || '').toUpperCase().trim();
    const e = (estadoExcel || '').toUpperCase().trim();
    
    // 1. Detección de Licencias / Otros estados no-operativos (Prioridad)
    const licenseKeywords = ['LICENCIA', 'MEDICA', 'L.M', 'PERMISO', 'SUSPENDIDO', 'VACACION', 'REPOSO', 'LIC'];
    if (licenseKeywords.some(kw => g.includes(kw) || e.includes(kw))) {
      return 'Licencia';
    }

    // 2. Personal Sin Grupo (S/G) o (S/N) - Se separa de la lógica rotativa
    if (g === 'S/G' || g === 'S/N' || g === 'S' || g === 'SN' || g === 'SIN GRUPO' || g === '-' || g === '' || g.includes('SIN GRUPO')) {
      return 'Sin Turno';
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 3. Determinar Fecha de Inicio (Prioridad: Carta Gantt XER)
    let baseDate: Date;
    if (state.scheduleData?.startDate) {
      baseDate = new Date(state.scheduleData.startDate + 'T00:00:00');
    } else {
      baseDate = new Date(2024, 0, 1);
    }
    baseDate.setHours(0, 0, 0, 0);

    // 3. Obtener T y D ESTRICTAMENTE de la Carta Gantt (o fallback limpio)
    let t = 14;
    let d = 14;

    // REGLA PRINCIPAL: La jornada de la Carta Gantt es ABSOLUTA
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
    } else {
      // Solo en caso extremo usar la que viniera, pero ya no es la regla principal
      const parts = (jornada || '').toLowerCase().match(/(\d{1,2})\s*[xX]\s*(\d{1,2})/);
      if (parts) {
        t = parseInt(parts[1]);
        d = parseInt(parts[2]);
      }
    }

    const cycleTotal = t + d;

    // Si no hay rotación (ej: 5x2 o no tiene X), es personal de lunes a viernes o indefinido
    if (cycleTotal < 5) return 'Turno';

    // 4. Diferencia de días desde el inicio
    const manualOffset = (state.syncMeta as any)?.turnOffset || 0;
    let diffDays = Math.floor((today.getTime() - baseDate.getTime()) / 86400000);
    diffDays += manualOffset;

    // 6. Lógica de Grupos (Detección literal A/B/C/D)
    // Buscamos la pertenencia a los grupos principales
    const isA = /\b(A|1|UNO|PRIME|PRIMA)\b/i.test(g) || (g === 'A');
    const isB = /\b(B|2|DOS|CONTRA|SEGUN)\b/i.test(g) || (g === 'B');
    const isC = /\b(C|3|TRES|TERCE)\b/i.test(g) || (g === 'C');
    const isD = /\b(D|4|CUATRO|CUART)\b/i.test(g) || (g === 'D');

    // Mapeo a fase de trabajo (Heurística: A y C suelen ser la misma fase, B y D la contraria)
    // Pero respetamos la identidad del grupo para el nombre
    const finalA = isA;
    const finalB = isB;
    const finalC = isC;
    const finalD = isD;

    // 7. Si hay configuración global de ciclos (Prioridad sobre automática)
    if (state.shiftConfig) {
      const { anchorDate, anchorShift, cycleDays } = state.shiftConfig;
      if (anchorDate) {
        const anchor = new Date(anchorDate + 'T12:00:00');
        anchor.setHours(12, 0, 0, 0);
        
        const currentMidDay = new Date(today.getTime());
        currentMidDay.setHours(12, 0, 0, 0);
        
        let diffAnchor = Math.floor((currentMidDay.getTime() - anchor.getTime()) / 86400000);
        diffAnchor += manualOffset;
        
        const cycleTotalGlobal = cycleDays * 2;
        const posInGlobalCycle = ((diffAnchor % cycleTotalGlobal) + cycleTotalGlobal) % cycleTotalGlobal;
        const isAWorking = posInGlobalCycle < cycleDays; 

        // Lógica de coincidencia de turno activo
        // Si el usuario configuró el anclaje para el Grupo A:
        if (anchorShift === 'A') {
          if (finalA || finalC) return isAWorking ? 'Turno' : 'Descanso';
          if (finalB || finalD) return isAWorking ? 'Descanso' : 'Turno';
        } else {
          if (finalA || finalC) return isAWorking ? 'Descanso' : 'Turno';
          if (finalB || finalD) return isAWorking ? 'Turno' : 'Descanso';
        }
      }
    }

    // 8. Lógica Automática (Modulo cycleTotal)
    const positionInCycle = ((diffDays % cycleTotal) + cycleTotal) % cycleTotal;
    const isWorkingPeriod = positionInCycle < t;

    if (finalA || finalC) {
      return isWorkingPeriod ? 'Turno' : 'Descanso';
    }
    
    if (finalB || finalD) {
      // Contraturno perfecto (desfase de T días)
      const posOther = (((diffDays + t) % cycleTotal) + cycleTotal) % cycleTotal;
      return posOther < t ? 'Turno' : 'Descanso';
    }

    // Fallback: Si no es nada conocido pero tiene grupo, lo tratamos como Activo por defecto para no ocultarlo
    if (g && g !== 'S/N' && g !== 'S/G' && g !== 'S' && g !== 'SN') return isWorkingPeriod ? 'Turno' : 'Descanso';
    
    // Si no tiene grupo, es 'Sin Turno'
    return 'Sin Turno';
  }, [state.syncMeta, state.shiftConfig, state.scheduleData?.startDate]);

  // Global effect to persist workers to localStorage as a failsafe
  useEffect(() => {
    try {
      if (allWorkers && allWorkers.length > 0) {
        localStorage.setItem('solgram_all_workers', JSON.stringify(allWorkers));
      }
    } catch (e) {
      console.error("Error saving workers to localStorage:", e);
    }
  }, [allWorkers]);

  // Combined effect to sync workers when configuration changes (Automatic sync)
  useEffect(() => {
    const cycle = state.shiftConfig?.cycleDays || 14;
    const targetJornada = `${cycle}x${cycle}`;
    const hasGantt = !!state.scheduleData?.startDate;

    // setAllWorkers(current => {
    //   ...
    // });
  }, [state.scheduleData?.startDate, state.shiftConfig, (state.syncMeta as any).turnOffset, (state.syncMeta as any).rotationDays, calcEstado]);




  const saveWorkers = (list: ProjectWorker[]) => {
    saveWorkersBulk(list);
  };

  // Process data from file
  const extractDataFromRows = (data: any[], type: 'personnel' | 'license', currentWorkers: ProjectWorker[], currentLicenses: any[]) => {
    // Robust value-finding function that searches for exact or partial matches in normalized key names
    const findValueInNormRow = (normRow: any, possibleKeys: string[], regexFallback?: RegExp) => {
      // First try exact key matching in upper case sequence
      for (const key of possibleKeys) {
        if (normRow[key] !== undefined && normRow[key] !== null && String(normRow[key]).trim() !== "") {
          return normRow[key];
        }
      }
      // If none found, attempt regex/contains search on keys
      if (regexFallback) {
        const matchingKey = Object.keys(normRow).find(k => regexFallback.test(k));
        if (matchingKey && normRow[matchingKey] !== undefined && normRow[matchingKey] !== null && String(normRow[matchingKey]).trim() !== "") {
          return normRow[matchingKey];
        }
      }
      return null;
    };

    if (type === 'license') {
      const newLicenses = (data || []).map(l => {
        if (!l) return null;
        // Normalize license row for matching
        const normLicenseRow: any = {};
        Object.keys(l).forEach(k => {
          const cleanKey = k.trim().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^A-Z0-9 ]/g, "");
          normLicenseRow[cleanKey] = l[k];
        });

        const nombre = findValueInNormRow(normLicenseRow, ["NOMBRE", "NOMBRES", "NOMBRE COMPLETO", "NOMBRES Y APELLIDOS", "TRABAJADOR", "PERSONAL"], /NOMB|TRAB|PERS/i) || "-";
        const rut = findValueInNormRow(normLicenseRow, ["RUT", "ID", "CEDULA", "DNI", "DOCUMENTO", "IDENTIFICACION", "CEDULA IDENTIDAD", "RUN"], /RUT|ID|CED|DNI|DOC/i) || "-";
        const cargo = findValueInNormRow(normLicenseRow, ["CARGO", "FUNCION", "ROL", "ESPECIALIDAD", "PUESTO", "OFICIO"], /CARG|FUNC|ROL|ESP|PUES/i) || "-";
        const grupo = findValueInNormRow(normLicenseRow, ["GRUPO", "TURNO", "RELEVO", "SISTEMA"], /GRUP|TURN|REL|SIST/i) || "-";
        const desde = findValueInNormRow(normLicenseRow, ["DESDE", "INICIO", "FECHA INICIO", "F INICIO", "DESDE FECHA"], /DESD|INIC|FECH/i) || "-";
        const hasta = findValueInNormRow(normLicenseRow, ["HASTA", "FIN", "FECHA FIN", "F FIN", "HASTA FECHA", "TERMINO"], /HAST|FIN|TERM/i) || "-";
        const diasVal = findValueInNormRow(normLicenseRow, ["DIAS", "DIAS LLM", "TOTAL DIAS", "CANTIDAD DIAS"], /DIAS|CANT/i);
        const dias = parseFloat(diasVal || 0);

        return { nombre, rut, cargo, grupo, desde, hasta, dias };
      }).filter(l => l && l.nombre !== "-");
      
      const mergedLicenses = [...(currentLicenses || [])];
      newLicenses.forEach(nl => {
        if (!nl) return;
        const exists = mergedLicenses.findIndex(cl => {
          const cRut = String(cl?.rut || "").trim();
          const nRut = String(nl.rut || "").trim();
          const cNombre = String(cl?.nombre || "").trim().toUpperCase();
          const nNombre = String(nl.nombre || "").trim().toUpperCase();
          return (cRut !== '-' && cRut === nRut) || (cNombre !== '-' && cNombre === nNombre);
        });
        if (exists !== -1) mergedLicenses[exists] = nl;
        else mergedLicenses.push(nl);
      });
      return { workers: currentWorkers || [], licenses: mergedLicenses, nouveaux: 0, misajour: 0 };
    }

    let countNuevos = 0;
    let trabajadoresActualizados = 0;
    
    // 1. Crear un mapa de trabajadores para fusión (preservar los existentes)
    const newAndUpdatedMap = new Map<string, ProjectWorker>();
    (currentWorkers || []).forEach(w => {
      if (!w) return;
      const rutKey = String(w.rut || "").trim().toLowerCase();
      const nameKey = String(w.nombre || "").trim().toUpperCase();
      const key = (rutKey !== "-" && rutKey !== "" && rutKey !== "0") ? rutKey : nameKey;
      if (key) newAndUpdatedMap.set(key, w);
    });

    const existingMap = new Map<string, ProjectWorker>(newAndUpdatedMap);

    (data || []).forEach(row => {
      if (!row) return;
      const normRow: any = {};
      Object.keys(row).forEach(k => {
        const cleanKey = k.trim().toUpperCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^A-Z0-9 ]/g, "");
        normRow[cleanKey] = row[k];
      });

      let rutRaw = String(findValueInNormRow(normRow, ["RUT", "ID", "CEDULA", "DNI", "DOCUMENTO", "IDENTIFICACION", "CEDULA IDENTIDAD", "RUN"], /RUT|ID|CED|DNI|DOC/i) || "-").trim();
      let jornadaRaw = "";
      const excelJornada = (findValueInNormRow(normRow, ["JORNADA DE TRABAJO", "SISTEMA DE TURNO", "JORNADA", "ROSTER", "SISTEMA DE RELEVO", "TIPO TURNO", "SISTEMA", "CICLO"], /JORN|TUR|ROST|SIST|CICL/i) || "").toString();
      
      // Prioritize Gantt/Config but preserve Excel value if they are missing
      if (state.scheduleData?.calendarName) {
        const m = state.scheduleData.calendarName.match(/(\d{1,2})\s*[xX]\s*(\d{1,2})/i);
        if (m) {
          jornadaRaw = `${m[1]}x${m[2]}`;
        } else {
           const d = state.scheduleData.calendarName.match(/(\d{1,2})/);
           if (d) jornadaRaw = `${d[1]}x${d[1]}`;
        }
      } else if (state.shiftConfig?.cycleDays) {
        jornadaRaw = `${state.shiftConfig.cycleDays}x${state.shiftConfig.cycleDays}`;
      } else {
        jornadaRaw = excelJornada;
      }

      let cargoRaw = findValueInNormRow(normRow, ["CARGO", "FUNCION", "ROL", "ESPECIALIDAD", "PUESTO", "OFICIO", "OCUPACION", "ACTIVIDAD"], /CARG|FUNC|ROL|ESP|PUES|OFIC|OCUP/i) || "Sin Cargo";
      const estadoExcel = (findValueInNormRow(normRow, ["ESTADO", "STATUS", "SITUACION", "CONDICION"], /ESTA|STAT|SITU|COND/i) || "").toString();

      // Encontrar columnas de grupo/turno de forma dinámica
      let groupValue = (findValueInNormRow(normRow, ["TURNO", "GRUPO", "RELEVO", "SISTEMA", "COMPARTIMIENTO", "SISTEMA DE TURNO", "CUADRILLA", "EQUIPO", "FAENA", "LETRA"], /TURN|GRUP|REL|SIST|CUAD|EQUIP/i) || "S/G").toString().toUpperCase();
      let grupoRaw = groupValue;
      
      // Limpieza agresiva pero inteligente
      if (grupoRaw.includes("SIN GRUPO") || grupoRaw.includes("S/N") || grupoRaw === "S" || grupoRaw === "SN" || grupoRaw === "NO" || grupoRaw === "-" || !grupoRaw.trim()) {
        grupoRaw = "S/N";
      } else {
        // Si dice "TURNO A", "TURNOA" o "GRUPO C", nos quedamos con la letra principal
        const shiftMatch = grupoRaw.match(/(?:TURNO|GRUPO|SHIFT|RELEVO|SISTEMA|EQUIPO)\s*([A-Z0-9])\b/i) || 
                           grupoRaw.match(/\b([A-Z0-9])\b/i) ||
                           grupoRaw.match(/TURNO([A-Z0-9])$/i);

        if (shiftMatch) {
          grupoRaw = shiftMatch[1];
        }
      }
      
      let nombreRaw = (findValueInNormRow(normRow, ["NOMBRE", "NOMBRES", "NOMBRE COMPLETO", "NOMBRES Y APELLIDOS", "TRABAJADOR", "OPERARIO", "PERSONAL", "EMPLEADO"], /NOMB|TRAB|PE[R]S|EMPL|OPER/i) || "-").toString().trim();
      if (nombreRaw === "-" || !nombreRaw) return;

      const obj: ProjectWorker = {
        nombre: nombreRaw,
        rut: rutRaw,
        cargo: cargoRaw,
        grupo: grupoRaw,
        jornada: jornadaRaw,
        hh: parseFloat(findValueInNormRow(normRow, ["HH", "HH NORMALES", "HORAS", "HORAS DIA", "HH REGULARES"], /HH|HOR/i) || 0),
        hhe: parseFloat(findValueInNormRow(normRow, ["HH EXTRA", "HORAS EXTRAS", "HH EXTRAS", "EXTRAS", "HHE"], /EXTRA|HHE/i) || 0),
        estado: calcEstado(jornadaRaw, rutRaw, grupoRaw, estadoExcel)
      };

      // Detección Estricta de Duplicados para actualización
      const rutKey = rutRaw.toLowerCase();
      const nameKey = nombreRaw.toUpperCase();
      const lookupKey = (rutKey !== "-" && rutKey !== "" && rutKey !== "0") ? rutKey : nameKey;
      
      const existing = existingMap.get(lookupKey);

      if (existing) {
        // Actualizar datos existentes preservando ID
        const updatedObj = { ...obj, id: existing.id };
        newAndUpdatedMap.set(lookupKey, updatedObj);
        trabajadoresActualizados++;
      } else {
        // Nuevo trabajador
        newAndUpdatedMap.set(lookupKey, obj);
        countNuevos++;
      }
    });

    const finalWorkers = Array.from(newAndUpdatedMap.values());
    return { workers: finalWorkers, licenses: currentLicenses, nouveaux: countNuevos, misajour: trabajadoresActualizados };
  };

  // Handle global upload-turn event
  useEffect(() => {
    const handleGlobalUpload = (e: any) => {
      const files = e.detail?.files;
      if (files) {
        handleFiles(files);
      }
    };
    window.addEventListener('upload-turn', handleGlobalUpload);
    return () => window.removeEventListener('upload-turn', handleGlobalUpload);
  }, [allWorkers, state.licenses, updateState]);

  const handleFiles = async (files: File[]) => {
    try {
      let tempWorkers = [...allWorkers];
      let tempLicenses = [...(state.licenses || [])];
      let showSummary = false;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase();
        
        try {
          if (ext === 'csv') {
            const text = await file.text();
            const res = Papa.parse(text, { header: true, skipEmptyLines: true });
            const result = extractDataFromRows(res.data, 'personnel', tempWorkers, tempLicenses);
            tempWorkers = result.workers;
            tempLicenses = result.licenses;
            showSummary = true;
          } else {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(new Uint8Array(buffer), { 
              type: 'array',
              cellDates: true,
              cellNF: false,
              cellText: false
            });
            
            workbook.SheetNames.forEach(sheetName => {
              const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
              const isLicense = sheetName.toUpperCase().includes("LICENCIA");
              const result = extractDataFromRows(data as any[], isLicense ? 'license' : 'personnel', tempWorkers, tempLicenses);
              tempWorkers = result.workers;
              tempLicenses = result.licenses;
              showSummary = true;
            });
          }
        } catch (fileError: any) {
          console.error("Error al procesar el archivo: " + file.name, fileError);
          notify('error', `Error al procesar "${file.name}": ` + (fileError.message || fileError));
        }
      }

      if (showSummary) {
        await saveWorkersBulk(tempWorkers);
        updateState({ licenses: tempLicenses });
        notify('success', 'Sincronización Completa! Se han procesado todos los turnos y licencias detectados.');
      }
    } catch (globalError: any) {
      console.error("Error global en carga de archivos:", globalError);
      notify('error', 'Error general al cargar personal: ' + (globalError.message || globalError));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      await handleFiles(files);
    } catch (err: any) {
      notify('error', 'Error al procesar la selección de archivos: ' + (err.message || err));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLoadFromGoogleDrive = async () => {
    try {
      await openGooglePicker({
        mimeTypeFilter: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
          "application/vnd.ms-excel",
          "text/csv"
        ],
        onPicked: async (file, blob) => {
          const customFile = new File([blob], file.name, { type: blob.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          await handleFiles([customFile]);
        },
        notify: (type, msg) => notify(type === 'warning' ? 'info' : type, msg)
      });
    } catch (err: any) {
      console.error(err);
      notify('error', 'Error al cargar personal desde Google Drive: ' + err.message);
    }
  };

  useEffect(() => {
    const handleGlobalPicker = () => {
      handleLoadFromGoogleDrive();
    };
    window.addEventListener('load-personnel-drive', handleGlobalPicker);
    return () => window.removeEventListener('load-personnel-drive', handleGlobalPicker);
  }, [allWorkers, state.licenses, updateState]);

  const handleSave = async () => {
    const worker: ProjectWorker = {
      ...formData as any,
      estado: calcEstado(formData.jornada || '', formData.rut || '', formData.grupo || '')
    };

    if (editingWorkerId) {
      await saveWorker(worker, editingWorkerId);
    } else {
      await saveWorker(worker);
    }
    
    setIsModalOpen(false);
    setEditingWorkerId(null);
    setFormData({ nombre: '', rut: '', cargo: '', grupo: '', jornada: '', hh: 0, hhe: 0 });
  };

  const handleSyncGanttShift = () => {
    if (!state.scheduleData?.calendarName) {
      notify('error', 'No hay información de Carta Gantt cargada para sincronizar.');
      return;
    }

    let detectedJornada = "";
    const m = state.scheduleData.calendarName.match(/(\d{1,2})\s*[xX]\s*(\d{1,2})/i);
    if (m) {
      detectedJornada = `${m[1]}x${m[2]}`;
    } else {
       const d = state.scheduleData.calendarName.match(/(\d{1,2})/);
       if (d) detectedJornada = `${d[1]}x${d[1]}`;
    }

    if (!detectedJornada) {
      notify('error', 'No se detectó un patrón de jornada (ej: 7x7) en el calendario de la Gantt.');
      return;
    }

    const updated = allWorkers.map(w => ({
      ...w,
      jornada: detectedJornada,
      estado: calcEstado(detectedJornada, w.rut || '', w.grupo || '')
    }));

    saveWorkersBulk(updated);
    notify('success', `Sincronización Exitosa: Se aplicó jornada ${detectedJornada} a todo el personal detectado.`);
  };

  const handleToggleShiftPhase = () => {
    const currentOffset = (state.syncMeta as any)?.turnOffset || 0;
    // Si es 7x7, offset de 7 días invierte el turno. Si es 14x14, offset de 14.
    // Usamos el ciclo configurado o 14 por defecto.
    const cycle = state.shiftConfig?.cycleDays || 7;
    const newOffset = currentOffset === 0 ? cycle : 0;
    
    updateState({
      syncMeta: {
        ...(state.syncMeta || {}),
        turnOffset: newOffset
      }
    });
    notify('success', `Ciclo invertido: Se aplicó un desfase de ${newOffset} días.`);
  };

  const filteredWorkers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    
    // 1. Deduplicar lista actual (evitar duplicados visuales por RUT o Nombre)
    const uniqueMap = new Map<string, ProjectWorker>();
    allWorkers.forEach(w => {
      const rutKey = String(w.rut || "").trim().toLowerCase();
      const nameKey = String(w.nombre || "").trim().toUpperCase();
      
      const workerKey = (rutKey !== "-" && rutKey !== "" && rutKey !== "0") ? `r_${rutKey}` : `n_${nameKey}`;
      
      if (!uniqueMap.has(workerKey)) {
        uniqueMap.set(workerKey, w);
      }
    });

    const uniqueList = Array.from(uniqueMap.values());

    // Detectar Jornada Absoluta de Gantt
    let absoluteJornada = "";
    if (state.scheduleData?.calendarName) {
      const m = state.scheduleData.calendarName.match(/(\d{1,2})\s*[xX]\s*(\d{1,2})/i);
      if (m) {
        absoluteJornada = `${m[1]}x${m[2]}`;
      } else {
         const d = state.scheduleData.calendarName.match(/(\d{1,2})/);
         if (d) absoluteJornada = `${d[1]}x${d[1]}`;
      }
    } else if (state.shiftConfig?.cycleDays) {
       absoluteJornada = `${state.shiftConfig.cycleDays}x${state.shiftConfig.cycleDays}`;
    }

    // 2. Re-calcular estado dinámicamente si hay información de jornada
    const dynamicList = uniqueList.map(w => {
      // Aplicar Jornada Absoluta de Gantt, o si no hay Gantt y la base de datos está vacía: "14x14 (Req. Gantt)"
      const currentJornada = absoluteJornada || (w.jornada ? w.jornada : 'S/Gantt');

      // Si el estado es Licencia o Sin Turno, lo respetamos (son estados manuales o detectados por keyword)
      if (w.estado === 'Licencia' || w.estado === 'Sin Turno') {
         return { ...w, jornada: currentJornada };
      }
      
      // Para estados operativos, recalculamos según la fecha de hoy usando la lógica dura de Gantt
      const currentEstado = calcEstado(currentJornada, w.rut || '', w.grupo || '');
      return { ...w, jornada: currentJornada, estado: currentEstado };
    });

    // 3. Ordenar Alfabéticamente por Nombre
    const sorted = dynamicList.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

    // 3. Filtrar por búsqueda
    if (!query) return sorted;
    
    return sorted.filter(w => 
      String(w.nombre || '').toLowerCase().includes(query) || 
      String(w.rut || '').toLowerCase().includes(query) ||
      String(w.cargo || '').toLowerCase().includes(query) ||
      String(w.grupo || '').toLowerCase().includes(query) ||
      String(w.jornada || '').toLowerCase().includes(query) ||
      String(w.estado || '').toLowerCase().includes(query)
    );
  }, [allWorkers, searchQuery, state.scheduleData?.calendarName, state.shiftConfig?.cycleDays, calcEstado]);

  const shiftStats = useMemo(() => {
    if (!state.shiftConfig) return null;
    
    const reports = state.dailyReports;
    const { anchorDate, cycleDays } = state.shiftConfig;
    const anchor = new Date(anchorDate + 'T12:00:00');
    
    // Calculate stats for the last 2 cycles (approx 1 month)
    const now = new Date();
    const currentDiff = Math.floor((now.getTime() - anchor.getTime()) / 86400000);
    const cycleIndex = Math.floor(currentDiff / (cycleDays * 2));
    
    const getShiftForDate = (dateStr: string) => {
      const d = new Date(dateStr + 'T12:00:00');
      const diff = Math.floor((d.getTime() - anchor.getTime()) / 86400000);
      const cycleTotal = cycleDays * 2;
      const pos = ((diff % cycleTotal) + cycleTotal) % cycleTotal;
      const isActiveA = pos < cycleDays;
      return state.shiftConfig?.anchorShift === 'A' ? (isActiveA ? 'A' : 'B') : (isActiveA ? 'B' : 'A');
    };

    const statsA = { hh: 0, count: 0 };
    const statsB = { hh: 0, count: 0 };

    reports.forEach(r => {
      const shift = getShiftForDate(r.date);
      if (shift === 'A') { statsA.hh += r.hours; statsA.count++; }
      else { statsB.hh += r.hours; statsB.count++; }
    });

    return { statsA, statsB };
  }, [state.dailyReports, state.shiftConfig]);

  const workersWithTurn = filteredWorkers.filter(w => w.estado === 'Turno' || w.estado === 'Descanso' || w.estado === 'Licencia');
  const workersWithoutTurn = filteredWorkers.filter(w => w.estado === 'Sin Turno');

  const stats = useMemo(() => {
    const total = filteredWorkers.length;
    const enTurno = filteredWorkers.filter(w => w.estado === 'Turno').length;
    const descanso = filteredWorkers.filter(w => w.estado === 'Descanso').length;
    const licencia = filteredWorkers.filter(w => w.estado === 'Licencia').length;
    const sinGrupo = filteredWorkers.filter(w => w.estado === 'Sin Turno').length;
    
    // Sum hours from reports
    const totalHH = Object.values(state.workerHoursAggregate).reduce((acc: number, h: number) => acc + h, 0);
    const totalExtras = Object.values(state.workerExtraHoursAggregate || {}).reduce((acc: number, h: number) => acc + h, 0);
    
    return { total, enTurno, descanso, licencia, sinGrupo, totalHH, totalExtras };
  }, [filteredWorkers, state.workerHoursAggregate, state.workerExtraHoursAggregate]);

  const groupDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    filteredWorkers.forEach(w => {
      let g = (w.grupo || 'S/N').toUpperCase().trim();
      if (g === 'S' || g === 'SN' || g === 'S/G' || g === '' || g === '-') g = 'S/N';
      dist[g] = (dist[g] || 0) + 1;
    });
    return Object.entries(dist).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredWorkers]);

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

    // Priority 1: Global shift rotation config
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
      // Priority 2: Auto rotation modulo calculation based on start date
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

    // Attempt to verify with actual personnel in the database to override with real loaded group signatures
    const activeRealGroups = new Set<string>();
    const restingRealGroups = new Set<string>();
    filteredWorkers.forEach(w => {
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

    // Ensure we don't display 0 days on transition moment
    const finalDaysRemaining = Math.max(1, daysRemaining);

    return {
      daysRemaining: finalDaysRemaining,
      workingGroups: currentShiftWorkingGroups.join(', ') || 'A/C',
      restingGroups: currentShiftRestingGroups.join(', ') || 'B/D'
    };
  }, [filteredWorkers, state.shiftConfig, state.scheduleData, state.syncMeta]);

  const normalizeCargo = (cargo: string) => {
    let raw = (cargo || 'Sin Cargo').toString().trim().toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents

    // Reemplazos comunes para unificar cargos
    raw = raw.replace(/\bDE\b/g, "").replace(/\s+/g, " ").trim();
    
    if (raw.includes("BODEGUER")) return "BODEGUERO";
    if (raw.includes("SUPERVISOR") && raw.includes("OBRA")) return "SUPERVISOR DE OBRAS";
    if (raw.includes("CONDUCTOR")) return "CONDUCTOR";
    if (raw.includes("OPERADOR")) return "OPERADOR";
    if (raw.includes("MAESTRO MAYOR") && raw.includes("CIVIL")) return "MAESTRO MAYOR OBRAS CIVILES";
    if (raw.includes("MAESTRO PRIMERA") && raw.includes("CIVIL")) return "MAESTRO PRIMERA OBRAS CIVILES";
    if (raw.includes("MAESTRO SEGUNDA") && raw.includes("CIVIL")) return "MAESTRO SEGUNDA OBRAS CIVILES";
    if (raw === "MAESTRO MAYOR OBRAS CIVILES" || raw === "MAESTRO MAYOR OBRA CIVIL") return "MAESTRO MAYOR OBRAS CIVILES";

    return raw;
  };

  const cargoCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredWorkers.forEach(w => {
      if (cargoFilter === 'Todos' || w.estado === cargoFilter) {
        const c = normalizeCargo(w.cargo);
        counts[c] = (counts[c] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filteredWorkers, cargoFilter]);

  return (
    <div className="p-8 w-full space-y-8 px-4 md:px-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight mb-2 uppercase">Consola Operativa</h2>
          <p className="text-sm text-gray-500 font-medium">Gestión y control de dotación general activa</p>
        </div>
        <div className="flex flex-wrap gap-4 w-full md:w-auto">
           <div className="relative flex-1 md:flex-none md:w-96" ref={dropdownRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por nombre, RUT, cargo, grupo o turno..."
                value={searchQuery}
                onFocus={() => setShowSearchDropdown(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchDropdown(true);
                }}
                className={cn(
                  "pl-10 pr-4 py-2.5 rounded-xl text-sm w-full border focus:outline-none focus:ring-2 shadow-sm transition-all",
                  state.theme === 'dark' ? "bg-[#0d1117] border-[#30363d] focus:ring-blue-500/50" : "bg-white border-gray-200 focus:ring-blue-500/20"
                )}
              />

              {showSearchDropdown && searchQuery.trim() !== '' && (
                <div className={cn(
                  "absolute top-full left-0 right-0 mt-2 rounded-xl border shadow-2xl z-[70] overflow-hidden max-h-96 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200",
                  state.theme === 'dark' ? "bg-[#1a1d24] border-[#30363d] shadow-black/50" : "bg-white border-gray-200 shadow-gray-300"
                )}>
                  {filteredWorkers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-500 font-medium italic">
                      No se encontraron coincidencias inmediatas
                    </div>
                  ) : (
                    <div className="divide-y divide-[#30363d]/10">
                      {filteredWorkers.slice(0, 10).map((w, i) => (
                        <div 
                          key={i}
                          onClick={() => {
                            setShowSearchDropdown(false);
                            // Highlight or Detail trigger? Let's open the worker details modal for now if clicked
                            setEditingWorkerId(String(w.id));
                            setFormData(w);
                            setIsModalOpen(true);
                          }}
                          className={cn(
                            "p-3 flex items-center justify-between cursor-pointer transition-colors",
                            state.theme === 'dark' ? "hover:bg-white/5" : "hover:bg-blue-50"
                          )}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-black uppercase tracking-tight">{w.nombre}</span>
                            <span className="text-[10px] text-gray-500 font-medium">
                              {w.cargo} • <span className="font-mono">{w.rut}</span>
                            </span>
                          </div>
                          <div className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-black uppercase border",
                            w.estado === 'Turno' 
                              ? "bg-green-500/10 text-green-500 border-green-500/20" 
                              : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                          )}>
                            {w.estado}
                          </div>
                        </div>
                      ))}
                      {filteredWorkers.length > 10 && (
                        <div className="p-2 text-center text-[9px] font-black uppercase text-gray-400 bg-black/5">
                          Mostrando 10 de {filteredWorkers.length} resultados
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
           </div>
           
           <input 
            id="personnel-excel-upload"
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload}
            className="hidden" 
            accept=".xlsx,.xls,.csv" 
            multiple 
           />


           <button 
            onClick={handleSyncGanttShift}
            title="Sincroniza la jornada de todo el personal con la detectada en la Carta Gantt"
            className={cn(
               "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all border shadow-lg",
               state.theme === 'dark' 
                 ? "bg-purple-600 text-white border-purple-700 hover:bg-purple-500 shadow-purple-900/20" 
                 : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 shadow-purple-600/5"
            )}
           >
            <RefreshCw size={14} />
            SINCRONIZAR GANTT
           </button>

           <button 
            onClick={() => fileInputRef.current?.click()}
            className={cn(
               "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all border shadow-lg cursor-pointer",
               state.theme === 'dark' 
                 ? "bg-blue-600 text-white border-blue-700 hover:bg-blue-500 shadow-blue-900/20" 
                 : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-blue-600/5"
            )}
            title="Cargar planilla excel o csv de personal desde tu computador local"
           >
            <Upload size={14} />
            <span>CARGAR EXCEL</span>
           </button>

           <button 
            onClick={() => { setEditingIndex(null); setIsModalOpen(true); }}
            className={cn(
               "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all min-w-[130px] justify-center border shadow-lg",
               state.theme === 'dark' 
                 ? "bg-[#1f2937] text-white border-gray-600 hover:bg-gray-700 shadow-gray-950/35" 
                 : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 shadow-md"
            )}
           >
            <UserPlus size={14} />
            AGREGAR
            </button>
        </div>
      </div>

      <div className={cn(
        "p-6 rounded-2xl border-t-4 shadow-xl",
        state.theme === 'dark' ? "bg-[#1a1d24] border-blue-500 border-x border-b border-x-[#30363d] border-b-[#30363d]" : "bg-white border-blue-500 border-x border-b border-gray-100 shadow-gray-200"
      )}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <div 
            onClick={() => setCargoDetails({
              title: 'Dotación Total del Proyecto',
              workers: filteredWorkers
            })}
            className="flex flex-col items-center justify-between p-4 min-h-[145px] rounded-xl border border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-white/5 cursor-pointer hover:scale-105 transition-all shadow-sm"
          >
            <div className="flex flex-col items-center w-full">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center font-sans">Total Proyecto</span>
              <div className="text-4xl font-black mt-2 font-mono">{stats.total}</div>
            </div>
            <div className="w-full mt-3 pt-2 border-t border-gray-200 dark:border-white/5 flex flex-col items-center text-center">
              <span className="text-[9px] text-gray-400 font-extrabold tracking-wider uppercase">
                DOTACIÓN REGISTRADA
              </span>
            </div>
          </div>

          <div 
            onClick={() => setCargoDetails({
              title: 'Personal en Turno Activo',
              workers: filteredWorkers.filter(w => w.estado === 'Turno')
            })}
            className="flex flex-col items-center justify-between p-4 min-h-[145px] rounded-xl bg-green-500/5 border border-green-500/20 cursor-pointer hover:bg-green-500/10 transition-all hover:scale-105"
          >
            <div className="flex flex-col items-center w-full">
              <div className="flex items-center gap-1.5 justify-center mb-1">
                <Briefcase className="text-green-500" size={16} />
                <span className="text-[10px] font-bold text-green-500/70 uppercase tracking-wider text-center font-sans">EN TURNO</span>
              </div>
              <div className="text-3xl font-black text-green-600 font-mono mt-2">{stats.enTurno}</div>
            </div>
            
            <div className="w-full mt-3 pt-2 border-t border-green-500/10 flex flex-col items-center text-center">
              <span className="text-[10px] font-black text-green-500 bg-green-500/10 px-2 py-0.5 rounded tracking-wider uppercase font-sans">
                GRUPO {shiftRotationInfo.workingGroups}
              </span>
              <span className="text-[9px] text-gray-400 font-bold mt-1 uppercase font-sans">
                CAMBIO EN {shiftRotationInfo.daysRemaining} {shiftRotationInfo.daysRemaining === 1 ? 'DÍA' : 'DÍAS'}
              </span>
            </div>
          </div>

          {/* SIN GRUPO EN MEDIO - ESPACIO ASIGNADO Y RESALTADO */}
          <div 
            onClick={() => setCargoDetails({
              title: 'Personal Sin Turno (S/N) - Disponible',
              workers: filteredWorkers.filter(w => w.estado === 'Sin Turno')
            })}
            className="flex flex-col items-center justify-between p-4 min-h-[145px] rounded-xl bg-blue-500/10 border-2 border-blue-500/50 cursor-pointer hover:bg-blue-500/20 transition-all transform hover:scale-105 shadow-xl relative z-10"
          >
            <div className="flex flex-col items-center w-full">
              <div className="flex items-center gap-1.5 justify-center mb-1">
                <Users className="text-blue-600" size={16} />
                <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider text-center font-sans">S/N - SIN TURNO</span>
              </div>
              <div className="text-3xl font-black text-blue-900 dark:text-blue-200 tracking-tighter mt-2 font-mono">{stats.sinGrupo}</div>
            </div>
            <div className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500"></span>
            </div>
            <div className="w-full mt-3 pt-2 border-t border-blue-500/10 flex flex-col items-center text-center">
              <span className="text-[9px] font-extrabold text-blue-500 uppercase tracking-wider font-sans">DISPONIBLES</span>
            </div>
          </div>

          <div 
            onClick={() => setCargoDetails({
              title: 'Personal en Descanso / Salida',
              workers: filteredWorkers.filter(w => w.estado === 'Descanso')
            })}
            className="flex flex-col items-center justify-between p-4 min-h-[145px] rounded-xl bg-orange-500/5 border border-orange-500/20 cursor-pointer hover:bg-orange-500/10 transition-all hover:scale-105"
          >
            <div className="flex flex-col items-center w-full">
              <div className="relative flex justify-center items-center gap-1.5 w-full mb-1">
                <House className="text-orange-500" size={16} />
                <span className="text-[10px] font-bold text-orange-500/70 uppercase tracking-wider text-center font-sans">EN DESCANSO</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleToggleShiftPhase(); }}
                  className="absolute right-0 p-1 bg-orange-500 rounded-full text-white shadow hover:scale-110 active:scale-95 transition-all"
                  title="Invertir fase del ciclo (Si el grupo en descanso es el que debería estar en turno)"
                >
                  <ArrowRightLeft size={8} />
                </button>
              </div>
              <div className="text-3xl font-black text-orange-600 font-mono mt-2">{stats.descanso}</div>
            </div>

            <div className="w-full mt-3 pt-2 border-t border-orange-500/10 flex flex-col items-center text-center font-sans">
              <span className="text-[10px] font-black text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded tracking-wider uppercase">
                GRUPO {shiftRotationInfo.restingGroups}
              </span>
              <span className="text-[9px] text-gray-400 font-bold mt-1 uppercase">
                RETORNO EN {shiftRotationInfo.daysRemaining} {shiftRotationInfo.daysRemaining === 1 ? 'DÍA' : 'DÍAS'}
              </span>
            </div>
          </div>

          <div 
            onClick={() => setCargoDetails({
              title: 'Personal con Licencia / Permiso',
              workers: filteredWorkers.filter(w => w.estado === 'Licencia')
            })}
            className="flex flex-col items-center justify-between p-4 min-h-[145px] rounded-xl bg-purple-500/5 border border-purple-500/10 cursor-pointer hover:bg-purple-500/10 transition-all hover:scale-105"
          >
            <div className="flex flex-col items-center w-full">
              <div className="flex items-center gap-1.5 justify-center mb-1">
                <Hospital className="text-purple-500" size={16} />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center font-sans">LICENCIAS</span>
              </div>
              <div className="text-3xl font-black text-purple-600 font-mono mt-2">{stats.licencia}</div>
            </div>
            <div className="w-full mt-3 pt-2 border-t border-purple-500/10 flex flex-col items-center text-center">
              <span className="text-[9px] text-purple-500/70 font-extrabold tracking-wider uppercase font-sans">
                BAJAS TEMPORALES
              </span>
            </div>
          </div>
        </div>

                    <div className="flex flex-col gap-3 mt-6 pt-6 border-t border-gray-100 dark:border-[#30363d]/30">
             <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Horas Acumuladas Proyecto</div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-purple-500/5 border border-purple-500/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/20 text-purple-600"><Database size={16}/></div>
                    <span className="text-xs font-bold text-gray-500 uppercase">HH Reportadas (Total)</span>
                  </div>
                  <span className="text-2xl font-mono font-black text-purple-600">{formatNumber(stats.totalHH + stats.totalExtras)}</span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/20 text-amber-600"><TrendingUp size={16}/></div>
                    <span className="text-xs font-bold text-gray-500 uppercase">Solo Horas Extras</span>
                  </div>
                  <span className="text-2xl font-mono font-black text-amber-600">{formatNumber(stats.totalExtras)}</span>
                </div>
             </div>
        </div>


        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-[#30363d]/30">
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 pl-1">Distribución Detectada por Grupo / Turno</div>
          <div className="flex flex-wrap gap-3">
             {groupDistribution.map(([grp, count]) => (
               <div 
                 key={grp}
                 onClick={() => setCargoDetails({
                   title: `Detalle del Grupo: ${grp}`,
                   workers: filteredWorkers.filter(w => {
                     let wg = (w.grupo || 'S/N').toUpperCase().trim();
                     if (wg === 'S' || wg === 'SN' || wg === 'S/G' || wg === '' || wg === '-') wg = 'S/N';
                     return wg === grp;
                   })
                 })}
                 className={cn(
                   "flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all hover:scale-105 cursor-pointer shadow-sm",
                   (grp === 'S/N' || grp === 'S/G')
                     ? (state.theme === 'dark' ? "bg-blue-600/20 border-blue-500/50 text-blue-400 shadow-blue-500/10" : "bg-blue-100 border-blue-200 text-blue-800")
                     : (state.theme === 'dark' ? "bg-white/5 border-white/10 text-gray-400" : "bg-white border-gray-100 text-gray-600")
                 )}
               >
                 <div className={cn(
                   "w-2 h-2 rounded-full",
                   (grp === 'S/N' || grp === 'S/G') ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-green-500"
                 )} />
                 <div className="flex flex-col">
                   <span className="text-[10px] font-black uppercase opacity-60 leading-none mb-1">Turno {grp}</span>
                   <span className="text-lg font-black leading-none">{count} <span className="text-[10px] font-medium opacity-70">Pers.</span></span>
                 </div>
               </div>
             ))}
          </div>
        </div>
      </div>



      <div className="grid grid-cols-1 gap-8">
        <div className={cn(
          "p-6 rounded-2xl border shadow-xl flex flex-col gap-4",
          state.theme === 'dark' ? "bg-[#1a1d24] border-[#30363d]" : "bg-white border-gray-200"
        )}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 border-[#30363d]/50 gap-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">Desglose por Puesto / Función</h3>
              <p className="text-xs text-gray-500 mt-1">Conteo de personal activo agrupado por especialidad</p>
            </div>
            <div className={cn(
              "flex p-1 rounded-lg border shadow-inner",
              state.theme === 'dark' ? "bg-black/20 border-white/5" : "bg-gray-100 border-gray-200"
            )}>
              <button
                onClick={() => setCargoFilter('Turno')}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold uppercase rounded-md transition-all",
                  cargoFilter === 'Turno' ? "bg-green-500 text-white shadow-lg" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                En Turno
              </button>
              <button
                onClick={() => setCargoFilter('Descanso')}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold uppercase rounded-md transition-all",
                  cargoFilter === 'Descanso' ? "bg-orange-500 text-white shadow-lg" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                En Descanso
              </button>
              <button
                onClick={() => setCargoFilter('Todos')}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold uppercase rounded-md transition-all",
                  cargoFilter === 'Todos' ? "bg-blue-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                Todos
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
            {cargoCounts.length === 0 ? (
              <div className="col-span-full py-8 text-center text-sm text-gray-500 italic">No hay registros para este estado.</div>
            ) : (
              cargoCounts.map(([cargo, count]) => (
                <div 
                  key={cargo} 
                  onClick={() => setCargoDetails({
                    title: `${cargo} (${cargoFilter === 'Todos' ? 'Toda la Dotación' : cargoFilter})`,
                    workers: filteredWorkers.filter(w => (cargoFilter === 'Todos' || w.estado === cargoFilter) && normalizeCargo(w.cargo) === cargo)
                  })}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-center relative overflow-hidden cursor-pointer transition-all hover:scale-105 group",
                    state.theme === 'dark' ? "bg-[#1f242c] border-[#30363d] hover:border-blue-500/50" : "bg-gray-50 border-gray-200 hover:border-blue-500/30 shadow-sm"
                  )}
                >
                  <div className={cn(
                    "absolute inset-x-0 bottom-0 h-1 transition-all group-hover:h-2",
                    cargoFilter === 'Todos' ? "bg-blue-500" : 
                    cargoFilter === 'Turno' ? "bg-green-500" : "bg-orange-500"
                  )} />
                  <span className={cn(
                    "text-3xl font-black mb-1 relative z-10 antialiased",
                    cargoFilter === 'Todos' ? "text-blue-500" :
                    cargoFilter === 'Turno' ? "text-green-500" : "text-orange-500"
                  )}>{count}</span>
                  <span className={cn(
                    "text-[10px] font-black uppercase leading-tight line-clamp-2 relative z-10 px-2 min-h-[24px] flex items-center justify-center transition-colors",
                    state.theme === 'dark' ? "text-gray-300 group-hover:text-white" : "text-gray-600 group-hover:text-blue-600"
                  )}>{cargo}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {workersWithoutTurn.length > 0 && (
        <div className={cn(
          "rounded-2xl border overflow-hidden shadow-xl mb-8",
          state.theme === 'dark' ? "bg-blue-900/10 border-blue-500/30" : "bg-blue-50 border-blue-200"
        )}>
          <div className={cn(
            "px-6 py-4 border-b flex justify-between items-center",
            state.theme === 'dark' ? "bg-blue-900/20 border-blue-500/20" : "bg-blue-100/50 border-blue-200"
          )}>
            <div className="flex items-center gap-3">
              <Users className="text-blue-500" size={20} />
              <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                Personal Sin Grupo Asignado (S/N - Disponibles)
              </h3>
            </div>
            <span className="px-3 py-1 rounded-full bg-blue-500 text-white text-[10px] font-black uppercase shadow-lg">
              {workersWithoutTurn.length} Personas
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={cn(
                  "uppercase text-[10px] font-black tracking-wider",
                  state.theme === 'dark' ? "bg-black/20 text-gray-400" : "bg-white/50 text-gray-500"
                )}>
                  <th className="px-6 py-4">Nombre</th>
                  <th className="px-6 py-4">Cargo</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-500/10">
                {workersWithoutTurn.map((worker, idx) => (
                  <tr key={idx} className={cn(
                    "transition-colors",
                    state.theme === 'dark' ? "hover:bg-blue-500/5" : "hover:bg-blue-100/30"
                  )}>
                    <td className="px-6 py-4 font-bold text-blue-900 dark:text-blue-100">{worker.nombre}</td>
                    <td className="px-6 py-4 text-sm opacity-70">{worker.cargo}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => {
                            setEditingWorkerId(String(worker.id));
                            setFormData(worker);
                            setIsModalOpen(true);
                          }}
                          className="p-2 hover:bg-blue-500/20 rounded-lg text-blue-500 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={cn(
        "rounded-2xl border overflow-hidden shadow-xl",
        state.theme === 'dark' ? "bg-[#1a1d24] border-[#30363d]" : "bg-white border-gray-200"
      )}>
        <div className={cn(
          "px-6 py-4 border-b flex justify-between items-center",
          state.theme === 'dark' ? "bg-[#1f242c] border-[#30363d]" : "bg-blue-50/50 border-gray-100"
        )}>
          <h3 className="text-sm font-black uppercase tracking-widest opacity-70 italic">Listado General de Dotación (Turno, Descanso, Licencias y Otros)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={cn(
                "uppercase text-[10px] font-black tracking-wider",
                state.theme === 'dark' ? "bg-[#1f242c] text-gray-500" : "bg-gray-50 text-gray-400"
              )}>
                <th className="px-6 py-4">Nombre Completo</th>
                <th className="px-6 py-4">RUT</th>
                <th className="px-6 py-4">Cargo / Función</th>
                <th className="px-6 py-4">Grupo</th>
                <th className="px-6 py-4">Jornada</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-center">HH Total</th>
                <th className="px-6 py-4 text-center">HH Extra</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className={cn(
              "divide-y",
              state.theme === 'dark' ? "divide-[#30363d]/30" : "divide-gray-100"
            )}>
              {workersWithTurn.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500 font-medium italic">
                    No se encontraron registros en el personal operativo.
                  </td>
                </tr>
              ) : (
                workersWithTurn.map((worker, idx) => (
                  <tr key={idx} className={cn(
                    "transition-colors group",
                    state.theme === 'dark' ? "hover:bg-white/5" : "hover:bg-gray-50",
                    (worker.estado === 'Descanso' || worker.estado === 'Sin Turno') && "opacity-80 grayscale-[0.2]",
                    worker.estado === 'Licencia' && "bg-purple-500/5"
                  )}>
                    <td className={cn(
                      "px-6 py-4 font-bold flex items-center gap-3",
                      state.theme === 'dark' ? "text-white" : "text-gray-900"
                    )}>
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        worker.estado === 'Turno' ? "bg-green-500 animate-pulse" : 
                        worker.estado === 'Descanso' ? "bg-orange-500" :
                        worker.estado === 'Licencia' ? "bg-purple-500" : "bg-gray-400"
                      )} />
                      {worker.nombre}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-blue-400">{worker.rut}</td>
                    <td className={cn(
                      "px-6 py-4 text-sm",
                      state.theme === 'dark' ? "text-gray-400" : "text-gray-500"
                    )}>{worker.cargo}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded text-[10px] font-bold border uppercase",
                        state.theme === 'dark' ? "bg-gray-800 text-gray-300 border-gray-700" : "bg-gray-100 text-gray-600 border-gray-200"
                      )}>
                        {worker.grupo}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">{worker.jornada}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold border uppercase",
                        worker.estado === 'Turno' 
                          ? "bg-green-500/10 text-green-500 border-green-500/20" 
                          : worker.estado === 'Descanso'
                          ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                          : worker.estado === 'Licencia'
                          ? "bg-purple-500/10 text-purple-500 border-purple-500/20"
                          : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                      )}>
                        {worker.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono font-bold text-blue-400">
                      {(worker.hh || 0) + (state.workerHoursAggregate[worker.nombre] || 0)}
                    </td>
                    <td className="px-6 py-4 text-center font-mono font-bold text-yellow-500">
                      {(worker.hhe || 0) + (state.workerExtraHoursAggregate?.[worker.nombre] || 0)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            setEditingWorkerId(String(worker.id));
                            setFormData(worker);
                            setIsModalOpen(true);
                          }}
                          className={cn(
                            "p-2 rounded-lg transition-colors",
                            state.theme === 'dark' ? "bg-gray-800 text-white hover:bg-blue-600" : "bg-gray-100 text-gray-600 hover:bg-blue-600 hover:text-white border border-gray-200"
                          )}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm(`\u00bfDesea eliminar a ${worker.nombre}?`)) {
                              deleteWorker(String(worker.id));
                            }
                          }}
                          className={cn(
                            "p-2 rounded-lg transition-colors",
                            state.theme === 'dark' ? "bg-gray-800 text-white hover:bg-red-600" : "bg-gray-100 text-gray-600 hover:bg-red-600 hover:text-white border border-gray-200"
                          )}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className={cn(
            "w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden",
            state.theme === 'dark' ? "bg-[#1a1d24] border-[#30363d]" : "bg-white border-gray-100"
          )}>
             <div className={cn(
               "px-8 py-6 flex justify-between items-center border-b",
               state.theme === 'dark' ? "border-[#30363d]/50" : "border-gray-100"
             )}>
                <h3 className="text-xl font-black uppercase tracking-tight">
                  {editingIndex !== null ? "Editar Registro" : "Nuevo Trabajador"}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className={cn(
                  "transition-colors",
                  state.theme === 'dark' ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-gray-600"
                )}>✕</button>
             </div>
             <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nombre Completo</label>
                      <input 
                        type="text" 
                        value={formData.nombre}
                        onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                        className={cn(
                          "w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2",
                          state.theme === 'dark' 
                            ? "bg-[#0d1117] border-[#30363d] text-white focus:ring-blue-500/30" 
                            : "bg-gray-50 border-gray-200 text-gray-900 focus:ring-blue-500/10"
                        )}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">RUT</label>
                      <input 
                        type="text" 
                        value={formData.rut}
                        onChange={(e) => setFormData({...formData, rut: e.target.value})}
                        className={cn(
                          "w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2",
                          state.theme === 'dark' 
                            ? "bg-[#0d1117] border-[#30363d] text-white focus:ring-blue-500/30" 
                            : "bg-gray-50 border-gray-200 text-gray-900 focus:ring-blue-500/10"
                        )}
                      />
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cargo / Especialidad</label>
                   <input 
                    type="text" 
                    value={formData.cargo}
                    onChange={(e) => setFormData({...formData, cargo: e.target.value})}
                    className={cn(
                      "w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2",
                      state.theme === 'dark' 
                        ? "bg-[#0d1117] border-[#30363d] text-white focus:ring-blue-500/30" 
                        : "bg-gray-50 border-gray-200 text-gray-900 focus:ring-blue-500/10"
                    )}
                   />
                </div>
                <div className="grid grid-cols-2 gap-6">
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Grupo</label>
                      <input 
                        type="text" 
                        value={formData.grupo}
                        onChange={(e) => setFormData({...formData, grupo: e.target.value})}
                        className={cn(
                          "w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2",
                          state.theme === 'dark' 
                            ? "bg-[#0d1117] border-[#30363d] text-white focus:ring-blue-500/30" 
                            : "bg-gray-50 border-gray-200 text-gray-900 focus:ring-blue-500/10"
                        )}
                        placeholder="A, B, C..."
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Jornada</label>
                      <input 
                        type="text" 
                        value={formData.jornada}
                        onChange={(e) => setFormData({...formData, jornada: e.target.value})}
                        className={cn(
                          "w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2",
                          state.theme === 'dark' 
                            ? "bg-[#0d1117] border-[#30363d] text-white focus:ring-blue-500/30" 
                            : "bg-gray-50 border-gray-200 text-gray-900 focus:ring-blue-500/10"
                        )}
                        placeholder="7x7, 14x14..."
                      />
                   </div>
                </div>
                <button 
                  onClick={handleSave}
                  className="w-full py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20"
                >
                  Guardar Registro
                </button>
             </div>
          </div>
        </div>
      )}


      <div className={cn(
        "mt-12 flex justify-between items-center mb-6 border-t pt-12",
        state.theme === 'dark' ? "border-[#30363d]" : "border-gray-100"
      )}>
        <h3 className="text-2xl font-black uppercase tracking-tight">Licencias Médicas Activas</h3>
      </div>
      <div className={cn(
        "rounded-2xl border overflow-hidden shadow-xl",
        state.theme === 'dark' ? "bg-[#1a1d24] border-[#30363d]" : "bg-white border-gray-200"
      )}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={cn(
                "uppercase text-[10px] font-black tracking-wider",
                state.theme === 'dark' ? "bg-[#1f242c] text-gray-500" : "bg-gray-50 text-gray-400"
              )}>
                <th className="px-6 py-4">Nombre Completo</th>
                <th className="px-6 py-4">RUT</th>
                <th className="px-6 py-4">Cargo</th>
                <th className="px-6 py-4">Grupo</th>
                <th className="px-6 py-4">Desde</th>
                <th className="px-6 py-4">Hasta</th>
                <th className="px-6 py-4">Días</th>
              </tr>
            </thead>
            <tbody className={cn(
              "divide-y",
              state.theme === 'dark' ? "divide-[#30363d]/30" : "divide-gray-100"
            )}>
              {uniqueLicensesRender.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500 font-medium italic">
                    No se detectan licencias activas.
                  </td>
                </tr>
              ) : (
                uniqueLicensesRender.map((lic, idx) => (
                  <tr key={idx} className={cn(
                    "transition-colors",
                    state.theme === 'dark' ? "hover:bg-white/5" : "hover:bg-gray-50"
                  )}>
                    <td className={cn(
                      "px-6 py-4 font-bold",
                      state.theme === 'dark' ? "text-white" : "text-gray-900"
                    )}>{lic.nombre}</td>
                    <td className="px-6 py-4 font-mono text-xs text-blue-400">{lic.rut}</td>
                    <td className={cn(
                      "px-6 py-4 text-sm",
                      state.theme === 'dark' ? "text-gray-400" : "text-gray-500"
                    )}>{lic.cargo}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded text-[10px] font-bold border uppercase",
                        state.theme === 'dark' ? "bg-gray-800 text-gray-300 border-gray-700" : "bg-gray-100 text-gray-600 border-gray-200"
                      )}>
                        {lic.grupo}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">{formatDate(lic.desde)}</td>
                    <td className="px-6 py-4 text-sm">{formatDate(lic.hasta)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-orange-500">{lic.dias}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {cargoDetails && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={cn(
            "w-full max-w-4xl max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col",
            state.theme === 'dark' ? "bg-[#0d1117] border-[#30363d]" : "bg-white border-gray-200"
          )}>
            <div className={cn(
              "flex justify-between items-center p-6 border-b",
              state.theme === 'dark' ? "border-[#30363d]/30" : "border-gray-100"
            )}>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">{cargoDetails.title}</h3>
                <p className="text-sm text-gray-500 font-medium">Total: {cargoDetails.workers.length} personas</p>
              </div>
              <button 
                onClick={() => setCargoDetails(null)}
                className="p-2 hover:bg-gray-500/20 rounded-full transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="p-0">
                <table className="w-full text-left border-collapse">
                  <thead className={cn(
                    "sticky top-0 z-10 uppercase text-[10px] font-black tracking-wider",
                    state.theme === 'dark' ? "bg-[#1a1d24] text-gray-400" : "bg-gray-100 text-gray-500"
                  )}>
                    <tr>
                      <th className="px-6 py-4">Nombre</th>
                      <th className="px-6 py-4">RUT</th>
                      <th className="px-6 py-4">Grupo / Turno</th>
                      <th className="px-6 py-4">Estado</th>
                      <th className="px-6 py-4">Cargo / Jornada</th>
                      <th className="px-6 py-4 text-right">HH Tot / Ext</th>
                    </tr>
                  </thead>
                  <tbody className={cn(
                    "divide-y",
                    state.theme === 'dark' ? "divide-[#30363d]/30" : "divide-gray-100"
                  )}>
                    {cargoDetails.workers
                      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
                      .map((worker, idx) => (
                      <tr key={idx} className={cn(
                        "transition-colors",
                        state.theme === 'dark' ? "hover:bg-white/5" : "hover:bg-gray-50",
                        worker.estado === 'Descanso' && "opacity-60"
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
                            "flex items-center gap-2 px-2 py-1 rounded-lg border text-[10px] font-black w-fit uppercase",
                            worker.grupo === 'S/G' ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-blue-500/10 border-blue-500/20 text-blue-500"
                          )}>
                             {worker.grupo || "S/G"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "text-[10px] font-black uppercase px-2 py-1 rounded inline-block",
                            worker.estado === 'Turno' ? "bg-green-500/10 text-green-500 border border-green-500/20" : 
                            worker.estado === 'Descanso' ? "bg-orange-500/10 text-orange-500 border border-orange-500/20" :
                            "bg-gray-500/10 text-gray-500 border border-gray-500/20"
                          )}>
                            {worker.estado}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-[10px] text-gray-500 font-medium">
                            <span className="font-bold whitespace-nowrap">{worker.cargo}</span> <br/> 
                            <span className="opacity-70">{worker.jornada}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-mono font-bold text-blue-400">
                              {(worker.hh || 0) + (state.workerHoursAggregate[worker.nombre] || 0)}
                            </span>
                            <span className="text-[9px] font-mono text-yellow-500">
                              +{(worker.hhe || 0) + (state.workerExtraHoursAggregate?.[worker.nombre] || 0)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className={cn(
              "p-6 border-t flex justify-end",
              state.theme === 'dark' ? "border-[#30363d]/30" : "border-gray-100"
            )}>
              <button
                type="button"
                onClick={() => setCargoDetails(null)}
                className={cn(
                  "px-6 py-2 rounded-lg font-bold transition-colors",
                  state.theme === 'dark' ? "bg-[#30363d] text-white hover:bg-gray-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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

