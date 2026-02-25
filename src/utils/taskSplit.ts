import { parseTimeString } from './dateHelpers';
import type { Settings, Priority } from '../types';

export interface SplittableTaskData {
  title: string;
  description: string;
  estimated_min: number;
  deadline: string | null;
  priority: Priority;
  completed: boolean;
  people_notes: { person_name: string; note_text: string }[];
  split_group_id?: string | null;
  split_index?: number | null;
}

export function getWorkdayMin(settings: Settings): number {
  const { hours: startH, minutes: startM } = parseTimeString(settings.work_day_start);
  const { hours: endH, minutes: endM } = parseTimeString(settings.work_day_end);
  return endH * 60 + endM - (startH * 60 + startM);
}

/**
 * Returns true if the task should be auto-split.
 * Threshold: task is longer than one workday.
 */
export function shouldSplitTask(estimatedMin: number, workdayMin: number): boolean {
  return estimatedMin >= workdayMin || estimatedMin >= 5 * 60;
}

/**
 * Splits a large task into n smaller tasks, each at most 5 hours (300 min).
 * Minimum chunk size is 1 hour (60 min).
 * All parts share the same priority, deadline, description, and people_notes.
 * The sum of all parts' estimated_min equals the original estimated_min.
 * Titles are suffixed " 1/n", " 2/n", etc.
 */
export function splitTaskData(
  data: SplittableTaskData,
  workdayMin: number
): SplittableTaskData[] {
  const total = data.estimated_min;
  const chunkTarget = 300; // 5 hours max per chunk
  const n = Math.max(2, Math.ceil(total / chunkTarget));
  // Round base chunk down to whole hours so parts display cleanly in the form
  // (minute dropdown only has 0/15/30/45; input totals are always multiples of 15,
  //  so the last chunk absorbs the correct remainder minutes automatically)
  const baseMin = Math.floor(Math.floor(total / n) / 60) * 60;
  const groupId = crypto.randomUUID();

  return Array.from({ length: n }, (_, i) => {
    const partMin = i === n - 1 ? total - baseMin * (n - 1) : baseMin;
    return {
      title: `${data.title} ${i + 1}/${n}`,
      description: data.description,
      estimated_min: partMin,
      deadline: data.deadline,
      priority: data.priority,
      completed: data.completed,
      people_notes: data.people_notes,
      split_group_id: groupId,
      split_index: i + 1,
    };
  });
}
