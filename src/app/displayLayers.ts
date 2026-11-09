import {preferenceStorage} from './preferenceStorage';
export interface DisplayLayers {
  main: boolean;
  auxiliary: boolean;
  marks: boolean;
  comments: boolean;
}

export const DISPLAY_LAYERS_KEY = 'zhezhi.display-layers.v1';
export const defaultDisplayLayers = (): DisplayLayers => ({main: true, auxiliary: true, marks: true, comments: true});

export function validateDisplayLayers(value: unknown): DisplayLayers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('对象显示设置格式无效。');
  const v = value as Record<string, unknown>;
  if (typeof v.main !== 'boolean' || typeof v.auxiliary !== 'boolean' || typeof v.marks !== 'boolean') throw new Error('对象显示设置必须是布尔值。');
  // v1 settings predate text visibility; missing comments remain visible.
  if (v.comments !== undefined && typeof v.comments !== 'boolean') throw new Error('文字显示设置必须是布尔值。');
  return {main: v.main, auxiliary: v.auxiliary, marks: v.marks, comments: v.comments === undefined ? true : v.comments};
}

export function readDisplayLayers(storage?: Pick<Storage, 'getItem'>): DisplayLayers {
  try { const raw = (storage ?? preferenceStorage).getItem(DISPLAY_LAYERS_KEY); if (!raw) return defaultDisplayLayers(); const value = JSON.parse(raw); if (value.version !== 1) throw new Error('version'); return validateDisplayLayers(value.settings); } catch { return defaultDisplayLayers(); }
}

export function saveDisplayLayers(value: DisplayLayers, storage: Pick<Storage, 'setItem'> = preferenceStorage) {
  storage.setItem(DISPLAY_LAYERS_KEY, JSON.stringify({version: 1, settings: validateDisplayLayers(value)}));
}
