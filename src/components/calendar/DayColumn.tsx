import type { ScheduleSlot } from '../../types';
import { isSameDay, formatDateISO } from '../../utils/dateHelpers';
import { TimeSlot } from './TimeSlot';
import { ScheduledBlock } from './ScheduledBlock';

interface DayColumnProps {
  date: Date;
  hours: number[];
  slots: ScheduleSlot[];
  onSlotClick?: (slot: ScheduleSlot) => void;
  overCellId: string | null;
}

export function DayColumn({ date, hours, slots, onSlotClick, overCellId }: DayColumnProps) {
  const isToday = isSameDay(date, new Date());
  const daySlots = slots.filter((s) => isSameDay(new Date(s.start_time), date));
  const startHour = hours[0] || 0;
  const totalHours = hours.length;
  const dateStr = formatDateISO(date);

  const dayName = date.toLocaleDateString([], { weekday: 'short' });
  const dayNum = date.getDate();

  // Build half-hour cells for droppable targets
  const cells: { id: string; hour: number; min: number }[] = [];
  for (const hour of hours) {
    cells.push({ id: `cell-${dateStr}-${hour}-0`, hour, min: 0 });
    cells.push({ id: `cell-${dateStr}-${hour}-30`, hour, min: 30 });
  }

  return (
    <div className="flex-1 min-w-0 border-l border-gray-100 dark:border-gray-800 first:border-l-0">
      {/* Day header */}
      <div className="text-center py-3">
        <div className={`text-[11px] uppercase tracking-wider font-medium ${
          isToday ? 'text-accent' : 'text-gray-400 dark:text-gray-500'
        }`}>
          {dayName}
        </div>
        <div className="mt-0.5 inline-flex items-center justify-center w-7 h-7">
          <span className={`w-7 h-7 inline-flex items-center justify-center text-sm rounded-full font-medium ${
            isToday
              ? 'bg-accent text-white font-semibold'
              : 'text-gray-900 dark:text-gray-100'
          }`}>
            {dayNum}
          </span>
        </div>
      </div>
      {/* Time grid with droppable half-hour cells */}
      <div className="relative">
        {cells.map((cell) => (
          <TimeSlot
            key={cell.id}
            droppableId={cell.id}
            isOver={overCellId === cell.id}
          />
        ))}
        {daySlots.map((slot) => {
          const start = new Date(slot.start_time);
          const end = new Date(slot.end_time);
          const startOffset = start.getHours() + start.getMinutes() / 60 - startHour;
          const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          const topPercent = (startOffset / totalHours) * 100;
          const heightPercent = (duration / totalHours) * 100;

          return (
            <ScheduledBlock
              key={slot.id}
              slot={slot}
              topPercent={topPercent}
              heightPercent={heightPercent}
              onClick={onSlotClick}
            />
          );
        })}
      </div>
    </div>
  );
}
