import type { Task, Settings, ScheduleSlot } from '../types';
import { parseTimeString } from '../utils/dateHelpers';

const SLOT_DURATION_MIN = 30;
const MIN_BLOCK_SLOTS = 2; // minimum 60 min per scheduled block
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

  const { hours: lunchStartH, minutes: lunchStartM } = parseTimeString(settings.lunch_start);
  const { hours: lunchEndH, minutes: lunchEndM } = parseTimeString(settings.lunch_end);

  const current = new Date(now);
  current.setHours(startHour, startMin, 0, 0);
  if (current < now) {
    // Round up to the next whole clock hour
    const nextHour = new Date(now);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    current.setTime(nextHour.getTime());
  }

  while (current < endDate) {
    const day = current.getDay();

    // Skip weekends based on settings
    if (day === 0 && !settings.include_sunday) {
      current.setDate(current.getDate() + 1);
      current.setHours(startHour, startMin, 0, 0);
      continue;
    }
    if (day === 6 && !settings.include_saturday) {
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
      // Skip slots that overlap with lunch window
      const lunchStart = new Date(current);
      lunchStart.setHours(lunchStartH, lunchStartM, 0, 0);
      const lunchEnd = new Date(current);
      lunchEnd.setHours(lunchEndH, lunchEndM, 0, 0);

      if (!(current < lunchEnd && slotEnd > lunchStart)) {
        slots.push({ start: new Date(current), end: new Date(slotEnd) });
      }
    }

    current.setTime(slotEnd.getTime());
  }

  return slots;
}

/** Generate 30-min overflow slots from work_day_end to 23:59 on a given date, filtering out locked overlaps */
function buildOverflowSlots(date: Date, settings: Settings, lockedSlots: ScheduleSlot[]): TimeSlot[] {
  const { hours: endHour, minutes: endMin } = parseTimeString(settings.work_day_end);
  const slots: TimeSlot[] = [];

  const current = new Date(date);
  current.setHours(endHour, endMin, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 0, 0);

  while (current < dayEnd) {
    const slotEnd = new Date(current.getTime() + SLOT_DURATION_MIN * 60 * 1000);
    const isLocked = lockedSlots.some((ls) => {
      const lsStart = new Date(ls.start_time).getTime();
      const lsEnd = new Date(ls.end_time).getTime();
      return current.getTime() < lsEnd && slotEnd.getTime() > lsStart;
    });
    if (!isLocked) {
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
  const incompleteTasks = tasks.filter((t) => !t.completed);

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

  // Gap tracking:
  // - Between tasks in DIFFERENT groups (or ungrouped): 30-min break (skip if previous task was only 1 hour)
  // - Within SAME split_group_id: always back-to-back, no break
  let lastBlockEnd = 0; // timestamp of latest placed block end
  let lastBlockGroupId: string | null = null;
  let lastTaskPlacedMin = 0; // total minutes placed for the previous task

  for (const task of sorted) {
    let remainingMin = task.estimated_min - (lockedMinByTask.get(task.id) || 0);
    if (remainingMin <= 0) continue;

    const deadlineTime = task.deadline ? new Date(task.deadline).getTime() : Infinity;
    const taskGroupId = task.split_group_id || null;

    // Determine minimum start time based on gap rules
    let minStartTime: number | undefined;
    if (lastBlockEnd > 0) {
      const sameGroup = taskGroupId !== null && taskGroupId === lastBlockGroupId;
      if (!sameGroup && lastTaskPlacedMin > 60) {
        // Different group or ungrouped: 30-min break (skip if previous task was only 1 hour)
        minStartTime = lastBlockEnd + SLOT_DURATION_MIN * 60 * 1000;
      }
    }

    while (remainingMin > 0) {
      // Pick the earliest day that still has free slots (fill days fully before moving on)
      //   Pass 1: before deadline
      //   Pass 2: allow past deadline (task still gets placed)
      const pickBest = (allowPastDeadline: boolean): DayBucket | null => {
        for (const b of buckets) {
          if (b.nextIdx >= b.slots.length) continue;
          if (!allowPastDeadline && b.date.getTime() >= deadlineTime) continue;
          return b; // earliest day with capacity
        }
        return null;
      };

      const best = pickBest(false) ?? pickBest(true);
      if (!best) break;

      // Find the first slot that starts after the minimum start time (if applicable)
      let startIdx = best.nextIdx;
      if (minStartTime) {
        while (startIdx < best.slots.length && best.slots[startIdx].start.getTime() < minStartTime) {
          startIdx++;
        }
      }

      // If no usable slot on this day, advance the bucket and retry
      if (startIdx >= best.slots.length) {
        best.nextIdx = best.slots.length; // mark day as exhausted
        continue;
      }

      // Find full contiguous run from startIdx
      const blockStart = best.slots[startIdx].start;
      let nextIdx = startIdx + 1;
      while (
        nextIdx < best.slots.length &&
        best.slots[nextIdx].start.getTime() === best.slots[nextIdx - 1].end.getTime()
      ) {
        nextIdx++;
      }
      const contiguousCount = nextIdx - startIdx;

      // Enforce minimum block size of 60 min — skip short runs
      if (contiguousCount < MIN_BLOCK_SLOTS) {
        best.nextIdx = nextIdx; // skip past this short run
        continue;
      }

      const neededSlots = Math.ceil(remainingMin / SLOT_DURATION_MIN);
      let usedSlots = Math.max(MIN_BLOCK_SLOTS, Math.min(neededSlots, contiguousCount));

      // If the leftover after this block would be too small for its own block,
      // extend this block to absorb it (if the contiguous run has room)
      const afterMin = remainingMin - usedSlots * SLOT_DURATION_MIN;
      if (afterMin > 0 && afterMin < MIN_BLOCK_SLOTS * SLOT_DURATION_MIN) {
        const extraSlots = Math.ceil(afterMin / SLOT_DURATION_MIN);
        if (usedSlots + extraSlots <= contiguousCount) {
          usedSlots += extraSlots;
        } else {
          // Can't extend — absorb the remainder into this block and stop
          // (avoids spilling a tiny block onto the next day)
          usedSlots = Math.min(neededSlots, contiguousCount);
          usedSlots = Math.max(MIN_BLOCK_SLOTS, usedSlots);
        }
      }

      const actualEnd = new Date(blockStart.getTime() + usedSlots * SLOT_DURATION_MIN * 60 * 1000);

      result.push({
        task_id: task.id,
        start_time: blockStart.toISOString(),
        end_time: actualEnd.toISOString(),
      });

      const usedMin = usedSlots * SLOT_DURATION_MIN;
      remainingMin -= usedMin;
      best.allocatedMin += usedMin;
      best.nextIdx = startIdx + usedSlots;

      // If remainder is too small for a standalone block, consider the task done
      if (remainingMin > 0 && remainingMin < MIN_BLOCK_SLOTS * SLOT_DURATION_MIN) {
        break;
      }

      // Only enforce the gap before the task's first block
      minStartTime = undefined;
    }

    // Update gap tracking after placing this task
    const lastTaskResult = result.filter((r) => r.task_id === task.id).pop();
    if (lastTaskResult) {
      lastBlockEnd = new Date(lastTaskResult.end_time).getTime();
      lastBlockGroupId = taskGroupId;

      // Sum minutes placed for this task
      const taskPlacedMin = result
        .filter((r) => r.task_id === task.id)
        .reduce((sum, r) => sum + (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / (1000 * 60), 0);
      lastTaskPlacedMin = taskPlacedMin;
    }
  }

  // Second pass: deadline overflow — for deadline tasks with remaining minutes,
  // try to place them in overflow slots (after work_day_end) on days up to the deadline

  // Track how much was already allocated per task in the main loop
  const allocatedByTask = new Map<string, number>();
  for (const r of result) {
    const dur = (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / (1000 * 60);
    allocatedByTask.set(r.task_id, (allocatedByTask.get(r.task_id) || 0) + dur);
  }

  for (const task of sorted) {
    if (!task.deadline) continue;
    const totalAllocated = (lockedMinByTask.get(task.id) || 0) + (allocatedByTask.get(task.id) || 0);
    let overflowRemaining = task.estimated_min - totalAllocated;
    if (overflowRemaining <= 0) continue;

    const deadlineDate = new Date(task.deadline);
    // Try overflow slots on each day from today up to the deadline day
    const cursor = new Date(now);
    cursor.setHours(0, 0, 0, 0);

    while (overflowRemaining > 0 && cursor <= deadlineDate) {
      const overflowSlots = buildOverflowSlots(cursor, settings, lockedSlots);
      // Also filter out slots already used by result
      const availableOverflow = overflowSlots.filter((slot) =>
        !result.some((r) => {
          const rStart = new Date(r.start_time).getTime();
          const rEnd = new Date(r.end_time).getTime();
          return slot.start.getTime() < rEnd && slot.end.getTime() > rStart;
        })
      );

      for (let si = 0; si < availableOverflow.length; si++) {
        if (overflowRemaining <= 0) break;
        const slot = availableOverflow[si];
        // Find full contiguous run from this slot
        let blockEnd = slot.end;
        let count = 1;
        for (let i = si + 1; i < availableOverflow.length; i++) {
          if (availableOverflow[i].start.getTime() === blockEnd.getTime()) {
            blockEnd = availableOverflow[i].end;
            count++;
          } else break;
        }

        // Enforce minimum block size of 60 min — skip short runs
        if (count < MIN_BLOCK_SLOTS) {
          si += count - 1; // skip past this short run
          continue;
        }

        const slotsNeeded = Math.ceil(overflowRemaining / SLOT_DURATION_MIN);
        const usedCount = Math.max(MIN_BLOCK_SLOTS, Math.min(slotsNeeded, count));
        const usedEnd = new Date(slot.start.getTime() + usedCount * SLOT_DURATION_MIN * 60 * 1000);
        const usedMin = usedCount * SLOT_DURATION_MIN;
        result.push({
          task_id: task.id,
          start_time: slot.start.toISOString(),
          end_time: usedEnd.toISOString(),
        });
        overflowRemaining -= usedMin;
        break; // move to next day
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return result;
}
