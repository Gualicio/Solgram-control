import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DailyReport, ProjectWorker } from '../types';

// Format currency or hours
const formatHrs = (hours: number) => `${hours.toFixed(1)} Hrs`;

export function generateSingleReportPdf(report: DailyReport, allWorkers?: ProjectWorker[]): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  addReportToDoc(doc, report, allWorkers, true);
  return doc;
}

export function generateAllReportsPdf(reports: DailyReport[], allWorkers?: ProjectWorker[]): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Sort chronologically
  const sortedReports = [...reports].sort((a, b) => a.date.localeCompare(b.date));

  sortedReports.forEach((report, index) => {
    if (index > 0) {
      doc.addPage();
    }
    addReportToDoc(doc, report, allWorkers, false);
  });

  return doc;
}

function addReportToDoc(doc: jsPDF, report: DailyReport, allWorkers?: ProjectWorker[], showFooter = true) {
  // Brand Header Accent
  doc.setFillColor(33, 43, 54); // Dark charcoal blue
  doc.rect(0, 0, 210, 35, 'F');

  // Title Text
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('SOLGRAMIA', 18, 18);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(10);
  doc.setFont('Helvetica', 'bold');
  doc.text('REPORTE DIARIO DE OPERACIONES', 18, 26);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Fecha de Reporte: ${report.date}`, 150, 15);
  doc.text(`Estado: ${report.status ? report.status.toUpperCase() : 'EJECUCIÓN'}`, 150, 21);
  doc.text(`Origen: ${report.source === 'gantt' ? 'Gantt P6' : 'Manual'}`, 150, 27);

  // Divider Line and Content starting at Y = 45
  let y = 45;

  // Metadata Section Title
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(33, 43, 54);
  doc.text('1. INFORMACIÓN GENERAL DEL DÍA', 15, y);
  y += 6;

  // Draw elegant meta table
  autoTable(doc, {
    startY: y,
    head: [['Indicador', 'Detalle']],
    body: [
      ['Fecha Operativa', report.date],
      ['Supervisor a Cargo', report.sup || 'No especificado'],
      ['WBS Principal (Carta Gantt)', report.wbs || 'Sin vincular'],
      ['Actividad / Labor Secundaria', report.tipo || '-'],
      ['Detalle Adicional / Comentarios', report.detalle || 'Sin comentarios registrados'],
      ['Total Horas de Operación', formatHrs(report.hours || 0)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 130 }
    }
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // Sub-Tareas / Checklist Section
  if (report.subLabors && report.subLabors.length > 0) {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(33, 43, 54);
    doc.text('2. SUB-TAREAS Y AVANCE ASOCIADO', 15, y);
    y += 6;

    const subLaborsBody = report.subLabors.map(sl => [
      sl.name,
      formatHrs(sl.hours),
      sl.status ? sl.status.toUpperCase() : 'EJECUCIÓN'
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Sub-Tarea / Actividad Específica', 'Presupuesto HH', 'Estado']],
      body: subLaborsBody,
      theme: 'grid',
      headStyles: { fillColor: [33, 43, 54], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 40, halign: 'center' },
        2: { cellWidth: 40, halign: 'center' }
      }
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Personal en Turno / Trabajadores asignados
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(33, 43, 54);
  doc.text('3. DOTACIÓN Y HORAS TRABAJADAS', 15, y);
  y += 6;

  const workersDetail = report.workersDetail || [];
  const extraHours = report.extraHours || [];

  const processedNames = new Set<string>();
  const tableRows: any[] = [];

  // Map user names to their information
  const workerInfoMap = new Map<string, ProjectWorker>();
  if (allWorkers) {
    allWorkers.forEach(w => {
      workerInfoMap.set(w.nombre.trim(), w);
    });
  }

  // Add workers with regular hours
  workersDetail.forEach(wd => {
    const wName = wd.name;
    processedNames.add(wName);
    const details = workerInfoMap.get(wName.trim());
    const matchedExtra = extraHours.find(eh => eh.workerName === wName);
    const extraHrsVal = matchedExtra ? matchedExtra.hours : 0;

    tableRows.push([
      wName,
      details?.rut || 'S/R',
      details?.cargo || 'Operador',
      details?.grupo || 'S/G',
      formatHrs(wd.hours || 12),
      extraHrsVal > 0 ? formatHrs(extraHrsVal) : '0.0 Hrs',
      formatHrs((wd.hours || 12) + extraHrsVal)
    ]);
  });

  // Add remaining extra hours workers if not already in main workers list
  extraHours.forEach(eh => {
    if (!processedNames.has(eh.workerName)) {
      const details = workerInfoMap.get(eh.workerName.trim());
      tableRows.push([
        eh.workerName,
        details?.rut || 'S/R',
        details?.cargo || 'Operador',
        details?.grupo || 'S/G',
        '0.0 Hrs',
        formatHrs(eh.hours),
        formatHrs(eh.hours)
      ]);
    }
  });

  if (tableRows.length === 0) {
    tableRows.push([
      { content: 'No se asignó personal a esta labor en el reporte diario.', colSpan: 7, styles: { halign: 'center', fontStyle: 'italic' } }
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: [['Nombre', 'RUT', 'Cargo', 'Grupo', 'Hrs Ordinarias', 'Hrs Extra', 'Total HH']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 25 },
      2: { cellWidth: 35 },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 15, halign: 'center' },
      6: { cellWidth: 20, halign: 'center' }
    }
  });

  y = (doc as any).lastAutoTable.finalY + 15;

  // Photographic Log Section
  if (report.images && report.images.length > 0) {
    if (y > 210) {
      doc.addPage();
      y = 35;
    } else {
      y += 5;
    }
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(33, 43, 54);
    doc.text('4. REGISTRO FOTOGRÁFICO', 15, y);
    y += 8;

    let col = 0;
    const imgWidth = 85;
    const imgHeight = 65;
    const padding = 10;
    const startX = 15;
    
    report.images.forEach((imgBase64, index) => {
      if (y + imgHeight > 275) {
        doc.addPage();
        y = 30;
      }
      
      const currentX = startX + col * (imgWidth + padding);
      try {
        // Find format jpeg/png
        let format = 'JPEG';
        if (imgBase64.includes('image/png') || imgBase64.includes('png')) {
          format = 'PNG';
        }
        doc.addImage(imgBase64, format, currentX, y, imgWidth, imgHeight);
      } catch (err) {
        console.error("Error adding image to PDF: ", err);
        doc.setDrawColor(200, 50, 50);
        doc.rect(currentX, y, imgWidth, imgHeight);
        doc.setFontSize(8);
        doc.text("[Error al cargar imagen]", currentX + 5, y + imgHeight / 2);
      }
      
      if (col === 1) {
        col = 0;
        y += imgHeight + padding;
      } else {
        col = 1;
      }
    });
    
    if (col === 1) {
      y += imgHeight + padding;
    }
  }

  // Signatures at bottom if space permits, otherwise let autoTable handle heights
  if (y > 230) {
    doc.addPage();
    y = 35;
  }

  // Draw Signature lines
  doc.setDrawColor(200, 200, 200);
  doc.line(25, y + 20, 85, y + 20);
  doc.line(125, y + 20, 185, y + 20);

  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8.5);
  doc.text('Firma Supervisor de Campo', 35, y + 24);
  doc.text(report.sup || 'Supervisor', 35, y + 28);

  doc.text('Firma Oficina Técnica / Control de Proyecto', 130, y + 24);
  doc.text('Soporte SOLGRAMIA', 130, y + 28);

  // Footer text
  if (showFooter) {
    doc.setFontSize(7.5);
    doc.text('Documento generado de manera segura desde Solgramia Project Intelligence Cloud.', 15, 287);
    doc.text(`Página 1 de 1`, 185, 287);
  }
}
