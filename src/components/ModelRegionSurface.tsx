import {useId,useMemo} from 'react';
import type {FlatFoldResult} from '../core/types';
import type {ModelLayerRegion} from '../app/modelRegionLayers';
import type {FlatSide} from '../app/flatPresentation';
import {flatPresentation} from '../app/flatPresentation';
import {modelProjection} from '../app/modelProjection';
import type {ModelRegionBoundaries} from '../app/modelRegionBoundaries';
import {modelRegionShadowSVG} from '../app/modelRegionShadowSVG';
import type {ModelRegionShadows} from '../app/modelRegionShadows';
import type {ModelColors} from '../app/modelColors';
import {modelRegionPaths} from '../app/modelRegionPaths';

export default function ModelRegionSurface({result,regions,boundaries,shadows,side,rotation,colors,face,onSelect,interactive}:{result:FlatFoldResult;regions:ModelLayerRegion[];boundaries?:ModelRegionBoundaries;shadows?:ModelRegionShadows;side:FlatSide;rotation:number;colors:ModelColors;face:number|null;onSelect:(id:number)=>void;interactive:boolean}){
 const id=useId().replace(/[^a-zA-Z0-9_-]/g,''),unknown=id+'-unknown',conflict=id+'-conflict';
 const display=useMemo(()=>flatPresentation(result,side,rotation),[result,side,rotation]);
 const projection=useMemo(()=>modelProjection(result.geometry.vertices,side==='back',rotation),[result,side,rotation]);
 const fills=useMemo(()=>modelRegionPaths(regions,projection.project,region=>{
  const top=region.layers.status==='ordered'?region.layers.topToBottom[0]:undefined;
  return top!==undefined?(face===top?'#d2b57b':display.frontMaterial[top]?colors.front:colors.back):`url(#${region.layers.status==='conflict'?conflict:unknown})`;
 }),[regions,projection,face,display,colors,conflict,unknown]);
 const shadowMarkup=useMemo(()=>shadows?modelRegionShadowSVG(result,regions,shadows,side,rotation,'region-shadow-'+id):'',[result,regions,shadows,side,rotation,id]);
 return <g data-model-region-surface="true"><defs>
  <pattern id={unknown} patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#eeeeea"/><path d="M-1 1L1-1M0 6L6 0M5 7L7 5" stroke="#92998e" strokeWidth=".5"/></pattern>
  <pattern id={conflict} patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#f5dddd"/><path d="M0 0L6 6M6 0L0 6" stroke="#aa4242" strokeWidth=".5"/></pattern>
 </defs>{fills.map((group,index)=><path key={index} data-region-fill="true" d={group.d} fill={group.fill} fillRule="nonzero" stroke="none" pointerEvents="none"/>)}{regions.map((region,index)=>{
  const top=region.layers.status==='ordered'?region.layers.topToBottom[0]:undefined;
  const label=top!==undefined?`局部区域 ${index+1}：顶部 F${top+1}，共 ${region.faces.length} 层`:`局部区域 ${index+1}：${region.layers.status==='conflict'?'层序冲突':'层序未确认'}`;
  const fill=top!==undefined?(face===top?'#d2b57b':display.frontMaterial[top]?colors.front:colors.back):`url(#${region.layers.status==='conflict'?conflict:unknown})`;
  return <polygon key={index} data-region-status={region.layers.status} data-region-top={top} points={region.polygon.map(p=>projection.project(p).join(',')).join(' ')} fill={fill} fillOpacity={0} stroke="none" role={top!==undefined?'button':'img'} tabIndex={interactive&&top!==undefined?0:-1} aria-label={label} onClick={()=>{if(interactive&&top!==undefined)onSelect(top);}} onKeyDown={e=>{if(interactive&&top!==undefined&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onSelect(top);}}}><title>{label}</title></polygon>;
 })}{shadowMarkup&&<g dangerouslySetInnerHTML={{__html:shadowMarkup}}/>}{boundaries?.edges.map((edge,index)=>{const a=projection.project(edge.a),b=projection.project(edge.b);return <line key={index} data-region-boundary="true" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={colors.line} strokeWidth={.8} vectorEffect="non-scaling-stroke" pointerEvents="none"/>;})}</g>;
}
