import { validateDoc, type Doc, type DrawingObject, type Point } from '../core/types';
import { getPaperBounds } from './paper';
import { textLines, textLineY } from './textLayout';

/** Preserve circles exactly; never silently turn one into a distorted circle. */
export function resizeDocument(doc: Doc, width: number, height: number): Doc {
  const sx = width / doc.paper.width, sy = height / doc.paper.height;
  if (doc.objects?.some(o => o.kind === 'circle') && Math.abs(sx - sy) > 1e-10) throw new Error('工程含有圆，不能单向拉伸为椭圆。请保持纸张尺寸，或待等比缩放工具调整全部对象。');
  const origin = getPaperBounds(doc);
  const point = (p: Point): Point => [origin.x + (p[0] - origin.x) * sx, origin.y + (p[1] - origin.y) * sy];
  const next: Doc = { ...doc, paper: { width, height },
    segments: doc.segments.map(s => ({ ...s, a: point(s.a), b: point(s.b) })),
    ...(doc.objects ? { objects: doc.objects.map((o): DrawingObject => o.kind === 'circle'
      ? { ...o, center: point(o.center), radius: o.radius * sx }
      : o.kind === 'mark' ? { ...o, a: point(o.a), b: point(o.b) }
      : { ...o, position: point(o.position), fontSize: o.fontSize * sy }) } : {}),
  };
  validateDoc(next); return next;
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
/** Validated static SVG, with no URLs or markup interpreted from text. */
export function objectsSVG(doc: Doc,markLineWidth=.3): string {
  validateDoc(doc);
  if(!Number.isFinite(markLineWidth)||markLineWidth<=0)throw new Error('标记输出线宽必须为有限正数。');
  return (doc.objects ?? []).map(o => o.kind === 'circle'
    ? `<circle cx="${o.center[0]}" cy="${o.center[1]}" r="${o.radius}" fill="none" stroke="${o.color}" stroke-width="0.3"/>`
    : o.kind === 'mark'
      ? `<line x1="${o.a[0]}" y1="${o.a[1]}" x2="${o.b[0]}" y2="${o.b[1]}" stroke="${o.color}" stroke-width="${markLineWidth}"/>`
      : `<text x="${o.position[0]}" y="${o.position[1]}" font-family="sans-serif" font-size="${o.fontSize}" fill="${o.color}" xml:space="preserve">${textLines(o.text).map((line, i) => `<tspan x="${o.position[0]}" y="${textLineY(o, i)}">${escape(line)}</tspan>`).join('')}</text>`).join('');
}
