import { useState, forwardRef, useImperativeHandle } from 'react';
import type { Task, Priority } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { EstimatedTimeInput } from '../ui/EstimatedTimeInput';
import { PersonNoteInput } from './PersonNoteInput';

interface PersonNoteEntry {
  person_name: string;
  note_text: string;
}

interface TaskFormProps {
  initialTask?: Task;
  defaultDeadline?: string;
  /** Pre-fill estimated time (in minutes) when creating from a calendar drag selection. */
  defaultEstimatedMin?: number;
  /** Minutes per workday (from settings). 1d in the form = this many minutes. Default 480. */
  workdayMin?: number;
  onSubmit: (data: {
    title: string;
    description: string;
    estimated_min: number;
    deadline: string | null;
    priority: Priority;
    completed: boolean;
    people_notes: PersonNoteEntry[];
  }) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSubmitting?: boolean;
  /** Hide the Cancel/Save/Delete button row (used by inline editor which provides its own actions). */
  hideActions?: boolean;
}

const clockHourOptions = Array.from({ length: 24 }, (_, i) => ({
  value: String(i).padStart(2, '0'),
  label: String(i).padStart(2, '0'),
}));

const clockMinuteOptions = [0, 15, 30, 45].map((m) => ({
  value: String(m).padStart(2, '0'),
  label: String(m).padStart(2, '0'),
}));

function parseInitialDeadline(deadline?: string): { date: string; hour: string; minute: string } {
  if (!deadline) {
    // Default: tomorrow at 17:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    return { date: `${y}-${m}-${d}`, hour: '17', minute: '00' };
  }
  const dt = new Date(deadline);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const h = String(dt.getHours()).padStart(2, '0');
  const min = String(Math.floor(dt.getMinutes() / 15) * 15).padStart(2, '0');
  return { date: `${y}-${m}-${d}`, hour: h, minute: min };
}

function parseInitialEstimate(minutes: number | undefined, workdayMin: number): { days: string; hours: string; mins: string } {
  const total = minutes || 60;
  const days = Math.floor(total / workdayMin);
  const remaining = total - days * workdayMin;
  return {
    days: String(days),
    hours: String(Math.floor(remaining / 60)),
    mins: String(remaining % 60),
  };
}

export interface TaskFormHandle {
  submit: () => void;
}

export const TaskForm = forwardRef<TaskFormHandle, TaskFormProps>(function TaskForm(
  { initialTask, defaultDeadline, defaultEstimatedMin, workdayMin = 480, onSubmit, onCancel, onDelete, isSubmitting, hideActions }: TaskFormProps,
  ref
) {
  const [title, setTitle] = useState(initialTask?.title || '');
  const [description, setDescription] = useState(initialTask?.description || '');

  const initEst = parseInitialEstimate(initialTask?.estimated_min ?? defaultEstimatedMin, workdayMin);
  const [estDays, setEstDays] = useState(initEst.days);
  const [estHours, setEstHours] = useState(initEst.hours);
  const [estMins, setEstMins] = useState(initEst.mins);

  const hasNoDeadline = initialTask ? initialTask.deadline === null : true;
  const initDl = parseInitialDeadline(initialTask?.deadline || defaultDeadline || undefined);
  const [noDeadline, setNoDeadline] = useState(hasNoDeadline);
  const [dlDate, setDlDate] = useState(initDl.date);
  const [dlHour, setDlHour] = useState(initDl.hour);
  const [dlMinute, setDlMinute] = useState(initDl.minute);

  const [priority, setPriority] = useState<Priority>(initialTask?.priority || 'Medium');
  const [completed, setCompleted] = useState(initialTask?.completed || false);
  const [notes, setNotes] = useState<PersonNoteEntry[]>(
    initialTask?.people_notes?.map((n) => ({
      person_name: n.person_name,
      note_text: n.note_text,
    })) || []
  );

  useImperativeHandle(ref, () => ({
    submit() {
      if (!title.trim() || (!noDeadline && !dlDate)) return;
      let deadline: string | null = null;
      if (!noDeadline) {
        const [y, m, d] = dlDate.split('-').map(Number);
        deadline = new Date(y, m - 1, d, parseInt(dlHour), parseInt(dlMinute)).toISOString();
      }
      const totalMin = parseInt(estDays) * workdayMin + parseInt(estHours) * 60 + parseInt(estMins);
      onSubmit({
        title: title.trim(),
        description: description.trim(),
        estimated_min: totalMin || 15,
        deadline,
        priority,
        completed,
        people_notes: notes.filter((n) => n.person_name.trim() && n.note_text.trim()),
      });
    },
  }), [title, description, noDeadline, dlDate, dlHour, dlMinute, estDays, estHours, estMins, priority, completed, notes, onSubmit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!noDeadline && !dlDate) return;

    let deadline: string | null = null;
    if (!noDeadline) {
      const [y, m, d] = dlDate.split('-').map(Number);
      const deadlineDate = new Date(y, m - 1, d, parseInt(dlHour), parseInt(dlMinute));
      deadline = deadlineDate.toISOString();
    }

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      estimated_min: (parseInt(estDays) * workdayMin + parseInt(estHours) * 60 + parseInt(estMins)) || 15,
      deadline,
      priority,
      completed,
      people_notes: notes.filter((n) => n.person_name.trim() && n.note_text.trim()),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        required
      />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          rows={3}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800
            px-3 py-2 text-sm text-gray-900 dark:text-gray-100
            focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent
            placeholder:text-gray-400 resize-none"
        />
      </div>

      {/* Estimated Time */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Time</label>
        <EstimatedTimeInput
          days={estDays}
          hours={estHours}
          mins={estMins}
          onChange={(d, h, m) => { setEstDays(d); setEstHours(h); setEstMins(m); }}
        />
      </div>

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
            <Input
              type="date"
              value={dlDate}
              onChange={(e) => setDlDate(e.target.value)}
            />
            <Select
              value={dlHour}
              onChange={(e) => setDlHour(e.target.value)}
              options={clockHourOptions}
            />
            <Select
              value={dlMinute}
              onChange={(e) => setDlMinute(e.target.value)}
              options={clockMinuteOptions}
            />
          </div>
        )}
      </div>

      {/* Priority */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
        <div className="flex gap-2">
          {(['Low', 'Medium', 'High'] as Priority[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={`flex-1 py-1 text-xs font-semibold rounded-md border transition-colors ${
                priority === p
                  ? p === 'Low'
                    ? 'bg-green-500 border-green-500 text-white'
                    : p === 'Medium'
                    ? 'bg-yellow-500 border-yellow-500 text-white'
                    : 'bg-red-500 border-red-500 text-white'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-400'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {initialTask && (
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={completed}
            onChange={(e) => setCompleted(e.target.checked)}
            className="rounded"
          />
          Completed
        </label>
      )}
      <PersonNoteInput notes={notes} onChange={setNotes} />
      {!hideActions && (
        <div className="flex gap-2 justify-between pt-2">
          {onDelete ? (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim() || (!noDeadline && !dlDate)}>
              {initialTask ? 'Save' : 'Create Task'}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
});
