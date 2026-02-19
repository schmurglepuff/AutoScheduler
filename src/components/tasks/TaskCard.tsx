import type { Task } from '../../types';
import { priorityBadge } from '../../utils/priorityColors';
import { Button } from '../ui/Button';

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onToggleComplete: (task: Task) => void;
}

export function TaskCard({ task, onEdit, onDelete, onToggleComplete }: TaskCardProps) {
  const isOverdue = !task.completed && new Date(task.deadline) < new Date();

  return (
    <div
      className={`border rounded-lg p-4 transition-colors ${
        task.completed
          ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={() => onToggleComplete(task)}
            className="mt-1 rounded"
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
              <span>Due: {new Date(task.deadline).toLocaleDateString()}</span>
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
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onEdit(task)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(task.id)}>
            Del
          </Button>
        </div>
      </div>
    </div>
  );
}
