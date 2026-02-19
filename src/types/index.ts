export interface Task {
  id: string;
  title: string;
  description: string;
  estimated_min: number;
  deadline: string;
  priority: 'Low' | 'Medium' | 'High';
  completed: boolean;
  created_at: string;
  updated_at: string;
  people_notes?: PersonNote[];
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
}

export type Priority = 'Low' | 'Medium' | 'High';
