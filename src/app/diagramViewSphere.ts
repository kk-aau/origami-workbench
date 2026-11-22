import type {DiagramSpatialPose} from './diagramSpatialPose';
import type {DiagramFoldMatrix} from './diagramFoldLinkTypes';
import {diagramAxisProjection} from './diagramAxisRotation';

export type Vector3=[number,number,number];
export type ViewSpherePoint={direction:Vector3;kind:'端点'|'边中点'|'面中心'};
export const maxViewDivisions=12;
const dot=(a:Vector3,b:Vector3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Vector3,b:Vector3):Vector3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(p:Vector3)=>p.map(v=>v/Math.hypot(...p)) as Vector3;
const key=(p:Vector3)=>p.map(v=>Math.round(v*1e9)).join(',');
export const turnBasis=(a:readonly number[],b:readonly number[])=>Array.from({length:9},(_,k)=>{
  const i=k-k%3,j=k%3;return a[i]*b[j]+a[i+1]*b[3+j]+a[i+2]*b[6+j];
});
export const transposeBasis=(r:readonly number[])=>[r[0],r[3],r[6],r[1],r[4],r[7],r[2],r[5],r[8]];
export const inBasis=(r:readonly number[],p:Vector3):Vector3=>[0,3,6].map(i=>r[i]*p[0]+r[i+1]*p[1]+r[i+2]*p[2]) as Vector3;
export function viewSphereBasis(direction:Vector3){
  const front=unit(direction),right=Math.hypot(front[0],front[1])>1e-10?unit([front[1],-front[0],0]):[Math.sign(front[2]),0,0] as Vector3;
  return [...right,...cross(front,right),...front];
}
/** Orient the globe like the drawing at the fixed face. Screen up becomes
 * globe +Z, screen right +X, and the visible side faces globe +Y. */
export function fixedPaperSphereFrame(camera:DiagramSpatialPose['camera'],face:number[],fixed:DiagramFoldMatrix|undefined,back:boolean,degrees:number){
  const xy=diagramAxisProjection(camera,'z'),yz=diagramAxisProjection(camera,'x');
  const live=turnBasis(transposeBasis([...xy.u,...xy.v,...yz.v]),face);
  let orientation=live;
  if(fixed){
    // The saved affine map carries the horizontal and vertical projections
    // of both material tangents. Recover their normal components from row
    // orthogonality; the live paper normal distinguishes the mirrored tilt.
    const [a,b,c,d]=fixed,xx=Math.max(0,1-a*a-c*c),yy=Math.max(0,1-b*b-d*d);
    let x=0,y=0;
    if(xx>=yy&&xx>1e-14){x=Math.sqrt(xx);y=-(a*b+c*d)/x;}
    else if(yy>1e-14){y=Math.sqrt(yy);x=-(a*b+c*d)/y;}
    if(x*live[2]+y*live[5]<0){x=-x;y=-y;}
    const right=unit([a,c,x]),forward=unit(cross(right,[b,d,y]));
    orientation=[...right,...cross(forward,right),...forward];
  }
  const t=degrees*Math.PI/180,c=Math.cos(t),s=Math.sin(t),flip=back?-1:1;
  const display=turnBasis([c*flip,-s,0,s*flip,c,0,0,0,flip],orientation);
  const screenFromGlobe=[1,0,0,0,0,-1,0,1,0];
  return turnBasis(face,turnBasis(transposeBasis(display),screenFromGlobe));
}
/** Each unoriented cutting plane repeats after half a turn. */
export function viewSphereGrid(divisions:Vector3){
  const normals=new Map<string,Vector3>();
  divisions.forEach((count,axis)=>{
    if(!Number.isInteger(count)||count<1||count>maxViewDivisions)throw Error('视角球等分数超出范围。');
    for(let i=0;i<count;i++){
      const angle=i*Math.PI/count,n:Vector3=[0,0,0];
      n[(axis+1)%3]=Math.cos(angle);n[(axis+2)%3]=Math.sin(angle);
      const first=n.find(v=>Math.abs(v)>1e-10)!;
      const normal=n.map(v=>Math.abs(v)<1e-12?0:v*Math.sign(first)) as Vector3;
      normals.set(key(normal),normal);
    }
  });
  const planes=[...normals.values()],points=new Map<string,ViewSpherePoint>();
  const add=(direction:Vector3,kind:ViewSpherePoint['kind'])=>points.set(key(direction),{direction,kind});
  for(let i=0;i<planes.length;i++)for(let j=0;j<i;j++){
    const vertex=unit(cross(planes[i],planes[j]));
    add(vertex,'端点');add(vertex.map(v=>-v) as Vector3,'端点');
  }
  const vertices=[...points.values()],centers=new Map<string,Vector3>();
  const circles=planes.map((n,i)=>{
    const u=unit(cross(n,Math.abs(n[2])<.8?[0,0,1]:[0,1,0])),v=cross(n,u);
    const angles=vertices.filter(p=>Math.abs(dot(p.direction,n))<1e-9).map(p=>Math.atan2(dot(p.direction,v),dot(p.direction,u))).sort((a,b)=>a-b);
    const at=(angle:number):Vector3=>u.map((x,k)=>x*Math.cos(angle)+v[k]*Math.sin(angle)) as Vector3;
    for(let j=0;j<angles.length;j++){
      const end=j+1<angles.length?angles[j+1]:angles[0]+2*Math.PI,mid=at((angles[j]+end)/2);
      add(mid,'边中点');
      // The signs of all other planes are constant inside this open arc.
      // Its two sides belong to the cells differing in the current plane.
      for(const side of [false,true]){
        const cell=planes.map((plane,k)=>(k===i?side:dot(plane,mid)>0)?'1':'0').join('');
        const sum=centers.get(cell)??[0,0,0];
        mid.forEach((value,k)=>sum[k]+=value);centers.set(cell,sum);
      }
    }
    return {u,v};
  });
  for(const sum of centers.values())add(unit(sum),'面中心');
  return {circles,points:[...points.values()]};
}
/** Reopen the globe at the compound camera orientation, including roll. */
export function viewSphereBasisFromCamera(camera:DiagramSpatialPose['camera'],reference:number[],back:boolean,degrees:number){
  const xy=diagramAxisProjection(camera,'z',back,degrees),yz=diagramAxisProjection(camera,'x',back,degrees);
  return turnBasis(transposeBasis([...xy.u,...xy.v,...yz.v]),reference);
}
/** Convert the selector's reference-face axes to the stored camera frame,
 * undoing the drawing's final flip and in-plane rotation. */
export function cameraFromViewSphere(camera:DiagramSpatialPose['camera'],basis:number[],reference:number[],back:boolean,degrees:number){
  const t=degrees*Math.PI/180,c=Math.cos(t),s=Math.sin(t),flip=back?-1:1;
  const screen=[c*flip,-s,0,s*flip,c,0,0,0,flip];
  const frame=camera.frame?.rotation??[1,0,0,0,1,0,0,0,1];
  return {...camera,rotation:turnBasis(turnBasis(transposeBasis(screen),basis),turnBasis(transposeBasis(reference),frame))};
}
