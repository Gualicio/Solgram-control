import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-ES').format(value);
}

export function formatDate(date: any): string {
  if (!date) return '—';
  let d: Date;
  if (typeof date.toDate === 'function') {
    d = date.toDate();
  } else if (typeof date === 'string' || typeof date === 'number') {
    // Handling YYYY-MM-DD properly without timezone shift issues
    if (typeof date === 'string' && date.includes('-')) {
      const parts = date.split('-');
      if (parts.length === 3) {
         d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      } else {
         d = new Date(date);
      }
    } else {
       d = new Date(date);
    }
  } else if (date instanceof Date) {
    d = date;
  } else {
    // Attempt fallback for object that isn't null and not Date/Timestamp
    d = new Date(date);
  }
  
  if (isNaN(d.getTime())) return '—';
  
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}
