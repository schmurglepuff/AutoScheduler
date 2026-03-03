import { useState, useEffect, useRef } from 'react';
import type { Priority } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

const dayOptions = Array.from({ length: 31 }, (_, i) => ({ value: String(i), label: `${i}d` }));
const hourOptions = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${i}h` }));
const minuteOptions = [0, 15, 30, 45].map((m) => ({ value: String(m), label: `${m}m` }));

const clockHourOptions = Array.from({ length: 24 }, (_, i) => ({
  value: String(i).padStart(2, '0'),
  label: String(i).padStart(2, '0'),
}));

const clockMinuteOptions = [0, 15, 30, 45].map((m) => ({
  value: String(m).padStart(2, '0'),
  label: String(m).padStart(2, '0'),
}));

function defaultDeadlineValues() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const d = String(tomorrow.getDate()).padStart(2, '0');
  return { date: `${y}-${m}-${d}`, hour: '17', minute: '00' };
}

interface InlineTaskCreatorProps {
  workdayMin: number;
  onSubmit: (data: {
    title: string;
    description: string;
    estimated_min: number;
    deadline: string | null;
    priority: Priority;
    completed: boolean;
    people_notes: { person_name: string; note_text: string }[];
  }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function InlineTaskCreator({ workdayMin, onSubmit, onCancel, isSubmitting }: InlineTaskCreatorProps) {
  const [title, setTitle] = useState('');
  const [estDays, setEstDays] = useState('0');
  const [estHours, setEstHours] = useState('1');
  const [estMins, setEstMins] = useState('0');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [noDeadline, setNoDeadline] = useState(true);
  const dl = defaultDeadlineValues();
  const [dlDate, setDlDate] = useState(dl.date);
  const [dlHour, setDlHour] = useState(dl.hour);
  const [dlMinute, setDlMinute] = useState(dl.minute);

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) return;
    if (!noDeadline && !dlDate) return;

    let deadline: string | null = null;
    if (!noDeadline) {
      const [y, m, d] = dlDate.split('-').map(Number);
      deadline = new Date(y, m - 1, d, parseInt(dlHour), parseInt(dlMinute)).toISOString();
    }

    const totalMin = parseInt(estDays) * workdayMin + parseInt(estHours) * 60 + parseInt(estMins);
    onSubmit({
      title: title.trim(),
      description: '',
      estimated_min: totalMin || 15,
      deadline,
      priority,
      completed: false,
      people_notes: [],
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };

  const totalEstimatedMin = parseInt(estDays) * workdayMin + parseInt(estHours) * 60 + parseInt(estMins);

  return (
    <div className="border-2 border-accent rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          ref={titleRef}
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Task title"
          required
        />

        {/* Estimated Time */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Time</label>
          <div className="grid grid-cols-3 gap-2">
            <Select value={estDays} onChange={(e) => setEstDays(e.target.value)} options={dayOptions} />
            <Select value={estHours} onChange={(e) => setEstHours(e.target.value)} options={hourOptions} />
            <Select value={estMins} onChange={(e) => setEstMins(e.target.value)} options={minuteOptions} />
          </div>
          {totalEstimatedMin > 0 && (
            <span className="text-xs text-gray-400 mt-0.5">
              {[
                parseInt(estDays) > 0 ? `${estDays}d` : '',
                parseInt(estHours) > 0 ? `${estHours}h` : '',
                parseInt(estMins) > 0 ? `${estMins}m` : '',
              ].filter(Boolean).join(' ')}
            </span>
          )}
        </div>

        <Select
          label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          options={[
            { value: 'High', label: 'High' },
            { value: 'Medium', label: 'Medium' },
            { value: 'Low', label: 'Low' },
          ]}
        />

        {/* Deadline */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Deadline</label>
            <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={noDeadline}
                onChange={(e) => setNoDeadline(e.target.checked)}
                className="rounded"
              />
              No deadline
            </label>
          </div>
          {!noDeadline && (
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
              <Input type="date" value={dlDate} onChange={(e) => setDlDate(e.target.value)} />
              <Select value={dlHour} onChange={(e) => setDlHour(e.target.value)} options={clockHourOptions} />
              <Select value={dlMinute} onChange={(e) => setDlMinute(e.target.value)} options={clockMinuteOptions} />
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || !title.trim() || (!noDeadline && !dlDate)}>
            Create Task
          </Button>
        </div>
      </form>
    </div>
  );
}
