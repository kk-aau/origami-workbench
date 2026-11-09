/** Original In[4034] optical paper and In[3988] descending-angle Across paper.
 * The finite material is planar. Reference graphics/ODEs are not a folded mesh. */
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point,type Assignment} from '../core/types';

export type EllipseOpticalCP4034Recipe={leftFocus:number;rightFocus:number;leftCross:number;rightCross:number;parameterStart:number;parameterEnd:number;segments:number;rulingDivisions:number;unitSizeMm:number;assignmentMode:'original-styles'|'unassigned'};
export type AcrossDescendingCP3988Recipe={initialAngleDeg:number;dropFraction:number;parameterStart:number;parameterEnd:number;leftWidth:number;rightWidth:number;segments:number;unitSizeMm:number};
export type EllipseAcrossCPKind='ellipse'|'across';
export const ELLIPSE_OPTICAL_CP_4034_EXAMPLE:EllipseOpticalCP4034Recipe={leftFocus:-1,rightFocus:-2,leftCross:-.5,rightCross:.5,parameterStart:0,parameterEnd:2*Math.PI/3,segments:100,rulingDivisions:10,unitSizeMm:50,assignmentMode:'original-styles'};
export const ACROSS_DESCENDING_CP_3988_EXAMPLE:AcrossDescendingCP3988Recipe={initialAngleDeg:150,dropFraction:.9999,parameterStart:0,parameterEnd:Math.PI/2,leftWidth:1,rightWidth:1,segments:32,unitSizeMm:50};
const ES='original-in4034-optical-finite-cp-v1',AS='original-in3988-descending-across-finite-cp-v1',ENS='originalEllipseOptical4034',ANS='originalAcrossDescending3988',BOUND=1e-13;
const object=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),
 keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k)),clone=<T>(x:T):T=>structuredClone(x),wire=(x:unknown)=>JSON.stringify(x);
function fail(message='原源参数、纸边、有限覆盖或材料身份不一致。'):never{throw Error(message);}
function numericRecipe(raw:unknown,example:object){if(!object(raw)||!keys(raw,Object.keys(example))||Object.entries(raw).some(([k,x])=>k!=='assignmentMode'&&!finite(x)))fail('请填写完整有限数值参数，不接受缺键、未知字段或数值字符串。');}
function sampling(r:{segments:number;unitSizeMm:number;parameterStart:number;parameterEnd:number},end:number){
 if(r.parameterStart<0||r.parameterEnd>end||r.parameterEnd-r.parameterStart<.1)fail(`区间须位于原 [0,${end===Math.PI/2?'π/2':'2π/3'}]，跨度至少 0.1 rad；不会重置原参数。`);
 if(!Number.isInteger(r.segments)||r.segments<16||r.segments>128)fail('曲线须为 16…128 弦；不会把参考母线全部添加为折痕。');
 if(r.unitSizeMm<.01||r.unitSizeMm>1000)fail('每原坐标单位须为 0.01…1000 mm，仅转换一次。');
}
export function validateEllipseOpticalCP4034Recipe(raw:unknown):EllipseOpticalCP4034Recipe{
 numericRecipe(raw,ELLIPSE_OPTICAL_CP_4034_EXAMPLE);const r=raw as EllipseOpticalCP4034Recipe;sampling(r,2*Math.PI/3);
 if(r.rightFocus< -100||r.leftFocus> -.05||r.leftFocus-r.rightFocus<.05||r.leftCross-r.leftFocus<1e-4||r.leftCross> -1e-4||r.rightCross<1e-4||r.rightCross>100)
  fail('有限椭圆须有 −100≤右焦点<左焦点≤−0.05，左截线位于左焦点与零之间，右截线为正；间隙至少 10⁻⁴。');
 if(!Number.isInteger(r.rulingDivisions)||r.rulingDivisions<2||r.rulingDivisions>32)fail('原半格母线密度须为 2…32。');
 if(!['original-styles','unassigned'].includes(r.assignmentMode))fail('须明确采用原 V/M 标记或本地未赋型 U。');
 return {...r};
}
export function validateAcrossDescendingCP3988Recipe(raw:unknown):AcrossDescendingCP3988Recipe{
 numericRecipe(raw,ACROSS_DESCENDING_CP_3988_EXAMPLE);const r=raw as AcrossDescendingCP3988Recipe;sampling(r,Math.PI/2);
 if(r.initialAngleDeg<=0||r.initialAngleDeg>=180||r.dropFraction<=0||r.dropFraction>=1||r.initialAngleDeg*Math.PI/180*(1-r.dropFraction)<1e-8)
  fail('下降折角须从 0°…180° 内开始，下降比例在 0…1 内，原终角须大于 10⁻⁸ rad；不反转原下降方向。');
 if(r.leftWidth<.01||r.leftWidth>1||r.rightWidth<.01||r.rightWidth>1)fail('两侧宽度须为 0.01…1 原单位；左单位宽保留唯一源圆心，不能越过圆心。');
 return {...r};
}
type EllipseFrame={u:number;fraction:[number,number];base:Point;leftBoundary:Point;rightBoundary:Point;rawDirectorLeft:Point;rawDirectorRight:Point;leftDirector:Point;rightDirector:Point;rules:Point[]};
type AcrossFrame={u:number;gamma:number;gammaPrime:number;base:Point;tangent:Point;leftDirector:Point;rightDirector:Point;c:number;s:number;angleRate:number};
const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
function ellipseNodes(r:EllipseOpticalCP4034Recipe){
 const entries=new Map<string,{fraction:[number,number];u:number;ruling:number|null}>(),span=r.parameterEnd-r.parameterStart;
 const add=(a:number,b:number,u:number,j:number|null)=>{const g=gcd(a,b),f:[number,number]=[a/g,b/g],key=f.join('/');if(!entries.has(key)||j!==null)entries.set(key,{fraction:f,u,ruling:j});};
 for(let i=0;i<=r.segments;i++)add(i,r.segments,i===r.segments?r.parameterEnd:r.parameterStart+span*i/r.segments,null);
 const dt=span/r.rulingDivisions;
 for(let j=0;j<r.rulingDivisions;j++)add(2*j+1,2*r.rulingDivisions,r.parameterStart+j*dt+dt/2,j);
 return [...entries.values()].sort((a,b)=>a.fraction[0]*b.fraction[1]-b.fraction[0]*a.fraction[1]);
}
function ellipseAt(u:number,r:EllipseOpticalCP4034Recipe,fraction:[number,number]):EllipseFrame{
 const l=r.leftFocus,k=r.rightFocus,h=r.leftCross,b=r.rightCross,co=Math.cos(u),si=Math.sin(u),sh=Math.sin(u/2),ch=Math.cos(u/2),q=Math.tan(u/2),z=2*l*sh*sh+2*k*ch*ch,D=l*l*q*q+k*k,
  base:Point=u===0?[0,0]:[2*l*(l+k)*sh*sh/z,-2*l*k*si/z],leftBoundary:Point=u===0?[h,0]:[l+(h-l)*co,(h-l)*si],
  rightBoundary:Point=u===0?[b,0]:[(k*(b-k)/D+1)*2*k-b,2*l*k*(b-k)*q/D],leftDirector:Point=u===0?[-1,0]:[-co,-si],
  difference:Point=[rightBoundary[0]-base[0],rightBoundary[1]-base[1]],length=Math.hypot(...difference),rightDirector:Point=u===0?[1,0]:[difference[0]/length,difference[1]/length],
  rawDirectorRight:Point=u===0?[-1,0]:[1-2*k*k/D,-2*l*k*q/D];
 return {u,fraction,base,leftBoundary,rightBoundary,rawDirectorLeft:clone(leftDirector),rawDirectorRight,leftDirector,rightDirector,
  rules:[clone(base),[l,0],clone(leftDirector),[l,0],clone(leftBoundary),[k,0],clone(rawDirectorRight),[k,0],clone(rightBoundary)]};
}
export function evaluateEllipseOpticalCP4034Source(value:unknown){const recipe=validateEllipseOpticalCP4034Recipe(value),nodes=ellipseNodes(recipe);return {recipe,nodes,frames:nodes.map(n=>ellipseAt(n.u,recipe,n.fraction))};}
function acrossAt(u:number,r:AcrossDescendingCP3988Recipe):AcrossFrame{
 const g0=r.initialAngleDeg*Math.PI/180,rate=g0*r.dropFraction/(Math.PI/2),gamma=g0*(1-r.dropFraction*u/(Math.PI/2)),t=Math.tan(gamma/2),den=Math.hypot(rate,t),c=rate/den,s=t/den,
  base:Point=u===0?[1,0]:[Math.cos(u),Math.sin(u)],tangent:Point=u===0?[0,1]:[-base[1],base[0]],leftDirector:Point=u===0?[-1,0]:[-base[0],-base[1]],
  rightDirector:Point=[c*tangent[0]-s*leftDirector[0],c*tangent[1]-s*leftDirector[1]],angleRate=1+rate*rate*(1+t*t)/(2*(rate*rate+t*t));
 return {u,gamma,gammaPrime:-rate,base,tangent,leftDirector,rightDirector,c,s,angleRate};
}
export function evaluateAcrossDescendingCP3988Source(value:unknown){const recipe=validateAcrossDescendingCP3988Recipe(value),span=recipe.parameterEnd-recipe.parameterStart,
 frames=Array.from({length:recipe.segments+1},(_,i)=>acrossAt(i===recipe.segments?recipe.parameterEnd:recipe.parameterStart+span*i/recipe.segments,recipe));return {recipe,frames};}

type Assembly={graph:FoldGraph;ids:string[];cells:number[][]};
function graphBuilder(points:Point[]){
 const edges:[number,number][]=[],assignments:Assignment[]=[],angles:(number|null)[]=[],ids:string[]=[];
 return {add:(a:number,b:number,k:Assignment,id:string)=>{edges.push([a,b]);assignments.push(k);angles.push(k==='B'?0:null);ids.push(id);},
  finish:(faces:number[][],cells:number[][]):Assembly=>{const map=new Map(edges.map((e,i)=>[[...e].sort((a,b)=>a-b).join(','),i])),fes=faces.map(face=>face.map((a,i)=>{
   const e=map.get([a,face[(i+1)%face.length]].sort((a,b)=>a-b).join(','));if(e===undefined)fail('实际面必须逐边闭合，不补隐藏连接。');return e;})),
   efs=edges.map((_,e)=>fes.flatMap((es,f)=>es.includes(e)?[f]:[]));
   return {ids,cells,graph:{vertices_coords:points,edges_vertices:edges,edges_assignment:assignments,edges_foldAngle:angles,faces_vertices:faces,faces_edges:fes,edges_faces:efs,faces_faces:fes.map((es,f)=>es.map(e=>efs[e].find(g=>g!==f)??null)) as unknown as number[][]}};}};
}
function ellipseAssembly(r:EllipseOpticalCP4034Recipe,frames:EllipseFrame[]):Assembly{
 const s=frames.length,n=s-1,points=['base','leftBoundary','rightBoundary'].flatMap(k=>frames.map(f=>(f[k as keyof EllipseFrame] as Point).map(x=>x*r.unitSizeMm) as Point)),b=graphBuilder(points),original=r.assignmentMode==='original-styles';
 for(let i=0;i<n;i++){b.add(i,i+1,original?'V':'U',`ellipse4034-fold-${i}`);b.add(s+i,s+i+1,'B',`ellipse4034-left-boundary-${i}`);b.add(2*s+i,2*s+i+1,'B',`ellipse4034-right-boundary-${i}`);}
 for(const i of [0,n]){b.add(i,s+i,'B',`ellipse4034-cap-left-${i}`);b.add(i,2*s+i,'B',`ellipse4034-cap-right-${i}`);}
 const nodes=ellipseNodes(r),seams=nodes.flatMap((node,i)=>node.ruling!==null?[i]:[]);
 for(const i of seams){b.add(s+i,i,original?'V':'U',`ellipse4034-original-left-ruling-${nodes[i].ruling}`);b.add(i,2*s+i,original?'M':'U',`ellipse4034-original-right-ruling-${nodes[i].ruling}`);}
 const cuts=[0,...seams,n],faces:number[][]=[],cells:number[][]=[],range=(a:number,b:number)=>Array.from({length:b-a+1},(_,j)=>a+j);
 for(let j=1;j<cuts.length;j++){const a=cuts[j-1],c=cuts[j],v=range(a,c);faces.push([...v].reverse().map(i=>s+i).concat(v),[...v].reverse().concat(v.map(i=>2*s+i)));}
 for(let i=0;i<n;i++)cells.push([s+i,i,i+1,s+i+1],[i,2*s+i,2*s+i+1,i+1]);
 return b.finish(faces,cells);
}
function acrossAssembly(r:AcrossDescendingCP3988Recipe,frames:AcrossFrame[]):Assembly{
 const s=frames.length,n=s-1,apex=r.leftWidth===1,points=frames.map(f=>f.base.map(x=>x*r.unitSizeMm) as Point);
 if(apex)points.push([0,0]);else points.push(...frames.map(f=>f.base.map((x,i)=>(x+r.leftWidth*f.leftDirector[i])*r.unitSizeMm) as Point));
 const right=points.length;points.push(...frames.map(f=>f.base.map((x,i)=>(x+r.rightWidth*f.rightDirector[i])*r.unitSizeMm) as Point));const b=graphBuilder(points);
 for(let i=0;i<n;i++){b.add(i,i+1,'U',`across3988-fold-${i}`);b.add(right+i,right+i+1,'B',`across3988-right-boundary-${i}`);}
 if(!apex)for(let i=0;i<n;i++)b.add(s+i,s+i+1,'B',`across3988-left-boundary-${i}`);
 for(const i of [0,n]){b.add(apex?s:s+i,i,'B',`across3988-cap-left-${i}`);b.add(i,right+i,'B',`across3988-cap-right-${i}`);}
 const range=Array.from({length:s},(_,i)=>i),faces=[apex?[s,...range]:[...range].reverse().map(i=>s+i).concat(range),[...range].reverse().concat(range.map(i=>right+i))],cells:number[][]=[];
 for(let i=0;i<n;i++)cells.push(apex?[s,i,i+1]:[s+i,i,i+1,s+i+1],[i,right+i,right+i+1,i+1]);
 return b.finish(faces,cells);
}

/** Exact signs, contacts and once-cover on the actual binary64 graph; proof edges are never CP seams. */
function finiteProof(a:Assembly){
 const {vertices_coords:points,edges_vertices:edges,faces_vertices:faces}=a.graph;if(!faces||points.some(p=>p.length!==2||p.some(x=>!finite(x))))fail('有限图必须为原二维有限坐标。');
 const view=new DataView(new ArrayBuffer(8)),dyadic=(x:number):[bigint,number]=>{if(x===0)return [0n,0];view.setFloat64(0,x,false);const bits=view.getBigUint64(0,false),ex=Number((bits>>52n)&2047n);let n=(bits&((1n<<52n)-1n))+(ex?1n<<52n:0n),e=ex?ex-1075:-1074;if(bits>>63n)n=-n;while(n%2n===0n){n/=2n;e++;}return [n,e];},
  ratios=points.map(p=>p.map(dyadic)),exponent=Math.min(...ratios.flat().filter(([n])=>n!==0n).map(([,e])=>e)),p=ratios.map(row=>row.map(([n,e])=>n<<BigInt(e-exponent))),
  cross=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[b][1]-p[a][1])*(p[c][0]-p[a][0]),
  on=(a:number,b:number,c:number)=>cross(a,b,c)===0n&&[0,1].every(k=>p[c][k]>=(p[a][k]<p[b][k]?p[a][k]:p[b][k])&&p[c][k]<=(p[a][k]>p[b][k]?p[a][k]:p[b][k])),sign=(x:bigint)=>x<0n?-1:x>0n?1:0,
  part=new Map<string,[number,number]>(),add=(a:number,b:number)=>part.set([a,b].sort((a,b)=>a-b).join(','),a<b?[a,b]:[b,a]),triangles:number[][]=[];
 if(new Set(points.map(wire)).size!==points.length)fail('不同来源顶点同坐标；只接受明确原圆心的单源身份，不任意焊接。');
 edges.forEach(([a,b])=>add(a,b));let nonconvexCells=0,minTriangle=Infinity,total=0n;
 for(const cell of a.cells){let ts:number[][];
  if(cell.length===3)ts=[cell];else{const [a,b,c,d]=cell;if(cell.some((a,i)=>cross(a,cell[(i+1)%4],cell[(i+2)%4])<=0n))nonconvexCells++;
   ts=cross(a,b,c)>0n&&cross(a,c,d)>0n?[[a,b,c],[a,c,d]]:cross(b,c,d)>0n&&cross(b,d,a)>0n?[[b,c,d],[b,d,a]]:[];}
  if(!ts.length)fail('当前有限单元不能可靠正向剖分；未移动原点或补面。');
  for(const t of ts){const cr=cross(t[0],t[1],t[2]);if(cr<=0n)fail('验证三角形必须严格正面积。');total+=cr;triangles.push(t);for(let i=0;i<3;i++)add(t[i],t[(i+1)%3]);
   const [a,b,c]=t.map(i=>points[i]);minTriangle=Math.min(minTriangle,(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));}
 }
 const partition=[...part.values()],boxes=partition.map(([a,b])=>[Math.min(points[a][0],points[b][0]),Math.max(points[a][0],points[b][0]),Math.min(points[a][1],points[b][1]),Math.max(points[a][1],points[b][1])]);let nonincidentPairs=0,sharedPairs=0;
 for(let i=0;i<partition.length;i++){const [a,b]=partition[i];if(p[a][0]===p[b][0]&&p[a][1]===p[b][1])fail('当前有限分区含零长边。');
  for(let j=0;j<i;j++){const [c,d]=partition[j],shared=[a,b].find(x=>x===c||x===d);
   if(shared!==undefined){sharedPairs++;const x=a===shared?b:a,y=c===shared?d:c;if(cross(shared,x,y)===0n&&(p[x][0]-p[shared][0])*(p[y][0]-p[shared][0])+(p[x][1]-p[shared][1])*(p[y][1]-p[shared][1])>0n)fail('共顶点分区边同射线重叠。');continue;}
   nonincidentPairs++;if(boxes[i][1]<boxes[j][0]||boxes[j][1]<boxes[i][0]||boxes[i][3]<boxes[j][2]||boxes[j][3]<boxes[i][2])continue;
   if(sign(cross(a,b,c))*sign(cross(a,b,d))<0&&sign(cross(c,d,a))*sign(cross(c,d,b))<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))fail('有限材料出现非相邻交叉、接触或重叠，拒绝采用。');
  }}
 let faceTotal=0n;const signedFaceAreas=faces.map(face=>{const exact=face.reduce((sum,b,i)=>sum+cross(face[0],b,face[(i+1)%face.length]),0n);if(exact<=0n)fail('实际材料面必须严格正面积。');faceTotal+=exact;
  const o=points[face[0]],area=face.reduce((sum,b,i)=>{const c=points[face[(i+1)%face.length]],q=points[b];return sum+(q[0]-o[0])*(c[1]-o[1])-(q[1]-o[1])*(c[0]-o[0]);},0)/2;
  if(!finite(area)||area<=0)fail('材料面积不可表示。');return area;});
 if(faceTotal!==total||!finite(minTriangle)||minTriangle<=0)fail('验证单元必须恰好覆盖全部实际材料面一次。');
 return {method:'exact-dyadic-signs-on-actual-binary64-material',validationCells:a.cells.length,validationTriangles:triangles.length,nonconvexCells,minimumTriangleCross:minTriangle,signedFaceAreas,partitionEdges:partition.length,nonincidentPairs,sharedPairs,onceCovered:true,coordinatesWelded:false,validationOnlyEdgesAreCPEdges:false};
}
function sourceInfo(kind:EllipseAcrossCPKind){return kind==='ellipse'?{
  inputCell:'In[4034]',planarDefinition:'ConicSection2DSystem In[4019]',graphicsDefinition:'StyledCurvedFoldOptical In[1787]',
  paperRules:['CurvedFold2D','SecondCrossCurveLeft2D','SecondCrossCurveRight2D'],originalSavedInput:{leftFocus:-1,rightFocus:-2,leftCross:-.5,rightCross:.5,parameterRange:[0,2*Math.PI/3]},
  originalInitialFoldAngleDeg:-60,originalInitialSpatialPoint:[0,0,0],originalInitialTangent:[0,1,0],originalInitialBinormal:[0,0,1],
  originalStyles:{fold:'ValleyLine',leftRulings:'ValleyLine',rightRulings:'MountainLine',rulingLineOffset:true,fill:'NoFill'},originalCurveDivisions:100,originalRulingLineDivisions:10,
  ruleOrder:['CurvedFold2D','DirectrixLeft2D','DirectorLeft2D','CrossCurveLeft2D','SecondCrossCurveLeft2D','DirectrixRight2D','DirectorRight2D','CrossCurveRight2D','SecondCrossCurveRight2D'],
  allNineRulesPreserved:true,virtualDirectrixReferences:{left:'[leftFocus,0]',right:'[rightFocus,0]',usedAsPaperBoundary:false,originalVirtualStylesPreservedAsReference:true},
  rawDirectorRightPreserved:true,normalizedDirectorRule:'NormalizeReal[cSide-f]',rightNormalizedDirectorMayOpposeRawDirector:true,
  wolframNumericInterpolationReproduced:false,sourceFullReferenceRetained:true
 }:{inputCell:'In[3988]',planarDefinition:'NFoldAcrossRight2D In[3986]',spatialReferenceDefinition:'NFoldCurvedFold3D In[3977]',
  originalSavedInput:{initialAngleDeg:150,dropFraction:.9999,parameterRange:[0,Math.PI/2],widths:[1,1]},
  foldAngleFormula:'initialAngleDeg Degree * (1 - dropFraction u / (pi/2))',parameterIsAbsoluteOriginalU:true,currentStartReseeded:false,
  originalInitialSpatialPoint:[1,0,0],originalInitialTangent:[0,1,0],originalInitialBinormal:[0,0,1],originalInterpolationPoints:64,
  originalFoldLineStyle:'FoldedLine',originalMVSpecified:false,originalGraphicsWidths:[1,1],rulingLinesAreReferenceOnly:true,
  wolframNumericInterpolationReproduced:false,sourceFullReferenceRetained:true};}
function bounds(points:Point[]){return {width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))};}
function document(kind:'ellipse',recipe:EllipseOpticalCP4034Recipe,frames:EllipseFrame[]):Doc;
function document(kind:'across',recipe:AcrossDescendingCP3988Recipe,frames:AcrossFrame[]):Doc;
function document(kind:EllipseAcrossCPKind,recipe:EllipseOpticalCP4034Recipe|AcrossDescendingCP3988Recipe,frames:EllipseFrame[]|AcrossFrame[]):Doc{
 const a=kind==='ellipse'?ellipseAssembly(recipe as EllipseOpticalCP4034Recipe,frames as EllipseFrame[]):acrossAssembly(recipe as AcrossDescendingCP3988Recipe,frames as AcrossFrame[]),proof=finiteProof(a),points=a.graph.vertices_coords,
  doc:Doc={schemaVersion:2,name:kind==='ellipse'?'原光学椭圆 · In[4034] CP':'原下降折角 Across · In[3988] CP',paper:bounds(points),segments:a.graph.edges_vertices.map(([x,y],i)=>({id:a.ids[i],a:clone(points[x]),b:clone(points[y]),assignment:a.graph.edges_assignment[i] as Assignment,angle:a.graph.edges_foldAngle[i]}))},
  material=createMaterialTopology(doc,a.graph,a.ids),residual=Math.max(...frames.flatMap(f=>[f.leftDirector,f.rightDirector]).map(d=>Math.abs(d[0]*d[0]+d[1]*d[1]-1)));
 if(!finite(residual)||residual>64*Number.EPSILON)fail('原单位母线超出工程舍入界。');
 const ellipse=kind==='ellipse',r=recipe as any,meta={schema:ellipse?ES:AS,recipe:clone(recipe),source:sourceInfo(kind),sourceFrames:clone(frames),
  paperDomain:ellipse?{method:'nested-focal-polar-bands',leftFocus:[r.leftFocus,0],rightFocus:[r.rightFocus,0],leftBoundaryRadius:r.leftCross-r.leftFocus,rightBoundaryRadius:r.rightCross-r.rightFocus,
   leftInsideOriginalEllipse:true,rightOutsideOriginalEllipse:true,intersection:'common original fold only',idealContinuousInjectivity:true,virtualDirectrixReferenceIsPaperBoundary:false}:
   {method:'inner-circle-quotient-and-outer-monotone-polar-chart',leftWidth:r.leftWidth,rightWidth:r.rightWidth,leftBoundaryMode:r.leftWidth===1?'original-source-apex':'local-cut',sourceApexIdentity:r.leftWidth===1?[0,0]:null,
    leftWholeRectangleInjective:r.leftWidth<1,leftQuotientInjective:true,leftJacobianLowerBound:1-r.leftWidth,rightSignedJacobianNegative:true,idealContinuousInjectivity:true,intersection:'common original circle fold only'},
  sampling:{curveSegments:r.segments,actualIntervals:frames.length-1,linearChords:true,exactContinuousCurve:false,...(ellipse?{rulingDivisions:r.rulingDivisions,rulingOffset:true,rulingPositions:'u0 + i*(u1-u0)/rd + ((u1-u0)/rd)/2',sourceParameterFractionIdentity:true,additionalValidationRulingsAreCPEdges:false}: {sourceInterpolationPointsAreCPSegments:false,allRulingsAreReferenceOnly:true})},
  finitePaperProof:proof,topology:{vertices:points.length,edges:a.ids.length,faces:a.graph.faces_vertices!.length,components:1,boundaryEdges:a.graph.edges_assignment.filter(k=>k==='B').length,edgeSegmentIds:clone(a.ids),sourceCoordinateWelding:false},
  coordinatePolicy:{unit:'mm',unitSizeMm:r.unitSizeMm,sourceUnits:'unspecified',sourceToMaterial:'multiply once by unitSizeMm; no translation or normalization',viewYDirection:'down; export uses existing converter'},
  numericalPolicy:{sourceReplayRelativeAbsoluteBound:BOUND,budgetRole:'engineering-machine-rounding-consistency; not interval or Wolfram interpolation certificate',maximumUnitDirectorResidual:residual,unitDirectorResidualBudget:64*Number.EPSILON,inputIndicesAndKnownIdentityExact:true},
  evidence:{adoption:'explicit-cp-only',originalMountainValleyApplied:ellipse&&r.assignmentMode==='original-styles',constantFoldAngleAssigned:false,flatFold:false,layerOrder:false,finiteRigid3D:false,continuousMotion:false,collisionFree:false}};
 doc.metadata={materialTopology:material,[ellipse?ENS:ANS]:meta};validateDoc(doc);return doc;
}
export function ellipseOpticalCP4034Document(value:unknown):Doc{const s=evaluateEllipseOpticalCP4034Source(value);return document('ellipse',s.recipe,s.frames);}
export function acrossDescendingCP3988Document(value:unknown):Doc{const s=evaluateAcrossDescendingCP3988Source(value);return document('across',s.recipe,s.frames);}
export function readEllipseOpticalCP4034Recipe(doc:Doc):EllipseOpticalCP4034Recipe|null{try{const m=doc?.metadata?.[ENS];if(!object(m)||m.schema!==ES||Object.hasOwn(doc.metadata!,ANS))return null;return validateEllipseOpticalCP4034Recipe(m.recipe);}catch{return null;}}
export function readAcrossDescendingCP3988Recipe(doc:Doc):AcrossDescendingCP3988Recipe|null{try{const m=doc?.metadata?.[ANS];if(!object(m)||m.schema!==AS||Object.hasOwn(doc.metadata!,ENS))return null;return validateAcrossDescendingCP3988Recipe(m.recipe);}catch{return null;}}
function exact(a:unknown,b:unknown):boolean{if(typeof a==='number'||typeof b==='number')return finite(a)&&finite(b)&&a===b;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&b.every((x,i)=>exact(a[i],x));if(object(a)||object(b))return object(a)&&object(b)&&keys(a,Object.keys(b))&&Object.keys(b).every(k=>exact(a[k],b[k]));return a===b;}
function framesMatch(actual:unknown,expected:EllipseFrame[]|AcrossFrame[],kind:EllipseAcrossCPKind):boolean{
 if(!Array.isArray(actual)||actual.length!==expected.length)return false;
 return expected.every((e,i)=>{const a=actual[i];if(!object(a)||!keys(a,Object.keys(e)))return false;
  if(kind==='ellipse'){const f=a as EllipseFrame;if(!Array.isArray(f.rules)||f.rules.length!==9||![0,2,4,6,8].every((k,j)=>exact(f.rules[k],[f.base,f.rawDirectorLeft,f.leftBoundary,f.rawDirectorRight,f.rightBoundary][j]))||
    ![1,3,5,7].every(k=>exact(f.rules[k],(e as EllipseFrame).rules[k]))||!exact(f.leftDirector,f.rawDirectorLeft))return false;}
  for(const [k,v]of Object.entries(e)){
   if(k==='u'||k==='fraction'||k==='gammaPrime'){if(!exact(a[k],v))return false;continue;}
   if(e.u===0&&['base','tangent','leftBoundary','rightBoundary','leftDirector','rawDirectorLeft','rawDirectorRight','rightDirector','rules'].includes(k)&&!(kind==='across'&&k==='rightDirector')){if(!exact(a[k],v))return false;continue;}
   const near=(a:unknown,b:unknown):boolean=>Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((x,j)=>near(a[j],x)):finite(a)&&finite(b)&&Math.abs(a-b)<=BOUND*Math.max(1,Math.abs(b));
   if(!near(a[k],v))return false;
  }return true;});
}
function matches(doc:Doc,kind:EllipseAcrossCPKind){
 try{validateDoc(doc);if(doc.flatFold!==undefined||doc.objects?.length||doc.background!==undefined)return false;
  const recipe=kind==='ellipse'?readEllipseOpticalCP4034Recipe(doc):readAcrossDescendingCP3988Recipe(doc);if(!recipe)return false;
  const metadata=doc.metadata!,m=metadata[kind==='ellipse'?ENS:ANS];if(!object(m))return false;
  const expected=kind==='ellipse'?evaluateEllipseOpticalCP4034Source(recipe):evaluateAcrossDescendingCP3988Source(recipe);
  if(!framesMatch(m.sourceFrames,expected.frames,kind))return false;
  // Saved frames bind the actual graph and numerical proof. Never reconstruct a malformed Doc to conceal it.
  const rebuilt=kind==='ellipse'?document('ellipse',recipe as EllipseOpticalCP4034Recipe,m.sourceFrames):document('across',recipe as AcrossDescendingCP3988Recipe,m.sourceFrames);
  if(!exact(m,rebuilt.metadata![kind==='ellipse'?ENS:ANS])||!exact(metadata.materialTopology,rebuilt.metadata!.materialTopology)||!exact(doc.paper,rebuilt.paper)||!exact(doc.segments,rebuilt.segments))return false;
  const inspected=inspectMaterialTopology(doc);return inspected.ok&&inspected.components.length===1&&inspected.components[0].boundaryLoops.length===1;
 }catch{return false;}}
export function ellipseOpticalCP4034SourceMatches(doc:Doc):boolean{return matches(doc,'ellipse');}
export function acrossDescendingCP3988SourceMatches(doc:Doc):boolean{return matches(doc,'across');}
