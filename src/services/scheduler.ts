import type { Task, Settings, ScheduleSlot } from '../types';
import { parseTimeString } from '../utils/dateHelpers';

const SLOT_DURATION_MIN = 30;
const SCHEDULE_WEEKS = 4;

const priorityWeight: Record<string, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

interface TimeSlot {
  start: Date;
  end: Date;
}

function computeScore(task: Task): number {
  const now = new Date();
  const deadline = new Date(task.deadline);
  const hoursUntilDeadline = Math.max(1, (deadline.getTime() - now.getTime()) / (1000 * 60 * 60));
  return priorityWeight[task.priority] * 1000 + 1000 / hoursUntilDeadline;
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

    // Skip excluded days
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

  const incompleteTasks = tasks.filter((t) => !t.completed);
  const sorted = [...incompleteTasks].sort((a, b) => computeScore(b) - computeScore(a));

  let availableSlots = buildAvailableSlots(settings);

  // Remove any 30-min slots that overlap with locked slots
  availableSlots = availableSlots.filter((slot) =>
    !lockedSlots.some((ls) => {
      const lsStart = new Date(ls.start_time).getTime();
      const lsEnd = new Date(ls.end_time).getTime();
      return slot.start.getTime() < lsEnd && slot.end.getTime() > lsStart;
    })
  );

  const result: Omit<ScheduleSlot, 'id' | 'task'>[] = [];
  let slotIndex = 0;

  for (const task of sorted) {
    let remainingMin = task.estimated_min - (lockedMinByTask.get(task.id) || 0);
    if (remainingMin <= 0) continue;

    while (remainingMin > 0 && slotIndex < availableSlots.length) {
      const slot = availableSlots[slotIndex];

      // Try to allocate contiguous slots on the same day
      const blockStart = slot.start;
      let blockEnd = slot.end;
      let allocatedMin = SLOT_DURATION_MIN;
      let nextIdx = slotIndex + 1;

      // Extend with contiguous same-day slots
      while (
        allocatedMin < remainingMin &&
        nextIdx < availableSlots.length &&
        availableSlots[nextIdx].start.getTime() === blockEnd.getTime() &&
        availableSlots[nextIdx].start.getDate() === blockStart.getDate()
      ) {
        blockEnd = availableSlots[nextIdx].end;
        allocatedMin += SLOT_DURATION_MIN;
        nextIdx++;
      }

      // Cap to what's needed
      const neededSlots = Math.ceil(remainingMin / SLOT_DURATION_MIN);
      const usedSlots = Math.min(neededSlots, (nextIdx - slotIndex));
      const actualEnd = new Date(blockStart.getTime() + usedSlots * SLOT_DURATION_MIN * 60 * 1000);

      result.push({
        task_id: task.id,
        start_time: blockStart.toISOString(),
        end_time: actualEnd.toISOString(),
      });

      remainingMin -= usedSlots * SLOT_DURATION_MIN;
      slotIndex += usedSlots;
    }
  }

  return result;
}
