import {validateDoc,type Doc,type FoldGraph,type Point,type Assignment} from '../core/types';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';

type Common={stripWidthMm:number;repeatPairs:number;minorFoldAngleDeg:number};
export type SemiGeneralMiuraRecipe=Common&(
 |{mode:'angles';sectorAnglesDeg:number[];distancesMm:number[]}
 |{mode:'bends';bendAnglesDeg:number[];distancesMm:number[]}
 |{mode:'path';pathMm:Point[];designMinorFoldAngleDeg:number;firstBendAngleDeg:number;lastBendAngleDeg:number}
 |{mode:'tachi';beta0Deg:number;designMinorFoldAngleDeg:number;horizontalHalfLengthMm:number;diagonalLengthMm:number;lengthRepeats:number});
const namespace='originalSemiGeneralMiura',schema='original-in2544-in2547-in2553-in2561-finite-cp-v1',notebookSHA256='19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9';
const DEG=Math.PI/180,MAX_COLUMNS=32,MAX_PAIRS=8;
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const range=(v:unknown,lo:number,hi:number):v is number=>finite(v)&&v>=lo&&v<=hi;
const xor=(...v:boolean[])=>v.reduce((a,b)=>a!==b,false);
const same=(a:unknown,b:unknown):boolean=>Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v)):record(b)?record(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>Object.hasOwn(a,k)&&same(a[k],b[k])):typeof a===typeof b&&a===b;
// Runtime transcendental replay only. Literal parameters, incidence and intra-document bindings remain exact.
const near=(a:unknown,b:number)=>finite(a)&&Math.abs(a-b)<=Math.max(2e-12,128*Number.EPSILON*Math.max(1,Math.abs(b)));
function numericSame(a:unknown,b:unknown):boolean{return typeof b==='number'?near(a,b):Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>numericSame(a[i],v)):record(b)?record(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>numericSame(a[k],b[k])):same(a,b);}
function minor(v:unknown){return range(v,-175,175)&&Math.abs(v)>=1;}
function length(v:unknown){return range(v,.01,200);}
function integer(v:unknown,hi:number){return range(v,1,hi)&&Number.isInteger(v);}
function assertKeys(v:Record<string,any>,keys:string[]){if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw Error('原构造参数字段不完整或含未支持字段。');}
export function validateSemiGeneralMiuraRecipe(raw:unknown):SemiGeneralMiuraRecipe{
 if(!record(raw)||!['angles','bends','path','tachi'].includes(raw.mode))throw Error('需要原 A / B / P / Tachi 构造类型。');
 const common=['mode','stripWidthMm','repeatPairs','minorFoldAngleDeg'];
 const extra=raw.mode==='angles'?['sectorAnglesDeg','distancesMm']:raw.mode==='bends'?['bendAnglesDeg','distancesMm']:raw.mode==='path'?['pathMm','designMinorFoldAngleDeg','firstBendAngleDeg','lastBendAngleDeg']:['beta0Deg','designMinorFoldAngleDeg','horizontalHalfLengthMm','diagonalLengthMm','lengthRepeats'];
 assertKeys(raw,[...common,...extra]);
 if(!length(raw.stripWidthMm))throw Error('原条带宽须为 0.01–200 mm。');
 if(!integer(raw.repeatPairs,MAX_PAIRS))throw Error('横向重复对数须为 1–8 整数（有限材料预算）。');
 if(!minor(raw.minorFoldAngleDeg))throw Error('当前小折角绝对值须为 1–175°（当前有限入口）。');
 if(raw.mode==='angles'||raw.mode==='bends'){
  const list=raw[raw.mode==='angles'?'sectorAnglesDeg':'bendAnglesDeg'];
  if(!Array.isArray(list)||list.length<2||list.length>MAX_COLUMNS+1||list.some(a=>!finite(a)))throw Error('原角列表须含 2–33 个有限角。');
  if(!Array.isArray(raw.distancesMm)||raw.distancesMm.length!==list.length-1||raw.distancesMm.some(d=>!length(d)))throw Error('原间距须为 0.01–200 mm，且角列表比间距多一个元素。');
  if(raw.mode==='angles')checkSectors(list);
  else if(list.some(a=>Math.abs(a)>180||a===0))throw Error('原转角须为非零且绝对值不超过 180°；不能改写极点。');
 }
 if(raw.mode==='path'||raw.mode==='tachi'){
  if(!minor(raw.designMinorFoldAngleDeg))throw Error('设计小折角绝对值须为 1–175°（当前有限入口）。');
  if(raw.mode==='path'){
   if(!Array.isArray(raw.pathMm)||raw.pathMm.length<2||raw.pathMm.length>MAX_COLUMNS+1||raw.pathMm.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!range(n,-10000,10000))))throw Error('目标路径须为 2–33 个有限二维毫米点，坐标绝对值不超过 10000。');
   if(![raw.firstBendAngleDeg,raw.lastBendAngleDeg].every(a=>range(a,-180,180)&&a!==0))throw Error('首末端原转角须非零且绝对值不超过 180°。');
   if(raw.pathMm.some((p:Point,i:number)=>i&&Math.hypot(p[0]-raw.pathMm[i-1][0],p[1]-raw.pathMm[i-1][1])<=1e-9))throw Error('原路径含零长或低于有限精度的段。');
  }else{
   if(!range(raw.beta0Deg,-175,175)||Math.abs(raw.beta0Deg)<1)throw Error('Tachi 首设计转角绝对值须为 1–175°。');
   if(!length(raw.horizontalHalfLengthMm)||!length(raw.diagonalLengthMm))throw Error('Tachi 水平半段与斜段须为 0.01–200 mm。');
   if(!integer(raw.lengthRepeats,7))throw Error('Tachi 纵向重复数须为 1–7 整数（原首段加每组四段，共最多 29 段）。');
  }
 }
 return Object.fromEntries([...common,...extra].map(k=>[k,structuredClone(raw[k])])) as SemiGeneralMiuraRecipe;
}
function checkSectors(a:number[]){for(let i=0;i<a.length;i++){if(!finite(a[i])||a[i]<=0||a[i]>180||i>0&&i<a.length-1&&a[i]===90)throw Error('原 A badangs：扇区须为 (0,180]°，内部扇区不可为 90°。');if(a[i]===180)throw Error('原 A Cot[180°] 极点不能生成有限纸面。');}}
// These exact quadrant cases are source identities, not coordinate snapping.
function cotDeg(a:number){if(a%180===0)throw Error('原 Cot 极点不能生成有限纸面。');return Math.abs(a%180)===90?0:1/Math.tan(a*DEG);}
function cosDeg(a:number){return Math.abs(a%180)===90?0:Math.cos(a*DEG);}
function arcCot(x:number){return x===0?Math.PI/2:Math.atan(1/x);}
function bendsToSectors(b:number[],gamma:number){return b.map((v,k)=>{const mfi=xor(gamma>0,(k+1)%2===1);return v>0?mfi?v/2:180-v/2:mfi?180+v/2:-v/2;});}
function sourcePath(path:Point[],w:number,designGamma:number,fb:number,lb:number){
 const vectors=path.slice(1).map((p,i):Point=>[p[0]-path[i][0],p[1]-path[i][1]]),pathLengthsMm=vectors.map(p=>Math.hypot(...p));
 const bendAnglesDeg=[fb,...vectors.slice(1).map((v,i)=>{const u=vectors[i],a=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);return (a===-Math.PI?Math.PI:a)/DEG;}),lb];
 const sectorAnglesDeg=bendAnglesDeg.map((b,k)=>{if(Math.abs(b)===180)return 90;if(b===0)throw Error('原 P 的直行转角为 0，产生 Cot[0] 极点；未删点或改角。');const gm=designGamma*((k+1)%2?-1:1),a=Math.atan(Math.tan(b*DEG/2)/Math.sin(gm*DEG/2));return (a<0?a+Math.PI:a)/DEG;});
 checkSectors(sectorAnglesDeg);
 const distancesMm=pathLengthsMm.map((d,i)=>d-(w/2)*cotDeg(sectorAnglesDeg[i+1])+(w/2)*cotDeg(sectorAnglesDeg[i]));
 return {sectorAnglesDeg,distancesMm,bendAnglesDeg,pathLengthsMm};
}
function tachiPath(p:Extract<SemiGeneralMiuraRecipe,{mode:'tachi'}>){
 const zeta0Deg=180-Math.abs(p.beta0Deg),alphaDeg=Math.atan(cotDeg(zeta0Deg/2)/Math.sin(p.designMinorFoldAngleDeg*DEG/2))/DEG,
  zetaDeg=2*Math.atan(cotDeg(alphaDeg)/Math.sin(p.minorFoldAngleDeg*DEG/2))/DEG,betaDeg=180-zetaDeg,
  // In[2561] assigns h but never reads it in the path, P call, or returned tobj.
  // Represent the exact Sec[90°] pole explicitly; binary64 cos(pi/2) is not a finite source height.
  heightPole=Math.abs(p.beta0Deg)===90,h=heightPole?null:Math.sin(zetaDeg*DEG)/Math.cos(zeta0Deg*DEG),dh=p.horizontalHalfLengthMm,dd=p.diagonalLengthMm;
 if(![alphaDeg,zetaDeg,betaDeg].every(Number.isFinite)||h!==null&&!Number.isFinite(h))throw Error('原 Tachi 设计→当前路径公式不有限。');
 const unit=(a:number):Point=>[Math.cos(a*DEG),Math.sin(a*DEG)],u=unit(180-zetaDeg),v=unit(180+zetaDeg),dpts:Point[]=[[dd*u[0],dd*u[1]]];
 dpts.push([dpts[0][0]+2*dh,dpts[0][1]]);dpts.push([dpts[1][0]+dd*v[0],dpts[1][1]+dd*v[1]]);dpts.push([dpts[2][0]+2*dh,dpts[2][1]]);
 const pathMm:Point[]=[[0,0],[dh,0]];
 for(let i=0;i<p.lengthRepeats;i++){const last=pathMm.at(-1)!;for(const q of dpts)pathMm.push([last[0]+q[0],last[1]+q[1]]);}
 pathMm.at(-1)![0]-=dh;for(const q of pathMm)q[1]*=Math.sign(p.beta0Deg);
 return {pathMm,tachi:{zeta0Deg,alphaDeg,zetaDeg,betaDeg,unusedOriginalHeight:h,pScalarDesignGammaDeg:p.minorFoldAngleDeg,...(heightPole?{unusedOriginalHeightStatus:'source-sec-pole-unused-by-cp' as const}:{})}};
}
function rectangularGraph(a:number[],d:number[],w:number,nw:number,gamma:number):FoldGraph{
 checkSectors(a);if(d.some(x=>!finite(x)))throw Error('原修正间距不有限。');
 const nh=d.length,nv=2*nw,rlist=[0];for(const v of d)rlist.push(rlist.at(-1)!+v);
 const vertices_coords:Point[]=Array.from({length:(nh+1)*(nv+1)},(_,k)=>{const i=k%(nh+1),j=Math.floor(k/(nh+1));return [rlist[i]+(j%2===0?w*cotDeg(a[i]):0),j*w];}),edges_vertices:[number,number][]=[],edges_assignment:Assignment[]=[],edges_foldAngle:number[]=[],faces_vertices:number[][]=[];
 const id=(i:number,j:number)=>j*(nh+1)+i,edge=(u:number,v:number,border:boolean,valley:boolean,magnitude:number)=>{edges_vertices.push([u,v]);edges_assignment.push(border?'B':valley?'V':'M');edges_foldAngle.push(border?0:(valley?1:-1)*magnitude);};
 for(let j=0;j<=nv;j++)for(let i=0;i<nh;i++)edge(id(i,j),id(i+1,j),j===0||j===nv,xor((i+j)%2===0,gamma>0),Math.abs(gamma));
 for(let j=0;j<nv;j++)for(let i=0;i<=nh;i++)edge(id(i,j),id(i,j+1),i===0||i===nh,xor(i%2===0,a[i]>90,gamma>0),Math.abs(2*arcCot(cosDeg(a[i])*cotDeg(gamma/2)))/DEG);
 for(let j=0;j<nv;j++)for(let i=0;i<nh;i++)faces_vertices.push([id(i,j),id(i+1,j),id(i+1,j+1),id(i,j+1)]);
 const offset=nh*(nv+1),faces_edges=faces_vertices.map((_,f)=>{const i=f%nh,j=Math.floor(f/nh);return [j*nh+i,offset+j*(nh+1)+i+1,(j+1)*nh+i,offset+j*(nh+1)+i];}),edges_faces=edges_vertices.map(()=>[] as number[]);
 faces_edges.forEach((es,f)=>es.forEach(e=>edges_faces[e].push(f)));const faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(owner=>owner!==f)??null)) as unknown as number[][];
 return {vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces};
}
export function semiGeneralMiuraPreset(mode:SemiGeneralMiuraRecipe['mode']='path'):SemiGeneralMiuraRecipe{
 if(mode==='angles')return {mode,stripWidthMm:.5,repeatPairs:1,minorFoldAngleDeg:45,sectorAnglesDeg:[90,120,60,89,90],distancesMm:[1,1,1,1]};
 if(mode==='bends')return {mode,stripWidthMm:.25,repeatPairs:2,minorFoldAngleDeg:45,bendAnglesDeg:[180,-120,-120,179,-180],distancesMm:[1,1,1,1]};
 if(mode==='tachi')return {mode,stripWidthMm:1.2,repeatPairs:2,minorFoldAngleDeg:105,designMinorFoldAngleDeg:90,beta0Deg:60,horizontalHalfLengthMm:1,diagonalLengthMm:1,lengthRepeats:2};
 return {mode,stripWidthMm:.25,repeatPairs:2,minorFoldAngleDeg:90,designMinorFoldAngleDeg:90,pathMm:[[0,0],[1,0],[1,1],[2,1]],firstBendAngleDeg:180,lastBendAngleDeg:180};
}
export function evaluateSemiGeneralMiuraSource(raw:SemiGeneralMiuraRecipe){
 const p=validateSemiGeneralMiuraRecipe(raw);let derived:{sectorAnglesDeg:number[];distancesMm:number[];bendAnglesDeg?:number[];pathLengthsMm?:number[];pathMm?:Point[];tachi?:ReturnType<typeof tachiPath>['tachi']};
 if(p.mode==='angles')derived={sectorAnglesDeg:[...p.sectorAnglesDeg],distancesMm:[...p.distancesMm]};
 else if(p.mode==='bends')derived={sectorAnglesDeg:bendsToSectors(p.bendAnglesDeg,p.minorFoldAngleDeg),distancesMm:[...p.distancesMm],bendAnglesDeg:[...p.bendAnglesDeg]};
 else if(p.mode==='path')derived={...sourcePath(p.pathMm,p.stripWidthMm,p.designMinorFoldAngleDeg,p.firstBendAngleDeg,p.lastBendAngleDeg),pathMm:structuredClone(p.pathMm)};
 else{const t=tachiPath(p);derived={...sourcePath(t.pathMm,p.stripWidthMm,p.minorFoldAngleDeg,180,180),...t};}
 const graph=rectangularGraph(derived.sectorAnglesDeg,derived.distancesMm,p.stripWidthMm,p.repeatPairs,p.minorFoldAngleDeg);
 return {...derived,graph,source:{constructor:p.mode==='angles'?'MakeSemigeneralizedMiuraOriA':p.mode==='bends'?'MakeSemigeneralizedMiuraOriB':p.mode==='path'?'MakeSemigeneralizedMiuraOriP':'MakeTachiMiuraSheet',definitionCell:p.mode==='angles'?'In[2544]':p.mode==='bends'?'In[2547]':p.mode==='path'?'In[2553]':'In[2561]',pathScalarOverload:p.mode==='tachi'?'In[2554]':null,pathDefaultsCell:p.mode==='path'||p.mode==='tachi'?'In[2552]':null,rotationAngleCell:p.mode==='path'||p.mode==='tachi'?'In[272]':null,notebookSHA256,sourceRecipeKey:JSON.stringify(p),vertexOrder:'row major, original i=0..nd then j=0..2 nw',edgeOrder:'all horizontal j,i then all vertical j,i',borderOverride:true,lengthUnitConvention:'1 original parameter unit = 1 mm; original coordinates unchanged',originalEvenRowOffsetRetained:true,sourceModel:'finite binary64 replay of original literal formulas',arcCotBranch:'real signed principal atan(1/x), ArcCot(0)=pi/2',budget:{maxColumns:MAX_COLUMNS,maxRepeatPairs:MAX_PAIRS,maxFaces:MAX_COLUMNS*2*MAX_PAIRS},replayTolerance:{primitiveIdentities:'exact',transcendentalAbsolute:2e-12,transcendentalRelativeEPS:128}}};
}
function info(p:SemiGeneralMiuraRecipe,ev:ReturnType<typeof evaluateSemiGeneralMiuraSource>){const {graph,...derived}=ev;return {schema,recipe:structuredClone(p),derived,evidence:{finiteMaterialValidated:true,CPOnly:true,original3DConstructionReproduced:false,staticGlobalIsometryChecked:false,wholeSheetLayerOrderChecked:false,continuousRigidPathChecked:false,selfCollisionChecked:false,wolframExecuted:false}};}
export function generateSemiGeneralMiuraDocument(raw:SemiGeneralMiuraRecipe):Doc{
 const p=validateSemiGeneralMiuraRecipe(raw),ev=evaluateSemiGeneralMiuraSource(p),g=ev.graph,x=g.vertices_coords.map(v=>v[0]),y=g.vertices_coords.map(v=>v[1]);
 const doc:Doc={schemaVersion:2,name:p.mode==='tachi'?'原 Tachi–Miura 有限 CP':'原半广义 Miura 路径波纹 CP',paper:{width:Math.max(...x)-Math.min(...x),height:Math.max(...y)-Math.min(...y)},objects:[],segments:g.edges_vertices.map(([a,b],i)=>({id:'original-semigeneral-miura-'+i,a:[...g.vertices_coords[a]],b:[...g.vertices_coords[b]],assignment:g.edges_assignment[i] as Assignment,angle:g.edges_foldAngle[i]})),metadata:{[namespace]:info(p,ev)}};
 validateDoc(doc);doc.metadata!.materialTopology=createMaterialTopology(doc,g,doc.segments.map(s=>s.id));return doc;
}
export function readSemiGeneralMiuraRecipe(doc:Doc):SemiGeneralMiuraRecipe|null{try{const s=doc.metadata?.[namespace];return record(s)&&s.schema===schema?validateSemiGeneralMiuraRecipe(s.recipe):null;}catch{return null;}}
export function semiGeneralMiuraSourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);const p=readSemiGeneralMiuraRecipe(doc);if(!p||doc.flatFold!==undefined||doc.background!==undefined||!same(doc.objects??[],[]))return false;
  const own=doc.metadata![namespace],ev=evaluateSemiGeneralMiuraSource(p),expected=info(p,ev),material=inspectMaterialTopology(doc);if(!record(own)||!material.ok||material.foldedVertices!==undefined||material.startingFace!==undefined)return false;
  if(!same(Object.keys(own).sort(),Object.keys(expected).sort())||!same(own.schema,expected.schema)||!same(own.recipe,expected.recipe)||!same(own.evidence,expected.evidence)||!record(own.derived)||!same(own.derived.source,expected.derived.source)||!numericSame(own.derived,expected.derived))return false;
  // User lists and exact endpoint/alternating identities are stricter than transcendental values.
  if(p.mode==='angles'&&(!same(own.derived.sectorAnglesDeg,p.sectorAnglesDeg)||!same(own.derived.distancesMm,p.distancesMm)))return false;
  if(p.mode==='bends'&&(!same(own.derived.sectorAnglesDeg,ev.sectorAnglesDeg)||!same(own.derived.bendAnglesDeg,p.bendAnglesDeg)||!same(own.derived.distancesMm,p.distancesMm)))return false;
  if(p.mode==='path'&&(!same(own.derived.pathMm,p.pathMm)||own.derived.bendAnglesDeg[0]!==p.firstBendAngleDeg||own.derived.bendAnglesDeg.at(-1)!==p.lastBendAngleDeg))return false;
  if(p.mode==='tachi'&&(!record(own.derived.tachi)||own.derived.tachi.pScalarDesignGammaDeg!==p.minorFoldAngleDeg||own.derived.tachi.zeta0Deg!==180-Math.abs(p.beta0Deg)||!same(own.derived.pathMm?.[0],[0,0])||!same(own.derived.pathMm?.[1],[p.horizontalHalfLengthMm,0])))return false;
  if((p.mode==='path'||p.mode==='tachi')&&own.derived.sectorAnglesDeg.some((a:number,i:number)=>Math.abs(ev.bendAnglesDeg![i])===180&&a!==90))return false;
  const rawMaterial=doc.metadata!.materialTopology,g=material.graph,e=ev.graph;
  if(!record(rawMaterial)||rawMaterial.schema!=='zhezhi-material-topology-v1'||!same(Object.keys(rawMaterial).sort(),['edgeSegmentIds','graph','schema'])||!record(rawMaterial.graph)||!same(Object.keys(rawMaterial.graph).sort(),Object.keys(e).sort())||!same(rawMaterial.graph,g))return false;
  for(const k of ['edges_vertices','edges_assignment','faces_vertices','faces_edges','edges_faces','faces_faces'])if(!same(g[k],e[k]))return false;
  if(!numericSame(g.vertices_coords,e.vertices_coords)||!numericSame(g.edges_foldAngle,e.edges_foldAngle))return false;
  const columns=ev.distancesMm.length,horizontalCount=columns*(2*p.repeatPairs+1),rlist=[0];for(const d of ev.distancesMm)rlist.push(rlist.at(-1)!+d);
  if(g.vertices_coords.some((v,i)=>{const x=i%(columns+1),j=Math.floor(i/(columns+1)),odd=g.vertices_coords[columns+1+x][0];return v[1]!==j*p.stripWidthMm||v[0]!==g.vertices_coords[(j%2)*(columns+1)+x][0]||j%2===1&&x===0&&v[0]!==0||ev.sectorAnglesDeg[x]===90&&v[0]!==odd||(p.mode==='angles'||p.mode==='bends')&&j%2===1&&v[0]!==rlist[x];}))return false;
  if(g.edges_foldAngle.some((a,i)=>e.edges_assignment[i]==='B'?a!==0:i<horizontalCount?a!==e.edges_foldAngle[i]:!near(a,e.edges_foldAngle[i] as number)))return false;
  if(g.edges_foldAngle.slice(horizontalCount).some((a,i)=>a!==g.edges_foldAngle[horizontalCount+i%(columns+1)]))return false;
  if(doc.segments.length!==e.edges_vertices.length||!same(material.edgeSegmentIds,doc.segments.map(s=>s.id)))return false;
  if(doc.segments.some((s,i)=>{const [a,b]=g.edges_vertices[i];return s.id!=='original-semigeneral-miura-'+i||s.assignment!==g.edges_assignment[i]||s.angle!==g.edges_foldAngle[i]||!same(s.a,g.vertices_coords[a])||!same(s.b,g.vertices_coords[b]);}))return false;
  const x=g.vertices_coords.map(v=>v[0]),y=g.vertices_coords.map(v=>v[1]);return doc.paper.width===Math.max(...x)-Math.min(...x)&&doc.paper.height===Math.max(...y)-Math.min(...y)&&near(doc.paper.width,Math.max(...e.vertices_coords.map(v=>v[0]))-Math.min(...e.vertices_coords.map(v=>v[0])))&&doc.paper.height===2*p.repeatPairs*p.stripWidthMm;
 }catch{return false;}
}
