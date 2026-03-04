import { useState, useRef } from 'react';
import type { Task, ScheduleSlot, Priority } from '../../types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { TaskList } from '../tasks/TaskList';
import { WeeklyCalendar } from '../calendar/WeeklyCalendar';
import { SettingsPanel } from '../settings/SettingsPanel';
import { HotkeysPanel } from '../settings/HotkeysPanel';
import { ProjectsPage } from '../projects/ProjectsPage';
import { TaskForm, type TaskFormHandle } from '../tasks/TaskForm';
import { Modal } from '../ui/Modal';
import { useSettings } from '../../hooks/useSettings';
import { useTasks } from '../../hooks/useTasks';
import { useSchedule } from '../../hooks/useSchedule';
import { useTheme } from '../../hooks/useTheme';
import { Button } from '../ui/Button';
import { shouldSplitTask, splitTaskData, getWorkdayMin } from '../../utils/taskSplit';

export function AppShell() {
  const [currentView, setCurrentView] = useState('calendar');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingAtTime, setCreatingAtTime] = useState<string | null>(null);
  const [creatingDurationMin, setCreatingDurationMin] = useState<number | null>(null);
  const editFormRef = useRef<TaskFormHandle>(null);

  const { settings, updateSettings } = useSettings();
  const { tasks, createTask, updateTask, deleteTask } = useTasks();
  const { slots, regenerate, moveSlot, toggleLock, resizeTaskSlots, addSlot, addBlockerSlot } = useSchedule(tasks, settings);
  const workdayMin = getWorkdayMin(settings);

  useTheme(settings);

  const handleMoveSlot = (id: string, startTime: string, endTime: string) => {
    moveSlot.mutate({ id, start_time: startTime, end_time: endTime });
  };

  const handleToggleLock = (slot: ScheduleSlot) => {
    toggleLock.mutate({ id: slot.id, locked: !slot.locked, slot });
  };

  const handleToggleGroupLock = (slot: ScheduleSlot) => {
    const groupId = slot.task?.split_group_id;
    if (!groupId) {
      // No group — fall back to toggling just this slot
      toggleLock.mutate({ id: slot.id, locked: !slot.locked });
      return;
    }
    const targetLocked = !slot.locked;
    const groupSlots = slots.filter((s) => s.task?.split_group_id === groupId);
    for (const s of groupSlots) {
      if (s.locked !== targetLocked) {
        toggleLock.mutate({ id: s.id, locked: targetLocked });
      }
    }
  };

  const handleToggleComplete = (slot: ScheduleSlot) => {
    if (slot.task) updateTask.mutate({ id: slot.task.id, completed: !slot.task.completed });
  };

  const handleBulkToggleLock = (slotsToToggle: ScheduleSlot[], locked: boolean) => {
    for (const slot of slotsToToggle) {
      if (slot.locked !== locked) {
        toggleLock.mutate({ id: slot.id, locked });
      }
    }
  };

  const handleCreateFromCalendar = (startTime: Date, endTime?: Date) => {
    setCreatingAtTime(startTime.toISOString());
    setCreatingDurationMin(endTime ? Math.round((endTime.getTime() - startTime.getTime()) / 60000) : null);
  };

  const handleLockRange = (start: Date, end: Date) => {
    addBlockerSlot.mutate({ start_time: start.toISOString(), end_time: end.toISOString() });
  };

  const handleCreateNewTask = (data: {
    title: string;
    description: string;
    estimated_min: number;
    deadline: string | null;
    priority: Priority;
    completed: boolean;
    people_notes: { person_name: string; note_text: string }[];
    project_id?: string | null;
  }) => {
    const tasksToCreate = shouldSplitTask(data.estimated_min, workdayMin)
      ? splitTaskData(data, workdayMin)
      : [data];

    const createSequentially = async () => {
      try {
        const createdTasks: Task[] = [];
        for (const t of tasksToCreate) {
          const newTask = await createTask.mutateAsync({ ...t, project_id: data.project_id ?? null });
          if (newTask) createdTasks.push(newTask as Task);
        }

        if (creatingAtTime) {
          // Always place at the selected time. Lock it when created from a drag-range selection.
          const lockSlot = creatingDurationMin !== null;
          let cursor = new Date(creatingAtTime);
          for (const task of createdTasks) {
            const end = new Date(cursor.getTime() + task.estimated_min * 60 * 1000);
            addSlot.mutate({
              task_id: task.id,
              start_time: cursor.toISOString(),
              end_time: end.toISOString(),
              locked: lockSlot,
            });
            cursor = end;
          }
        } else if (settings.scheduler_active) {
          // No specific time selected — let the scheduler place it
          regenerate.mutate();
        } else {
          // Inactive mode, no time selected — place at next whole hour
          const cursor = new Date();
          cursor.setMinutes(0, 0, 0);
          cursor.setHours(cursor.getHours() + 1);
          let cur = cursor;
          for (const task of createdTasks) {
            const end = new Date(cur.getTime() + task.estimated_min * 60 * 1000);
            addSlot.mutate({
              task_id: task.id,
              start_time: cur.toISOString(),
              end_time: end.toISOString(),
            });
            cur = end;
          }
        }
      } catch (err) {
        console.error('Failed to create task(s):', err);
      }
      setCreatingAtTime(null);
      setCreatingDurationMin(null);
    };

    createSequentially();
  };

  const handleSlotClick = (slot: ScheduleSlot) => {
    if (slot.task) {
      setEditingTask(slot.task as Task);
    }
  };

  const handleUpdateTask = (data: {
    title: string;
    description: string;
    estimated_min: number;
    deadline: string | null;
    priority: Priority;
    completed: boolean;
    people_notes: { person_name: string; note_text: string }[];
    project_id?: string | null;
  }) => {
    if (!editingTask) return;
    const timeChanged = data.estimated_min !== editingTask.estimated_min;
    const deadlineChanged = (data.deadline ?? '') !== (editingTask.deadline ?? '')
      && new Date(data.deadline ?? 0).getTime() !== new Date(editingTask.deadline ?? 0).getTime();
    updateTask.mutate(
      { id: editingTask.id, ...data },
      {
        onSuccess: () => {
          if (settings.scheduler_active && (timeChanged || deadlineChanged)) {
            regenerate.mutate();
          } else if (timeChanged) {
            resizeTaskSlots.mutate({
              task_id: editingTask.id,
              estimated_min: data.estimated_min,
            });
          }
        },
      }
    );
  };

  const handleEditModalClose = () => {
    editFormRef.current?.submit();
    setEditingTask(null);
  };

  const handleDeleteTask = () => {
    if (!editingTask) return;
    if (confirm('Delete this task?')) {
      deleteTask.mutate(editingTask.id, {
        onSuccess: () => setEditingTask(null),
      });
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {currentView === 'calendar' && (
            <div className="flex flex-col gap-4">
              <WeeklyCalendar
                autoScheduleButton={
                  <button
                    onClick={() => regenerate.mutate()}
                    disabled={regenerate.isPending}
                    className={`relative px-4 py-1.5 rounded-lg text-sm font-semibold text-white
                      bg-gradient-to-r from-accent via-purple-500 to-pink-500
                      bg-[length:200%_100%]
                      shadow-md shadow-accent/30 hover:shadow-lg hover:shadow-accent/40
                      hover:scale-105 active:scale-95
                      transition-all duration-200
                      disabled:opacity-60 disabled:hover:scale-100 disabled:cursor-not-allowed
                      ${regenerate.isPending ? 'animate-shimmer' : ''}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <svg className={`w-4 h-4 ${regenerate.isPending ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      {regenerate.isPending ? 'Scheduling...' : 'Auto-Schedule'}
                    </span>
                  </button>
                }
                slots={slots}
                settings={settings}
                onSlotClick={handleSlotClick}
                onMoveSlot={handleMoveSlot}
                onToggleLock={handleToggleLock}
                onToggleGroupLock={handleToggleGroupLock}
                onToggleComplete={handleToggleComplete}
                onBulkToggleLock={handleBulkToggleLock}
                onCreateTask={handleCreateFromCalendar}
                onLockRange={handleLockRange}
                onNewTaskInRange={(start, end) => handleCreateFromCalendar(start, end)}
              />
            </div>
          )}
          {currentView === 'tasks' && (
            <TaskList
              settings={settings}
              schedulerActive={settings.scheduler_active}
              onTasksCreated={(created) => {
                if (settings.scheduler_active) {
                  regenerate.mutate();
                } else {
                  const start = new Date();
                  start.setMinutes(0, 0, 0);
                  start.setHours(start.getHours() + 1);
                  let cursor = start;
                  for (const t of created) {
                    const end = new Date(cursor.getTime() + t.estimated_min * 60 * 1000);
                    addSlot.mutate({
                      task_id: t.id,
                      start_time: cursor.toISOString(),
                      end_time: end.toISOString(),
                    });
                    cursor = end;
                  }
                }
              }}
            />
          )}
          {currentView === 'settings' && (
            <SettingsPanel
              settings={settings}
              onSave={(updates) => updateSettings.mutate(updates)}
              onSchedulerActivated={() => regenerate.mutate()}
            />
          )}
          {currentView === 'hotkeys' && <HotkeysPanel />}
          {currentView === 'projects' && <ProjectsPage />}
        </main>
      </div>

      {/* Task edit modal from calendar slot click */}
      <Modal
        isOpen={!!editingTask}
        onClose={handleEditModalClose}
        title="Edit Task"
      >
        {editingTask && (
          <TaskForm
            ref={editFormRef}
            initialTask={editingTask}
            workdayMin={workdayMin}
            onSubmit={handleUpdateTask}
            onCancel={() => setEditingTask(null)}
            onDelete={handleDeleteTask}
            isSubmitting={updateTask.isPending}
          />
        )}
      </Modal>

      {/* Create task modal from calendar timeslot click */}
      <Modal
        isOpen={!!creatingAtTime}
        onClose={() => { setCreatingAtTime(null); setCreatingDurationMin(null); }}
        title="New Task"
      >
        {creatingAtTime && (
          <TaskForm
            defaultDeadline={creatingAtTime}
            defaultEstimatedMin={creatingDurationMin ?? undefined}
            workdayMin={workdayMin}
            onSubmit={handleCreateNewTask}
            onCancel={() => { setCreatingAtTime(null); setCreatingDurationMin(null); }}
            isSubmitting={createTask.isPending}
          />
        )}
      </Modal>
    </div>
  );
}
