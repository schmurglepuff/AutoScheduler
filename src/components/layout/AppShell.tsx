import { useState } from 'react';
import type { Task, ScheduleSlot, Priority } from '../../types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { TaskList } from '../tasks/TaskList';
import { WeeklyCalendar } from '../calendar/WeeklyCalendar';
import { SettingsPanel } from '../settings/SettingsPanel';
import { TaskForm } from '../tasks/TaskForm';
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

  const { settings, updateSettings } = useSettings();
  const { tasks, updateTask, deleteTask } = useTasks();
  const { slots, regenerate, moveSlot, toggleLock } = useSchedule(tasks, settings);

  useTheme(settings);

  const handleMoveSlot = (id: string, startTime: string, endTime: string) => {
    moveSlot.mutate({ id, start_time: startTime, end_time: endTime });
  };

  const handleToggleLock = (slot: ScheduleSlot) => {
    toggleLock.mutate({ id: slot.id, locked: !slot.locked });
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
    deadline: string;
    priority: Priority;
    completed: boolean;
    people_notes: { person_name: string; note_text: string }[];
  }) => {
    if (!editingTask) return;
    updateTask.mutate(
      { id: editingTask.id, ...data },
      { onSuccess: () => setEditingTask(null) }
    );
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
              <div className="flex justify-end">
                <Button
                  onClick={() => regenerate.mutate()}
                  disabled={regenerate.isPending}
                  variant="ghost"
                  size="sm"
                  className="text-accent hover:bg-accent/10"
                >
                  {regenerate.isPending ? 'Scheduling...' : 'Auto-Schedule'}
                </Button>
              </div>
              <WeeklyCalendar
                slots={slots}
                settings={settings}
                onSlotClick={handleSlotClick}
                onMoveSlot={handleMoveSlot}
                onToggleLock={handleToggleLock}
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
        onClose={() => setEditingTask(null)}
        title="Edit Task"
      >
        {editingTask && (
          <TaskForm
            initialTask={editingTask}
            onSubmit={handleUpdateTask}
            onCancel={() => setEditingTask(null)}
            onDelete={handleDeleteTask}
            isSubmitting={updateTask.isPending}
          />
        )}
      </Modal>
    </div>
  );
}
