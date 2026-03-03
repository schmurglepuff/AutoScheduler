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
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import type { Task, Priority, Settings, FocusArea } from '../../types';
import { shouldSplitTask, splitTaskData, getWorkdayMin } from '../../utils/taskSplit';
import { TaskCard } from './TaskCard';
import { InlineTaskCreator } from './InlineTaskCreator';
import { InlineTaskEditor } from './InlineTaskEditor';
import { useTasks } from '../../hooks/useTasks';
import { useFocusAreas } from '../../hooks/useFocusAreas';

interface TaskFormData {
  title: string;
  description: string;
  estimated_min: number;
  deadline: string | null;
  priority: Priority;
  completed: boolean;
  people_notes: { person_name: string; note_text: string }[];
  focus_area_id?: string | null;
}

interface TaskListProps {
  settings: Settings;
  schedulerActive?: boolean;
  onTasksCreated?: (tasks: Task[]) => void;
}

export function TaskList({ settings, schedulerActive: _schedulerActive, onTasksCreated }: TaskListProps) {
  const { tasks, isLoading, createTask, updateTask, deleteTask } = useTasks();
  const [creatingInColumnId, setCreatingInColumnId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
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

  const workdayMin = getWorkdayMin(settings);

  const handleCreate = async (data: TaskFormData) => {
    const tasksToCreate = shouldSplitTask(data.estimated_min, workdayMin)
      ? splitTaskData(data, workdayMin)
      : [data];

    try {
      const createdTasks: Task[] = [];
      for (const t of tasksToCreate) {
        const newTask = await createTask.mutateAsync({
          ...t,
          focus_area_id: data.focus_area_id ?? null,
        });
        if (newTask) createdTasks.push(newTask as Task);
      }
      onTasksCreated?.(createdTasks);
      setCreatingInColumnId(null);
    } catch (err) {
      console.error('Failed to create task(s):', err);
    }
  };

  const handleUpdate = (data: TaskFormData) => {
    if (!editingTaskId) return;
    updateTask.mutate({ id: editingTaskId, ...data });
    setEditingTaskId(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this task?')) {
      deleteTask.mutate(id, {
        onSuccess: () => setEditingTaskId(null),
      });
    }
  };

  const handleClickTask = (task: Task) => {
    setEditingTaskId(task.id);
    setCreatingInColumnId(null);
  };

  const handleToggleComplete = (task: Task) => {
    updateTask.mutate({ id: task.id, completed: !task.completed });
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        // Priority: selectedIds → editingTaskId → creatingInColumnId
        if (selectedIds.size > 0) { setSelectedIds(new Set()); return; }
        if (editingTaskId) { setEditingTaskId(null); return; }
        if (creatingInColumnId) { setCreatingInColumnId(null); return; }
        return;
      }
      if ((e.key === 'd' || e.key === 'D') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (selectedIds.size === 0) return;
        for (const id of selectedIds) {
          const task = tasks.find((t) => t.id === id);
          if (task) updateTask.mutate({ id: task.id, completed: !task.completed });
        }
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
  }, [selectedIds, editingTaskId, creatingInColumnId, deleteTask, tasks, updateTask]);

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
                  onClick={handleClickTask}
                  onToggleComplete={handleToggleComplete}
                  selected={selectedIds.has(task.id)}
                  onDragSelectStart={handleDragSelectStart}
                  onDragSelectEnter={handleDragSelectEnter}
                  onToggleSelect={handleToggleSelect}
                  isEditing={editingTaskId === task.id}
                  editingContent={
                    <InlineTaskEditor
                      task={task}
                      workdayMin={workdayMin}
                      onSubmit={handleUpdate}
                      onCancel={() => setEditingTaskId(null)}
                      onDelete={() => handleDelete(task.id)}
                      isSubmitting={updateTask.isPending}
                    />
                  }
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
      ) : (
        <FocusAreaColumns
          tasks={activeTasks}
          editingTaskId={editingTaskId}
          creatingInColumnId={creatingInColumnId}
          onClickTask={handleClickTask}
          onEditSubmit={handleUpdate}
          onEditCancel={() => setEditingTaskId(null)}
          onEditDelete={handleDelete}
          onToggleComplete={handleToggleComplete}
          onChangeColumn={(id, focusAreaId) => updateTask.mutate({ id, focus_area_id: focusAreaId })}
          selectedIds={selectedIds}
          onDragSelectStart={handleDragSelectStart}
          onDragSelectEnter={handleDragSelectEnter}
          onToggleSelect={handleToggleSelect}
          workdayMin={workdayMin}
          isSubmitting={updateTask.isPending}
          onNewTaskInColumn={(columnId) => {
            setCreatingInColumnId(columnId);
            setEditingTaskId(null);
          }}
          onCreateTask={handleCreate}
          onCancelCreate={() => setCreatingInColumnId(null)}
        />
      )}

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
                  onClick={handleClickTask}
                  onToggleComplete={handleToggleComplete}
                  selected={selectedIds.has(task.id)}
                  onDragSelectStart={handleDragSelectStart}
                  onDragSelectEnter={handleDragSelectEnter}
                  onToggleSelect={handleToggleSelect}
                  isEditing={editingTaskId === task.id}
                  editingContent={
                    <InlineTaskEditor
                      task={task}
                      workdayMin={workdayMin}
                      onSubmit={handleUpdate}
                      onCancel={() => setEditingTaskId(null)}
                      onDelete={() => handleDelete(task.id)}
                      isSubmitting={updateTask.isPending}
                    />
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DeleteColumnModal ────────────────────────────────────────────────────────

function DeleteColumnModal({
  column,
  otherColumns,
  taskCount,
  onConfirm,
  onCancel,
}: {
  column: FocusArea;
  otherColumns: FocusArea[];
  taskCount: number;
  onConfirm: (targetId: string) => void;
  onCancel: () => void;
}) {
  const [targetId, setTargetId] = useState(otherColumns[0]?.id ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-sm flex flex-col gap-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Delete "{column.name}"
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          "{column.name}" contains {taskCount} task{taskCount !== 1 ? 's' : ''}. Move them to:
        </p>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          {otherColumns.map((col) => (
            <option key={col.id} value={col.id}>
              {col.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(targetId)}
            className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 font-medium"
          >
            Delete Column
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SortableColumn (drag handle + droppable area) ───────────────────────────

function SortableColumn({
  column,
  tasks,
  editingTaskId,
  creatingInColumnId,
  onClickTask,
  onEditSubmit,
  onEditCancel,
  onEditDelete,
  onToggleComplete,
  isOver,
  canDelete,
  selectedIds,
  onDragSelectStart,
  onDragSelectEnter,
  onToggleSelect,
  workdayMin,
  isSubmitting,
  onNewTask,
  onCreateTask,
  onCancelCreate,
  onRename,
  onDeleteColumn,
}: {
  column: FocusArea;
  tasks: Task[];
  editingTaskId: string | null;
  creatingInColumnId: string | null;
  onClickTask: (task: Task) => void;
  onEditSubmit: (data: TaskFormData) => void;
  onEditCancel: () => void;
  onEditDelete: (id: string) => void;
  onToggleComplete: (task: Task) => void;
  isOver: boolean;
  canDelete: boolean;
  selectedIds: Set<string>;
  onDragSelectStart: (id: string) => void;
  onDragSelectEnter: (id: string) => void;
  onToggleSelect: (id: string) => void;
  workdayMin: number;
  isSubmitting: boolean;
  onNewTask: () => void;
  onCreateTask: (data: TaskFormData) => void;
  onCancelCreate: () => void;
  onRename: (name: string) => void;
  onDeleteColumn: () => void;
}) {
  const { setNodeRef: setDropRef } = useDroppable({ id: column.id });
  const { attributes, listeners, setNodeRef: setSortRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column' },
  });

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(column.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const handleNameBlur = () => {
    if (nameValue.trim() && nameValue.trim() !== column.name) {
      onRename(nameValue.trim());
    } else {
      setNameValue(column.name);
    }
    setEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setNameValue(column.name);
      setEditingName(false);
    }
  };

  const isCreating = creatingInColumnId === column.id;

  return (
    <div
      ref={(node) => { setSortRef(node); setDropRef(node); }}
      style={style}
      className={`flex flex-col gap-3 rounded-lg p-2 min-h-[120px] transition-colors ${
        isOver && !isDragging ? 'bg-accent/10 ring-2 ring-accent/30' : ''
      }`}
    >
      {/* Column header */}
      <div className="rounded-lg px-2 py-2 flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
        {/* Drag handle */}
        <button
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 px-1 focus:outline-none"
          title="Drag to reorder column"
          tabIndex={-1}
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.5" />
            <circle cx="9" cy="3" r="1.5" />
            <circle cx="3" cy="8" r="1.5" />
            <circle cx="9" cy="8" r="1.5" />
            <circle cx="3" cy="13" r="1.5" />
            <circle cx="9" cy="13" r="1.5" />
          </svg>
        </button>

        {/* Column name (click to rename) */}
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            className="flex-1 text-sm font-semibold bg-white dark:bg-gray-700 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent"
          />
        ) : (
          <button
            className="flex-1 text-sm font-semibold text-left truncate hover:text-accent transition-colors"
            onClick={() => { setEditingName(true); setNameValue(column.name); }}
            title="Click to rename"
          >
            {column.name} ({tasks.length})
          </button>
        )}

        {/* Delete button */}
        {canDelete && (
          <button
            onClick={onDeleteColumn}
            className="shrink-0 text-gray-400 hover:text-red-500 transition-colors focus:outline-none"
            title="Delete column"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
        )}
      </div>

      {/* Inline creator at top of column */}
      {isCreating && (
        <InlineTaskCreator
          workdayMin={workdayMin}
          focusAreaId={column.id}
          onSubmit={onCreateTask}
          onCancel={onCancelCreate}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Task cards */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.length === 0 && !isCreating ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">No tasks</p>
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
              onToggleSelect={onToggleSelect}
              isEditing={editingTaskId === task.id}
              editingContent={
                <InlineTaskEditor
                  task={task}
                  workdayMin={workdayMin}
                  onSubmit={onEditSubmit}
                  onCancel={onEditCancel}
                  onDelete={() => onEditDelete(task.id)}
                  isSubmitting={isSubmitting}
                />
              }
            />
          ))
        )}
      </SortableContext>

      {/* Per-column new task button */}
      {!isCreating && (
        <button
          onClick={onNewTask}
          className="mt-auto text-sm text-gray-400 hover:text-accent dark:hover:text-accent transition-colors py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 flex items-center justify-center gap-1"
        >
          <span>+</span> New Task
        </button>
      )}
    </div>
  );
}

// ─── FocusAreaColumns ─────────────────────────────────────────────────────────

function FocusAreaColumns({
  tasks,
  editingTaskId,
  creatingInColumnId,
  onClickTask,
  onEditSubmit,
  onEditCancel,
  onEditDelete,
  onToggleComplete,
  onChangeColumn,
  selectedIds,
  onDragSelectStart,
  onDragSelectEnter,
  onToggleSelect,
  workdayMin,
  isSubmitting,
  onNewTaskInColumn,
  onCreateTask,
  onCancelCreate,
}: {
  tasks: Task[];
  editingTaskId: string | null;
  creatingInColumnId: string | null;
  onClickTask: (task: Task) => void;
  onEditSubmit: (data: TaskFormData) => void;
  onEditCancel: () => void;
  onEditDelete: (id: string) => void;
  onToggleComplete: (task: Task) => void;
  onChangeColumn: (id: string, focusAreaId: string | null) => void;
  selectedIds: Set<string>;
  onDragSelectStart: (id: string) => void;
  onDragSelectEnter: (id: string) => void;
  onToggleSelect: (id: string) => void;
  workdayMin: number;
  isSubmitting: boolean;
  onNewTaskInColumn: (columnId: string) => void;
  onCreateTask: (data: TaskFormData) => void;
  onCancelCreate: () => void;
}) {
  const { focusAreas, createFocusArea, updateFocusArea, deleteFocusArea } = useFocusAreas();
  const { updateTask } = useTasks();

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, string | null>>({});
  const [optimisticColumnOrder, setOptimisticColumnOrder] = useState<string[] | null>(null);
  const [deletingColumn, setDeletingColumn] = useState<FocusArea | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const newColumnInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingColumn) newColumnInputRef.current?.focus();
  }, [addingColumn]);

  // Clear optimistic task overrides once real data catches up
  useEffect(() => {
    if (Object.keys(optimisticOverrides).length === 0) return;
    const allMatch = Object.entries(optimisticOverrides).every(([id, focusAreaId]) => {
      const task = tasks.find((t) => t.id === id);
      return task && task.focus_area_id === focusAreaId;
    });
    if (allMatch) setOptimisticOverrides({});
  }, [tasks, optimisticOverrides]);

  // Clear optimistic column order once real data catches up
  useEffect(() => {
    if (!optimisticColumnOrder) return;
    const realOrder = focusAreas.map((a) => a.id);
    const same = realOrder.length === optimisticColumnOrder.length &&
      realOrder.every((id, i) => id === optimisticColumnOrder[i]);
    if (same) setOptimisticColumnOrder(null);
  }, [focusAreas, optimisticColumnOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const orderedAreas = useMemo(() => {
    if (!optimisticColumnOrder) return focusAreas;
    const map = new Map(focusAreas.map((a) => [a.id, a]));
    return optimisticColumnOrder.map((id) => map.get(id)).filter(Boolean) as FocusArea[];
  }, [focusAreas, optimisticColumnOrder]);

  const effectiveTasks = useMemo(() => {
    if (Object.keys(optimisticOverrides).length === 0) return tasks;
    return tasks.map((t) =>
      t.id in optimisticOverrides ? { ...t, focus_area_id: optimisticOverrides[t.id] } : t
    );
  }, [tasks, optimisticOverrides]);

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const area of orderedAreas) {
      map[area.id] = [];
    }
    for (const task of effectiveTasks) {
      const key = task.focus_area_id ?? (orderedAreas[0]?.id ?? '');
      if (map[key] !== undefined) {
        map[key].push(task);
      } else if (orderedAreas.length > 0) {
        map[orderedAreas[0].id].push(task);
      }
    }
    return map;
  }, [effectiveTasks, orderedAreas]);

  const handleDragStart = (event: DragStartEvent) => {
    const type = event.active.data.current?.type;
    if (type === 'task') {
      const task = tasks.find((t) => t.id === event.active.id);
      if (task && editingTaskId === task.id) return;
      if (task) setActiveTask(task);
    } else if (type === 'column') {
      setActiveColumnId(event.active.id as string);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    if (!overId) { setOverColumnId(null); return; }

    const type = event.active.data.current?.type;
    if (type === 'column') return; // column reorder handled in dragEnd

    // Task drag: determine which column we're over
    if (orderedAreas.some((a) => a.id === overId)) {
      setOverColumnId(overId);
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        const key = overTask.focus_area_id ?? (orderedAreas[0]?.id ?? '');
        setOverColumnId(key);
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setActiveColumnId(null);
    setOverColumnId(null);

    if (!over) return;

    const type = active.data.current?.type;

    if (type === 'column') {
      // Reorder columns
      const oldIndex = orderedAreas.findIndex((a) => a.id === active.id);
      const newIndex = orderedAreas.findIndex((a) => a.id === over.id);
      if (oldIndex === newIndex || newIndex === -1) return;

      const reordered = arrayMove(orderedAreas, oldIndex, newIndex);
      setOptimisticColumnOrder(reordered.map((a) => a.id));

      // Persist new positions
      reordered.forEach((area, idx) => {
        if (area.position !== idx) {
          updateFocusArea.mutate({ id: area.id, position: idx });
        }
      });
      return;
    }

    if (type === 'task') {
      const taskId = active.id as string;
      const overId = over.id as string;

      let targetColumnId: string | null = null;
      if (orderedAreas.some((a) => a.id === overId)) {
        targetColumnId = overId;
      } else {
        const overTask = effectiveTasks.find((t) => t.id === overId);
        if (overTask) {
          targetColumnId = overTask.focus_area_id ?? (orderedAreas[0]?.id ?? null);
        }
      }

      if (!targetColumnId) return;

      const draggedTask = tasks.find((t) => t.id === taskId);
      const currentColumnId = draggedTask?.focus_area_id ?? (orderedAreas[0]?.id ?? null);
      if (draggedTask && currentColumnId !== targetColumnId) {
        setOptimisticOverrides((prev) => ({ ...prev, [taskId]: targetColumnId }));
        onChangeColumn(taskId, targetColumnId);
      }
    }
  };

  const handleDeleteColumn = (column: FocusArea) => {
    const tasksInColumn = grouped[column.id] || [];
    const otherColumns = orderedAreas.filter((a) => a.id !== column.id);
    if (otherColumns.length === 0) return; // safety — should be prevented by canDelete

    if (tasksInColumn.length === 0) {
      // No tasks — just delete
      deleteFocusArea.mutate(column.id);
      return;
    }

    setDeletingColumn(column);
  };

  const handleConfirmDelete = (targetId: string) => {
    if (!deletingColumn) return;
    const tasksInColumn = grouped[deletingColumn.id] || [];
    // Move tasks then delete
    Promise.all(
      tasksInColumn.map((t) => updateTask.mutateAsync({ id: t.id, focus_area_id: targetId }))
    ).then(() => {
      deleteFocusArea.mutate(deletingColumn.id);
      setDeletingColumn(null);
    });
  };

  const handleAddColumn = () => {
    const name = newColumnName.trim();
    if (!name) { setAddingColumn(false); return; }
    createFocusArea.mutate(name);
    setNewColumnName('');
    setAddingColumn(false);
  };

  const columnIds = orderedAreas.map((a) => a.id);

  return (
    <>
      {deletingColumn && (
        <DeleteColumnModal
          column={deletingColumn}
          otherColumns={orderedAreas.filter((a) => a.id !== deletingColumn.id)}
          taskCount={(grouped[deletingColumn.id] || []).length}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingColumn(null)}
        />
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${orderedAreas.length}, minmax(0, 1fr))` }}>
            {orderedAreas.map((column) => (
              <SortableColumn
                key={column.id}
                column={column}
                tasks={grouped[column.id] || []}
                editingTaskId={editingTaskId}
                creatingInColumnId={creatingInColumnId}
                onClickTask={onClickTask}
                onEditSubmit={onEditSubmit}
                onEditCancel={onEditCancel}
                onEditDelete={onEditDelete}
                onToggleComplete={onToggleComplete}
                isOver={overColumnId === column.id}
                canDelete={orderedAreas.length > 1}
                selectedIds={selectedIds}
                onDragSelectStart={onDragSelectStart}
                onDragSelectEnter={onDragSelectEnter}
                onToggleSelect={onToggleSelect}
                workdayMin={workdayMin}
                isSubmitting={isSubmitting}
                onNewTask={() => onNewTaskInColumn(column.id)}
                onCreateTask={onCreateTask}
                onCancelCreate={onCancelCreate}
                onRename={(name) => updateFocusArea.mutate({ id: column.id, name })}
                onDeleteColumn={() => handleDeleteColumn(column)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeTask && (
            <div className="border rounded-lg p-4 bg-white dark:bg-gray-800 border-accent shadow-lg opacity-90 rotate-2">
              <div className="font-medium text-gray-900 dark:text-gray-100">{activeTask.title}</div>
              <div className="text-xs text-gray-500 mt-1">{activeTask.estimated_min} min</div>
            </div>
          )}
          {activeColumnId && (
            <div className="rounded-lg p-2 bg-gray-100 dark:bg-gray-800 shadow-lg opacity-80 w-48">
              <div className="text-sm font-semibold text-center text-gray-700 dark:text-gray-200">
                {orderedAreas.find((a) => a.id === activeColumnId)?.name}
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Add Column card */}
      <div className="mt-2">
        {addingColumn ? (
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3 flex gap-2 items-center">
            <input
              ref={newColumnInputRef}
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              onBlur={() => { if (newColumnName.trim()) handleAddColumn(); else setAddingColumn(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddColumn();
                else if (e.key === 'Escape') { setNewColumnName(''); setAddingColumn(false); }
              }}
              placeholder="Column name..."
              className="flex-1 text-sm bg-transparent focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
          </div>
        ) : (
          <button
            onClick={() => setAddingColumn(true)}
            className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg py-3 text-sm text-gray-400 hover:border-accent hover:text-accent transition-colors"
          >
            + Add Column
          </button>
        )}
      </div>
    </>
  );
}
