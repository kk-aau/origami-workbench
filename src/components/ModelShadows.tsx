import {useId} from 'react';
import type {Point} from '../core/types';
import type {ModelShadowBoundary} from '../app/modelShadowBoundaries';

/** Paint after the receiving face, before all higher faces. No pointer interception. */
export default function ModelShadows({boundaries,polygon,holes=[]}:{boundaries:ModelShadowBoundary[];polygon:Point[];holes?:Point[][]}){
  const id=useId().replace(/[^a-zA-Z0-9_-]/g,'_');
  if(!boundaries.length)return null;
  return <g data-model-shadows="true" pointerEvents="none" aria-hidden="true">
    <defs><clipPath id={`${id}-clip`}>{holes.length?<path d={[polygon,...holes].map(r=>r.map((p,i)=>`${i?'L':'M'}${p.join(',')}`).join(' ')+' Z').join(' ')} fillRule="evenodd" clipRule="evenodd"/>:<polygon points={polygon.map(p=>p.join(',')).join(' ')}/>}</clipPath>
      {boundaries.map((s,i)=><linearGradient key={i} id={`${id}-gradient-${i}`} gradientUnits="userSpaceOnUse" x1={s.a[0]} y1={s.a[1]} x2={s.a[0]+s.inward[0]*10} y2={s.a[1]+s.inward[1]*10}><stop offset="0" stopColor="#000" stopOpacity={50/255}/><stop offset="1" stopColor="#000" stopOpacity="0"/></linearGradient>)}
    </defs>
    <g clipPath={`url(#${id}-clip)`}>{boundaries.map((s,i)=><polygon key={i} data-shadow-upper={s.upperFace} data-shadow-lower={s.lowerFace} points={[s.a,s.b,[s.b[0]+s.inward[0]*10,s.b[1]+s.inward[1]*10],[s.a[0]+s.inward[0]*10,s.a[1]+s.inward[1]*10]].map(p=>p.join(',')).join(' ')} fill={`url(#${id}-gradient-${i})`}/>)}</g>
  </g>;
}
