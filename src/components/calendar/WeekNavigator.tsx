import type { ReactNode } from 'react';

interface WeekNavigatorProps {
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  viewMode?: 'week' | 'month';
  onToggleView?: () => void;
}

export function WeekNavigator({ onPrev, onNext, onToday, leading, trailing, viewMode = 'week', onToggleView }: WeekNavigatorProps) {
  return (
    <div className="flex items-center">
      <div className="flex-none">{leading}</div>
      <div className="flex items-center gap-3 flex-1 justify-center">
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
        {onToggleView && (
          <div className="ml-2 flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-medium">
            <button
              onClick={viewMode === 'month' ? onToggleView : undefined}
              className={`px-3 py-1 transition-colors ${
                viewMode === 'week'
                  ? 'bg-accent text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Week
            </button>
            <button
              onClick={viewMode === 'week' ? onToggleView : undefined}
              className={`px-3 py-1 transition-colors ${
                viewMode === 'month'
                  ? 'bg-accent text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Month
            </button>
          </div>
        )}
      </div>
      <div className="flex-none">{trailing}</div>
    </div>
  );
}
