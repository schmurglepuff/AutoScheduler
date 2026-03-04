import type { Settings } from '../../types';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

interface SettingsPanelProps {
  settings: Settings;
  onSave: (updates: Partial<Omit<Settings, 'id'>>) => void;
  onSchedulerActivated?: () => void;
}

export function SettingsPanel({ settings, onSave, onSchedulerActivated }: SettingsPanelProps) {
  const lunchEnabled = !!settings.lunch_start && !!settings.lunch_end;

  const update = (changes: Partial<Omit<Settings, 'id'>>) => {
    onSave(changes);
    if ('scheduler_active' in changes && changes.scheduler_active && !settings.scheduler_active) {
      onSchedulerActivated?.();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Settings</h2>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Work Day Start"
          type="time"
          value={settings.work_day_start}
          onChange={(e) => update({ work_day_start: e.target.value })}
        />
        <Input
          label="Work Day End"
          type="time"
          value={settings.work_day_end}
          onChange={(e) => update({ work_day_end: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={lunchEnabled}
            onChange={(e) => {
              if (e.target.checked) {
                update({ lunch_start: '12:00', lunch_end: '13:00' });
              } else {
                update({ lunch_start: '', lunch_end: '' });
              }
            }}
            className="rounded"
          />
          Lunch break
        </label>
        {lunchEnabled && (
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Lunch Start"
              type="time"
              value={settings.lunch_start}
              onChange={(e) => update({ lunch_start: e.target.value })}
            />
            <Input
              label="Lunch End"
              type="time"
              value={settings.lunch_end}
              onChange={(e) => update({ lunch_end: e.target.value })}
            />
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.include_saturday && settings.include_sunday}
          onChange={(e) => update({ include_saturday: e.target.checked, include_sunday: e.target.checked })}
          className="rounded mt-0.5"
        />
        <span>
          Schedule on weekends
          <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Allow the auto-scheduler to place tasks on Saturday and Sunday
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Scheduler</h3>
        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.scheduler_active}
            onChange={(e) => update({ scheduler_active: e.target.checked })}
            className="rounded mt-0.5"
          />
          <span>
            Active
            <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              When active, new tasks are automatically scheduled. When inactive, tasks are placed where created.
            </span>
          </span>
        </label>
      </div>

      <Select
        label="Theme"
        value={settings.theme}
        onChange={(e) => update({ theme: e.target.value as 'light' | 'dark' })}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />

      <Input
        label="Accent Color"
        type="color"
        value={settings.accent_color}
        onChange={(e) => update({ accent_color: e.target.value })}
      />
    </div>
  );
}
