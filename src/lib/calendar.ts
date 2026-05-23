import { SharedState, Task } from '../types';

interface CalendarEventData {
  summary: string;
  description: string;
  start: {
    date: string; // YYYY-MM-DD for all-day events
  };
  end: {
    date: string; // YYYY-MM-DD
  };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Format a date string safely to a clean YYYY-MM-DD, adjusting the end date to be exclusive for Google Calendar
export function formatCalendarDate(dateStr: string | null, offsetDays: number = 0): string {
  if (!dateStr) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }
  
  try {
    const d = new Date(dateStr + 'T12:00:00'); // Use mid-day to avoid timezone shifting
    if (isNaN(d.getTime())) {
      const fallback = new Date();
      fallback.setDate(fallback.getDate() + offsetDays);
      return fallback.toISOString().slice(0, 10);
    }
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
}

/**
 * Creates a secondary calendar for this project
 */
export async function createGoogleCalendar(accessToken: string, summary: string, description: string): Promise<string> {
  const url = 'https://www.googleapis.com/calendar/v3/calendars';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary,
      description,
      timeZone: 'America/Santiago', // Standard Chilean operational timezone, or dynamic
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error al crear el calendario: ${text}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Lists the user's secondary calendars to check if they already have one
 */
export async function findExistingProjectCalendar(accessToken: string, summary: string): Promise<string | null> {
  const url = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
  
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    
    const data = await response.json();
    const existing = data.items?.find((cal: any) => cal.summary === summary);
    return existing ? existing.id : null;
  } catch {
    return null;
  }
}

/**
 * Creates a single Google Calendar event
 */
export async function createCalendarEvent(accessToken: string, calendarId: string, event: CalendarEventData): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error al crear evento calendar: ${text}`);
  }
}

/**
 * Exports Gantt / Schedule tasks to a Google Calendar
 */
export async function exportScheduleToGoogleCalendar(
  accessToken: string, 
  state: SharedState, 
  option: 'primary' | 'new',
  excludeCompleted: boolean
): Promise<{ calendarId: string; calendarUrl: string; count: number }> {
  if (!state.scheduleData || state.scheduleData.tasks.length === 0) {
    throw new Error("No hay tareas / actividades cargadas en el cronograma para exportar.");
  }

  const projectName = state.scheduleData.name || state.scheduleData.fileName || 'Control Solgram';
  const calendarSummary = `Solgram: ${projectName}`;
  const calendarDescription = `Calendario de actividades y control operacional importado de Solgram. Proyecto: ${projectName}`;
  
  let targetCalendarId = 'primary';
  let isNewCalendar = false;

  if (option === 'new') {
    // 1. Check if calendar already exists to avoid polluting
    const existingId = await findExistingProjectCalendar(accessToken, calendarSummary);
    if (existingId) {
      targetCalendarId = existingId;
    } else {
      targetCalendarId = await createGoogleCalendar(accessToken, calendarSummary, calendarDescription);
      isNewCalendar = true;
    }
  }

  // 2. Select tasks to export (prioritize active/non-completed)
  let tasksToExport = state.scheduleData.tasks;
  if (excludeCompleted) {
    tasksToExport = tasksToExport.filter(t => t.status !== 'TK_Completed' && t.status !== 'TK_Complete');
  }

  // 3. Incrementally post events to the calendar
  let successCount = 0;
  for (const task of tasksToExport) {
    if (!task.startDate) continue;

    // Google Calendar expects endDate to be exclusive for all-day events.
    // If startDate === endDate, it is a single-day event. end.date should be startDate + 1 day.
    const startFormatted = formatCalendarDate(task.startDate, 0);
    const endFormatted = formatCalendarDate(task.endDate || task.startDate, 1);

    const descriptionText = `Detalles de Actividad:\n` +
      `- ID de Tarea: ${task.id}\n` +
      `- Estado Operacional: ${task.status || 'No especificado'}\n` +
      `- Duración Estimada: ${task.durationHrs || 0} horas\n` +
      `- WBS / Grupo: ${task.wbsName || 'Sin WBS'}`;

    const eventPayload: CalendarEventData = {
      summary: `[Solgram] ${task.name}`,
      description: descriptionText,
      start: { date: startFormatted },
      end: { date: endFormatted }
    };

    try {
      await createCalendarEvent(accessToken, targetCalendarId, eventPayload);
      successCount++;
    } catch (err) {
      console.error(`Failed to create calendar event for task ${task.name}:`, err);
    }
    
    // Tiny spacing to avoid hitting rate-limits
    await sleep(250);
  }

  const calendarUrl = targetCalendarId === 'primary' 
    ? 'https://calendar.google.com' 
    : `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(targetCalendarId)}`;

  return { 
    calendarId: targetCalendarId,
    calendarUrl,
    count: successCount
  };
}
