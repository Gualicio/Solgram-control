import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Lock, Mail, HardDrive, Key, Loader2, CloudUpload } from 'lucide-react';
import { cn } from '../lib/utils';
import { useApp } from '../AppContext';
import { loginWithGoogleServices, uploadFileToDrive, sendFileByEmail } from '../lib/drive';
import { generateAllReportsPdf } from '../lib/pdfGenerator';

export default function DriveSyncModal({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
}) {
  const { state, notify } = useApp();
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // The predefined password for the backup app feature
  const APP_PASSWORD = "solgramcontrol"; // Can be changed by the user

  const handleSync = async () => {
    if (password !== APP_PASSWORD) {
      notify('error', 'Contraseña incorrecta. (Prueba con "solgramcontrol")');
      return;
    }

    setIsProcessing(true);
    try {
      notify('info', 'Generando paquete de información...');

      // Pack the state into a JSON object
      const dataToExport = {
        scheduleData: state.scheduleData,
        workers: state.workers,
        licenses: state.licenses,
        extraHours: state.extraHoursReports,
        dailyReports: state.dailyReports,
        timestamp: new Date().toISOString()
      };

      const jsonStr = JSON.stringify(dataToExport, null, 2);
      const jsonBlob = new Blob([jsonStr], { type: 'application/json' });
      const jsonFilename = `resumen_proyecto_solgram_${new Date().toISOString().slice(0, 10)}.json`;

      // Generate the PDF for the reports
      notify('info', 'Generando reporte PDF del día...');
      const todayStr = new Date().toISOString().slice(0, 10);
      let reportsToGenerate = state.dailyReports.filter(r => r.date === todayStr);
      
      // If no reports today, use the last reported day
      if (reportsToGenerate.length === 0 && state.dailyReports.length > 0) {
        const sortedDates = state.dailyReports.map(r => r.date).sort();
        const latestDate = sortedDates[sortedDates.length - 1];
        reportsToGenerate = state.dailyReports.filter(r => r.date === latestDate);
      }

      let pdfBlob: Blob | null = null;
      let pdfFilename = `Reporte_Diario_${todayStr}.pdf`;
      
      if (reportsToGenerate.length > 0) {
        const doc = generateAllReportsPdf(reportsToGenerate, state.workers);
        pdfBlob = doc.output('blob');
        pdfFilename = `Reporte_Diario_Operaciones_${reportsToGenerate[0].date}.pdf`;
      } else {
        // Generate an empty/placeholder PDF if no reports exist
        const { jsPDF } = await import('jspdf');
        const emptyDoc = new jsPDF();
        emptyDoc.setFontSize(16);
        emptyDoc.text(`Reporte Diario de Operaciones`, 105, 30, { align: 'center' });
        emptyDoc.setFontSize(12);
        emptyDoc.text(`Fecha: ${todayStr}`, 105, 45, { align: 'center' });
        emptyDoc.setTextColor(200, 0, 0);
        emptyDoc.text('No hay reportes de tareas registrados en la base de datos para esta fecha.', 105, 70, { align: 'center' });
        pdfBlob = emptyDoc.output('blob');
      }

      notify('info', 'Iniciando sesión en Google Services para subir a Drive...');
      const token = await loginWithGoogleServices();

      // Upload JSON to Drive
      notify('info', 'Subiendo base de datos (JSON) a Google Drive...');
      await uploadFileToDrive(jsonBlob, jsonFilename, 'application/json', token);

      // Upload PDF to Drive if generated
      if (pdfBlob) {
         notify('info', 'Subiendo reporte (PDF) a Google Drive...');
         await uploadFileToDrive(pdfBlob, pdfFilename, 'application/pdf', token);
      }

      // Send via Email
      notify('info', 'Enviando correo con reporte adjunto...');
      const reportDateLabel = reportsToGenerate.length > 0 ? reportsToGenerate[0].date : new Date().toLocaleDateString();
      const htmlBody = `
        <h3>Reporte Diario & Respaldo Completado</h3>
        <p>Se ha ejecutado la sincronización total del sistema Solgram Control.</p>
        <p>El reporte diario formato PDF del día <strong>${reportDateLabel}</strong> se encuentra adjunto en este correo.</p>
        <p>La base de datos completa también fue respaldada de forma segura en Google Drive.</p>
        <p><strong>Fecha de Emisión:</strong> ${new Date().toLocaleString()}</p>
      `;
      
      // We attach the PDF if available, else attach the JSON
      const attachmentBlob = pdfBlob || jsonBlob;
      const attachmentFilename = pdfBlob ? pdfFilename : jsonFilename;
      const mimeTypeInfo = pdfBlob ? 'application/pdf' : 'application/json';

      await sendFileByEmail(
        attachmentBlob, 
        attachmentFilename, 
        `Reporte Diario / Sincronización - Solgram Control (${reportDateLabel})`, 
        htmlBody, 
        token,
        mimeTypeInfo
      );

      notify('success', '¡Sincronización completada! Reporte PDF enviado y datos respaldados en Drive.');
      setPassword('');
      onClose();
    } catch (e: any) {
      console.error(e);
      notify('error', 'Error en sincronización: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className={cn(
            "relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border p-6 flex flex-col gap-6",
            state.theme === 'dark' 
              ? "bg-[#0d1117] border-[#1f2a44] text-white" 
              : "bg-white border-gray-200 text-gray-900"
          )}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <CloudUpload size={20} className="text-blue-500" />
              Sincronización Profunda
            </h2>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="p-1 hover:bg-gray-500/20 rounded-full transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="text-sm opacity-80 space-y-2">
            <p>
              Ingresa la contraseña maestra para consolidar la información.
            </p>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li className="flex items-center gap-1.5"><HardDrive size={12}/> Sube los datos (JSON) y Reporte PDF al Drive.</li>
              <li className="flex items-center gap-1.5"><Mail size={12}/> Envía el Reporte Diario PDF por correo.</li>
            </ul>
            <p className="text-xs opacity-60 italic mt-2">Destino: solgramcontrol@gmail.com</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider opacity-60 flex items-center gap-1.5">
              <Key size={12} />
              Contraseña de Sincronización
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isProcessing}
                placeholder="********"
                className={cn(
                  "w-full pl-10 pr-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono",
                  state.theme === 'dark' 
                    ? "bg-[#161b22] border-[#2a3655]" 
                    : "bg-gray-50 border-gray-300"
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSync();
                }}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold transition-colors",
                state.theme === 'dark' ? "hover:bg-gray-800 text-gray-300" : "hover:bg-gray-100 text-gray-600"
              )}
            >
              Cancelar
            </button>
            <button
              onClick={handleSync}
              disabled={isProcessing || !password}
              className={cn(
                "flex items-center justify-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50",
                "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20"
              )}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Sincronizando...
                </>
              ) : (
                'Autorizar y Sincronizar'
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
