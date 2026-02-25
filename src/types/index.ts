export interface Task {
  id: string;
  title: string;
  description: string;
  estimated_min: number;
  deadline: string | null;
  priority: 'Low' | 'Medium' | 'High';
  completed: boolean;
  created_at: string;
  updated_at: string;
  people_notes?: PersonNote[];
  split_group_id?: string | null;
  split_index?: number | null;
}

export interface PersonNote {
  id: string;
  task_id: string;
  person_name: string;
  note_text: string;
  created_at: string;
}

export interface ScheduleSlot {
  id: string;
  task_id: string;
  start_time: string;
  end_time: string;
  locked: boolean;
  task?: Task;
}

export interface Settings {
  id: number;
  work_day_start: string;
  work_day_end: string;
  include_saturday: boolean;
  include_sunday: boolean;
  theme: 'light' | 'dark';
  accent_color: string;
  auto_split_tasks: boolean;
  scheduler_active: boolean;
  lunch_start: string;
  lunch_end: string;
}

export type Priority = 'Low' | 'Medium' | 'High';
