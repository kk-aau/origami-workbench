import earcut from 'earcut';
import type {FlatFoldConflict,FlatFoldResult,Point} from './types';

const crossingKinds=new Set<FlatFoldConflict['kind']>(['taco_taco','taco_tortilla','tortilla_tortilla']);
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=(ring:Point[])=>ring.reduce((sum,p,i)=>sum+p[0]*ring[(i+1)%ring.length][1]-ring[(i+1)%ring.length][0]*p[1],0)/2;
const bounds=(ring:Point[])=>({left:Math.min(...ring.map(p=>p[0])),right:Math.max(...ring.map(p=>p[0])),top:Math.min(...ring.map(p=>p[1])),bottom:Math.max(...ring.map(p=>p[1]))});
function triangles(result:FlatFoldResult,coords:Point[],face:number):Point[][]{
 const rings=[result.geometry.faces[face],...(result.geometry.graph?.faces_holes?.[face]??[])];
 if(rings.some(r=>r.length<3||r.some(v=>!coords[v]||!coords[v].every(Number.isFinite))))return [];
 const ids=rings.flat(),offsets:number[]=[],flat:number[]=[];let count=0;
 if(ids.length>512)return [];
 for(const ring of rings){if(count)offsets.push(count);count+=ring.length;for(const id of ring)flat.push(...coords[id]);}
 const indices=earcut(flat,offsets,2);
 return Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3).map(index=>coords[ids[index]]));
}
function clipTriangle(subject:Point[],triangle:Point[],epsilon:number):Point[]{
 let polygon=subject;
 const sign=area(triangle)>=0?1:-1;
 for(let edge=0;edge<3&&polygon.length;edge++){
  const a=triangle[edge],b=triangle[(edge+1)%3],input=polygon;polygon=[];
  for(let i=0;i<input.length;i++){
   const p=input[i],q=input[(i+1)%input.length],cp=sign*cross(a,b,p),cq=sign*cross(a,b,q),insideP=cp>=-epsilon,insideQ=cq>=-epsilon;
   if(insideP)polygon.push(p);
   if(insideP!==insideQ){const t=cp/(cp-cq);polygon.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
  }
 }
 return polygon;
}
/** Geometric overlap for a localized layer-crossing witness. This is the
 * candidate contact range, not a proof that every point violates layer order. */
export function flatConflictOverlapRegions(conflict:FlatFoldConflict,result:FlatFoldResult,coords:Point[]):Point[][]{
 if(!crossingKinds.has(conflict.kind)||result.geometry.status!=='ready')return [];
 const faces=[...new Set(conflict.faces)].filter(f=>Number.isInteger(f)&&f>=0&&f<result.geometry.faces.length);
 if(faces.length<2||faces.length>4)return [];
 const parts=faces.map(face=>triangles(result,coords,face));
 if(parts.reduce((sum,row)=>sum+row.length,0)>512)return [];
 let scale=1;
 for(const face of faces)for(const vertex of result.geometry.faces[face])for(const value of coords[vertex]??[])scale=Math.max(scale,Math.abs(value));
 const epsilon=scale*1e-10;
 let regions=parts[0];
 let pairs=0;
 for(let i=1;i<parts.length;i++){
  const next:Point[][]=[];
  for(const first of regions)for(const second of parts[i]){
   if(++pairs>65536)return [];
   const a=bounds(first),b=bounds(second);
   if(a.right<b.left-epsilon||b.right<a.left-epsilon||a.bottom<b.top-epsilon||b.bottom<a.top-epsilon)continue;
   const polygon=clipTriangle(first,second,epsilon);
   if(polygon.length>=3&&Math.abs(area(polygon))>epsilon*epsilon)next.push(polygon);
   if(next.length>2048)return [];
  }
  regions=next;
  if(!regions.length)break;
 }
 return regions;
}

/** Each material face has its own unfold transform. Project the shared folded
 * overlap through every involved face; CP faces do not overlap each other. */
export function flatConflictSourceOverlapRegions(conflict:FlatFoldConflict,folded:FlatFoldResult,sourceCoords:Point[]):{face:number;polygon:Point[]}[]{
 const overlap=flatConflictOverlapRegions(conflict,folded,folded.geometry.vertices);
 if(!overlap.length||sourceCoords.length!==folded.geometry.vertices.length)return [];
 const regions:{face:number;polygon:Point[]}[]=[];
 for(const face of new Set(conflict.faces)){
  const ids=folded.geometry.faces[face];
  if(!ids||ids.length<3)continue;
  let basis:[number,number,number]|undefined;
  for(let j=1;j<ids.length-1&&!basis;j++)for(let k=j+1;k<ids.length;k++){
   const a=folded.geometry.vertices[ids[0]],b=folded.geometry.vertices[ids[j]],c=folded.geometry.vertices[ids[k]];
   if(!a||!b||!c||!sourceCoords[ids[0]]||!sourceCoords[ids[j]]||!sourceCoords[ids[k]])continue;
   const determinant=cross(a,b,c),span=Math.max(1,Math.hypot(b[0]-a[0],b[1]-a[1]),Math.hypot(c[0]-a[0],c[1]-a[1]));
   if(Math.abs(determinant)>span*span*1e-12)basis=[ids[0],ids[j],ids[k]];
  }
  if(!basis)continue;
  const [i,j,k]=basis,a=folded.geometry.vertices[i],b=folded.geometry.vertices[j],c=folded.geometry.vertices[k],u=sourceCoords[i],v=sourceCoords[j],w=sourceCoords[k],determinant=cross(a,b,c);
  const map=(p:Point):Point=>{
   const x=cross(a,p,c)/determinant,y=cross(a,b,p)/determinant;
   return [u[0]+x*(v[0]-u[0])+y*(w[0]-u[0]),u[1]+x*(v[1]-u[1])+y*(w[1]-u[1])];
  };
  // An edited folded model may no longer have a single affine pose per face.
  // In that case the source location cannot be inferred safely.
  const sourceSpan=Math.max(1,...ids.map(id=>sourceCoords[id]?Math.hypot(sourceCoords[id][0]-u[0],sourceCoords[id][1]-u[1]):0));
  if(ids.some(id=>{
   const expected=sourceCoords[id],foldedPoint=folded.geometry.vertices[id];
   if(!expected||!foldedPoint)return true;
   const actual=map(foldedPoint);
   return !actual.every(Number.isFinite)||Math.hypot(actual[0]-expected[0],actual[1]-expected[1])>sourceSpan*1e-6;
  }))continue;
  for(const polygon of overlap)regions.push({face,polygon:polygon.map(map)});
 }
 return regions;
}
