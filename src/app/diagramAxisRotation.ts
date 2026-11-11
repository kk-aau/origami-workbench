import type {DiagramSpatialPose} from './diagramSpatialPose';

type Camera=DiagramSpatialPose['camera'];
type Vec3=[number,number,number];
export type DiagramRotationAxis='x'|'y'|'z';
export type DiagramAxisProjection={u:Vec3;v:Vec3};
const multiply=(a:number[],b:number[])=>Array.from({length:9},(_,k)=>{const i=Math.floor(k/3),j=k%3;return a[i*3]*b[j]+a[i*3+1]*b[j+3]+a[i*3+2]*b[j+6];});
function matrix(camera:Camera):number[]{
  if(camera.rotation)return camera.rotation;
  const y=camera.yaw*Math.PI/180,e=camera.elevation*Math.PI/180,c=Math.cos(y),s=Math.sin(y),ce=Math.cos(e),se=Math.sin(e);
  return [c,s,0,-s*ce,c*ce,-se,-s*se,c*se,ce];
}
const worldAxis=(axis:DiagramRotationAxis):Vec3=>axis==='x'?[1,0,0]:axis==='y'?[0,1,0]:[0,0,1];
function inFrame(camera:Camera,p:Vec3):Vec3{
  const r=camera.frame?.rotation;return r?[r[0]*p[0]+r[3]*p[1]+r[6]*p[2],r[1]*p[0]+r[4]*p[1]+r[7]*p[2],r[2]*p[0]+r[5]*p[1]+r[8]*p[2]]:p;
}
/** Rotate around a world axis, expressed in the camera's fixed-paper frame.
 * The pivot and its screen offset stay unchanged; fold vertices never move. */
export function rotateDiagramCameraAxis(camera:Camera,axis:DiagramRotationAxis,radians:number):Camera{
  if(!Number.isFinite(radians))throw Error('旋转角必须为有限数值。');
  if(radians===0)return camera;
  const [x,y,z]=inFrame(camera,worldAxis(axis)),c=Math.cos(radians),s=Math.sin(radians),t=1-c;
  const r=[t*x*x+c,t*x*y-s*z,t*x*z+s*y,t*x*y+s*z,t*y*y+c,t*y*z-s*x,t*x*z-s*y,t*y*z+s*x,t*z*z+c];
  return {...camera,rotation:multiply(matrix(camera),r)};
}
/** Unit circle about the selected world axis, projected with the same final
 * back-side and drawing rotation as the paper underneath the control. */
export function diagramAxisProjection(camera:Camera,axis:DiagramRotationAxis,back=false,drawingRotation=0):DiagramAxisProjection{
  const m=matrix(camera),a=drawingRotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),flip=back?-1:1;
  const project=(world:Vec3):Vec3=>{const p=inFrame(camera,world),q=[0,1,2].map(i=>m[i*3]*p[0]+m[i*3+1]*p[1]+m[i*3+2]*p[2]);return [c*q[0]*flip-s*q[1],s*q[0]*flip+c*q[1],q[2]*flip];};
  return axis==='x'?{u:project([0,1,0]),v:project([0,0,1])}:axis==='y'?{u:project([0,0,1]),v:project([1,0,0])}:{u:project([1,0,0]),v:project([0,1,0])};
}
export function diagramAxisRingPoint(projection:DiagramAxisProjection,angle:number):Vec3{
  const c=Math.cos(angle),s=Math.sin(angle);return projection.u.map((v,i)=>v*c+projection.v[i]*s) as Vec3;
}
export function diagramAxisPointerAngle(projection:DiagramAxisProjection,point:[number,number]):number|undefined{
  const {u,v}=projection,det=u[0]*v[1]-v[0]*u[1];
  // An edge-on circle has no reliable inverse. The gesture uses its tangent.
  if(Math.abs(det)<.08||Math.hypot(...point)<.04)return undefined;
  return Math.atan2((u[0]*point[1]-u[1]*point[0])/det,(v[1]*point[0]-v[0]*point[1])/det);
}
export function diagramAxisDragStart(projection:DiagramAxisProjection,point:[number,number]){
  let angle=diagramAxisPointerAngle(projection,point);
  if(angle===undefined){let best=Infinity;for(let i=0;i<256;i++){const t=i*Math.PI/128,p=diagramAxisRingPoint(projection,t),distance=(p[0]-point[0])**2+(p[1]-point[1])**2-p[2]*1e-8;if(distance<best){best=distance;angle=t;}}}
  const t=angle!,tangent=projection.u.map((v,i)=>-v*Math.sin(t)+projection.v[i]*Math.cos(t));
  if(Math.hypot(tangent[0],tangent[1])<.15){const basis=Math.hypot(projection.u[0],projection.u[1])>Math.hypot(projection.v[0],projection.v[1])?projection.u:projection.v;tangent[0]=basis[0];tangent[1]=basis[1];}
  const length=Math.hypot(tangent[0],tangent[1]);
  return {angle:t,tangent:[tangent[0]/length,tangent[1]/length] as [number,number],elliptic:diagramAxisPointerAngle(projection,point)!==undefined};
}
export const diagramAxisAngleDelta=(previous:number,current:number)=>Math.atan2(Math.sin(current-previous),Math.cos(current-previous));
