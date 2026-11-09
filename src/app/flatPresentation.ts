import type { FlatFoldResult, Point } from '../core/types';
import { polygonArea } from '../core/geometry';
import {modelProjection} from './modelProjection';

export type FlatSide = 'front' | 'back';
export interface FlatPresentation {
  vertices: Point[];
  /** Original face IDs in paint order; never renumber faces after reversing. */
  order: number[];
  hasOrder: boolean;
  /** Which material side faces this camera, indexed by original face ID. */
  frontMaterial: boolean[];
}

/** Camera projection only. Does not change solver geometry, assignments or layer constraints. */
export function flatPresentation(result: FlatFoldResult, side: FlatSide, rotation=0,projectionCenter?:Point): FlatPresentation {
  if (side !== 'front' && side !== 'back') throw new Error('未知的折叠模型观察方向。');
  const { vertices, faces } = result.geometry;
  if (vertices.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) ||
      faces.some(f => f.length < 3 || f.some(v => !Number.isInteger(v) || v < 0 || v >= vertices.length))) {
    throw new Error('折叠面显示数据无效。');
  }
  const proposed = result.layers.faceOrder;
  const hasOrder = result.layers.status === 'solved' && !!proposed && proposed.length === faces.length &&
    new Set(proposed).size === faces.length && proposed.every(i => Number.isInteger(i) && i >= 0 && i < faces.length);
  const order = hasOrder ? [...proposed!] : faces.map((_, i) => i);
  // The back camera must reveal the original bottom face, not just mirror the top image.
  if (side === 'back') order.reverse();
  const projection=modelProjection(vertices,side==='back',rotation,projectionCenter);
  return {
    vertices: vertices.map(projection.project),
    order,
    hasOrder,
    frontMaterial: faces.map(face => (polygonArea(face.map(v => vertices[v])) > 0) === (side === 'front')),
  };
}
