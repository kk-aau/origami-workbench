import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point,type Assignment} from '../core/types';

export type AltMoselyFiniteRecipe={profile:Point[];sectors:number;minimumAngleDeg:number};
export const ALT_MOSELY_CLOSED_AXIS_PRESET:AltMoselyFiniteRecipe={
 profile:[[0,0],[20,20],[20,40],[0,60]],sectors:8,minimumAngleDeg:10};
export const ALT_MOSELY_ORIGINAL_PRESETS:AltMoselyFiniteRecipe[]=[
 {profile:[[0,0],[1,1],[1,2],[2,3]],sectors:8,minimumAngleDeg:10},
 {profile:[[0,0],[1,0],[2,Math.sqrt(3)],[1,2*Math.sqrt(3)],[0,2*Math.sqrt(3)]],sectors:6,minimumAngleDeg:10}];
export const ALT_MOSELY_FINITE_PRESET:AltMoselyFiniteRecipe=cloneRecipe(ALT_MOSELY_ORIGINAL_PRESETS[1]);
function cloneRecipe(r:AltMoselyFiniteRecipe):AltMoselyFiniteRecipe{return structuredClone(r);}
const META='originalAltMosely3556',SCHEMA='original-in3556-finite-alt-mosely-planar-cp-v1';
const clone=<T>(v:T):T=>structuredClone(v);
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exactKeys=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const num=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const same=(a:unknown,b:unknown):boolean=>{
 if(typeof a!==typeof b)return false;if(a===null||b===null)return a===b;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));
 if(object(a)&&object(b))return exactKeys(a,Object.keys(b))&&Object.keys(a).every(k=>same(a[k],b[k]));
 return Object.is(a,b)||a===b;
};
function fail(message:string):never{throw Error(message);}
export function validateAltMoselyFiniteRecipe(raw:unknown):AltMoselyFiniteRecipe{
 if(!object(raw)||!exactKeys(raw,['profile','sectors','minimumAngleDeg']))fail('请保留完整剖面、偶数扇区和原赋型阈值。');
 if(!Array.isArray(raw.profile)||raw.profile.length<3||raw.profile.length>8||
  raw.profile.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!num(v)||Math.abs(v)>1000)))
  fail('剖面须为3…8个有限二维毫米点，坐标幅度不超过1000。');
 if(!num(raw.sectors)||!Number.isInteger(raw.sectors)||raw.sectors<4||raw.sectors>16||raw.sectors%2)
  fail('当前有限纸面支持4…16的偶数扇区。');
 if(!num(raw.minimumAngleDeg)||raw.minimumAngleDeg<0||raw.minimumAngleDeg>45)fail('原赋型阈值须为0…45度。');
 return clone(raw as AltMoselyFiniteRecipe);
}
export function readAltMoselyFiniteRecipe(doc:Doc):AltMoselyFiniteRecipe|null{
 try{const m=doc.metadata?.[META];return object(m)&&m.schema===SCHEMA?validateAltMoselyFiniteRecipe(m.recipe):null;}catch{return null;}
}
const edgeKey=(a:number,b:number)=>Math.min(a,b)+','+Math.max(a,b);
const area=(face:number[],points:Point[])=>face.reduce((sum,a,i)=>{const b=face[(i+1)%face.length];return sum+points[a][0]*points[b][1]-points[b][0]*points[a][1];},0)/2;
const rot=([x,y]:Point,angle:number):Point=>[Math.cos(angle)*x-Math.sin(angle)*y,Math.sin(angle)*x+Math.cos(angle)*y];
function completeAxis(p:Point[]):Point[]{
 if(p[0][0]<p.at(-1)![0])return [...clone(p),[p[0][0],p.at(-1)![1]+.0001]];
 if(p[0][0]>p.at(-1)![0])return [[p.at(-1)![0],p[0][1]-.0001],...clone(p)];
 return clone(p);
}
type Cell={vertices:number[];part:0|1;copy:number;row:number;band:number};
function construct(raw:unknown):{doc:Doc;graph:FoldGraph;source:any}{
 const recipe=validateAltMoselyFiniteRecipe(raw),p=completeAxis(recipe.profile),n=p.length,copies=recipe.sectors/2;
 const phi=Math.PI/recipe.sectors,c=Math.cos(2*phi),s=Math.sin(2*phi),tf=Math.sin(phi)/Math.cos(phi);
 const base=p[0][0];
 if(p.some(q=>q[0]<base))fail('当前有限源域要求补齐轴点后的剖面半径不小于起始半径；未移动输入点。');
 const radii=[0];
 for(let j=1;j<n;j++){const d=Math.hypot(p[j][0]-p[j-1][0],p[j][1]-p[j-1][1]);if(d===0)fail('原剖面相邻点重复，原方向无法定义。');radii.push(radii.at(-1)!+d);}
 const w=radii.at(-1)!,delta:Point=[w*(c-1),w*s],points:Point[]=[],addressMap=new Map<string,number>();
 const flatPrefix=(part:0|1,row:number)=>{const seq=part?[...p].reverse():p;return seq.slice(0,row+1).every((q,i)=>q[1]===seq[0][1]&&(i===0||q[0]>=seq[i-1][0]));};
 const pointRaw=(part:0|1,copy:number,row:number,col:number):Point=>{
  const j=part?n-1-row:row,r=part?w-radii[j]:radii[j],x=p[j][0]-base,wt=tf*x,vt=tf*r;
  let q:Point=col===0?[r,0]:col===1?[r,wt]:col===2?[r,(wt+vt)/2]:
   rot(col===3?[r,-(wt+vt)/2]:col===4?[r,-wt]:[r,0],2*phi);
  if(part){const z=rot(q,-2*phi);q=[w*c-z[0],w*s+z[1]];}
  return rot([q[0]+copy*delta[0],q[1]+copy*delta[1]],-phi);
 };
 const vertex=(part:0|1,copy:number,row:number,col:number):number=>{
  let key:string,q:Point;
  if(row===0){key=(part?'B-':'A-')+copy;q=part?rot([w*c+copy*delta[0],w*s+copy*delta[1]],-phi):rot([copy*delta[0],copy*delta[1]],-phi);}
  else if(col===0||col===5||(p[part?n-1-row:row][0]===base&&(col===1||col===4))){
   const side=col===0||col===1?'E':'K',fcopy=part&&side==='K'?copy+1:copy,j=part?n-1-row:row,fside=part?(side==='E'?'K':'E'):side;
   if(j===0){key='A-'+fcopy;q=rot([fcopy*delta[0],fcopy*delta[1]],-phi);}
   else if(j===n-1){const bcopy=fside==='E'?fcopy-1:fcopy;key='B-'+bcopy;q=rot([w*c+bcopy*delta[0],w*s+bcopy*delta[1]],-phi);}
   else{key=fside+'-'+fcopy+'-'+j;q=pointRaw(0,fcopy,j,fside==='E'?0:5);}
  }else if(col>=1&&col<=4&&flatPrefix(part,row)){key='T-'+part+'-'+copy+'-'+row;q=pointRaw(part,copy,row,1);}
  else{key='P-'+part+'-'+copy+'-'+row+'-'+col;q=pointRaw(part,copy,row,col);}
  const prior=addressMap.get(key);if(prior!==undefined)return prior;addressMap.set(key,points.length);points.push(q);return points.length-1;
 };
 const sourceRoles=new Map<string,Set<Assignment>>(),zeroGraphicLines:any[]=[],faces:Cell[]=[];
 const mark=(a:number,b:number,assignment:Assignment,identity:string)=>{
  if(a===b){zeroGraphicLines.push({identity,reason:'source-defined zero-dimensional drawing primitive; not a material edge'});return;}
  const key=edgeKey(a,b),set=sourceRoles.get(key)??new Set<Assignment>();set.add(assignment);sourceRoles.set(key,set);
 };
 const bends=(part:0|1)=>{const q=part?[...p].reverse():p,d=q.slice(1).map((z,i)=>{const x=z[0]-q[i][0],y=z[1]-q[i][1],len=Math.hypot(x,y);return [x/len,y/len] as Point;});return [0,...d.slice(1).map((b,i)=>Math.atan2(d[i][0]*b[1]-d[i][1]*b[0],d[i][0]*b[0]+d[i][1]*b[1])),0];};
 const zeroCells:any[]=[];
 for(let copy=0;copy<copies;copy++)for(const part of [0,1] as const){
  const bend=bends(part),flat=flatPrefix(part,1);
  for(let col=1;col<=4;col++)for(let j=flat?1:0;j<n-1;j++)mark(vertex(part,copy,j,col),vertex(part,copy,j+1,col),col===1||col===4?'M':'V','longitudinal-'+part+'-'+copy+'-'+j+'-'+col);
  for(let j=1;j<n-1;j++)for(let b=0;b<5;b++){
   const angle=bend[j]*(b%2?-1:1),gmin=recipe.minimumAngleDeg*Math.PI/180;
   mark(vertex(part,copy,j,b),vertex(part,copy,j,b+1),angle>gmin?'V':angle<-gmin?'M':'U','transverse-'+part+'-'+copy+'-'+j+'-'+b);
  }
  for(const [a,b] of [[0,2],[2,3],[3,5]])
   mark(vertex(part,copy,n-1,a),vertex(part,copy,n-1,b),'B','original-Default-border-'+part+'-'+copy+'-'+a+'-'+b);
  for(let j=0;j<n-1;j++)for(let b=0;b<5;b++){
   let vertices=[vertex(part,copy,j,b+1),vertex(part,copy,j,b),vertex(part,copy,j+1,b),vertex(part,copy,j+1,b+1)];
   vertices=vertices.filter((v,i,a)=>v!==a[(i+a.length-1)%a.length]);
   if(new Set(vertices).size<3){zeroCells.push({part,copy,row:j,band:b,reason:'source vertex identities reduce this original parameter cell to dimension <=1'});continue;}
   if(new Set(vertices).size!==vertices.length)fail('原参数单元出现非连续重复角点，未采用。');
   const a=area(vertices,points);if(a===0)fail('未证明来源商的零面积单元，未删除或修复。');
   if(a<0)vertices.reverse();
   faces.push({vertices,part,copy,row:j,band:b});
  }
 }
 // Only source partition rails with no source crease are removed; paper end rails remain.
 const merged:({vertices:number[]}|null)[]=faces.map(f=>({vertices:[...f.vertices]}));
 const rails=new Set<string>();
 for(let copy=0;copy<copies;copy++)for(let row=0;row<n-1;row++){
  rails.add(edgeKey(vertex(0,copy,row,5),vertex(0,copy,row+1,5)));
  if(copy+1<copies)rails.add(edgeKey(vertex(0,copy+1,row,0),vertex(0,copy+1,row+1,0)));
 }
 for(let copy=0;copy<copies;copy++)for(const part of [0,1] as const)if(flatPrefix(part,1))
  rails.add(edgeKey(vertex(part,copy,0,1),vertex(part,copy,1,1)));
 let mergedRails=0;
 for(const rail of rails){
  const hits:({id:number;edge:number;a:number;b:number})[]=[];
  merged.forEach((f,id)=>{if(f)f.vertices.forEach((a,edge)=>{const b=f.vertices[(edge+1)%f.vertices.length];if(edgeKey(a,b)===rail)hits.push({id,edge,a,b});});});
  if(hits.length===0)continue;
  if(hits.length===1)continue; // No second source sheet exists here: true finite end boundary.
  if(hits.length!==2||hits[0].id===hits[1].id)fail('原分区接缝 incidence 非二面，未合并。');
  const [h,k]=hits;if(h.a!==k.b||h.b!==k.a)fail('原相邻分区方向不相反，未反射或焊点。');
  if(sourceRoles.has(rail))fail('原真实折痕位于待合并纸面分区，未删除。');
  const fa=merged[h.id]!.vertices,fb=merged[k.id]!.vertices;
  const pa=fa.map((_,i)=>fa[(h.edge+1+i)%fa.length]),pb=fb.map((_,i)=>fb[(k.edge+1+i)%fb.length]);
  const joined=pa.concat(pb.slice(1,-1));if(new Set(joined).size!==joined.length)fail('原合面边界重复，未修复。');
  merged[h.id]={vertices:joined};merged[k.id]=null;mergedRails++;
 }
 const rings=merged.filter((f):f is {vertices:number[]}=>!!f).map(f=>f.vertices);
 const used=new Set(rings.flat()),remap=new Map([...used].map((v,i)=>[v,i])),coords=[...used].map(v=>points[v]);
 const edgeMap=new Map<string,number>(),edges:[number,number][]=[],ef:number[][]=[],fe:number[][]=[];
 rings.forEach((face,fi)=>{const indices:number[]=[];face.forEach((a,i)=>{const b=face[(i+1)%face.length],key=edgeKey(a,b);let ei=edgeMap.get(key);if(ei===undefined){ei=edges.length;edgeMap.set(key,ei);edges.push([remap.get(a)!,remap.get(b)!]);ef.push([]);}ef[ei].push(fi);indices.push(ei);});fe.push(indices);});
 const assignments:Assignment[]=[],caps:number[]=[],conflicts:any[]=[];
 for(const [key,ei] of edgeMap){
  const roles=sourceRoles.get(key);
  if(ef[ei].length===1){assignments[ei]='B';if(!roles)caps.push(ei);}
  else if(ef[ei].length!==2)fail('原纸域边不满足有限二面材料incidence。');
  else if(!roles||roles.size!==1){conflicts.push({edge:ei,roles:roles?[...roles]:[]});}
  else assignments[ei]=[...roles][0];
 }
 if(conflicts.length)fail('原内部边缺标记或赋型冲突：'+JSON.stringify(conflicts.slice(0,3)));
 const faces_vertices=rings.map(f=>f.map(v=>remap.get(v)!)),graph:FoldGraph={vertices_coords:coords,edges_vertices:edges,edges_assignment:assignments,
  edges_foldAngle:assignments.map(a=>a==='B'?0:null),faces_vertices,faces_edges:fe,edges_faces:ef,
  faces_faces:fe.map((row,fi)=>row.map(e=>ef[e].length===2?ef[e].find(f=>f!==fi)!:null)) as unknown as number[][]};
 const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]),paper={width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
 const ids=edges.map((_,i)=>'alt3556-edge-'+i);
 const source={schema:SCHEMA,recipe,origin:'MakeAltMoselyPot In[3556]; MakeMoselyPot In[3546]',originalClass:'TRotationalPot deprecated; not a CP impossibility proof',
  originalOptions:{CreasePatternBoundary:'Default',CircleDivisions:10,FoldedFormGapSize:.05},
  coordinateConvention:'profile input millimetres; 1 source coordinate unit = 1 mm local; original shift to first completed axis point and original transforms only',
  axisPolicy:'original +/-0.0001 completion preserved before forward/reverse; no automatic radius clamping',
  sourceAxisCompleted:clone(p),sourceArcPositions:[...radii],
  topologyPolicy:'source-index identities, reverse r=W-r; source E/K rails joined as uncreased semi-panels; no coordinate welding',
  localChoices:['true finite source-surface end boundaries B','StyledCreaseLine -> U/null','source-defined zero-dimensional cells/lines have no material edges'],
  sourcePartition:{originalCells:5*(n-1)*2*copies,zeroCells,zeroGraphicLines,mergedUncreasedRails:mergedRails,finiteEndEdges:caps,
   literalOriginVertex:remap.get(addressMap.get('A-0')!)},
  capabilities:{planarMaterial:true,finiteRigid3D:false,foldedVertices:false,flatFoldOrLayerCertificate:false,continuousDeployment:false,selfCollision:false}};
 const doc:Doc={schemaVersion:2,name:'交替 Mosely 有限二维 CP',paper,segments:edges.map(([a,b],i)=>({id:ids[i],a:[...coords[a]],b:[...coords[b]],assignment:assignments[i],angle:assignments[i]==='B'?0:null})),
  objects:[],metadata:{[META]:source}};
 doc.metadata!.materialTopology=createMaterialTopology(doc,graph,ids);
 const checked=inspectMaterialTopology(doc);if(!checked.ok)fail(checked.reason);
 if(checked.components.length!==1||checked.components[0].boundaryLoops.length!==1)fail('原有限纸域不是单片单边界，未采用。');
 return {doc,graph,source};
}
export function altMoselyFiniteCPDocument(raw:unknown):Doc{return construct(raw).doc;}
const close=(a:unknown,b:number)=>num(a)&&Math.abs(a-b)<=32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b));
const pointClose=(a:unknown,b:Point)=>Array.isArray(a)&&a.length===2&&close(a[0],b[0])&&close(a[1],b[1]);
export function altMoselyFiniteCPSourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);const recipe=readAltMoselyFiniteRecipe(doc);if(!recipe)return false;
  const expected=construct(recipe).doc,actual=inspectMaterialTopology(doc);if(!actual.ok)return false;
  const a=doc.metadata?.[META],b=expected.metadata?.[META];if(!object(a)||!object(b)||!exactKeys(a,Object.keys(b)))return false;
  const {sourceArcPositions:aa,...ar}=a,{sourceArcPositions:bb,...br}=b;
  if(!same(ar,br)||!Array.isArray(aa)||aa.length!==bb.length||
   aa.some((v,i)=>i===0?v!==0:!close(v,bb[i])||v<=0))return false;
  const ma=doc.metadata?.materialTopology as any,mb=expected.metadata?.materialTopology as any;
  if(!object(ma)||!exactKeys(ma,Object.keys(mb)))return false;
  const {graph:ga,...ta}=ma,{graph:gb,...tb}=mb;
  if(!same(ta,tb)||!object(ga)||!exactKeys(ga,Object.keys(gb)))return false;
  const {vertices_coords:va,...ia}=ga,{vertices_coords:vb,...ib}=gb;
  if(!same(ia,ib)||!Array.isArray(va)||va.length!==vb.length||va.some((p,i)=>!pointClose(p,vb[i])))return false;
  const origin=b.sourcePartition.literalOriginVertex;
  if(!same(va[origin],[0,0]))return false;
  const xs=va.map(p=>p[0]),ys=va.map(p=>p[1]);
  if(doc.paper.width!==Math.max(...xs)-Math.min(...xs)||doc.paper.height!==Math.max(...ys)-Math.min(...ys))return false;
  if(doc.segments.length!==expected.segments.length)return false;
  return doc.segments.every((s,i)=>{
   const e=expected.segments[i],[u,v]=ga.edges_vertices[i];
   return s.id===e.id&&s.assignment===e.assignment&&s.angle===e.angle&&
    same(s.a,va[u])&&same(s.b,va[v])&&pointClose(s.a,e.a)&&pointClose(s.b,e.b);
  });
 }catch{return false;}
}
