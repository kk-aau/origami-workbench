import type {Point} from './types';

/** Rabbit Ear counts a vertex when *all* signed side tests agree, including
 * all false. Keep the original operation order for the exact CPU decision. */
export function faceVertexPredicate(points:readonly Point[],face:readonly number[],epsilon:number){
 const polygon=face.map(v=>points[v]),sides=new Float64Array(polygon.length);
 return (v:number)=>{
  const p=points[v];let sum=0;
  for(let i=0;i<polygon.length;i++){
   const a=polygon[i],b=polygon[(i+1)%polygon.length];
   sides[i]=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);sum+=sides[i];
  }
  const sign=Math.sign(sum),first=sides[0]*sign>epsilon;
  for(let i=1;i<sides.length;i++)if((sides[i]*sign>epsilon)!==first)return false;
  return true;
 };
}

/** Four real edges suffice to REJECT some vertices. Acceptance and every
 * uncertain result remain the original double-precision predicate above. */
export function faceVertexFilterData(points:readonly Point[],faces:readonly (readonly number[])[],epsilon:number){
 if(!points.length||!faces.length||!Number.isFinite(epsilon))return null;
 let scale=0;
 for(const [x,y] of points)scale=Math.max(scale,Math.abs(x),Math.abs(y));
 if(!Number.isFinite(scale)||scale>2**50)return null;
 // All differences are bounded by 2*scale. Covers float uploads, subtraction,
 // two products, final subtraction, and subnormal flushing at every operation.
 const tolerance=Math.fround(2*(Math.abs(epsilon)+128*2**-23*scale*scale+2**-120));
 if(!Number.isFinite(tolerance))return null;
 const edges=new Float32Array(faces.length*16);
 let eligible=0;
 for(let f=0;f<faces.length;f++){
  const face=faces[f],n=face.length;
  if(n<3||n>1024)continue;
  let area=0;
  for(let k=0;k<n;k++){
   const a=points[face[k]],b=points[face[(k+1)%n]];
   area+=a[0]*b[1]-a[1]*b[0];
  }
  // Sum of the exact side products is the same signed area for any vertex.
  // Cover errors of both the shoelace sum above and the CPU sum evaluated at
  // any input vertex. A possibly zero CPU sum makes ALL tests false.
  if(Math.abs(area)<=128*Number.EPSILON*scale*scale*(n+1)**2+Number.MIN_VALUE*128*n*n)continue;
  eligible++;
  for(let j=0;j<4;j++){
   const k=Math.floor(j*n/4),a=points[face[k]],b=points[face[(k+1)%n]],i=f*16+j*4;
   edges[i]=a[0];edges[i+1]=a[1];edges[i+2]=b[0]-a[0];edges[i+3]=b[1]-a[1];
  }
 }
 return eligible?{edges,tolerance}:null;
}
