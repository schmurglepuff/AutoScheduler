import { useEffect, useRef } from 'react';
import type { Task, Priority } from '../../types';
import { TaskForm, type TaskFormHandle } from './TaskForm';
import { Button } from '../ui/Button';

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

export function InlineTaskEditor({ task, workdayMin, onSubmit, onCancel, onDelete }: InlineTaskEditorProps) {
  const formRef = useRef<TaskFormHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Click outside → auto-save and close
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        formRef.current?.submit();
        onCancel();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [onCancel]);

  return (
    <div
      ref={wrapperRef}
      className="border-2 border-accent rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <TaskForm
        ref={formRef}
        initialTask={task}
        workdayMin={workdayMin}
        onSubmit={onSubmit}
        onCancel={onCancel}
        hideActions
      />
      <div className="pt-3">
        <Button type="button" variant="danger" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}
