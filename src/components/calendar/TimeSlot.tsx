interface TimeSlotProps {
  hour: number;
  isEven: boolean;
}

export function TimeSlot({ hour, isEven }: TimeSlotProps) {
  return (
    <div
      className={`border-t border-gray-200 dark:border-gray-700 h-16 ${
        isEven ? 'bg-gray-50/50 dark:bg-gray-800/30' : ''
      }`}
    >
      <span className="text-xs text-gray-400 dark:text-gray-500 -mt-2 block pl-1">
        {hour.toString().padStart(2, '0')}:00
      </span>
    </div>
  );
}
