import type { ScheduleSlot } from '../../types';
import { formatDate, isSameDay } from '../../utils/dateHelpers';
import { TimeSlot } from './TimeSlot';
import { ScheduledBlock } from './ScheduledBlock';

interface DayColumnProps {
  date: Date;
  hours: number[];
  slots: ScheduleSlot[];
  onSlotClick?: (slot: ScheduleSlot) => void;
}

export function DayColumn({ date, hours, slots, onSlotClick }: DayColumnProps) {
  const isToday = isSameDay(date, new Date());
  const daySlots = slots.filter((s) => isSameDay(new Date(s.start_time), date));
  const startHour = hours[0] || 0;
  const totalHours = hours.length;

  return (
    <div className="flex-1 min-w-0">
      <div
        className={`text-center py-2 text-sm font-medium border-b border-gray-200 dark:border-gray-700 ${
          isToday
            ? 'bg-accent/10 text-accent dark:text-accent'
            : 'text-gray-700 dark:text-gray-300'
        }`}
      >
        {formatDate(date)}
      </div>
      <div className="relative">
        {hours.map((hour, i) => (
          <TimeSlot key={hour} hour={hour} isEven={i % 2 === 0} />
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
