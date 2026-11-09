/** Fixed original In[3980] decreasing-angle helix; continuous refolding is reference only. */
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point,type Segment} from '../core/types';
import {polygonArea} from '../core/geometry';

export type SpiralRefoldCP3980Recipe={parameterStart:number;parameterEnd:number;leftWidth:number;rightWidth:number;segments:number};
export const SPIRAL_REFOLD_CP_3980_EXAMPLE:SpiralRefoldCP3980Recipe={parameterStart:0,parameterEnd:Math.PI,leftWidth:1,rightWidth:1,segments:100};
export type SpiralRefoldCP3980Frame={u:number;base:Point;basePrime:Point;leftDirector:Point;rightDirector:Point;foldAngleRad:number};
type Vec3=[number,number,number];
export type SpiralRefoldCP3980ReferenceFrame={u:number;sourceFoldAngleRad:number;recoveredFoldAngleRad:number;
 sourceBase:Vec3;sourceLeftDirector:Vec3;sourceRightDirector:Vec3;recoveredBase:Vec3;recoveredLeftDirector:Vec3;recoveredRightDirector:Vec3};
const SCHEMA='original-in3980-decreasing-gamma-two-face-cp-v1',BOUND=1e-13,C=Math.sqrt(3)/2,S=.5,V=1/C,AL=2/3,AR=4/3;
const object=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),
 finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),
 keys=(x:Record<string,unknown>,ns:string[])=>Object.keys(x).length===ns.length&&ns.every(k=>Object.hasOwn(x,k)),clone=<T>(x:T):T=>structuredClone(x);
function fail(message='原 In[3980] 保存输入、当前初值、连续参考或实际二维材料身份不一致。'):never{throw Error(message);}
export function validateSpiralRefoldCP3980Recipe(raw:unknown):SpiralRefoldCP3980Recipe{
 if(!object(raw)||!keys(raw,Object.keys(SPIRAL_REFOLD_CP_3980_EXAMPLE))||Object.values(raw).some(x=>!finite(x)))fail('须显式填写完整五个有限数值参数，不接受未知字段或隐式默认。');
 const r=raw as SpiralRefoldCP3980Recipe;
 if(r.parameterStart<0||r.parameterEnd>Math.PI||r.parameterEnd-r.parameterStart<.1)fail('u 须在原 [0,π] 内，区间跨度至少 0.1 rad；二维初值在当前起点重新固定。');
 if(r.leftWidth<.05||r.leftWidth>1||r.rightWidth<.05||r.rightWidth>1)fail('左右纸宽各须为 0.05…1 mm；保留原单位宽参考，不自动裁剪。');
 if(!Number.isInteger(r.segments)||r.segments<16||r.segments>128)fail('有限纸域须为 16…128 弦；默认 100 弦沿用原绘图密度。');
 return {...r};
}
// Positive Gauss-Legendre nodes/weights; pairs reflect through the midpoint.
const GL32:[number,number][]=[[0.048307665687738324,0.09654008851472766],[0.1444719615827965,0.09563872007927471],[0.23928736225213706,0.09384439908080451],[0.33186860228212767,0.09117387869576378],[0.42135127613063533,0.08765209300440378],[0.5068999089322294,0.08331192422694671],[0.5877157572407623,0.07819389578707023],[0.6630442669302152,0.07234579410884834],[0.7321821187402897,0.06582222277636168],[0.7944837959679424,0.058684093478535565],[0.84936761373257,0.05099805926237609],[0.8963211557660521,0.042835898022226836],[0.9349060759377397,0.034273862913021765],[0.9647622555875064,0.025392065309262024],[0.9856115115452684,0.016274394730905743],[0.9972638618494816,0.007018610009470506]];
const GL64:[number,number][]=[[0.02435029266342443,0.048690957009139814],[0.07299312178779904,0.04857546744150351],[0.12146281929612054,0.048344762234802996],[0.16964442042399283,0.04799938859645842],[0.21742364374000708,0.04754016571483042],[0.2646871622087674,0.046968182816210076],[0.31132287199021097,0.04628479658131447],[0.3572201583376681,0.045491627927418184],[0.4022701579639916,0.044590558163756566],[0.4463660172534641,0.04358372452932355],[0.48940314570705296,0.04247351512365361],[0.5312794640198946,0.041262563242623576],[0.571895646202634,0.039953741132720544],[0.6111553551723933,0.03855015317861564],[0.6489654712546573,0.03705512854024009],[0.6852363130542333,0.0354722132568823],[0.7198818501716109,0.033805161837141794],[0.7528199072605319,0.032057928354851495],[0.7839723589433414,0.030234657072402554],[0.8132653151227975,0.028339672614259535],[0.8406292962525803,0.02637746971505491],[0.8659993981540928,0.0243527025687112],[0.8893154459951141,0.02227017380838297],[0.9105221370785028,0.020134823153530088],[0.9295691721319396,0.017951715775697284],[0.9464113748584028,0.01572603047602503],[0.9610087996520538,0.01346304789671786],[0.973326827789911,0.011168139460131028],[0.983336253884626,0.008846759826363397],[0.9910133714767443,0.006504457968978502],[0.9963401167719552,0.004147033260564499],[0.9993050417357722,0.00178328072169414]];
function phase(u:number,start:number){return Math.PI/2+6*C*(Math.sin(Math.PI/3-start/6)-Math.sin(Math.PI/3-u/6));}
function quadrature(start:number,u:number,nodes:[number,number][]):Point{
 if(u===start)return [1,0];const mid=(start+u)/2,half=(u-start)/2;let x=1,y=0;
 for(const [node,weight]of nodes){const p=phase(mid-half*node,start),q=phase(mid+half*node,start),w=half*V*weight;
  x+=w*(Math.cos(p)+Math.cos(q));y+=w*(Math.sin(p)+Math.sin(q));}
 return [x,y];
}
function sourceFrame(u:number,start:number):SpiralRefoldCP3980Frame{
 const phi=phase(u,start),t:Point=u===start?[0,1]:[Math.cos(phi),Math.sin(phi)],normal:Point=[-t[1],t[0]],
  gamma=2*Math.PI/3-u/3,b=2*C*Math.sin(gamma/2),dl=Math.hypot(AL,b),dr=Math.hypot(AR,b);
 return {u,base:quadrature(start,u,GL32),basePrime:[V*t[0],V*t[1]],foldAngleRad:gamma,
  leftDirector:[(AL*t[0]+b*normal[0])/dl,(AL*t[1]+b*normal[1])/dl],
  rightDirector:[(AR*t[0]-b*normal[0])/dr,(AR*t[1]-b*normal[1])/dr]};
}
function spatialSource(u:number){
 const gamma=2*Math.PI/3-u/3,cg=Math.cos(gamma),sg=Math.sin(gamma),cu=Math.cos(u),su=Math.sin(u),
  b=2*C*Math.sin(gamma/2),dl=Math.hypot(AL,b),dr=Math.hypot(AR,b),
  azL=(1+cg)*S-1/3,azR=(1+cg)*S+1/3,z=C*C*(1-cg)+2*S*S;
 return {base:[cu,su,u/Math.sqrt(3)] as Vec3,tangent:[-C*su,C*cu,S] as Vec3,
  normal:[-cu,-su,0] as Vec3,binormal:[S*su,-S*cu,C] as Vec3,
  left:[-C*(sg*cu+azL*su)/dl,C*(-sg*su+azL*cu)/dl,(z-S/3)/dl] as Vec3,
  right:[C*(sg*cu-azR*su)/dr,C*(sg*su+azR*cu)/dr,(z+S/3)/dr] as Vec3};
}
/** Constant Frenet generator exponential, initialized only at the current midpoint.
 * A has angular norm1; translation is the integral of exp(t A)*V e1.
 * These continuous reference points are never assigned to material.foldedVertices. */
function inverseAt(u:number,mid:number,initial:ReturnType<typeof spatialSource>){
 const delta=u-mid,si=Math.sin(delta),omc=2*Math.sin(delta/2)**2,dm=delta-si,
  matrix=[[0,-C,0],[C,0,-S],[0,S,0]],
  square=matrix.map((row,i)=>row.map((_,j)=>row.reduce((s,x,k)=>s+x*matrix[k][j],0))),
  exp=matrix.map((row,i)=>row.map((x,j)=>(i===j?1:0)+si*x+omc*square[i][j])),
  cols=[initial.tangent,initial.normal,initial.binormal],
  column=(j:number)=>[0,1,2].map(axis=>cols.reduce((sum,col,k)=>sum+col[axis]*exp[k][j],0)) as Vec3,
  translation=[0,1,2].map(k=>V*((k===0?delta:0)+omc*matrix[k][0]+dm*square[k][0])),
  base=initial.base.map((x,axis)=>x+cols.reduce((sum,col,k)=>sum+col[axis]*translation[k],0)) as Vec3,
  tangent=column(0),normal=column(1),binormal=column(2),h=Math.PI/3-u/6,hi=Math.PI/3-mid/6,
  gamma=2*Math.asin(Math.sin((2*Math.PI/3-mid/3)/2)*Math.sin(h)/Math.sin(hi)),
  ch=Math.cos(gamma/2),sh=Math.sin(gamma/2),b=2*C*Math.sin(h),dl=Math.hypot(AL,b),dr=Math.hypot(AR,b),
  left=tangent.map((t,i)=>(AL*t+b*(ch*normal[i]+sh*binormal[i]))/dl) as Vec3,
  right=tangent.map((t,i)=>(AR*t-b*(ch*normal[i]-sh*binormal[i]))/dr) as Vec3;
 return {base,tangent,normal,binormal,gamma,left,right};
}
function sourceSnapshot(r:SpiralRefoldCP3980Recipe){
 const mid=(r.parameterStart+r.parameterEnd)/2,initial=spatialSource(mid),frames:SpiralRefoldCP3980Frame[]=[],referenceFrames:SpiralRefoldCP3980ReferenceFrame[]=[];
 let maximumQuadratureDifferenceMm=0,maximumUnitDirectorResidual=0,maximumRecoveredAngleDifferenceRad=0,maximumRecoveredSpatialDifferenceMm=0,maximumRecoveredDirectorDifference=0;
 const difference=(a:number[],b:number[])=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));
 for(let i=0;i<=r.segments;i++){
  const u=i===r.segments?r.parameterEnd:r.parameterStart+(r.parameterEnd-r.parameterStart)*i/r.segments,
   flat=sourceFrame(u,r.parameterStart),high=quadrature(r.parameterStart,u,GL64),space=spatialSource(u),inverse=inverseAt(u,mid,initial);
  maximumQuadratureDifferenceMm=Math.max(maximumQuadratureDifferenceMm,difference(flat.base,high));
  maximumRecoveredAngleDifferenceRad=Math.max(maximumRecoveredAngleDifferenceRad,Math.abs(flat.foldAngleRad-inverse.gamma));
  maximumRecoveredSpatialDifferenceMm=Math.max(maximumRecoveredSpatialDifferenceMm,difference(space.base,inverse.base));
  maximumRecoveredDirectorDifference=Math.max(maximumRecoveredDirectorDifference,difference(space.left,inverse.left),difference(space.right,inverse.right));
  for(const d of [flat.leftDirector,flat.rightDirector,space.left,space.right,inverse.left,inverse.right])maximumUnitDirectorResidual=Math.max(maximumUnitDirectorResidual,Math.abs(d.reduce((s,x)=>s+x*x,0)-1));
  frames.push(flat);referenceFrames.push({u,sourceFoldAngleRad:flat.foldAngleRad,recoveredFoldAngleRad:inverse.gamma,
   sourceBase:space.base,sourceLeftDirector:space.left,sourceRightDirector:space.right,recoveredBase:inverse.base,recoveredLeftDirector:inverse.left,recoveredRightDirector:inverse.right});
 }
 const diagnostics={maximumQuadratureDifferenceMm,maximumUnitDirectorResidual,maximumRecoveredAngleDifferenceRad,maximumRecoveredSpatialDifferenceMm,maximumRecoveredDirectorDifference};
 if(Object.values(diagnostics).some(x=>!finite(x)||x<0||x>BOUND))fail('固定保存例的 32/64 阶积分、单位母线或连续折回参考未通过 10⁻¹³ 复核；未移动源点。');
 return {frames,referenceFrames,diagnostics,midpoint:{parameter:mid,foldAngleRad:2*Math.PI/3-mid/3,position:initial.base,tangent:initial.tangent,normal:initial.normal,binormal:initial.binormal}};
}
const offset=(p:Point,d:Point,w:number):Point=>[p[0]+w*d[0],p[1]+w*d[1]];

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
 for(let i=0;i<n;i++){add(i,i+1,'U',`refold3980-crease-${i}`);add(s+i,s+i+1,'B',`refold3980-left-${i}`);add(2*s+i,2*s+i+1,'B',`refold3980-right-${i}`);}
 for(const i of [0,n]){add(i,s+i,'B',`refold3980-cap-left-${i}`);add(i,2*s+i,'B',`refold3980-cap-right-${i}`);}
 const range=(a:number)=>Array.from({length:s},(_,i)=>a+i),faces_vertices=[ [...range(0),...range(s).reverse()],[...range(0).reverse(),...range(2*s)] ],
  map=new Map(edges_vertices.map(([a,b],i)=>[[a,b].sort((a,b)=>a-b).join(','),i])),
  faces_edges=faces_vertices.map(face=>face.map((a,i)=>map.get([a,face[(i+1)%face.length]].sort((a,b)=>a-b).join(','))!)),
  edges_faces=edges_vertices.map((_,e)=>faces_edges.flatMap((es,f)=>es.includes(e)?[f]:[])),
  faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(g=>g!==f)??null)) as unknown as number[][];
 const proof=finitePartition(curves,edges_vertices,faces_vertices);
 return {graph:{vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces} as FoldGraph,ids,proof};
}
function documentFromSource(recipe:SpiralRefoldCP3980Recipe,snapshot:ReturnType<typeof sourceSnapshot>,trustedPreview=false):Doc{
 const {frames,referenceFrames,diagnostics,midpoint}=snapshot,
  curves=[frames.map(f=>clone(f.base)),frames.map(f=>offset(f.base,f.leftDirector,recipe.leftWidth)),frames.map(f=>offset(f.base,f.rightDirector,recipe.rightWidth))],
  {graph,ids,proof}=materialGraph(curves),points=graph.vertices_coords,
  bbox={width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))},
  doc:Doc={schemaVersion:2,name:'原螺旋展开再折回 · 两面纸域 CP',paper:bbox,segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:clone(points[a]),b:clone(points[b]),assignment:graph.edges_assignment[i] as 'U'|'B',angle:graph.edges_foldAngle[i]}))},
  material=createMaterialTopology(doc,graph,ids),inspection=trustedPreview?null:inspectMaterialTopology({...doc,metadata:{materialTopology:material}}),step=(recipe.parameterEnd-recipe.parameterStart)/recipe.segments;
 if(inspection&&(!inspection.ok||inspection.components.length!==1||inspection.components[0].boundaryLoops.length!==1))fail('实际纸域必须是一材料部件、一闭外边及两个真实面。');
 doc.metadata={materialTopology:material,originalSpiralRefold3980:{schema:SCHEMA,recipe,
  source:{inputCell:'In[3980]',definitionCells:['In[3959]','In[3963]','In[3966]','In[3977]'],
   functions:['NCurvedFoldHelix3D','NCurvedFoldHelix2D','NFoldCurvedFold3D'],radius:1,helicityAngleDeg:30,
   theta:'30 Degree (no decimal)',gamma:'120 Degree - 60 Degree (u/pi)',gammaRad:'2pi/3-u/3',gammaDerivative:-1/3,
   parameterIsOriginalU:true,parameterIsArcLength:false,initialParameter:recipe.parameterStart,initialPoint:[1,0],initialTangent:[0,1],currentStartReseeded:true,
   originalInterpolationPoints:128,interpolationRole:'upstream 3D gamma overwritten by interpolation then passed to 2D; 2D internal opts not forwarded',
   originalGraphicsCurveDivisions:100,originalGraphicsWidths:[1,1],originalFoldLineStyle:'FoldedLine',originalRulingStyles:['UnfoldedLine','UnfoldedLine'],
   originalMVSpecified:false,rightDirectorReversed:false,coordinateTransform:'identity',originalCoordinateUnit:'unspecified',coordinateUnit:'mm',localUnitConvention:'1 original world coordinate unit = 1 mm',
   sourceRole:'fixed saved original equations; not a native HTTP payload or a Wolfram interpolation result',wolframExecuted:false,wolframInterpolationReproduced:false},
  sourceFrames:trustedPreview?frames:clone(frames),
  continuousReference:{role:'original spatial -> unfolded 2D -> midpoint continuous Frenet recovery; reference only',midpoint:trustedPreview?midpoint:clone(midpoint),
   recoveredFromCurrentMidpoint:true,sourceCurvature:3/4,sourceTorsion:Math.sqrt(3)/4,parameterSpeed:V,
   generator:[[0,-V*3/4,0,V],[V*3/4,0,-V*Math.sqrt(3)/4,0],[0,V*Math.sqrt(3)/4,0,0],[0,0,0,0]],
   method:'constant Frenet generator exponential and half-angle solution from midpoint source initial frame',frames:trustedPreview?referenceFrames:clone(referenceFrames),
   finiteRigidFoldedShape:false,wolframInterpolationReproduced:false},
  paperDomain:{role:recipe.leftWidth===1&&recipe.rightWidth===1?'original-unit-width-on-selected-domain':'local-inset-of-original-unit-width',
   widths:[recipe.leftWidth,recipe.rightWidth],widthsAreOriginalDefaults:recipe.leftWidth===1&&recipe.rightWidth===1,parameterRange:[recipe.parameterStart,recipe.parameterEnd],
   leftJacobianLowerBound:6/Math.sqrt(43)-3/4*recipe.leftWidth,rightSignedJacobianUpperBound:-6/Math.sqrt(91),continuousAnalyticPaperInjective:true,
   leftRightIntersection:'common crease only',injectivityMethod:'fixed-v x strictly decreases; fixed-x J/xu has strict side sign; endpoint cap separation',parameterRectangleQuotient:false},
  sampling:{method:'fixed source Gauss-Legendre32 world values checked against Gauss-Legendre64; local linear chords',segments:recipe.segments,parameterStep:step,
   exactContinuousCurve:false,curveSegmentsAreInterpolationPoints:false,creaseChordErrorUpperBoundMm:step*step/8,leftBoundaryChordErrorUpperBoundMm:3*step*step/8,rightBoundaryChordErrorUpperBoundMm:3*step*step/8,
   errorBoundRole:'ideal original equation curve-to-chord approximation only; not a quadrature, native, finite3D or Wolfram interpolation interval certificate'},
  finitePaperProof:proof,topology:{vertices:3*(recipe.segments+1),edges:3*recipe.segments+4,faces:2,boundaryEdges:2*recipe.segments+4,unassignedCreases:recipe.segments,
   vertexOrder:['crease','left boundary','right boundary'],edgeSegmentIds:ids,sourceCoordinatesUnaltered:true,coordinateWelding:false,interiorRulingSeams:0},
  numericalPolicy:{knownDerivedAbsoluteBoundMm:BOUND,parametersAndIndicesExact:true,...diagnostics,quadratureErrorIntervalCertified:false},
  evidence:{adoption:'explicit-cp-only',mountainValleyAssigned:false,sourceVariableGammaIsFiniteEdgeAngle:false,flatFold:false,layerOrder:false,threeDimensionalInitialCondition:false,
   isometryTo3D:false,continuousMotion:false,collisionFree:false}}};
 validateDoc(doc);return doc;
}
export function spiralRefoldCP3980Document(raw:unknown):Doc{
 const recipe=validateSpiralRefoldCP3980Recipe(raw);return documentFromSource(recipe,sourceSnapshot(recipe));
}
/** Private component source depends on the current u range and n; every width rebuild
 * still validates exact finite geometry. Adopt a whole clone through the uncached guard. */
export function prepareSpiralRefoldCP3980Preview(raw:unknown):(raw:unknown)=>Doc{
 const recipe=validateSpiralRefoldCP3980Recipe(raw),snapshot=sourceSnapshot(recipe),freeze=(x:any):void=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}};
 freeze(snapshot);return raw=>{const next=validateSpiralRefoldCP3980Recipe(raw);
  if(next.parameterStart!==recipe.parameterStart||next.parameterEnd!==recipe.parameterEnd||next.segments!==recipe.segments)fail('原区间、当前初值或弦段数已改变，须重建本次原源。');
  return documentFromSource(next,snapshot,true);
 };
}
export function readSpiralRefoldCP3980Recipe(doc:Doc):SpiralRefoldCP3980Recipe|null{
 try{const raw=doc.metadata?.originalSpiralRefold3980;if(!object(raw)||raw.schema!==SCHEMA)return null;return validateSpiralRefoldCP3980Recipe(raw.recipe);}catch{return null;}
}
function same(a:unknown,b:unknown,path=''):boolean{
 if(typeof a==='number'&&typeof b==='number'){
  if(!finite(a)||!finite(b))return false;
  if(/^finitePaperProof\.(minimumTriangleCross|signedFaceAreas\.\d+)$/.test(path))return a>0&&b>0&&Math.abs(a-b)<=BOUND;
  if(/^numericalPolicy\.maximum(QuadratureDifferenceMm|UnitDirectorResidual|RecoveredAngleDifferenceRad|RecoveredSpatialDifferenceMm|RecoveredDirectorDifference)$/.test(path))return a>=0&&b>=0&&a<=BOUND&&Math.abs(a-b)<=BOUND;
  if(/^sourceFrames\.\d+\.(base|basePrime|leftDirector|rightDirector)\.[01]$/.test(path)||/^sourceFrames\.\d+\.foldAngleRad$/.test(path)||
   /^continuousReference\.frames\.\d+\.(sourceBase|sourceLeftDirector|sourceRightDirector|recoveredBase|recoveredLeftDirector|recoveredRightDirector)\.[012]$/.test(path)||
   /^continuousReference\.frames\.\d+\.(sourceFoldAngleRad|recoveredFoldAngleRad)$/.test(path)||/^continuousReference\.midpoint\.(position|tangent|normal|binormal)\.[012]$/.test(path)||
   /^continuousReference\.midpoint\.foldAngleRad$/.test(path)||/^materialTopology\.graph\.vertices_coords\.\d+\.[01]$/.test(path))return Math.abs(a-b)<=BOUND;
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
/** Validate current Doc before replay; public untrusted inputs never receive trust caching. */
export function spiralRefoldCP3980SourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);const recipe=readSpiralRefoldCP3980Recipe(doc),saved=doc.metadata?.originalSpiralRefold3980;
  if(!recipe||!object(saved)||Object.hasOwn(doc,'flatFold')||JSON.stringify(saved.sourceFrames?.[0]?.base)!=='[1,0]')return false;
  if(JSON.stringify(saved.sourceFrames?.[0]?.basePrime)!==JSON.stringify([0,V])||recipe.parameterStart===0&&JSON.stringify(saved.continuousReference?.frames?.[0]?.sourceBase)!=='[1,0,0]')return false;
  const expected=spiralRefoldCP3980Document(recipe),actual=inspectMaterialTopology(doc),target=inspectMaterialTopology(expected);
  if(!actual.ok||!target.ok||actual.foldedVertices||actual.startingFace!==undefined||!same(saved,expected.metadata!.originalSpiralRefold3980)||
    !same(doc.metadata!.materialTopology,expected.metadata!.materialTopology,'materialTopology')||!same(actual.edgeSegmentIds,target.edgeSegmentIds)||
    !sameSegments(doc.segments,expected.segments)||!object(doc.paper)||!keys(doc.paper,['width','height']))return false;
  const points=doc.segments.flatMap(s=>[s.a,s.b]),bbox={width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))};
  for(const key of ['width','height'] as const)if(!finite(doc.paper[key])||doc.paper[key]<=0||Math.abs(doc.paper[key]-expected.paper[key])>BOUND||Math.abs(doc.paper[key]-bbox[key])>BOUND)return false;
  const {vertices_coords:a,...ag}=actual.graph,{vertices_coords:b,...bg}=target.graph;
  if(!same(ag,bg)||a.length!==b.length||!a.every((p,i)=>p.length===2&&p.every((x,k)=>finite(x)&&Math.abs(x-b[i][k])<=BOUND)))return false;
  return JSON.stringify(a[0])==='[1,0]'&&doc.segments.filter(s=>s.id==='refold3980-crease-0'||s.id==='refold3980-cap-left-0'||s.id==='refold3980-cap-right-0').every(s=>JSON.stringify(s.a)==='[1,0]');
 }catch{return false;}
}
