import {preferenceStorage} from './preferenceStorage';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'zhezhi.theme.v1';

export function defaultTheme(): Theme { return 'light'; }

export function validateTheme(value: unknown): Theme {
  if (value !== 'light' && value !== 'dark') throw new Error('主题设置无效。');
  return value;
}

export function readTheme(storage?: Pick<Storage, 'getItem'>): Theme {
  try {
    const raw = (storage ?? preferenceStorage).getItem(THEME_KEY);
    if (!raw) return defaultTheme();
    const parsed = JSON.parse(raw) as {version?: unknown; theme?: unknown};
    if (parsed.version !== 1) throw new Error('version');
    return validateTheme(parsed.theme);
  } catch { return defaultTheme(); }
}

export function saveTheme(theme: Theme, storage: Pick<Storage, 'setItem'> = preferenceStorage) {
  storage.setItem(THEME_KEY, JSON.stringify({version: 1, theme: validateTheme(theme)}));
}
