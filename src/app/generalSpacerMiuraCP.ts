/** Finite literal CPs of MakeGeneralTMiuraMarsOri (In2493) and MakeSpacerMiuraOri (In2529).
 * Source units are millimetres once; no welding, translation, clipping or repair is performed. */
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Assignment,type Doc,type FoldGraph,type Point} from '../core/types';

export type GeneralSpacerMiuraRecipe=
 |{model:'general';sectorAnglesDeg:[number,number,number,number];minorFoldAngleDeg:number;branch:'minor-first';horizontalLengthsMm:number[];verticalLengthsMm:number[]}
 |{model:'spacer';sectorAngleDeg:number;dhMm:number;dvMm:number;dsMm:number;columns:number;rows:number;majorFoldAngleDeg:number;offset:number};
export type GeneralSpacerMiuraErrorCode='SOURCE_INPUT'|'SOURCE_CAPABILITY'|'SOURCE_SINGULARITY'|'NUMERIC_SOURCE'|'FINITE_GEOMETRY'|'MATERIAL_INTERFACE';
export class GeneralSpacerMiuraError extends Error {constructor(public readonly code:GeneralSpacerMiuraErrorCode,message:string){super(message);this.name='GeneralSpacerMiuraError';}}
const fail=(code:GeneralSpacerMiuraErrorCode,message:string):never=>{throw new GeneralSpacerMiuraError(code,message);},
 finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),
 clone=<T>(x:T):T=>structuredClone(x),SCHEMA='original-general-spacer-miura-finite-cp-v1',NAMESPACE='originalGeneralSpacerMiura',
 SHA='19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9',RAD=Math.PI/180,MAX_PAIRS=2_000_000;
const mod=(x:number,n:number)=>(x%n+n)%n;
const exactKeys=(x:Record<string,any>,ks:string[])=>Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k));
export function validateGeneralSpacerMiuraRecipe(raw:unknown):GeneralSpacerMiuraRecipe {
 if(!record(raw)||!['general','spacer'].includes(raw.model))return fail('SOURCE_INPUT','请选择一般非镜对称网格或嫁接间隔 Miura。');
 let n:number,m:number;
 if(raw.model==='general'){
  if(!exactKeys(raw,['model','sectorAnglesDeg','minorFoldAngleDeg','branch','horizontalLengthsMm','verticalLengthsMm'])||raw.branch!=='minor-first'||!Array.isArray(raw.sectorAnglesDeg)||raw.sectorAnglesDeg.length!==4||raw.sectorAnglesDeg.some((a:unknown)=>!finite(a)||a<=0||a>=180)||!finite(raw.minorFoldAngleDeg))fail('SOURCE_INPUT','原种子须为四个有序扇区角、minor-first 分支及有限 minor 折角。');
  const a=raw.sectorAnglesDeg;if(a[0]+a[2]!==180||a[1]+a[3]!==180)fail('SOURCE_INPUT','原 general 入口要求交替扇区角精确互补为 180°；没有自动改角。');
  if(a[0]+a[3]===180)fail('SOURCE_SINGULARITY','原 In2301 straight-major 分支拒绝；不能用此 minor 折角生成原种子。');
  if(raw.minorFoldAngleDeg===0||Math.abs(raw.minorFoldAngleDeg)>=180)fail('SOURCE_CAPABILITY','本次有限入口支持 0 < |minor 折角| < 180°；原零角种子需另一 TVertex 来源，未静默替换。');
  for(const k of ['horizontalLengthsMm','verticalLengthsMm'])if(!Array.isArray(raw[k])||!raw[k].length||raw[k].some((d:unknown)=>!finite(d)||d<=0))fail('SOURCE_INPUT','两条原边长列须非空且逐项为有限正毫米数值。');
  n=raw.horizontalLengthsMm.length;m=raw.verticalLengthsMm.length;
 }else{
  if(!exactKeys(raw,['model','sectorAngleDeg','dhMm','dvMm','dsMm','columns','rows','majorFoldAngleDeg','offset'])||!finite(raw.sectorAngleDeg)||raw.sectorAngleDeg<=0||raw.sectorAngleDeg>=180||!finite(raw.majorFoldAngleDeg)||!['dhMm','dvMm','dsMm'].every(k=>finite(raw[k])&&raw[k]>0)||!['columns','rows'].every(k=>Number.isSafeInteger(raw[k])&&raw[k]>0)||!Number.isSafeInteger(raw.offset))fail('SOURCE_INPUT','须提供原扇区角、三条正长度、正整数行列、major 折角和整数 offset。');
  if(raw.sectorAngleDeg===90)fail('SOURCE_SINGULARITY','原 major-first straight-major 分支在 α=90° 拒绝。');
  if(raw.majorFoldAngleDeg===0||Math.abs(raw.majorFoldAngleDeg)>=180)fail('SOURCE_CAPABILITY','本次有限入口支持 0 < |major 折角| < 180°；奇异边界未改输入。');
  n=raw.columns;m=raw.rows;
  if(!Number.isSafeInteger(m+raw.offset))fail('SOURCE_CAPABILITY','原行号加 offset 超出精确整数范围；offset 未归一化。');
 }
 const vertices=(n+1)*(m+1),edges=n*(m+1)+(n+1)*m,faces=n*m;
 if(!Number.isSafeInteger(edges)||vertices>8192||faces>8192||edges*(edges-1)/2>MAX_PAIRS)fail('SOURCE_CAPABILITY','原行列已读取，但超过当前有限图或精确几何检查预算；没有删行列或删边。');
 return clone(raw) as GeneralSpacerMiuraRecipe;
}
export function generalSpacerMiuraPreset(model:GeneralSpacerMiuraRecipe['model']='general'):GeneralSpacerMiuraRecipe {
 return model==='general'?{model,sectorAnglesDeg:[130,60,50,120],minorFoldAngleDeg:-30,branch:'minor-first',horizontalLengthsMm:[1,1.3,1,1.3,1,1.3],verticalLengthsMm:[1.3,1,1.3,1,1.3,1]}:
 {model,sectorAngleDeg:60,dhMm:1,dvMm:1,dsMm:1,columns:6,rows:7,majorFoldAngleDeg:-150,offset:0};
}
/** Exact quadrant identities, libm only for a reduced angle. */
function trigDeg(d:number){const q=Math.round(d/90),a=(d-q*90)*RAD,s=a===0?0:Math.sin(a),c=a===0?1:Math.cos(a);switch(mod(q,4)){case 0:return {s,c};case 1:return {s:c,c:-s};case 2:return {s:-s,c:-c};default:return {s:-c,c:s};}}
const cross2=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
function intersect(p:Point,u:Point,q:Point,v:Point){const det=cross2(u,v),delta:Point=[q[0]-p[0],q[1]-p[1]];
 if(det===0)return fail('SOURCE_SINGULARITY','原 LineInt2D 射线平行，没有唯一源点。');
 const t=cross2(delta,v)/det,result:Point=[p[0]+t*u[0],p[1]+t*u[1]];
 if(!finite(t)||result.some(x=>!finite(x)))fail('NUMERIC_SOURCE','原射线交点在当前 binary64 下不有限。');
 return {point:result,condition:1/Math.abs(det),signedStep:t};
}
function seed(r:GeneralSpacerMiuraRecipe){
 if(r.model==='general'){
  const a=r.sectorAnglesDeg,t1=trigDeg((a[0]+a[1])/2),t2=trigDeg((a[0]-a[1])/2),mu=t1.s/t2.s,g=r.minorFoldAngleDeg,major=2*Math.atan(mu*Math.tan(g*RAD/2))/RAD;
  if(!finite(mu)||!finite(major)||major===0)fail('NUMERIC_SOURCE','原 flat-foldable minor-first 相邻折角公式数值失去分支。');
  const directions=[0,a[0],a[0]+a[1],360-a[3]],rays:Point[]=directions.map(d=>{const {s,c}=trigDeg(d);return [c,s];});
  return {sectorsDeg:clone(a),dihedralsDeg:[g,major,-g,major],creaseVectors:rays,formulaCell:'In[2301]',branch:'minor-first',condition:Math.max(1,1/Math.abs(t2.s))};
 }
 // In2311 straight-minor major-first branch for {Pi-alpha,Pi/2,Pi/2,alpha}.
 const {s,c}=trigDeg(r.sectorAngleDeg),g1=r.majorFoldAngleDeg,g3=2*Math.asin(Math.sin(g1*RAD/2)*s)/RAD,
  cot=c/s,cot1=1/Math.tan(g1*RAD/2),cot3=1/Math.tan(g3*RAD/2),num=(cot1/s+cot3)*cot,den=-cot*cot,
  ratio=num/den,g4=2*(ratio===0?Math.PI/2:Math.sign(ratio)*Math.atan2(Math.abs(den),Math.abs(num)))/RAD;
 if(![g3,g4,ratio].every(finite)||g3===0||g4===0)fail('NUMERIC_SOURCE','原 spacer major-first 折角在当前浮点精度下失去有向分支。');
 return {sectorsDeg:[180-r.sectorAngleDeg,90,90,r.sectorAngleDeg],dihedralsDeg:[g1,-g4,g3,g4],creaseVectors:[] as Point[],formulaCell:'In[2311]',branch:'major-first / straight-minor',condition:Math.max(1,1/Math.abs(s),1/Math.abs(c),1/Math.abs(Math.sin(g3*RAD/2)))};
}
function quadGraph(points:Point[],n:number,m:number,h:(i:number,j:number)=>number,v:(i:number,j:number)=>number):FoldGraph {
 const id=(i:number,j:number)=>j*(n+1)+i,edges:[number,number][]=[],assignments:Assignment[]=[],angles:number[]=[],faces:number[][]=[];
 const add=(a:number,b:number,border:boolean,g:number)=>{edges.push([a,b]);angles.push(border?0:g);assignments.push(border?'B':g<0?'M':g>0?'V':'U');};
 for(let j=0;j<=m;j++)for(let i=1;i<=n;i++)add(id(i-1,j),id(i,j),j===0||j===m,h(i,j));
 for(let j=1;j<=m;j++)for(let i=0;i<=n;i++)add(id(i,j-1),id(i,j),i===0||i===n,v(i,j));
 for(let j=0;j<m;j++)for(let i=0;i<n;i++)faces.push([id(i,j),id(i+1,j),id(i+1,j+1),id(i,j+1)]);
 const offset=n*(m+1),faceEdges=faces.map((_,f)=>{const i=f%n,j=Math.floor(f/n);return [j*n+i,offset+j*(n+1)+i+1,(j+1)*n+i,offset+j*(n+1)+i];}),owners=edges.map(()=>[] as number[]);
 faceEdges.forEach((es,f)=>es.forEach(e=>owners[e].push(f)));
 return {vertices_coords:points,edges_vertices:edges,edges_assignment:assignments,edges_foldAngle:angles,faces_vertices:faces,faces_edges:faceEdges,edges_faces:owners,faces_faces:faceEdges.map((es,f)=>es.map(e=>owners[e].find(g=>g!==f)??null)) as unknown as number[][]};
}
export type GeneralSpacerMiuraSource={recipe:GeneralSpacerMiuraRecipe;seed:ReturnType<typeof seed>;graph:FoldGraph;sourceGeometry:{nativeOrigin:Point;cornerIndicesZeroBased:number[][];rowKinds:number[];rowVectors:Point[];signedInteriorSteps:number[]};numericalPolicy:{model:string;intervalCertified:false;worldErrorEstimateMm:number;angleErrorEstimateDeg:number;replayULPs:number;maximumLineIntersectionCondition:number}};
export function evaluateGeneralSpacerMiuraSource(raw:unknown):GeneralSpacerMiuraSource {
 return evaluateSource(raw);
}
function evaluateSource(raw:unknown,storedSeed?:ReturnType<typeof seed>,storedRowVectors?:Point[]):GeneralSpacerMiuraSource {
 const r=validateGeneralSpacerMiuraRecipe(raw),s=storedSeed?clone(storedSeed):seed(r),n=r.model==='general'?r.horizontalLengthsMm.length:r.columns,m=r.model==='general'?r.verticalLengthsMm.length:r.rows,points:Point[]=Array.from({length:(n+1)*(m+1)},()=>[0,0]),id=(i:number,j:number)=>j*(n+1)+i,rowKinds:number[]=[],rowVectors:Point[]=[],steps:number[]=[];
 let condition=s.condition;
 if(r.model==='general'){
  for(let i=1;i<=n;i++){const p=points[id(i-1,0)],u=s.creaseVectors[i%2?0:2],d=r.horizontalLengthsMm[i-1]*(i%2?1:-1);points[id(i,0)]=[p[0]+d*u[0],p[1]+d*u[1]];}
  for(let j=1;j<=m;j++){const p=points[id(0,j-1)],u=s.creaseVectors[j%2?1:3],d=r.verticalLengthsMm[j-1]*(j%2?1:-1);points[id(0,j)]=[p[0]+d*u[0],p[1]+d*u[1]];
   for(let i=1;i<=n;i++){const x=intersect(points[id(i-1,j)],s.creaseVectors[(i+j)%2?0:2],points[id(i,j-1)],s.creaseVectors[j%2?1:3]);points[id(i,j)]=x.point;steps.push(x.signedStep);condition=Math.max(condition,x.condition);}}
 }else{
  const {c, s:sn}=trigDeg(r.sectorAngleDeg);rowVectors.push(...(storedRowVectors?clone(storedRowVectors):[[0,1],[c,sn],[0,1],[-c,sn]] as Point[]));for(let i=0;i<=n;i++)points[id(i,0)]=[i*r.dhMm,0];
  for(let j=1;j<=m;j++){const kind=mod(j+r.offset,4);rowKinds.push(kind);const rv=rowVectors[kind],length=kind%2===0?r.dsMm:r.dvMm,d:Point=[rv[0]*length,rv[1]*length];for(let i=0;i<=n;i++){const p=points[id(i,j-1)];points[id(i,j)]=[p[0]+d[0],p[1]+d[1]];}}
 }
 if(points.some(p=>p.some(x=>!finite(x))))fail('NUMERIC_SOURCE','原递推坐标不有限。');
 // MakeQuadMesh callbacks use the starting vertex's zero-based i,j; the general In2493 manual loops use ending i/j.
 const g=s.dihedralsDeg,graph=quadGraph(points,n,m,(i,j)=>r.model==='general'?(j%2?-1:1)*g[i%2?0:2]:g[mod(Math.ceil((j+r.offset)/2),2)?3:1]*(i%2?1:-1),
  (i,j)=>r.model==='general'?(i%2?-1:1)*g[j%2?1:3]:g[mod(j-1+r.offset,2)?2:0]*(i%2?1:-1)),magnitude=Math.max(1,...points.flat().map(Math.abs)),depth=n+m+1,
  estimate=Number.EPSILON*128*depth*magnitude*condition;
 if(!finite(estimate)||estimate>magnitude*1e-7)fail('NUMERIC_SOURCE','原交点条件数超过本次可核的工程误差能力；未修复源参数。');
 return {recipe:r,seed:s,graph,sourceGeometry:{nativeOrigin:[0,0],cornerIndicesZeroBased:[[0,n],[m*(n+1),(m+1)*(n+1)-1]],rowKinds,rowVectors,signedInteriorSteps:steps},numericalPolicy:{model:'binary64/libm engineering forward estimate; not interval certification or Wolfram binary output equality',intervalCertified:false,worldErrorEstimateMm:estimate,angleErrorEstimateDeg:Number.EPSILON*128*depth*condition*180,replayULPs:64*depth,maximumLineIntersectionCondition:condition}};
}
/** Exact predicates and covered area of the actual binary64 graph. */
function finiteProof(g:FoldGraph){
 const vertices=g.vertices_coords,edges=g.edges_vertices,faces=g.faces_vertices!,view=new DataView(new ArrayBuffer(8)),dyad=(x:number):[bigint,number]=>{if(!finite(x))return fail('NUMERIC_SOURCE','非有限 CP 顶点。');if(x===0)return [0n,0];view.setFloat64(0,x,false);const b=view.getBigUint64(0,false),e=Number(b>>52n&2047n);return [(b>>63n?-1n:1n)*((b&((1n<<52n)-1n))+(e?1n<<52n:0n)),e?e-1075:-1074];},raw=vertices.map(p=>p.map(dyad)),exp=Math.min(...raw.flat().filter(([x])=>x!==0n).map(([,e])=>e)),p=raw.map(r=>r.map(([x,e])=>x===0n?0n:x<<BigInt(e-exp))),cross=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[b][1]-p[a][1])*(p[c][0]-p[a][0]),sign=(x:bigint)=>x>0n?1:x<0n?-1:0,
  on=(a:number,b:number,c:number)=>cross(a,b,c)===0n&&[0,1].every(k=>p[c][k]>=(p[a][k]<p[b][k]?p[a][k]:p[b][k])&&p[c][k]<=(p[a][k]>p[b][k]?p[a][k]:p[b][k])),area=(f:number[])=>f.reduce((sum,a,i)=>sum+cross(f[0],a,f[(i+1)%f.length]),0n);
 if(new Set(vertices.map(v=>v.join(','))).size!==vertices.length)fail('FINITE_GEOMETRY','不同源顶点重合；没有吸附。');
 let pairs=0;for(let e=0;e<edges.length;e++)for(let f=e+1;f<edges.length;f++){
  if(++pairs>MAX_PAIRS)fail('SOURCE_CAPABILITY','精确 CP 检查超过预算。');const [a,b]=edges[e],[c,d]=edges[f],shared=[a,b].filter(v=>v===c||v===d);
  if(shared.length){const common=shared[0],other=[a,b,c,d].filter(v=>v!==common);if(shared.length!==1||on(common,other[0],other[1])||on(common,other[1],other[0]))fail('FINITE_GEOMETRY','原相邻边重叠或重复。');continue;}
  if(sign(cross(a,b,c))*sign(cross(a,b,d))<0&&sign(cross(c,d,a))*sign(cross(c,d,b))<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))fail('FINITE_GEOMETRY','原 CP 存在未分点的交叉、接触或重叠。');
 }
 let total=0n;for(const f of faces){const a=area(f);if(a<=0n||f.some((v,i)=>cross(v,f[(i+1)%f.length],f[(i+2)%f.length])<=0n))fail('FINITE_GEOMETRY','原内部传播得到负边或退化、反向、非凸材料面。');total+=a;}
 const boundary=new Map<number,number>();g.faces_edges!.forEach((es,f)=>es.forEach((e,i)=>{if(g.edges_assignment[e]==='B'){const ring=faces[f],a=ring[i],b=ring[(i+1)%ring.length];if(boundary.has(a))fail('FINITE_GEOMETRY','原纸边分叉。');boundary.set(a,b);}}));
 const start=Math.min(...boundary.keys()),ring:number[]=[],seen=new Set<number>();let a=start;while(!seen.has(a)){seen.add(a);ring.push(a);const b=boundary.get(a);if(b===undefined)fail('FINITE_GEOMETRY','原纸边未闭合。');a=b!;}
 if(a!==start||seen.size!==boundary.size||area(ring)!==total||g.edges_faces!.some((fs,e)=>fs.length!==(g.edges_assignment[e]==='B'?1:2))||vertices.length-edges.length+faces.length!==1)fail('FINITE_GEOMETRY','原有限纸面未恰好一次覆盖简单外边界。');
 return {arithmetic:'exact dyadic signs and area on actual binary64 CP',vertices:vertices.length,edges:edges.length,faces:faces.length,boundaryEdges:ring.length,boundaryLoop:ring,testedEdgePairs:pairs,positiveConvexFaces:true,simpleBoundaryCoveredExactlyOnce:true,boundaryUsesOnceInteriorUsesTwice:true,coordinateWelding:false};
}
type V3=[number,number,number];
const add3=(a:V3,b:V3):V3=>a.map((v,i)=>v+b[i]) as V3,sub3=(a:V3,b:V3):V3=>a.map((v,i)=>v-b[i]) as V3,dot3=(a:V3,b:V3)=>a.reduce((s,v,i)=>s+v*b[i],0),cross3=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm3=(a:V3)=>Math.hypot(...a),unit3=(a:V3):V3=>a.map(x=>x/norm3(a)) as V3,
 rotate3=(p:V3,u:V3,g:number):V3=>{const c=Math.cos(g),s=Math.sin(g),cr=cross3(u,p),parallel=dot3(u,p)*(1-c);return p.map((x,i)=>c*x+s*cr[i]+parallel*u[i]) as V3;};
type Pose={origin:V3;x:V3;y:V3};const place=(t:Pose,p:Point):V3=>t.origin.map((v,i)=>v+p[0]*t.x[i]+p[1]*t.y[i]) as V3;
export type GeneralSpacerMiuraFoldedState={status:'verified'|'unverified';reason:string;foldedForm3D?:V3[];maximumFaceDistanceErrorMm:number;maximumGridClosureErrorMm:number;maximumFoldAngleErrorRad:number;maximumSectorAngleErrorRad:number;staticGlobalIsometryChecked:boolean;signedHingesChecked:boolean;loopClosureChecked:boolean;continuousRigidPathChecked:false;wholeSheetLayerOrderChecked:false;selfCollisionChecked:false};
function foldedState(s:GeneralSpacerMiuraSource):GeneralSpacerMiuraFoldedState {
 const g=s.graph,faces=g.faces_vertices!,poses:(Pose|undefined)[]=faces.map(()=>undefined),coordinates:(V3|undefined)[]=g.vertices_coords.map(()=>undefined),queue=[0];poses[0]={origin:[0,0,0],x:[1,0,0],y:[0,1,0]};let closure=0,faceError=0,hingeError=0,sectorError=0;
 const assign=(f:number)=>{const t=poses[f]!;for(const v of faces[f]){const p=place(t,g.vertices_coords[v]);if(coordinates[v])closure=Math.max(closure,norm3(sub3(p,coordinates[v]!)));else coordinates[v]=p;}};assign(0);
 for(let qi=0;qi<queue.length;qi++){const f=queue[qi],t=poses[f]!;g.faces_edges![f].forEach((e,k)=>{const other=g.edges_faces![e].find(x=>x!==f);if(other===undefined)return;const a=faces[f][k],b=faces[f][(k+1)%4],at=place(t,g.vertices_coords[a]),axis=unit3(sub3(place(t,g.vertices_coords[b]),at)),angle=g.edges_foldAngle[e]!*RAD,
  candidate:Pose={origin:add3(at,rotate3(sub3(t.origin,at),axis,angle)),x:rotate3(t.x,axis,angle),y:rotate3(t.y,axis,angle)};
  if(!poses[other]){poses[other]=candidate;queue.push(other);assign(other);}else for(const v of faces[other])closure=Math.max(closure,norm3(sub3(place(candidate,g.vertices_coords[v]),place(poses[other]!,g.vertices_coords[v]))));});}
 const vv=coordinates as V3[],normal=(f:number)=>unit3(cross3(sub3(vv[faces[f][1]],vv[faces[f][0]]),sub3(vv[faces[f][3]],vv[faces[f][0]])));
 for(let f=0;f<faces.length;f++){const ring=faces[f];for(let i=0;i<4;i++){for(let j=i+1;j<4;j++){const a=ring[i],b=ring[j];faceError=Math.max(faceError,Math.abs(Math.hypot(g.vertices_coords[a][0]-g.vertices_coords[b][0],g.vertices_coords[a][1]-g.vertices_coords[b][1])-norm3(sub3(vv[a],vv[b]))));}
   const a=ring[i],b=ring[(i+1)%4],c=ring[(i+3)%4],u:V3=[g.vertices_coords[b][0]-g.vertices_coords[a][0],g.vertices_coords[b][1]-g.vertices_coords[a][1],0],v:V3=[g.vertices_coords[c][0]-g.vertices_coords[a][0],g.vertices_coords[c][1]-g.vertices_coords[a][1],0],spu=sub3(vv[b],vv[a]),spv=sub3(vv[c],vv[a]),angle=(x:V3,y:V3)=>Math.atan2(norm3(cross3(x,y)),dot3(x,y));sectorError=Math.max(sectorError,Math.abs(angle(u,v)-angle(spu,spv)));}}
 g.edges_faces!.forEach((owners,e)=>{if(owners.length!==2)return;const [f,h]=owners,k=g.faces_edges![f].indexOf(e),a=faces[f][k],b=faces[f][(k+1)%4],axis=unit3(sub3(vv[b],vv[a])),nf=normal(f),nh=normal(h),measured=Math.atan2(dot3(axis,cross3(nf,nh)),dot3(nf,nh)),delta=measured-g.edges_foldAngle[e]!*RAD;hingeError=Math.max(hingeError,Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta))));});
 const magnitude=Math.max(1,...g.vertices_coords.flat().map(Math.abs)),tol=Math.max(s.numericalPolicy.worldErrorEstimateMm*16,magnitude*1e-9),angleTol=Math.max(s.numericalPolicy.angleErrorEstimateDeg*RAD*16,1e-9),ok=queue.length===faces.length&&vv.every(p=>p?.length===3&&p.every(finite))&&[closure,faceError,hingeError,sectorError].every(finite)&&closure<=tol&&faceError<=tol&&hingeError<=angleTol&&sectorError<=angleTol;
 return {status:ok?'verified':'unverified',reason:ok?'原目标折角经面传播、所有环闭合、面全距离、扇区角和有向 hinge 核通过；仅静态状态。':'合法 CP 已构造；当前静态 FF 未通过全部环闭合/有向折角/面等距核，不提供空间 scene。',...(ok?{foldedForm3D:vv}:{}),maximumFaceDistanceErrorMm:faceError,maximumGridClosureErrorMm:closure,maximumFoldAngleErrorRad:hingeError,maximumSectorAngleErrorRad:sectorError,staticGlobalIsometryChecked:ok,signedHingesChecked:ok,loopClosureChecked:ok,continuousRigidPathChecked:false,wholeSheetLayerOrderChecked:false,selfCollisionChecked:false};
}
function sourceInfo(s:GeneralSpacerMiuraSource,proof:ReturnType<typeof finiteProof>,ff:GeneralSpacerMiuraFoldedState){return {schema:SCHEMA,recipe:clone(s.recipe),seed:clone(s.seed),sourceGeometry:clone(s.sourceGeometry),numericalPolicy:clone(s.numericalPolicy),finitePaperProof:proof,foldedState:ff,source:{notebookSHA256:SHA,constructor:s.recipe.model==='general'?'MakeGeneralTMiuraMarsOri':'MakeSpacerMiuraOri',definitionCell:s.recipe.model==='general'?'In[2493]':'In[2529]',savedExampleCell:s.recipe.model==='general'?'In[2496]':'In[2530]',sourceUnitConvention:'1 original unit = 1 mm, applied once',vertexOrder:'bottom row left-to-right; rows upward',edgeOrder:'horizontal edges then vertical edges',borderOverride:true,originalOffsetPreserved:true,originalFoldAngleSignsRetained:true,coordinateTranslation:false,coordinateScaling:false,wolframExecuted:false,wholeOriginalDomainProved:false},scope:{originalPlaneCP:true,originalTargetAngles:true,continuousRigidPathChecked:false,wholeSheetLayerOrderChecked:false,selfCollisionChecked:false}};}
function buildFromSource(s:GeneralSpacerMiuraSource):Doc {
 const graph=clone(s.graph),proof=finiteProof(graph),ff=foldedState(s),xs=graph.vertices_coords.map(p=>p[0]),ys=graph.vertices_coords.map(p=>p[1]),ids=graph.edges_vertices.map((_,e)=>`general-spacer-miura-edge-${e}`),doc:Doc={schemaVersion:2,name:s.recipe.model==='general'?'原一般非镜对称 Miura/Mars CP':'原嫁接间隔 Miura CP',paper:{width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},objects:[],segments:graph.edges_vertices.map(([a,b],e)=>({id:ids[e],a:clone(graph.vertices_coords[a]),b:clone(graph.vertices_coords[b]),assignment:graph.edges_assignment[e] as Assignment,angle:graph.edges_foldAngle[e]})),metadata:{[NAMESPACE]:sourceInfo(s,proof,ff)}};
 try{validateDoc(doc);doc.metadata!.materialTopology=createMaterialTopology(doc,graph,ids);}catch(e){fail('MATERIAL_INTERFACE',`原 finite CP 已核，但当前工程或材料接口不能采用：${(e as Error).message}`);}return doc;
}
export function generateGeneralSpacerMiuraDocument(raw:unknown):Doc{return buildFromSource(evaluateGeneralSpacerMiuraSource(raw));}
export function readGeneralSpacerMiuraRecipe(doc:Doc):GeneralSpacerMiuraRecipe|null {try{const saved=doc.metadata?.[NAMESPACE];return record(saved)&&saved.schema===SCHEMA?validateGeneralSpacerMiuraRecipe(saved.recipe):null;}catch{return null;}}
export function generalSpacerMiuraSourceKey(raw:unknown):string{return JSON.stringify(validateGeneralSpacerMiuraRecipe(raw));}
function freeze<T>(x:T):T{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
export function prepareGeneralSpacerMiuraPreview(raw:unknown){const source=freeze(evaluateGeneralSpacerMiuraSource(raw));return {key:generalSpacerMiuraSourceKey(source.recipe),source,build:()=>buildFromSource(source)};}
function same(a:unknown,b:unknown):boolean {if(Array.isArray(b))return Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v));if(record(b))return record(a)&&exactKeys(a,Object.keys(b))&&Object.keys(b).every(k=>same(a[k],b[k]));return a===b;}
const ulp=(x:number)=>x===0?Number.MIN_VALUE:Math.abs(x)<2**-1022?Number.MIN_VALUE:2**(Math.floor(Math.log2(Math.abs(x)))-52);
/** Full source/segment/material/proof guard; edited CP may retain a readable recipe but cannot claim source match. */
export function generalSpacerMiuraSourceMatches(doc:Doc):boolean {
 try{validateDoc(doc);const recipe=readGeneralSpacerMiuraRecipe(doc);if(!recipe)return false;const s=evaluateGeneralSpacerMiuraSource(recipe),expected=buildFromSource(s),own=doc.metadata![NAMESPACE],known=expected.metadata![NAMESPACE];if(!record(own)||!record(known))return false;
  const material=inspectMaterialTopology(doc),reference=inspectMaterialTopology(expected);if(!material.ok||!reference.ok||material.foldedVertices!==undefined||material.startingFace!==undefined||!same(material.edgeSegmentIds,reference.edgeSegmentIds))return false;
  const a=material.graph,b=s.graph,near=(x:unknown,y:number,bound:number)=>finite(x)&&Math.abs(x-y)<=Math.max(bound,s.numericalPolicy.replayULPs*ulp(y));
  if(!exactKeys(a,Object.keys(b))||!same(a.edges_vertices,b.edges_vertices)||!same(a.edges_assignment,b.edges_assignment)||!same(a.faces_vertices,b.faces_vertices)||!same(a.faces_edges,b.faces_edges)||!same(a.edges_faces,b.edges_faces)||!same(a.faces_faces,b.faces_faces)||a.vertices_coords.length!==b.vertices_coords.length)return false;
  for(let v=0;v<a.vertices_coords.length;v++)for(let k=0;k<2;k++){const y=b.vertices_coords[v][k],x=a.vertices_coords[v][k],primitive=y===0||recipe.model==='spacer'&&v<=recipe.columns;if(primitive?x!==y:!near(x,y,s.numericalPolicy.worldErrorEstimateMm))return false;}
  if(a.edges_foldAngle.length!==b.edges_foldAngle.length)return false;for(let e=0;e<a.edges_foldAngle.length;e++){const x=a.edges_foldAngle[e],y=b.edges_foldAngle[e]!,primitive=y===0||recipe.model==='general'&&e<recipe.horizontalLengthsMm.length*(recipe.verticalLengthsMm.length+1)||recipe.model==='spacer'&&Math.abs(y)===Math.abs(recipe.majorFoldAngleDeg);if(primitive?x!==y:!near(x,y,s.numericalPolicy.angleErrorEstimateDeg))return false;}
  if(doc.segments.length!==expected.segments.length||doc.segments.some((v,e)=>!same(v,{...expected.segments[e],a:a.vertices_coords[a.edges_vertices[e][0]],b:a.vertices_coords[a.edges_vertices[e][1]],angle:a.edges_foldAngle[e]})))return false;
  const xs=a.vertices_coords.map(p=>p[0]),ys=a.vertices_coords.map(p=>p[1]);if(doc.paper.width!==Math.max(...xs)-Math.min(...xs)||doc.paper.height!==Math.max(...ys)-Math.min(...ys))return false;
  const actualProof=finiteProof(a);if(!same(own.finitePaperProof,actualProof)||!same(own.schema,known.schema)||!same(own.recipe,recipe)||!same(own.source,known.source)||!same(own.scope,known.scope)||!exactKeys(own,Object.keys(known)))return false;
  if(!record(own.seed)||(recipe.model==='general'&&!same(own.seed.creaseVectors[0],known.seed.creaseVectors[0]))||(recipe.model==='general'&&own.seed.dihedralsDeg[1]!==own.seed.dihedralsDeg[3])||(recipe.model==='spacer'&&own.seed.dihedralsDeg[1]!==-own.seed.dihedralsDeg[3]))return false;
  if(recipe.model==='spacer'){const rv=own.sourceGeometry.rowVectors;if(!same(rv[0],[0,1])||!same(rv[2],[0,1])||rv[1][0]!==-rv[3][0]||rv[1][1]!==rv[3][1])return false;}
  const compare=(x:any,y:any,path:string):boolean=>{if(typeof y==='number'){
    if(path.startsWith('recipe.')||path.startsWith('sourceGeometry.cornerIndicesZeroBased')||path.startsWith('sourceGeometry.nativeOrigin')||path.startsWith('sourceGeometry.rowKinds')||path.startsWith('seed.sectorsDeg')||path==='numericalPolicy.replayULPs'||y===0||(path.startsWith('seed.creaseVectors.')||path.startsWith('sourceGeometry.rowVectors.'))&&Math.abs(y)===1||path==='seed.dihedralsDeg.0'||recipe.model==='general'&&path==='seed.dihedralsDeg.2')return x===y;
    return near(x,y,path.startsWith('seed.creaseVectors.')||path.startsWith('sourceGeometry.rowVectors.')?s.numericalPolicy.angleErrorEstimateDeg*RAD:path==='seed.condition'||path==='numericalPolicy.maximumLineIntersectionCondition'?Math.abs(y)*Number.EPSILON*s.numericalPolicy.replayULPs:path.includes('ErrorRad')?s.numericalPolicy.angleErrorEstimateDeg*RAD*32:path.includes('dihedrals')||path.includes('Angle')?s.numericalPolicy.angleErrorEstimateDeg:path.includes('ErrorEstimate')?Math.abs(y)*Number.EPSILON*256:s.numericalPolicy.worldErrorEstimateMm*16);
   }if(Array.isArray(y))return Array.isArray(x)&&x.length===y.length&&y.every((v,i)=>compare(x[i],v,`${path}.${i}`));if(record(y))return record(x)&&exactKeys(x,Object.keys(y))&&Object.keys(y).every(k=>compare(x[k],y[k],path?`${path}.${k}`:k));return x===y;};
  if(!['seed','sourceGeometry','numericalPolicy','foldedState'].every(k=>compare(own[k],known[k],k)))return false;
  // Transcendental seed replay may differ across runtimes. The persisted seed's literal CP arithmetic is exact.
  const replay=evaluateSource(recipe,own.seed as ReturnType<typeof seed>,own.sourceGeometry.rowVectors);
  return same(a,replay.graph)&&same(own.sourceGeometry,replay.sourceGeometry)&&verifiedSavedFoldedState(a,own.foldedState,s.numericalPolicy);
 }catch{return false;}
}
/** Re-measure the persisted spatial data; certificate fields never substitute for actual hinge/isometry checks. */
function verifiedSavedFoldedState(g:FoldGraph,state:GeneralSpacerMiuraFoldedState,policy:GeneralSpacerMiuraSource['numericalPolicy']):boolean {
 if(state.status==='unverified')return state.foldedForm3D===undefined&&state.staticGlobalIsometryChecked===false&&state.signedHingesChecked===false&&state.loopClosureChecked===false;
 const vv=state.foldedForm3D,faces=g.faces_vertices!;if(!Array.isArray(vv)||vv.length!==g.vertices_coords.length||vv.some(p=>!Array.isArray(p)||p.length!==3||p.some(x=>!finite(x))))return false;
 const magnitude=Math.max(1,...g.vertices_coords.flat().map(Math.abs)),tolerance=Math.max(policy.worldErrorEstimateMm*16,magnitude*1e-9),angleTolerance=Math.max(policy.angleErrorEstimateDeg*RAD*16,1e-9);let error=0,hingeError=0,sectorError=0;
 const angle=(a:V3,b:V3)=>Math.atan2(norm3(cross3(a,b)),dot3(a,b));
 for(const f of faces)for(let i=0;i<4;i++){
  const a=f[i],b=f[(i+1)%4],c=f[(i+3)%4],u:V3=[g.vertices_coords[b][0]-g.vertices_coords[a][0],g.vertices_coords[b][1]-g.vertices_coords[a][1],0],v:V3=[g.vertices_coords[c][0]-g.vertices_coords[a][0],g.vertices_coords[c][1]-g.vertices_coords[a][1],0];sectorError=Math.max(sectorError,Math.abs(angle(u,v)-angle(sub3(vv[b],vv[a]),sub3(vv[c],vv[a]))));
  for(let j=i+1;j<4;j++){const b=f[j];error=Math.max(error,Math.abs(norm3(sub3(vv[a],vv[b]))-Math.hypot(g.vertices_coords[a][0]-g.vertices_coords[b][0],g.vertices_coords[a][1]-g.vertices_coords[b][1])));}
 }
 const normal=(f:number)=>unit3(cross3(sub3(vv[faces[f][1]],vv[faces[f][0]]),sub3(vv[faces[f][3]],vv[faces[f][0]])));
 g.edges_faces!.forEach((owners,e)=>{if(owners.length!==2)return;const [f,h]=owners,k=g.faces_edges![f].indexOf(e),a=faces[f][k],b=faces[f][(k+1)%4],axis=unit3(sub3(vv[b],vv[a])),nf=normal(f),nh=normal(h),delta=Math.atan2(dot3(axis,cross3(nf,nh)),dot3(nf,nh))-g.edges_foldAngle[e]!*RAD;hingeError=Math.max(hingeError,Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta))));});
 return [error,hingeError,sectorError].every(finite)&&error<=tolerance&&hingeError<=angleTolerance&&sectorError<=angleTolerance&&Math.abs(state.maximumFaceDistanceErrorMm-error)<=policy.worldErrorEstimateMm*32&&Math.abs(state.maximumFoldAngleErrorRad-hingeError)<=policy.angleErrorEstimateDeg*RAD*32&&Math.abs(state.maximumSectorAngleErrorRad-sectorError)<=policy.angleErrorEstimateDeg*RAD*32;
}
/** A source-guarded static scene. No motion, layers or collision certificate is implied. */
export type GeneralSpacerMiuraScene={vertices:V3[];edges:[number,number][];assignments:Assignment[];faces:number[][];maximumFaceDistanceError:number;maximumGridClosureError:number;maximumFoldAngleErrorRad:number;minimumSpatialEdgeLength:number};
export function generalSpacerMiuraScene(doc:Doc):GeneralSpacerMiuraScene|null{if(!generalSpacerMiuraSourceMatches(doc))return null;const saved=doc.metadata![NAMESPACE] as Record<string,any>,m=inspectMaterialTopology(doc);if(!m.ok||saved.foldedState.status!=='verified')return null;return {vertices:clone(saved.foldedState.foldedForm3D) as V3[],edges:clone(m.graph.edges_vertices),assignments:clone(m.graph.edges_assignment) as Assignment[],faces:clone(m.graph.faces_vertices!),maximumFaceDistanceError:saved.foldedState.maximumFaceDistanceErrorMm,maximumGridClosureError:saved.foldedState.maximumGridClosureErrorMm,maximumFoldAngleErrorRad:saved.foldedState.maximumFoldAngleErrorRad,minimumSpatialEdgeLength:Math.min(...m.graph.edges_vertices.map(([a,b])=>norm3(sub3(saved.foldedState.foldedForm3D[a],saved.foldedState.foldedForm3D[b]))))};}
