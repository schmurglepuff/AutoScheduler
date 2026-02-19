import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import type { ReactNode } from 'react';
import type { ScheduleSlot, Settings } from '../../types';
import { startOfWeek, addDays, getHoursArray, parseTimeString } from '../../utils/dateHelpers';
import { WeekNavigator } from './WeekNavigator';
import { DayColumn } from './DayColumn';
import { ScheduledBlock } from './ScheduledBlock';

interface WeeklyCalendarProps {
  slots: ScheduleSlot[];
  settings: Settings;
  onSlotClick?: (slot: ScheduleSlot) => void;
  onMoveSlot?: (id: string, startTime: string, endTime: string) => void;
  onToggleLock?: (slot: ScheduleSlot) => void;
  onCreateTask?: (startTime: Date) => void;
  autoScheduleButton?: ReactNode;
}

/** Parse a droppable cell ID like "cell-2026-02-19-9-30" into a local Date */
function parseCellId(cellId: string): Date | null {
  const match = cellId.match(/^cell-(\d{4})-(\d{2})-(\d{2})-(\d+)-(\d+)$/);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr, hourStr, minStr] = match;
  return new Date(
    parseInt(yearStr),
    parseInt(monthStr) - 1,
    parseInt(dayStr),
    parseInt(hourStr),
    parseInt(minStr),
    0,
    0
  );
}

export function WeeklyCalendar({ slots, settings, onSlotClick, onMoveSlot, onToggleLock, onCreateTask, autoScheduleButton }: WeeklyCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [activeSlot, setActiveSlot] = useState<ScheduleSlot | null>(null);
  const [overCellId, setOverCellId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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

  const handleDragStart = (event: DragStartEvent) => {
    const slot = (event.active.data.current as { slot: ScheduleSlot } | undefined)?.slot;
    if (slot) setActiveSlot(slot);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    setOverCellId(overId?.startsWith('cell-') ? overId : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveSlot(null);
    setOverCellId(null);

    if (!over || !onMoveSlot) return;

    const overId = over.id as string;
    if (!overId.startsWith('cell-')) return;

    const slot = (active.data.current as { slot: ScheduleSlot } | undefined)?.slot;
    if (!slot) return;

    const newStart = parseCellId(overId);
    if (!newStart) return;

    // Preserve the original duration
    const origStart = new Date(slot.start_time);
    const origEnd = new Date(slot.end_time);
    const durationMs = origEnd.getTime() - origStart.getTime();
    const newEnd = new Date(newStart.getTime() + durationMs);

    onMoveSlot(slot.id, newStart.toISOString(), newEnd.toISOString());
  };

  return (
    <div className="flex flex-col gap-4">
      <WeekNavigator
        weekStart={weekStart}
        onPrev={() => setWeekOffset((o) => o - 1)}
        onNext={() => setWeekOffset((o) => o + 1)}
        onToday={() => setWeekOffset(0)}
        trailing={autoScheduleButton}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex rounded-xl bg-white dark:bg-gray-900 shadow-sm border border-gray-200/60 dark:border-gray-800 overflow-hidden">
          {/* Time gutter */}
          <div className="w-14 shrink-0">
            <div className="h-[62px]" />
            {hours.map((hour) => (
              <div key={hour} className="h-16 relative">
                <span className="absolute top-0 -translate-y-1/2 right-3 text-[11px] text-gray-400 dark:text-gray-600 font-medium tabular-nums">
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
              onToggleLock={onToggleLock}
              onCreateTask={onCreateTask}
              overCellId={overCellId}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeSlot && (
            <div className="w-32">
              <ScheduledBlock
                slot={activeSlot}
                topPercent={0}
                heightPercent={100}
                isDragOverlay
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
