import { useState, useRef } from 'react';
import type { Task, ScheduleSlot, Priority } from '../../types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { TaskList } from '../tasks/TaskList';
import { WeeklyCalendar } from '../calendar/WeeklyCalendar';
import { SettingsPanel } from '../settings/SettingsPanel';
import { TaskForm, type TaskFormHandle } from '../tasks/TaskForm';
import { Modal } from '../ui/Modal';
import { useSettings } from '../../hooks/useSettings';
import { useTasks } from '../../hooks/useTasks';
import { useSchedule } from '../../hooks/useSchedule';
import { useTheme } from '../../hooks/useTheme';
import { Button } from '../ui/Button';

export function AppShell() {
  const [currentView, setCurrentView] = useState('calendar');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingAtTime, setCreatingAtTime] = useState<string | null>(null);
  const editFormRef = useRef<TaskFormHandle>(null);

  const { settings, updateSettings } = useSettings();
  const { tasks, createTask, updateTask, deleteTask } = useTasks();
  const { slots, regenerate, moveSlot, toggleLock, resizeTaskSlots, addSlot } = useSchedule(tasks, settings);

  useTheme(settings);

  const handleMoveSlot = (id: string, startTime: string, endTime: string) => {
    moveSlot.mutate({ id, start_time: startTime, end_time: endTime });

    // Update the task's deadline to the end of the dropped day
    const slot = slots.find((s) => s.id === id);
    if (slot?.task_id) {
      const dropDate = new Date(endTime);
      const existingTask = tasks.find((t) => t.id === slot.task_id);
      if (existingTask && existingTask.deadline) {
        // Preserve the existing deadline time-of-day, just change the date
        const oldDeadline = new Date(existingTask.deadline);
        const newDeadline = new Date(dropDate);
        newDeadline.setHours(oldDeadline.getHours(), oldDeadline.getMinutes(), 0, 0);
        updateTask.mutate({ id: slot.task_id, deadline: newDeadline.toISOString() });
      }
    }
  };

  const handleToggleLock = (slot: ScheduleSlot) => {
    toggleLock.mutate({ id: slot.id, locked: !slot.locked });
  };

  const handleCreateFromCalendar = (startTime: Date) => {
    setCreatingAtTime(startTime.toISOString());
  };

  const handleCreateNewTask = (data: {
    title: string;
    description: string;
    estimated_min: number;
    deadline: string | null;
    priority: Priority;
    completed: boolean;
    people_notes: { person_name: string; note_text: string }[];
  }) => {
    createTask.mutate(data, {
      onSuccess: (newTask) => {
        if (creatingAtTime && newTask) {
          const start = new Date(creatingAtTime);
          const end = new Date(start.getTime() + data.estimated_min * 60 * 1000);
          addSlot.mutate({
            task_id: newTask.id,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
          });
        }
        setCreatingAtTime(null);
      },
    });
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
  }) => {
    if (!editingTask) return;
    updateTask.mutate(
      { id: editingTask.id, ...data },
      {
        onSuccess: () => {
          if (data.estimated_min !== editingTask.estimated_min) {
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
                onCreateTask={handleCreateFromCalendar}
              />
            </div>
          )}
          {currentView === 'tasks' && <TaskList />}
          {currentView === 'settings' && (
            <SettingsPanel
              settings={settings}
              onSave={(updates) => updateSettings.mutate(updates)}
              isSaving={updateSettings.isPending}
            />
          )}
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
        onClose={() => setCreatingAtTime(null)}
        title="New Task"
      >
        {creatingAtTime && (
          <TaskForm
            defaultDeadline={creatingAtTime}
            onSubmit={handleCreateNewTask}
            onCancel={() => setCreatingAtTime(null)}
            isSubmitting={createTask.isPending}
          />
        )}
      </Modal>
    </div>
  );
}
