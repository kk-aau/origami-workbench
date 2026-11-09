import type {FlatFoldResult,Point} from '../core/types';
import type {FlatSide} from './flatPresentation';
import type {ModelLayerRegion} from './modelRegionLayers';
import type {ModelRegionShadows} from './modelRegionShadows';
import {modelProjection} from './modelProjection';

/** Numeric-only generated SVG, shared by live rendering and exported documents. */
export function modelRegionShadowSVG(result:FlatFoldResult,regions:ModelLayerRegion[],shadows:ModelRegionShadows,side:FlatSide,rotation:number,prefix='local-shadow'):string{
 if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(prefix))throw new Error('局部阴影标识无效。');
 const project=modelProjection(result.geometry.vertices,side==='back',rotation).project;
 const valid=(p:Point)=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=2e6);
 return shadows.strips.map((s,i)=>{
  if(![s.a,s.b,s.inward].every(valid)||Math.abs(Math.hypot(...s.inward)-1)>1e-6||![s.upperFace,s.lowerFace].every(f=>Number.isInteger(f)&&f>=0&&f<result.geometry.faces.length)||s.upperFace===s.lowerFace||!s.clipRegions.length)throw new Error('局部阴影条无效。');
  const clip=s.clipRegions.map(index=>{
   if(!Number.isInteger(index)||index<0||index>=regions.length)throw new Error('局部阴影裁剪索引无效。');
   const r=regions[index];if(r.layers.status!=='ordered'||r.layers.topToBottom[0]!==s.lowerFace||r.polygon.length<3||!r.polygon.every(valid))throw new Error('局部阴影只能裁剪到可见下层区域。');
   return `<polygon points="${r.polygon.map(p=>project(p).join(',')).join(' ')}"/>`;
  }).join('');
  const id=`${prefix}-${i}`,end:Point=[s.a[0]+s.inward[0]*10,s.a[1]+s.inward[1]*10],a=project(s.a),gradientEnd=project(end);
  const corners:Point[]=[s.a,s.b,[s.b[0]+s.inward[0]*10,s.b[1]+s.inward[1]*10],end];
  return `<g data-region-shadow="true" data-shadow-upper="${s.upperFace}" data-shadow-lower="${s.lowerFace}" pointer-events="none"><defs><clipPath id="${id}-clip">${clip}</clipPath><linearGradient id="${id}-gradient" gradientUnits="userSpaceOnUse" x1="${a[0]}" y1="${a[1]}" x2="${gradientEnd[0]}" y2="${gradientEnd[1]}"><stop offset="0" stop-color="#000" stop-opacity="${50/255}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><polygon points="${corners.map(p=>project(p).join(',')).join(' ')}" clip-path="url(#${id}-clip)" fill="url(#${id}-gradient)"/></g>`;
 }).join('');
}
