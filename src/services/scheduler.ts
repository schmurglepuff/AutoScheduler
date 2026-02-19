import type { Task, Settings, ScheduleSlot } from '../types';
import { parseTimeString } from '../utils/dateHelpers';

const SLOT_DURATION_MIN = 30;
const SCHEDULE_WEEKS = 6;

const priorityWeight: Record<string, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

interface TimeSlot {
  start: Date;
  end: Date;
}

function buildAvailableSlots(settings: Settings): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + SCHEDULE_WEEKS * 7);

  const { hours: startHour, minutes: startMin } = parseTimeString(settings.work_day_start);
  const { hours: endHour, minutes: endMin } = parseTimeString(settings.work_day_end);

  const current = new Date(now);
  current.setHours(startHour, startMin, 0, 0);
  if (current < now) {
    // Round up to next slot boundary
    const minutesSinceStart = (now.getTime() - current.getTime()) / (1000 * 60);
    const slotsToSkip = Math.ceil(minutesSinceStart / SLOT_DURATION_MIN);
    current.setMinutes(current.getMinutes() + slotsToSkip * SLOT_DURATION_MIN);
  }

  while (current < endDate) {
    const day = current.getDay();

    // Weekends are always excluded from auto-scheduling (manual-only)
    if (day === 0 || day === 6) {
      current.setDate(current.getDate() + 1);
      current.setHours(startHour, startMin, 0, 0);
      continue;
    }

    const dayEnd = new Date(current);
    dayEnd.setHours(endHour, endMin, 0, 0);

    if (current >= dayEnd) {
      current.setDate(current.getDate() + 1);
      current.setHours(startHour, startMin, 0, 0);
      continue;
    }

    const slotEnd = new Date(current.getTime() + SLOT_DURATION_MIN * 60 * 1000);
    if (slotEnd <= dayEnd) {
      slots.push({ start: new Date(current), end: new Date(slotEnd) });
    }

    current.setTime(slotEnd.getTime());
  }

  return slots;
}

export function generateSchedule(
  tasks: Task[],
  settings: Settings,
  lockedSlots: ScheduleSlot[] = []
): Omit<ScheduleSlot, 'id' | 'task'>[] {
  // Tasks that already have locked slots need fewer minutes scheduled
  const lockedMinByTask = new Map<string, number>();
  for (const ls of lockedSlots) {
    const dur = (new Date(ls.end_time).getTime() - new Date(ls.start_time).getTime()) / (1000 * 60);
    lockedMinByTask.set(ls.task_id, (lockedMinByTask.get(ls.task_id) || 0) + dur);
  }

  const now = new Date();
  const incompleteTasks = tasks.filter((t) => {
    if (t.completed) return false;
    // Skip tasks with past deadlines
    if (t.deadline && new Date(t.deadline) < now) return false;
    return true;
  });

  // Tier 1: tasks WITH future deadlines — earliest deadline first, priority as tiebreaker
  const withDeadline = incompleteTasks
    .filter((t) => t.deadline !== null)
    .sort((a, b) => {
      const deadlineDiff = new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime();
      if (deadlineDiff !== 0) return deadlineDiff;
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    });

  // Tier 2: tasks WITHOUT deadlines — highest priority first, then oldest first
  const withoutDeadline = incompleteTasks
    .filter((t) => t.deadline === null)
    .sort((a, b) => {
      const priDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
      if (priDiff !== 0) return priDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  const sorted = [...withDeadline, ...withoutDeadline];

  let availableSlots = buildAvailableSlots(settings);

  // Remove any 30-min slots that overlap with locked slots
  availableSlots = availableSlots.filter((slot) =>
    !lockedSlots.some((ls) => {
      const lsStart = new Date(ls.start_time).getTime();
      const lsEnd = new Date(ls.end_time).getTime();
      return slot.start.getTime() < lsEnd && slot.end.getTime() > lsStart;
    })
  );

  // Group available slots by day key (YYYY-MM-DD) to enable spread allocation
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  interface DayBucket {
    key: string;
    date: Date;           // midnight of this day
    slots: TimeSlot[];    // available 30-min slots (chronological)
    allocatedMin: number; // minutes already assigned in this run
    nextIdx: number;      // pointer into slots[] for next free slot
  }

  const bucketMap = new Map<string, DayBucket>();
  for (const slot of availableSlots) {
    const k = dayKey(slot.start);
    let bucket = bucketMap.get(k);
    if (!bucket) {
      const d = new Date(slot.start);
      d.setHours(0, 0, 0, 0);
      bucket = { key: k, date: d, slots: [], allocatedMin: 0, nextIdx: 0 };
      bucketMap.set(k, bucket);
    }
    bucket.slots.push(slot);
  }

  // Also count locked slots toward each day's load so we spread around existing commitments
  for (const ls of lockedSlots) {
    const lsDate = new Date(ls.start_time);
    const k = dayKey(lsDate);
    const bucket = bucketMap.get(k);
    if (bucket) {
      const dur = (new Date(ls.end_time).getTime() - lsDate.getTime()) / (1000 * 60);
      bucket.allocatedMin += dur;
    }
  }

  const buckets = Array.from(bucketMap.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const result: Omit<ScheduleSlot, 'id' | 'task'>[] = [];

  for (const task of sorted) {
    let remainingMin = task.estimated_min - (lockedMinByTask.get(task.id) || 0);
    if (remainingMin <= 0) continue;

    const deadlineTime = task.deadline ? new Date(task.deadline).getTime() : Infinity;
    // Prefer scheduling within the last 7 days before the deadline
    const PREFERRED_LEAD_DAYS = 7;
    const preferredStart = task.deadline
      ? new Date(new Date(task.deadline).getTime() - PREFERRED_LEAD_DAYS * 24 * 60 * 60 * 1000).getTime()
      : -Infinity;

    while (remainingMin > 0) {
      // First pass: pick the least-loaded day within the preferred window (last week before deadline)
      // Second pass (fallback): pick the least-loaded day anywhere before the deadline
      let best: DayBucket | null = null;
      for (const b of buckets) {
        if (b.nextIdx >= b.slots.length) continue;             // no free slots left
        if (b.date.getTime() >= deadlineTime) continue;        // past deadline
        if (b.date.getTime() >= preferredStart) {
          // Within preferred window — pick least-loaded among these
          if (!best || best.date.getTime() < preferredStart || b.allocatedMin < best.allocatedMin) {
            best = b;
          }
        } else if (!best || best.date.getTime() < preferredStart) {
          // Outside preferred window — only consider if nothing in the window yet
          if (!best || b.allocatedMin < best.allocatedMin) best = b;
        }
      }
      if (!best) break; // no available day

      // Allocate contiguous slots on the chosen day
      const startIdx = best.nextIdx;
      const blockStart = best.slots[startIdx].start;
      let blockEnd = best.slots[startIdx].end;
      let allocatedMin = SLOT_DURATION_MIN;
      let nextIdx = startIdx + 1;

      while (
        allocatedMin < remainingMin &&
        nextIdx < best.slots.length &&
        best.slots[nextIdx].start.getTime() === blockEnd.getTime()
      ) {
        blockEnd = best.slots[nextIdx].end;
        allocatedMin += SLOT_DURATION_MIN;
        nextIdx++;
      }

      const neededSlots = Math.ceil(remainingMin / SLOT_DURATION_MIN);
      const usedSlots = Math.min(neededSlots, nextIdx - startIdx);
      const actualEnd = new Date(blockStart.getTime() + usedSlots * SLOT_DURATION_MIN * 60 * 1000);

      result.push({
        task_id: task.id,
        start_time: blockStart.toISOString(),
        end_time: actualEnd.toISOString(),
      });

      const usedMin = usedSlots * SLOT_DURATION_MIN;
      remainingMin -= usedMin;
      best.allocatedMin += usedMin;
      best.nextIdx += usedSlots;
    }
  }

  return result;
}
