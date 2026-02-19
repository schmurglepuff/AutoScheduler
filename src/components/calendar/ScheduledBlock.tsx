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
  onToggleLock?: (slot: ScheduleSlot) => void;
  isDragOverlay?: boolean;
}

export function ScheduledBlock({ slot, topPercent, heightPercent, onClick, onToggleLock, isDragOverlay }: ScheduledBlockProps) {
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

  const dragProps = isLocked || isDragOverlay ? {} : { ...attributes, ...listeners };

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      {...dragProps}
      className={`group ${isDragOverlay ? '' : 'absolute'} left-1 right-1 rounded-md border-l-3 px-2.5 py-1.5 overflow-hidden touch-none
        ${isLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
        ${pStyle.bg} ${pStyle.border} hover:brightness-95 dark:hover:brightness-110 transition-all
        ${isLocked ? 'ring-2 ring-gray-400 dark:ring-gray-500 bg-stripes' : ''}
        ${isDragging ? 'opacity-30' : ''}
        ${isDragOverlay ? 'shadow-lg rotate-1 opacity-90' : ''}`}
      style={isDragOverlay ? {} : {
        top: `${topPercent}%`,
        height: `${Math.max(heightPercent, 4)}%`,
      }}
      onClick={() => !isDragging && onClick?.(slot)}
      title={`${slot.task?.title || 'Task'}\n${formatTime(start)} – ${formatTime(end)}`}
    >
      {/* Lock toggle button */}
      {!isDragOverlay && (
        <button
          type="button"
          className={`absolute top-0 right-0 bottom-0 w-7 flex items-center justify-center rounded-r-md transition-all ${
            isLocked
              ? 'bg-gray-500/20 dark:bg-gray-400/20 hover:bg-gray-500/30 dark:hover:bg-gray-400/30'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto hover:bg-black/10 dark:hover:bg-white/10'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock?.(slot);
          }}
          title={isLocked ? 'Unlock slot' : 'Lock slot'}
        >
          <svg className={`w-3.5 h-3.5 ${isLocked ? 'text-gray-600 dark:text-gray-300' : `${pStyle.text} opacity-50`}`} viewBox="0 0 24 24" fill="currentColor">
            {isLocked ? (
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z" />
            ) : (
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
            )}
          </svg>
        </button>
      )}
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
