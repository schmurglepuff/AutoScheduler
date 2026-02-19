import { useMemo } from 'react';
import type { ScheduleSlot, Settings } from '../../types';
import { getCalendarGrid, isSameDay, formatDateISO } from '../../utils/dateHelpers';

interface MonthlyCalendarProps {
  slots: ScheduleSlot[];
  settings: Settings;
  year: number;
  month: number;
  onDayClick: (date: Date) => void;
}

const DAY_HEADERS_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const priorityBorderColor: Record<string, string> = {
  High: 'border-l-red-500',
  Medium: 'border-l-amber-500',
  Low: 'border-l-emerald-500',
};

export function MonthlyCalendar({ slots, settings, year, month, onDayClick }: MonthlyCalendarProps) {
  const grid = useMemo(() => getCalendarGrid(year, month), [year, month]);
  const today = useMemo(() => new Date(), []);

  // Which day-of-week columns to show (0=Mon .. 6=Sun in our grid)
  const visibleCols = useMemo(() => {
    const cols: number[] = [];
    for (let i = 0; i < 7; i++) {
      if (i === 5 && !settings.include_saturday) continue; // Sat
      if (i === 6 && !settings.include_sunday) continue;   // Sun
      cols.push(i);
    }
    return cols;
  }, [settings.include_saturday, settings.include_sunday]);

  // Group slots by ISO date for quick lookup
  const slotsByDate = useMemo(() => {
    const map = new Map<string, ScheduleSlot[]>();
    for (const slot of slots) {
      const key = formatDateISO(new Date(slot.start_time));
      const arr = map.get(key);
      if (arr) arr.push(slot);
      else map.set(key, [slot]);
    }
    return map;
  }, [slots]);

  const colCount = visibleCols.length;

  return (
    <div className="relative z-10 rounded-xl bg-white dark:bg-gray-900 shadow-sm border border-gray-200/60 dark:border-gray-800 overflow-hidden">
      {/* Day-of-week headers */}
      <div
        className="grid border-b border-gray-200 dark:border-gray-800"
        style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
      >
        {visibleCols.map((col) => (
          <div
            key={col}
            className="py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            {DAY_HEADERS_FULL[col]}
          </div>
        ))}
      </div>

      {/* 6 rows of day cells */}
      {Array.from({ length: 6 }, (_, row) => (
        <div
          key={row}
          className="grid border-b last:border-b-0 border-gray-100 dark:border-gray-800/50"
          style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
        >
          {visibleCols.map((col) => {
            const date = grid[row * 7 + col];
            const isCurrentMonth = date.getMonth() === month;
            const isToday = isSameDay(date, today);
            const dateKey = formatDateISO(date);
            const daySlots = slotsByDate.get(dateKey) || [];
            const maxChips = 3;
            const overflow = daySlots.length - maxChips;

            return (
              <button
                key={col}
                onClick={() => onDayClick(date)}
                className={`min-h-[100px] p-1.5 text-left border-r last:border-r-0 border-gray-100 dark:border-gray-800/50 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                  !isCurrentMonth ? 'bg-gray-50/50 dark:bg-gray-950/30' : ''
                }`}
              >
                {/* Day number */}
                <div className="flex items-center justify-end mb-1">
                  <span
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-accent text-white'
                        : isCurrentMonth
                          ? 'text-gray-700 dark:text-gray-300'
                          : 'text-gray-400 dark:text-gray-600'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                </div>

                {/* Task chips */}
                <div className="flex flex-col gap-0.5">
                  {daySlots.slice(0, maxChips).map((slot) => {
                    const priority = slot.task?.priority || 'Low';
                    return (
                      <div
                        key={slot.id}
                        className={`text-[10px] leading-tight px-1.5 py-0.5 rounded border-l-2 truncate bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 ${priorityBorderColor[priority]}`}
                      >
                        {slot.task?.title || 'Task'}
                      </div>
                    );
                  })}
                  {overflow > 0 && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 pl-1.5">
                      +{overflow} more
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
