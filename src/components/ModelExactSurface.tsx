import {useId,useMemo} from 'react';
import type {FlatFoldResult} from '../core/types';
import {flatPresentation,type FlatSide} from '../app/flatPresentation';
import {modelProjection} from '../app/modelProjection';
import type {ModelColors} from '../app/modelColors';
import {modelExactSurfacePath,modelExactSurfaceShadowSVG,type ExactModelSurface} from '../app/modelExactSurface';
import {exactSurfaceBoundaryPath} from '../app/modelExactSurfaceSVG';
import {exactVisibleFaceLabels} from '../app/exactVisibleTileRegions';

/** One path per visible original face. Millions of certified internal cells
 * stay in the worker; selection retains the original paper-face identity. */
export default function ModelExactSurface({result,surface,side,rotation,colors,face,onSelect,interactive,shadows=false,displayNumbers=false,labelFontSize=4}:{result:FlatFoldResult;surface:ExactModelSurface;side:FlatSide;rotation:number;colors:ModelColors;face:number|null;onSelect:(face:number)=>void;interactive:boolean;shadows?:boolean;displayNumbers?:boolean;labelFontSize?:number}){
 const prefix=useId().replace(/[^a-zA-Z0-9_-]/g,''),project=useMemo(()=>modelProjection(result.geometry.vertices,side==='back',rotation).project,[result,side,rotation]);
 const display=useMemo(()=>flatPresentation(result,side,rotation),[result,side,rotation]);
 const paths=useMemo(()=>Array.from(surface.faceIds,(_,i)=>modelExactSurfacePath(surface,i,project)),[surface,project]);
 const lines=useMemo(()=>exactSurfaceBoundaryPath(surface,project),[surface,project]);
 const shadowMarkup=useMemo(()=>shadows&&surface.shadows?modelExactSurfaceShadowSVG(surface,project,'exact-shadow-'+prefix):'',[surface,project,prefix,shadows]);
 const labels=useMemo(()=>displayNumbers?exactVisibleFaceLabels(surface):[],[surface,displayNumbers]);
 return <g data-model-region-surface="true" data-model-exact-surface="true">{Array.from(surface.faceIds,(id,i)=>{
  const label=`可见纸面 F${id+1}，${surface.faceCellCounts[i]} 个区域已确认`;
  return <path key={id} data-face-id={id} data-region-fill="true" data-region-top={id} data-region-status="ordered" d={paths[i]} fill={face===id?'#d2b57b':display.frontMaterial[id]?colors.front:colors.back} fillRule="nonzero" stroke="none" role={interactive?'button':'img'} tabIndex={interactive?0:-1} aria-label={label} onClick={()=>{if(interactive)onSelect(id);}} onKeyDown={event=>{if(interactive&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onSelect(id);}}}><title>{label}</title></path>;
 })}{shadowMarkup&&<g dangerouslySetInnerHTML={{__html:shadowMarkup}}/>}<path data-region-boundary="true" d={lines} fill="none" stroke={colors.line} strokeWidth={.8} vectorEffect="non-scaling-stroke" pointerEvents="none"/>{labels.map(({face:id,point})=>{const p=project(point);return <text key={id} data-face-number={id+1} x={p[0]} y={p[1]} textAnchor="middle" dominantBaseline="middle" fontSize={labelFontSize} fill="#294536" stroke="#fffefb" strokeWidth={labelFontSize/4} paintOrder="stroke" pointerEvents="none">F{id+1}</text>;})}</g>;
}
