import { useState } from 'react';
import type { Task, Priority } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { PersonNoteInput } from './PersonNoteInput';

interface PersonNoteEntry {
  person_name: string;
  note_text: string;
}

interface TaskFormProps {
  initialTask?: Task;
  onSubmit: (data: {
    title: string;
    description: string;
    estimated_min: number;
    deadline: string;
    priority: Priority;
    completed: boolean;
    people_notes: PersonNoteEntry[];
  }) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSubmitting?: boolean;
}

export function TaskForm({ initialTask, onSubmit, onCancel, onDelete, isSubmitting }: TaskFormProps) {
  const [title, setTitle] = useState(initialTask?.title || '');
  const [description, setDescription] = useState(initialTask?.description || '');
  const [estimatedMin, setEstimatedMin] = useState(String(initialTask?.estimated_min || 60));
  const [deadline, setDeadline] = useState(
    initialTask?.deadline ? new Date(initialTask.deadline).toISOString().slice(0, 16) : ''
  );
  const [priority, setPriority] = useState<Priority>(initialTask?.priority || 'Medium');
  const [completed, setCompleted] = useState(initialTask?.completed || false);
  const [notes, setNotes] = useState<PersonNoteEntry[]>(
    initialTask?.people_notes?.map((n) => ({
      person_name: n.person_name,
      note_text: n.note_text,
    })) || []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !deadline) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      estimated_min: parseInt(estimatedMin) || 60,
      deadline: new Date(deadline).toISOString(),
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
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Estimated Minutes"
          type="number"
          min={15}
          step={15}
          value={estimatedMin}
          onChange={(e) => setEstimatedMin(e.target.value)}
        />
        <Input
          label="Deadline"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          required
        />
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
          <Button type="submit" disabled={isSubmitting || !title.trim() || !deadline}>
            {initialTask ? 'Update Task' : 'Create Task'}
          </Button>
        </div>
      </div>
    </form>
  );
}
