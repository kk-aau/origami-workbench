import type {SVGProps} from 'react';
import type {Point} from '../core/types';
/** Preserve polygon markup for ordinary faces; holed faces use real rings. */
export default function IndexedFaceShape({outer,holes=[],coords,map=p=>p,...props}:{outer:number[];holes?:number[][];coords:Point[];map?:(p:Point)=>Point}&SVGProps<SVGPolygonElement>){
 if(!holes.length)return <polygon {...props} points={outer.map(v=>map(coords[v]).join(',')).join(' ')}/>;
 const d=[outer,...holes].map(r=>r.map((v,i)=>`${i?'L':'M'}${map(coords[v]).join(',')}`).join(' ')+' Z').join(' ');
 return <path {...props as unknown as SVGProps<SVGPathElement>} data-face-holes={holes.length} d={d} fillRule="evenodd"/>;
}
