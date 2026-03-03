import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { generateSchedule } from '../services/scheduler';
import { shouldSplitTask, splitTaskData, getWorkdayMin } from '../utils/taskSplit';
import type { Task, Settings, ScheduleSlot } from '../types';

export function useSchedule(tasks: Task[], settings: Settings) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real-time auto-lock: whenever slots change, schedule a timer to fire
  // exactly when the next unlocked slot starts, locking it immediately.
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
      // 0. Auto-lock any unlocked slots that have already started (are in the past)
      await supabase
        .from('schedule_slots')
        .update({ locked: true })
        .eq('locked', false)
        .lt('start_time', new Date().toISOString());

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

      // 5b. Split tasks whose slots span multiple days into separate task records
      const slotsByTaskId = new Map<string, typeof newSlots[number][]>();
      for (const slot of newSlots) {
        const arr = slotsByTaskId.get(slot.task_id) || [];
        arr.push(slot);
        slotsByTaskId.set(slot.task_id, arr);
      }

      const slotDayKey = (iso: string) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };

      for (const [taskId, taskSlots] of slotsByTaskId) {
        const days = new Set(taskSlots.map((s) => slotDayKey(s.start_time)));
        if (days.size <= 1) continue;

        const task = currentTasks.find((t) => t.id === taskId);
        if (!task || task.completed) continue;

        // Group this task's slots by calendar day
        const slotsByDay = new Map<string, typeof taskSlots>();
        for (const slot of taskSlots) {
          const dk = slotDayKey(slot.start_time);
          const arr = slotsByDay.get(dk) || [];
          arr.push(slot);
          slotsByDay.set(dk, arr);
        }

        const baseTitle = task.title.replace(/\s\d+\/\d+$/, '');
        const groupId = task.split_group_id || crypto.randomUUID();
        const origIndex = task.split_index ?? 1;
        const notes = (task.people_notes || []) as { person_name: string; note_text: string }[];

        // Delete original task from DB (slots haven't been inserted yet)
        await supabase.from('schedule_slots').delete().eq('task_id', taskId);
        await supabase.from('tasks').delete().eq('id', taskId);

        // Create a new task for each day's portion
        const sortedDays = [...slotsByDay.keys()].sort();
        const createdTasks: Task[] = [];

        for (const day of sortedDays) {
          const daySlots = slotsByDay.get(day)!;
          const dayMin = daySlots.reduce(
            (sum, s) => sum + (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / (1000 * 60),
            0
          );

          const { data: created, error: insErr } = await supabase
            .from('tasks')
            .insert({
              title: baseTitle,
              description: task.description ?? '',
              estimated_min: dayMin,
              deadline: task.deadline,
              priority: task.priority,
              completed: false,
              split_group_id: groupId,
              split_index: 0,
            })
            .select()
            .single();
          if (insErr) throw insErr;

          if (notes.length > 0) {
            await supabase.from('people_notes').insert(
              notes.map((n) => ({ task_id: created.id, person_name: n.person_name, note_text: n.note_text }))
            );
          }

          // Reassign the pending slot entries to the new task
          for (const slot of daySlots) {
            slot.task_id = created.id;
          }

          createdTasks.push({ ...created, people_notes: notes } as Task);
        }

        // Update currentTasks: remove original, add day-parts
        currentTasks = [...currentTasks.filter((t) => t.id !== taskId), ...createdTasks];

        // Renumber the entire split group — new day-parts sit where original task was
        const allGroupMembers = currentTasks.filter((t) => t.split_group_id === groupId);
        allGroupMembers.sort((a, b) => {
          const aIsNew = createdTasks.some((ct) => ct.id === a.id);
          const bIsNew = createdTasks.some((ct) => ct.id === b.id);
          const aSort = aIsNew ? origIndex + createdTasks.findIndex((ct) => ct.id === a.id) * 0.01 : (a.split_index ?? 0);
          const bSort = bIsNew ? origIndex + createdTasks.findIndex((ct) => ct.id === b.id) * 0.01 : (b.split_index ?? 0);
          return aSort - bSort;
        });

        const totalN = allGroupMembers.length;
        for (let i = 0; i < allGroupMembers.length; i++) {
          const member = allGroupMembers[i];
          const newTitle = `${baseTitle} ${i + 1}/${totalN}`;
          await supabase.from('tasks').update({ title: newTitle, split_index: i + 1 }).eq('id', member.id);
          member.title = newTitle;
          member.split_index = i + 1;
        }
      }

      // 5c. Split tasks whose slots are separated by the lunch break into separate task records
      const lunchSlotsByTaskId = new Map<string, typeof newSlots[number][]>();
      for (const slot of newSlots) {
        const arr = lunchSlotsByTaskId.get(slot.task_id) || [];
        arr.push(slot);
        lunchSlotsByTaskId.set(slot.task_id, arr);
      }

      // Parse lunch boundaries as hours (e.g. "12:00" -> 12)
      const [lunchStartH, lunchStartM] = settings.lunch_start.split(':').map(Number);
      const [lunchEndH, lunchEndM] = settings.lunch_end.split(':').map(Number);
      const lunchStartMin = lunchStartH * 60 + lunchStartM;
      const lunchEndMin = lunchEndH * 60 + lunchEndM;

      for (const [taskId, taskSlots] of lunchSlotsByTaskId) {
        // Only consider tasks with multiple slots on the same day
        const dayGroups = new Map<string, typeof taskSlots>();
        for (const slot of taskSlots) {
          const dk = slotDayKey(slot.start_time);
          const arr = dayGroups.get(dk) || [];
          arr.push(slot);
          dayGroups.set(dk, arr);
        }

        // Find a day with a lunch gap
        let amSlots: typeof taskSlots | null = null;
        let pmSlots: typeof taskSlots | null = null;

        for (const [, daySlotsArr] of dayGroups) {
          if (daySlotsArr.length < 2) continue;
          daySlotsArr.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

          for (let i = 0; i < daySlotsArr.length - 1; i++) {
            const slotAEnd = new Date(daySlotsArr[i].end_time);
            const slotBStart = new Date(daySlotsArr[i + 1].start_time);
            const aEndMin = slotAEnd.getHours() * 60 + slotAEnd.getMinutes();
            const bStartMin = slotBStart.getHours() * 60 + slotBStart.getMinutes();

            if (aEndMin <= lunchStartMin && bStartMin >= lunchEndMin) {
              amSlots = daySlotsArr.slice(0, i + 1);
              pmSlots = daySlotsArr.slice(i + 1);
              break;
            }
          }
          if (amSlots) break;
        }

        if (!amSlots || !pmSlots) continue;

        const task = currentTasks.find((t) => t.id === taskId);
        if (!task || task.completed) continue;

        const baseTitle = task.title.replace(/\s\d+\/\d+$/, '');
        const groupId = task.split_group_id || crypto.randomUUID();
        const origIndex = task.split_index ?? 1;
        const notes = (task.people_notes || []) as { person_name: string; note_text: string }[];

        // Delete original task from DB (slots haven't been inserted yet)
        await supabase.from('schedule_slots').delete().eq('task_id', taskId);
        await supabase.from('tasks').delete().eq('id', taskId);

        const portions = [amSlots, pmSlots];
        const createdTasks: Task[] = [];

        for (const portionSlots of portions) {
          const portionMin = portionSlots.reduce(
            (sum, s) => sum + (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / (1000 * 60),
            0
          );

          const { data: created, error: insErr } = await supabase
            .from('tasks')
            .insert({
              title: baseTitle,
              description: task.description ?? '',
              estimated_min: portionMin,
              deadline: task.deadline,
              priority: task.priority,
              completed: false,
              split_group_id: groupId,
              split_index: 0,
            })
            .select()
            .single();
          if (insErr) throw insErr;

          if (notes.length > 0) {
            await supabase.from('people_notes').insert(
              notes.map((n) => ({ task_id: created.id, person_name: n.person_name, note_text: n.note_text }))
            );
          }

          // Reassign the pending slot entries to the new task
          for (const slot of portionSlots) {
            slot.task_id = created.id;
          }

          createdTasks.push({ ...created, people_notes: notes } as Task);
        }

        // Update currentTasks: remove original, add lunch-split parts
        currentTasks = [...currentTasks.filter((t) => t.id !== taskId), ...createdTasks];

        // Renumber the entire split group
        const allGroupMembers = currentTasks.filter((t) => t.split_group_id === groupId);
        allGroupMembers.sort((a, b) => {
          const aIsNew = createdTasks.some((ct) => ct.id === a.id);
          const bIsNew = createdTasks.some((ct) => ct.id === b.id);
          const aSort = aIsNew ? origIndex + createdTasks.findIndex((ct) => ct.id === a.id) * 0.01 : (a.split_index ?? 0);
          const bSort = bIsNew ? origIndex + createdTasks.findIndex((ct) => ct.id === b.id) * 0.01 : (b.split_index ?? 0);
          return aSort - bSort;
        });

        const totalN = allGroupMembers.length;
        for (let i = 0; i < allGroupMembers.length; i++) {
          const member = allGroupMembers[i];
          const newTitle = `${baseTitle} ${i + 1}/${totalN}`;
          await supabase.from('tasks').update({ title: newTitle, split_index: i + 1 }).eq('id', member.id);
          member.title = newTitle;
          member.split_index = i + 1;
        }
      }

      // 6. Delete all remaining unlocked slots (past ones were locked in step 0)
      await supabase
        .from('schedule_slots')
        .delete()
        .eq('locked', false);

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
      const locked = new Date(start_time) < new Date();
      const { error } = await supabase
        .from('schedule_slots')
        .update({ start_time, end_time, locked })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, start_time, end_time }) => {
      const locked = new Date(start_time) < new Date();
      await queryClient.cancelQueries({ queryKey: ['schedule_slots'] });
      const previous = queryClient.getQueryData<ScheduleSlot[]>(['schedule_slots']);
      queryClient.setQueryData<ScheduleSlot[]>(['schedule_slots'], (old) =>
        old?.map((s) => (s.id === id ? { ...s, start_time, end_time, locked } : s))
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

  const currentSlots = slotsQuery.data || [];

  // Real-time auto-lock: schedule a timer to fire exactly when the next
  // unlocked slot starts, then lock all newly-past slots immediately.
  useEffect(() => {
    const autoLock = async () => {
      await supabase
        .from('schedule_slots')
        .update({ locked: true })
        .eq('locked', false)
        .lt('start_time', new Date().toISOString());
      queryClient.invalidateQueries({ queryKey: ['schedule_slots'] });
    };

    const scheduleNext = (slotList: ScheduleSlot[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      const now = Date.now();
      const nextStart = slotList
        .filter((s) => !s.locked && new Date(s.start_time).getTime() > now)
        .map((s) => new Date(s.start_time).getTime())
        .sort((a, b) => a - b)[0];

      if (!nextStart) return;

      timerRef.current = setTimeout(async () => {
        await autoLock();
      }, nextStart - now);
    };

    scheduleNext(currentSlots);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [currentSlots, queryClient]);

  return {
    slots: currentSlots,
    isLoading: slotsQuery.isLoading,
    regenerate,
    moveSlot,
    toggleLock,
    resizeTaskSlots,
    addSlot,
  };
}
