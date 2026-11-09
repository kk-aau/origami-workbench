import type {FlatFoldResult,Point} from '../core/types';
import {flatPresentation,type FlatSide} from './flatPresentation';
import {modelProjection} from './modelProjection';
import type {ModelColors} from './modelColors';
import {modelExactSurfacePath,modelExactSurfaceShadowSVG,type ExactModelSurface} from './modelExactSurface';
import {exactSurfaceIssue,type ExactSurfaceData} from './modelExactSurfaceData';

export function exactSurfaceBoundaryPath(surface:ExactModelSurface,project:(point:Point)=>Point):string {
 const parts:string[]=[];
 for(let i=0;i<surface.boundaryVertices.length;i+=2){
  const a=surface.boundaryVertices[i],b=surface.boundaryVertices[i+1];
  const p=project([surface.vertexXY[a*2],surface.vertexXY[a*2+1]]),q=project([surface.vertexXY[b*2],surface.vertexXY[b*2+1]]);
  parts.push(`M${p[0]},${p[1]}L${q[0]},${q[1]}`);
 }
 return parts.join('');
}
/** Shared exact contours for screen and exports; no second coordinate weld. */
export function exactModelSurfaceSVG(result:FlatFoldResult,data:ExactSurfaceData,side:FlatSide,rotation:number,colors:ModelColors):string {
 const issue=exactSurfaceIssue(data,result);if(issue)throw Error(issue);
 if(data.exact.side!==side)throw Error('精确纸面的观察方向与导出方向不一致。');
 const surface=data.exact,display=flatPresentation(result,side,rotation),project=modelProjection(result.geometry.vertices,side==='back',rotation).project;
 const fills=Array.from(surface.faceIds,(face,fill)=>`<path data-region-fill="true" data-region-top="${face}" d="${modelExactSurfacePath(surface,fill,project)}" fill="${display.frontMaterial[face]?colors.front:colors.back}" fill-rule="nonzero" stroke="none"/>`).join('');
 const shadows=surface.shadows?modelExactSurfaceShadowSVG(surface,project,'exact-export-shadow'):'';
 const boundaries=exactSurfaceBoundaryPath(surface,project);
 return `<g data-model-region-surface="true" data-model-exact-surface="true">${fills}${shadows}<path data-region-boundary="true" d="${boundaries}" fill="none" stroke="${colors.line}" stroke-width="0.8" vector-effect="non-scaling-stroke"/></g>`;
}
