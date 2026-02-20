import { useState, useMemo, useRef } from 'react';
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
import { startOfWeek, startOfMonth, addDays, getHoursArray, parseTimeString } from '../../utils/dateHelpers';
import { WeekNavigator } from './WeekNavigator';
import { DayColumn } from './DayColumn';
import { ScheduledBlock } from './ScheduledBlock';
import { MonthlyCalendar } from './MonthlyCalendar';

interface WeeklyCalendarProps {
  slots: ScheduleSlot[];
  settings: Settings;
  onSlotClick?: (slot: ScheduleSlot) => void;
  onMoveSlot?: (id: string, startTime: string, endTime: string) => void;
  onToggleLock?: (slot: ScheduleSlot) => void;
  onToggleComplete?: (slot: ScheduleSlot) => void;
  onBulkToggleLock?: (slots: ScheduleSlot[], locked: boolean) => void;
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

export function WeeklyCalendar({ slots, settings, onSlotClick, onMoveSlot, onToggleLock, onToggleComplete, onBulkToggleLock, onCreateTask, autoScheduleButton }: WeeklyCalendarProps) {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [activeSlot, setActiveSlot] = useState<ScheduleSlot | null>(null);
  const [overCellId, setOverCellId] = useState<string | null>(null);
  const [showDeadlineOnly, setShowDeadlineOnly] = useState(false);
  const savedWeekOffsetRef = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date());
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const monthDate = useMemo(() => {
    const base = startOfMonth(new Date());
    const d = new Date(base);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

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

  const visibleSlots = useMemo(() => {
    if (viewMode === 'week') {
      const dayKeys = new Set(days.map((d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`));
      return slots.filter((s) => {
        const d = new Date(s.start_time);
        return dayKeys.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      });
    }
    return slots.filter((s) => {
      const d = new Date(s.start_time);
      return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth();
    });
  }, [slots, viewMode, days, monthDate]);

  const allVisibleLocked = visibleSlots.length > 0 && visibleSlots.every((s) => s.locked);

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

  const handleToggleView = () => {
    if (viewMode === 'week') {
      // Save current week before leaving, then switch to the month containing it
      savedWeekOffsetRef.current = weekOffset;
      const base = new Date();
      const diffMonths =
        (weekStart.getFullYear() - base.getFullYear()) * 12 +
        weekStart.getMonth() - base.getMonth();
      setMonthOffset(diffMonths);
      setViewMode('month');
    } else {
      // Restore saved week if it's still in the currently viewed month,
      // otherwise fall back to the week of the 7th
      const baseWeekStart = startOfWeek(new Date());
      const savedWeekStart = addDays(baseWeekStart, savedWeekOffsetRef.current * 7);
      if (
        savedWeekStart.getMonth() === monthDate.getMonth() &&
        savedWeekStart.getFullYear() === monthDate.getFullYear()
      ) {
        setWeekOffset(savedWeekOffsetRef.current);
      } else {
        const targetWeekStart = startOfWeek(addDays(monthDate, 6));
        const diffWeeks = Math.round(
          (targetWeekStart.getTime() - baseWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
        );
        setWeekOffset(diffWeeks);
      }
      setViewMode('week');
    }
  };

  const handlePrev = () => {
    if (viewMode === 'week') setWeekOffset((o) => o - 1);
    else setMonthOffset((o) => o - 1);
  };

  const handleNext = () => {
    if (viewMode === 'week') setWeekOffset((o) => o + 1);
    else setMonthOffset((o) => o + 1);
  };

  const handleToday = () => {
    setWeekOffset(0);
    setMonthOffset(0);
  };

  const handleDayClick = (date: Date) => {
    // Switch to week view showing the clicked day's week
    const clickedWeekStart = startOfWeek(date);
    const currentWeekStart = startOfWeek(new Date());
    const diffMs = clickedWeekStart.getTime() - currentWeekStart.getTime();
    const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
    setWeekOffset(diffWeeks);
    setViewMode('week');
  };

  const displayDate = viewMode === 'month' ? monthDate : weekStart;
  const activeMonth = displayDate.getMonth();
  const activeYear = displayDate.getFullYear();

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const handleMonthTabClick = (monthIdx: number) => {
    if (viewMode === 'month') {
      const base = new Date();
      const diffMonths = (activeYear - base.getFullYear()) * 12 + monthIdx - base.getMonth();
      setMonthOffset(diffMonths);
    } else {
      const target = new Date(activeYear, monthIdx, 1);
      const targetWeekStart = startOfWeek(target);
      const baseWeekStart = startOfWeek(new Date());
      const diffWeeks = Math.round((targetWeekStart.getTime() - baseWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
      setWeekOffset(diffWeeks);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <WeekNavigator
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        leading={
          onBulkToggleLock ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onBulkToggleLock(visibleSlots, !allVisibleLocked)}
                disabled={visibleSlots.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={allVisibleLocked ? 'Unlock all visible slots' : 'Lock all visible slots'}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  {allVisibleLocked ? (
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z" />
                  ) : (
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                  )}
                </svg>
                {allVisibleLocked ? 'Unlock visible' : 'Lock visible'}
              </button>
              <button
                onClick={() => setShowDeadlineOnly((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  showDeadlineOnly
                    ? 'bg-accent/10 border-accent/40 text-accent hover:bg-accent/20'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
                title={showDeadlineOnly ? 'Show all days' : 'Show only days with deadline tasks'}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13zM8 10H6v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zM8 14H6v2h2v-2zm4 0h-2v2h2v-2z" />
                </svg>
                Deadlines
              </button>
            </div>
          ) : undefined
        }
        trailing={autoScheduleButton}
        viewMode={viewMode}
        onToggleView={handleToggleView}
      />
      {/* Calendar card with tabs */}
      <div className="relative mt-6">
        {/* Year tab – vertical, peeks from the left */}
        <div className="absolute left-0 top-0 bottom-0 -translate-x-full z-0 w-6 flex">
          <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900 border border-r-0 border-gray-200/60 dark:border-gray-800 rounded-l-xl select-none">
            <span
              className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 tracking-widest"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              {activeYear}
            </span>
          </div>
        </div>

        {/* Month tabs – full row across the top */}
        <div className="absolute -top-[22px] left-0 right-0 z-0 flex">
          {months.map((month, idx) => {
            const isActive = idx === activeMonth;
            return (
              <button
                key={month}
                onClick={() => handleMonthTabClick(idx)}
                className={`flex-1 py-1 text-[10px] font-medium rounded-t-sm border border-b-0 transition-colors
                  ${idx > 0 ? '-ml-px' : ''}
                  ${isActive
                    ? 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-200/60 dark:border-gray-800'
                    : 'bg-gray-100/80 dark:bg-gray-800/60 text-gray-400 dark:text-gray-500 border-gray-200/40 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
              >
                {month}
              </button>
            );
          })}
        </div>

        {viewMode === 'month' ? (
          <MonthlyCalendar
            slots={slots}
            settings={settings}
            year={monthDate.getFullYear()}
            month={monthDate.getMonth()}
            onDayClick={handleDayClick}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="relative z-10 flex rounded-xl bg-white dark:bg-gray-900 shadow-sm border border-gray-200/60 dark:border-gray-800 overflow-hidden">
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
                  slots={showDeadlineOnly ? slots.filter((s) => s.task?.deadline) : slots}
                  onSlotClick={onSlotClick}
                  onToggleLock={onToggleLock}
                  onToggleComplete={onToggleComplete}
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
        )}
      </div>
    </div>
  );
}
