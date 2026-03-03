import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { FocusArea } from '../types';

const defaultFocusAreas: Omit<FocusArea, 'id' | 'created_at'>[] = [
  { name: 'Backlog', position: 0 },
  { name: 'To-Do', position: 1 },
  { name: 'Working-On', position: 2 },
];

export function useFocusAreas() {
  const queryClient = useQueryClient();

  const focusAreasQuery = useQuery({
    queryKey: ['focus_areas'],
    queryFn: async (): Promise<FocusArea[]> => {
      const { data, error } = await supabase
        .from('focus_areas')
        .select('*')
        .order('position', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        // Seed defaults if none exist
        const { data: seeded, error: seedError } = await supabase
          .from('focus_areas')
          .insert(defaultFocusAreas)
          .select()
          .order('position', { ascending: true });
        if (seedError) return [];
        return seeded || [];
      }
      return data;
    },
  });

  const createFocusArea = useMutation({
    mutationFn: async (name: string) => {
      const existing = focusAreasQuery.data || [];
      const maxPosition = existing.length > 0 ? Math.max(...existing.map((a) => a.position)) : -1;
      const { data, error } = await supabase
        .from('focus_areas')
        .insert({ name, position: maxPosition + 1 })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focus_areas'] });
    },
  });

  const updateFocusArea = useMutation({
    mutationFn: async ({ id, name, position }: { id: string; name?: string; position?: number }) => {
      const updates: Partial<Pick<FocusArea, 'name' | 'position'>> = {};
      if (name !== undefined) updates.name = name;
      if (position !== undefined) updates.position = position;
      const { error } = await supabase.from('focus_areas').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focus_areas'] });
    },
  });

  const deleteFocusArea = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('focus_areas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focus_areas'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  return {
    focusAreas: focusAreasQuery.data || [],
    isLoading: focusAreasQuery.isLoading,
    createFocusArea,
    updateFocusArea,
    deleteFocusArea,
  };
}
