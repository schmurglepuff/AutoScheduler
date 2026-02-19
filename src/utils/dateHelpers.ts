export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as start of week
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

export function getDayName(dayIndex: number): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[dayIndex];
}

export function getHoursArray(startHour: number, endHour: number): number[] {
  const hours: number[] = [];
  for (let h = startHour; h < endHour; h++) {
    hours.push(h);
  }
  return hours;
}

export function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Returns 42 dates (6 rows × 7 cols, Monday-start) covering the given month plus leading/trailing days. */
export function getCalendarGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // Day of week for the 1st (0=Sun, 1=Mon, ..., 6=Sat)
  const dow = first.getDay();
  // Monday-start offset: how many leading days from previous month
  const leadingDays = dow === 0 ? 6 : dow - 1;
  const gridStart = new Date(year, month, 1 - leadingDays);

  const dates: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    d.setHours(0, 0, 0, 0);
    dates.push(d);
  }
  return dates;
}
