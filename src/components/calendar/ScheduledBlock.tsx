import { useDraggable } from '@dnd-kit/core';
import type { ScheduleSlot } from '../../types';
import { formatTime } from '../../utils/dateHelpers';

const priorityStyle: Record<string, { bg: string; border: string; text: string }> = {
  High: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    border: 'border-l-red-400 dark:border-l-red-500',
    text: 'text-red-900 dark:text-red-200',
  },
  Medium: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-l-amber-400 dark:border-l-amber-500',
    text: 'text-amber-900 dark:text-amber-200',
  },
  Low: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-l-emerald-400 dark:border-l-emerald-500',
    text: 'text-emerald-900 dark:text-emerald-200',
  },
};

interface ScheduledBlockProps {
  slot: ScheduleSlot;
  topPercent: number;
  heightPercent: number;
  onClick?: (slot: ScheduleSlot) => void;
  isDragOverlay?: boolean;
}

export function ScheduledBlock({ slot, topPercent, heightPercent, onClick, isDragOverlay }: ScheduledBlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `slot-${slot.id}`,
    data: { slot },
  });

  const priority = slot.task?.priority || 'Medium';
  const pStyle = priorityStyle[priority] || priorityStyle.Medium;
  const start = new Date(slot.start_time);
  const end = new Date(slot.end_time);

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
      className={`${isDragOverlay ? '' : 'absolute'} left-1 right-1 rounded-md border-l-3 px-2.5 py-1.5 cursor-grab active:cursor-grabbing overflow-hidden touch-none
        ${pStyle.bg} ${pStyle.border} hover:brightness-95 dark:hover:brightness-110 transition-all
        ${isDragging ? 'opacity-30' : ''}
        ${isDragOverlay ? 'shadow-lg rotate-1 opacity-90' : ''}`}
      style={isDragOverlay ? {} : {
        top: `${topPercent}%`,
        height: `${Math.max(heightPercent, 4)}%`,
      }}
      onClick={() => !isDragging && onClick?.(slot)}
      title={`${slot.task?.title || 'Task'}\n${formatTime(start)} – ${formatTime(end)}`}
    >
      <div className={`text-xs font-medium truncate leading-tight ${pStyle.text}`}>
        {slot.task?.title || 'Task'}
      </div>
      {(isDragOverlay || heightPercent > 6) && (
        <div className={`text-[10px] truncate ${pStyle.text} opacity-60 mt-0.5`}>
          {formatTime(start)} – {formatTime(end)}
        </div>
      )}
    </div>
  );
}
