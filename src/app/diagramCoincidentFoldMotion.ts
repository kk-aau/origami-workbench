import {polygonArea} from '../core/geometry';
import {solveRigidFoldGeometry,type RigidFoldPoint3} from '../core/rigidFoldGeometry';
import type {FoldGraph,Point} from '../core/types';

type Line={a:Point;b:Point};
type Turn={axis:number;angle:number};
type Word=Turn[];
const sub=(a:readonly number[],b:readonly number[])=>a.map((v,i)=>v-b[i]);
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((n,v,i)=>n+v*b[i],0);
const norm=(a:readonly number[])=>Math.hypot(...a);

/** Sufficient (not heuristic) equality of continuous hinge motions. A face's
 * motion is a word of rotations about its INITIAL world-space axes, each with
 * angle t * delta. Equal words give equal rigid motion for every t, including
 * opposite-sign material folds and 0→90 versus 90→180. Only adjacent coaxial
 * turns commute here; equal endpoints alone never establish equal motion.
 * A non-closing cycle, unknown angle or unsupported topology keeps all ink. */
export function coincidentFoldMotion(before:FoldGraph,after:FoldGraph,eps:number):{equivalent:(a:Line,b:Line)=>boolean}|null {
  const points=after.vertices_coords,faces=after.faces_vertices;
  if(!faces?.length||after.faces_holes?.some(r=>r.length))return null;
  const interval=(line:Line,other:Line):[number,number]|null=>{
    const d=sub(line.b,line.a),length=norm(d);if(length<=eps)return null;
    const q=[other.a,other.b].map(p=>sub(p,line.a));
    if(q.some(p=>Math.abs(p[0]*d[1]-p[1]*d[0])>eps*length))return null;
    const ts=q.map(p=>dot(p,d)/(length*length)).sort((a,b)=>a-b);
    const lo=Math.max(0,ts[0]),hi=Math.min(1,ts[1]);return (hi-lo)*length>eps?[lo,hi]:null;
  };
  const oldLines=before.edges_vertices.map(([a,b],i)=>({a:before.vertices_coords[a],b:before.vertices_coords[b],angle:before.edges_foldAngle?.[i],assignment:before.edges_assignment[i]}));
  const initial:(number|null)[]=[],targets:(number|null)[]=after.edges_foldAngle??[];
  for(const [a,b] of after.edges_vertices){
    const line={a:points[a],b:points[b]},covered:{lo:number;hi:number;angle:number}[]=[];
    for(const old of oldLines){
      const overlap=interval(line,old);if(!overlap)continue;
      const angle=old.assignment==='B'||old.assignment==='F'?0:old.angle;
      if(typeof angle!=='number'||!Number.isFinite(angle))return null;
      covered.push({lo:overlap[0],hi:overlap[1],angle});
    }
    const moving=covered.filter(p=>Math.abs(p.angle)>1e-7);
    if(!moving.length){initial.push(0);continue;}
    const angle=moving[0].angle;let end=0;
    for(const part of covered.sort((a,b)=>a.lo-b.lo)){
      if(part.lo>end+eps/norm(sub(line.b,line.a))||Math.abs(part.angle-angle)>1e-7)return null;
      end=Math.max(end,part.hi);
    }
    if(end<1-eps/norm(sub(line.b,line.a)))return null;
    initial.push(angle);
  }
  if(targets.length!==initial.length||targets.some((a,i)=>a===null&&after.edges_assignment[i]!=='B'&&after.edges_assignment[i]!=='F'))return null;
  // The target graph retains new crease subdivisions while reconstructing the
  // old pose. Its assignments must describe OLD angles for solver validation.
  const oldGraph={...after,edges_assignment:initial.map((a,i)=>after.edges_assignment[i]==='B'?'B':a!<0?'M':a!>0?'V':'F') as FoldGraph['edges_assignment']};
  const solved=solveRigidFoldGeometry(oldGraph,{edgesFoldAngle:initial});
  if(solved.status!=='ready')return null;
  const axes:{origin:RigidFoldPoint3;unit:number[]}[]=[],edgeAxes:{axis:number;sign:number}[]=[];
  for(const [a,b] of after.edges_vertices){
    const origin=solved.vertices[a],delta=sub(solved.vertices[b],origin),length=norm(delta);if(length<=eps)return null;
    const unit=delta.map(v=>v/length);
    let axis=axes.findIndex(other=>norm(sub(unit,other.unit.map(v=>v*(dot(unit,other.unit)<0?-1:1))))<1e-10&&norm(sub(sub(origin,other.origin),other.unit.map(v=>v*dot(sub(origin,other.origin),other.unit))))<=eps);
    if(axis<0){axis=axes.length;axes.push({origin,unit});}
    edgeAxes.push({axis,sign:dot(unit,axes[axis].unit)<0?-1:1});
  }
  const uses=after.edges_vertices.map(()=>[] as {face:number;direction:number}[]),lookup=new Map(after.edges_vertices.map(([a,b],i)=>[[Math.min(a,b),Math.max(a,b)].join(','),i]));
  if(lookup.size!==after.edges_vertices.length)return null;
  for(const [face,ring] of faces.entries()){
    const winding=Math.sign(polygonArea(ring.map(v=>points[v])));
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],edge=lookup.get([Math.min(a,b),Math.max(a,b)].join(','));if(edge===undefined)return null;
      uses[edge].push({face,direction:(after.edges_vertices[edge][0]===a?1:-1)*winding});
    }
  }
  const neighbors=faces.map(()=>[] as {face:number;edge:number;direction:number}[]);
  for(const [edge,owners] of uses.entries()){
    if(owners.length>2)return null;
    if(owners.length!==2)continue;
    const [a,b]=owners;neighbors[a.face].push({...b,edge});neighbors[b.face].push({...a,edge});
  }
  const append=(word:Word,axis:number,angle:number):Word=>{
    if(Math.abs(angle)<=1e-7)return word;
    const next=word.map(t=>({...t})),last=next.at(-1);
    if(last?.axis===axis){last.angle+=angle;if(Math.abs(last.angle)<=1e-7)next.pop();}
    else next.push({axis,angle});return next;
  };
  const same=(a:Word,b:Word)=>a.length===b.length&&a.every((turn,i)=>turn.axis===b[i].axis&&Math.abs(turn.angle-b[i].angle)<=1e-7);
  const words:(Word|undefined)[]=faces.map(()=>undefined),queue=[solved.startingFace];words[queue[0]]=[];
  for(let i=0;i<queue.length;i++)for(const next of neighbors[queue[i]]){
    const axis=edgeAxes[next.edge],delta=(targets[next.edge]??0)-initial[next.edge]!;
    const word=append(words[queue[i]]!,axis.axis,axis.sign*next.direction*delta);
    if(words[next.face]){if(!same(words[next.face]!,word))return null;}
    else{words[next.face]=word;queue.push(next.face);}
  }
  if(queue.length!==faces.length)return null;
  const edgeFor=(line:Line)=>after.edges_vertices.findIndex(([a,b],edge)=>{
    if(uses[edge].length!==2||Math.abs((targets[edge]??0)-initial[edge]!)<=1e-7)return false;
    const overlap=interval(line,{a:points[a],b:points[b]});return overlap&&overlap[0]*norm(sub(line.b,line.a))<=eps&&(1-overlap[1])*norm(sub(line.b,line.a))<=eps;
  });
  return {equivalent:(a,b)=>{
    const left=edgeFor(a),right=edgeFor(b);if(left<0||right<0||edgeAxes[left].axis!==edgeAxes[right].axis)return false;
    const [l0,l1]=uses[left].map(o=>words[o.face]!),[r0,r1]=uses[right].map(o=>words[o.face]!);
    return same(l0,r0)&&same(l1,r1)||same(l0,r1)&&same(l1,r0);
  }};
}
