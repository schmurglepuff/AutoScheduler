import { useDroppable } from '@dnd-kit/core';

interface TimeSlotProps {
  droppableId: string;
  isOver: boolean;
  onCreateTask?: () => void;
}

export function TimeSlot({ droppableId, isOver, onCreateTask }: TimeSlotProps) {
  const { setNodeRef } = useDroppable({ id: droppableId });

  return (
    <div
      ref={setNodeRef}
      className={`group/cell h-8 border-t border-gray-100 dark:border-gray-800 transition-colors relative
        ${isOver ? 'bg-accent/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
    >
      {onCreateTask && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCreateTask();
          }}
          className="absolute inset-0 w-full h-full flex items-center justify-center
            opacity-0 group-hover/cell:opacity-100 transition-opacity z-10"
          title="Create new task"
        >
          <span className="w-5 h-5 rounded-full bg-accent/80 hover:bg-accent text-white flex items-center justify-center text-sm font-bold leading-none shadow-sm transition-colors">
            +
          </span>
        </button>
      )}
    </div>
  );
}
