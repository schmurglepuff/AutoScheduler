import { useState, useMemo, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  pointerWithin,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
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
      deleteTask.mutate(id, {
        onSuccess: () => setEditingTask(null),
      });
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
      <div className="flex flex-col items-center gap-3">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Tasks</h2>
        <Button onClick={() => setShowForm(true)}>+ New Task</Button>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-lg">No tasks yet</p>
          <p className="text-sm mt-1">Create your first task to get started</p>
        </div>
      ) : (
        <PriorityColumns
          tasks={tasks}
          onClickTask={setEditingTask}
          onToggleComplete={handleToggleComplete}
          onChangePriority={(id, priority) => updateTask.mutate({ id, priority })}
        />
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
            onDelete={() => handleDelete(editingTask.id)}
            isSubmitting={updateTask.isPending}
          />
        )}
      </Modal>
    </div>
  );
}

const columnConfig: { priority: Priority; label: string; headerColor: string }[] = [
  { priority: 'Low', label: 'Low', headerColor: 'bg-green-500 text-white' },
  { priority: 'Medium', label: 'Medium', headerColor: 'bg-yellow-500 text-white' },
  { priority: 'High', label: 'High', headerColor: 'bg-red-500 text-white' },
];

function DroppableColumn({
  priority,
  label,
  headerColor,
  tasks,
  onClickTask,
  onToggleComplete,
  isOver,
}: {
  priority: Priority;
  label: string;
  headerColor: string;
  tasks: Task[];
  onClickTask: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: priority });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-3 rounded-lg p-2 min-h-[120px] transition-colors ${
        isOver ? 'bg-accent/10 ring-2 ring-accent/30' : ''
      }`}
    >
      <div className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${headerColor}`}>
        {label} ({tasks.length})
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
            No {label.toLowerCase()} priority tasks
          </p>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={onClickTask}
              onToggleComplete={onToggleComplete}
            />
          ))
        )}
      </SortableContext>
    </div>
  );
}

function PriorityColumns({
  tasks,
  onClickTask,
  onToggleComplete,
  onChangePriority,
}: {
  tasks: Task[];
  onClickTask: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
  onChangePriority: (id: string, priority: Priority) => void;
}) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [overColumn, setOverColumn] = useState<Priority | null>(null);
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, Priority>>({});

  // Clear optimistic overrides once real data catches up
  useEffect(() => {
    if (Object.keys(optimisticOverrides).length === 0) return;
    const allMatch = Object.entries(optimisticOverrides).every(([id, priority]) => {
      const task = tasks.find((t) => t.id === id);
      return task && task.priority === priority;
    });
    if (allMatch) setOptimisticOverrides({});
  }, [tasks, optimisticOverrides]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const effectiveTasks = useMemo(() => {
    if (Object.keys(optimisticOverrides).length === 0) return tasks;
    return tasks.map((t) =>
      optimisticOverrides[t.id] ? { ...t, priority: optimisticOverrides[t.id] } : t
    );
  }, [tasks, optimisticOverrides]);

  const grouped = useMemo(() => {
    const map: Record<Priority, Task[]> = { High: [], Medium: [], Low: [] };
    for (const task of effectiveTasks) {
      map[task.priority].push(task);
    }
    return map;
  }, [effectiveTasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    if (!overId) {
      setOverColumn(null);
      return;
    }
    // Check if over a column directly
    if (['Low', 'Medium', 'High'].includes(overId)) {
      setOverColumn(overId as Priority);
      return;
    }
    // Over a task card — find which column it belongs to
    const overTask = tasks.find((t) => t.id === overId);
    if (overTask) {
      setOverColumn(overTask.priority);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setOverColumn(null);

    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    // Determine target priority
    let targetPriority: Priority | null = null;
    if (['Low', 'Medium', 'High'].includes(overId)) {
      targetPriority = overId as Priority;
    } else {
      const overTask = effectiveTasks.find((t) => t.id === overId);
      if (overTask) targetPriority = overTask.priority;
    }

    if (!targetPriority) return;

    const draggedTask = tasks.find((t) => t.id === taskId);
    if (draggedTask && draggedTask.priority !== targetPriority) {
      // Optimistically move the card to the new column immediately
      setOptimisticOverrides((prev) => ({ ...prev, [taskId]: targetPriority }));
      onChangePriority(taskId, targetPriority);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columnConfig.map(({ priority, label, headerColor }) => (
          <DroppableColumn
            key={priority}
            priority={priority}
            label={label}
            headerColor={headerColor}
            tasks={grouped[priority]}
            onClickTask={onClickTask}
            onToggleComplete={onToggleComplete}
            isOver={overColumn === priority}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800 border-accent shadow-lg opacity-90 rotate-2">
            <div className="font-medium text-gray-900 dark:text-gray-100">{activeTask.title}</div>
            <div className="text-xs text-gray-500 mt-1">{activeTask.estimated_min} min</div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
