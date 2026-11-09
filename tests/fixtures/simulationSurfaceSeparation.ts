import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationSurfaceMesh} from '../../src/engine/simSurfaceLayers';

type P=[number,number];type V=[number,number,number];
const cross=(a:P,b:P,c:P)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=(p:P[])=>p.length<3?0:Math.abs(p.reduce((s,q,i)=>s+cross(p[0],q,p[(i+1)%p.length]),0))/2;
const sub=(a:V,b:V):V=>a.map((n,k)=>n-b[k]) as V;
const cross3=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const point=(p:ArrayLike<number>,v:number):V=>[p[v*3],p[v*3+1],p[v*3+2]];
function clip(polygon:P[],triangle:P[]):P[]{
  let out=polygon;const orientation=Math.sign(cross(triangle[0],triangle[1],triangle[2]));
  for(let k=0;k<3;k++){
    const input=out;out=[];
    for(let j=0;j<input.length;j++){
      const p=input[j],q=input[(j+1)%input.length],a=orientation*cross(triangle[k],triangle[(k+1)%3],p),b=orientation*cross(triangle[k],triangle[(k+1)%3],q);
      if(a>=0)out.push(p);
      if(a>=0&&b<0||a<0&&b>=0){const t=a/(a-b);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
    }
    if(out.length<3)return [];
  }
  return out;
}

export interface SurfaceSeparationPair {
  faces:[number,number];
  regions:number;
  overlapArea:number;
  failedArea:number;
  minSignedGap:number;
}
export interface SurfaceSeparationAudit {
  pairs:SurfaceSeparationPair[];
  checkedRegions:number;
  overlapArea:number;
  failedArea:number;
  minSignedGap:number;
  candidates:number;
}

/** Independent display-geometry audit for a near-XZ flat ring. Material
 * barycentric coordinates locate the same original paper point in two display
 * fragments; solver vertices are never replaced by the separated coordinates.
 *
 * Every pair of material fragments with a trusted face relation is intersected
 * in material XZ. The signed separation is affine on that convex intersection,
 * so checking every polygon vertex bounds the WHOLE positive-area region,
 * rather than assuming a handful of triangle centroids represent all cells.
 * A tiny material-area budget is reported explicitly for Float32/barycentric
 * boundary slivers. A legitimate bottom layer's zero displacement is not a
 * failure: only the signed RELATIVE distance to an overlapping sheet matters. */
export function auditTrustedSurfaceSeparation(prepared:PreparedOrigamiModel,solverPose:Float32Array,mesh:SimulationSurfaceMesh,faceOrders:readonly (readonly [number,number,number])[],minGap=mesh.layerGap*.99):SurfaceSeparationAudit {
  if(!mesh.sourceTriangles||!mesh.gapDirections||!prepared.triangleSourceFaces)throw Error('The geometry audit needs exact material triangle ownership.');
  type Triangle={source:number;material:P[];display:V[];normal:V;bound:[number,number,number,number]};
  const material=Array.from(mesh.sourceVertices,(source,v)=>[0,1,2].map(k=>mesh.sourceVertexWeights?.[v]?.reduce((s,[source,w])=>s+w*solverPose[source*3+k],0)??solverPose[source*3+k]) as V);
  const triangles:Triangle[]=Array.from({length:mesh.indices.length/3},(_,index)=>{
    const ids=Array.from(mesh.indices.slice(index*3,index*3+3)),origin=mesh.sourceTriangles![index],source=prepared.triangleSourceFaces![origin],original=prepared.facesVertices[origin].map(v=>point(solverPose,v));
    const raw=cross3(sub(original[1],original[0]),sub(original[2],original[0])),length=Math.hypot(...raw),m=ids.map(v=>[material[v][0],material[v][2]] as P);
    return {source,material:m,display:ids.map(v=>point(mesh.positions,v)),normal:raw.map(x=>x/length) as V,bound:[Math.min(...m.map(p=>p[0])),Math.min(...m.map(p=>p[1])),Math.max(...m.map(p=>p[0])),Math.max(...m.map(p=>p[1]))]};
  });
  const bySource=Array.from({length:prepared.sourceFaceCount!},()=>[] as Triangle[]);
  triangles.forEach(triangle=>bySource[triangle.source].push(triangle));bySource.forEach(ts=>ts.sort((a,b)=>a.bound[0]-b.bound[0]));
  const prefix=bySource.map(ts=>{let high=-Infinity;return ts.map(t=>high=Math.max(high,t.bound[2]));});
  const interpolate=(triangle:Triangle,p:P):V=>{
    const [a,b,c]=triangle.material,den=cross(a,b,c),w=[cross(p,b,c)/den,cross(a,p,c)/den,cross(a,b,p)/den];
    return [0,1,2].map(k=>w.reduce((sum,x,i)=>sum+x*triangle.display[i][k],0)) as V;
  };
  const result:SurfaceSeparationAudit={pairs:[],checkedRegions:0,overlapArea:0,failedArea:0,minSignedGap:Infinity,candidates:0};
  for(const [a,b,sign] of faceOrders){
    const pair:SurfaceSeparationPair={faces:[a,b],regions:0,overlapArea:0,failedArea:0,minSignedGap:Infinity},first=bySource[a],second=bySource[b],maxima=prefix[b];
    for(const t of first){
      let lo=0,hi=second.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(second[mid].bound[0]<=t.bound[2])lo=mid+1;else hi=mid;}
      for(let j=lo-1;j>=0&&maxima[j]>=t.bound[0];j--){
        const u=second[j];
        if(u.bound[2]<=t.bound[0]||u.bound[0]>=t.bound[2]||u.bound[3]<=t.bound[1]||u.bound[1]>=t.bound[3])continue;
        result.candidates++;const polygon=clip(t.material,u.material),size=area(polygon);if(size<1e-12)continue;
        pair.regions++;pair.overlapArea+=size;let minimum=Infinity;
        for(const p of polygon){const delta=sub(interpolate(t,p),interpolate(u,p));minimum=Math.min(minimum,sign*delta.reduce((s,n,k)=>s+n*u.normal[k],0));}
        pair.minSignedGap=Math.min(pair.minSignedGap,minimum);if(minimum<minGap)pair.failedArea+=size;
      }
    }
    if(!pair.regions)continue;
    result.pairs.push(pair);result.checkedRegions+=pair.regions;result.overlapArea+=pair.overlapArea;result.failedArea+=pair.failedArea;result.minSignedGap=Math.min(result.minSignedGap,pair.minSignedGap);
  }
  return result;
}
