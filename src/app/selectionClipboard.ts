import { validateDoc, type Assignment, type Doc, type DrawingObject, type Point, type Segment } from '../core/types';
import {deleteCanvasSelection,editableCanvasSelection,type CanvasSelection} from './canvasSelection';
import type {DisplayLayers} from './displayLayers';

export interface ClipboardSegment {
  a: Point;
  b: Point;
  assignment: Assignment;
  angle: number | null;
  displayColor?: string;
}

export type ClipboardCircle=Omit<Extract<DrawingObject,{kind:'circle'}>,'kind'|'id'>;
export interface DrawingClipboard {
  kind:'drawing-clipboard';
  segments:ClipboardSegment[];
  circles:ClipboardCircle[];
}
export type GeometryClipboard=readonly ClipboardSegment[]|DrawingClipboard;
export const isDrawingClipboard=(clipboard:GeometryClipboard):clipboard is DrawingClipboard=>!Array.isArray(clipboard)&&'kind' in clipboard&&clipboard.kind==='drawing-clipboard';
export function geometryClipboardCounts(clipboard:GeometryClipboard):{segments:number;circles:number}{
  return isDrawingClipboard(clipboard)?{segments:clipboard.segments.length,circles:clipboard.circles.length}:{segments:clipboard.length,circles:0};
}

function finiteOffset(offset: Point): void {
  if (!Array.isArray(offset)||offset.length!==2||!Array.from(offset).every(value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e6)) throw new Error('粘贴偏移必须是有限坐标（±1000000 mm）。');
}

/** Explicit mixed geometry; labels and independent marks keep their separate
 * editing tools and never enter this clipboard through a stale selection ID. */
export function copySelectedDrawingObjects(doc:Doc,selection:CanvasSelection):DrawingClipboard {
  validateDoc(doc);
  const chosen=doc.segments.filter(segment=>selection.segments.has(segment.id));
  const circles=(doc.objects??[]).flatMap(object=>object.kind==='circle'&&selection.circles.has(object.id)?[{center:[...object.center] as Point,radius:object.radius,color:object.color}]:[]);
  if(!chosen.length&&!circles.length)throw new Error('请先选择需要复制的线段或辅助圆。');
  return {kind:'drawing-clipboard',segments:chosen.length?copySelectedSegments(doc,selection.segments):[],circles};
}

/** Copy exactly what can be removed. The caller publishes this snapshot only
 * after the single editor commit succeeds, preserving an existing clipboard
 * when material validation or a document transition rejects the edit. */
export function cutDrawingSelection(doc:Doc,selection:CanvasSelection,layers:Pick<DisplayLayers,'main'|'auxiliary'>,lockBoundary:boolean):{doc:Doc;clipboard:DrawingClipboard} {
  const removable=editableCanvasSelection(doc,layers,lockBoundary,selection);
  if(!removable.segments.size&&!removable.circles.size)throw new Error('没有可剪切的可见对象；隐藏图层和受保护边界保持不变。');
  const clipboard=copySelectedDrawingObjects(doc,removable),next=deleteCanvasSelection(doc,removable);
  validateDoc(next);return {doc:next,clipboard};
}

export function copySelectedSegments(doc: Doc, ids: ReadonlySet<string>): ClipboardSegment[] {
  validateDoc(doc);
  const selected = doc.segments.filter(segment => ids.has(segment.id));
  if (!selected.length) throw new Error('请先选择需要复制的线段。');
  return selected.map(segment => ({
    a: [...segment.a], b: [...segment.b], assignment: segment.assignment,
    angle: segment.angle, ...(segment.displayColor ? { displayColor: segment.displayColor } : {}),
  }));
}

function newId(used: Set<string>, index: number): string {
  let id = `paste-${Date.now().toString(36)}-${index.toString(36)}`;
  while (used.has(id)) id += 'x';
  used.add(id); return id;
}

/** Append an immutable clipboard copy with a world-coordinate offset. */
export function pasteSegments(doc: Doc, clipboard: readonly ClipboardSegment[], offset: Point = [0, 0]): Doc {
  return pasteDrawingObjects(doc,clipboard,offset);
}

/** One document proposal keeps a mixed paste in one undo/redo frame. New IDs
 * share the namespace of every stroke, circle, label and independent mark. */
export function pasteDrawingObjects(doc:Doc,clipboard:GeometryClipboard,offset:Point=[0,0]):Doc {
  validateDoc(doc); finiteOffset(offset);
  const segments=isDrawingClipboard(clipboard)?clipboard.segments:clipboard,circles=isDrawingClipboard(clipboard)?clipboard.circles:[];
  if (!segments.length&&!circles.length) throw new Error('剪贴板为空，请先复制线段或辅助圆。');
  const used = new Set([...doc.segments.map(segment => segment.id),...(doc.objects??[]).map(object=>object.id)]);
  const additions: Segment[] = segments.map((source, index) => ({
    id: newId(used, index),
    a: [source.a[0] + offset[0], source.a[1] + offset[1]],
    b: [source.b[0] + offset[0], source.b[1] + offset[1]],
    assignment: source.assignment, angle: source.angle,
    ...(source.displayColor ? { displayColor: source.displayColor } : {}),
  }));
  const objects:DrawingObject[]=circles.map((source,index)=>({id:newId(used,segments.length+index),kind:'circle',
    center:[source.center[0]+offset[0],source.center[1]+offset[1]],radius:source.radius,color:source.color}));
  const next = { ...doc, segments: [...doc.segments, ...additions],...(objects.length?{objects:[...doc.objects??[],...objects]}:{}) };
  validateDoc(next); return next;
}
