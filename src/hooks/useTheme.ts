import { useEffect } from 'react';
import type { Settings } from '../types';

export function useTheme(settings: Settings) {
  useEffect(() => {
    const root = document.documentElement;

    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    root.style.setProperty('--accent-color', settings.accent_color);
  }, [settings.theme, settings.accent_color]);
}
