import type {ModelOverlapCell} from './modelOverlapRegions';

export interface SpatialDepthPlane {
  origin:readonly number[];
  a:number;
  b:number;
  condition:number;
}
export type SpatialDepthCell=Pick<ModelOverlapCell,'polygon'|'faces'>;
export type SpatialDepthPlanes=readonly (SpatialDepthPlane|null)[];

export const enum SpatialDepth {
  Behind=-1, Contact=0, InFront=1, Intersection=2, NonFinite=3, EdgeOn=4,
}

/** A material-space check has excluded coplanarity. Evaluate the difference
 * of the two depth planes directly, so their common camera offset and slope
 * do not swamp the much smaller separation of a nearly closed hinge. */
export function refineSeparatedSpatialDepth(polygon:SpatialDepthCell['polygon'],a:SpatialDepthPlane|null,b:SpatialDepthPlane|null):SpatialDepth{
  if(!a||!b)return SpatialDepth.EdgeOn;
  const [ax,ay,az]=a.origin,[bx,by,bz]=b.origin;
  // Reference the midpoint of the two origins. Swapping the faces exactly
  // reverses the signed expression and preserves its error bound.
  const dz=az-bz,originDx=bx-ax,originDy=by-ay;
  const offsetX=(a.a*.5+b.a*.5)*originDx,offsetY=(a.b*.5+b.b*.5)*originDy;
  const base=(dz+offsetX)+offsetY,gradientX=a.a-b.a,gradientY=a.b-b.b;
  const absSlopeX=Math.abs(a.a)+Math.abs(b.a),absSlopeY=Math.abs(a.b)+Math.abs(b.b);
  const baseMagnitude=Math.abs(dz)+absSlopeX*.5*Math.abs(originDx)+absSlopeY*.5*Math.abs(originDy);
  let positive=false,negative=false;
  for(const [x,y] of polygon){
    const dx=(x-ax)*.5+(x-bx)*.5,dy=(y-ay)*.5+(y-by)*.5;
    const delta=(base+gradientX*dx)+gradientY*dy;
    // Include uncertainty from subtracting the independently computed slopes.
    // Use local distances: translating every screen coordinate leaves the bound unchanged.
    const magnitude=baseMagnitude+absSlopeX*Math.abs(dx)+absSlopeY*Math.abs(dy);
    const error=32*(Number.EPSILON*magnitude+Number.MIN_VALUE);
    if(!Number.isFinite(delta)||!Number.isFinite(error))return SpatialDepth.NonFinite;
    if(delta>error)positive=true;
    if(delta< -error)negative=true;
  }
  return positive&&negative?SpatialDepth.Intersection:positive?SpatialDepth.InFront:negative?SpatialDepth.Behind:SpatialDepth.Contact;
}

/** Order exactly matches the i < j traversal of the caller. Error codes allow
 * local and cross-cell diagnostics to be emitted in the original cell order. */
export function spatialCellDepths(cell:SpatialDepthCell,planes:SpatialDepthPlanes,roundoff:number):Int8Array{
  const {faces,polygon}=cell,vertices=polygon.length;
  const answer=new Int8Array(faces.length*(faces.length-1)/2);
  if(!answer.length)return answer;
  const depths=new Float64Array(faces.length*vertices);
  for(let i=0;i<faces.length;i++){
    const plane=planes[faces[i]];
    if(!plane)continue;
    const [x,y,z]=plane.origin;
    for(let k=0;k<vertices;k++){
      const p=polygon[k];
      depths[i*vertices+k]=z+plane.a*(p[0]-x)+plane.b*(p[1]-y);
    }
  }
  let index=0;
  for(let i=0;i<faces.length;i++){
    const a=planes[faces[i]];
    for(let j=i+1;j<faces.length;j++,index++){
      const b=planes[faces[j]];
      if(!a||!b){answer[index]=SpatialDepth.EdgeOn;continue;}
      const tolerance=roundoff*(a.condition+b.condition);
      let positive=false,negative=false;
      for(let k=0;k<vertices;k++){
        const delta=depths[i*vertices+k]-depths[j*vertices+k];
        if(!Number.isFinite(delta)){answer[index]=SpatialDepth.NonFinite;break;}
        if(delta>tolerance)positive=true;
        if(delta< -tolerance)negative=true;
      }
      if(answer[index]!==SpatialDepth.NonFinite){
        answer[index]=positive&&negative?SpatialDepth.Intersection:positive?SpatialDepth.InFront:negative?SpatialDepth.Behind:SpatialDepth.Contact;
      }
    }
  }
  return answer;
}

export interface SpatialDepthRequest {cells:SpatialDepthCell[];planes:SpatialDepthPlanes;roundoff:number}
