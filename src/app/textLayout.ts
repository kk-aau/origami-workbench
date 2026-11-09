import type { DrawingObject } from '../core/types';

export type TextObject = Extract<DrawingObject, { kind: 'text' }>;
/** Shared world-space layout for the canvas, export and fit-to-content. */
export function textLines(text: string): string[] { return text.split(/\r\n|\r|\n/); }
export function textLineY(object: TextObject, index: number): number {
  return object.position[1] + index * object.fontSize * 1.2;
}
/** Conservative font-independent bounds; not a substitute for glyph hit testing. */
export function textBounds(object: TextObject) {
  const lines = textLines(object.text);
  return { x: object.position[0], y: object.position[1] - object.fontSize,
    width: Math.max(1, ...lines.map(line => [...line].length)) * object.fontSize,
    height: ((lines.length - 1) * 1.2 + 1.3) * object.fontSize };
}
