import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { generateSchedule } from '../services/scheduler';
import type { Task, Settings, ScheduleSlot } from '../types';

export function useSchedule(tasks: Task[], settings: Settings) {
  const queryClient = useQueryClient();

  const slotsQuery = useQuery({
    queryKey: ['schedule_slots'],
    queryFn: async (): Promise<ScheduleSlot[]> => {
      const { data, error } = await supabase
        .from('schedule_slots')
        .select('*, task:tasks(*)')
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const newSlots = generateSchedule(tasks, settings);

      // Clear existing schedule
      await supabase.from('schedule_slots').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      if (newSlots.length > 0) {
        // Batch insert in chunks of 100
        for (let i = 0; i < newSlots.length; i += 100) {
          const batch = newSlots.slice(i, i + 100);
          const { error } = await supabase.from('schedule_slots').insert(batch);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule_slots'] });
    },
  });

  const moveSlot = useMutation({
    mutationFn: async ({ id, start_time, end_time }: { id: string; start_time: string; end_time: string }) => {
      const { error } = await supabase
        .from('schedule_slots')
        .update({ start_time, end_time })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, start_time, end_time }) => {
      await queryClient.cancelQueries({ queryKey: ['schedule_slots'] });
      const previous = queryClient.getQueryData<ScheduleSlot[]>(['schedule_slots']);
      queryClient.setQueryData<ScheduleSlot[]>(['schedule_slots'], (old) =>
        old?.map((s) => (s.id === id ? { ...s, start_time, end_time } : s))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['schedule_slots'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule_slots'] });
    },
  });

  return {
    slots: slotsQuery.data || [],
    isLoading: slotsQuery.isLoading,
    regenerate,
    moveSlot,
  };
}
