import { useDraggable } from '@dnd-kit/core';
import type { ScheduleSlot } from '../../types';
import { formatTime } from '../../utils/dateHelpers';

const priorityStyle: Record<string, { bg: string; borderColor: string; text: string }> = {
  High: {
    bg: 'bg-red-100 dark:bg-red-400/30',
    borderColor: '#ef4444',
    text: 'text-red-900 dark:text-red-200',
  },
  Medium: {
    bg: 'bg-amber-100 dark:bg-amber-500/30',
    borderColor: '#f59e0b',
    text: 'text-amber-900 dark:text-amber-200',
  },
  Low: {
    bg: 'bg-emerald-100 dark:bg-emerald-500/30',
    borderColor: '#10b981',
    text: 'text-emerald-900 dark:text-emerald-200',
  },
};

interface ScheduledBlockProps {
  slot: ScheduleSlot;
  topPercent: number;
  heightPercent: number;
  onClick?: (slot: ScheduleSlot) => void;
  onToggleLock?: (slot: ScheduleSlot) => void;
  onToggleComplete?: (slot: ScheduleSlot) => void;
  isDragOverlay?: boolean;
  workDayEnd?: string;
}

export function ScheduledBlock({ slot, topPercent, heightPercent, onClick, onToggleLock, onToggleComplete, isDragOverlay, workDayEnd }: ScheduledBlockProps) {
  const isLocked = !!slot.locked;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `slot-${slot.id}`,
    data: { slot },
    disabled: isLocked,
  });

  const priority = slot.task?.priority || 'Medium';
  const pStyle = priorityStyle[priority] || priorityStyle.Medium;
  const start = new Date(slot.start_time);
  const end = new Date(slot.end_time);
  const now = new Date();
  const deadlineDate = slot.task?.deadline ? new Date(slot.task.deadline) : null;
  // Overdue when: not completed AND this block's time is at least partially in the past
  // Applies to ALL tasks (with or without deadline) — if the time has passed and it's not done, it's overdue
  const isOverdue = !slot.task?.completed && now > start;
  // How much of this block has elapsed: 100% if fully past, partial if current time is within the block
  const overduePercent = isOverdue ? (now >= end ? 100 : ((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100) : 0;
  const isFullyOverdue = isOverdue && now >= end;
  const isPartiallyOverdue = isOverdue && !isFullyOverdue;

  // Check if the slot starts at or after work_day_end
  let isOutsideWorkHours = false;
  if (workDayEnd) {
    const [endH, endM] = workDayEnd.split(':').map(Number);
    const workEnd = new Date(start);
    workEnd.setHours(endH, endM, 0, 0);
    isOutsideWorkHours = start >= workEnd;
  }

  const dragProps = isLocked || isDragOverlay ? {} : { ...attributes, ...listeners };

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      {...dragProps}
      className={`group scheduled-block ${isDragOverlay ? '' : 'absolute'} left-1 right-1 rounded-md border-l-3 px-2.5 py-1.5 overflow-hidden touch-none
        ${isLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
        ${pStyle.bg} transition-all
        ${isLocked ? 'ring-2 ring-gray-400 dark:ring-gray-500 bg-stripes' : ''}
        ${isFullyOverdue && !isLocked ? 'ring-2 ring-red-500 dark:ring-red-500' : ''}
        ${isPartiallyOverdue && !isLocked ? 'ring-2 ring-amber-400 dark:ring-amber-400' : ''}
        ${isDragging ? 'opacity-30' : ''}
        ${isDragOverlay ? 'shadow-lg rotate-1 opacity-90' : ''}`}
      style={{
        ...(!isDragOverlay ? {
          top: `${topPercent}%`,
          height: `${Math.max(heightPercent, 4)}%`,
        } : {}),
        '--block-border-color': pStyle.borderColor,
      } as React.CSSProperties}
      onClick={(e) => {
        if ((e.target as Element).closest('button')) return;
        if (!isDragging) onClick?.(slot);
      }}
      title={`${slot.task?.title || 'Task'}\n${formatTime(start)} – ${formatTime(end)}${isFullyOverdue && deadlineDate ? `\n⚠ Ends past deadline (${formatTime(deadlineDate)})` : isFullyOverdue ? '\n⚠ Overdue' : ''}`}
    >
      {/* Overdue wash overlay — red for fully overdue, amber for partially overdue */}
      {isFullyOverdue && !isLocked && !isDragOverlay && (
        <div
          className="absolute top-0 left-0 right-0 bg-red-500/20 dark:bg-red-500/30 rounded-md z-[1] pointer-events-none flex items-center justify-center"
          style={{ height: `${overduePercent}%` }}
        >
          <svg className="w-5 h-5 text-red-500 dark:text-red-400 opacity-70" viewBox="0 0 24 24" fill="currentColor">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
          </svg>
        </div>
      )}
      {isPartiallyOverdue && !isLocked && !isDragOverlay && (
        <div
          className="absolute top-0 left-0 right-0 bg-amber-400/20 dark:bg-amber-400/30 rounded-md z-[1] pointer-events-none"
          style={{ height: `${overduePercent}%` }}
        />
      )}

      {/* Gray wash overlay for slots placed outside work hours */}
      {isOutsideWorkHours && !isDragOverlay && (
        <div className="absolute inset-0 bg-gray-500/15 dark:bg-gray-500/20 rounded-md z-[1] pointer-events-none" />
      )}

      {/* Lock toggle button */}
      {!isDragOverlay && (
        <button
          type="button"
          className={`absolute top-0 right-0 bottom-0 w-7 flex items-center justify-center rounded-r-md transition-all ${
            isLocked
              ? 'bg-gray-500/20 dark:bg-gray-400/20 hover:bg-gray-500/30 dark:hover:bg-gray-400/30'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto hover:bg-black/10 dark:hover:bg-white/10'
          }`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock?.(slot);
          }}
          title={isLocked ? 'Unlock slot' : 'Lock slot'}
        >
          <svg className={`w-3.5 h-3.5 pointer-events-none ${isLocked ? 'text-gray-600 dark:text-gray-300' : `${pStyle.text} opacity-50`}`} viewBox="0 0 24 24" fill="currentColor">
            {isLocked ? (
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z" />
            ) : (
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
            )}
          </svg>
        </button>
      )}
      {/* Done checkbox — centered, appears on hover */}
      {!isDragOverlay && onToggleComplete && (
        <button
          type="button"
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 transition-opacity ${
            slot.task?.completed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggleComplete(slot); }}
          title={slot.task?.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {slot.task?.completed ? (
            <svg className="w-6 h-6 text-green-500 drop-shadow" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          ) : (
            <svg className="w-6 h-6 drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9"/>
            </svg>
          )}
        </button>
      )}
      <div className={`text-xs font-medium leading-tight ${pStyle.text} flex items-center gap-1`}>
        {isFullyOverdue && (
          <svg className="w-3 h-3 flex-shrink-0 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>
        )}
        <span className={`truncate ${slot.task?.completed ? 'line-through opacity-60' : ''}`}>{slot.task?.title || 'Task'}</span>
      </div>
      {(isDragOverlay || heightPercent > 6) && (
        <div className={`text-[10px] truncate ${pStyle.text} opacity-60 mt-0.5`}>
          {formatTime(start)} – {formatTime(end)}
        </div>
      )}
    </div>
  );
}
