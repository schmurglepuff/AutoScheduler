import { useEffect } from 'react';
import type { Task, Priority } from '../../types';
import { TaskForm } from './TaskForm';

interface InlineTaskEditorProps {
  task: Task;
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
  onDelete: () => void;
  isSubmitting?: boolean;
}

export function InlineTaskEditor({ task, workdayMin, onSubmit, onCancel, onDelete, isSubmitting }: InlineTaskEditorProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement;
      // Don't fire when user is typing in an input/textarea
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="border-2 border-accent rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <TaskForm
        initialTask={task}
        workdayMin={workdayMin}
        onSubmit={onSubmit}
        onCancel={onCancel}
        onDelete={onDelete}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
