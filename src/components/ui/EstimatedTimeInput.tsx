interface EstimatedTimeInputProps {
  days: string;
  hours: string;
  mins: string;
  onChange: (days: string, hours: string, mins: string) => void;
}

const fields = [
  { key: 'days' as const, label: 'Days', step: 1 },
  { key: 'hours' as const, label: 'Hours', step: 1 },
  { key: 'mins' as const, label: 'Minutes', step: 15 },
];

export function EstimatedTimeInput({ days, hours, mins, onChange }: EstimatedTimeInputProps) {
  const values = { days, hours, mins };

  const set = (key: 'days' | 'hours' | 'mins', raw: string) => {
    const next = { days, hours, mins, [key]: raw };
    onChange(next.days, next.hours, next.mins);
  };

  const increment = (key: 'days' | 'hours' | 'mins', step: number) => {
    const current = parseInt(values[key]) || 0;
    set(key, String(current + step));
  };

  const decrement = (key: 'days' | 'hours' | 'mins', step: number) => {
    const current = parseInt(values[key]) || 0;
    set(key, String(Math.max(0, current - step)));
  };

  return (
    <div className="flex gap-2">
      {fields.map(({ key, label, step }) => (
        <div key={key} className="flex-1 flex flex-col gap-1 rounded-lg border border-gray-200 dark:border-gray-600 p-2">
          <span className="text-xs font-medium text-center text-gray-500 dark:text-gray-400">{label}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => decrement(key, step)}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm leading-none shrink-0"
            >
              −
            </button>
            <input
              type="number"
              min={0}
              value={values[key]}
              onChange={(e) => set(key, e.target.value)}
              className="w-full min-w-0 text-center text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-1 px-1 focus:outline-none focus:ring-2 focus:ring-accent/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => increment(key, step)}
              className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm leading-none shrink-0"
            >
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
