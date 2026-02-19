import type { ScheduleSlot } from '../../types';
import { priorityColors } from '../../utils/priorityColors';
import { formatTime } from '../../utils/dateHelpers';

interface ScheduledBlockProps {
  slot: ScheduleSlot;
  topPercent: number;
  heightPercent: number;
  onClick?: (slot: ScheduleSlot) => void;
}

export function ScheduledBlock({ slot, topPercent, heightPercent, onClick }: ScheduledBlockProps) {
  const priority = slot.task?.priority || 'Medium';
  const colors = priorityColors[priority];
  const start = new Date(slot.start_time);
  const end = new Date(slot.end_time);

  return (
    <div
      className={`absolute left-1 right-1 rounded-md border px-2 py-1 cursor-pointer overflow-hidden
        ${colors.bg} ${colors.border} hover:opacity-90 transition-opacity`}
      style={{
        top: `${topPercent}%`,
        height: `${Math.max(heightPercent, 3)}%`,
      }}
      onClick={() => onClick?.(slot)}
      title={`${slot.task?.title || 'Task'}\n${formatTime(start)} - ${formatTime(end)}`}
    >
      <div className={`text-xs font-medium truncate ${colors.text}`}>
        {slot.task?.title || 'Task'}
      </div>
      {heightPercent > 8 && (
        <div className={`text-xs truncate ${colors.text} opacity-75`}>
          {formatTime(start)} - {formatTime(end)}
        </div>
      )}
    </div>
  );
}
