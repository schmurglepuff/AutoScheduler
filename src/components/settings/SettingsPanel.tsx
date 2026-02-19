import type { Settings } from '../../types';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useState, useEffect } from 'react';

interface SettingsPanelProps {
  settings: Settings;
  onSave: (updates: Partial<Omit<Settings, 'id'>>) => void;
  isSaving?: boolean;
}

export function SettingsPanel({ settings, onSave, isSaving }: SettingsPanelProps) {
  const [local, setLocal] = useState(settings);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  const handleSave = () => {
    const { id, ...rest } = local;
    onSave(rest);
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Settings</h2>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Work Day Start"
          type="time"
          value={local.work_day_start}
          onChange={(e) => setLocal({ ...local, work_day_start: e.target.value })}
        />
        <Input
          label="Work Day End"
          type="time"
          value={local.work_day_end}
          onChange={(e) => setLocal({ ...local, work_day_end: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={local.include_saturday}
            onChange={(e) => setLocal({ ...local, include_saturday: e.target.checked })}
            className="rounded"
          />
          Include Saturday
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={local.include_sunday}
            onChange={(e) => setLocal({ ...local, include_sunday: e.target.checked })}
            className="rounded"
          />
          Include Sunday
        </label>
      </div>

      <Select
        label="Theme"
        value={local.theme}
        onChange={(e) => setLocal({ ...local, theme: e.target.value as 'light' | 'dark' })}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />

      <Input
        label="Accent Color"
        type="color"
        value={local.accent_color}
        onChange={(e) => setLocal({ ...local, accent_color: e.target.value })}
      />

      <Button onClick={handleSave} disabled={isSaving} className="self-start">
        {isSaving ? 'Saving...' : 'Save Settings'}
      </Button>
    </div>
  );
}
