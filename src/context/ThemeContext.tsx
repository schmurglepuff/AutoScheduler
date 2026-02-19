import { createContext, useContext, type ReactNode } from 'react';
import type { Settings } from '../types';

interface ThemeContextValue {
  theme: Settings['theme'];
  accentColor: string;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  accentColor: '#3b82f6',
});

export function ThemeProvider({
  children,
  theme,
  accentColor,
}: {
  children: ReactNode;
  theme: Settings['theme'];
  accentColor: string;
}) {
  return (
    <ThemeContext.Provider value={{ theme, accentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  return useContext(ThemeContext);
}
