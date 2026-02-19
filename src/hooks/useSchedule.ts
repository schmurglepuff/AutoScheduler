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
      // Fetch current locked slots
      const { data: lockedSlots, error: fetchErr } = await supabase
        .from('schedule_slots')
        .select('*, task:tasks(*)')
        .eq('locked', true);
      if (fetchErr) throw fetchErr;

      const locked = (lockedSlots || []) as ScheduleSlot[];

      const newSlots = generateSchedule(tasks, settings, locked);

      // Delete only unlocked slots
      await supabase
        .from('schedule_slots')
        .delete()
        .eq('locked', false);

      if (newSlots.length > 0) {
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
        .update({ start_time, end_time, locked: false })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, start_time, end_time }) => {
      await queryClient.cancelQueries({ queryKey: ['schedule_slots'] });
      const previous = queryClient.getQueryData<ScheduleSlot[]>(['schedule_slots']);
      queryClient.setQueryData<ScheduleSlot[]>(['schedule_slots'], (old) =>
        old?.map((s) => (s.id === id ? { ...s, start_time, end_time, locked: false } : s))
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

  const toggleLock = useMutation({
    mutationFn: async ({ id, locked }: { id: string; locked: boolean }) => {
      const { error } = await supabase
        .from('schedule_slots')
        .update({ locked })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, locked }) => {
      await queryClient.cancelQueries({ queryKey: ['schedule_slots'] });
      const previous = queryClient.getQueryData<ScheduleSlot[]>(['schedule_slots']);
      queryClient.setQueryData<ScheduleSlot[]>(['schedule_slots'], (old) =>
        old?.map((s) => (s.id === id ? { ...s, locked } : s))
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
    toggleLock,
  };
}
