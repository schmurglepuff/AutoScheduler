import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { generateSchedule } from '../services/scheduler';
import { shouldSplitTask, splitTaskData, getWorkdayMin } from '../utils/taskSplit';
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
      // 1. Fetch fresh tasks directly from DB (avoids stale closure)
      const { data: rawTasks, error: taskErr } = await supabase
        .from('tasks')
        .select('*, people_notes(*)')
        .order('created_at', { ascending: true });
      if (taskErr) throw taskErr;
      let currentTasks = (rawTasks || []) as Task[];

      // 2. Fetch locked slots up-front — used both for split decisions and the scheduler
      const { data: lockedSlotsData, error: fetchErr } = await supabase
        .from('schedule_slots')
        .select('*, task:tasks(*)')
        .eq('locked', true);
      if (fetchErr) throw fetchErr;
      const locked = (lockedSlotsData || []) as ScheduleSlot[];
      const lockedTaskIds = new Set(locked.map((s) => s.task_id));

      const workdayMin = getWorkdayMin(settings);

      // Helper: insert a task + its notes, return the created Task
      const insertSplitTask = async (
        part: ReturnType<typeof splitTaskData>[number],
        notes: { person_name: string; note_text: string }[]
      ): Promise<Task> => {
        const { data: created, error: insErr } = await supabase
          .from('tasks')
          .insert({
            title: part.title,
            description: part.description,
            estimated_min: part.estimated_min,
            deadline: part.deadline,
            priority: part.priority,
            completed: false,
            split_group_id: part.split_group_id,
            split_index: part.split_index,
          })
          .select()
          .single();
        if (insErr) throw insErr;
        if (notes.length > 0) {
          await supabase.from('people_notes').insert(
            notes.map((n) => ({ task_id: created.id, person_name: n.person_name, note_text: n.note_text }))
          );
        }
        return { ...created, people_notes: notes } as Task;
      };

      // Helper: delete a task and its slots
      const deleteTaskAndSlots = async (id: string) => {
        await supabase.from('schedule_slots').delete().eq('task_id', id);
        await supabase.from('tasks').delete().eq('id', id);
      };

      // 3. Auto-split unsplit tasks that qualify (skip those with locked slots)
      const needsSplit = currentTasks.filter(
        (t) => !t.completed && !t.split_group_id && !lockedTaskIds.has(t.id) &&
          shouldSplitTask(t.estimated_min, workdayMin)
      );
      if (needsSplit.length > 0) {
        const newlyCreated: Task[] = [];
        for (const task of needsSplit) {
          await deleteTaskAndSlots(task.id);
          const parts = splitTaskData(task, workdayMin);
          const notes = (task.people_notes || []) as { person_name: string; note_text: string }[];
          for (const part of parts) {
            newlyCreated.push(await insertSplitTask(part, notes));
          }
        }
        const splitIds = new Set(needsSplit.map((t) => t.id));
        currentTasks = [...currentTasks.filter((t) => !splitIds.has(t.id)), ...newlyCreated];
      }

      // 4. Re-split existing split groups whose total time may need re-chunking.
      //    Skip any group where a task is completed or has a locked slot.
      const splitGroups = new Map<string, Task[]>();
      for (const t of currentTasks) {
        if (!t.split_group_id || t.completed) continue;
        const g = splitGroups.get(t.split_group_id) ?? [];
        g.push(t);
        splitGroups.set(t.split_group_id, g);
      }

      for (const groupTasks of splitGroups.values()) {
        if (groupTasks.some((t) => t.completed || lockedTaskIds.has(t.id))) continue;

        // Reconstitute original: sum times, strip " X/N" suffix from title
        const totalMin = groupTasks.reduce((s, t) => s + t.estimated_min, 0);
        const first = groupTasks[0];
        const baseTitle = first.title.replace(/\s\d+\/\d+$/, '');
        const notes = (first.people_notes || []) as { person_name: string; note_text: string }[];

        const newParts = splitTaskData(
          { title: baseTitle, description: first.description ?? '', estimated_min: totalMin,
            deadline: first.deadline, priority: first.priority, completed: false, people_notes: notes },
          workdayMin
        );

        // Skip if the split is identical to the current one (nothing to change)
        const sorted = [...groupTasks].sort((a, b) => (a.split_index ?? 0) - (b.split_index ?? 0));
        if (
          newParts.length === sorted.length &&
          newParts.every((p, i) => p.estimated_min === sorted[i].estimated_min)
        ) continue;

        // Replace the group
        for (const t of groupTasks) await deleteTaskAndSlots(t.id);
        const newGroupTasks: Task[] = [];
        for (const part of newParts) {
          newGroupTasks.push(await insertSplitTask(part, notes));
        }
        const oldIds = new Set(groupTasks.map((t) => t.id));
        currentTasks = [...currentTasks.filter((t) => !oldIds.has(t.id)), ...newGroupTasks];
      }

      // 5. Generate schedule with the final task list
      const newSlots = generateSchedule(currentTasks, settings, locked);

      // 6. Delete unlocked future slots
      await supabase
        .from('schedule_slots')
        .delete()
        .eq('locked', false)
        .gte('start_time', new Date().toISOString());

      // 7. Insert new slots
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
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
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

  const resizeTaskSlots = useMutation({
    mutationFn: async ({ task_id, estimated_min }: { task_id: string; estimated_min: number }) => {
      // Get existing slots for this task, ordered by start_time
      const { data: existing, error: fetchErr } = await supabase
        .from('schedule_slots')
        .select('*')
        .eq('task_id', task_id)
        .order('start_time', { ascending: true });
      if (fetchErr) throw fetchErr;
      if (!existing || existing.length === 0) return;

      // Use the earliest slot's start_time as the anchor
      const anchorStart = existing[0].start_time;

      // Delete all existing slots for this task
      const { error: delErr } = await supabase
        .from('schedule_slots')
        .delete()
        .eq('task_id', task_id);
      if (delErr) throw delErr;

      // Create a single new slot from anchor with the new duration
      const start = new Date(anchorStart);
      const end = new Date(start.getTime() + estimated_min * 60 * 1000);
      const { error: insErr } = await supabase
        .from('schedule_slots')
        .insert({ task_id, start_time: start.toISOString(), end_time: end.toISOString() });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule_slots'] });
    },
  });

  const addSlot = useMutation({
    mutationFn: async ({ task_id, start_time, end_time }: { task_id: string; start_time: string; end_time: string }) => {
      const { error } = await supabase
        .from('schedule_slots')
        .insert({ task_id, start_time, end_time });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule_slots'] });
    },
  });

  return {
    slots: slotsQuery.data || [],
    isLoading: slotsQuery.isLoading,
    regenerate,
    moveSlot,
    toggleLock,
    resizeTaskSlots,
    addSlot,
  };
}
