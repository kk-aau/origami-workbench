import {projectVertices,type CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';

export interface PickedSimulationVertex{
  index:number;
  position:[number,number,number];
  screen:[number,number];
  depth:number;
}

/** Pick a real vertex near the pointer. Opaque paper may supply its triangles
 * so a closer screen-space point on a hidden sheet cannot steal the grab. */
export function pickSimulationVertex(positions:Float32Array,camera:CameraUniforms,x:number,y:number,radius:number,triangleIndices?:ArrayLike<number>):PickedSimulationVertex|null{
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(radius)||radius<=0||!Number.isFinite(camera.camDist)||camera.camDist<=0)return null;
  const projected=projectVertices(positions,camera);
  const candidates:{index:number;distance:number;depth:number}[]=[];
  const depthTolerance=Math.max(Math.abs(camera.camDist),Math.abs(camera.depthRange),1e-6)*2e-6;
  for(let i=0;i<projected.count;i++){
    const sx=projected.screen[2*i],sy=projected.screen[2*i+1],depth=projected.view[3*i+2];
    if(!Number.isFinite(sx)||!Number.isFinite(sy)||!Number.isFinite(depth)||depth>=camera.camDist)continue;
    const distance=(sx-x)**2+(sy-y)**2;
    if(distance<=radius*radius)candidates.push({index:i,distance,depth});
  }
  candidates.sort((a,b)=>a.distance-b.distance||(Math.abs(a.depth-b.depth)>depthTolerance?b.depth-a.depth:a.index-b.index));
  // Usually the first candidate is visible. Do not test every model vertex
  // against every face on every pointer move.
  for(const candidate of candidates){
    const {index,depth}=candidate;
    if(triangleIndices&&isOccluded(index,projected.view,projected.count,camera.camDist,triangleIndices,depthTolerance))continue;
    return {index,position:[positions[3*index],positions[3*index+1],positions[3*index+2]],screen:[projected.screen[2*index],projected.screen[2*index+1]],depth};
  }
  return null;
}

/** Intersect the actual perspective ray, rather than linearly interpolating
 * view depth in screen space. This is equivalent to reciprocal eye-distance
 * interpolation, and also handles triangles which cross the camera plane. */
function isOccluded(index:number,view:Float32Array,count:number,eye:number,indices:ArrayLike<number>,depthTolerance:number):boolean{
  const offset=3*index,eyeDistance=eye-view[offset+2];
  const dx=view[offset]/eyeDistance,dy=view[offset+1]/eyeDistance;
  for(let triangle=0;triangle+2<indices.length;triangle+=3){
    const ai=indices[triangle],bi=indices[triangle+1],ci=indices[triangle+2];
    if(!Number.isInteger(ai)||!Number.isInteger(bi)||!Number.isInteger(ci)||ai<0||bi<0||ci<0||ai>=count||bi>=count||ci>=count)continue;
    const a=ai*3,b=bi*3,c=ci*3;
    const ax=view[a],ay=view[a+1],az=view[a+2];
    const e1x=view[b]-ax,e1y=view[b+1]-ay,e1z=view[b+2]-az;
    const e2x=view[c]-ax,e2y=view[c+1]-ay,e2z=view[c+2]-az;
    const px=dy*e2z+e2y,py=-e2x-dx*e2z,pz=dx*e2y-dy*e2x;
    const determinant=e1x*px+e1y*py+e1z*pz;
    const determinantScale=Math.hypot(e1x,e1y,e1z)*Math.hypot(e2x,e2y,e2z)*Math.hypot(dx,dy,1);
    if(!Number.isFinite(determinant)||Math.abs(determinant)<=Number.EPSILON*32*determinantScale)continue;
    const tx=-ax,ty=-ay,tz=eye-az,inverse=1/determinant;
    const u=(tx*px+ty*py+tz*pz)*inverse;
    const edgeTolerance=1e-7;
    if(u < -edgeTolerance||u > 1+edgeTolerance)continue;
    const qx=ty*e1z-tz*e1y,qy=tz*e1x-tx*e1z,qz=tx*e1y-ty*e1x;
    const v=(dx*qx+dy*qy-qz)*inverse;
    if(v < -edgeTolerance||u+v > 1+edgeTolerance)continue;
    const hitDistance=(e2x*qx+e2y*qy+e2z*qz)*inverse;
    if(hitDistance>0&&hitDistance<eyeDistance-depthTolerance)return true;
  }
  return false;
}

/** Keep the selected vertex at its original camera depth while moving it in the view plane. */
export function simulationDragTarget(pick:PickedSimulationVertex,camera:CameraUniforms,x:number,y:number):[number,number,number]{
  const perspective=camera.camDist/Math.max(camera.camDist-pick.depth,.001);
  const dx=(x-pick.screen[0])/(camera.scale*perspective);
  const dy=-(y-pick.screen[1])/(camera.scale*perspective);
  const m=camera.rotation;
  return [
    pick.position[0]+m[0]*dx+m[3]*dy,
    pick.position[1]+m[1]*dx+m[4]*dy,
    pick.position[2]+m[2]*dx+m[5]*dy,
  ];
}
