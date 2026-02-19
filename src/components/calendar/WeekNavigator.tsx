import { addDays } from '../../utils/dateHelpers';

interface WeekNavigatorProps {
  weekStart: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

function formatMonth(start: Date, end: Date): string {
  const startMonth = start.toLocaleDateString([], { month: 'long' });
  const endMonth = end.toLocaleDateString([], { month: 'long' });
  const year = start.getFullYear();
  if (startMonth === endMonth) {
    return `${startMonth} ${year}`;
  }
  return `${start.toLocaleDateString([], { month: 'short' })} – ${end.toLocaleDateString([], { month: 'short' })} ${year}`;
}

export function WeekNavigator({ weekStart, onPrev, onNext, onToday }: WeekNavigatorProps) {
  const weekEnd = addDays(weekStart, 6);

  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
        {formatMonth(weekStart, weekEnd)}
      </h2>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={onToday}
          className="px-3 py-1 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Today
        </button>
        <button
          onClick={onNext}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
