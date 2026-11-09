/** Original Huffman planar building blocks. Spatial/17-item source remains
 * unchanged; only the single-block finite chord material is adoptable here. */
import {fetchHuffmanCircle4,parseHuffmanCircle4Result,type HuffmanCircle4Result} from './huffmanCircle4';
import {fetchHuffmanParabola,parseHuffmanParabolaResult,type HuffmanParabolaResult} from './huffmanParabola';
import {fetchCircle4Direct,readCircle4DirectResult,type Circle4DirectResult} from './huffmanCircle4Direct';
import {fetchParabolaDirect,readParabolaDirectResult,type ParabolaDirectResult} from './huffmanParabolaDirect';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point} from '../core/types';

export type HuffmanFiniteCPRecipe={model:'circle4'|'parabola';sourceMode:'saved'|'direct';parametersDeg:[number,number,number,number];divisions:number;unitSizeMm:number;paperMode?:'paired'};
export type HuffmanFiniteCPSource=HuffmanCircle4Result|HuffmanParabolaResult|Circle4DirectResult|ParabolaDirectResult;
export const HUFFMAN_FINITE_CP_EXAMPLES:Record<HuffmanFiniteCPRecipe['model'],HuffmanFiniteCPRecipe>={
 circle4:{model:'circle4',sourceMode:'saved',parametersDeg:[33,87,60,-52],divisions:25,unitSizeMm:1},
 parabola:{model:'parabola',sourceMode:'saved',parametersDeg:[5,85,60,-90],divisions:25,unitSizeMm:1},
};
export const HUFFMAN_PAIRED_CP_EXAMPLES:Record<HuffmanFiniteCPRecipe['model'],HuffmanFiniteCPRecipe>={circle4:{...HUFFMAN_FINITE_CP_EXAMPLES.circle4,paperMode:'paired'},parabola:{...HUFFMAN_FINITE_CP_EXAMPLES.parabola,paperMode:'paired'}};
export type HuffmanFiniteCPErrorCode='SOURCE_INPUT'|'NUMERIC_SOURCE'|'FINITE_PAPER'|'MATERIAL_INTERFACE';
export class HuffmanFiniteCPError extends Error{constructor(public readonly code:HuffmanFiniteCPErrorCode,message:string){super(message);this.name='HuffmanFiniteCPError';}}
const fail=(code:HuffmanFiniteCPErrorCode,message:string):never=>{throw new HuffmanFiniteCPError(code,message);},
 finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),object=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),
 keys=(x:Record<string,unknown>,ks:string[])=>Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k)),clone=<T>(x:T):T=>structuredClone(x),
 same=(a:unknown,b:unknown):boolean=>typeof a==='number'&&typeof b==='number'?finite(a)&&finite(b)&&a===b:Array.isArray(a)||Array.isArray(b)?Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&b.every((x,i)=>same(a[i],x)):object(a)||object(b)?object(a)&&object(b)&&keys(a,Object.keys(b))&&Object.keys(b).every(k=>same(a[k],b[k])):a===b,
 NS='originalHuffmanSingleBlockFiniteCP',SCHEMA='original-huffman-single-block-finite-cp-v1',PAIR_NS='originalHuffmanPairedFiniteCP',PAIR_SCHEMA='original-huffman-paired-finite-cp-v2',HALF=Math.PI/2,EPS=Number.EPSILON;
export function validateHuffmanFiniteCPRecipe(raw:unknown):HuffmanFiniteCPRecipe{
 if(!object(raw)||!(keys(raw,['model','sourceMode','parametersDeg','divisions','unitSizeMm'])||raw.paperMode==='paired'&&keys(raw,['model','sourceMode','parametersDeg','divisions','unitSizeMm','paperMode']))||!['circle4','parabola'].includes(raw.model)||!['saved','direct'].includes(raw.sourceMode)||!Array.isArray(raw.parametersDeg)||raw.parametersDeg.length!==4||!raw.parametersDeg.every(finite)||!finite(raw.divisions)||!finite(raw.unitSizeMm))fail('SOURCE_INPUT','请选择原圆或抛物线，并填写四个有限角度、段数和毫米单位倍率；成对纸面须显式paired版本字段。');
 const r=raw as HuffmanFiniteCPRecipe,[a,b,c,d]=r.parametersDeg;
 if(!(a>0&&a<b&&b<90&&c>0&&c<180&&d>-180&&d<0))fail('NUMERIC_SOURCE','当前后端实数支路要求0<t₁<t₂<90°、0<γ₁<180°、−180<γ₂<0°；未实现原NumericQ的全部域。');
 if(!Number.isInteger(r.divisions)||r.divisions<8||r.divisions>64)fail('NUMERIC_SOURCE','当前原返回的本地采样预算是8–64弦；原保存绘图为25弦。');
 if(r.unitSizeMm<=0)fail('SOURCE_INPUT','毫米／原式单位倍率须为正；不会自动移动或缩放到默认纸张。');
 if(r.sourceMode==='saved'&&!same(r.parametersDeg,HUFFMAN_FINITE_CP_EXAMPLES[r.model].parametersDeg))fail('SOURCE_INPUT','保存输入模式保留原初猜／原参数；要修改四个角度请选择直接构造。');
 return {...r,parametersDeg:[...r.parametersDeg]};
}
export function huffmanFiniteCPSourceKey(r:HuffmanFiniteCPRecipe){return JSON.stringify([r.model,r.sourceMode,r.parametersDeg,r.divisions]);}
function query(r:HuffmanFiniteCPRecipe){const family=r.model==='circle4'?'huffman-circle4-in4072':'huffman-parabola-in4060';return r.sourceMode==='saved'?{family,divisions:r.divisions}:{family,mode:'direct-four-arguments',parametersDeg:r.parametersDeg,divisions:r.divisions};}
function parseNative(raw:unknown,r:HuffmanFiniteCPRecipe):HuffmanFiniteCPSource{
 try{return r.model==='circle4'?r.sourceMode==='saved'?parseHuffmanCircle4Result(raw,query(r) as any):readCircle4DirectResult(raw,query(r) as any):r.sourceMode==='saved'?parseHuffmanParabolaResult(raw,query(r) as any):readParabolaDirectResult(raw,query(r) as any);}catch(error){return fail('NUMERIC_SOURCE',error instanceof Error?error.message:String(error));}
}
export async function fetchHuffmanFiniteCPSource(raw:unknown,signal?:AbortSignal):Promise<HuffmanFiniteCPSource>{
 const r=validateHuffmanFiniteCPRecipe(raw);return r.model==='circle4'?r.sourceMode==='saved'?fetchHuffmanCircle4(query(r),signal):fetchCircle4Direct(query(r),signal):r.sourceMode==='saved'?fetchHuffmanParabola(query(r),signal):fetchParabolaDirect(query(r),signal);
}

type State=[number,number,number];
/** A second local planar RK45 interpretation of the literal three-state ODE.
 * No Darboux/3D data is projected or adopted. This is an engineering replay,
 * not an interval error certificate or a Wolfram NDSolve implementation. */
function replayAngles(model:HuffmanFiniteCPRecipe['model'],args:number[],targets:number[]):State[]{
 const [t1,t2,a,b]=args.map(x=>x*(Math.PI/180)),initial:State=[0,a,b];let evaluations=0;
 const rhs=(moving:boolean)=>(t:number,[q,g,h]:State):State=>{
  if(++evaluations>24000)fail('NUMERIC_SOURCE','独立二维原式重放超过当前计算预算；没有改用替代纸域。');
  const tangent=Math.tan(g/2),den=model==='circle4'?1+2*Math.cos(t)-4*Math.cos(t-q):1-4*Math.cos(t-q)+Math.cos(q);
  if(Math.abs(den)<1e-9||Math.abs(Math.cos(g/2))<1e-9||Math.abs(Math.sin(h/2))<1e-9||model==='circle4'&&Math.abs(Math.cos(q))<1e-9||model==='parabola'&&Math.abs(Math.cos(h/2))<1e-9)fail('NUMERIC_SOURCE','当前原字面一致性方程接近奇点，未做解析延拓或吸附。');
  return model==='circle4'?[
   moving?(-4+Math.cos(t-q)+2*Math.cos(q))/Math.tan(h/2)*tangent/(-den):0,
   (2*Math.sin(t)-4*Math.sin(t-q))*tangent/den,
   (-Math.sin(t-2*q)-4*Math.sin(q)+2*Math.sin(2*q))*tangent/(Math.cos(q)*(-den)),
  ]:[moving?-2*(-4+Math.cos(t)+Math.cos(t-q))*Math.cos(q/2)/Math.tan(h/2)*tangent/den:0,-4*Math.sin(t-q)*tangent/den,2*Math.cos(q/2)*Math.sin(t-q)*tangent/den];
 };
 const integrate=(start:number,end:number,state:State,at:number[],moving:boolean)=>{
  const sign=Math.sign(end-start),f=rhs(moving),rows=new Map<number,State>();let t=start,y=[...state] as State,h=sign*Math.min(.01,Math.abs(end-start));
  const add=(terms:[number,State][],step:number):State=>y.map((v,j)=>v+step*terms.reduce((s,[c,k])=>s+c*k[j],0)) as State;
  for(const target of [...at,end]){
   while(sign*(target-t)>0){h=sign*Math.min(Math.abs(h),Math.abs(target-t));if(t+h===t)fail('NUMERIC_SOURCE','二维积分步长在当前double中不可分离。');
    const k1=f(t,y),k2=f(t+h/5,add([[1/5,k1]],h)),k3=f(t+3*h/10,add([[3/40,k1],[9/40,k2]],h)),k4=f(t+4*h/5,add([[44/45,k1],[-56/15,k2],[32/9,k3]],h)),k5=f(t+8*h/9,add([[19372/6561,k1],[-25360/2187,k2],[64448/6561,k3],[-212/729,k4]],h)),k6=f(t+h,add([[9017/3168,k1],[-355/33,k2],[46732/5247,k3],[49/176,k4],[-5103/18656,k5]],h)),next=add([[35/384,k1],[500/1113,k3],[125/192,k4],[-2187/6784,k5],[11/84,k6]],h),k7=f(t+h,next),low=add([[5179/57600,k1],[7571/16695,k3],[393/640,k4],[-92097/339200,k5],[187/2100,k6],[1/40,k7]],h),error=Math.max(...next.map((v,j)=>Math.abs(v-low[j])/(2e-14+1e-12*Math.max(Math.abs(v),Math.abs(y[j])))));
    if(!next.every(finite)||!finite(error))fail('NUMERIC_SOURCE','二维重放返回非有限数值。');
    if(error<=1){t=Math.abs(h)===Math.abs(target-t)?target:t+h;y=next;}
    h*=Math.min(4,Math.max(.15,.9*(error||1e-12)**(-.2)));
   }
   rows.set(target,[...y]);
  }
  return {end:y,rows};
 };
 const before=integrate(t1,0,initial,targets.filter(t=>t<t1).reverse(),false),middle=integrate(t1,t2,initial,targets.filter(t=>t>=t1&&t<=t2),true),after=integrate(t2,HALF,middle.end,targets.filter(t=>t>t2),false);
 return targets.map(t=>(t<t1?before:t<=t2?middle:after).rows.get(t)!);
}

type SourceMap={row:number;identity:string;vertices:[number,number,number,number]};
function sourceRows(raw:unknown,r:HuffmanFiniteCPRecipe){
 const native=parseNative(raw,r),rows=native.sample.rows,resolved=r.model==='circle4'&&r.sourceMode==='saved'?(native as HuffmanCircle4Result).closure.localRootDeg:r.parametersDeg,
  targets=rows.map(row=>row.t),replay=replayAngles(r.model,resolved,targets),phaseBudgetRad=1e-8;
 for(let i=0;i<rows.length;i++){
  const row=rows[i],t=i===r.divisions?HALF:HALF*i/r.divisions,q=row.anglesDeg[0]*(Math.PI/180);
  if(i===0&&row.t!==0||i===r.divisions&&row.t!==HALF||Math.abs(row.t-t)>32*EPS*Math.max(1,Math.abs(t)))fail('NUMERIC_SOURCE','返回采样域或顺序改变；不会裁断或移动端点。');
  if(row.anglesDeg.some((g,j)=>Math.abs(g*(Math.PI/180)-replay[i][j])>phaseBudgetRad))fail('NUMERIC_SOURCE','原三状态二维重放超过1e−8 rad工程预算；没有区间ODE误差证。');
  const c=Math.cos(q),sn=Math.sin(q),f2:Point=r.model==='circle4'?[4*c-2,4*sn]:[4/(1+c)*c,4/(1+c)*sn],expected:Point[]=[[0,0],[Math.cos(row.t),Math.sin(row.t)],f2,[2,f2[1]]];
  if(!same(row.flat[0],[0,0])||row.flat[3][0]!==2||i===0&&(!same(row.flat[1],[1,0])||!same(row.flat[2],[2,0])||!same(row.flat[3],[2,0])||row.anglesDeg[0]!==0))fail('NUMERIC_SOURCE','原固定源点或直线x=2身份改变。');
  for(let k=0;k<4;k++)for(let j=0;j<2;j++)if(Math.abs(row.flat[k][j]-expected[k][j])>64*EPS*Math.max(1,Math.abs(expected[k][j])))fail('NUMERIC_SOURCE','原二维点未绑定当前q及原字面平面公式。');
  if(!same(row.flat[2][1],row.flat[3][1]))fail('NUMERIC_SOURCE','原平面第三母线不是水平线；空间ε没有被加入二维。');
 }
 return {native,rows,resolved,phaseBudgetRad};
}

/** Exact orientations over the actual binary64 points; triangulation is proof
 * only. Source collinear paper vertices remain in the actual indexed CP. */
function prove(points:Point[],faces:number[][],edges:[number,number][]){
 const buffer=new ArrayBuffer(8),view=new DataView(buffer),dyad=(x:number):[bigint,number]=>{if(!finite(x))fail('FINITE_PAPER','材料点不是有限实数。');if(x===0)return [0n,0];view.setFloat64(0,x,false);const b=view.getBigUint64(0,false),ex=Number((b>>52n)&2047n);let a=(b&((1n<<52n)-1n))+(ex?1n<<52n:0n),e=ex?ex-1075:-1074;if(b>>63n)a=-a;while(a%2n===0n){a/=2n;e++;}return [a,e];},ratios=points.map(p=>p.map(dyad)),power=Math.min(...ratios.flat().filter(([a])=>a!==0n).map(([,e])=>e)),p=ratios.map(row=>row.map(([a,e])=>a<<BigInt(e-power))),cross=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[b][1]-p[a][1])*(p[c][0]-p[a][0]),between=(a:number,b:number,c:number)=>cross(a,b,c)===0n&&[0,1].every(j=>p[c][j]>=(p[a][j]<p[b][j]?p[a][j]:p[b][j])&&p[c][j]<=(p[a][j]>p[b][j]?p[a][j]:p[b][j]));
 let pairs=0;for(let i=0;i<edges.length;i++){const [a,b]=edges[i];if(same(points[a],points[b]))fail('FINITE_PAPER','实际CP存在零长边。');for(let j=i+1;j<edges.length;j++){
  const [c,d]=edges[j],shared=[a,b].filter(v=>v===c||v===d);pairs++;
  if(shared.length){const v=shared[0],u=a===v?b:a,w=c===v?d:c;if(cross(v,u,w)===0n&&[0,1].reduce((sum,k)=>sum+(p[u][k]-p[v][k])*(p[w][k]-p[v][k]),0n)>0n)fail('FINITE_PAPER','原同端边沿同射线重叠；未合并材料点。');}
  else if(cross(a,b,c)*cross(a,b,d)<0n&&cross(c,d,a)*cross(c,d,b)<0n||between(a,b,c)||between(a,b,d)||between(c,d,a)||between(c,d,b))fail('FINITE_PAPER','实际纸边或曲折弦相交／接触；请改变四参数或采样，不会修点。');
 }}
 const areas:bigint[]=[],triangles:number[][]=[];let simplifiedCollinearProofVertices=0;
 for(const face of faces){const area=face.reduce((sum,a,i)=>{const b=face[(i+1)%face.length];return sum+p[a][0]*p[b][1]-p[a][1]*p[b][0];},0n);if(area<=0n)fail('FINITE_PAPER','真实材料面为零面积或反向。');areas.push(area);const active=[...face];
  while(active.length>3){const collinear=active.findIndex((b,i)=>cross(active[(i+active.length-1)%active.length],b,active[(i+1)%active.length])===0n);
   if(collinear>=0){if(!between(active[(collinear+active.length-1)%active.length],active[(collinear+1)%active.length],active[collinear]))fail('FINITE_PAPER','面环含倒行或退化源边。');active.splice(collinear,1);simplifiedCollinearProofVertices++;continue;}
   let ear=-1;for(let i=0;i<active.length;i++){const a=active[(i+active.length-1)%active.length],b=active[i],c=active[(i+1)%active.length];if(cross(a,b,c)<=0n||active.some(v=>v!==a&&v!==b&&v!==c&&cross(a,b,v)>=0n&&cross(b,c,v)>=0n&&cross(c,a,v)>=0n))continue;triangles.push([a,b,c]);ear=i;break;}
   if(ear<0)fail('FINITE_PAPER','当前简单面无法通过严格正耳分割，未采用。');active.splice(ear,1);
  }if(cross(active[0],active[1],active[2])<=0n)fail('FINITE_PAPER','最后证明三角形退化。');triangles.push(active);
 }
 if(triangles.reduce((sum,t)=>sum+cross(t[0],t[1],t[2]),0n)!==areas.reduce((a,b)=>a+b,0n))fail('FINITE_PAPER','证明三角形与三真面精确面积不一致。');
 return {faces:faces.length,triangles:triangles.length,edgePairs:pairs,simplifiedCollinearProofVertices,exactPositiveSimpleFaces:true,exactOnceCoverage:true,proofTrianglesAreNotCPSeams:true,exactOrientationModel:'binary64/common-exponent bigint dyadics'};
}

function material(r:HuffmanFiniteCPRecipe,source:ReturnType<typeof sourceRows>){
 const {rows,resolved}=source,[t1,t2]=resolved.map(x=>x*(Math.PI/180)),rawPoints:Point[]=[[0,0]],f1:number[]=[],f2:number[]=[],f3:number[]=[],mapping:SourceMap[]=[],identities=new Map<string,[number,number]>();
 for(const row of rows){f1.push(rawPoints.length);rawPoints.push([...row.flat[1]]);}
 for(let i=0;i<rows.length;i++){
  const row=rows[i],identity=row.t<=t1?'initial-q0':row.t>=t2?'terminal-q':`moving-${i}`;let ids=identities.get(identity);
  if(identity==='initial-q0'&&(row.anglesDeg[0]!==0||!same(row.flat[2],[2,0])||!same(row.flat[3],[2,0])))fail('NUMERIC_SOURCE','原q=0锥端点身份不一致。');
  if(ids){if(!same(rawPoints[ids[0]],row.flat[2])||!same(rawPoints[ids[1]],row.flat[3]))fail('NUMERIC_SOURCE','符号恒定区间返回了不同世界点；不做容差聚类。');}
  else{const a=rawPoints.length;rawPoints.push([...row.flat[2]]);f2.push(a);let b=a;if(identity!=='initial-q0'){b=rawPoints.length;rawPoints.push([...row.flat[3]]);}f3.push(b);ids=[a,b];identities.set(identity,ids);}
  mapping.push({row:i,identity,vertices:[0,f1[i],ids[0],ids[1]]});
 }
 if(f2.length<2)fail('FINITE_PAPER','当前弦图没有非零第三材料区；零宽参考段不会变成CP。');
 const points=rawPoints.map(p=>p.map(x=>x*r.unitSizeMm) as Point);if(!points.flat().every(finite))fail('MATERIAL_INTERFACE','单位转换后的毫米点溢出，原二维源不变；当前材料接口不能采用。');
 const faces=[[0,...f1],[...f1].reverse().concat(f2),[...f2].reverse().concat(f3.slice(1))],byEdge=new Map<string,{edge:[number,number];uses:[number,number,number][]}>(),edgeKey=(a:number,b:number)=>`${Math.min(a,b)},${Math.max(a,b)}`;
 faces.forEach((face,fi)=>face.forEach((a,i)=>{const b=face[(i+1)%face.length],key=edgeKey(a,b),entry=byEdge.get(key)??{edge:[a,b],uses:[]};entry.uses.push([fi,a,b]);byEdge.set(key,entry);}));
 const ve=new Set(f1.slice(1).map((v,i)=>edgeKey(f1[i],v))),me=new Set(f2.slice(1).map((v,i)=>edgeKey(f2[i],v))),edges:[number,number][]=[],assignments:string[]=[],boundary:number[][]=[];
 for(const [key,{edge,uses}]of byEdge){let assignment:string;
  if(uses.length===1){assignment='B';boundary.push(uses[0].slice(1));}
  else if(uses.length===2&&uses[0][1]===uses[1][2]&&uses[0][2]===uses[1][1]){assignment=ve.has(key)?'V':me.has(key)?'M':'';if(!assignment)fail('FINITE_PAPER','新增内部边不是原f1/f2曲折弦。');}
  else fail('FINITE_PAPER','边面覆盖或方向不一致。');edges.push(edge);assignments.push(assignment!);
 }
 if(edges.some(([a,b])=>same(points[a],points[b])&&!same(rawPoints[a],rawPoints[b])))fail('MATERIAL_INTERFACE','单位转换使原不同点在double中不分离；不会合并或挪点。');
 const next=new Map<number,number>();for(const [a,b]of boundary){if(next.has(a))fail('FINITE_PAPER','原外边不是一条简单材料环。');next.set(a,b);}const loop:number[]=[];let v=boundary[0][0];while(!loop.includes(v)){loop.push(v);const n=next.get(v);if(n===undefined)fail('FINITE_PAPER','纸边未闭合。');v=n!;}if(v!==loop[0]||loop.length!==boundary.length||points.length-edges.length+faces.length!==1)fail('FINITE_PAPER','材料外环、三面或Euler覆盖不一致。');
 const index=new Map(edges.map(([a,b],i)=>[edgeKey(a,b),i])),faces_edges=faces.map(face=>face.map((a,i)=>index.get(edgeKey(a,face[(i+1)%face.length]))!)),edges_faces=edges.map((_,i)=>faces_edges.flatMap((row,f)=>row.includes(i)?[f]:[])),faces_faces=faces_edges.map((row,f)=>row.map(e=>edges_faces[e].find(other=>other!==f)??null)),proof=prove(points,faces,edges),ids=edges.map((_,i)=>`huffman-${r.model}-edge-${i}`),graph:FoldGraph={vertices_coords:points,edges_vertices:edges,edges_assignment:assignments,edges_foldAngle:assignments.map(x=>x==='B'?0:null),faces_vertices:faces,faces_edges,edges_faces,faces_faces:faces_faces as unknown as number[][]};
 return {graph,ids,proof,mapping,rawPoints,boundaryLoop:loop};
}

/** The original In4061 is a graphic half-turn, with no indexed Join claim.
 * This additional connected-union interpretation shares only three proven
 * literal identities, merges two material pairs, and adds no midline crease. */
function pairedMaterial(r:HuffmanFiniteCPRecipe,source:ReturnType<typeof sourceRows>){
 const original=material(r,source),rawPoints=original.rawPoints.map(p=>[...p] as Point),[p0,p1,p2]=original.mapping[0].vertices,mirror=new Map<number,number>([[p0,p2],[p1,p1],[p2,p0]]);
 for(let i=0;i<source.rows.length;i++)for(let curve=0;curve<4;curve++){
  const row=source.rows[i],raw=row.flat[curve],reflected=row.flatMirror[curve],id=original.mapping[i].vertices[curve];
  if(!same(reflected,[2-raw[0],-raw[1]]))fail('NUMERIC_SOURCE','原成对二维点未严格保留R(x,y)=(2−x,−y)；不修复或逆变换抹点。');
  const known=mirror.get(id);if(known===undefined){mirror.set(id,rawPoints.length);rawPoints.push([...reflected]);}else if(!same(rawPoints[known],reflected))fail('NUMERIC_SOURCE','原共享三点或符号恒定镜像点身份不一致；禁止容差焊接。');
 }
 const originalFaces=original.graph.faces_vertices!,mirroredFaces=originalFaces.map(face=>face.map(v=>mirror.get(v)!)),merge=(a:number[],b:number[],u:number,v:number)=>{
  if(!a.some((p,i)=>p===u&&a[(i+1)%a.length]===v)||!b.some((p,i)=>p===v&&b[(i+1)%b.length]===u))fail('FINITE_PAPER','原共同底边方向与合面合同不一致。');
  const ai=a.indexOf(v),bi=b.indexOf(u),left=a.slice(ai).concat(a.slice(0,ai)),right=b.slice(bi).concat(b.slice(0,bi)),face=left.concat(right.slice(1,-1));
  if(new Set(face).size!==face.length)fail('FINITE_PAPER','成对合面出现重复角身份；没有自动移动或裁切。');return face;
 },faces=[merge(originalFaces[0],mirroredFaces[1],p0,p1),merge(originalFaces[1],mirroredFaces[0],p1,p2),originalFaces[2],mirroredFaces[2]],points=rawPoints.map(p=>p.map(x=>x*r.unitSizeMm) as Point),edgeKey=(a:number,b:number)=>`${Math.min(a,b)},${Math.max(a,b)}`,creases=new Map<string,string>(),uses=new Map<string,{edge:[number,number];faces:number[];darts:[number,number][]}>();
 if(!points.flat().every(finite))fail('MATERIAL_INTERFACE','成对毫米坐标在当前double中溢出；原源点未改变。');
 original.graph.edges_vertices.forEach(([a,b],e)=>{const assignment=original.graph.edges_assignment[e];if(assignment==='B')return;creases.set(edgeKey(a,b),assignment);creases.set(edgeKey(mirror.get(a)!,mirror.get(b)!),assignment);});
 faces.forEach((face,f)=>face.forEach((a,i)=>{const b=face[(i+1)%face.length],key=edgeKey(a,b),item=uses.get(key)??{edge:[a,b],faces:[],darts:[]};item.faces.push(f);item.darts.push([a,b]);uses.set(key,item);}));
 if(uses.has(edgeKey(p0,p1))||uses.has(edgeKey(p1,p2)))fail('FINITE_PAPER','原共享底边仍被错误导出为内部seam。');
 const edges:[number,number][]=[],assignments:string[]=[],owners:number[][]=[],boundary:[number,number][]=[];
 for(const [key,item]of uses){let assignment:string;if(item.faces.length===1){assignment='B';boundary.push(item.darts[0]);}
  else if(item.faces.length===2&&item.darts[0][0]===item.darts[1][1]&&item.darts[0][1]===item.darts[1][0]){assignment=creases.get(key)??'';if(!assignment)fail('FINITE_PAPER','成对纸域内部出现非原M/V曲折边。');}
  else fail('FINITE_PAPER','成对材料边面覆盖或反向归属不一致。');edges.push(item.edge);assignments.push(assignment!);owners.push(item.faces);
 }
 if(edges.some(([a,b])=>same(points[a],points[b])&&!same(rawPoints[a],rawPoints[b])))fail('MATERIAL_INTERFACE','成对单位转换使原不同点在double中不分离。');
 const next=new Map<number,number>();for(const [a,b]of boundary){if(next.has(a))fail('FINITE_PAPER','成对材料不具有唯一简单外环。');next.set(a,b);}const loop:number[]=[];let v=boundary[0][0];while(!loop.includes(v)){loop.push(v);const n=next.get(v);if(n===undefined)fail('FINITE_PAPER','成对纸边未闭合。');v=n!;}
 if(v!==loop[0]||loop.length!==boundary.length||points.length-edges.length+faces.length!==1)fail('FINITE_PAPER','成对材料不能通过单外环与Euler1覆盖。');
 const index=new Map(edges.map(([a,b],i)=>[edgeKey(a,b),i])),faceEdges=faces.map(face=>face.map((a,i)=>index.get(edgeKey(a,face[(i+1)%face.length]))!)),neighbors=faceEdges.map((row,f)=>row.map(e=>owners[e].find(other=>other!==f)??null)),proof=prove(points,faces,edges),ids=edges.map((_,i)=>`huffman-${r.model}-pair-edge-${i}`),graph:FoldGraph={vertices_coords:points,edges_vertices:edges,edges_assignment:assignments,edges_foldAngle:assignments.map(k=>k==='B'?0:null),faces_vertices:faces,faces_edges:faceEdges,edges_faces:owners,faces_faces:neighbors as unknown as number[][]};
 return {graph,ids,proof,mapping:original.mapping,rawPoints,boundaryLoop:loop,pairMapping:{halfTurnVertexMap:Object.fromEntries(mirror),originalRows:original.mapping,rotatedRows:original.mapping.map(row=>({...row,vertices:row.vertices.map(v=>mirror.get(v)!)})),knownSharedVertices:{f0_equals_Rf2_q0:p0,f1_t0_equals_Rf1_t0:p1,f2_q0_equals_Rf0:p2},removedSharedBottomEdges:[[p0,p1],[p1,p2]],addedInternalSeams:0}};
}

export function huffmanFiniteCPDocument(rawRecipe:unknown,rawSource:unknown):Doc{
 const r=validateHuffmanFiniteCPRecipe(rawRecipe),source=sourceRows(rawSource,r),built=r.paperMode==='paired'?pairedMaterial(r,source):material(r,source),p=built.graph.vertices_coords,doc:Doc={name:r.paperMode==='paired'?r.model==='circle4'?'Huffman 圆曲折 · 成对有限纸面':'Huffman 共焦抛物线 · 成对有限纸面':r.model==='circle4'?'Huffman 圆曲折 · 单块有限纸面':'Huffman 共焦抛物线 · 单块有限纸面',paper:{width:Math.max(...p.map(p=>p[0]))-Math.min(...p.map(p=>p[0])),height:Math.max(...p.map(p=>p[1]))-Math.min(...p.map(p=>p[1]))},segments:built.ids.map((id,i)=>{const [a,b]=built.graph.edges_vertices[i];return {id,a:[...p[a]],b:[...p[b]],assignment:built.graph.edges_assignment[i] as any,angle:built.graph.edges_foldAngle[i]};})};
 let topology;try{validateDoc(doc);topology=createMaterialTopology(doc,built.graph,built.ids);}catch(error){return fail('MATERIAL_INTERFACE',error instanceof Error?error.message:String(error));}
 doc.metadata={materialTopology:topology,[NS]:{schema:SCHEMA,recipe:r,nativeSource:clone(source.native),resolvedParametersDeg:[...source.resolved],sourceToActualVertexMap:built.mapping,rawWorldPoints:built.rawPoints,finitePaperProof:built.proof,boundaryLoop:built.boundaryLoop,
  source:{definitionCell:r.model==='circle4'?'In[4070]':'In[4058]',drawingCell:'In[4059]',savedExampleCell:r.model==='circle4'?'In[4072]':'In[4060]',notebookSHA256:'19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9',sourceCompletion:r.model==='circle4'?'fully-worked-out-building-block':'partially-worked-out-building-block',originalUnitsUnspecified:true,unitSizeMm:r.unitSizeMm,coordinateTransform:'one explicit unitSizeMm multiplication; no translation/normalization/crop/snap',symbolicIdentitiesOnly:true,sourceCurveAssignments:{f1:'V',f2:'M'},rulingsAreReferenceOnly:true},
  numericPolicy:{planarReplay:'local Dormand-Prince 5(4), three literal consistency states',phaseReplayBudgetRad:source.phaseBudgetRad,planarFormulaBudget:'64*EPS*max(1,abs(expected raw coordinate))',intervalODECertified:false,MP80ODECertified:false,WolframExecuted:false,originalNumericQDomainComplete:false},
  evidence:{finiteSingleBlockChordMaterial:true,trueMaterialFaces:3,pairedBlockMaterialCompleted:false,sourceSpatialCertificationUnchanged:true,sourceThirdSpatialRulingOffset:1e-6,sourceGammaIsRigidEdgeAngle:false,curvedCreasesAreFiniteChords:true,exactContinuousCurves:false,threeDimensionalMaterial:false,rigidMotion:false,flatFold:false,layerOrder:false,selfCollision:false}}};
 if(r.paperMode==='paired'){
  const legacy=doc.metadata[NS] as any;delete doc.metadata[NS];
  doc.metadata[PAIR_NS]={...legacy,schema:PAIR_SCHEMA,pairSourceToActualVertexMap:(built as ReturnType<typeof pairedMaterial>).pairMapping,
   source:{...legacy.source,drawingCell:'In[4061]',blockDrawingCell:'In[4059]',savedExampleCell:r.model==='circle4'?'In[4072]':'In[4062]',originalIndexedConnectivityDeclared:false,pairTransform:'R(x,y)=(2-x,-y); half-turn about f1(0)=(1,0), determinant+1',paperInterpretation:'additional finite connected-union material; not a literal indexed Join declaration'},
   evidence:{...legacy.evidence,finiteSingleBlockChordMaterial:false,finitePairedChordMaterial:true,trueMaterialFaces:4,pairedBlockMaterialCompleted:true,newMidlineOrRulingCPSeams:0,originalPairGraphicReproducedAsFiniteUnion:true}};
 }
 return doc;
}
/** Hand edits retain source reconstruction, but fresh adoption still needs
 * the full matcher. Recipe reading never claims current geometry is source. */
export function readHuffmanFiniteCPRecipe(doc:Doc):HuffmanFiniteCPRecipe|null{try{if(Object.hasOwn(doc.metadata??{},NS)&&Object.hasOwn(doc.metadata??{},PAIR_NS))return null;const value=doc.metadata?.[PAIR_NS]??doc.metadata?.[NS];if(!object(value))return null;const recipe=validateHuffmanFiniteCPRecipe(value.recipe);return value.schema===(recipe.paperMode==='paired'?PAIR_SCHEMA:SCHEMA)?recipe:null;}catch{return null;}}
export function huffmanFiniteCPSourceMatches(doc:Doc):boolean{
 try{validateDoc(doc);const r=readHuffmanFiniteCPRecipe(doc);if(!r)return false;const namespace=r.paperMode==='paired'?PAIR_NS:NS,own=doc.metadata?.[namespace],actual=inspectMaterialTopology(doc);if(!object(own)||!actual.ok||actual.foldedVertices||actual.startingFace!==undefined||Object.hasOwn(doc,'flatFold'))return false;
  const expected=huffmanFiniteCPDocument(r,own.nativeSource),material=inspectMaterialTopology(expected);if(!material.ok||!same(own,expected.metadata![namespace])||!same(actual.graph,material.graph)||!same(actual.edgeSegmentIds,material.edgeSegmentIds)||!same(doc.paper,expected.paper)||!same(doc.segments,expected.segments)||doc.objects?.length)return false;return true;
 }catch{return false;}
}
