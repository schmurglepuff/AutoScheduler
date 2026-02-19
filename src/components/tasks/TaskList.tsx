import { useState } from 'react';
import type { Task, Priority } from '../../types';
import { TaskCard } from './TaskCard';
import { TaskForm } from './TaskForm';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useTasks } from '../../hooks/useTasks';

interface TaskFormData {
  title: string;
  description: string;
  estimated_min: number;
  deadline: string;
  priority: Priority;
  completed: boolean;
  people_notes: { person_name: string; note_text: string }[];
}

export function TaskList() {
  const { tasks, isLoading, createTask, updateTask, deleteTask } = useTasks();
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const handleCreate = (data: TaskFormData) => {
    createTask.mutate(data, {
      onSuccess: () => setShowForm(false),
    });
  };

  const handleUpdate = (data: TaskFormData) => {
    if (!editingTask) return;
    updateTask.mutate(
      { id: editingTask.id, ...data },
      { onSuccess: () => setEditingTask(null) }
    );
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this task?')) {
      deleteTask.mutate(id);
    }
  };

  const handleToggleComplete = (task: Task) => {
    updateTask.mutate({ id: task.id, completed: !task.completed });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">Loading tasks...</div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Tasks</h2>
        <Button onClick={() => setShowForm(true)}>+ New Task</Button>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-lg">No tasks yet</p>
          <p className="text-sm mt-1">Create your first task to get started</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={setEditingTask}
              onDelete={handleDelete}
              onToggleComplete={handleToggleComplete}
            />
          ))}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="New Task">
        <TaskForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          isSubmitting={createTask.isPending}
        />
      </Modal>

      <Modal
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        title="Edit Task"
      >
        {editingTask && (
          <TaskForm
            initialTask={editingTask}
            onSubmit={handleUpdate}
            onCancel={() => setEditingTask(null)}
            isSubmitting={updateTask.isPending}
          />
        )}
      </Modal>
    </div>
  );
}
