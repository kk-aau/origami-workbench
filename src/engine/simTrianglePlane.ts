export type Vector=[number,number,number];
type RasterPlane={vertices:Vector[];errors:Vector[];normal:Vector;normalError:Vector};
export const subtract=(a:Vector,b:Vector):Vector=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const vectorCross=(a:Vector,b:Vector):Vector=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const vectorDot=(a:Vector,b:Vector)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
/** A solver coordinate was rounded once to Float32. Its uncertainty is local
 * to that coordinate, including the subnormal range. A separate edge-scaled
 * term below accounts for the preceding double-precision rigid transform;
 * cancellation near the origin must not make that uncertainty disappear. */
const coordinateError=(value:number)=>2**Math.max(-150,Math.floor(Math.log2(Math.abs(value)||2**-149))-24);

export function trianglePlaneLookup(positions:Float32Array,indices:Uint32Array){
  const planes=new Map<number,RasterPlane>();
  const plane=(face:number):RasterPlane=>{
    const old=planes.get(face);if(old)return old;
    const vertices=Array.from({length:3},(_,i)=>Array.from(positions.slice(indices[face*3+i]*3,indices[face*3+i]*3+3)) as Vector);
    const u=subtract(vertices[1],vertices[0]),v=subtract(vertices[2],vertices[0]);
    // A rigid transform can cancel an O(edge-length) coordinate down to 1e-15
    // before the final Float32 conversion. Its last rounding alone would then
    // suggest an impossible 1e-22 accuracy and reject a retained paper stack.
    // Bound those earlier double operations in this triangle's own units;
    // neither the scene size nor another remote sheet changes the tolerance.
    const transformError=Math.max(Math.hypot(...u),Math.hypot(...v),Math.hypot(...subtract(vertices[2],vertices[1])))*Number.EPSILON*64;
    const errors=vertices.map(p=>p.map(n=>coordinateError(n)+transformError) as Vector);
    const du=errors[1].map((e,k)=>e+errors[0][k]),dv=errors[2].map((e,k)=>e+errors[0][k]);
    const normal=vectorCross(u,v),normalError=[0,1,2].map(k=>{
      const j=(k+1)%3,l=(k+2)%3;
      return Math.abs(u[j])*dv[l]+Math.abs(v[l])*du[j]+du[j]*dv[l]+Math.abs(u[l])*dv[j]+Math.abs(v[j])*du[l]+du[l]*dv[j];
    }) as Vector;
    const result={vertices,errors,normal,normalError};planes.set(face,result);return result;
  };
  return plane;
}

const liesOn=(points:RasterPlane,reference:RasterPlane)=>points.vertices.every((p,i)=>{
    const w=subtract(p,reference.vertices[0]),dw=points.errors[i].map((e,k)=>e+reference.errors[0][k]);
    let uncertainty=0,roundoff=0;
    for(let k=0;k<3;k++){
      uncertainty+=Math.abs(reference.normal[k])*dw[k]+Math.abs(w[k])*reference.normalError[k]+dw[k]*reference.normalError[k];
      roundoff+=Math.abs(reference.normal[k]*w[k]);
    }
    return Math.abs(vectorDot(reference.normal,w))<=uncertainty+roundoff*Number.EPSILON*32;
  });
export const reliablePlane=(plane:RasterPlane)=>Math.hypot(...plane.normal)>Math.hypot(...plane.normalError)*100;
export const sameTrianglePlane=(a:RasterPlane,b:RasterPlane)=>liesOn(a,b)&&liesOn(b,a);
