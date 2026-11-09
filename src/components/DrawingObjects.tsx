import type { DrawingObject } from '../core/types';
import { textLines, textLineY } from '../app/textLayout';

/** Passive renderer; selection and editing are handled by the canvas tools. */
export default function DrawingObjects({ objects = [], units, markLineWidth=1.3 }: { objects?: DrawingObject[]; units: number; markLineWidth?:number }) {
  return <g data-object-layer="construction" pointerEvents="none">{objects.map(o => <g key={o.id} data-drawing-object={o.id} data-object-kind={o.kind}>
    {o.kind === 'circle' ? <circle cx={o.center[0]} cy={o.center[1]} r={o.radius} fill="none" stroke={o.color} strokeWidth={1.3 * units}/>
      : o.kind === 'mark' ? <line x1={o.a[0]} y1={o.a[1]} x2={o.b[0]} y2={o.b[1]} stroke={o.color} strokeWidth={markLineWidth * units}/>
      : <text x={o.position[0]} y={o.position[1]} fontSize={o.fontSize} fontFamily="sans-serif" fill={o.color} xmlSpace="preserve">{textLines(o.text).map((line, i) => <tspan key={i} x={o.position[0]} y={textLineY(o, i)}>{line}</tspan>)}</text>}
  </g>)}</g>;
}
