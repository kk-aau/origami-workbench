import earcut from 'earcut';
import type {DiagramPose} from './diagramProject';
import {modelFaceRings} from './modelRings';
import {projectDiagramSpatialPoint,type DiagramSpatialPose} from './diagramSpatialPose';

type Vec3=[number,number,number];
export interface DiagramOrbitMesh {
  /** Normalized physical coordinates, followed by the physical material normal. */
  triangles:Float32Array;lines:Float32Array;
  center:Vec3;radius:number;
}

/** Triangulate in each rigid face's original material plane, never in a camera
 * projection (which may legitimately collapse a ninety-degree face to a line). */
export function diagramOrbitMesh(pose:DiagramPose):DiagramOrbitMesh {
  const spatial=pose.spatial;if(!spatial)throw Error('当前纸面没有立体姿态。');
  const hidden=new Set(pose.hiddenFaces??[]),visible=new Set<number>();
  pose.result.geometry.faces.forEach((_,face)=>{if(!hidden.has(face))modelFaceRings(pose.result,face).forEach(ring=>ring.forEach(v=>visible.add(v)));});
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const v of visible)spatial.vertices[v].forEach((n,k)=>{min[k]=Math.min(min[k],n);max[k]=Math.max(max[k],n);});
  const center=(visible.size?min.map((n,k)=>(n+max[k])/2):[0,0,0]) as Vec3;
  let radius=1;for(const v of visible)radius=Math.max(radius,Math.hypot(...spatial.vertices[v].map((n,k)=>n-center[k])));
  const normalized=(v:number)=>spatial.vertices[v].map((n,k)=>(n-center[k])/radius);
  const triangles:number[]=[],lines:number[]=[],edgeOwners=new Map<string,number[]>();
  const key=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(':');
  pose.result.geometry.faces.forEach((_,face)=>{
    if(hidden.has(face))return;
    const rings=modelFaceRings(pose.result,face),ids=rings.flat(),t=spatial.faceTransforms[face],r=t.rotation;
    const points=ids.map(v=>{const p=spatial.vertices[v].map((n,k)=>n-t.translation[k]);return [r[0]*p[0]+r[3]*p[1]+r[6]*p[2],r[1]*p[0]+r[4]*p[1]+r[7]*p[2]];});
    const holes:number[]=[];let count=rings[0].length;for(const ring of rings.slice(1)){holes.push(count);count+=ring.length;}
    const indices=earcut(points.flat(),holes,2);
    for(let i=0;i<indices.length;i+=3){
      let [a,b,c]=indices.slice(i,i+3);const p=points[a],q=points[b],s=points[c];
      if((q[0]-p[0])*(s[1]-p[1])-(q[1]-p[1])*(s[0]-p[0])<0)[b,c]=[c,b];
      for(const local of [a,b,c])triangles.push(...normalized(ids[local]),r[2],r[5],r[8]);
    }
    for(const ring of rings)ring.forEach((a,i)=>{const k=key(a,ring[(i+1)%ring.length]),owners=edgeOwners.get(k)??[];owners.push(face);edgeOwners.set(k,owners);});
  });
  const graph=pose.result.geometry.graph;
  graph?.edges_vertices.forEach(([a,b],edge)=>{
    if(!edgeOwners.has(key(a,b)))return;
    const assignment=graph.edges_assignment[edge],angle=spatial.measuredAngles[edge];
    if(assignment!=='B'&&!(typeof angle==='number'&&Math.abs(angle)>1e-5&&['M','V'].includes(assignment)))return;
    lines.push(...normalized(a),...normalized(b));
  });
  return {triangles:new Float32Array(triangles),lines:new Float32Array(lines),center,radius};
}

/** Column-major, camera-space rotation, including the drawing's back side and
 * planar rotation. Translation drops out because the orbit is centered on the
 * same physical material point for every view. */
export function diagramOrbitMatrix(camera:DiagramSpatialPose['camera'],back=false,rotation=0):Float32Array {
  const o=projectDiagramSpatialPoint([0,0,0],camera),theta=rotation*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta),sign=back?-1:1;
  return new Float32Array([[1,0,0],[0,1,0],[0,0,1]].flatMap(axis=>{
    const p=projectDiagramSpatialPoint(axis,camera),x=(p[0]-o[0])*sign,y=p[1]-o[1],z=(p[2]-o[2])*sign;
    return [c*x-s*y,s*x+c*y,z];
  }));
}

export function orbitCameraFromDrag(camera:DiagramSpatialPose['camera'],dx:number,dy:number):DiagramSpatialPose['camera'] {
  const wrap=(degrees:number)=>((degrees+180)%360+360)%360-180;
  return {...camera,yaw:wrap(camera.yaw+dx*.4),elevation:wrap(camera.elevation-dy*.35)};
}
