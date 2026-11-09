import {projectDiagramSpatialPoint,type DiagramSpatialPose} from './diagramSpatialPose';
type Camera=DiagramSpatialPose['camera'];
type Vector=[number,number,number];
export const sameSpatialCamera=(a:Camera,b:Camera)=>JSON.stringify([a.yaw,a.elevation,a.rotation,a.pivot,a.offset])===JSON.stringify([b.yaw,b.elevation,b.rotation,b.pivot,b.offset]);
const multiply=(a:number[],b:number[])=>Array.from({length:9},(_,k)=>{const i=Math.floor(k/3),j=k%3;return a[i*3]*b[j]+a[i*3+1]*b[j+3]+a[i*3+2]*b[j+6];});
const transpose=(r:number[])=>[r[0],r[3],r[6],r[1],r[4],r[7],r[2],r[5],r[8]];
function matrix(camera:Camera){if(camera.rotation)return camera.rotation;const y=camera.yaw*Math.PI/180,e=camera.elevation*Math.PI/180,c=Math.cos(y),s=Math.sin(y),ce=Math.cos(e),se=Math.sin(e);return [c,s,0,-s*ce,c*ce,-se,-s*se,c*se,ce];}
/** Bind orbit to the model center while preserving its current screen position. */
export function centeredOrbitCamera(camera:Camera,vertices:readonly Vector[]):Camera{
 if(camera.rotation&&camera.pivot&&camera.offset)return camera;
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of vertices)p.forEach((value,k)=>{min[k]=Math.min(min[k],value);max[k]=Math.max(max[k],value);});
 const center=(vertices.length?min.map((value,k)=>(value+max[k])/2):[0,0,0]) as Vector;
 const pivot=projectDiagramSpatialPoint(center,{yaw:0,elevation:0,frame:camera.frame}),offset=projectDiagramSpatialPoint(center,camera);
 return {...camera,rotation:matrix(camera),pivot,offset};
}
/** Screen-space virtual trackball; inverse drawing/back transforms make the
 * drag follow the pointer even after flipping or rotating the drawing. */
export function arcballCamera(camera:Camera,start:[number,number],end:[number,number],box:{width:number;height:number},back=false,drawingRotation=0):Camera{
 if(start[0]===end[0]&&start[1]===end[1])return camera;
 const radius=Math.max(1,Math.min(box.width,box.height)*.45);
 const point=([x,y]:[number,number]):Vector=>{x=(x-box.width/2)/radius;y=(y-box.height/2)/radius;const d=Math.hypot(x,y);return d<=1?[x,y,Math.sqrt(1-d*d)]:[x/d,y/d,0];};
 const a=point(start),b=point(end),cross:Vector=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 let q=[...cross,1+a.reduce((sum,v,i)=>sum+v*b[i],0)];
 if(Math.hypot(...q)<1e-10){const axis:Vector=Math.abs(a[0])<.8?[1,0,0]:[0,1,0];q=[a[1]*axis[2]-a[2]*axis[1],a[2]*axis[0]-a[0]*axis[2],a[0]*axis[1]-a[1]*axis[0],0];}
 const length=Math.hypot(...q),[x,y,z,w]=q.map(v=>v/length),r=[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)];
 const angle=drawingRotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),flip=back?-1:1,d=[c*flip,-s,0,s*flip,c,0,0,0,flip];
 return {...camera,rotation:multiply(multiply(multiply(transpose(d),r),d),matrix(camera))};
}
