import { useMemo } from 'react';
import type { ScheduleSlot } from '../../types';
import { isSameDay, formatDateISO } from '../../utils/dateHelpers';
import { TimeSlot } from './TimeSlot';
import { ScheduledBlock } from './ScheduledBlock';

/** Assigns each slot a column index and total column count for side-by-side overlap rendering. */
function computeOverlapLayout(slots: ScheduleSlot[]): Map<string, { col: number; totalCols: number }> {
  if (slots.length === 0) return new Map();

  const items = slots.map((s) => ({
    id: s.id,
    start: new Date(s.start_time).getTime(),
    end: new Date(s.end_time).getTime(),
  })).sort((a, b) => a.start - b.start || b.end - a.end);

  // Greedy column assignment: place each slot in the first column whose last slot ended before this one starts
  const colEnds: number[] = [];
  const colOf = new Map<string, number>();
  for (const item of items) {
    const col = colEnds.findIndex((end) => end <= item.start);
    const assigned = col === -1 ? colEnds.length : col;
    colEnds[assigned] = item.end;
    colOf.set(item.id, assigned);
  }

  // Union-Find to group transitively overlapping slots into clusters
  const parent = new Map<string, string>(items.map((s) => [s.id, s.id]));
  const find = (id: string): string => {
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!));
    return parent.get(id)!;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[j].start >= items[i].end) break; // sorted by start — no more overlaps with i
      union(items[i].id, items[j].id);
    }
  }

  // For each cluster, totalCols = highest column index used + 1
  const clusterMaxCol = new Map<string, number>();
  for (const item of items) {
    const root = find(item.id);
    const col = colOf.get(item.id)!;
    clusterMaxCol.set(root, Math.max(clusterMaxCol.get(root) ?? 0, col));
  }

  const result = new Map<string, { col: number; totalCols: number }>();
  for (const item of items) {
    const root = find(item.id);
    result.set(item.id, { col: colOf.get(item.id)!, totalCols: (clusterMaxCol.get(root) ?? 0) + 1 });
  }
  return result;
}

interface DayColumnProps {
  date: Date;
  hours: number[];
  slots: ScheduleSlot[];
  onSlotClick?: (slot: ScheduleSlot) => void;
  onToggleLock?: (slot: ScheduleSlot) => void;
  onToggleGroupLock?: (slot: ScheduleSlot) => void;
  onToggleComplete?: (slot: ScheduleSlot) => void;
  onCreateTask?: (startTime: Date) => void;
  overCellId: string | null;
  workDayStart?: string;
  workDayEnd?: string;
  lunchStart?: string;
  lunchEnd?: string;
}

export function DayColumn({ date, hours, slots, onSlotClick, onToggleLock, onToggleGroupLock, onToggleComplete, onCreateTask, overCellId, workDayStart, workDayEnd, lunchStart, lunchEnd }: DayColumnProps) {
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

  const overlapLayout = useMemo(() => computeOverlapLayout(daySlots), [daySlots]);

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
              className="absolute inset-x-0 bg-amber-50/80 dark:bg-yellow-200/45 border-y border-dashed border-amber-200 dark:border-yellow-300/60 z-[11] pointer-events-auto group flex items-center justify-center"
              style={{ top: `${clampedTop}%`, height: `${clampedHeight}%` }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-7 h-7 text-gray-400 dark:text-gray-700 opacity-60 animate-[wiggle_1.5s_ease-in-out_infinite]"
              >
                <path d="M3 2v20h2V2H3zm16 0v6a4 4 0 0 1-3 3.87V22h-2V11.87A4 4 0 0 1 11 8V2h2v6a2 2 0 0 0 1 1.73V2h2v7.73A2 2 0 0 0 17 8V2h2z" />
              </svg>
            </div>
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

          const layout = overlapLayout.get(slot.id) ?? { col: 0, totalCols: 1 };
          const leftPercent = (layout.col / layout.totalCols) * 100;
          const widthPercent = (1 / layout.totalCols) * 100;

          return (
            <ScheduledBlock
              key={slot.id}
              slot={slot}
              topPercent={topPercent}
              heightPercent={heightPercent}
              leftPercent={leftPercent}
              widthPercent={widthPercent}
              onClick={onSlotClick}
              onToggleLock={onToggleLock}
              onToggleGroupLock={onToggleGroupLock}
              onToggleComplete={onToggleComplete}
              workDayEnd={workDayEnd}
            />
          );
        })}

      </div>
    </div>
  );
}
