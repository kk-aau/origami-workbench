import {flasherFaceCount,readFlasherParams,type FlasherParams} from './flasherParams';
import {sourceNear} from './generatedSourceBinding';

type RecordValue=Record<string,unknown>;
const record=(x:unknown):x is RecordValue=>!!x&&typeof x==='object'&&!Array.isArray(x);
const completeParams=(x:unknown):FlasherParams|null=>{
  if(!record(x))return null;const p=readFlasherParams(x);
  return p&&Object.keys(p).every(key=>x[key]===p[key as keyof FlasherParams])?p:null;
};
type Label=[number,number,number];

export function flasherSourceParametersMatch(result:{stats?:unknown},expected:unknown):boolean{
  const selected=completeParams(expected),actual=record(result.stats)?completeParams(result.stats.parameters):null;
  return !!selected&&!!actual&&Object.keys(selected).every(key=>actual[key as keyof FlasherParams]===selected[key as keyof FlasherParams]);
}

/** Authenticate the enlarged center from complete parameters, original index
 * topology and literal fixed FF XY, before the caller checks every metric. */
export function flasherSourceFaceVertexBudget(result:{source:RecordValue;fold:unknown;stats?:unknown;doc?:unknown}):number|null{
  const source=result.source;
  if(source.spatialKind!=='origamica-planar-flasher'||source.algorithm!=='Origamica MakeFlasher planar reconstruction'||
    source.output!=='spatial-3d'||source.version!==1||!record(result.stats)||!record(result.fold))return null;
  const p=completeParams(result.stats.parameters);if(!p)return null;
  if(source.staticGlobalIsometryChecked!==true||source.continuousRigidPathChecked!==false||source.selfCollisionChecked!==false||source.deployedPatternChecked!==false||
    typeof source.outerHeightAdjustment!=='number'||!Number.isFinite(source.outerHeightAdjustment)||
    typeof source.isometryResidualSum!=='number'||!Number.isFinite(source.isometryResidualSum)||source.isometryResidualSum<0||source.isometryResidualSum>1e-6)return null;
  if(record(result.doc)&&record(result.doc.metadata)&&record(result.doc.metadata.tessellation)){
    const saved=completeParams(result.doc.metadata.tessellation.parameters);
    if(!saved||Object.keys(p).some(key=>saved[key as keyof FlasherParams]!==p[key as keyof FlasherParams]))return null;
  }
  const {rings:r,heightOrder:h,rotationalOrder:m,diagonal}=p,n=r*h;
  const faces=result.fold.faces_vertices,flat=result.fold.vertices_coords,spatial=source.foldedForm3D;
  const faceCount=flasherFaceCount(r,h,m);
  if(!Array.isArray(faces)||faces.length!==faceCount||result.stats.faces!==faceCount||
    !Array.isArray(flat)||!Array.isArray(spatial)||spatial.length!==flat.length)return null;
  const labels:Label[]=[],expected:number[][]=[],lookup=new Map<string,number>();
  const wrap=([i,j,k]:Label):Label=>i===-1?[j,0,(k+m-1)%m]:[i,j,k%m];
  const vertex=(label:Label)=>{const v=wrap(label),key=v.join(',');let id=lookup.get(key);
    if(id===undefined){id=labels.length;lookup.set(key,id);labels.push(v);}return id;};
  const quad=(references:Label[],row:number,column:number)=>{
    const q=references.map(vertex),pick13=diagonal==='Y'||diagonal==='X'&&(column+(h-1)*(row-1)+1)%2===0;
    expected.push(...(pick13?[[q[0],q[1],q[2]],[q[0],q[2],q[3]]]:[[q[0],q[1],q[3]],[q[1],q[2],q[3]]]));
  };
  for(let k=0;k<m;k++){
    for(let g=0;g<r;g++){const j=h*g;for(let i=j;i<=n;i++)if(Math.min(j+h,i)>j)
      quad([[i,j,k],[i-1,j,k],[i-1,Math.min(j+h,i),k],[i,Math.min(j+h,i+1),k]],g+1,i-j);}
    for(let g=0;g<r;g++){const i=h*g-1;for(let j=h*g+1;j<=n;j++)if(Math.min(i+h,j-2)>i)
      quad([[i,j,k],[i,j-1,k],[Math.min(i+h,j-2),j-1,k],[Math.min(i+h,j-1),j,k]],g+1,j-h*g-1);}
  }
  for(let k=0;k<m;k++){
    for(let g=0;g<r;g++){const j=h*g,i=j;expected.push([[i,j,k],[i-1,j,k],[i,i+1,k]].map(v=>vertex(v as Label)));}
    for(let g=0;g<r;g++){const i=h*g-1,j=h*g+1;expected.push([[i,j,k],[i,j-1,k],[j-1,j,k]].map(v=>vertex(v as Label)));}
  }
  expected.push(Array.from({length:m},(_,k)=>vertex([0,0,k])));
  if(labels.length!==flat.length||result.stats.vertices!==labels.length||
    faces.some((face,i)=>!Array.isArray(face)||face.length!==expected[i].length||face.some((v,j)=>v!==expected[i][j])))return null;
  const edgeSet=new Set<string>();for(const face of expected)for(let i=0;i<face.length;i++){
    const a=face[i],b=face[(i+1)%face.length];edgeSet.add(`${Math.min(a,b)},${Math.max(a,b)}`);
  }
  const expectedEdges=[...edgeSet].map(key=>key.split(',').map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const edges=result.fold.edges_vertices;
  if(!Array.isArray(edges)||edges.length!==expectedEdges.length||result.stats.edges!==expectedEdges.length||
    edges.some((edge,i)=>!Array.isArray(edge)||edge.length!==2||edge[0]!==expectedEdges[i][0]||edge[1]!==expectedEdges[i][1]))return null;
  for(let v=0;v<labels.length;v++){
    const [i,j,k]=labels[v],offset=j<=i+1?i*(i+1)+j:j*(j+1)-(i+1),a=.5*(1+p.radialIncrement*offset/h);
    const theta=2*Math.PI*(k+Math.max(i+1,j))/m,t=Math.tan(Math.PI/m),point=spatial[v];
    const x=a*(Math.cos(theta)-t*Math.sin(theta)),y=a*(Math.sin(theta)+t*Math.cos(theta));
    if(!Array.isArray(point)||point.length!==3||point.slice(0,2).some(x=>typeof x!=='number'||!Number.isFinite(x))||
      Math.abs(point[0]-x)>1e-10||Math.abs(point[1]-y)>1e-10)return null;
  }
  // In[4099], [4165]/[4171]/[4178]/[4193]: first-sector CP rotations,
  // center gauge and common outer-height parameter, not only face distances.
  const turn=2*Math.PI/m,t=Math.tan(Math.PI/m),rotate=(p:number[],a:number)=>[Math.cos(a)*p[0]-Math.sin(a)*p[1],Math.sin(a)*p[0]+Math.cos(a)*p[1],...p.slice(2)];
  const ideal=([i,j,k]:Label)=>{let x=1/(2*t),y=.5;if(i+1>=j){x+=(i+1)*Math.cos(Math.PI/2+turn)+t*j*Math.cos(turn);y+=(i+1)*Math.sin(Math.PI/2+turn)+t*j*Math.sin(turn);}else{x-=t*(i+1);y+=j;}return rotate([t*x,t*y],turn*k);};
  const center=lookup.get('0,0,0');if(center===undefined||!sourceNear(flat[center],ideal([0,0,0]),1e-7)||!Array.isArray(spatial[center])||Math.abs(spatial[center][2])>1e-7)return null;
  for(let v=0;v<labels.length;v++){
    const [i,j,k]=labels[v],first=lookup.get(`${i},${j},0`),point=spatial[v];
    if(first===undefined||!Array.isArray(flat[v])||flat[v].length!==2||!sourceNear(flat[v],rotate(flat[first],turn*k),1e-7)||!sourceNear(point,rotate(spatial[first],turn*k),1e-7))return null;
    const outer=i===n&&j%h===0||j===n&&i>=0&&(i+1)%h===0;
    const height=Math.abs(((Math.min(i+1,j)-h)%(2*h)+2*h)%(2*h)-h)*t*t;
    if(outer&&Math.abs(point[2]-(1+source.outerHeightAdjustment)*height)>1e-6)return null;
  }
  const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a:number[],b:number[])=>a.map((x,i)=>x-b[i]),cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],area=(f:number[],coords:any[])=>f.reduce((s,v,i)=>s+coords[v][0]*coords[f[(i+1)%f.length]][1]-coords[v][1]*coords[f[(i+1)%f.length]][0],0);
  const normals:number[][]=[],directed=new Map<string,number>(),seed=labels.map(ideal);
  for(let f=0;f<expected.length;f++){
    const original=expected[f],a=area(original,flat);if(!Number.isFinite(a)||Math.abs(a)<1e-10||f<expected.length-1&&a*area(original,seed)<=0)return null;
    const face=a<0?[...original].reverse():original,[x,y,z]=face,normal=cross(sub(spatial[y],spatial[x]),sub(spatial[z],spatial[x])),length=Math.hypot(...normal);if(!Number.isFinite(length)||length<1e-10)return null;
    normals.push(normal.map(x=>x/length));face.forEach((v,i)=>directed.set(`${v},${face[(i+1)%face.length]}`,f));
  }
  const kinds=result.fold.edges_assignment,angles=result.fold.edges_foldAngle;
  if(!Array.isArray(kinds)||!Array.isArray(angles)||kinds.length!==edges.length||angles.length!==edges.length)return null;
  for(let e=0;e<edges.length;e++){
    const [u,v]=edges[e],left=directed.get(`${u},${v}`),right=directed.get(`${v},${u}`);
    if(left===undefined||right===undefined){if(kinds[e]!=='B'||angles[e]!==null)return null;continue;}
    const a=normals[right],b=normals[left],edge=sub(spatial[v],spatial[u]),angle=Math.atan2(dot(a,cross(b,edge)),dot(a,b)*Math.hypot(...edge));
    if(typeof angles[e]!=='number'||!Number.isFinite(angles[e])||Math.abs(angles[e])>180)return null;
    // At the coplanar dr=0 limit, Python/JS cancellation may select opposite
    // +/-pi branches of the same directed angle. Preserve the real signed
    // assignment, while independently comparing the circular angle and its
    // declared threshold semantics; never change source geometry or types.
    const difference=angles[e]-angle*180/Math.PI,error=Math.min(Math.abs(difference),Math.abs(difference-360),Math.abs(difference+360)),kind=angles[e]>p.minimumAngleDeg?'V':angles[e]< -p.minimumAngleDeg?'M':'U';
    if(kinds[e]!==kind||error>1e-7)return null;
  }
  return m;
}
