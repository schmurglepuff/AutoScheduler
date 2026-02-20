import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Task } from '../types';

interface NoteInput {
  person_name: string;
  note_text: string;
}

export function useTasks() {
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ['tasks'],
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, people_notes(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createTask = useMutation({
    mutationFn: async (
      task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'people_notes'> & {
        people_notes?: NoteInput[];
      }
    ) => {
      const { people_notes, ...taskData } = task;
      const { data, error } = await supabase.from('tasks').insert(taskData).select().single();
      if (error) throw error;

      if (people_notes && people_notes.length > 0) {
        const notes = people_notes.map((n) => ({ ...n, task_id: data.id }));
        const { error: noteError } = await supabase.from('people_notes').insert(notes);
        if (noteError) throw noteError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({
      id,
      people_notes,
      ...updates
    }: Omit<Partial<Task>, 'people_notes'> & {
      id: string;
      people_notes?: NoteInput[];
    }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;

      // Propagate deadline changes to all tasks in the same split group
      if ('deadline' in updates) {
        const cachedTasks = queryClient.getQueryData<Task[]>(['tasks']);
        const groupId = cachedTasks?.find((t) => t.id === id)?.split_group_id;
        if (groupId) {
          await supabase
            .from('tasks')
            .update({ deadline: updates.deadline, updated_at: new Date().toISOString() })
            .eq('split_group_id', groupId)
            .neq('id', id);
        }
      }

      if (people_notes !== undefined) {
        await supabase.from('people_notes').delete().eq('task_id', id);
        if (people_notes.length > 0) {
          const notes = people_notes.map((n) => ({ ...n, task_id: id }));
          const { error: noteError } = await supabase.from('people_notes').insert(notes);
          if (noteError) throw noteError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['schedule_slots'] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  return {
    tasks: tasksQuery.data || [],
    isLoading: tasksQuery.isLoading,
    error: tasksQuery.error,
    createTask,
    updateTask,
    deleteTask,
  };
}
