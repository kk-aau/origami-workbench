import type {FlatFoldResult} from '../core/types';
import type {ModelLayerRegion} from './modelRegionLayers';
import {flatPresentation,type FlatSide} from './flatPresentation';
import {modelProjection} from './modelProjection';
import type {ModelColors} from './modelColors';
import {modelRegionPaths} from './modelRegionPaths';

import type {ModelRegionBoundaries} from './modelRegionBoundaries';
import {modelRegionShadowSVG} from './modelRegionShadowSVG';
import type {ModelRegionShadows} from './modelRegionShadows';
import type {ExactSurfaceData} from './modelExactSurfaceData';
import {exactModelSurfaceSVG} from './modelExactSurfaceSVG';
export interface ModelRegionSurfaceData {regions:ModelLayerRegion[];omittedThinRegions:number;boundaries?:ModelRegionBoundaries;shadows?:ModelRegionShadows}
export type ModelSurfaceData=ModelRegionSurfaceData|ExactSurfaceData;
/** Regions are calculated for this exact result and side by the export task. */
export function modelRegionSVG(result:FlatFoldResult,data:ModelSurfaceData,side:FlatSide,rotation:number,colors:ModelColors,paint?:{faceColors?:readonly string[];boundaryWidth?:number}):string{
 if('exact' in data)return exactModelSurfaceSVG(result,data,side,rotation,colors);
 if(!Number.isInteger(data.omittedThinRegions)||data.omittedThinRegions<0||!Array.isArray(data.regions))throw new Error('局部区域导出数据无效。');
 const display=flatPresentation(result,side,rotation),projection=modelProjection(result.geometry.vertices,side==='back',rotation);
 data.regions.forEach(region=>{
  const ids=region.faces;
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!Number.isInteger(id)||id<0||id>=result.geometry.faces.length)||!Array.isArray(region.polygon)||region.polygon.length<3||region.polygon.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('局部区域导出几何无效。');
  if(region.layers.status==='ordered'){
   const order=region.layers.topToBottom;
   if(order.length!==ids.length||new Set(order).size!==ids.length||order.some(id=>!ids.includes(id)))throw new Error('局部区域导出层序无效。');
  }else if(region.layers.status!=='unconfirmed'&&region.layers.status!=='conflict')throw new Error('局部区域导出状态无效。');
 });
 const polygons=modelRegionPaths(data.regions,projection.project,region=>{
  const top=region.layers.status==='ordered'?region.layers.topToBottom[0]:undefined;
  return top!==undefined?(paint?.faceColors?.[top]??(display.frontMaterial[top]?colors.front:colors.back)):`url(#model-region-${region.layers.status==='conflict'?'conflict':'unknown'})`;
 }).map(group=>`<path data-region-fill="true" data-region-status="${group.status}" data-region-indices="${group.indices.join(' ')}" d="${group.d}" fill="${group.fill}" fill-rule="nonzero" stroke="none"/>`).join('');
 const lines=data.boundaries?.edges.map(edge=>{
  if([edge.a,edge.b].some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('局部可见边线坐标无效。');
  const a=projection.project(edge.a),b=projection.project(edge.b);
  return `<line data-region-boundary="true" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${colors.line}" stroke-width="${paint?.boundaryWidth??.8}" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
 }).join('')??'';
 return `<g data-model-region-surface="true"><defs><pattern id="model-region-unknown" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#eeeeea"/><path d="M-1 1L1-1M0 6L6 0M5 7L7 5" stroke="#92998e" stroke-width=".5"/></pattern><pattern id="model-region-conflict" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="#f5dddd"/><path d="M0 0L6 6M6 0L0 6" stroke="#aa4242" stroke-width=".5"/></pattern></defs>${polygons}${data.shadows?modelRegionShadowSVG(result,data.regions,data.shadows,side,rotation):''}${lines}</g>`;
}
