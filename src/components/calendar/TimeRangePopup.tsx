import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatTime } from '../../utils/dateHelpers';

interface TimeRangePopupProps {
  x: number;
  y: number;
  startTime: Date;
  endTime: Date;
  onLock: () => void;
  onNewTask: () => void;
  onClose: () => void;
}

export function TimeRangePopup({ x, y, startTime, endTime, onLock, onNewTask, onClose }: TimeRangePopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handlePointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [onClose]);

  // Nudge popup so it stays within viewport
  const POPUP_W = 160;
  const POPUP_H = 96;
  const left = Math.min(x, window.innerWidth - POPUP_W - 8);
  const top = Math.min(y, window.innerHeight - POPUP_H - 8);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden text-sm"
      style={{ left, top, minWidth: POPUP_W }}
    >
      <div className="px-3 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800 font-medium select-none">
        {formatTime(startTime)} – {formatTime(endTime)}
      </div>
      <button
        type="button"
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
        onClick={() => { onLock(); onClose(); }}
      >
        <svg className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z" />
        </svg>
        <span className="text-gray-700 dark:text-gray-200">Lock</span>
      </button>
      <button
        type="button"
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
        onClick={() => { onNewTask(); onClose(); }}
      >
        <svg className="w-4 h-4 text-accent flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
        <span className="text-gray-700 dark:text-gray-200">New Task</span>
      </button>
    </div>,
    document.body
  );
}
