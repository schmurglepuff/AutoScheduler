import { useRef, useCallback, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../types';
import { priorityBadge } from '../../utils/priorityColors';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
  selected?: boolean;
  onDragSelectStart?: (id: string) => void;
  onDragSelectEnter?: (id: string) => void;
  onToggleSelect?: (id: string) => void;
}

export function TaskCard({ task, onClick, onToggleComplete, selected, onDragSelectStart, onDragSelectEnter, onToggleSelect }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const isOverdue = !task.completed && task.deadline !== null && new Date(task.deadline) < new Date();

  // S-key select hotkey (same pattern as L-key lock in calendar)
  const hoveredRef = useRef(false);
  const sToggledRef = useRef(false);
  const sHeldRef = useRef(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    if (e.key === 's' || e.key === 'S') {
      sHeldRef.current = true;
      if (hoveredRef.current && !sToggledRef.current) {
        sToggledRef.current = true;
        onToggleSelect?.(task.id);
      }
    }
  }, [task, onToggleSelect]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.key === 's' || e.key === 'S') sHeldRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-task-card
      {...attributes}
      {...listeners}
      onClick={() => onClick(task)}
      onPointerEnter={() => {
        hoveredRef.current = true;
        sToggledRef.current = false;
        if (sHeldRef.current) {
          sToggledRef.current = true;
          onToggleSelect?.(task.id);
        }
        // Only forward drag-select enter when S key isn't driving selection
        if (!sHeldRef.current) {
          onDragSelectEnter?.(task.id);
        }
      }}
      onPointerLeave={() => {
        hoveredRef.current = false;
        sToggledRef.current = false;
      }}
      className={`group border rounded-lg p-4 transition-colors cursor-grab active:cursor-grabbing touch-none select-none ${
        selected
          ? 'ring-2 ring-accent border-accent bg-accent/5 dark:bg-accent/10 hover:border-accent'
          : task.completed
          ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60 hover:border-accent/50'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-accent/50'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Selection indicator — stopPropagation prevents dnd-kit from handling this area */}
        <div
          className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded-sm border-2 cursor-pointer transition-all ${
            selected
              ? 'bg-accent border-accent opacity-100'
              : 'border-gray-300 dark:border-gray-600 opacity-0 group-hover:opacity-100 hover:border-accent'
          }`}
          onPointerDown={(e) => { e.stopPropagation(); onDragSelectStart?.(task.id); }}
          onClick={(e) => e.stopPropagation()}
        />
        <input
          type="checkbox"
          checked={task.completed}
          onChange={(e) => {
            e.stopPropagation();
            onToggleComplete(task);
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-0.5 w-5 h-5 rounded"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className={`font-medium text-gray-900 dark:text-gray-100 ${
                task.completed ? 'line-through' : ''
              }`}
            >
              {task.title}
            </h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityBadge[task.priority]}`}
            >
              {task.priority}
            </span>
            {isOverdue && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 font-medium">
                Overdue
              </span>
            )}
          </div>
          {task.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
              {task.description}
            </p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{task.estimated_min} min</span>
            <span>{task.deadline ? `Due: ${new Date(task.deadline).toLocaleDateString()}` : 'No deadline'}</span>
          </div>
          {task.people_notes && task.people_notes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.people_notes.map((note) => (
                <span
                  key={note.id}
                  className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full"
                  title={note.note_text}
                >
                  {note.person_name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
