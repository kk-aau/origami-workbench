/** Indexed material topology. Coordinate equality never joins cut banks. */
import type {Doc,FoldGraph,Point} from './types';
import {materialPointInside} from './materialTraceGeometry';
import {hasWeakMaterialRings,hasWeakMaterialBanks,hasUnresolvedMaterialHinge,decomposeMaterialWalk} from './materialWeak';

export interface MaterialTopologyComponent {
  faces:number[];
  vertices:number[];
  edges:number[];
  /** Oriented boundary walks; closing vertex omitted, slit tips may repeat. */
  boundaryLoops:number[][];
}
export interface MaterialTopologyData {
  schema:'zhezhi-material-topology-v1'|'zhezhi-material-topology-v2'|'zhezhi-material-topology-v3'|'zhezhi-material-topology-v4';
  graph:FoldGraph;
  /** One current, non-auxiliary segment ID per indexed material edge. */
  edgeSegmentIds:string[];
  foldedVertices?:Point[];
  startingFace?:number;
}
export interface MaterialTopologyOptions {
  foldedVertices?:readonly Point[];
  startingFace?:number;
}
export type MaterialTopologyInspection=
  |{ok:true;graph:FoldGraph;edgeSegmentIds:string[];components:MaterialTopologyComponent[];
     foldedVertices?:Point[];startingFace?:number;tolerance:number}
  |{ok:false;reason:string};

const MAX_VERTICES=8192,MAX_EDGES=16384,MAX_FACES=8192,MAX_CORNERS=65536,MAX_PAIRS=2_000_000;
type Row=Record<string,unknown>;
const record=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
function fail(message:string):never{throw new Error(message);}
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const key=(a:number,b:number)=>`${Math.min(a,b)},${Math.max(a,b)}`;
class Budget {
  pairs=0;
  pair(){if(++this.pairs>MAX_PAIRS)fail('材料拓扑几何检查超过有界预算，未采用或退回普通拓扑。');}
}

/** Presence, including malformed values, must select strict inspection. */
export function hasMaterialTopology(doc:Doc):boolean {
  return record(doc?.metadata)&&Object.hasOwn(doc.metadata,'materialTopology');
}

/** Never return an unchecked graph, and never fall back to coordinate welding. */
export function inspectMaterialTopology(doc:Doc):MaterialTopologyInspection {
  try{return inspect(doc);}
  catch(error){return {ok:false,reason:`材料拓扑无效：${error instanceof Error?error.message:String(error)}`};}
}

/** Bind a checked indexed graph to this document; throws before any mutation. */
export function createMaterialTopology(doc:Doc,graph:FoldGraph,edgeSegmentIds:readonly string[],options:MaterialTopologyOptions={}):MaterialTopologyData {
  if(!record(options)||Object.keys(options).some(k=>!['foldedVertices','startingFace'].includes(k)))fail('材料拓扑创建选项无效。');
  const schema=materialTopologySchema(graph);
  const candidate={schema,graph,edgeSegmentIds:[...edgeSegmentIds],
    ...(options.foldedVertices===undefined?{}:{foldedVertices:options.foldedVertices}),
    ...(options.startingFace===undefined?{}:{startingFace:options.startingFace})};
  const result=inspectMaterialTopology({...doc,metadata:{...doc.metadata,materialTopology:candidate}});
  if(!result.ok)fail(result.reason);
  return {schema,graph:result.graph,edgeSegmentIds:result.edgeSegmentIds,
    ...(result.foldedVertices===undefined?{}:{foldedVertices:result.foldedVertices}),
    ...(result.startingFace===undefined?{}:{startingFace:result.startingFace})};
}
export function materialTopologySchema(graph:FoldGraph):MaterialTopologyData['schema']{return hasWeakMaterialRings(graph)?hasWeakMaterialBanks(graph)?'zhezhi-material-topology-v4':'zhezhi-material-topology-v3':graph.faces_holes?.some(rs=>rs.length)?'zhezhi-material-topology-v2':'zhezhi-material-topology-v1';}

function readPoints(value:unknown):Point[] {
  if(!Array.isArray(value)||value.length<3||value.length>MAX_VERTICES||value.some(p=>!Array.isArray(p)||p.length!==2||p.some(x=>!finite(x)||Math.abs(x)>1e6)))fail('需要 3–8192 个有限毫米二维材料顶点。');
  return (value as Point[]).map(p=>[...p]);
}
function tolerance(points:Point[]):number {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,magnitude=0;
  for(const [x,y] of points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);magnitude=Math.max(magnitude,Math.abs(x),Math.abs(y));}
  return Math.max(1e-9,Math.max(maxX-minX,maxY-minY)*1e-9,magnitude*Number.EPSILON*32);
}
function area(points:Point[],face:number[]):number {
  const origin=points[face[0]];return face.reduce((sum,a,k)=>sum+cross(origin,points[a],points[face[(k+1)%face.length]]),0)/2;
}
function onSegment(a:Point,b:Point,p:Point,eps:number):boolean {
  return Math.abs(cross(a,b,p))<=eps*distance(a,b)&&[0,1].every(j=>p[j]>=Math.min(a[j],b[j])-eps&&p[j]<=Math.max(a[j],b[j])+eps);
}
function properCross(a:Point,b:Point,c:Point,d:Point,eps:number):boolean {
  const sign=(a:Point,b:Point,p:Point)=>{const x=cross(a,b,p);return Math.abs(x)<=eps*distance(a,b)?0:Math.sign(x);};
  return sign(a,b,c)*sign(a,b,d)<0&&sign(c,d,a)*sign(c,d,b)<0;
}
function simpleFace(points:Point[],face:number[],eps:number,budget:Budget,label:string):number {
  const result=area(points,face);
  if(Math.abs(result)<=eps*eps)fail(`${label}退化。`);
  for(let i=0;i<face.length;i++){
    const a=points[face[i]],b=points[face[(i+1)%face.length]];
    if(distance(a,b)<=eps)fail(`${label}含零长或未分离的相邻角。`);
    for(let j=i+1;j<face.length;j++){
      if(j===i+1||i===0&&j===face.length-1)continue;
      budget.pair();const c=points[face[j]],d=points[face[(j+1)%face.length]];
      if(properCross(a,b,c,d,eps)||onSegment(a,b,c,eps)||onSegment(a,b,d,eps)||onSegment(c,d,a,eps)||onSegment(c,d,b,eps))fail(`${label}自交或有非相邻角重合。`);
    }
  }
  return result;
}
function ringGeometry(points:Point[],rings:number[][],eps:number,budget:Budget,label:string,allowContacts=false){
 const areas=rings.map((r,i)=>simpleFace(points,r,eps,budget,`${label}${i?'孔洞'+i:''}`)),outer=rings[0].map(v=>points[v]);
 for(let i=1;i<rings.length;i++){
  const samples=allowContacts?rings[i].flatMap((v,k)=>[points[v],[(points[v][0]+points[rings[i][(k+1)%rings[i].length]][0])/2,(points[v][1]+points[rings[i][(k+1)%rings[i].length]][1])/2] as Point]):[points[rings[i][0]]];
  if(areas[i]*areas[0]>=0||!samples.some(p=>materialPointInside(p,outer)))fail(`${label}孔洞必须在外圈内部并保持反向朝向。`);
  for(let j=0;j<i;j++){
   if(j&&materialPointInside(points[rings[i][0]],rings[j].map(v=>points[v]))||j&&materialPointInside(points[rings[j][0]],rings[i].map(v=>points[v])))fail(`${label}孔洞不能相互嵌套或覆盖。`);
   for(let a=0;a<rings[i].length;a++)for(let b=0;b<rings[j].length;b++){
    budget.pair();const p=points[rings[i][a]],q=points[rings[i][(a+1)%rings[i].length]],x=points[rings[j][b]],y=points[rings[j][(b+1)%rings[j].length]];
    const [pa,pb,xa,xb]=[rings[i][a],rings[i][(a+1)%rings[i].length],rings[j][b],rings[j][(b+1)%rings[j].length]];
    if(properCross(p,q,x,y,eps)||onSegment(p,q,x,eps)&&!(allowContacts&&(xa===pa||xa===pb))||onSegment(p,q,y,eps)&&!(allowContacts&&(xb===pa||xb===pb))||onSegment(x,y,p,eps)&&!(allowContacts&&(pa===xa||pa===xb))||onSegment(x,y,q,eps)&&!(allowContacts&&(pb===xa||pb===xb))||allowContacts&&key(pa,pb)===key(xa,xb))fail(`${label}内外边界相交或接触。`);
   }
  }
 }
 return areas.reduce((a,b)=>a+b,0);
}
/** Region cycles may be joined by real doubled crease darts. Zero-area
 * branches are checked against the region and never become paper holes. */
function weakRingGeometry(points:Point[],rings:number[][],edgeRings:number[][],edges:[number,number][],eps:number,budget:Budget,label:string,kinds:string[],allowBanks=false,winding=1):number{
 const aliases=new Map<number,number>(),byPoint=new Map<string,number>();
 for(const r of rings)for(const v of r){if(!allowBanks){aliases.set(v,v);continue;}const key=points[v].join(','),prior=byPoint.get(key);aliases.set(v,prior??v);if(prior===undefined)byPoint.set(key,v);}
 const geometricRings=rings.map(r=>r.map(v=>aliases.get(v)!)),cycles=geometricRings.flatMap(decomposeMaterialWalk),signed=cycles.filter(r=>r.length>=3).map(r=>({r,area:simpleFace(points,r,eps,budget,label)})),outer=signed.filter(c=>c.area*winding>0),holes=signed.filter(c=>c.area*winding<0);
 if(outer.length!==1)fail(`${label}需要唯一真实外圈。`);
 const region=[outer[0].r,...holes.map(c=>c.r)];ringGeometry(points,region,eps,budget,label);
 const regionEdges=new Set(region.flatMap(r=>r.map((a,i)=>key(a,r[(i+1)%r.length])))),boundary=new Set(region.flat()),uses=new Map<number,{a:number;b:number}[]>();
 geometricRings.forEach((r,h)=>r.forEach((a,k)=>{const e=edgeRings[h][k];uses.set(e,[...(uses.get(e)??[]),{a,b:r[(k+1)%r.length]}]);}));
 const banks=new Map<string,number[]>();if(allowBanks)for(const [e,rows]of uses)if(kinds[e]==='B'&&rows.length===1){const k=key(rows[0].a,rows[0].b);banks.set(k,[...(banks.get(k)??[]),e]);}
 for(const [e,rows]of uses){
  const edgeKey=key(rows[0].a,rows[0].b);
  if(rows.length===1){
   if(regionEdges.has(edgeKey))continue;
   const matches=banks.get(edgeKey),other=matches?.find(other=>other!==e),reverse=other===undefined?undefined:uses.get(other)?.[0];
   if(!allowBanks||kinds[e]!=='B'||matches?.length!==2||!reverse||rows[0].a!==reverse.b||rows[0].b!==reverse.a)fail(`${label}单面切口必须有两条身份独立、方向相反的真实边界侧。`);
  }else if(rows.length!==2||rows[0].a!==rows[1].b||rows[0].b!==rows[1].a||regionEdges.has(edgeKey))fail(`${label}只能沿同一 indexed 折痕反向重复。`);
  const [a,b]=edges[e],p=points[a],q=points[b],mid:Point=[p[0]/2+q[0]/2,p[1]/2+q[1]/2],inside=(z:Point)=>materialPointInside(z,region[0].map(v=>points[v]))&&!region.slice(1).some(r=>materialPointInside(z,r.map(v=>points[v])));
  if(!inside(mid))fail(`${label}重复折痕穿越纸外或孔洞。`);
  const ca=aliases.get(a)!,cb=aliases.get(b)!;
  for(const v of [a,b])if(!boundary.has(aliases.get(v)!)&&!inside(points[v]))fail(`${label}自由端点不在真实材料内部。`);
  for(const r of region)for(let k=0;k<r.length;k++){budget.pair();const x=r[k],y=r[(k+1)%r.length];if(properCross(p,q,points[x],points[y],eps)||onSegment(p,q,points[x],eps)&&x!==ca&&x!==cb||onSegment(p,q,points[y],eps)&&y!==ca&&y!==cb||onSegment(points[x],points[y],p,eps)&&x!==ca&&y!==ca||onSegment(points[x],points[y],q,eps)&&x!==cb&&y!==cb)fail(`${label}折痕与纸边存在未拆分接触。`);}
 }
 return signed.reduce((n,c)=>n+c.area,0);
}
/** Shared bounded ring geometry check for private layer triangulation. */
export function validateMaterialFaceRings(points:Point[],rings:number[][],eps:number,allowContacts=false){
 if(!Number.isFinite(eps)||eps<=0||!rings.length||rings.some(r=>r.length<3||new Set(r).size!==r.length||r.some(v=>!Number.isInteger(v)||v<0||v>=points.length))||!allowContacts&&new Set(rings.flat()).size!==rings.flat().length)fail('材料面环索引无效。');
 return ringGeometry(points,rings,eps,new Budget(),'层序原面',allowContacts);
}

function inspect(doc:Doc):Extract<MaterialTopologyInspection,{ok:true}> {
  if(!hasMaterialTopology(doc))fail('没有独立材料拓扑合同。');
  const saved=doc.metadata!.materialTopology;
  if(!record(saved)||!['zhezhi-material-topology-v1','zhezhi-material-topology-v2','zhezhi-material-topology-v3','zhezhi-material-topology-v4'].includes(saved.schema as string)||Object.keys(saved).some(k=>!['schema','graph','edgeSegmentIds','foldedVertices','startingFace'].includes(k)))fail('材料拓扑合同版本或字段无效。');
  if(!record(saved.graph))fail('缺少 indexed 材料图。');
  const allowBanks=saved.schema==='zhezhi-material-topology-v4',weak=allowBanks||saved.schema==='zhezhi-material-topology-v3';
  const raw=saved.graph,coords=readPoints(raw.vertices_coords),n=coords.length,eps=tolerance(coords),budget=new Budget();
  const index=(v:unknown):v is number=>Number.isInteger(v)&&typeof v==='number'&&v>=0&&v<n;
  if(!Array.isArray(raw.edges_vertices)||!raw.edges_vertices.length||raw.edges_vertices.length>MAX_EDGES||raw.edges_vertices.some(e=>!Array.isArray(e)||e.length!==2||e[0]===e[1]||e.some(v=>!index(v))))fail('材料边索引无效或超过容量。');
  const edges=(raw.edges_vertices as [number,number][]).map(e=>[...e] as [number,number]);
  if(!Array.isArray(raw.edges_assignment)||raw.edges_assignment.length!==edges.length||Array.from(raw.edges_assignment).some(k=>!['B','M','V','F','U'].includes(k)))fail('材料边赋型必须是 B/M/V/F/U 且与边数一致。');
  const kinds=raw.edges_assignment as string[];
  if(!Array.isArray(raw.edges_foldAngle)||raw.edges_foldAngle.length!==edges.length)fail('材料折角必须与边数一致。');
  const angles=raw.edges_foldAngle as (number|null)[];
  for(let e=0;e<angles.length;e++){
    const angle=angles[e];
    if(angle!==null&&(!finite(angle)||Math.abs(angle)>180)||kinds[e]==='M'&&angle!==null&&angle>0||kinds[e]==='V'&&angle!==null&&angle<0||['B','F'].includes(kinds[e])&&angle!==null&&angle!==0)fail('材料边折角与赋型不匹配。');
    if(distance(coords[edges[e][0]],coords[edges[e][1]])<=eps)fail('材料边为零长或低于可验证精度。');
  }
  if(!Array.isArray(raw.faces_vertices)||!raw.faces_vertices.length||raw.faces_vertices.length>MAX_FACES||raw.faces_vertices.some(f=>!Array.isArray(f)||f.length<3||!weak&&new Set(f).size!==f.length||f.some(v=>!index(v))))fail('材料面索引或面角无效。');
  const faces=(raw.faces_vertices as number[][]).map(f=>[...f]);
  const hasHoles=Object.hasOwn(raw,'faces_holes');
  if(!hasHoles&&(Object.hasOwn(raw,'faces_holeEdges')||Object.hasOwn(raw,'faces_holeFaces')))fail('孔洞面边或邻面声明缺少孔洞环。');
  if(hasHoles&&(!Array.isArray(raw.faces_holes)||raw.faces_holes.length!==faces.length||raw.faces_holes.some(row=>!Array.isArray(row)||row.some(r=>!Array.isArray(r)||r.length<(weak?2:3)||r.some(v=>!index(v))))))fail('材料孔洞环索引无效。');
  const holes=hasHoles?(raw.faces_holes as number[][][]).map(row=>row.map(r=>[...r])):faces.map(()=>[] as number[][]),rings=faces.map((r,f)=>[r,...holes[f]]);
  if(weak&&!hasWeakMaterialRings(raw as unknown as FoldGraph))fail('弱简单版本仅用于真实重复边界绕行，不能伪造标志。');
  if(weak&&hasWeakMaterialBanks(raw as unknown as FoldGraph)!==allowBanks)fail('同面独立切口边界必须使用v4；v3只允许同indexed折痕双向绕行。');
  if(!weak&&holes.some(rs=>rs.length)!==(saved.schema==='zhezhi-material-topology-v2'))fail('多环材料面必须使用 v2 合同；v1 只表示简单面。');
  if(!weak&&rings.some(rs=>new Set(rs.flat()).size!==rs.flat().length))fail('同一材料面的内外边界不能重复或共享顶点。');
  const corners=rings.reduce((sum,rs)=>sum+rs.flat().length,0);if(corners>MAX_CORNERS)fail('材料面角数超过验证预算。');
  if(!Array.isArray(raw.faces_edges)||raw.faces_edges.length!==faces.length||raw.faces_edges.some((row,f)=>!Array.isArray(row)||row.length!==faces[f].length||row.some(e=>!Number.isInteger(e)||e<0||e>=edges.length)||!weak&&new Set(row).size!==row.length))fail('必须提供完整逐角 faces_edges，不能按端点猜测切口边。');
  if(hasHoles&&(!Array.isArray(raw.faces_holeEdges)||raw.faces_holeEdges.length!==faces.length||raw.faces_holeEdges.some((row,f)=>!Array.isArray(row)||row.length!==holes[f].length||row.some((r,h)=>!Array.isArray(r)||r.length!==holes[f][h].length||r.some(e=>!Number.isInteger(e)||e<0||e>=edges.length)))))fail('孔洞逐角面边声明无效。');
  const faceEdges=(raw.faces_edges as number[][]).map(row=>[...row]),holeEdges=hasHoles?(raw.faces_holeEdges as number[][][]).map(rs=>rs.map(r=>[...r])):faces.map(()=>[] as number[][]),edgeRings=faceEdges.map((r,f)=>[r,...holeEdges[f]]),owners=edges.map(()=>[] as number[]),uses=edges.map(()=>[] as number[]);
  if(!weak&&edgeRings.some(rs=>new Set(rs.flat()).size!==rs.flat().length))fail('同一材料面的内外边界不能重复引用边。');
  edgeRings.forEach((rs,f)=>rs.forEach((row,h)=>row.forEach((e,k)=>{
    const r=rings[f][h],a=r[k],b=r[(k+1)%r.length];if(key(a,b)!==key(...edges[e]))fail('faces_edges 的角槽与材料边端点不匹配。');
    owners[e].push(f);uses[e].push(a===edges[e][0]?1:-1);
  })));
  if(!Array.isArray(raw.edges_faces)||raw.edges_faces.length!==edges.length||raw.edges_faces.some((row,e)=>!Array.isArray(row)||row.length!==owners[e].length||!weak&&new Set(row).size!==row.length||row.some(f=>!Number.isInteger(f)||!owners[e].includes(f))||[...row].sort((a,b)=>a-b).join(',')!==[...owners[e]].sort((a,b)=>a-b).join(',')))fail('edges_faces 与逐角面边归属不一致。');
  for(let e=0;e<edges.length;e++){
    if(owners[e].length!==(kinds[e]==='B'?1:2))fail('每条 B 必须恰有一个材料面；非 B 必须恰有两个材料面。');
    if(owners[e].length===2&&uses[e][0]===uses[e][1])fail('共享非 B 边必须由两个 CCW 面反向使用。');
  }
  if(!Array.isArray(raw.faces_faces)||raw.faces_faces.length!==faces.length||raw.faces_faces.some((row,f)=>!Array.isArray(row)||row.length!==faces[f].length))fail('必须提供完整逐角 faces_faces，边界槽也不能省略。');
  const faceNeighbors=faceEdges.map((row,f)=>row.map((e,k)=>{
    const expected=owners[e].length===2?owners[e][0]===f?owners[e][1]:owners[e][0]:null,actual=(raw.faces_faces as unknown[][])[f][k];
    if(expected===null?actual!==null&&actual!==undefined:actual!==expected)fail('faces_faces 的邻面角槽与独立边归属不匹配。');
    return expected;
  }));
  if(hasHoles&&(!Array.isArray(raw.faces_holeFaces)||raw.faces_holeFaces.length!==faces.length||raw.faces_holeFaces.some((row,f)=>!Array.isArray(row)||row.length!==holeEdges[f].length||row.some((r,h)=>!Array.isArray(r)||r.length!==holeEdges[f][h].length||r.some((other,k)=>other!==(owners[holeEdges[f][h][k]].length===2?owners[holeEdges[f][h][k]][0]===f?owners[holeEdges[f][h][k]][1]:owners[holeEdges[f][h][k]][0]:null))))))fail('孔洞逐角邻面与边归属不匹配。');
  const holeNeighbors=holeEdges.map((rs,f)=>rs.map(r=>r.map(e=>owners[e].length===2?owners[e][0]===f?owners[e][1]:owners[e][0]:null)));
  for(let f=0;f<faces.length;f++)if((weak?weakRingGeometry(coords,rings[f],edgeRings[f],edges,eps,budget,`CP 材料面 F${f+1}`,kinds,allowBanks):ringGeometry(coords,rings[f],eps,budget,`CP 材料面 F${f+1}`))<=0)fail('CP 材料面必须保持 CCW 朝向。');
  validateVertexFans(coords,kinds,rings,edgeRings,owners);
  const components=makeComponents(edges,rings,edgeRings,owners,faceNeighbors.map((r,f)=>[r,...holeNeighbors[f]].flat()),corners);
  validateEmbedding(coords,edges,kinds,owners,uses,components,eps,budget);
  if(!Array.isArray(saved.edgeSegmentIds)||saved.edgeSegmentIds.length!==edges.length||saved.edgeSegmentIds.some(id=>typeof id!=='string'||!id)||new Set(saved.edgeSegmentIds).size!==edges.length)fail('每条材料边需要独立且唯一的当前线段 ID。');
  const edgeSegmentIds=saved.edgeSegmentIds as string[];
  if(!Array.isArray(doc.segments)||doc.segments.length>2*MAX_EDGES)fail('当前工程缺少线段或超过材料绑定预算。');
  const current=new Map<string,Doc['segments'][number]>();
  for(const segment of doc.segments){
    if(!record(segment)||typeof segment.id!=='string'||!segment.id||current.has(segment.id))fail('当前工程线段 ID 缺失或重复。');
    current.set(segment.id,segment);
  }
  const same=(p:unknown,q:Point)=>Array.isArray(p)&&p.length===2&&p[0]===q[0]&&p[1]===q[1];
  edgeSegmentIds.forEach((id,e)=>{
    const segment=current.get(id),[a,b]=edges[e];
    if(!segment||segment.assignment!==kinds[e]||segment.angle!==angles[e]||
       !(same(segment.a,coords[a])&&same(segment.b,coords[b])||same(segment.a,coords[b])&&same(segment.b,coords[a])))fail('当前折痕几何、赋型、角度或 ID 已改变，材料来源已过期；不会焊接重建。');
  });
  const boundIds=new Set(edgeSegmentIds);
  if(doc.segments.some(s=>s.assignment!=='A'&&!boundIds.has(s.id)))fail('当前工程新增非辅助折痕，材料拓扑未更新；不会忽略或焊接重建。');
  let foldedVertices:Point[]|undefined;
  if(Object.hasOwn(saved,'foldedVertices')){
    if(weak&&hasUnresolvedMaterialHinge(raw as unknown as FoldGraph))fail('含同面悬空山谷或未指派折痕的弱简单图仅支持CP，不能附带折后位置。');
    foldedVertices=readPoints(saved.foldedVertices);if(foldedVertices.length!==n)fail('原折后顶点数与材料图不一致。');
    const ffEps=Math.max(eps,tolerance(foldedVertices)),signs:number[]=[];
    for(let f=0;f<faces.length;f++){
      signs.push(Math.sign(weak?weakRingGeometry(foldedVertices,rings[f],edgeRings[f],edges,ffEps,budget,`FF 材料面 F${f+1}`,kinds,allowBanks,Math.sign(area(foldedVertices,faces[f]))):ringGeometry(foldedVertices,rings[f],ffEps,budget,`FF 材料面 F${f+1}`)));
      const all=rings[f].flat();for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
        budget.pair();const a=all[i],b=all[j];
        if(Math.abs(distance(coords[a],coords[b])-distance(foldedVertices[a],foldedVertices[b]))>ffEps*20)fail('原折后形与当前 CP 材料面不等距。');
      }
    }
    for(let e=0;e<edges.length;e++)if(owners[e].length===2){
      const [a,b]=owners[e],sameSide=kinds[e]==='F';
      // Ordinary flat geometry treats U as fully folded and M/V as pi,
      // independently of source target angles. B has no across-bank hinge.
      if((signs[a]===signs[b])!==sameSide)fail('原 FF 共享边朝向与完全平折 M/V/U 或 F 语义不一致。');
    }
  }
  let startingFace:number|undefined;
  if(Object.hasOwn(saved,'startingFace')){
    if(!Number.isInteger(saved.startingFace)||typeof saved.startingFace!=='number'||saved.startingFace<0||saved.startingFace>=faces.length)fail('材料起始面不存在。');
    startingFace=saved.startingFace;
  }
  const graph:FoldGraph={vertices_coords:coords,edges_vertices:edges,edges_assignment:[...kinds],edges_foldAngle:[...angles],
    faces_vertices:faces,faces_edges:faceEdges,edges_faces:owners,
    // FOLD uses null for absent neighbors; canonicalize undefined for JSON.
    faces_faces:faceNeighbors as unknown as number[][],...(holes.some(r=>r.length)?{faces_holes:holes,faces_holeEdges:holeEdges,faces_holeFaces:holeNeighbors}:{})};
  return {ok:true,graph,edgeSegmentIds:[...edgeSegmentIds],components,tolerance:eps,
    ...(foldedVertices===undefined?{}:{foldedVertices}),...(startingFace===undefined?{}:{startingFace})};
}

function validateVertexFans(coords:Point[],kinds:string[],faces:number[][][],faceEdges:number[][][],owners:number[][]):void {
  const atVertex=coords.map(()=>[] as [number,number,number][]);
  faces.forEach((rs,f)=>rs.forEach((face,h)=>face.forEach((v,k)=>atVertex[v].push([f,h,k]))));
  const darts=owners.map(()=>[] as [number,number,number][]);faceEdges.forEach((rs,f)=>rs.forEach((r,h)=>r.forEach((e,k)=>darts[e].push([f,h,k]))));
  for(let v=0;v<coords.length;v++){
    const occurrences=atVertex[v];if(!occurrences.length)fail('材料图含不属于任何面的孤立顶点。');
    const byCorner=new Map(occurrences.map(([f,h,k],i)=>[`${f},${h},${k}`,i])),links=occurrences.map(()=>[] as number[]);let banks=0,totalAngle=0;
    occurrences.forEach(([f,h,k],i)=>{
      const rs=faceEdges[f][h],vs=faces[f][h];for(const [slot,incoming]of [[(k+rs.length-1)%rs.length,true],[k,false]] as const){const e=rs[slot];
        if(kinds[e]==='B'){banks++;continue;}
        const other=darts[e].find(([a,b,c])=>a!==f||b!==h||c!==slot);if(!other)fail('共享边丢失相反角槽。');const [a,b,c]=other,to=byCorner.get(`${a},${b},${incoming?c:(c+1)%faces[a][b].length}`);if(to===undefined)fail('共享边的材料顶点角断裂。');links[i].push(to);
      }
      const p=coords[vs[(k+vs.length-1)%vs.length]],q=coords[vs[(k+1)%vs.length]],a:Point=[q[0]-coords[v][0],q[1]-coords[v][1]],b:Point=[p[0]-coords[v][0],p[1]-coords[v][1]];
      let angle=Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1]);if(angle<=0)angle+=2*Math.PI;totalAngle+=angle;
    });
    const visited=new Set([0]),pending=[0];while(pending.length)for(const next of links[pending.pop()!]??[])if(!visited.has(next)){visited.add(next);pending.push(next);}
    if(visited.size!==occurrences.length||banks!==0&&banks!==2||links.some(ns=>ns.length>2))fail('一个 indexed 材料顶点必须是单个圆盘或边界面扇，不能只因同坐标焊接多个面扇。');
    if(banks===0&&(links.some(ns=>ns.length!==2)||Math.abs(totalAngle-2*Math.PI)>1e-7)||banks===2&&totalAngle>2*Math.PI+1e-7)fail('CP 材料顶点的面角重叠或内部圆盘不闭合。');
  }
}

function makeComponents(edges:[number,number][],faces:number[][][],faceEdges:number[][][],owners:number[][],neighbors:(number|null)[][],cornerCount:number):MaterialTopologyComponent[] {
  const darts=owners.map(()=>[] as [number,number,number][]);faceEdges.forEach((rs,f)=>rs.forEach((r,h)=>r.forEach((e,k)=>darts[e].push([f,h,k]))));
  const components:MaterialTopologyComponent[]=[],seen=new Set<number>();
  for(let seed=0;seed<faces.length;seed++){
    if(seen.has(seed))continue;const fs=[seed];seen.add(seed);
    for(let k=0;k<fs.length;k++)for(const other of neighbors[fs[k]])if(other!==null&&!seen.has(other)){seen.add(other);fs.push(other);}
    fs.sort((a,b)=>a-b);const es=[...new Set(fs.flatMap(f=>faceEdges[f].flat()))].sort((a,b)=>a-b),vs=[...new Set(fs.flatMap(f=>faces[f].flat()))].sort((a,b)=>a-b),boundaryLoops:number[][]=[],walked=new Set<string>();
    for(const f of fs)for(let h=0;h<faceEdges[f].length;h++)for(let k=0;k<faceEdges[f][h].length;k++){
      if(owners[faceEdges[f][h][k]].length!==1||walked.has(`${f},${h},${k}`))continue;
      const start=`${f},${h},${k}`,loop:number[]=[];let face=f,ring=h,corner=k,steps=0;
      while(!walked.has(`${face},${ring},${corner}`)){
        if(++steps>cornerCount)fail('材料边界绕行超过面角预算。');
        walked.add(`${face},${ring},${corner}`);loop.push(faces[face][ring][corner]);let next=(corner+1)%faces[face][ring].length,turns=0;
        while(owners[faceEdges[face][ring][next]].length===2){
          if(++turns>cornerCount)fail('材料顶点的边界面扇不闭合。');
          const edge=faceEdges[face][ring][next],other=darts[edge].find(([a,b,c])=>a!==face||b!==ring||c!==next);if(!other)fail('材料边界丢失共享边面角。');[face,ring,next]=other;next=(next+1)%faces[face][ring].length;
        }
        corner=next;
      }
      if(`${face},${ring},${corner}`!==start||loop.length<2)fail('材料边界绕行不闭合或退化。');boundaryLoops.push(loop);
    }
    const faceEuler=fs.reduce((n,f)=>n+2-faces[f].length,0);if(!boundaryLoops.length||vs.length-es.length+faceEuler!==2-boundaryLoops.length)fail('材料部件的边界与欧拉特征不一致。');
    components.push({faces:fs,vertices:vs,edges:es,boundaryLoops});
  }
  return components;
}

function validateEmbedding(coords:Point[],edges:[number,number][],kinds:string[],owners:number[][],uses:number[][],components:MaterialTopologyComponent[],eps:number,budget:Budget):void {
  const faceComponent:number[]=[];components.forEach((c,i)=>c.faces.forEach(f=>faceComponent[f]=i));
  const boxes=edges.map(([a,b],e)=>({e,minX:Math.min(coords[a][0],coords[b][0]),maxX:Math.max(coords[a][0],coords[b][0]),minY:Math.min(coords[a][1],coords[b][1]),maxY:Math.max(coords[a][1],coords[b][1])})).sort((a,b)=>a.minX-b.minX||a.e-b.e);
  let active:typeof boxes=[];
  for(const box of boxes){
    active=active.filter(other=>other.maxX+eps>=box.minX);
    for(const other of active){
      // Charge even disjoint Y/component candidates: filtering work is part
      // of the budget, not merely the expensive orientation predicates.
      budget.pair();
      if(faceComponent[owners[box.e][0]]!==faceComponent[owners[other.e][0]]||box.maxY+eps<other.minY||other.maxY+eps<box.minY)continue;
      const i=box.e,j=other.e,[a,b]=edges[i].map(v=>coords[v]),[c,d]=edges[j].map(v=>coords[v]);
      if(properCross(a,b,c,d,eps))fail('同一材料部件的 CP 边发生未拆分交叉。');
      const sameEnds=(distance(a,c)<=eps&&distance(b,d)<=eps)||(distance(a,d)<=eps&&distance(b,c)<=eps);
      if(sameEnds){
        const oriented=(e:number)=>uses[e][0]>0?edges[e]:[...edges[e]].reverse(),[ia,ib]=oriented(i),[ja,jb]=oriented(j);
        if(kinds[i]!=='B'||kinds[j]!=='B'||distance(coords[ia],coords[jb])>eps||distance(coords[ib],coords[ja])>eps)fail('同部件重合边必须是反向的独立单面切口两侧。');
        continue;
      }
      const interior=(p:Point,x:Point,y:Point)=>onSegment(x,y,p,eps)&&distance(p,x)>eps&&distance(p,y)>eps;
      if(interior(a,c,d)||interior(b,c,d)||interior(c,a,b)||interior(d,a,b))fail('同一材料部件的 CP 边有未拆分点边接触或重叠。');
    }
    active.push(box);
  }
}
