import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import type { Task, Priority } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { EstimatedTimeInput } from '../ui/EstimatedTimeInput';
import { PersonNoteInput } from './PersonNoteInput';
import { useProjects } from '../../hooks/useProjects';

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
    project_id: string | null;
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

/** Snap minutes to nearest 15, capped at 23:45 total. */
function snapToSlot(totalMin: number): { h: string; m: string } {
  const capped = Math.max(0, Math.min(totalMin, 23 * 60 + 45));
  const snapped = Math.round(capped / 15) * 15;
  return {
    h: String(Math.floor(snapped / 60)).padStart(2, '0'),
    m: String(snapped % 60).padStart(2, '0'),
  };
}

function initTimeSlot(totalEstMin: number): { date: string; startH: string; startM: string; endH: string; endM: string } {
  const now = new Date();
  const startMinOfDay = now.getHours() * 60 + Math.floor(now.getMinutes() / 15) * 15;
  const start = snapToSlot(startMinOfDay);
  const end = snapToSlot(startMinOfDay + totalEstMin);
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { date: `${y}-${mo}-${d}`, startH: start.h, startM: start.m, endH: end.h, endM: end.m };
}

export interface TaskFormHandle {
  submit: () => void;
}

export const TaskForm = forwardRef<TaskFormHandle, TaskFormProps>(function TaskForm(
  { initialTask, defaultDeadline, defaultEstimatedMin, workdayMin = 480, onSubmit, onCancel, onDelete, isSubmitting, hideActions }: TaskFormProps,
  ref
) {
  const { projects, createProject } = useProjects();
  const [title, setTitle] = useState(initialTask?.title || '');
  const [description, setDescription] = useState(initialTask?.description || '');

  const initEst = parseInitialEstimate(initialTask?.estimated_min ?? defaultEstimatedMin, workdayMin);
  const [estDays, setEstDays] = useState(initEst.days);
  const [estHours, setEstHours] = useState(initEst.hours);
  const [estMins, setEstMins] = useState(initEst.mins);

  const [showTimeSlot, setShowTimeSlot] = useState(false);
  const [slotTimes] = useState(() => {
    const totalMin = parseInt(initEst.days) * workdayMin + parseInt(initEst.hours) * 60 + parseInt(initEst.mins);
    return initTimeSlot(totalMin);
  });
  const [slotDate, setSlotDate] = useState(slotTimes.date);
  const [slotStartH, setSlotStartH] = useState(slotTimes.startH);
  const [slotStartM, setSlotStartM] = useState(slotTimes.startM);
  const [slotEndH, setSlotEndH] = useState(slotTimes.endH);
  const [slotEndM, setSlotEndM] = useState(slotTimes.endM);

  const hasNoDeadline = initialTask ? initialTask.deadline === null : true;
  const initDl = parseInitialDeadline(initialTask?.deadline || defaultDeadline || undefined);
  const [noDeadline, setNoDeadline] = useState(hasNoDeadline);
  const [dlDate, setDlDate] = useState(initDl.date);
  const [dlHour, setDlHour] = useState(initDl.hour);
  const [dlMinute, setDlMinute] = useState(initDl.minute);

  const [priority, setPriority] = useState<Priority>(initialTask?.priority || 'Medium');
  const [completed, setCompleted] = useState(initialTask?.completed || false);

  const defaultProjectId = initialTask?.project_id ?? localStorage.getItem('lastProjectId') ?? null;
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  const [notes, setNotes] = useState<PersonNoteEntry[]>(
    initialTask?.people_notes?.map((n) => ({
      person_name: n.person_name,
      note_text: n.note_text,
    })) || []
  );

  // Bidirectional sync helpers
  const handleEstimatedChange = (d: string, h: string, m: string) => {
    setEstDays(d); setEstHours(h); setEstMins(m);
    const totalMin = parseInt(d) * workdayMin + parseInt(h) * 60 + parseInt(m);
    const startTotal = parseInt(slotStartH) * 60 + parseInt(slotStartM);
    const end = snapToSlot(startTotal + totalMin);
    setSlotEndH(end.h); setSlotEndM(end.m);
  };

  const handleSlotStartChange = (h: string, m: string) => {
    setSlotStartH(h); setSlotStartM(m);
    const totalMin = parseInt(estDays) * workdayMin + parseInt(estHours) * 60 + parseInt(estMins);
    const startTotal = parseInt(h) * 60 + parseInt(m);
    const end = snapToSlot(startTotal + totalMin);
    setSlotEndH(end.h); setSlotEndM(end.m);
  };

  const handleSlotEndChange = (h: string, m: string) => {
    setSlotEndH(h); setSlotEndM(m);
    const startTotal = parseInt(slotStartH) * 60 + parseInt(slotStartM);
    const endTotal = parseInt(h) * 60 + parseInt(m);
    const diff = endTotal - startTotal;
    if (diff <= 0) return;
    const days = Math.floor(diff / workdayMin);
    const rem = diff - days * workdayMin;
    setEstDays(String(days)); setEstHours(String(Math.floor(rem / 60))); setEstMins(String(rem % 60));
  };

  useImperativeHandle(ref, () => ({
    submit() {
      if (!title.trim() || (!noDeadline && !dlDate)) return;
      let deadline: string | null = null;
      if (!noDeadline) {
        const [y, m, d] = dlDate.split('-').map(Number);
        deadline = new Date(y, m - 1, d, parseInt(dlHour), parseInt(dlMinute)).toISOString();
      }
      const totalMin = parseInt(estDays) * workdayMin + parseInt(estHours) * 60 + parseInt(estMins);
      localStorage.setItem('lastProjectId', projectId ?? '');
      onSubmit({
        title: title.trim(),
        description: description.trim(),
        estimated_min: totalMin || 15,
        deadline,
        priority,
        completed,
        people_notes: notes.filter((n) => n.person_name.trim() && n.note_text.trim()),
        project_id: projectId,
      });
    },
  }), [title, description, noDeadline, dlDate, dlHour, dlMinute, estDays, estHours, estMins, priority, completed, notes, projectId, onSubmit]);

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

    localStorage.setItem('lastProjectId', projectId ?? '');
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      estimated_min: (parseInt(estDays) * workdayMin + parseInt(estHours) * 60 + parseInt(estMins)) || 15,
      deadline,
      priority,
      completed,
      people_notes: notes.filter((n) => n.person_name.trim() && n.note_text.trim()),
      project_id: projectId,
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
          onChange={handleEstimatedChange}
        />
      </div>

      {/* Start & End Time (collapsible) */}
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => setShowTimeSlot((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors py-0.5 w-fit"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${showTimeSlot ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Start & End Time
        </button>
        {showTimeSlot && (
          <div className="mt-2 flex flex-col gap-2 pl-1">
            <Input
              type="date"
              value={slotDate}
              onChange={(e) => setSlotDate(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Start</span>
                <div className="flex gap-1">
                  <Select
                    value={slotStartH}
                    onChange={(e) => handleSlotStartChange(e.target.value, slotStartM)}
                    options={clockHourOptions}
                  />
                  <Select
                    value={slotStartM}
                    onChange={(e) => handleSlotStartChange(slotStartH, e.target.value)}
                    options={clockMinuteOptions}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">End</span>
                <div className="flex gap-1">
                  <Select
                    value={slotEndH}
                    onChange={(e) => handleSlotEndChange(e.target.value, slotEndM)}
                    options={clockHourOptions}
                  />
                  <Select
                    value={slotEndM}
                    onChange={(e) => handleSlotEndChange(slotEndH, e.target.value)}
                    options={clockMinuteOptions}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
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
      {/* Project */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Project</label>
        {addingProject ? (
          <div className="flex gap-2">
            <input
              ref={newProjectInputRef}
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const name = newProjectName.trim();
                  if (!name) { setAddingProject(false); return; }
                  const result = await createProject.mutateAsync(name);
                  setProjectId(result.id);
                  setNewProjectName('');
                  setAddingProject(false);
                } else if (e.key === 'Escape') {
                  setNewProjectName('');
                  setAddingProject(false);
                }
              }}
              onBlur={async () => {
                const name = newProjectName.trim();
                if (!name) { setAddingProject(false); return; }
                const result = await createProject.mutateAsync(name);
                setProjectId(result.id);
                setNewProjectName('');
                setAddingProject(false);
              }}
              autoFocus
              placeholder="Project name…"
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
            />
            <button
              type="button"
              onClick={() => { setNewProjectName(''); setAddingProject(false); }}
              className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-2"
            >
              ✕
            </button>
          </div>
        ) : (
          <select
            value={projectId ?? ''}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                setAddingProject(true);
                setTimeout(() => newProjectInputRef.current?.focus(), 0);
              } else {
                setProjectId(e.target.value || null);
              }
            }}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option value="__new__">＋ New project…</option>
          </select>
        )}
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
