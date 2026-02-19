import type { Priority } from '../types';

export const priorityColors: Record<Priority, { bg: string; text: string; border: string }> = {
  High: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-300 dark:border-red-700',
  },
  Medium: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-700 dark:text-yellow-300',
    border: 'border-yellow-300 dark:border-yellow-700',
  },
  Low: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-300 dark:border-green-700',
  },
};

export const priorityBadge: Record<Priority, string> = {
  High: 'bg-red-500 text-white',
  Medium: 'bg-yellow-500 text-white',
  Low: 'bg-green-500 text-white',
};
