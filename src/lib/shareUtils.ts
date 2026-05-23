export function downloadPdfBlob(pdfBlob: Blob, filename: string) {
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function sharePdfFile(pdfBlob: Blob, filename: string, title: string = 'Documento PDF'): Promise<boolean> {
  const file = new File([pdfBlob], filename, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: title,
      });
      return true; // Compartido via share dialog
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("Error al compartir (falla nativa o iframe sandbox):", err);
      } else {
        // Si el usuario abortó explícitamente, no forzamos la descarga para respetar su decisión
        return false;
      }
    }
  }

  // Fallback: Si no soporta Web Share o la llamada falló/fue bloqueada, descargamos directamente el archivo
  downloadPdfBlob(pdfBlob, filename);
  return true;
}

