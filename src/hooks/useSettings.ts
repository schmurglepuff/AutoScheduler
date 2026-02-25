import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Settings } from '../types';

const defaultSettings: Settings = {
  id: 1,
  work_day_start: '09:00',
  work_day_end: '17:00',
  include_saturday: false,
  include_sunday: false,
  theme: 'light',
  accent_color: '#3b82f6',
  auto_split_tasks: false,
  scheduler_active: false,
  lunch_start: '12:00',
  lunch_end: '13:00',
};

export function useSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
      if (error) {
        // If no settings row exists, create one
        if (error.code === 'PGRST116') {
          const { data: newData, error: insertError } = await supabase
            .from('settings')
            .insert(defaultSettings)
            .select()
            .single();
          if (insertError) return defaultSettings;
          return newData;
        }
        return defaultSettings;
      }
      return data;
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<Omit<Settings, 'id'>>) => {
      const { error } = await supabase.from('settings').update(updates).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  return {
    settings: settingsQuery.data || defaultSettings,
    isLoading: settingsQuery.isLoading,
    updateSettings,
  };
}
