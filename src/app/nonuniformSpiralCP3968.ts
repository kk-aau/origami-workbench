/** Literal saved In[3968] source, with a separate, strictly checked local finite paper. */
import {fetchGenericNonuniformHelixWhenIdle,parseGenericNonuniformHelixResult,makeGenericNonuniformHelixSource,
 type GenericNonuniformHelixQuery,type GenericNonuniformHelixResult} from './curvedNativeNonuniformHelix';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point,type Segment} from '../core/types';
import {polygonArea} from '../core/geometry';

export type NonuniformSpiralCP3968Recipe={parameterStart:number;parameterEnd:number;leftWidth:number;rightWidth:number;segments:number};
export const NONUNIFORM_SPIRAL_CP_3968_EXAMPLE:NonuniformSpiralCP3968Recipe={parameterStart:0,parameterEnd:Math.PI,leftWidth:.5,rightWidth:.5,segments:100};
const SCHEMA='original-in3968-local-inset-cp-v1',BOUND=1e-13,C=Math.cos(Math.PI/6),A=Math.sin(Math.PI/6),V=1/C;
const object=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),
 finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),
 keys=(x:Record<string,unknown>,ns:string[])=>Object.keys(x).length===ns.length&&ns.every(k=>Object.hasOwn(x,k)),clone=<T>(x:T):T=>structuredClone(x);
function fail(message='原 In[3968] 保存输入、世界坐标、内切纸域或实际材料身份不一致。'):never{throw Error(message);}
export function validateNonuniformSpiralCP3968Recipe(raw:unknown):NonuniformSpiralCP3968Recipe{
 if(!object(raw)||!keys(raw,Object.keys(NONUNIFORM_SPIRAL_CP_3968_EXAMPLE))||Object.values(raw).some(x=>!finite(x)))fail('须显式填写完整五个有限数值参数，不接受未知字段或隐式默认。');
 const r=raw as NonuniformSpiralCP3968Recipe;
 if(r.parameterStart<0||r.parameterEnd>Math.PI||r.parameterEnd-r.parameterStart<.1)fail('u 须在原 [0,π] 内，区间跨度至少 0.1 rad。');
 if(r.leftWidth<.05||r.leftWidth>1||r.rightWidth<.05||r.rightWidth>1)fail('左右纸域宽度各须为 0.05…1 mm，不超原单位宽参考。');
 if(r.leftWidth>nonuniformSpiralCP3968MaximumLeftWidth(r.parameterStart))fail('当前左宽越过源焦点安全界；请减小左宽或调整区间起点，不会自动裁剪。');
 if(!Number.isInteger(r.segments)||r.segments<16||r.segments>128)fail('有限纸域须为 16…128 弦；100 弦沿用原绘图密度角色。');
 return {...r};
}
export function nonuniformSpiralCP3968MaximumLeftWidth(start:number):number{
 if(!finite(start)||start<0||start>Math.PI)fail('原区间起点无效。');
 const b=2*C*Math.sin(Math.PI/6+start/6),along=2*A+1/3,den=Math.hypot(along,b),
  omega=C*Math.cos(Math.PI/6+start/6)*(1+along/(3*den*den));
 return Math.min(1,V*b/den/omega-1e-4);
}
export function nonuniformSpiralCP3968Query(value:unknown):GenericNonuniformHelixQuery{
 const r=validateNonuniformSpiralCP3968Recipe(value);
 return {family:'nonuniform-helix-generic-native',radius:1,pitchAngle:Math.PI/6,foldAngle:'pi/3+s/3',
  parameterStart:r.parameterStart,parameterEnd:r.parameterEnd,transverseStart:0,transverseEnd:1,segments:r.segments,rulingSegments:16};
}

// Positive Gauss-Legendre nodes/weights; pairs reflect through the midpoint.
const GL32:[number,number][]=[[0.048307665687738324,0.09654008851472766],[0.1444719615827965,0.09563872007927471],[0.23928736225213706,0.09384439908080451],[0.33186860228212767,0.09117387869576378],[0.42135127613063533,0.08765209300440378],[0.5068999089322294,0.08331192422694671],[0.5877157572407623,0.07819389578707023],[0.6630442669302152,0.07234579410884834],[0.7321821187402897,0.06582222277636168],[0.7944837959679424,0.058684093478535565],[0.84936761373257,0.05099805926237609],[0.8963211557660521,0.042835898022226836],[0.9349060759377397,0.034273862913021765],[0.9647622555875064,0.025392065309262024],[0.9856115115452684,0.016274394730905743],[0.9972638618494816,0.007018610009470506]];
const GL64:[number,number][]=[[0.02435029266342443,0.048690957009139814],[0.07299312178779904,0.04857546744150351],[0.12146281929612054,0.048344762234802996],[0.16964442042399283,0.04799938859645842],[0.21742364374000708,0.04754016571483042],[0.2646871622087674,0.046968182816210076],[0.31132287199021097,0.04628479658131447],[0.3572201583376681,0.045491627927418184],[0.4022701579639916,0.044590558163756566],[0.4463660172534641,0.04358372452932355],[0.48940314570705296,0.04247351512365361],[0.5312794640198946,0.041262563242623576],[0.571895646202634,0.039953741132720544],[0.6111553551723933,0.03855015317861564],[0.6489654712546573,0.03705512854024009],[0.6852363130542333,0.0354722132568823],[0.7198818501716109,0.033805161837141794],[0.7528199072605319,0.032057928354851495],[0.7839723589433414,0.030234657072402554],[0.8132653151227975,0.028339672614259535],[0.8406292962525803,0.02637746971505491],[0.8659993981540928,0.0243527025687112],[0.8893154459951141,0.02227017380838297],[0.9105221370785028,0.020134823153530088],[0.9295691721319396,0.017951715775697284],[0.9464113748584028,0.01572603047602503],[0.9610087996520538,0.01346304789671786],[0.973326827789911,0.011168139460131028],[0.983336253884626,0.008846759826363397],[0.9910133714767443,0.006504457968978502],[0.9963401167719552,0.004147033260564499],[0.9993050417357722,0.00178328072169414]];
function phase(u:number,start:number){return Math.PI/2+6*C*(Math.sin(Math.PI/6+u/6)-Math.sin(Math.PI/6+start/6));}
function quadrature(start:number,u:number,nodes:[number,number][]):Point{
 if(u===start)return [1,0];const mid=(start+u)/2,half=(u-start)/2;let x=1,y=0;
 for(const [node,weight]of nodes){const p=phase(mid-half*node,start),q=phase(mid+half*node,start),w=half*V*weight;
  x+=w*(Math.cos(p)+Math.cos(q));y+=w*(Math.sin(p)+Math.sin(q));}
 return [x,y];
}
function planar(u:number,start:number){
 const phi=phase(u,start),t:Point=u===start?[0,1]:[Math.cos(phi),Math.sin(phi)],normal:Point=[-t[1],t[0]],
  gamma=Math.PI/3+u/3,b=2*C*Math.sin(gamma/2),bp=C*Math.cos(gamma/2)/3,g=C*Math.cos(gamma/2),
  frame=(along:number,sign:number)=>{const den=Math.hypot(along,b),dp=b*bp/den,p=along/den,q=sign*b/den,
   pp=-along*dp/(den*den),qp=sign*(bp/den-b*dp/(den*den));
   return {director:t.map((x,i)=>p*x+q*normal[i]),directorPrime:t.map((x,i)=>(pp-q*g)*x+(qp+p*g)*normal[i]),p,q,pp,qp,g};};
 return {base:quadrature(start,u,GL32),base64:quadrature(start,u,GL64),basePrime:t.map(x=>V*x),tangent:t,leftNormal:normal,
  left:frame(2*A+1/3,1),right:frame(2*A-1/3,-1)};
}
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0),add=(a:number[],b:number[],w:number)=>a.map((x,i)=>x+w*b[i]),
 metric=(bp:number[],d:number[],dp:number[],w:number)=>{const t=add(bp,dp,w);return [dot(t,t),dot(t,d),dot(d,d)];};
/** A payload consistency identity only. Source equations are independently replayed below. */
function snapshot(value:unknown):string{
 const canonical=(x:any):string=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':object(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
 const text=canonical(value);let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619)>>>0;
 return 'fnv1a32:'+hash.toString(16).padStart(8,'0');
}
function checkedSource(raw:unknown,r:NonuniformSpiralCP3968Recipe){
 const query=nonuniformSpiralCP3968Query(r),native=parseGenericNonuniformHelixResult(raw,query),flat=native.flattening.result,
  literal=makeGenericNonuniformHelixSource(query),scale=literal.normalization.scale;
 if(!native.domain.certified||!native.certification.sourceRulesCertified||native.flattening.status!=='computed'||!flat||
   !flat.domain.certified||!flat.certification.formalCommonFlatteningCertified)fail('原完整源与固定初值数值展开未完成。');
 const domain=(d:any)=>{if(!d.certified||d.unresolved.length||d.cells.length<1||d.cells[0].start!==r.parameterStart||
  d.cells.at(-1).end!==r.parameterEnd||d.evaluations!==2*d.cells.length-1||d.cells.some((c:any,i:number)=>
   c.start>=c.end||(i>0&&c.start!==d.cells[i-1].end)))fail('原全域区间树须有精确首尾、连续有序覆盖与完整计数。');};
 domain(native.domain);domain(flat.domain);
 const check=(actual:unknown,expected:number)=>{if(!finite(actual)||!finite(expected)||Math.abs(actual-expected)>BOUND)fail('实际源数值超出固定 10⁻¹³ mm／源单位复核界，未移动或替换源点。');maximum=Math.max(maximum,Math.abs(actual-expected));};
 let maximum=0,quadratureDifference=0;
 const vector=(actual:unknown,expected:number[])=>{if(!Array.isArray(actual)||actual.length!==expected.length)fail();expected.forEach((x,i)=>check(actual[i],x));},
  nonnegative=(x:unknown)=>{if(!finite(x)||x<0||x>BOUND)fail('原绝对残差必须为有限非负数并通过固定保存例界。');};
 for(const norm of [native.normalization,flat.normalization]){check(norm.scale,scale);vector(norm.sourceOrigin,literal.normalization.sourceOrigin);if(JSON.stringify(norm.targetOrigin)!=='[1,0]')fail('目标原点必须为原固定常量 (1,0)。');}
 if(JSON.stringify(native.flattening.initial.point)!=='[1,0]'||JSON.stringify(native.flattening.initial.tangent)!=='[0,1]'||
   JSON.stringify(native.sample.rows[0].normalizedSourceBase)!=='[0,0,0]')fail('原初值与源归一化起点须保常量身份。');
 nonnegative(native.diagnostics.maximumUnitRulingResidual);nonnegative(native.diagnostics.maximumRelativeDevelopabilityResidual);
 for(const k of ['maximumFrameResidual','maximumLeftRelativeMetricDifference','maximumRightRelativeMetricDifference'])nonnegative((flat.diagnostics as any)[k]);
 for(const k of ['leftSourceDevelopability','rightSourceDevelopability','sharedGeodesicCurvature'])nonnegative((flat.diagnostics as any)[k].maximumRelativeResidual);
 if(JSON.stringify(flat.sample.rows[0].targetBase)!=='[1,0]'||JSON.stringify(flat.sample.rows[0].targetTangent)!=='[0,1]')fail('原起点与切线常量必须保固定初值。');
 const parameters=Array.from({length:r.segments+1},(_,i)=>i===r.segments?r.parameterEnd:r.parameterStart+(r.parameterEnd-r.parameterStart)*i/r.segments);
 const curves:Point[][]=[[],[],[]];
 native.sample.rows.forEach((row,i)=>{
  const u=parameters[i],f=literal.evaluate(u),p=planar(u,r.parameterStart),fr=flat.sample.rows[i] as any;
  if((i===0||i===r.segments)&&row.s!==u)fail('源采样首尾须保当前参数原值。');
  check(row.s,u);check(fr.s,u);check(native.grid[i].s,u);check(flat.grid[i].s,u);
  check(row.foldAngleRad,Math.PI/3+u/3);check(row.foldAngleDerivative,1/3);
  check(row.leftDenominator,f.leftDenominator);check(row.rightDenominator,f.rightDenominator);
  const source=[f.base,f.basePrime,f.left.director,f.right.director,f.left.directorPrime,f.right.directorPrime],
   target=[p.base,p.basePrime,p.left.director,p.right.director,p.left.directorPrime,p.right.directorPrime],
   suffixes=['Base','BaseDerivative','LeftDirector','RightDirector','LeftDirectorDerivative','RightDirectorDerivative'];
  suffixes.forEach((s,j)=>{
   vector((row as any)['normalizedSource'+s],source[j]);vector((row as any)['source'+s],source[j].map((x,a)=>x*scale+(j===0?literal.normalization.sourceOrigin[a]:0)));
   vector(fr['normalizedSource'+s],source[j]);vector(fr['source'+s],source[j].map((x,a)=>x*scale+(j===0?literal.normalization.sourceOrigin[a]:0)));
   vector(fr['target'+s],target[j]);vector(fr['normalizedTarget'+s],target[j].map((x,a)=>(x-(j===0?[1,0][a]:0))/scale));
  });
  vector(fr.targetTangent,p.tangent);vector(fr.targetLeftNormal,p.leftNormal);
  for(let a=0;a<2;a++)quadratureDifference=Math.max(quadratureDifference,Math.abs(p.base[a]-p.base64[a]));
  if(quadratureDifference>BOUND)fail('独立 32/64 阶相位积分复核不一致。');
  for(const side of ['left','right'] as const){const label=side==='left'?'Left':'Right',s=f[side],t=p[side],co=fr.coefficients[side];
   for(const [key,val]of Object.entries({p:t.p,q:t.q,pPrime:t.pp,qPrime:t.qp,g:t.g,normalizedP:t.p/scale,normalizedQ:t.q/scale,
    normalizedPPrime:t.pp/scale,normalizedQPrime:t.qp/scale}))check(co[key],val);
   check(fr.coefficients.speed,V);check(fr.coefficients.normalizedSpeed,V/scale);
   for(let j=0;j<=16;j++){const w=j/16,sg=native.grid[i] as any,tg=flat.grid[i] as any,sourcePoint=add(f.base,s.director,w),
     targetPoint=add(p.base,t.director,w),sm=metric(f.basePrime,s.director,s.directorPrime,w),tm=metric(p.basePrime,t.director,t.directorPrime,w);
    vector(sg['normalizedSource'+label][j],sourcePoint);vector(tg['normalizedSource'+label][j],sourcePoint);
    vector(sg['source'+label][j],sourcePoint.map((x,a)=>x*scale+literal.normalization.sourceOrigin[a]));
    vector(tg['source'+label][j],sourcePoint.map((x,a)=>x*scale+literal.normalization.sourceOrigin[a]));
    vector(sg['source'+label+'EFG'][j],sm);vector(tg['source'+label+'EFG'][j],sm);
    vector(tg['target'+label][j],targetPoint);vector(tg['normalizedTarget'+label][j],targetPoint.map((x,a)=>(x-[1,0][a])/scale));
    vector(tg['target'+label+'EFG'][j],tm.map(x=>x/(scale*scale)));
   }
  }
  // The source values, not the numerical reference, become the material vertices.
  const base=fr.targetBase as Point;curves[0].push(clone(base));
  curves[1].push(add(base,fr.targetLeftDirector,r.leftWidth) as Point);curves[2].push(add(base,fr.targetRightDirector,r.rightWidth) as Point);
 });
 return {native,curves,maximum,quadratureDifference,snapshotIdentity:snapshot(native)};
}

/** Exact signs on the actual binary64 points, including contact/overlap; no epsilon welding. */
function finitePartition(curves:Point[][],edges:[number,number][],faces:number[][]){
 const points=curves.flat(),buf=new ArrayBuffer(8),view=new DataView(buf);
 const dyadic=(x:number):[bigint,number]=>{if(!finite(x))fail();if(x===0)return [0n,0];view.setFloat64(0,x,false);const bits=view.getBigUint64(0,false),exponent=Number((bits>>52n)&2047n);
  let n=(bits&((1n<<52n)-1n))+(exponent?1n<<52n:0n),e=exponent?exponent-1075:-1074;if(bits>>63n)n=-n;
  while(n!==0n&&n%2n===0n){n/=2n;e++;}return [n,e];};
 const ratios=points.map(p=>p.map(dyadic)),e=Math.min(...ratios.flat().filter(([n])=>n!==0n).map(([,x])=>x)),
  p=ratios.map(row=>row.map(([n,ex])=>n<<BigInt(ex-e))),cross=(a:number,b:number,c:number)=>
   (p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[b][1]-p[a][1])*(p[c][0]-p[a][0]),
  dotAt=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][0]-p[a][0])+(p[b][1]-p[a][1])*(p[c][1]-p[a][1]),
  on=(a:number,b:number,c:number)=>cross(a,b,c)===0n&&[0,1].every(k=>p[c][k]>= (p[a][k]<p[b][k]?p[a][k]:p[b][k])&&p[c][k]<= (p[a][k]>p[b][k]?p[a][k]:p[b][k])),
  sign=(x:bigint)=>x>0n?1:x<0n?-1:0,n=curves[0].length-1,s=n+1;
 if(new Set(points.map(x=>x.join(','))).size!==points.length)fail('有限源顶点出现不同身份同坐标，未容差吸附。');
 let minimumTriangleCross=Infinity,nonconvexCells=0;const diagonals:[number,number][]=[];
 for(let i=0;i<n;i++)for(const cell of [[i,i+1,s+i+1,s+i],[i+1,i,2*s+i,2*s+i+1]]){
  const [a,b,c,d]=cell,area=cross(a,b,c)+cross(a,c,d);
  if(area<=0n)fail('实际验证 cell 面积非正，未补点或添加加工缝。');
  if(cell.some((a,k)=>cross(a,cell[(k+1)%4],cell[(k+2)%4])<=0n))nonconvexCells++;
  const triangles=cross(a,b,c)>0n&&cross(a,c,d)>0n?[[a,b,c],[a,c,d]]:
   cross(b,c,d)>0n&&cross(b,d,a)>0n?[[b,c,d],[b,d,a]]:null;
  if(!triangles)fail('当前有限 cell 没有可靠正向对角三角剖分；未移动源点。');
  diagonals.push(triangles[0][0]===a?[a,c]:[b,d]);
  for(const triangle of triangles){const [a,b,c]=triangle.map(i=>points[i]);
   minimumTriangleCross=Math.min(minimumTriangleCross,(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));}
 }
 const partition=[...edges];for(let i=1;i<n;i++)partition.push([i,s+i],[i,2*s+i]);partition.push(...diagonals);let pairs=0,sharedPairs=0;
 const boxes=partition.map(([a,b])=>[Math.min(points[a][0],points[b][0]),Math.max(points[a][0],points[b][0]),Math.min(points[a][1],points[b][1]),Math.max(points[a][1],points[b][1])]);
 partition.forEach(([a,b])=>{if(p[a][0]===p[b][0]&&p[a][1]===p[b][1])fail('有限分区含零长边。');});
 // Shared pairs are enumerated once at their indexed vertex; distinct edges cannot share both ends.
 const incident=points.map(()=>[] as number[]);
 partition.forEach(([a,b],i)=>{incident[a].push(i);incident[b].push(i);});
 incident.forEach((es,shared)=>{for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++){
  sharedPairs++;const [a,b]=partition[es[i]],[c,d]=partition[es[j]],x=a===shared?b:a,y=c===shared?d:c;
  if(cross(shared,x,y)===0n&&dotAt(shared,x,y)>0n)fail('分区共顶点边有同射线重叠。');
 }});
 pairs=partition.length*(partition.length-1)/2-sharedPairs;
 // Sweep only strict-overlap boxes. Skipped boxes are exactly coordinate-separated on binary64 points.
 const order=Array.from({length:partition.length},(_,i)=>i).sort((a,b)=>boxes[a][0]-boxes[b][0]||a-b);let active:number[]=[];
 for(const i of order){
  active=active.filter(j=>boxes[j][1]>=boxes[i][0]);
  for(const j of active){
   if(boxes[i][3]<boxes[j][2]||boxes[j][3]<boxes[i][2])continue;
   const [a,b]=partition[i],[c,d]=partition[j];if(a===c||a===d||b===c||b===d)continue;
   if(sign(cross(a,b,c))*sign(cross(a,b,d))<0&&sign(cross(c,d,a))*sign(cross(c,d,b))<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))
    fail('有限分区有非相邻交叉、触点或重叠；拒绝采用，未修补原点。');
  }
  active.push(i);
 }
 const areas=faces.map(face=>{const origin=face[0],exact=face.reduce((a,b,i)=>a+cross(origin,b,face[(i+1)%face.length]),0n);if(exact<=0n)fail('实际两面面积必须严格为正。');return polygonArea(face.map(i=>points[i]));});
 if(!areas.every(x=>finite(x)&&x>1e-10)||!finite(minimumTriangleCross)||minimumTriangleCross<=0)fail('有限纸域面积或三角剖分不可用。');
 return {arithmetic:'exact-dyadic-integer-signs-on-actual-binary64-points',validationCells:2*n,validationTriangles:4*n,nonconvexCells,minimumTriangleCross,
  partitionEdges:partition.length,validationOnlyRulingEdges:2*(n-1),validationOnlyDiagonals:diagonals.length,nonincidentPairs:pairs,sharedVertexPairs:sharedPairs,signedFaceAreas:areas,
  logicalFaces:2,validationRulingsAreCPEdges:false,validationDiagonalsAreCPEdges:false,coordinateWelding:false};
}
function materialGraph(curves:Point[][]){
 const n=curves[0].length-1,s=n+1,vertices_coords=curves.flat().map(clone),edges_vertices:[number,number][]=[],edges_assignment:string[]=[],edges_foldAngle:(number|null)[]=[],ids:string[]=[];
 const add=(a:number,b:number,k:'U'|'B',id:string)=>{edges_vertices.push([a,b]);edges_assignment.push(k);edges_foldAngle.push(k==='U'?null:0);ids.push(id);};
 for(let i=0;i<n;i++){add(i,i+1,'U',`spiral3968-crease-${i}`);add(s+i,s+i+1,'B',`spiral3968-left-${i}`);add(2*s+i,2*s+i+1,'B',`spiral3968-right-${i}`);}
 for(const i of [0,n]){add(i,s+i,'B',`spiral3968-cap-left-${i}`);add(i,2*s+i,'B',`spiral3968-cap-right-${i}`);}
 const range=(a:number)=>Array.from({length:s},(_,i)=>a+i),faces_vertices=[ [...range(0),...range(s).reverse()],[...range(0).reverse(),...range(2*s)] ],
  map=new Map(edges_vertices.map(([a,b],i)=>[[a,b].sort((a,b)=>a-b).join(','),i])),
  faces_edges=faces_vertices.map(face=>face.map((a,i)=>map.get([a,face[(i+1)%face.length]].sort((a,b)=>a-b).join(','))!)),
  edges_faces=edges_vertices.map((_,e)=>faces_edges.flatMap((es,f)=>es.includes(e)?[f]:[])),
  faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(g=>g!==f)??null)) as unknown as number[][];
 const proof=finitePartition(curves,edges_vertices,faces_vertices);
 return {graph:{vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces} as FoldGraph,ids,proof};
}
function documentFromSource(recipe:NonuniformSpiralCP3968Recipe,verified:ReturnType<typeof checkedSource>,trustedPreview=false):Doc{
 const {graph,ids,proof}=materialGraph(verified.curves),points=graph.vertices_coords,
  bbox={width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))},
  doc:Doc={schemaVersion:2,name:'原非均匀螺旋 · 内切纸域 CP',paper:bbox,segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:clone(points[a]),b:clone(points[b]),assignment:graph.edges_assignment[i] as 'U'|'B',angle:graph.edges_foldAngle[i]}))},
  material=createMaterialTopology(doc,graph,ids),inspection=trustedPreview?null:inspectMaterialTopology({...doc,metadata:{materialTopology:material}}),
  step=(recipe.parameterEnd-recipe.parameterStart)/recipe.segments;
 if(inspection&&(!inspection.ok||inspection.components.length!==1||inspection.components[0].boundaryLoops.length!==1))fail('实际纸域必须为一个闭边材料部件、两个真实面。');
 // createMaterialTopology already inspected this actual graph. Its literal two-band indices fix one component/one boundary.
 if(trustedPreview)validateDoc(doc);
 doc.metadata={materialTopology:material,originalNonuniformSpiral3968:{schema:SCHEMA,recipe,nativeSource:trustedPreview?verified.native:clone(verified.native),
  nativeSnapshot:{algorithm:'fnv1a32-canonical-json/value-consistency-only',identity:verified.snapshotIdentity},
  source:{inputCell:'In[3968]',spatialDefinitionCells:['In[3959]','In[3963]'],planarDefinitionCells:['In[3966]','In[3935]','In[3640]'],
   radius:1,theta:'30 Degree (no decimal)',gamma:'pi/3+u/3',parameterSIsOriginalU:true,parameterIsArcLength:false,
   initialPoint:[1,0],initialTangent:[0,1],initialParameter:recipe.parameterStart,foldOrientation:1,
   originalInterpolationPoints:128,originalGraphicsCurveDivisions:100,originalGraphicsWidths:[1,1],
   firstSpaceCallForwards128:true,firstSpaceReturnOverwritesGamma:true,planeReceivesFirstNumericalGamma:true,
   planeWrapperForwardsOptions:false,wolframInterpolationReproduced:false,
   originalFoldLineStyle:'FoldedLine',originalRulingStyles:['UnfoldedLine','UnfoldedLine'],originalMVSpecified:false,
   rightDirectorReversed:false,coordinateUnit:'mm',coordinateTransform:'identity',originalCoordinateUnit:'unspecified',localUnitConvention:'1 original world coordinate unit = 1 mm'},
  paperDomain:{role:recipe.leftWidth===1&&recipe.rightWidth===1?'source-unit-width-on-selected-domain':'local-inset-of-original-unit-width-reference',
   localWidths:[recipe.leftWidth,recipe.rightWidth],widthsAreOriginalDefaults:recipe.leftWidth===1&&recipe.rightWidth===1,
   originalUnitReferenceRetained:true,sourceRegularityFlagsUnchanged:true,parameterRange:[recipe.parameterStart,recipe.parameterEnd],
   maximumSafeLeftWidth:nonuniformSpiralCP3968MaximumLeftWidth(recipe.parameterStart),leftFocusMarginMm:1e-4,
   leftJacobianLowerBound:(()=>{const h=Math.PI/6+recipe.parameterStart/6,b=2*C*Math.sin(h),along=2*A+1/3,den=Math.hypot(along,b);
    return V*b/den-recipe.leftWidth*C*Math.cos(h)*(1+along/(3*den*den));})(),rightSignedJacobianUpperBound:-6/Math.sqrt(43),
   continuousIdealPaperInjective:true,leftRightIntersection:'common crease only',method:'fixed-v-x-monotonicity/fixed-x-Jacobian/convex-crease-support',
   originalFullUnitLeftFocusAtZero:728/(107*Math.sqrt(91)),originalFullUnitLeftJacobianAtZero:6/Math.sqrt(91)-321/364},
  sampling:{method:'actual-native-world-values-and-local-linear-chords',segments:recipe.segments,parameterStep:step,
   exactContinuousCurve:false,sourceInterpolationPointsAreCPSegments:false,
   creaseChordErrorUpperBoundMm:step*step/8,leftBoundaryChordErrorUpperBoundMm:3*step*step/8,rightBoundaryChordErrorUpperBoundMm:3*step*step/8,
   errorBoundRole:'ideal continuous-source chord approximation only; excludes ODE/Wolfram errors'},finitePaperProof:proof,
  topology:{vertices:3*(recipe.segments+1),edges:3*recipe.segments+4,faces:2,boundaryEdges:2*recipe.segments+4,unassignedCreases:recipe.segments,
   vertexOrder:['crease','left local boundary','right local boundary'],edgeSegmentIds:ids,sourceCoordinatesUnaltered:true,coordinateWelding:false,interiorRulingSeams:0},
  numericalPolicy:{sourceWorldAbsoluteBoundMm:BOUND,knownDerivedProofAbsoluteBound:BOUND,parametersAndIndicesExact:true,
   phaseReference:'fixed-IC literal phase / Gauss-Legendre32 compared to64',maximumNativeReplayError:verified.maximum,maximumQuadratureDifference:verified.quadratureDifference,
   wolframOutReproduced:false,integrationErrorIntervalCertified:false},
  evidence:{adoption:'explicit-cp-only',mountainValleyAssigned:false,variableGammaIsFiniteEdgeAngle:false,flatFold:false,layerOrder:false,
   threeDimensionalInitialCondition:false,isometryTo3D:false,continuousMotion:false,collisionFree:false}}};
 if(!trustedPreview)validateDoc(doc);return doc;
}
export function nonuniformSpiralCP3968Document(value:unknown,rawNative:unknown):Doc{
 const recipe=validateNonuniformSpiralCP3968Recipe(value);return documentFromSource(recipe,checkedSource(rawNative,recipe));
}
/** Component-owned closure: verify and copy a source once; local widths never refetch it.
 * Public untrusted Document/SourceMatches paths always run the complete source checks. */
export function prepareNonuniformSpiralCP3968Source(value:unknown,rawNative:unknown):(value:unknown)=>Doc{
 const r=validateNonuniformSpiralCP3968Recipe(value),checked=checkedSource(rawNative,r),native=clone(checked.native),query=nonuniformSpiralCP3968Query(r),
  frames=native.flattening.result!.sample.rows.map(row=>({base:clone(row.targetBase) as Point,left:clone(row.targetLeftDirector),right:clone(row.targetRightDirector)}));
 return value=>{
  const recipe=validateNonuniformSpiralCP3968Recipe(value);if(JSON.stringify(nonuniformSpiralCP3968Query(recipe))!==JSON.stringify(query))fail('源参数已改变，须等当前原查询完成。');
  const curves:Point[][]=[frames.map(row=>clone(row.base)),frames.map(row=>add(row.base,row.left,recipe.leftWidth) as Point),frames.map(row=>add(row.base,row.right,recipe.rightWidth) as Point)];
  return documentFromSource(recipe,{...checked,native,curves});
 };
}
/** Dialog-only preview snapshot. The native clone is deeply frozen once; every width still
 * validates the actual finite partition and calls createMaterialTopology. Clone before adoption.
 * Public Document and SourceMatches remain complete uncached verification paths. */
export function prepareNonuniformSpiralCP3968Preview(value:unknown,rawNative:unknown):(value:unknown)=>Doc{
 const r=validateNonuniformSpiralCP3968Recipe(value),checked=checkedSource(rawNative,r),native=clone(checked.native),
  freeze=(x:any):void=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}};
 freeze(native);const query=JSON.stringify(nonuniformSpiralCP3968Query(r)),
  frames=native.flattening.result!.sample.rows.map(row=>({base:clone(row.targetBase) as Point,left:clone(row.targetLeftDirector),right:clone(row.targetRightDirector)}));
 return value=>{
  const recipe=validateNonuniformSpiralCP3968Recipe(value);if(JSON.stringify(nonuniformSpiralCP3968Query(recipe))!==query)fail('源参数已改变，须等当前原查询完成。');
  const curves:Point[][]=[frames.map(row=>clone(row.base)),frames.map(row=>add(row.base,row.left,recipe.leftWidth) as Point),frames.map(row=>add(row.base,row.right,recipe.rightWidth) as Point)];
  return documentFromSource(recipe,{...checked,native,curves},true);
 };
}
export async function fetchNonuniformSpiralCP3968Document(value:unknown,signal?:AbortSignal):Promise<Doc>{
 const recipe=validateNonuniformSpiralCP3968Recipe(value),native=await fetchGenericNonuniformHelixWhenIdle(nonuniformSpiralCP3968Query(recipe),signal);
 return nonuniformSpiralCP3968Document(recipe,native);
}
export function readNonuniformSpiralCP3968Recipe(doc:Doc):NonuniformSpiralCP3968Recipe|null{
 try{const raw=doc.metadata?.originalNonuniformSpiral3968;if(!object(raw)||raw.schema!==SCHEMA)return null;return validateNonuniformSpiralCP3968Recipe(raw.recipe);}catch{return null;}
}
function same(a:unknown,b:unknown,path=''):boolean{
 if(typeof a==='number'&&typeof b==='number'){
  if(!finite(a)||!finite(b))return false;
  if(/^finitePaperProof\.(minimumTriangleCross|signedFaceAreas\.\d+)$/.test(path))return a>0&&b>0&&Math.abs(a-b)<=BOUND;
  if(/^numericalPolicy\.(maximumNativeReplayError|maximumQuadratureDifference)$/.test(path))return a>=0&&b>=0&&a<=BOUND&&Math.abs(a-b)<=BOUND;
  if(/^materialTopology\.graph\.vertices_coords\.\d+\.[01]$/.test(path))return Math.abs(a-b)<=BOUND;
  return a===b;
 }
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&b.every((x,i)=>same(a[i],x,`${path}.${i}`));
 if(object(a)||object(b))return object(a)&&object(b)&&keys(a,Object.keys(b))&&Object.keys(b).every(k=>same(a[k],b[k],path?path+'.'+k:k));
 return a===b;
}
function sameSegments(actual:Segment[],expected:Segment[]):boolean{
 if(actual.length!==expected.length||new Set(actual.map(x=>x.id)).size!==actual.length)return false;
 const point=(a:Point,b:Point)=>a.length===2&&a.every((x,i)=>finite(x)&&Math.abs(x-b[i])<=BOUND);
 return expected.every(e=>{const a=actual.find(x=>x.id===e.id);return !!a&&a.assignment===e.assignment&&a.angle===e.angle&&point(a.a,e.a)&&point(a.b,e.b);});
}
/** Validate the current document first. Replaying a saved recipe never silently repairs it. */
export function nonuniformSpiralCP3968SourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);const recipe=readNonuniformSpiralCP3968Recipe(doc),saved=doc.metadata?.originalNonuniformSpiral3968;
  if(!recipe||!object(saved)||Object.hasOwn(doc,'flatFold'))return false;
  const expected=nonuniformSpiralCP3968Document(recipe,saved.nativeSource),actual=inspectMaterialTopology(doc),target=inspectMaterialTopology(expected);
  if(!actual.ok||!target.ok||actual.foldedVertices||actual.startingFace!==undefined||!same(saved,expected.metadata!.originalNonuniformSpiral3968)||
    !same(doc.metadata!.materialTopology,expected.metadata!.materialTopology,'materialTopology')||!same(actual.edgeSegmentIds,target.edgeSegmentIds)||
    !sameSegments(doc.segments,expected.segments)||!object(doc.paper)||!keys(doc.paper,['width','height']))return false;
  const points=doc.segments.flatMap(s=>[s.a,s.b]),bbox={width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))};
  for(const key of ['width','height'] as const)if(!finite(doc.paper[key])||doc.paper[key]<=0||Math.abs(doc.paper[key]-expected.paper[key])>BOUND||Math.abs(doc.paper[key]-bbox[key])>BOUND)return false;
  const {vertices_coords:a,...ag}=actual.graph,{vertices_coords:b,...bg}=target.graph;
  if(!same(ag,bg)||a.length!==b.length||!a.every((p,i)=>p.length===2&&p.every((x,k)=>finite(x)&&Math.abs(x-b[i][k])<=BOUND)))return false;
  return JSON.stringify(a[0])==='[1,0]'&&doc.segments.filter(s=>s.id==='spiral3968-crease-0'||s.id==='spiral3968-cap-left-0'||s.id==='spiral3968-cap-right-0').every(s=>JSON.stringify(s.a)==='[1,0]');
 }catch{return false;}
}
