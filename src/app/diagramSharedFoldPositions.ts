import {materialOrientation} from '../core/materialTraceGeometry';
import type {FoldGraph,Point} from '../core/types';
import {applyRigidFoldTransform,type RigidFoldPoint3,type RigidFoldTransform3D} from '../core/rigidFoldGeometry';
import {binaryCoordinate,exactGcd,fractionNumber} from './modelExactArithmetic';

type Frame = readonly [bigint,bigint,bigint,bigint,bigint,bigint,bigint];
const closureLimitMm=1e-10;
const identity:Frame=[1n,0n,0n,0n,1n,0n,1n];

// Compose the parent isometry with reflection about the material hinge.
// All coordinates share a binary unit. Reduce after each composition so
// repeated square-grid folds have constant-size integer coefficients.
function across(frame:Frame,x:bigint,y:bigint,dx:bigint,dy:bigint):Frame{
  const [a,b,c,d,e,f,w]=frame;
  const norm=dx*dx+dy*dy,u=dx*dx-dy*dy,v=2n*dx*dy;
  const tx=(norm-u)*x-v*y,ty=(norm+u)*y-v*x;
  const next:Frame=[a*u+b*v,a*v-b*u,a*tx+b*ty+c*norm,d*u+e*v,d*v-e*u,d*tx+e*ty+f*norm,w*norm];
  const divisor=next.reduce(exactGcd);
  const [aa,bb,cc,dd,ee,ff,ww]=next;
  return [aa/divisor,bb/divisor,cc/divisor,dd/divisor,ee/divisor,ff/divisor,ww/divisor];
}

/** Evaluate fully folded material banks in one local frame. Only geometrically
 * coincident corners share a world position. Material vertices, faces, and
 * layer ordering keep their original indices, including on separate sheets. */
export function sharedFoldPositions(graph:FoldGraph,world:RigidFoldPoint3[],transforms:RigidFoldTransform3D[],angles:(number|null)[]){
  const faces=graph.faces_vertices!;
  const neighbors=faces.map(()=>[] as {face:number;edge:number;reflect:boolean}[]);
  for(const [edge,banks] of (graph.edges_faces??[]).entries()){
    const angle=graph.edges_foldAngle[edge]??angles[edge],measured=angles[edge];
    if(banks.length!==2||graph.edges_assignment[edge]==='B'||measured==null||angle==null||
      (angle!==0&&Math.abs(angle)!==180)||Math.abs(Math.abs(measured)-Math.abs(angle))>1e-7)continue;
    const [a,b]=banks;
    neighbors[a].push({face:b,edge,reflect:angle!==0});neighbors[b].push({face:a,edge,reflect:angle!==0});
  }
  if(!neighbors.some(list=>list.length))return world;
  const binary=graph.vertices_coords.map(p=>p.map(binaryCoordinate));
  let exponent=0;
  for(const point of binary)for(const [m,e] of point)if(m)exponent=Math.min(exponent,e);
  const coords=binary.map(point=>point.map(([m,e])=>m<<BigInt(e-exponent)));
  const frames:(Frame|undefined)[]=Array(faces.length);
  const aliases=Int32Array.from(world,(_,i)=>i);
  const representative=(v:number)=>{while(aliases[v]!==v){aliases[v]=aliases[aliases[v]];v=aliases[v];}return v;};
  const result=world.slice(),assigned=new Uint8Array(world.length);
  for(let root=0;root<faces.length;root++){
    if(frames[root]||!neighbors[root].length)continue;
    const equivalent=new Map<string,number>();
    const simple:number[]=[root],oblique:{face:number;frame:Frame;edge:number}[]=[];

    // Prefer a coordinate-axis or 45-degree hinge over a nearly parallel
    // imported CP edge when both constrain the same bank.
    const visit=(face:number,frame:Frame,edge:number,reflect:boolean)=>{
      const [s,t]=graph.edges_vertices[edge],[x,y]=coords[s],[xx,yy]=coords[t];
      if(x===xx&&y===yy)return;
      frames[face]=reflect?across(frame,x,y,xx-x,yy-y):frame;
      simple.push(face);
    };
    frames[root]=identity;
    for(let i=0,j=0;i<simple.length||j<oblique.length;){
      if(i===simple.length){
        const next=oblique[j++];
        if(!frames[next.face])visit(next.face,next.frame,next.edge,true);
        continue;
      }
      const face=simple[i++],frame=frames[face]!;

      for(const next of neighbors[face]){
        if(frames[next.face])continue;
        const [s,t]=graph.edges_vertices[next.edge],dx=coords[s][0]-coords[t][0],dy=coords[s][1]-coords[t][1];
        if(next.reflect&&dx&&dy&&dx!==dy&&dx!==-dy)oblique.push({...next,frame});
        else visit(next.face,frame,next.edge,next.reflect);
      }
    }
    for(const face of simple){
      const frame=frames[face]!;
      const [a,b,c,d,e,f,w]=frame;
      for(const ring of [faces[face],...(graph.faces_holes?.[face]??[])])for(const vertex of ring){
        const [x,y]=coords[vertex];
        const nx=a*x+b*y+c,ny=d*x+e*y+f;
        const material:Point=[fractionNumber(nx,w,exponent),fractionNumber(ny,w,exponent)];
        const p=applyRigidFoldTransform(transforms[root],material),q=world[vertex];
        // A conflicting closure may not authorize moving a material corner.
        if(Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])>closureLimitMm)continue;
        const divisor=exactGcd(exactGcd(nx,ny),w);
        const key=[nx/divisor,ny/divisor,w/divisor].join(':');
        const prior=equivalent.get(key);
        if(prior===undefined)equivalent.set(key,vertex);
        else{
          const left=representative(vertex),right=representative(prior);
          aliases[Math.max(left,right)]=Math.min(left,right);
        }
        if(!assigned[vertex]){result[vertex]=p;assigned[vertex]=1;}
      }
    }
  }
  for(let v=0;v<result.length;v++)result[v]=result[representative(v)];
  // A CP edge may be split at extra vertices on either bank. Parameterize
  // every straight run by its two end corners in the same direction. A
  // midpoint on a long edge then agrees with the other bank even when the
  // folded faces reached these corners through different hinge paths.
  const straight=result.slice();
  const compare=(a:RigidFoldPoint3,b:RigidFoldPoint3)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
  for(const [face,outer] of faces.entries())for(const ring of [outer,...(graph.faces_holes?.[face]??[])]){
    const corners:number[]=[];
    for(let i=0;i<ring.length;i++){
      const [x,y]=coords[ring[i]],[ax,ay]=coords[ring[(i+ring.length-1)%ring.length]],[bx,by]=coords[ring[(i+1)%ring.length]];
      if((x-ax)*(by-y)!==(y-ay)*(bx-x)||(x-ax)*(bx-x)+(y-ay)*(by-y)<=0n)corners.push(i);
    }
    if(corners.length<3)continue;
    for(const [k,start] of corners.entries()){
      const end=corners[(k+1)%corners.length];
      let left=ring[start],right=ring[end];
      if(compare(result[left],result[right])>0)[left,right]=[right,left];
      const axis=coords[left][0]===coords[right][0]?1:0;
      const a=coords[left][axis],span=coords[right][axis]-a;
      if(!span)continue;
      for(let i=(start+1)%ring.length;i!==end;i=(i+1)%ring.length){
        const v=ring[i],ratio=fractionNumber(coords[v][axis]-a,span);
        const pos=result[left].map((value,j)=>value+ratio*(result[right][j]-value)) as RigidFoldPoint3;
        const q=world[v];
        if(Math.hypot(pos[0]-q[0],pos[1]-q[1],pos[2]-q[2])<=closureLimitMm)straight[representative(v)]=pos;
      }
    }
  }
  // Check the final transitive alias as well as its individual hinge links.
  return straight.map((_,v)=>{
    const p=straight[representative(v)],q=world[v];
    return Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])<=closureLimitMm?p:q;
  });
}

/** Certify separation in world coordinates when a screen-depth difference
 * rounds to zero. An exactly planar bank is a witness only if every vertex
 * of the other bank is on one side, with at least one strictly on that side. */
export function exactMaterialSides(graph:FoldGraph,world:RigidFoldPoint3[]){
  const bits=world.map(point=>point.map(binaryCoordinate));
  let exponent=0;
  for(const point of bits)for(const [m,e] of point)if(m)exponent=Math.min(exponent,e);
  const coords=bits.map(point=>point.map(([m,e])=>m<<BigInt(e-exponent)));
  const vertices=(face:number)=>[...graph.faces_vertices![face],...(graph.faces_holes?.[face]??[]).flat()];
  const plane=(face:number)=>{
    const ids=vertices(face),a=ids[0],b=ids[1],p=coords[a],u=coords[b].map((v,i)=>v-p[i]);
    for(const c of ids.slice(2)){
      const sign=materialOrientation(graph.vertices_coords[a],graph.vertices_coords[b],graph.vertices_coords[c]);
      if(!sign)continue;
      const v=coords[c].map((x,i)=>x-p[i]);
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const offset=(id:number)=>n.reduce((sum,k,i)=>sum+k*(coords[id][i]-p[i]),0n);
      if(n.every(k=>!k)||ids.some(id=>offset(id)!==0n))return null;
      return (id:number)=>{const d=offset(id);return d>0n?sign:d<0n?-sign:0;};
    }
    return null;
  };
  const planes=new Map<number,ReturnType<typeof plane>>();
  return (a:number,b:number)=>{
    if(!planes.has(a))planes.set(a,plane(a));
    const side=planes.get(a);
    if(!side)return 0;
    let sign=0;
    for(const v of vertices(b)){
      const s=side(v);
      if(s&&sign&&s!==sign)return 0;
      if(s)sign=s;
    }
    return sign;
  };
}
