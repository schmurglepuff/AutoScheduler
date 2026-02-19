import { useState, useMemo } from 'react';
import type { ScheduleSlot, Settings } from '../../types';
import { startOfWeek, addDays, getHoursArray, parseTimeString } from '../../utils/dateHelpers';
import { WeekNavigator } from './WeekNavigator';
import { DayColumn } from './DayColumn';

interface WeeklyCalendarProps {
  slots: ScheduleSlot[];
  settings: Settings;
  onSlotClick?: (slot: ScheduleSlot) => void;
}

export function WeeklyCalendar({ slots, settings, onSlotClick }: WeeklyCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date());
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const { hours: startHour } = parseTimeString(settings.work_day_start);
  const { hours: endHour } = parseTimeString(settings.work_day_end);
  const hours = getHoursArray(startHour, endHour);

  const days = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 && !settings.include_sunday) continue;
      if (dayOfWeek === 6 && !settings.include_saturday) continue;
      result.push(d);
    }
    return result;
  }, [weekStart, settings.include_saturday, settings.include_sunday]);

  return (
    <div className="flex flex-col gap-4">
      <WeekNavigator
        weekStart={weekStart}
        onPrev={() => setWeekOffset((o) => o - 1)}
        onNext={() => setWeekOffset((o) => o + 1)}
        onToday={() => setWeekOffset(0)}
      />
      <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
        {/* Time gutter */}
        <div className="w-14 shrink-0 border-r border-gray-200 dark:border-gray-700">
          <div className="py-2 text-center text-xs text-gray-400 border-b border-gray-200 dark:border-gray-700">
            &nbsp;
          </div>
          {hours.map((hour, i) => (
            <div
              key={hour}
              className={`h-16 border-t border-gray-200 dark:border-gray-700 pr-2 text-right ${
                i % 2 === 0 ? 'bg-gray-50/50 dark:bg-gray-800/30' : ''
              }`}
            >
              <span className="text-xs text-gray-400 dark:text-gray-500 -mt-2 block">
                {hour.toString().padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>
        {/* Day columns */}
        {days.map((date) => (
          <DayColumn
            key={date.toISOString()}
            date={date}
            hours={hours}
            slots={slots}
            onSlotClick={onSlotClick}
          />
        ))}
      </div>
    </div>
  );
}
