import { Button } from '../ui/Button';
import { addDays, formatDate } from '../../utils/dateHelpers';

interface WeekNavigatorProps {
  weekStart: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function WeekNavigator({ weekStart, onPrev, onNext, onToday }: WeekNavigatorProps) {
  const weekEnd = addDays(weekStart, 6);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onPrev}>
          &larr;
        </Button>
        <Button variant="secondary" size="sm" onClick={onToday}>
          Today
        </Button>
        <Button variant="secondary" size="sm" onClick={onNext}>
          &rarr;
        </Button>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {formatDate(weekStart)} &ndash; {formatDate(weekEnd)}
      </h2>
    </div>
  );
}
