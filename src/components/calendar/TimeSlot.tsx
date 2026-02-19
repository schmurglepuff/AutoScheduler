import { useDroppable } from '@dnd-kit/core';

interface TimeSlotProps {
  droppableId: string;
  isOver: boolean;
}

export function TimeSlot({ droppableId, isOver }: TimeSlotProps) {
  const { setNodeRef } = useDroppable({ id: droppableId });

  return (
    <div
      ref={setNodeRef}
      className={`h-8 border-t border-gray-100 dark:border-gray-800 transition-colors
        ${isOver ? 'bg-accent/10' : ''}`}
    />
  );
}
