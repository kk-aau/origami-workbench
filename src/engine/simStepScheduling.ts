import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';

/** A drawing stroke may be split into many material hinges by intersections.
 * They are one scheduling unit when they are connected and on the same axis.
 * Screen-space coincidence alone never joins different pieces of material. */
export interface SimulationStepAxisGroup {creases:number[];vertices:number[];boundaryVertices:number[];precrease:boolean}

export function simulationStepAxisGroups(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation):SimulationStepAxisGroup[]{
  const ranges=new Map(animation.ranges.map(r=>[r.edge,r])),positions=animation.initialPositions;
  const active=prepared.creaseParams.flatMap((c,i)=>{const r=ranges.get(c.edge)!;return Math.abs(r.fromAngle-r.toAngle)>1e-8||r.viaAngle!==undefined&&Math.abs(r.fromAngle-r.viaAngle)>1e-8?[i]:[];});
  const parent=new Map(active.map(i=>[i,i]));
  const find=(i:number):number=>{const p=parent.get(i)!;if(p===i)return i;const root=find(p);parent.set(i,root);return root;};
  const point=(i:number)=>[positions[i*3],positions[i*3+1],positions[i*3+2]];
  const delta=(a:number[],b:number[])=>a.map((v,k)=>v-b[k]);
  const norm=(v:number[])=>Math.hypot(...v);
  const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const precrease=(i:number)=>ranges.get(prepared.creaseParams[i].edge)!.viaAngle!==undefined;
  const synonymous=(i:number,j:number)=>{
    const a=ranges.get(prepared.creaseParams[i].edge)!,b=ranges.get(prepared.creaseParams[j].edge)!;
    return Math.abs(a.fromAngle-b.fromAngle)<1e-8&&Math.abs(a.toAngle-b.toAngle)<1e-8&&(a.viaAngle===undefined?b.viaAngle===undefined:b.viaAngle!==undefined&&Math.abs(a.viaAngle-b.viaAngle)<1e-8);
  };
  const boundary=new Set<number>();
  // Face incidence is authoritative: boundary tags can be absent in imported
  // material meshes, and triangulation diagonals must not count as boundaries.
  const incidence=new Map<string,{a:number;b:number;count:number}>();
  for(let t=0;t<prepared.indices.length;t+=3)for(let k=0;k<3;k++){
    const a=prepared.indices[t+k],b=prepared.indices[t+(k+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
    const item=incidence.get(key);if(item)item.count++;else incidence.set(key,{a,b,count:1});
  }
  for(const item of incidence.values())if(item.count===1){boundary.add(item.a);boundary.add(item.b);}
  for(let a=0;a<active.length;a++)for(let b=a+1;b<active.length;b++){
    const i=active[a],j=active[b];if(!synonymous(i,j))continue;
    const ei=prepared.edgesVertices[prepared.creaseParams[i].edge],ej=prepared.edgesVertices[prepared.creaseParams[j].edge];
    if(!ei.some(v=>ej.includes(v)))continue;
    const d=delta(point(ei[1]),point(ei[0])),e=delta(point(ej[1]),point(ej[0])),dn=norm(d),en=norm(e);
    if(dn===0||en===0||norm(cross(d,e))>dn*en*1e-8)continue;
    const material=(v:number)=>[...prepared.fold.vertices_coords[v]];
    const md=delta(material(ei[1]),material(ei[0])),me=delta(material(ej[1]),material(ej[0]));
    if(norm(cross(md,me))>norm(md)*norm(me)*1e-8)continue;
    const x=find(i),y=find(j);if(x!==y)parent.set(Math.max(x,y),Math.min(x,y));
  }
  const grouped=new Map<number,number[]>();
  for(const i of active){const key=find(i),list=grouped.get(key)??[];list.push(i);grouped.set(key,list);}
  return [...grouped.values()].map(creases=>{
    const vertices=[...new Set(creases.flatMap(i=>prepared.edgesVertices[prepared.creaseParams[i].edge]))].sort((a,b)=>a-b);
    return {creases,vertices,boundaryVertices:vertices.filter(v=>boundary.has(v)),precrease:precrease(creases[0])};
  });
}

/** Deterministic largest-first combinations. A shared material boundary corner
 * is preferred over unrelated corners when parallelism is otherwise equal.
 * This is a bounded candidate order, not a claim of global optimality. */
export function simulationStepGroupCombinations(groups:SimulationStepAxisGroup[],remaining:number[],limit=512):number[][]{
  const candidates:number[][]=[];
  const priority=(ids:number[])=>{
    let shared=0;for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++)if(groups[ids[a]].boundaryVertices.some(v=>groups[ids[b]].boundaryVertices.includes(v)))shared++;
    return shared;
  };
  const compare=(a:number[],b:number[])=>{const p=priority(b)-priority(a);if(p)return p;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
  const small=remaining.length<=8;
  // Large steps have a bounded search, so reserve capacity for the useful
  // pairs and the complete single-axis fallback before sampling large sets.
  const pairs=remaining.flatMap((a,i)=>remaining.slice(i+1).map(b=>[a,b])).sort(compare);
  const low=small?[]:[...pairs.slice(0,Math.max(0,Math.floor((limit-remaining.length)/2))),...remaining.map(i=>[i])];
  const highLimit=limit-low.length;
  for(let size=remaining.length;size>=(small?1:3)&&candidates.length<highLimit;size--){
    const layer:number[][]=[];
    const layerLimit=small?highLimit:Math.max(1,Math.ceil(highLimit/Math.max(1,remaining.length-2)));
    const visit=(prefix:number[],next:number)=>{
      if(layer.length>=layerLimit)return;
      if(prefix.length===size){layer.push(prefix);return;}
      for(let j=next;j<=remaining.length-(size-prefix.length);j++)visit([...prefix,remaining[j]],j+1);
    };
    visit([],0);layer.sort(compare);
    candidates.push(...layer.slice(0,highLimit-candidates.length));
  }
  return [...candidates,...low];
}
