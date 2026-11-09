import earcut from 'earcut';
import type {FoldGraph} from './types';
import {materialFaceRings} from './materialRings';
import {materialOrientation} from './materialTraceGeometry';
/** Private triangles retain every original ring vertex, including collinear
 * boundary subdivisions removed by earcut. No points or CP edges are added. */
export function triangulateMaterialHoleFace(g:FoldGraph,f:number){
 const rings=materialFaceRings(g,f),indices=rings.flat(),offsets:number[]=[];let count=rings[0].length;for(const ring of rings.slice(1)){offsets.push(count);count+=ring.length;}
 const raw=earcut(indices.flatMap(v=>g.vertices_coords[v]),offsets,2),triangles=Array.from({length:raw.length/3},(_,i)=>raw.slice(3*i,3*i+3).map(k=>indices[k])).filter(t=>materialOrientation(g.vertices_coords[t[0]],g.vertices_coords[t[1]],g.vertices_coords[t[2]])!==0),used=new Set(triangles.flat());
 for(const v of indices){const p=g.vertices_coords[v];
  for(let i=0;i<triangles.length;i++)for(let k=0;k<3;k++){const t=triangles[i],a=t[k],b=t[(k+1)%3],c=t[(k+2)%3],x=g.vertices_coords[a],y=g.vertices_coords[b];if(materialOrientation(x,y,p)===0&&p[0]>=Math.min(x[0],y[0])&&p[0]<=Math.max(x[0],y[0])&&p[1]>=Math.min(x[1],y[1])&&p[1]<=Math.max(x[1],y[1])&&v!==a&&v!==b){triangles[i]=[a,v,c];triangles.push([v,b,c]);used.add(v);break;}}
  if(!used.has(v))throw Error('孔洞三角化丢失了不能沿原边精确恢复的边界角，未吸附或移动。');
 }
 const sharedCorners=indices.length-new Set(indices).size;
 if(triangles.length!==indices.length+2*(rings.length-1)-2-2*sharedCorners)throw Error('孔洞三角化数量与边界环拓扑不一致。');return triangles;
}
