import type {SimulationStepCollisionPair} from './simStepCollision';
type V=[number,number,number];
type Support={vertices:number[];weights:number[];point:V};
type Constraint={weights:Map<number,number>;normal:V;gap:number};
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],clamp=(x:number)=>Math.max(0,Math.min(1,x));
const point=(p:ArrayLike<number>,v:number):V=>[p[v*3],p[v*3+1],p[v*3+2]];
function support(vertices:number[],weights:number[],positions:ArrayLike<number>):Support{
  const value:V=[0,0,0];vertices.forEach((v,i)=>{for(let k=0;k<3;k++)value[k]+=positions[v*3+k]*weights[i];});return {vertices,weights,point:value};
}
/** Closest point on a closed triangle, including its actual edge/vertex support. */
function onTriangle(p:V,ids:number[],positions:ArrayLike<number>):Support{
  const [a,b,c]=ids.map(v=>point(positions,v)),ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0&&d2<=0)return support(ids,[1,0,0],positions);
  const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return support(ids,[0,1,0],positions);
  const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3);return support(ids,[1-v,v,0],positions);}
  const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return support(ids,[0,0,1],positions);
  const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6);return support(ids,[1-w,0,w],positions);}
  const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0){const w=(d4-d3)/((d4-d3)+(d5-d6));return support(ids,[0,1-w,w],positions);}
  const inverse=1/(va+vb+vc),v=vb*inverse,w=vc*inverse;return support(ids,[1-v-w,v,w],positions);
}
function onEdges(a:number[],b:number[],positions:ArrayLike<number>):[Support,Support]{
  const p=point(positions,a[0]),q=point(positions,b[0]),d1=sub(point(positions,a[1]),p),d2=sub(point(positions,b[1]),q),r=sub(p,q),aa=dot(d1,d1),ee=dot(d2,d2),bb=dot(d1,d2),cc=dot(d1,r),ff=dot(d2,r),den=aa*ee-bb*bb;
  let s=den>Number.EPSILON*aa*ee*16?clamp((bb*ff-cc*ee)/den):0,t=(bb*s+ff)/ee;
  if(t<0){t=0;s=clamp(-cc/aa);}else if(t>1){t=1;s=clamp((bb-cc)/aa);}
  return [support(a,[1-s,s],positions),support(b,[1-t,t],positions)];
}

export interface ContactResponseMesh {indices:ArrayLike<number>;edgesVertices:readonly (readonly number[])[];restPositions:ArrayLike<number>}
/** Frictionless unilateral contact projection. Only the approaching normal
 * displacement is removed; tangent displacement and unconstrained regions
 * retain the solver candidate. CCD still has final authority over the result. */
export function projectSimulationContactMotion(mesh:ContactResponseMesh,first:ArrayLike<number>,candidate:ArrayLike<number>,pairs:readonly SimulationStepCollisionPair[],fixed:ReadonlySet<number>):Float32Array|null{
  const positions=new Float64Array(candidate),constraints:Constraint[]=[],margin=2e-7;
  for(const pair of pairs){
    const a=[0,1,2].map(k=>mesh.indices[pair.triangles[0]*3+k]),b=[0,1,2].map(k=>mesh.indices[pair.triangles[1]*3+k]);
    const motion=Math.max(...[...a,...b].map(v=>Math.hypot(...sub(point(candidate,v),point(first,v))))),features:[Support,Support][]=[];
    for(const v of a)features.push([support([v],[1],first),onTriangle(point(first,v),b,first)]);
    for(const v of b)features.push([onTriangle(point(first,v),a,first),support([v],[1],first)]);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)features.push(onEdges([a[i],a[(i+1)%3]],[b[j],b[(j+1)%3]],first));
    for(const [pa,pb]of features){
      const delta=sub(pb.point,pa.point),gap=Math.hypot(...delta);if(!Number.isFinite(gap)||gap<1e-12||gap>2*motion+margin)continue;
      const weights=new Map<number,number>();pa.vertices.forEach((v,i)=>weights.set(v,(weights.get(v)??0)-pa.weights[i]));pb.vertices.forEach((v,i)=>weights.set(v,(weights.get(v)??0)+pb.weights[i]));
      if([...weights].every(([v,w])=>fixed.has(v)||Math.abs(w)<1e-12))continue;
      constraints.push({weights,normal:delta.map(v=>v/gap) as V,gap});
    }
  }
  if(!constraints.length)return null;
  const allowed=mesh.edgesVertices.map(([a,b])=>{
    const rest=Math.hypot(...sub(point(mesh.restPositions,a),point(mesh.restPositions,b))),prior=Math.hypot(...sub(point(first,a),point(first,b))),next=Math.hypot(...sub(point(candidate,a),point(candidate,b))),error=Math.max(Math.abs(prior-rest),Math.abs(next-rest))+.002*rest;
    return {lo:Math.max(rest*.5,rest-error),hi:rest+error};
  });
  let changed=false;
  for(let pass=0;pass<8;pass++){
    for(const {weights,normal,gap}of constraints){
      let travel=0,den=0;for(const [v,w]of weights){travel+=w*dot(sub(point(positions,v),point(first,v)),normal);if(!fixed.has(v))den+=w*w;}
      const correction=margin-gap-travel;if(correction<=0||den<=1e-15)continue;
      for(const [v,w]of weights)if(!fixed.has(v))for(let k=0;k<3;k++)positions[v*3+k]+=correction/den*w*normal[k];changed=true;
    }
    // Limit additional axial strain caused by the contact projection, without
    // changing the solver's existing material error or moving fixed vertices.
    mesh.edgesVertices.forEach(([a,b],e)=>{
      const delta=sub(point(positions,b),point(positions,a)),length=Math.hypot(...delta),target=Math.max(allowed[e].lo,Math.min(allowed[e].hi,length)),wa=fixed.has(a)?0:1,wb=fixed.has(b)?0:1;
      if(length===target||length<=1e-15||wa+wb===0)return;const correction=(length-target)/length/(wa+wb);
      for(let k=0;k<3;k++){positions[a*3+k]+=wa*correction*delta[k];positions[b*3+k]-=wb*correction*delta[k];}
    });
  }
  if(!changed||Array.from(positions).some(v=>!Number.isFinite(v)))return null;
  for(const v of fixed)for(let k=0;k<3;k++)positions[v*3+k]=candidate[v*3+k];
  for(let e=0;e<mesh.edgesVertices.length;e++){const [a,b]=mesh.edgesVertices[e],length=Math.hypot(...sub(point(positions,b),point(positions,a)));if(length<allowed[e].lo-1e-7||length>allowed[e].hi+1e-7)return null;}
  for(let t=0;t<mesh.indices.length;t+=3){
    const [a,b,c]=[mesh.indices[t],mesh.indices[t+1],mesh.indices[t+2]],area=(p:ArrayLike<number>)=>Math.hypot(...cross(sub(point(p,b),point(p,a)),sub(point(p,c),point(p,a)))),rest=area(mesh.restPositions),limit=Math.max(Math.abs(area(first)-rest),Math.abs(area(candidate)-rest))+.004*rest;
    if(!Number.isFinite(rest)||rest<=0||Math.abs(area(positions)-rest)>limit+1e-10)return null;
  }
  return new Float32Array(positions);
}
