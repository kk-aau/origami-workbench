import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';
import {simulationStepLayerOrderAt} from './simStepLayerTimeline';
import {reliablePlane,sameTrianglePlane,trianglePlaneLookup,vectorDot,type Vector} from './simTrianglePlane';
import {trianglesOverlap} from './simSurfaceLayers';
import {faceRelationComponents} from '../core/faceRelationComponents';

type Point=[number,number];
const layerGap=2e-5;
/** Blender resolves ties by physical depth. Keep one material vertex bank
 * per source paper face for the whole clip. Only proved coplanar contacts
 * receive display spacing; the simulated positions stay immutable. */
export function blenderLayerMesh(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation){
  const timeline=animation.layerTimeline;
  if(!timeline?.some(frame=>frame.faceOrders.length))return null;
  const sources=prepared.triangleSourceFaces??prepared.facesVertices.map((_,f)=>f);
  const panels=new Map<number,number[]>(),banks=new Map<number,Map<number,number>>();
  const vertices:number[]=[],indices=new Uint32Array(prepared.indices.length);
  for(let f=0;f<sources.length;f++){
    const id=sources[f],faces=panels.get(id)??[],bank=banks.get(id)??new Map<number,number>();
    faces.push(f);panels.set(id,faces);banks.set(id,bank);
    for(let k=0;k<3;k++){
      const v=prepared.indices[f*3+k];let copy=bank.get(v);
      if(copy===undefined){copy=vertices.length;vertices.push(v);bank.set(v,copy);}
      indices[f*3+k]=copy;
    }
  }
  function positionsAt(p:Float32Array,progress:number):Float32Array{
    const out=new Float32Array(vertices.length*3);
    vertices.forEach((v,i)=>{out[i*3]=p[v*3];out[i*3+1]=p[v*3+1];out[i*3+2]=p[v*3+2];});
    const rows=simulationStepLayerOrderAt(prepared,animation,timeline!,progress,p);
    if(!rows.length)return out;
    const plane=trianglePlaneLookup(p,prepared.indices),groups=new Map<number,Set<number>>();
    const neighbours=(f:number)=>{let set=groups.get(f);if(!set){set=new Set();groups.set(f,set);}return set;};
    const pairs:Array<[number,number,Vector,number]>=[];
    for(const [a,b,sign] of rows){
      const left=panels.get(a),right=panels.get(b);if(!left||!right)continue;
      let normal:Vector|undefined;
      // Do not lift faces that merely touch along an edge, or faces that
      // inherited a relation but have since opened or slid apart.
      outer:for(const i of left)for(const j of right){
        const x=plane(i),y=plane(j);
        if(!reliablePlane(x)||!reliablePlane(y)||!sameTrianglePlane(x,y))continue;
        const drop=y.normal.reduce((best,value,k)=>Math.abs(value)>Math.abs(y.normal[best])?k:best,0);
        const project=(v:Vector):Point=>[v[(drop+1)%3],v[(drop+2)%3]];
        if(!trianglesOverlap(x.vertices.map(project),y.vertices.map(project),1e-10))continue;
        normal=y.normal;break outer;
      }
      if(!normal)continue;
      neighbours(a).add(b);neighbours(b).add(a);pairs.push([a,b,normal,sign]);
    }
    const visited=new Set<number>();
    let approach:Float32Array|undefined;
    for(const seed of groups.keys()){
      if(visited.has(seed))continue;
      const members=[seed];visited.add(seed);
      for(const id of members)for(const other of groups.get(id)!)if(!visited.has(other)){visited.add(other);members.push(other);}
      const ids=new Set(members),contacts=pairs.filter(([a])=>ids.has(a));
      const first=contacts[0][2],length=Math.hypot(...first),axis=first.map(n=>n/length) as Vector;
      const localId=new Map(members.map((id,index)=>[id,index]));
      const edges:Array<[number,number]>=[];
      for(const [a,b,n,sign] of contacts){
        const alignment=vectorDot(n,axis)/Math.hypot(...n);
        if(Math.abs(alignment)<.99999)break;
        const [below,above]=sign*alignment>0?[b,a]:[a,b];
        edges.push([localId.get(below)!,localId.get(above)!]);
      }
      if(edges.length!==contacts.length)continue;
      // Global cycles can lie below an unambiguous exterior cover. Collapse
      // only their members, retaining the rest of the certified order.
      const {component,sizes}=faceRelationComponents(members.length,edges,new Uint8Array(edges.length).fill(2));
      const next=Array.from(sizes,()=>new Set<number>()),rank=new Uint32Array(sizes.length);
      for(const [below,above] of edges){
        const from=component[below],to=component[above];
        if(from!==to)next[from].add(to);
      }
      for(let id=0;id<next.length;id++)for(const to of next[id])rank[to]=Math.max(rank[to],rank[id]+1);
      const middle=Math.max(...rank)/2;
      // A numerical endpoint uses the last approach to prove local contact
      // order. Its normal displacement varies over a face, which can resolve
      // an interleaved stack even when no single rigid rank exists. Reapply
      // the preceding pose's existing layers for banks that moved together.
      const previous=progress===1?animation.dynamic?.keyframes.at(-2):undefined;
      if(previous&&previous.progress<1&&sizes.some(size=>size>1)){
        approach??=positionsAt(new Float32Array(previous.positions),previous.progress);
      }
      const contactDepth=(copy:number,source:number)=>axis.reduce((sum,n,k)=>sum+n*(approach![3*copy+k]-p[3*source+k]),0);
      const extent=new Float64Array(sizes.length);
      if(approach)for(const [local,f] of members.entries()){
        const id=component[local];if(sizes[id]===1)continue;
        for(const [source,copy] of banks.get(f)!)extent[id]=Math.max(extent[id],Math.abs(contactDepth(copy,source)));
      }
      for(const [local,f] of members.entries()){
        const id=component[local],shift=(rank[id]-middle)*layerGap;
        for(const [source,copy] of banks.get(f)!){
          // Stay inside this rank's interval even at the furthest corner.
          const detail=extent[id]>1e-12?contactDepth(copy,source)/extent[id]*layerGap*.45:0;
          for(let k=0;k<3;k++)out[copy*3+k]+=(shift+detail)*axis[k];
        }
      }
    }
    return out;
  }
  return {vertices,indices,positionsAt};
}
