import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {Mat3} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
type Row=[number,number,number];
type Point3=[number,number,number];
interface SampleMesh {cp:number[][];indices:Uint32Array;sourceFaces:number[];positions:ArrayLike<number>}

/** Sample a folded position by its original paper coordinates, including
 * vertices introduced by a later crease or a different triangulation. */
export function sampleDiagramMaterialPoint(mesh:SampleMesh,p:number[]){
  for(let t=0;t<mesh.sourceFaces.length;t++){
    const i=mesh.indices[3*t],j=mesh.indices[3*t+1],k=mesh.indices[3*t+2];
    const a=mesh.cp[i],b=mesh.cp[j],c=mesh.cp[k];
    const d=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    if(Math.abs(d)<1e-16)continue;
    const v=((p[0]-a[0])*(c[1]-a[1])-(p[1]-a[1])*(c[0]-a[0]))/d;
    const w=((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/d,u=1-v-w;
    if(Math.min(u,v,w)<-1e-7)continue;
    const position=[0,1,2].map(axis=>u*mesh.positions[3*i+axis]+v*mesh.positions[3*j+axis]+w*mesh.positions[3*k+axis]) as Point3;
    return {position,face:mesh.sourceFaces[t],winding:Math.sign(d)};
  }
  throw Error('前后步骤的材料范围不一致，无法连续衔接。');
}

const point=(a:ArrayLike<number>,i:number):Point3=>[a[i*3],a[i*3+1],a[i*3+2]];
const sub=(a:Point3,b:Point3):Point3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:Point3,b:Point3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Point3,b:Point3):Point3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function unit(v:Point3):Point3 {
  const length=Math.hypot(...v);
  if(!Number.isFinite(length)||length===0)throw Error('固定纸面缺少可用于定位的非共线顶点。');
  return [v[0]/length,v[1]/length,v[2]/length];
}
function basis(a:Point3,b:Point3,c:Point3){
  const x=unit(sub(b,a)),z=unit(cross(x,sub(c,a)));
  return [x,cross(z,x),z];
}
/** Proper rigid transform determined by the specified material anchors.
 * A different folding branch cannot be repaired by moving individual points. */
export function registerDiagramPositions(source:ArrayLike<number>,wanted:Point3[],anchors:number[],failure:string,onRotation?:(rotation:Mat3)=>void):number[]{
  if(anchors.length<3||source.length!==wanted.length*3)throw Error(failure);
  const first=anchors[0],origin=point(source,first);
  let b=first,c=first,maxDistance=0,maxArea=0;
  for(const i of anchors){
    const length=Math.hypot(...sub(point(source,i),origin));
    if(length>maxDistance){maxDistance=length;b=i;}
  }
  const ab=sub(point(source,b),origin);
  for(const i of anchors){
    const area=Math.hypot(...cross(ab,sub(point(source,i),origin)));
    if(area>maxArea){maxArea=area;c=i;}
  }
  const from=basis(origin,point(source,b),point(source,c)),to=basis(wanted[first],wanted[b],wanted[c]);
  const result=wanted.flatMap((_,i)=>{
    const delta=sub(point(source,i),origin),local=from.map(axis=>dot(axis,delta));
    return [0,1,2].map(k=>wanted[first][k]+to.reduce((sum,axis,j)=>sum+axis[k]*local[j],0));
  });
  if(result.some(n=>!Number.isFinite(n))||anchors.some(i=>Math.hypot(...sub(wanted[i],point(result,i)))>2e-5))throw Error(failure);
  if(onRotation){
    // Columns of each basis are its unit world axes; R = to * transpose(from).
    const component=(r:number,c:number)=>to.reduce((sum,axis,k)=>sum+axis[r]*from[k][c],0);
    onRotation([component(0,0),component(0,1),component(0,2),component(1,0),component(1,1),component(1,2),component(2,0),component(2,1),component(2,2)]);
  }
  return result;
}

export function mapDiagramMaterialOrders(prepared:PreparedOrigamiModel,previous:SampleMesh,orders:Row[]):Row[]{
  if(!orders.length)return [];
  const cp=prepared.fold.vertices_coords.map(p=>[p[0],-p[2]]);
  const children=new Map<number,Map<number,number>>();
  const triangleFor=new Map<number,number[]>();
  for(let t=0;t<prepared.indices.length/3;t++){
    const vertices=Array.from(prepared.indices.slice(t*3,t*3+3)).map(v=>cp[v]);
    const center=[0,1].map(k=>vertices.reduce((s,p)=>s+p[k],0)/3),parent=sampleDiagramMaterialPoint(previous,center),[p,q,r]=vertices;
    const winding=Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));
    const child=prepared.triangleSourceFaces![t],values=children.get(parent.face)??new Map<number,number>();values.set(child,winding*parent.winding);children.set(parent.face,values);
    if(!triangleFor.has(child))triangleFor.set(child,prepared.facesVertices[t]);
  }
  const rows=new Map<string,Row>();
  const normals=new Map<number,Point3>();
  const normal=(face:number)=>{
    let n=normals.get(face);
    if(!n){const [a,b,c]=triangleFor.get(face)!.map(v=>sampleDiagramMaterialPoint(previous,cp[v]).position);n=unit(cross(sub(b,a),sub(c,a)));normals.set(face,n);}
    return n;
  };
  for(const [a,b,sign] of orders)for(const [x] of children.get(a)??[])for(const [y,orientation] of children.get(b)??[]){
    if(x===y)continue;
    const row:Row=[x,y,sign*orientation],key=x<y?`${x}:${y}`:`${y}:${x}`,old=rows.get(key);
    if(!old){rows.set(key,row);continue;}
    // FOLD expresses a pair relative to the second material face's normal.
    // Coarsening a CP can recover the same contact in both index orders.
    const expected=old[0]===x?old[2]:-old[2]*Math.sign(dot(normal(x),normal(y)));
    if(expected!==row[2])throw Error('前后步骤的纸层关系不一致，无法连续衔接。');
  }
  return [...rows.values()];
}
