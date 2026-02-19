import { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { TaskList } from '../tasks/TaskList';
import { WeeklyCalendar } from '../calendar/WeeklyCalendar';
import { SettingsPanel } from '../settings/SettingsPanel';
import { useSettings } from '../../hooks/useSettings';
import { useTasks } from '../../hooks/useTasks';
import { useSchedule } from '../../hooks/useSchedule';
import { useTheme } from '../../hooks/useTheme';
import { Button } from '../ui/Button';

export function AppShell() {
  const [currentView, setCurrentView] = useState('calendar');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { settings, updateSettings } = useSettings();
  const { tasks } = useTasks();
  const { slots, regenerate } = useSchedule(tasks, settings);

  useTheme(settings);

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
              <div className="flex items-center justify-between">
                <div />
                <Button
                  onClick={() => regenerate.mutate()}
                  disabled={regenerate.isPending}
                  size="sm"
                >
                  {regenerate.isPending ? 'Scheduling...' : 'Auto-Schedule'}
                </Button>
              </div>
              <WeeklyCalendar slots={slots} settings={settings} />
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
    </div>
  );
}
