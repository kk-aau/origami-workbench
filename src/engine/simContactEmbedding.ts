/** Fast sufficient certificate for a complete affine paper motion. A consistent
 * triangulated disk whose projected triangles stay strictly oriented and whose
 * boundary stays simple is embedded throughout the interval. Failure only means
 * that this projection cannot prove it; callers must use their full CCD path. */
export type ContactEmbeddingVerifier=(first:ArrayLike<number>,last:ArrayLike<number>,tolerance?:number,maxPairs?:number)=>boolean;
type Edge=[number,number];
type Topology={triangles:number[];boundary:Edge[];maxVertex:number};
type Box={edge:Edge;minX:number;maxX:number;minY:number;maxY:number};

function diskTopology(indices:ArrayLike<number>):Topology|null{
  if(!Number.isSafeInteger(indices.length)||!indices.length||indices.length%3)return null;
  const triangles=Array.from(indices),edges=new Map<string,Edge[]>(),links=new Map<number,Edge[]>(),used=new Set<number>();
  for(let f=0;f<triangles.length;f+=3){
    const t=triangles.slice(f,f+3);if(t.some(v=>!Number.isSafeInteger(v)||v<0)||new Set(t).size!==3)return null;
    for(let k=0;k<3;k++){
      const a=t[k],b=t[(k+1)%3],c=t[(k+2)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
      const owners=edges.get(key)??[];owners.push([a,b]);if(owners.length>2)return null;edges.set(key,owners);
      const link=links.get(a)??[];link.push([b,c]);links.set(a,link);used.add(a);
    }
  }
  const boundary:Edge[]=[];
  for(const rows of edges.values()){
    if(rows.length===1)boundary.push(rows[0]);
    else if(rows[0][0]!==rows[1][1]||rows[0][1]!==rows[1][0])return null;
  }
  if(used.size-edges.size+triangles.length/3!==1||boundary.length<3)return null;
  const next=new Map<number,number>(),incoming=new Set<number>();
  for(const [a,b]of boundary){if(next.has(a)||incoming.has(b))return null;next.set(a,b);incoming.add(b);}
  const visited=new Set<number>(),start=boundary[0][0];let vertex=start;
  do{if(visited.has(vertex)||!next.has(vertex))return null;visited.add(vertex);vertex=next.get(vertex)!;}while(vertex!==start);
  if(visited.size!==boundary.length)return null;
  // Euler count alone does not exclude disconnected pieces or pinched vertices.
  const graph=new Map<number,number[]>();
  for(const rows of edges.values()){const [a,b]=rows[0];graph.set(a,[...graph.get(a)??[],b]);graph.set(b,[...graph.get(b)??[],a]);}
  const reached=new Set<number>(),todo=[start];
  while(todo.length){const v=todo.pop()!;if(reached.has(v))continue;reached.add(v);todo.push(...graph.get(v)!);}
  if(reached.size!==used.size)return null;
  for(const [v,pairs]of links){
    const adjacency=new Map<number,number[]>();
    for(const [a,b]of pairs){adjacency.set(a,[...adjacency.get(a)??[],b]);adjacency.set(b,[...adjacency.get(b)??[],a]);}
    const degrees=[...adjacency.values()].map(row=>row.length);
    if(degrees.some(n=>n<1||n>2)||degrees.filter(n=>n===1).length!==(next.has(v)?2:0))return null;
    const seen=new Set<number>(),pending=[adjacency.keys().next().value!];
    while(pending.length){const n=pending.pop()!;if(seen.has(n))continue;seen.add(n);pending.push(...adjacency.get(n)!);}
    if(seen.size!==adjacency.size)return null;
  }
  return {triangles,boundary,maxVertex:Math.max(...used)};
}

/** Quadratic Bernstein coefficients for cross(u(t),v(t)). Every input is an
 * actual endpoint difference; no sampled midpoint is used as a motion bound. */
function crossSigns(ux:number,uy:number,vx:number,vy:number,Ux:number,Uy:number,Vx:number,Vy:number,margin:number):number{
  const a=ux*vy-uy*vx,b=((ux*Vy-uy*Vx)+(Ux*vy-Uy*vx))*.5,c=Ux*Vy-Uy*Vx;
  return a>margin&&b>margin&&c>margin?1:a< -margin&&b< -margin&&c< -margin?-1:0;
}

/** The topology is cached, while every call verifies that its input indices
 * still equal the captured snapshot. Mutating a shared Uint32Array cannot reuse
 * a proof for a different mesh. Invalid/disconnected/nonmanifold input fails. */
export function createContactEmbeddingVerifier(indices:ArrayLike<number>):ContactEmbeddingVerifier{
  let topology:Topology|null;
  try{topology=diskTopology(indices);}catch{return ()=>false;}
  if(!topology)return ()=>false;
  const {triangles,boundary,maxVertex}=topology;
  const boxes:Box[]=boundary.map(edge=>({edge,minX:0,maxX:0,minY:0,maxY:0}));
  let projectedFirst=new Float64Array(),projectedLast=new Float64Array();
  return (first,last,tolerance=1e-8,maxPairs=Infinity)=>{
    if(maxPairs!==Infinity&&(!Number.isSafeInteger(maxPairs)||maxPairs<=0))return false;
    if(!Number.isFinite(tolerance)||tolerance<0||indices.length!==triangles.length||first.length!==last.length||first.length%3||maxVertex*3+2>=first.length)return false;
    for(let i=0;i<triangles.length;i++)if(indices[i]!==triangles[i])return false;
    let magnitude=0;
    for(let i=0;i<first.length;i++){
      const a=first[i],b=last[i];if(!Number.isFinite(a)||!Number.isFinite(b))return false;
      magnitude=Math.max(magnitude,Math.abs(a),Math.abs(b));
    }
    // Covers subtraction, multiplication and summation error in each quadratic
    // coefficient, including cancellation after translating the whole sheet.
    const error=Math.max(Number.MIN_VALUE*64,64*Number.EPSILON*magnitude*magnitude);
    if(!Number.isFinite(error))return false;
    const count=first.length/3;
    if(projectedFirst.length!==count*2){projectedFirst=new Float64Array(count*2);projectedLast=new Float64Array(count*2);}
    const p=projectedFirst,q=projectedLast,triangleMargin=error+tolerance*tolerance;
    let checkedPairs=0;
    for(const [x,y]of [[0,1],[0,2],[1,2]]){
      for(let v=0;v<count;v++){p[v*2]=first[v*3+x];p[v*2+1]=first[v*3+y];q[v*2]=last[v*3+x];q[v*2+1]=last[v*3+y];}
      let orientation=0,oriented=true;
      for(let f=0;f<triangles.length;f+=3){
        const a=triangles[f]*2,b=triangles[f+1]*2,c=triangles[f+2]*2;
        const sign=crossSigns(p[b]-p[a],p[b+1]-p[a+1],p[c]-p[a],p[c+1]-p[a+1],q[b]-q[a],q[b+1]-q[a+1],q[c]-q[a],q[c+1]-q[a+1],triangleMargin);
        if(!sign||orientation&&orientation!==sign){oriented=false;break;}orientation=sign;
      }
      if(!oriented)continue;
      for(const box of boxes){
        const a=box.edge[0]*2,b=box.edge[1]*2;
        box.minX=Math.min(p[a],p[b],q[a],q[b]);box.maxX=Math.max(p[a],p[b],q[a],q[b]);
        box.minY=Math.min(p[a+1],p[b+1],q[a+1],q[b+1]);box.maxY=Math.max(p[a+1],p[b+1],q[a+1],q[b+1]);
      }
      boxes.sort((a,b)=>a.minX-b.minX);
      const separated=(a:Edge,b:Edge):boolean=>{
        const shared=a.find(v=>b.includes(v));
        if(shared!==undefined){
          const origin=shared*2,u=a.find(v=>v!==shared)!*2,v=b.find(v=>v!==shared)!*2;
          const ux=p[u]-p[origin],uy=p[u+1]-p[origin+1],vx=p[v]-p[origin],vy=p[v+1]-p[origin+1];
          const Ux=q[u]-q[origin],Uy=q[u+1]-q[origin+1],Vx=q[v]-q[origin],Vy=q[v+1]-q[origin+1];
          const d0=ux*vx+uy*vy,d1=((ux*Vx+uy*Vy)+(Ux*vx+Uy*vy))*.5,d2=Ux*Vx+Uy*Vy;
          // Opposite rays may be collinear. Otherwise a strict orientation
          // prevents the two adjacent segments from sharing anything but origin.
          return d0< -error&&d1< -error&&d2< -error||crossSigns(ux,uy,vx,vy,Ux,Uy,Vx,Vy,error)!==0;
        }
        const oneSide=(edge:Edge,other:Edge)=>{
          const a=edge[0]*2,b=edge[1]*2,ux=p[b]-p[a],uy=p[b+1]-p[a+1],Ux=q[b]-q[a],Uy=q[b+1]-q[a+1];
          const margin=error+tolerance*Math.max(Math.hypot(ux,uy),Math.hypot(Ux,Uy));
          let direction=0;
          for(const vertex of other){const v=vertex*2,sign=crossSigns(ux,uy,p[v]-p[a],p[v+1]-p[a+1],Ux,Uy,q[v]-q[a],q[v+1]-q[a+1],margin);if(!sign||direction&&direction!==sign)return false;direction=sign;}
          return true;
        };
        return oneSide(a,b)||oneSide(b,a);
      };
      let simple=true;
      for(let i=0;i<boxes.length&&simple;i++)for(let j=i+1;j<boxes.length;j++){
        const a=boxes[i],b=boxes[j];if(b.minX>a.maxX+tolerance)break;
        if(b.minY>a.maxY+tolerance||a.minY>b.maxY+tolerance)continue;
        if(++checkedPairs>maxPairs)return false;
        if(!separated(a.edge,b.edge)){simple=false;break;}
      }
      if(simple)return true;
    }
    return false;
  };
}

const cache=new WeakMap<object,ContactEmbeddingVerifier>();
export function certifyContactEmbedding(indices:ArrayLike<number>,first:ArrayLike<number>,last:ArrayLike<number>,tolerance=1e-8,maxPairs=Infinity):boolean{
  if(typeof indices!=='object'||indices===null)return false;
  let verify=cache.get(indices);if(!verify){verify=createContactEmbeddingVerifier(indices);cache.set(indices,verify);}
  return verify(first,last,tolerance,maxPairs);
}
