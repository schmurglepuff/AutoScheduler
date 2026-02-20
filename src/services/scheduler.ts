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

  // Within each split group, sort by split_index so parts are scheduled in order
  const sortWithinGroups = (arr: Task[]) => {
    return arr.sort((a, b) => {
      if (a.split_group_id && a.split_group_id === b.split_group_id) {
        return (a.split_index ?? 0) - (b.split_index ?? 0);
      }
      return 0;
    });
  };

  const sorted = [...sortWithinGroups(withDeadline), ...sortWithinGroups(withoutDeadline)];

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

  // Track which days have been used by each split group so parts land on separate days
  // and are scheduled in ascending split_index order.
  interface GroupState {
    usedDays: Set<string>;
    lastDayKey: string | null;
  }
  const groupState = new Map<string, GroupState>();

  for (const task of sorted) {
    let remainingMin = task.estimated_min - (lockedMinByTask.get(task.id) || 0);
    if (remainingMin <= 0) continue;

    const deadlineTime = task.deadline ? new Date(task.deadline).getTime() : Infinity;
    // Prefer scheduling within the last 7 days before the deadline
    const PREFERRED_LEAD_DAYS = 7;
    const preferredStart = task.deadline
      ? new Date(new Date(task.deadline).getTime() - PREFERRED_LEAD_DAYS * 24 * 60 * 60 * 1000).getTime()
      : -Infinity;

    // Initialise group state for split tasks
    let gs: GroupState | null = null;
    if (task.split_group_id) {
      if (!groupState.has(task.split_group_id)) {
        groupState.set(task.split_group_id, { usedDays: new Set(), lastDayKey: null });
      }
      gs = groupState.get(task.split_group_id)!;
    }

    while (remainingMin > 0) {
      // Pick the best available day with up to three relaxation passes:
      //   Pass 1 — strict:      before deadline, one-per-day group constraint
      //   Pass 2 — relax group: before deadline, allow same day for split group
      //   Pass 3 — fallback:    allow past-deadline (task still gets placed)
      const pickBest = (allowSameDay: boolean, allowPastDeadline: boolean): DayBucket | null => {
        let best: DayBucket | null = null;

        // Count contiguous free minutes in a bucket starting from its nextIdx pointer.
        const contiguousMin = (b: DayBucket): number => {
          let total = 0;
          for (let i = b.nextIdx; i < b.slots.length; i++) {
            if (i > b.nextIdx && b.slots[i].start.getTime() !== b.slots[i - 1].end.getTime()) break;
            total += SLOT_DURATION_MIN;
          }
          return total;
        };

        // Returns true if candidate should be preferred over current.
        const beats = (candidate: DayBucket, current: DayBucket): boolean => {
          // Regular tasks WITH a deadline: prefer the least-loaded day so they spread
          // across the deadline window rather than front-loading onto day one.
          if (task.deadline !== null && !gs) {
            return candidate.allocatedMin < current.allocatedMin;
          }
          // Split group parts: strongly prefer a day that has enough contiguous room
          // to fit the entire remaining block, so a part is never truncated just
          // because the picked day was running out of time at the end of the day.
          if (gs) {
            const cf = contiguousMin(candidate) >= remainingMin;
            const bf = contiguousMin(current) >= remainingMin;
            if (cf !== bf) return cf; // fitting day beats non-fitting day
          }
          // No-deadline tasks (split or not) and split parts that tie on capacity:
          // fill forward from the earliest available day.
          return candidate.date.getTime() < current.date.getTime();
        };

        for (const b of buckets) {
          if (b.nextIdx >= b.slots.length) continue;
          if (!allowPastDeadline && b.date.getTime() >= deadlineTime) continue;
          if (gs) {
            if (!allowSameDay && gs.usedDays.has(b.key)) continue;
            if (gs.lastDayKey && b.key <= gs.lastDayKey) continue;
          }

          if (b.date.getTime() >= preferredStart) {
            if (!best || best.date.getTime() < preferredStart || beats(b, best)) {
              best = b;
            }
          } else if (!best || best.date.getTime() < preferredStart) {
            if (!best || beats(b, best)) best = b;
          }
        }
        return best;
      };

      const best =
        pickBest(false, false) ??   // strict
        pickBest(true,  false) ??   // relax same-day for split group
        pickBest(true,  true);      // allow past deadline

      if (!best) break;

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

      // Mark this day as used for the split group (one part per day, ascending order)
      if (gs) {
        gs.usedDays.add(best.key);
        gs.lastDayKey = best.key;
        break; // only schedule one slot per day for each split part
      }
    }
  }

  return result;
}
