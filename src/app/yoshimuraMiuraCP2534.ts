/** Literal plane graph of original MakeYoshimuraMiuraOri, In2534/In2536. */
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Assignment,type Doc,type FoldGraph,type Point} from '../core/types';
export type YoshimuraMiuraRecipe={mode:'signed-columns';columnAnglesDeg:number[];rows:number;horizontalFoldDeg:number;unitSizeMm:number}|{mode:'uniform-runs';angleDeg:number;runs:number[];rows:number;horizontalFoldDeg:number;unitSizeMm:number};
export const YOSHIMURA_MIURA_MIXED_EXAMPLE:YoshimuraMiuraRecipe={mode:'signed-columns',columnAnglesDeg:[-25,30,-35,-40,45,-50],rows:2,horizontalFoldDeg:45,unitSizeMm:1};
export const YOSHIMURA_MIURA_RUNS_EXAMPLE:YoshimuraMiuraRecipe={mode:'uniform-runs',angleDeg:30,runs:[2,2],rows:6,horizontalFoldDeg:45,unitSizeMm:1};
export const YOSHIMURA_MIURA_DOUBLE_SPIRAL_EXAMPLE:YoshimuraMiuraRecipe={mode:'signed-columns',columnAnglesDeg:[70,-66,62,-58,54,-50,46,-42,38,-34,30,30,-34,38,-42,46,-50,54,-58,62,-66,70],rows:10,horizontalFoldDeg:60,unitSizeMm:1};
export type YoshimuraMiuraErrorCode='SOURCE_INPUT'|'SOURCE_CAPABILITY'|'SOURCE_SINGULARITY'|'NUMERIC_SOURCE'|'FINITE_GEOMETRY'|'MATERIAL_INTERFACE';
export class YoshimuraMiuraError extends Error{constructor(public readonly code:YoshimuraMiuraErrorCode,message:string){super(message);this.name='YoshimuraMiuraError';}}
const fail=(code:YoshimuraMiuraErrorCode,message:string):never=>{throw new YoshimuraMiuraError(code,message);},finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),obj=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),clone=<T>(x:T):T=>structuredClone(x),SCHEMA='original-yoshimura-miura-in2534-cp-v1';
export function validateYoshimuraMiuraRecipe(raw:unknown):YoshimuraMiuraRecipe{
 if(!obj(raw)||!['signed-columns','uniform-runs'].includes(raw.mode))return fail('SOURCE_INPUT','请选择有序列倾角或同角分段构造。');
 const ns=raw.mode==='signed-columns'?['mode','columnAnglesDeg','rows','horizontalFoldDeg','unitSizeMm']:['mode','angleDeg','runs','rows','horizontalFoldDeg','unitSizeMm'];
 if(Object.keys(raw).length!==ns.length||ns.some(k=>!Object.hasOwn(raw,k))||!finite(raw.rows)||!Number.isSafeInteger(raw.rows)||raw.rows<1||!finite(raw.horizontalFoldDeg)||!finite(raw.unitSizeMm)||raw.unitSizeMm<=0)fail('SOURCE_INPUT','须提供完整原参数、正整数行数和正毫米单位长度；没有自动夹取。');
 if(Math.abs(raw.horizontalFoldDeg)>=180||raw.horizontalFoldDeg===0)fail('SOURCE_CAPABILITY','当前可操作折角为 0 < |Γ| < 180°；原特殊边界及更大目标角不在本次 CP 采用能力内，未改输入。');
 const list=raw.mode==='signed-columns'?raw.columnAnglesDeg:raw.runs;
 if(!Array.isArray(list)||!list.length||list.some(x=>!finite(x))||raw.mode==='uniform-runs'&&(!finite(raw.angleDeg)||list.some(x=>!Number.isSafeInteger(x)||x<1)))fail('SOURCE_INPUT','列倾角须为非空有限数值列表；分段列数须为非空正整数列表。');
 const n=raw.mode==='signed-columns'?list.length:list.reduce((a:number,b:number)=>a+b,0),m=raw.rows;
 if(!Number.isSafeInteger(n)||!Number.isSafeInteger(2*m+n*(2*m+1))||(n+1)*(m+1)>8192||m*(n+1)>8192)fail('MATERIAL_INTERFACE','原参数已读取，但此图超过当前工程/材料顶点或线段预算；未简化列数或行数。');
 return clone(raw) as YoshimuraMiuraRecipe;
}
function degreeTrig(d:number){const reduced=d%360,q=Math.round(reduced/90),a=(reduced-q*90)*Math.PI/180,s=a===0?0:Math.sin(a),c=a===0?1:Math.cos(a),k=(q%4+4)%4;return k===0?{s,c}:k===1?{s:c,c:-s}:k===2?{s:-s,c:-c}:{s:-c,c:s};}
const ulp=(x:number)=>x===0?Number.MIN_VALUE:Math.abs(x)<2**-1022?Number.MIN_VALUE:2**(Math.floor(Math.log2(Math.abs(x)))-52);
export type YoshimuraMiuraSource={recipe:YoshimuraMiuraRecipe;columns:number[];rowPitch:number;anglesDeg:number[];columnWidths:number[];diagonalAnglesDeg:number[];tiltBases:number[];angleSigns:number[];classification:string;numericalPolicy:{model:string;intervalCertified:false;worldErrorEstimateMm:number;angleErrorEstimateDeg:number;sourceCoordinateReplayULPs:number};};
export function evaluateYoshimuraMiuraSource(raw:unknown):YoshimuraMiuraSource{
 const r=validateYoshimuraMiuraRecipe(raw),isList=r.mode==='signed-columns',angles=isList?r.columnAnglesDeg:Array(r.runs.reduce((a,b)=>a+b,0)).fill(r.angleDeg),n=angles.length,
 h=isList?[]:r.runs.flatMap((count,i)=>Array(count).fill(Math.sign(r.horizontalFoldDeg)*(i%2?-1:1))),columns=[0],widths:number[]=[],gp:number[]=[],tilts:number[]=[],signs:number[]=[],half=degreeTrig(r.horizontalFoldDeg/2);
 let pitch=1,tbase=Math.sign(angles[0]),asign=Math.sign(r.horizontalFoldDeg),condition=1;
 for(let i=0;i<n;i++){
  const trig=degreeTrig(angles[i]);
  if(isList&&trig.s===0)fail('SOURCE_SINGULARITY',`第 ${i+1} 列 Cot(α) 无有限值；原角保留。`);
  if(isList&&trig.c===0)fail('FINITE_GEOMETRY',`第 ${i+1} 列原宽 AbsCot(α) 为零，不能构成有限纸面。`);
  if(!isList&&trig.c===0)fail('SOURCE_SINGULARITY','原行高 AbsTan(α) 无有限值。');
  if(!isList&&trig.s===0)fail('FINITE_GEOMETRY','原行高 AbsTan(α) 为零，不能构成有限纸面。');
  const width=isList?Math.abs(trig.c/trig.s):1;if(!finite(width)||width<=0)fail('NUMERIC_SOURCE','原列宽在当前浮点精度下不可表示。');
  widths.push(width);columns.push(columns.at(-1)!+width);if(!isList)pitch=Math.abs(trig.s/trig.c);
  if(i){const change=isList?Math.sign(angles[i])!==Math.sign(angles[i-1]):h[i]!==h[i-1];tbase*= (isList?change:!change)?-1:1;asign*= (isList?change:!change)?1:-1;}
  const numerator=trig.c*half.c,zSign=Math.sign(numerator)*Math.sign(half.s),acot=numerator===0?Math.PI/2:zSign*Math.atan2(Math.abs(half.s),Math.abs(numerator));
  gp.push(-2*acot*180/Math.PI);tilts.push(tbase);signs.push(asign);condition=Math.max(condition,1/(trig.s*trig.s),1/(trig.c*trig.c));
 }
 if(!finite(pitch)||pitch<=0||columns.some((x,i)=>!finite(x)||i>0&&x<=columns[i-1]))fail('NUMERIC_SOURCE','当前源列或行间距不能保持严格分离；未移动、吸附或修复源点。');
 const scale=r.unitSizeMm,magnitude=Math.max(columns.at(-1)!,pitch*r.rows),worldErrorEstimateMm=Number.EPSILON*(32*n*magnitude+16*condition)*scale,angleErrorEstimateDeg=Number.EPSILON*256*180;
 if(!finite(worldErrorEstimateMm)||!finite(magnitude*scale))fail('NUMERIC_SOURCE','源坐标或工程误差估计溢出；源合法性与当前数值能力分开。');
 return {recipe:r,columns,rowPitch:pitch,anglesDeg:angles,columnWidths:widths,diagonalAnglesDeg:gp,tiltBases:tilts,angleSigns:signs,
  classification:angles.every(x=>x!==0&&Math.abs(x)<90)?'原规则 acute 构造':'原平面字面式；不满足 acute 参数说明，未认证其空间折叠',
  numericalPolicy:{model:'engineering-libm-and-cumulative-binary64-estimate-not-an-interval-certificate',intervalCertified:false,worldErrorEstimateMm,angleErrorEstimateDeg,sourceCoordinateReplayULPs:32*(n+1)}};
}
function indexedGraph(s:YoshimuraMiuraSource):FoldGraph{
 const r=s.recipe,n=s.anglesDeg.length,m=r.rows,points:Point[]=s.columns.flatMap(x=>Array.from({length:m+1},(_,j)=>[x*r.unitSizeMm,j*s.rowPitch*r.unitSizeMm] as Point)),edges:[number,number][]=[],types:Assignment[]=[],angles:number[]=[],add=(a:number,b:number,angle:number,boundary=false)=>{edges.push([a,b]);angles.push(angle);types.push(boundary?'B':angle>0?'V':angle<0?'M':'U');};
 for(let j=0;j<m;j++)add(j,j+1,0,true);
 for(let i=1;i<=n;i++){
  add((i-1)*(m+1),i*(m+1),0,true);
  for(let j=1;j<=m;j++){const a=(i-1)*(m+1)+j-1,b=a+m+1,tilt=s.tiltBases[i-1]*(j%2?1:-1);add(tilt>0?a:a+1,tilt>0?b+1:b,s.angleSigns[i-1]*s.diagonalAnglesDeg[i-1]);add(b+1,a+1,j===m?0:s.angleSigns[i-1]*r.horizontalFoldDeg,j===m);}
 }
 for(let j=0;j<m;j++)add(n*(m+1)+j,n*(m+1)+j+1,0,true);
 const outgoing=points.map(()=>[] as number[]);edges.forEach(([a,b])=>{outgoing[a].push(b);outgoing[b].push(a);});
 outgoing.forEach((ns,a)=>ns.sort((b,c)=>Math.atan2(points[b][1]-points[a][1],points[b][0]-points[a][0])-Math.atan2(points[c][1]-points[a][1],points[c][0]-points[a][0])));
 const used=new Set<string>(),faces:number[][]=[],area=(face:number[])=>{const o=points[face[0]];return face.reduce((a,v,i)=>{const w=points[face[(i+1)%face.length]];return a+(points[v][0]-o[0])*(w[1]-o[1])-(points[v][1]-o[1])*(w[0]-o[0]);},0);};
 for(const [x,y] of edges)for(const [aa,bb] of [[x,y],[y,x]]){if(used.has(`${aa},${bb}`))continue;let a=aa,b=bb;const face:number[]=[];
  while(!used.has(`${a},${b}`)){used.add(`${a},${b}`);face.push(a);const ns=outgoing[b],c=ns[(ns.indexOf(a)+ns.length-1)%ns.length];a=b;b=c;if(face.length>2*edges.length)fail('FINITE_GEOMETRY','面遍历未闭合。');}
  if(a!==aa||b!==bb)fail('FINITE_GEOMETRY','当前有限面遍历进入其它环。');if(area(face)>0)faces.push(face);
 }
 const byEdge=new Map(edges.map(([a,b],i)=>[`${Math.min(a,b)},${Math.max(a,b)}`,i])),faceEdges=faces.map(f=>f.map((a,k)=>byEdge.get(`${Math.min(a,f[(k+1)%f.length])},${Math.max(a,f[(k+1)%f.length])}`)!)),owners=edges.map(()=>[] as number[]);faceEdges.forEach((es,f)=>es.forEach(e=>owners[e].push(f)));
 return {vertices_coords:points,edges_vertices:edges,edges_assignment:types,edges_foldAngle:angles,faces_vertices:faces,faces_edges:faceEdges,edges_faces:owners,faces_faces:faceEdges.map((es,f)=>es.map(e=>owners[e].length===1?null:owners[e].find(g=>g!==f))) as unknown as number[][]};
}
/** Signs use integers representing the actual binary64 coordinates, without welding. */
function finiteProof(g:FoldGraph,n:number,m:number){
 const points=g.vertices_coords,edges=g.edges_vertices,faces=g.faces_vertices!,buffer=new ArrayBuffer(8),v=new DataView(buffer),dyad=(x:number):[bigint,number]=>{if(!finite(x))fail('NUMERIC_SOURCE','世界点非有限。');if(x===0)return [0n,0];v.setFloat64(0,x,false);const bits=v.getBigUint64(0,false),exp=Number(bits>>52n&2047n);return [(bits>>63n?-1n:1n)*((bits&((1n<<52n)-1n))+(exp?1n<<52n:0n)),exp?exp-1075:-1074];},raw=points.map(p=>p.map(dyad)),minimumExponent=Math.min(...raw.flat().filter(([x])=>x!==0n).map(([,e])=>e)),p=raw.map(row=>row.map(([x,e])=>x<<BigInt(e-minimumExponent))),cross=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[b][1]-p[a][1])*(p[c][0]-p[a][0]),on=(a:number,b:number,c:number)=>cross(a,b,c)===0n&&[0,1].every(k=>p[c][k]>=(p[a][k]<p[b][k]?p[a][k]:p[b][k])&&p[c][k]<=(p[a][k]>p[b][k]?p[a][k]:p[b][k])),sign=(x:bigint)=>x>0n?1:x<0n?-1:0;
 if(new Set(points.map(p=>p.join(','))).size!==points.length)fail('FINITE_GEOMETRY','不同源顶点同坐标；未吸附。');
 for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){const id=i*(m+1)+j;if(points[id][0]!==points[i*(m+1)][0]||points[id][1]!==points[j][1]||i>0&&points[id][0]<=points[(i-1)*(m+1)+j][0]||j>0&&points[id][1]<=points[id-1][1])fail('FINITE_GEOMETRY','原列/行坐标失去严格有序矩形网格。');}
 if(points[0][0]!==0||points[0][1]!==0)fail('FINITE_GEOMETRY','原源零点必须严格为(0,0)。');
 const boxes=edges.map(([a,b])=>[Math.min(points[a][0],points[b][0]),Math.max(points[a][0],points[b][0]),Math.min(points[a][1],points[b][1]),Math.max(points[a][1],points[b][1])]),order=edges.map((_,i)=>i).sort((a,b)=>boxes[a][0]-boxes[b][0]||a-b);let active:number[]=[],testedPairs=0;
 for(const i of order){active=active.filter(j=>boxes[j][1]>=boxes[i][0]);for(const j of active){if(boxes[i][3]<boxes[j][2]||boxes[j][3]<boxes[i][2])continue;const [a,b]=edges[i],[c,d]=edges[j];if(new Set([a,b,c,d]).size<4)continue;testedPairs++;if(sign(cross(a,b,c))*sign(cross(a,b,d))<0&&sign(cross(c,d,a))*sign(cross(c,d,b))<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))fail('FINITE_GEOMETRY','原CP边发生真实交叉、触点或重叠。');}active.push(i);}
 let total=0n;for(const face of faces){const area=face.reduce((sum,a,i)=>sum+cross(face[0],a,face[(i+1)%face.length]),0n);if(area<=0n)fail('FINITE_GEOMETRY','实际材料面非正。');total+=area;}
 if(total!==2n*p.at(-1)![0]*p.at(-1)![1])fail('FINITE_GEOMETRY','所有实际面没有恰好一次覆盖原矩形。');
 if(points.length!==(n+1)*(m+1)||edges.length!==2*m+n*(2*m+1)||faces.length!==m*(n+1)||g.edges_assignment.filter(k=>k==='B').length!==2*m+2*n||g.edges_faces!.some((owners,e)=>owners.length!==(g.edges_assignment[e]==='B'?1:2)))fail('FINITE_GEOMETRY','源图数量、纸边或一次覆盖不一致。');
 return {arithmetic:'exact-dyadic-signs-and-area-on-actual-binary64-graph',vertices:points.length,edges:edges.length,faces:faces.length,boundaryEdges:2*m+2*n,testedNonincidentPairs:testedPairs,rectangleCoveredExactlyOnce:true,boundaryUsesOnceInteriorUsesTwice:true,internalVerticalCreasesAdded:false,coordinateWelding:false};
}
export function buildYoshimuraMiuraCP(raw:unknown):Doc{return buildFromSource(evaluateYoshimuraMiuraSource(raw));}
function buildFromSource(s:YoshimuraMiuraSource):Doc{
 const graph=indexedGraph(s),r=s.recipe,n=s.anglesDeg.length,m=r.rows,ids=graph.edges_vertices.map((_,i)=>`yoshimura-miura-edge-${i}`),proof=finiteProof(graph,n,m),doc:Doc={schemaVersion:2,name:'原 Yoshimura/Miura 混合 CP',paper:{width:graph.vertices_coords.at(-1)![0],height:graph.vertices_coords.at(-1)![1]},segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:[...graph.vertices_coords[a]],b:[...graph.vertices_coords[b]],assignment:graph.edges_assignment[i] as Assignment,angle:graph.edges_foldAngle[i]}))};
 try{validateDoc(doc);doc.metadata={materialTopology:createMaterialTopology(doc,graph,ids),originalYoshimuraMiura2534:{schema:SCHEMA,recipe:clone(r),nativeSource:{notebookSHA256:'19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9',function:r.mode==='signed-columns'?'MakeYoshimuraMiuraOri[alist,nv,Γ,opts]':'MakeYoshimuraMiuraOri[α,{runs,nv},Γ,opts]',nativeColumns:s.columns,nativeRowPitch:s.rowPitch,diagonalAnglesDeg:s.diagonalAnglesDeg,tiltBases:s.tiltBases,angleSigns:s.angleSigns,cornerIndicesZeroBased:[[0,n*(m+1)],[m,(n+1)*(m+1)-1]],unitSizeMm:r.unitSizeMm,scalingAppliedOnce:true,originalFoldAnglesRetained:true},classification:s.classification,numericalPolicy:s.numericalPolicy,finitePaperProof:proof,scope:{originalPlaneCP:true,originalFoldGraph3DReproduced:false,rigid3DCertified:false,flatLayerCertified:false,collisionCertified:false}}};}
 catch(e){fail('MATERIAL_INTERFACE',`原源与精确有限图已核；当前工程/材料接口不能采用：${(e as Error).message}`);}return doc;
}
function deepFreeze<T>(x:T):T{if(x&&typeof x==='object'){Object.values(x).forEach(deepFreeze);Object.freeze(x);}return x;}
export function yoshimuraMiuraSourceKey(raw:unknown){return JSON.stringify(validateYoshimuraMiuraRecipe(raw));}
export function prepareYoshimuraMiuraPreview(raw:unknown){const source=deepFreeze(evaluateYoshimuraMiuraSource(raw));return {key:yoshimuraMiuraSourceKey(source.recipe),source,build:()=>buildFromSource(source)};}
/** Known identities are exact; libm-derived coordinates/angles use the declared engineering budget. */
export function yoshimuraMiuraSourceMatches(doc:Doc):boolean{
 try{
  const saved=doc.metadata?.originalYoshimuraMiura2534;if(!obj(saved)||saved.schema!==SCHEMA)return false;const s=evaluateYoshimuraMiuraSource(saved.recipe),expected=buildFromSource(s),actual=inspectMaterialTopology(doc);if(!actual.ok)return false;const expectedMaterial=inspectMaterialTopology(expected);if(!expectedMaterial.ok)return false;
  const known=expected.metadata!.originalYoshimuraMiura2534 as Record<string,any>,a=actual.graph,b=expectedMaterial.graph,near=(x:number,y:number,bound:number,ulps:number)=>finite(x)&&Math.abs(x-y)<=Math.max(bound,ulps*ulp(y));
  if(doc.segments.length!==expected.segments.length||actual.edgeSegmentIds.join(',')!==expectedMaterial.edgeSegmentIds.join(',')||a.vertices_coords.length!==b.vertices_coords.length||JSON.stringify(a.edges_vertices)!==JSON.stringify(b.edges_vertices)||JSON.stringify(a.edges_assignment)!==JSON.stringify(b.edges_assignment)||JSON.stringify(a.faces_vertices)!==JSON.stringify(b.faces_vertices)||Object.keys(saved).sort().join(',')!==Object.keys(known).sort().join(','))return false;
  for(let i=0;i<a.vertices_coords.length;i++)for(let k=0;k<2;k++){const x=a.vertices_coords[i][k],y=b.vertices_coords[i][k];if(y===0||s.recipe.mode==='uniform-runs'&&k===0){if(x!==y)return false;}else if(!near(x,y,s.numericalPolicy.worldErrorEstimateMm,s.numericalPolicy.sourceCoordinateReplayULPs))return false;}
  if(doc.paper.width!==a.vertices_coords.at(-1)![0]||doc.paper.height!==a.vertices_coords.at(-1)![1])return false;
  for(let e=0;e<a.edges_foldAngle.length;e++){const x=a.edges_foldAngle[e],y=b.edges_foldAngle[e],offset=e-s.recipe.rows,diagonal=offset>=0&&offset<s.anglesDeg.length*(2*s.recipe.rows+1)&&offset%(2*s.recipe.rows+1)%2===1;if(!diagonal){if(x!==y)return false;}else if(typeof x!=='number'||typeof y!=='number'||!near(x,y,s.numericalPolicy.angleErrorEstimateDeg,32))return false;}
  if(!obj(saved.nativeSource)||!Array.isArray(saved.nativeSource.nativeColumns)||!finite(saved.nativeSource.nativeRowPitch))return false;
  for(let i=0;i<a.vertices_coords.length;i++){const column=Math.floor(i/(s.recipe.rows+1)),row=i%(s.recipe.rows+1);if(a.vertices_coords[i][0]!==saved.nativeSource.nativeColumns[column]*s.recipe.unitSizeMm||a.vertices_coords[i][1]!==row*saved.nativeSource.nativeRowPitch*s.recipe.unitSizeMm)return false;}
  for(let col=0;col<s.anglesDeg.length;col++)for(let row=0;row<s.recipe.rows;row++){const edge=s.recipe.rows+col*(2*s.recipe.rows+1)+1+2*row;if(a.edges_foldAngle[edge]!==saved.nativeSource.angleSigns[col]*saved.nativeSource.diagonalAnglesDeg[col])return false;}
  const actualProof=finiteProof(a,s.anglesDeg.length,s.recipe.rows);if(JSON.stringify(saved.finitePaperProof)!==JSON.stringify(actualProof))return false;
  const same=(x:any,y:any,path:string):boolean=>{if(typeof y==='number'){if(path==='nativeSource.nativeColumns.0'||s.recipe.mode==='uniform-runs'&&path.startsWith('nativeSource.nativeColumns.')||s.recipe.mode==='signed-columns'&&path==='nativeSource.nativeRowPitch'||path.startsWith('nativeSource.tiltBases.')||path.startsWith('nativeSource.angleSigns.')||path.startsWith('nativeSource.cornerIndicesZeroBased.')||path==='nativeSource.unitSizeMm'||path.startsWith('recipe.')||path==='numericalPolicy.sourceCoordinateReplayULPs'||path==='numericalPolicy.angleErrorEstimateDeg')return x===y;if(path==='numericalPolicy.worldErrorEstimateMm'&&(!finite(x)||x<0))return false;return near(x,y,path.startsWith('nativeSource.diagonalAnglesDeg')?s.numericalPolicy.angleErrorEstimateDeg:path.startsWith('nativeSource.nativeColumns')||path==='nativeSource.nativeRowPitch'?s.numericalPolicy.worldErrorEstimateMm/s.recipe.unitSizeMm:Math.abs(y)*Number.EPSILON*32,32*(s.anglesDeg.length+1));}if(Array.isArray(y))return Array.isArray(x)&&x.length===y.length&&y.every((v,i)=>same(x[i],v,`${path}.${i}`));if(obj(y))return obj(x)&&Object.keys(x).sort().join(',')===Object.keys(y).sort().join(',')&&Object.keys(y).every(k=>same(x[k],y[k],path?`${path}.${k}`:k));return x===y;};
  // Proof is derived from the actual graph; compare it above, not with a different runtime's rounded source replay.
  const withoutProof=(v:Record<string,any>)=>Object.fromEntries(Object.entries(v).filter(([k])=>k!=='finitePaperProof'));
  return same(withoutProof(saved),withoutProof(known),'');
 }catch{return false;}
}
/** Explicit reconstruction reads a validated source recipe even after legitimate CP editing. */
export function yoshimuraMiuraRecipeFromDoc(doc:Doc):YoshimuraMiuraRecipe|null{try{const saved=doc.metadata?.originalYoshimuraMiura2534;return obj(saved)&&saved.schema===SCHEMA&&Object.hasOwn(saved,'recipe')?validateYoshimuraMiuraRecipe(saved.recipe):null;}catch{return null;}}
