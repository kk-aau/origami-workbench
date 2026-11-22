import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';

type Row={vertices:number[];weights:number[];offset:number[]};
type ConstraintMesh=Pick<PreparedOrigamiModel,'edgesVertices'|'vertexCount'|'triangleSourceFaces'>&{
  creaseParams:Pick<PreparedOrigamiModel['creaseParams'][number],'edge'|'face1'|'face2'|'vertex1'|'vertex2'>[];
};

/** Keyframe zero retains the input doubles. Once integrated, both copies use
 * the same DOF. Interpolation can retain at most their original separation
 * plus rounding to the Float32 coordinates consumed by the renderer. */
function coincidentStepCoordinate(a:number,b:number,initialA:number,initialB:number){
  return Math.abs(a-b)<=Math.abs(initialA-initialB)+2**-23*Math.max(Math.abs(a),Math.abs(b),2**-126);
}

export function coincidentStepCoordinates(p:ArrayLike<number>,groups:readonly (readonly number[])[],seed:ArrayLike<number>){
  return groups.every(ids=>ids.every(v=>{
    for(let k=0;k<3;k++){
      const a=3*ids[0]+k,b=3*v+k;
      if(!coincidentStepCoordinate(p[a],p[b],seed[a],seed[b]))return false;
    }
    return true;
  }));
}

/** A closed material hinge has four coplanar vertices, with both opposing
 * tips on the same side of its axis. Their affine relation survives any
 * common translation, rotation or in-plane strain of the numerical panels. */
function planarRelation(mesh:ConstraintMesh,hinge:number,pose:readonly number[],pins:ReadonlySet<number>,closed:boolean):Row|undefined{
  const c=mesh.creaseParams[hinge],[a,b]=mesh.edgesVertices[c.edge];
  const relative=(v:number)=>[0,1,2].map(k=>pose[v*3+k]-pose[a*3+k]);
  const ab=relative(b),ac=relative(c.vertex1),ad=relative(c.vertex2);
  const dot=(u:number[],v:number[])=>u[0]*v[0]+u[1]*v[1]+u[2]*v[2];
  const norm2=dot(ab,ab);if(!norm2)return;
  const t=dot(ab,ac)/norm2,s=dot(ab,ad)/norm2;
  const h=ac.map((v,i)=>v-t*ab[i]),q=ad.map((v,i)=>v-s*ab[i]);
  const h2=dot(h,h);if(!h2)return;
  const v=dot(h,q)/h2,u=s-v*t;
  if(closed?v<=0:v>=0)return;
  const residual=Math.hypot(...q.map((value,i)=>value-v*h[i]));
  // The integrator returns Float32 positions. Test actual plane coincidence
  // at their local resolution before capturing any contact constraint.
  if(residual>8*2**-23*Math.sqrt(Math.max(norm2,h2,dot(ad,ad))))return;
  const ids=[a,b,c.vertex1,c.vertex2],coefficients=[u+v-1,-u,-v,1];
  const row:Row={vertices:[],weights:[],offset:[0,0,0]};
  for(let i=0;i<ids.length;i++){
    if(pins.has(ids[i]))continue;
    row.vertices.push(ids[i]);row.weights.push(coefficients[i]);
    for(let k=0;k<3;k++)row.offset[k]+=coefficients[i]*pose[ids[i]*3+k];
  }
  return row;
}

function jointProjection(count:number,relations:Iterable<Row>){
  const basis:Row[]=[];
  for(const relation of relations){
    const dense=new Float64Array(count),offset=[...relation.offset];
    relation.vertices.forEach((v,i)=>{dense[v]+=relation.weights[i];});
    const originalLength=Math.hypot(...dense);
    if(originalLength<=Number.EPSILON*relation.weights.reduce((sum,w)=>sum+Math.abs(w),0)*16)continue;
    // Orthogonalise all simultaneously active folds, including chains and
    // cycles. Carry the affine offsets when a later contact has a new seed.
    for(const row of basis){
      let overlap=0;
      for(let j=0;j<row.vertices.length;j++)overlap+=dense[row.vertices[j]]*row.weights[j];
      if(!overlap)continue;
      for(let j=0;j<row.vertices.length;j++)dense[row.vertices[j]]-=overlap*row.weights[j];
      for(let k=0;k<3;k++)offset[k]-=overlap*row.offset[k];
    }
    const magnitude=Math.hypot(...dense);
    if(magnitude<=Number.EPSILON*count*originalLength)continue;
    const row:Row={vertices:[],weights:[],offset:offset.map(x=>x/magnitude)};
    for(let i=0;i<count;i++){
      const w=dense[i]/magnitude;if(!w)continue;
      row.vertices.push(i);row.weights.push(w);
    }
    basis.push(row);
  }
  if(!basis.length)return;
  return (positions:number[])=>{
    for(const row of basis){
      let x=-row.offset[0],y=-row.offset[1],z=-row.offset[2];
      for(let j=0;j<row.vertices.length;j++){
        const i=3*row.vertices[j],w=row.weights[j];
        x+=w*positions[i];y+=w*positions[i+1];z+=w*positions[i+2];
      }
      for(let j=0;j<row.vertices.length;j++){
        const i=3*row.vertices[j],w=row.weights[j];
        positions[i]-=w*x;positions[i+1]-=w*y;positions[i+2]-=w*z;
      }
    }
  };
}

export function createClosedHingeTracker(mesh:ConstraintMesh,pins:ReadonlySet<number>,rigidPanels:boolean,groups:readonly number[][]=[]){
  const leader=new Map<number,number>(),fixed=new Set(pins);
  for(const group of groups){
    for(const v of group)leader.set(v,group[0]);
    if(group.some(v=>pins.has(v)))for(const v of group)fixed.add(v);
  }
  const active=new Map<number,Row>(),seams=new Map<number,Row>();
  let project:ReturnType<typeof jointProjection>;
  const mergedPanels=new Set<number>();
  if(groups.length&&rigidPanels&&mesh.triangleSourceFaces){
    for(const c of mesh.creaseParams){
      const face=mesh.triangleSourceFaces[c.face1];
      if(face===mesh.triangleSourceFaces[c.face2]&&[...mesh.edgesVertices[c.edge],c.vertex1,c.vertex2].some(v=>leader.has(v)))mergedPanels.add(face);
    }
  }
  let initialized=false;
  return (closed:ReadonlySet<number>,seed:readonly number[])=>{
    let changed=false;
    for(const edge of active.keys())if(!closed.has(edge)){active.delete(edge);changed=true;}
    for(const i of closed){
      if(active.has(i))continue;
      // With both tips on the same integration node the closed-hinge
      // relation is already an identity. Normalising its rounded residual
      // would impose a spurious constraint on the two axis vertices.
      const {vertex1,vertex2}=mesh.creaseParams[i];
      if((leader.get(vertex1)??vertex1)===(leader.get(vertex2)??vertex2))continue;
      const row=planarRelation(mesh,i,seed,fixed,true);
      if(row){active.set(i,row);changed=true;}
    }
    if(!changed&&(initialized||!mergedPanels.size))return project;
    initialized=true;
    const source=mesh.triangleSourceFaces;
    if(rigidPanels&&source){
      // Keep a merged rigid polygon planar even when another sheet uses the
      // other diagonal. The affine constraint also holds between keyframes.
      const touched=new Set(mergedPanels);
      for(const i of active.keys()){
        const c=mesh.creaseParams[i];touched.add(source[c.face1]);touched.add(source[c.face2]);
      }
      mesh.creaseParams.forEach((c,i)=>{
        if(source[c.face1]!==source[c.face2]||!touched.has(source[c.face1])){seams.delete(i);return;}
        if(!seams.has(i)){
          const row=planarRelation(mesh,i,seed,fixed,false);
          if(row)seams.set(i,row);
        }
      });
    }
    const rows=[...active.values(),...seams.values()];
    const reduced=jointProjection(mesh.vertexCount,leader.size
      ?rows.map(row=>({...row,vertices:row.vertices.map(v=>leader.get(v)??v)})):rows);
    if(reduced&&groups.length){
      project=positions=>{
        reduced(positions);
        for(const group of groups)for(const v of group)for(let k=0;k<3;k++)positions[3*v+k]=positions[3*group[0]+k];
      };
    }else project=reduced;
    return project;
  };
}

/** An authored opening releases the fold for its entire moving interval, even
 * when its start and end targets coincide (open-and-return). */
export function closedHingesDuring(animation:Pick<SimulationStepAnimation,'ranges'|'timings'>,start:number,end:number):Set<number>{
  const result=new Set<number>(),timings=new Map(animation.timings?.map(t=>[t.edge,t]));
  animation.ranges.forEach((r,i)=>{
    const timing=timings.get(r.edge),a=timing?.start??0,b=timing?.end??1;
    const mid=(a+b)/2;
    if(end<=a){if(Math.abs(r.fromAngle)===180)result.add(i);return;}
    if(start>=b){if(Math.abs(r.toAngle)===180)result.add(i);return;}
    if(r.viaAngle===undefined){
      if(Math.abs(r.fromAngle)===180&&r.fromAngle===r.toAngle)result.add(i);
    }else{
      if(Math.abs(r.viaAngle)===180&&(start>=mid||r.fromAngle===r.viaAngle)&&(end<=mid||r.toAngle===r.viaAngle))result.add(i);
    }
  });
  return result;
}

