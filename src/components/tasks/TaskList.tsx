import { useState, useMemo, useEffect, useRef } from 'react';
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
import type { Task, Priority, Settings } from '../../types';
import { shouldSplitTask, splitTaskData, getWorkdayMin } from '../../utils/taskSplit';
import { TaskCard } from './TaskCard';
import { TaskForm, type TaskFormHandle } from './TaskForm';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useTasks } from '../../hooks/useTasks';

interface TaskFormData {
  title: string;
  description: string;
  estimated_min: number;
  deadline: string | null;
  priority: Priority;
  completed: boolean;
  people_notes: { person_name: string; note_text: string }[];
}

export function TaskList({ settings }: { settings: Settings }) {
  const { tasks, isLoading, createTask, updateTask, deleteTask } = useTasks();
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const editFormRef = useRef<TaskFormHandle>(null);
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [doneOpen, setDoneOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isDragSelecting = useRef(false);

  const now = new Date();
  const q = query.toLowerCase().trim();
  const matches = (t: Task) =>
    !q || t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q);

  const overdueTasks = tasks.filter(
    (t) => !t.completed && t.deadline !== null && new Date(t.deadline) < now && matches(t)
  );
  const completedTasks = tasks.filter((t) => t.completed && matches(t));
  const activeTasks = tasks.filter(
    (t) => !t.completed && (t.deadline === null || new Date(t.deadline) >= now) && matches(t)
  );

  const handleCreate = async (data: TaskFormData) => {
    const workdayMin = getWorkdayMin(settings);
    const tasksToCreate =
      settings.auto_split_tasks && shouldSplitTask(data.estimated_min, workdayMin)
        ? splitTaskData(data, workdayMin)
        : [data];

    try {
      for (const t of tasksToCreate) {
        await createTask.mutateAsync(t);
      }
      setShowForm(false);
    } catch (err) {
      console.error('Failed to create task(s):', err);
    }
  };

  const handleUpdate = (data: TaskFormData) => {
    if (!editingTask) return;
    updateTask.mutate({ id: editingTask.id, ...data });
  };

  const handleEditModalClose = () => {
    editFormRef.current?.submit();
    setEditingTask(null);
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

  const handleDragSelectStart = (id: string) => {
    isDragSelecting.current = true;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDragSelectEnter = (id: string) => {
    if (!isDragSelecting.current) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected task${selectedIds.size > 1 ? 's' : ''}?`)) return;
    for (const id of selectedIds) {
      deleteTask.mutate(id);
    }
    setSelectedIds(new Set());
  };

  useEffect(() => {
    const endDrag = () => { isDragSelecting.current = false; };
    window.addEventListener('pointerup', endDrag);
    return () => window.removeEventListener('pointerup', endDrag);
  }, []);

  useEffect(() => {
    if (selectedIds.size === 0) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (target.closest('[data-task-card]')) return;
      setSelectedIds(new Set());
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [selectedIds]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === 'Escape') {
        if (selectedIds.size > 0) setSelectedIds(new Set());
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (selectedIds.size === 0) return;
      e.preventDefault();
      if (!confirm(`Delete ${selectedIds.size} selected task${selectedIds.size > 1 ? 's' : ''}?`)) return;
      for (const id of selectedIds) {
        deleteTask.mutate(id);
      }
      setSelectedIds(new Set());
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, deleteTask]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">Loading tasks...</div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-center text-gray-900 dark:text-gray-100">Tasks</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search tasks..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim()) setDoneOpen(true);
              }}
              className="w-full pl-8 pr-8 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ×
              </button>
            )}
          </div>
          <Button onClick={() => setShowForm(true)}>+ New Task</Button>
        </div>
      </div>

      {overdueTasks.length > 0 && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-2 bg-red-500 text-white font-semibold text-sm"
            onClick={() => setOverdueOpen((o) => !o)}
          >
            <span>Overdue ({overdueTasks.length})</span>
            <span className="text-base">{overdueOpen ? '▾' : '▸'}</span>
          </button>
          {overdueOpen && (
            <div className="flex flex-col gap-2 p-3 bg-red-50 dark:bg-red-950/20">
              {overdueTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={setEditingTask}
                  onToggleComplete={handleToggleComplete}
                  selected={selectedIds.has(task.id)}
                  onDragSelectStart={handleDragSelectStart}
                  onDragSelectEnter={handleDragSelectEnter}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-lg">No tasks yet</p>
          <p className="text-sm mt-1">Create your first task to get started</p>
        </div>
      ) : q && activeTasks.length === 0 && overdueTasks.length === 0 && completedTasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-lg">No tasks match "{query}"</p>
        </div>
      ) : activeTasks.length > 0 ? (
        <PriorityColumns
          tasks={activeTasks}
          onClickTask={setEditingTask}
          onToggleComplete={handleToggleComplete}
          onChangePriority={(id, priority) => updateTask.mutate({ id, priority })}
          selectedIds={selectedIds}
          onDragSelectStart={handleDragSelectStart}
          onDragSelectEnter={handleDragSelectEnter}
        />
      ) : null}

      {completedTasks.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-semibold text-sm"
            onClick={() => setDoneOpen((o) => !o)}
          >
            <span>Done ({completedTasks.length})</span>
            <span className="text-base">{doneOpen ? '▾' : '▸'}</span>
          </button>
          {doneOpen && (
            <div className="flex flex-col gap-2 p-3">
              {completedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={setEditingTask}
                  onToggleComplete={handleToggleComplete}
                  selected={selectedIds.has(task.id)}
                  onDragSelectStart={handleDragSelectStart}
                  onDragSelectEnter={handleDragSelectEnter}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="New Task">
        <TaskForm
          workdayMin={getWorkdayMin(settings)}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          isSubmitting={createTask.isPending}
        />
      </Modal>

      <Modal
        isOpen={!!editingTask}
        onClose={handleEditModalClose}
        title="Edit Task"
      >
        {editingTask && (
          <TaskForm
            ref={editFormRef}
            initialTask={editingTask}
            workdayMin={getWorkdayMin(settings)}
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
  selectedIds,
  onDragSelectStart,
  onDragSelectEnter,
}: {
  priority: Priority;
  label: string;
  headerColor: string;
  tasks: Task[];
  onClickTask: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
  isOver: boolean;
  selectedIds: Set<string>;
  onDragSelectStart: (id: string) => void;
  onDragSelectEnter: (id: string) => void;
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
              selected={selectedIds.has(task.id)}
              onDragSelectStart={onDragSelectStart}
              onDragSelectEnter={onDragSelectEnter}
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
  selectedIds,
  onDragSelectStart,
  onDragSelectEnter,
}: {
  tasks: Task[];
  onClickTask: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
  onChangePriority: (id: string, priority: Priority) => void;
  selectedIds: Set<string>;
  onDragSelectStart: (id: string) => void;
  onDragSelectEnter: (id: string) => void;
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
            selectedIds={selectedIds}
            onDragSelectStart={onDragSelectStart}
            onDragSelectEnter={onDragSelectEnter}
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
