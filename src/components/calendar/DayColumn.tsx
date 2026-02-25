import type { ScheduleSlot } from '../../types';
import { isSameDay, formatDateISO } from '../../utils/dateHelpers';
import { TimeSlot } from './TimeSlot';
import { ScheduledBlock } from './ScheduledBlock';

interface DayColumnProps {
  date: Date;
  hours: number[];
  slots: ScheduleSlot[];
  onSlotClick?: (slot: ScheduleSlot) => void;
  onToggleLock?: (slot: ScheduleSlot) => void;
  onToggleComplete?: (slot: ScheduleSlot) => void;
  onCreateTask?: (startTime: Date) => void;
  overCellId: string | null;
  workDayStart?: string;
  workDayEnd?: string;
  lunchStart?: string;
  lunchEnd?: string;
}

export function DayColumn({ date, hours, slots, onSlotClick, onToggleLock, onToggleComplete, onCreateTask, overCellId, workDayStart, workDayEnd, lunchStart, lunchEnd }: DayColumnProps) {
  const isToday = isSameDay(date, new Date());
  const startHour = hours[0] || 0;
  const endHour = (hours[hours.length - 1] || 0) + 1;
  const totalHours = hours.length;
  const dateStr = formatDateISO(date);

  // Day boundaries for the visible grid
  const dayStart = new Date(date);
  dayStart.setHours(startHour, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(endHour, 0, 0, 0);

  // Find all slots that overlap with this day's visible hours
  const daySlots = slots.filter((s) => {
    const slotStart = new Date(s.start_time);
    const slotEnd = new Date(s.end_time);
    return slotStart < dayEnd && slotEnd > dayStart;
  });

  const dayName = date.toLocaleDateString([], { weekday: 'short' });
  const dayNum = date.getDate();

  // Build half-hour cells for droppable targets
  const cells: { id: string; hour: number; min: number }[] = [];
  for (const hour of hours) {
    cells.push({ id: `cell-${dateStr}-${hour}-0`, hour, min: 0 });
    cells.push({ id: `cell-${dateStr}-${hour}-30`, hour, min: 30 });
  }

  // Determine which cells are occupied by a scheduled block
  const occupiedCells = new Set<string>();
  for (const slot of daySlots) {
    const slotStart = new Date(slot.start_time);
    const slotEnd = new Date(slot.end_time);
    for (const cell of cells) {
      const cellStart = new Date(date);
      cellStart.setHours(cell.hour, cell.min, 0, 0);
      const cellEnd = new Date(cellStart.getTime() + 30 * 60 * 1000);
      if (cellStart < slotEnd && cellEnd > slotStart) {
        occupiedCells.add(cell.id);
      }
    }
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
      <div className="relative overflow-hidden">
        {/* Off-hours shading (before work start) */}
        {workDayStart && (() => {
          const [wsH, wsM] = workDayStart.split(':').map(Number);
          const workStartOffset = wsH + wsM / 60 - startHour;
          const topPct = 0;
          const heightPct = (workStartOffset / totalHours) * 100;
          if (heightPct <= 0) return null;
          return (
            <div
              className="absolute inset-x-0 bg-gray-100/70 dark:bg-gray-800/40 z-[1] pointer-events-none"
              style={{ top: `${topPct}%`, height: `${Math.min(heightPct, 100)}%` }}
            />
          );
        })()}
        {/* Off-hours shading (after work end) */}
        {workDayEnd && (() => {
          const [weH, weM] = workDayEnd.split(':').map(Number);
          const workEndOffset = weH + weM / 60 - startHour;
          const topPct = (workEndOffset / totalHours) * 100;
          const heightPct = 100 - topPct;
          if (topPct >= 100 || heightPct <= 0) return null;
          return (
            <div
              className="absolute inset-x-0 bg-gray-100/70 dark:bg-gray-800/40 z-[1] pointer-events-none"
              style={{ top: `${Math.max(0, topPct)}%`, height: `${heightPct}%` }}
            />
          );
        })()}
        {/* Lunch band */}
        {lunchStart && lunchEnd && (() => {
          const [lsH, lsM] = lunchStart.split(':').map(Number);
          const [leH, leM] = lunchEnd.split(':').map(Number);
          const lunchStartOffset = lsH + lsM / 60 - startHour;
          const lunchDuration = (leH + leM / 60) - (lsH + lsM / 60);
          const lunchTop = (lunchStartOffset / totalHours) * 100;
          const lunchHeight = (lunchDuration / totalHours) * 100;
          if (lunchTop >= 100 || lunchTop + lunchHeight <= 0) return null;
          const clampedTop = Math.max(0, lunchTop);
          const clampedHeight = Math.min(100 - clampedTop, lunchHeight - (clampedTop - lunchTop));
          return (
            <div
              className="absolute inset-x-0 bg-gray-100 dark:bg-gray-800/50 border-y border-dashed border-gray-300 dark:border-gray-600 z-[1] pointer-events-none"
              style={{ top: `${clampedTop}%`, height: `${clampedHeight}%` }}
            />
          );
        })()}
        {cells.map((cell) => {
          const cellStart = new Date(date);
          cellStart.setHours(cell.hour, cell.min, 0, 0);
          const isOccupied = occupiedCells.has(cell.id);
          return (
            <TimeSlot
              key={cell.id}
              droppableId={cell.id}
              isOver={overCellId === cell.id}
              onCreateTask={!isOccupied && onCreateTask ? () => onCreateTask(cellStart) : undefined}
            />
          );
        })}
        {daySlots.map((slot) => {
          const slotStart = new Date(slot.start_time);
          const slotEnd = new Date(slot.end_time);

          // Clamp to visible day boundaries
          const visibleStart = slotStart < dayStart ? dayStart : slotStart;
          const visibleEnd = slotEnd > dayEnd ? dayEnd : slotEnd;

          const startOffset = visibleStart.getHours() + visibleStart.getMinutes() / 60 - startHour;
          const duration = (visibleEnd.getTime() - visibleStart.getTime()) / (1000 * 60 * 60);
          const topPercent = (startOffset / totalHours) * 100;
          const heightPercent = (duration / totalHours) * 100;

          if (heightPercent <= 0) return null;

          return (
            <ScheduledBlock
              key={slot.id}
              slot={slot}
              topPercent={topPercent}
              heightPercent={heightPercent}
              onClick={onSlotClick}
              onToggleLock={onToggleLock}
              onToggleComplete={onToggleComplete}
              workDayEnd={workDayEnd}
            />
          );
        })}

      </div>
    </div>
  );
}
