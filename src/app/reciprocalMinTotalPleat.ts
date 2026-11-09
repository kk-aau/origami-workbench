import type {TessGraph,TessParams,TessResult,XY} from './tessellation';
import {shrinkAndTwist} from './primalDualParams';
import {generatedDocumentMatches,sourceNear,sourceRecord} from './generatedSourceBinding';

export const MIN_TOTAL_METHOD='original-min-total-pleat' as const;
export function minTotalPleatInputAllowed(raw:Record<string,unknown>):boolean{
 const m=raw.motherParams as Record<string,any>|undefined;
 return raw.family==='primal-dual'&&raw.reciprocalMethod===MIN_TOTAL_METHOD&&!!m&&typeof m==='object'&&!Array.isArray(m)&&m.family==='custom'&&
  Object.keys(m).every(k=>['family','vertices','faces','repeatX','repeatY','angle','scale','customOutput'].includes(k))&&
  (m.repeatX??1)===1&&(m.repeatY??1)===1&&[undefined,'twist'].includes(m.customOutput)&&
  !['dualEdgeFlips','pruneBoundary','paper'].some(k=>Object.hasOwn(raw,k))&&[undefined,'none'].includes(raw.postRotation as any)&&
  Array.isArray(m.faces)&&m.faces.length>=2&&m.faces.length<=16&&m.faces.every((f:unknown)=>Array.isArray(f)&&f.length>=3&&f.length<=8)&&
  Array.isArray(m.vertices)&&m.vertices.length>=3&&m.vertices.length<=64&&Array.isArray(raw.dualTargets)&&raw.dualTargets.length===m.faces.length;
}

/** Bind the LP result to the actual Conway corner occurrences, shrink/rotate
 * CP, original -alpha FF and current prepared mm drawing. LP proof alone
 * certifies the reciprocal diagram, not this final paper construction. */
export function minTotalPleatResultMatches(result:TessResult,params:TessParams):boolean{
 try{
  if(params.family!=='primal-dual'||params.motherParams?.family!=='custom'||!minTotalPleatSourceMatches(result.source,params,result.mother,result.dual)||!generatedDocumentMatches(result,params)||!sourceRecord(result.fold)||!result.mother||!result.dual)return false;
  const source=result.source,graph=result.fold,mother=result.mother,dual=result.dual,preview=result.preview,points=graph.vertices_coords,faces=graph.faces_vertices,edges=graph.edges_vertices,kinds=graph.edges_assignment,angles=graph.edges_foldAngle;
  if(source.algorithm!=='perpendicular-reciprocal / Shrink-Rotate'||source.version!==1||source.motherFamily!=='custom'||!preview||preview.kind!=='shrink-rotate'||!Array.isArray(points)||!Array.isArray(faces)||!Array.isArray(edges)||!Array.isArray(kinds)||!Array.isArray(angles))return false;
  const coefficients:number[][]=[],labels:[number,number][]=[],lookup=new Map<string,number>();
  mother.faces_vertices.forEach((face,f)=>face.forEach(v=>{const c=dual.vertices_coords[f],p=mother.vertices_coords[v];coefficients.push([c[0],c[1],p[0]-c[0],p[1]-c[1]]);labels.push([f,v]);}));
  if(preview.vertices.length!==coefficients.length||points.length!==coefficients.length)return false;
  const used=new Set<number>();
  for(let i=0;i<preview.vertices.length;i++){
   const row=preview.vertices[i],matches=coefficients.flatMap((p,k)=>sourceNear(row,p,1e-9)?[k]:[]);
   if(matches.length!==1||used.has(matches[0]))return false;used.add(matches[0]);lookup.set(labels[matches[0]].join(','),i);
  }
  const id=(f:number,v:number)=>{const i=lookup.get(`${f},${v}`);if(i===undefined)throw Error('missing corner');return i;},key=(a:number,b:number)=>`${Math.min(a,b)},${Math.max(a,b)}`;
  const expectedFaces=mother.faces_vertices.map((face,f)=>face.map(v=>id(f,v))),incident=new Map<string,{a:number;b:number;f:number}[]>();
  mother.faces_vertices.forEach((face,f)=>face.forEach((a,i)=>{const b=face[(i+1)%face.length],k=key(a,b);incident.set(k,[...(incident.get(k)??[]),{a,b,f}]);}));
  const counts=new Map<string,number>(),assignments=new Map<string,string>(),vertexLinks=new Map<number,Map<number,number>>(),boundary=new Set<number>();
  const originalIndices=mother.vertices_coords.map(p=>params.motherParams!.family==='custom'?params.motherParams!.vertices.findIndex(v=>sourceNear(v,p,1e-9)):-1);
  const directed=originalIndices.every(v=>v>=0)&&params.motherParams.vertices.length===mother.vertices_coords.length&&new Set(params.motherParams.vertices.map(p=>p.join(','))).size===params.motherParams.vertices.length;
  if(directed&&source.assignmentMethod!=='Origamica directed primal input edges / CCW dual pairs')return false;
  const adjacency=mother.faces_vertices.map(()=>new Set<number>()),vertexAdj=mother.vertices_coords.map(()=>new Set<number>());
  for(const uses of incident.values()){const {a,b}=uses[0];vertexAdj[a].add(b);vertexAdj[b].add(a);if(uses.length===2){adjacency[uses[0].f].add(uses[1].f);adjacency[uses[1].f].add(uses[0].f);}else if(uses.length===1){boundary.add(a);boundary.add(b);}else return false;}
  const depths=(neighbors:Set<number>[],seeds:number[])=>{const d=Array(neighbors.length).fill(Infinity),q=[...seeds];for(const s of seeds)d[s]=0;for(let i=0;i<q.length;i++)for(const next of neighbors[q[i]])if(d[next]===Infinity){d[next]=d[q[i]]+1;q.push(next);}return d;};
  const mean:XY=[0,1].map(k=>mother.vertices_coords.reduce((s,p)=>s+p[k],0)/mother.vertices_coords.length) as XY,nearest=dual.vertices_coords.map((p,f)=>({f,d:Math.round(Math.hypot(p[0]-mean[0],p[1]-mean[1])*1e10)})).sort((a,b)=>a.d-b.d||a.f-b.f)[0].f;
  const faceDepth=depths(adjacency,[nearest]),vertexDepth=depths(vertexAdj,mother.faces_vertices[nearest]);
  const marked=(use:{a:number;b:number;f:number},other:{a:number;b:number;f:number})=>directed?originalIndices[use.a]<originalIndices[use.b]:faceDepth[use.f]!==faceDepth[other.f]?faceDepth[use.f]<faceDepth[other.f]:vertexDepth[use.b]<vertexDepth[use.a];
  for(const uses of incident.values())if(uses.length===2){
   const [one,two]=uses;if(one.a!==two.b||one.b!==two.a)return false;
   const q=[id(one.f,one.b),id(one.f,one.a),id(two.f,one.a),id(two.f,one.b)];expectedFaces.push(q);
   const addLink=(v:number,a:number,b:number)=>{if(!vertexLinks.has(v))vertexLinks.set(v,new Map());if(vertexLinks.get(v)!.has(a))throw Error('branched vertex');vertexLinks.get(v)!.set(a,b);};
   addLink(one.a,q[2],q[1]);addLink(one.b,q[0],q[3]);
   const upper=marked(one,two)?one:marked(two,one)?two:null;
   if(upper){const lower=upper===one?two:one;assignments.set(key(id(upper.f,upper.a),id(upper.f,upper.b)),'M');assignments.set(key(id(lower.f,upper.a),id(lower.f,upper.b)),'V');assignments.set(key(id(upper.f,upper.b),id(lower.f,upper.b)),'M');assignments.set(key(id(upper.f,upper.a),id(lower.f,upper.a)),'V');}
  }
  for(const [v,links]of vertexLinks)if(!boundary.has(v)){
   const start=Math.min(...links.keys()),walk=[start];let next=links.get(start);while(next!==start){if(next===undefined||walk.includes(next)||walk.length>mother.faces_vertices.length)return false;walk.push(next);next=links.get(next);}if(walk.length<3||walk.length!==links.size)return false;expectedFaces.push(walk);
  }
  const canonical=(face:number[])=>{const n=face.indexOf(Math.min(...face));return[...face.slice(n),...face.slice(0,n)];},sort=(a:number[],b:number[])=>{for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];return a.length-b.length;};
  const ordered=expectedFaces.map(canonical).sort(sort);if(!sourceNear(faces,ordered,0))return false;
  // In[1137]/[1278]/[1481] incidence remains in original primal-index order.
  // A valid LP and unchanged dual points must not hide a changed DualFaces/map.
  const triples=new Map<string,number>();mother.faces_vertices.forEach((stored,f)=>{const ring=[...stored].reverse();ring.forEach((v,i)=>triples.set(`${ring[(i+ring.length-1)%ring.length]},${v},${ring[(i+1)%ring.length]}`,f));});
  const rays=mother.vertices_coords.map(()=>[] as {angle:number;v:number}[]);mother.edges_vertices.forEach(([a,b])=>{for(const [x,y]of [[a,b],[b,a]]){const p=mother.vertices_coords[x],q=mother.vertices_coords[y];let angle=Math.atan2(q[1]-p[1],q[0]-p[0]);if(angle<=-Math.PI)angle=Math.PI;rays[x].push({angle:Math.abs(angle)<1e-10?0:angle,v:y});}});
  const owners:number[]=[],dualFaces:number[][]=[];rays.forEach((row,v)=>{const ring=row.sort((a,b)=>a.angle-b.angle).map(p=>p.v),raw=ring.map((a,i)=>triples.get(`${a},${v},${ring[(i+ring.length-1)%ring.length]}`));if(raw.every(f=>f!==undefined)){owners.push(v);dualFaces.push([...raw.slice(1),raw[0]] as number[]);}});
  if(!sourceNear(dual.faces_vertices,dualFaces,0)||!sourceNear((dual as unknown as Record<string,unknown>).zhezhi_dual_primal_vertices,owners,0)||!sourceNear(dual.edges_assignment,dual.edges_vertices.map(()=>'A'),0)||!sourceNear((dual as unknown as Record<string,unknown>).edges_foldAngle,dual.edges_vertices.map(()=>null),0))return false;
  ordered.forEach(f=>f.forEach((a,i)=>{const k=key(a,f[(i+1)%f.length]);counts.set(k,(counts.get(k)??0)+1);}));
  const expectedEdges=[...counts.keys()].map(k=>k.split(',').map(Number)).sort(sort);
  if(!sourceNear(edges,expectedEdges,0)||kinds.length!==edges.length||angles.length!==edges.length)return false;
  for(let e=0;e<edges.length;e++){const k=key(edges[e][0],edges[e][1]),kind=counts.get(k)===1?'B':assignments.get(k)??'U',angle=kind==='M'?-180:kind==='V'?180:null;if(kinds[e]!==kind||angles[e]!==angle)return false;}
  const p=params as TessParams&{angle:number;scale:number;parameterization?:string;gamma?:number;pleatAngle?:number;twistDirection?:string},radians=p.angle*Math.PI/180,c=Math.cos(radians)*p.scale,s=Math.sin(radians)*p.scale;
  const cp=preview.vertices.map(([cx,cy,x,y])=>[cx+c*x-s*y,cy+s*x+c*y]);if(!sourceNear(points,cp,1e-8))return false;
  const stats=result.stats as unknown as Record<string,unknown>;if(stats.vertices!==points.length||stats.edges!==edges.length||stats.faces!==faces.length)return false;
  if(p.parameterization==='gamma-alpha'){
   const gamma=p.gamma!,a=p.pleatAngle!*Math.PI/180,sign=p.twistDirection==='cw'?-1:1,rho=gamma/Math.hypot(gamma-Math.sin(a),Math.cos(a)),beta=sign*Math.atan2(Math.cos(a),gamma-Math.sin(a)),m=p.scale/rho,phi=radians-beta,cb=Math.cos(beta),sb=Math.sin(beta),co=Math.cos(phi),si=Math.sin(phi);
   const ff=preview.vertices.map(([cx,cy,dx,dy])=>{const x=cx+rho*(cb*dx-sb*dy),y=cy+rho*(sb*dx+cb*dy);return[m*(co*x-si*y),m*(si*x+co*y)];});
   if(source.foldedFormMethod!=='Origamica gamma/-alpha direct construction'||!sourceNear(source.foldedForm,ff,1e-8)||typeof source.foldedFormMaxIsometryError!=='number'||!Number.isFinite(source.foldedFormMaxIsometryError)||source.foldedFormMaxIsometryError<0||source.foldedFormMaxIsometryError>1e-7*Math.max(1,...cp.flat().map(Math.abs)))return false;
   for(const f of ordered)for(let i=0;i<f.length;i++)for(let j=i+1;j<f.length;j++)if(Math.abs(Math.hypot(cp[f[i]][0]-cp[f[j]][0],cp[f[i]][1]-cp[f[j]][1])-Math.hypot(ff[f[i]][0]-ff[f[j]][0],ff[f[i]][1]-ff[f[j]][1]))>1e-7*Math.max(1,...cp.flat().map(Math.abs)))return false;
  }else if(source.foldedForm!==undefined||source.foldedFormMethod!==undefined)return false;
  return true;
 }catch{return false;}
}
/** Numerical example for the source method; not a saved Notebook example. */
export function minTotalPleatPreset():TessParams{
 return {family:'primal-dual',tiling:'square',rings:1,...shrinkAndTwist(1,30),
  parameterization:'gamma-alpha',gamma:1,pleatAngle:30,twistDirection:'ccw',reciprocalMethod:MIN_TOTAL_METHOD,
  motherParams:{family:'custom',vertices:[[0,0],[1,0],[0,1],[-1,0],[0,-1]],faces:[[0,1,2],[0,2,3],[0,3,4],[0,4,1]],
   repeatX:1,repeatY:1,angle:36,scale:.3,customOutput:'twist'},
  dualTargets:[[1,.5],[-1,.5],[-1,-.5],[1,-.5]]};
}
const dot=(a:number[],b:number[])=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const near=(a:unknown,b:any,tolerance=1e-8):boolean=>typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)):
 Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>near(a[i],v,tolerance)):
 b&&typeof b==='object'?!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).sort().join('|')===Object.keys(b).sort().join('|')&&Object.entries(b).every(([k,v])=>near((a as any)[k],v,tolerance)):a===b;
const rank=(input:number[][],tolerance:number)=>{
 const a=input.map(row=>row.slice());let pivot=0;
 for(let column=0;column<(a[0]?.length??0)&&pivot<a.length;column++){
  let row=pivot;for(let i=pivot+1;i<a.length;i++)if(Math.abs(a[i][column])>Math.abs(a[row][column]))row=i;
  if(Math.abs(a[row][column])<=tolerance)continue;
  [a[pivot],a[row]]=[a[row],a[pivot]];
  const divisor=a[pivot][column];for(let k=column;k<a[pivot].length;k++)a[pivot][k]/=divisor;
  for(let i=pivot+1;i<a.length;i++){const factor=a[i][column];for(let k=column;k<a[i].length;k++)a[i][k]-=factor*a[pivot][k];}
  pivot++;
 }
 return pivot;
};
const vector=(value:unknown,count:number):value is number[]=>Array.isArray(value)&&value.length===count&&value.every(n=>typeof n==='number'&&Number.isFinite(n));
const points=(value:unknown,count:number):value is XY[]=>Array.isArray(value)&&value.length===count&&value.every(p=>vector(p,2));

/** Independently verifies primal feasibility, LP dual optimum, uniqueness and the source RMS fit. */
export function minTotalPleatSourceMatches(source:Record<string,unknown>,params:TessParams,mother?:TessGraph|null,dual?:TessGraph|null):boolean{
 try{
  if(params.family!=='primal-dual'||params.reciprocalMethod!==MIN_TOTAL_METHOD||!params.dualTargets||!mother||!dual)return false;
  const r=source.reciprocalMinTotalPleat as Record<string,any>|undefined;
  const keys=['schema','function','definitionCell','definitionLines','method','branchLines','commonSolveLines','commonFitLines','indexConvention','input','inputSigns','anchor','minimumNormalizedPleat','normalizedDualVertices','normalizedPleatLengths','totalNormalizedPleat','certificate','fit','returnedDualVertices','solver','uniqueOptimumRequired','wolframExecuted','symbolicOptionsImplemented','motherAdapter'];
  if(!r||r.schema!=='origamica-reciprocal-min-total-pleat-v1'||r.function!=='MakeReciprocalDiagram'||r.method!=='MinTotalPleat'||
   Object.keys(r).sort().join('|')!==keys.sort().join('|')||
   r.definitionCell!=='In[1527]'||!near(r.definitionLines,[105170,105763],0)||!near(r.branchLines,[105409,105435],0)||
   !near(r.commonSolveLines,[105595,105625],0)||!near(r.commonFitLines,[105627,105674],0)||
   r.solver!=='SciPy HiGHS linear programming; closed-form common RMS fit'||
   r.wolframExecuted!==false||r.symbolicOptionsImplemented!==false||r.uniqueOptimumRequired!==true||
   !near(r.anchor,[0,0],0)||r.minimumNormalizedPleat!==1||r.indexConvention!=='zero-based; supplied pairing order'||
   r.motherAdapter!=='sorted undirected shared primal edges; paired face traversal order; explicit input duals')return false;
  if(params.motherParams?.family!=='custom')return false;
  const explicit=params.motherParams,expectedPoints:XY[]=[],expectedFaces:number[][]=[],lookup=new Map<string,number>();
  for(const face of explicit.faces){
   const ids=face.map(i=>{
    const point=explicit.vertices[i].map(v=>Number(v.toFixed(9))) as XY,key=point.join(',');
    if(!lookup.has(key)){lookup.set(key,expectedPoints.length);expectedPoints.push(point);}return lookup.get(key)!;
   });
   const area=ids.reduce((sum,a,i)=>{const b=ids[(i+1)%ids.length];return sum+expectedPoints[a][0]*expectedPoints[b][1]-expectedPoints[b][0]*expectedPoints[a][1];},0);
   expectedFaces.push(area>0?ids.slice().reverse():ids);
  }
  if(!near(mother.vertices_coords,expectedPoints,1e-9)||!near(mother.faces_vertices,expectedFaces,0))return false;
  const expectedEdges=new Map<string,{edge:[number,number];count:number}>();
  expectedFaces.forEach(stored=>{const face=stored.slice().reverse();face.forEach((a,i)=>{
   const [x,y]=[a,face[(i+1)%face.length]].sort((x,y)=>x-y),key=x+','+y;
   if(!expectedEdges.has(key))expectedEdges.set(key,{edge:[x,y],count:0});expectedEdges.get(key)!.count++;
  });});
  const expectedRows=[...expectedEdges.values()];
  if(!near(mother.edges_vertices,expectedRows.map(row=>row.edge),0)||
   !near(mother.edges_assignment,expectedRows.map(row=>row.count===1?'B':'U'),0))return false;
  const incident=new Map<string,{edge:[number,number];faces:number[]}>();
  mother.faces_vertices.forEach((face,f)=>face.forEach((a,i)=>{
   const b=face[(i+1)%face.length],[x,y]=[a,b].sort((x,y)=>x-y),key=x+','+y;
   if(!incident.has(key))incident.set(key,{edge:[x,y],faces:[]});incident.get(key)!.faces.push(f);
  }));
  const pairs=[...incident.values()].filter(p=>p.faces.length===2).sort((a,b)=>a.edge[0]-b.edge[0]||a.edge[1]-b.edge[1]);
  const n=mother.faces_vertices.length,m=pairs.length,count=2*n;
  if(n<2||n>16||m<1||m>32||!near(r.input,{vertices:mother.vertices_coords,interiorEdges:pairs.map(p=>p.edge),
   dualVertices:params.dualTargets,dualEdges:pairs.map(p=>p.faces)},0)||!points(r.normalizedDualVertices,n)||!points(r.returnedDualVertices,n))return false;
  const O:number[][]=[],W:number[][]=[],signs:number[]=[];
  for(const {edge:[a,b],faces:[f,g]} of pairs){
   const d:XY=[mother.vertices_coords[a][0]-mother.vertices_coords[b][0],mother.vertices_coords[a][1]-mother.vertices_coords[b][1]],length=Math.sqrt(dot(d,d));
   if(length<1e-8)return false;
   const t:XY=[d[0]/length,d[1]/length],normal:XY=[-t[1],t[0]],initial:XY=[params.dualTargets[f][0]-params.dualTargets[g][0],params.dualTargets[f][1]-params.dualTargets[g][1]],s=Math.sign(dot(normal,initial));
   if(!s)return false;signs.push(s);
   const o=Array(count).fill(0),w=Array(count).fill(0);
   for(const k of [0,1]){o[2*f+k]=t[k];o[2*g+k]=-t[k];w[2*f+k]=s*normal[k];w[2*g+k]=-s*normal[k];}
   O.push(o);W.push(w);
  }
  if(!near(r.inputSigns,signs,0))return false;
  const anchor=Array.from({length:2},(_,k)=>Array.from({length:count},(_,i)=>i===k?1:0)),A=[...anchor,...O],x=r.normalizedDualVertices.flat() as number[];
  const cert=r.certificate,y=cert?.equalityMultipliers,z=cert?.widthMultipliers;
  if(!cert||Object.keys(cert).sort().join('|')!==['equalityMultipliers','widthMultipliers','positiveWidthConstraints','uniqueRank','variableCount','tolerance','rankTolerance','positiveThreshold'].sort().join('|')||
   cert.tolerance!==1e-8||cert.rankTolerance!==1e-9||cert.variableCount!==count||cert.uniqueRank!==count||
   !vector(y,A.length)||!vector(z,m)||z.some(v=>v< -1e-9)||!A.every(row=>Math.abs(dot(row,x))<=1e-8))return false;
  const widths=W.map(row=>dot(row,x)),objective=W[0].map((_,k)=>W.reduce((sum,row)=>sum+row[k],0));
  if(widths.some(v=>v<1-1e-8)||!near(r.normalizedPleatLengths,widths)||!near(r.totalNormalizedPleat,dot(objective,x)))return false;
  if(objective.some((c,k)=>Math.abs(c-A.reduce((sum,row,i)=>sum+row[k]*y[i],0)-W.reduce((sum,row,i)=>sum+row[k]*z[i],0))>1e-8)||
   z.some((v,i)=>Math.abs(v*(widths[i]-1))>1e-8)||Math.abs(dot(objective,x)-z.reduce((sum,v)=>sum+v,0))>1e-8)return false;
  const threshold=1e-9*Math.max(1,...z),positive=z.flatMap((v,i)=>v>threshold?[i]:[]);
  if(cert.positiveThreshold!==threshold||!near(cert.positiveWidthConstraints,positive,0)||rank([...A,...positive.map(i=>W[i])],1e-9)!==count)return false;
  const q=r.normalizedDualVertices as XY[],p=params.dualTargets,mean=(a:XY[])=>[0,1].map(k=>a.reduce((sum,row)=>sum+row[k],0)/a.length),qm=mean(q),pm=mean(p);
  let denominator=0,numerator=0;
  q.forEach((row,i)=>row.forEach((v,k)=>{denominator+=(v-qm[k])**2;numerator+=(v-qm[k])*(p[i][k]-pm[k]);}));
  const scale=numerator/denominator,translation=pm.map((v,k)=>v-scale*qm[k]),fitted=q.map(row=>row.map((v,k)=>scale*v+translation[k]));
  const squaredDeviation=fitted.reduce((sum,row,i)=>sum+row.reduce((s,v,k)=>s+(v-p[i][k])**2,0),0);
  return denominator>1e-12&&scale>1e-8&&near(r.fit,{scale,translation,squaredDeviation})&&
   near(r.returnedDualVertices,fitted)&&near(dual.vertices_coords,fitted)&&near(dual.edges_vertices,pairs.map(p=>p.faces),0);
 }catch{return false;}
}
