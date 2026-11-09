/** Original In[3951] analytic uniform helix. Its absolute zero-seed curves are cropped, never reseeded. */
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point,type Segment} from '../core/types';
import {polygonArea} from '../core/geometry';

export type UniformHelixCP3951Recipe={parameterStart:number;parameterEnd:number;leftWidth:number;rightWidth:number;segments:number};
export const UNIFORM_HELIX_CP_3951_EXAMPLE:UniformHelixCP3951Recipe={parameterStart:0,parameterEnd:Math.PI,leftWidth:1,rightWidth:1,segments:100};
export type UniformHelixCP3951Frame={u:number;base:Point;basePrime:Point;leftDirector:Point;rightDirector:Point};
const SCHEMA='original-in3951-analytic-uniform-helix-cp-v1',BOUND=1e-13,R=4*Math.SQRT2/3,K=Math.sqrt(6)/4,
 A=Math.sqrt(3/5),B=Math.sqrt(2/5),FOCAL=8/Math.sqrt(30);
const object=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),
 finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),
 keys=(x:Record<string,unknown>,ns:string[])=>Object.keys(x).length===ns.length&&ns.every(k=>Object.hasOwn(x,k)),clone=<T>(x:T):T=>structuredClone(x);
function fail(message='原 In[3951] 保存输入、解析源、有限纸域或实际材料身份不一致。'):never{throw Error(message);}
export function validateUniformHelixCP3951Recipe(raw:unknown):UniformHelixCP3951Recipe{
 if(!object(raw)||!keys(raw,Object.keys(UNIFORM_HELIX_CP_3951_EXAMPLE))||Object.values(raw).some(x=>!finite(x)))fail('须显式填写完整五个有限数值参数，不接受未知字段或隐式默认。');
 const r=raw as UniformHelixCP3951Recipe;
 if(r.parameterStart<0||r.parameterEnd>Math.PI||r.parameterEnd-r.parameterStart<.1)fail('u 须在原 [0,π] 内，裁域跨度至少 0.1 rad；保持原零点初值。');
 if(r.leftWidth<.05||r.leftWidth>1||r.rightWidth<.05||r.rightWidth>1)fail('左右纸宽各须为 0.05…1 mm；原单位宽 1 均在源焦点前。');
 if(!Number.isInteger(r.segments)||r.segments<16||r.segments>128)fail('有限纸域须为 16…128 弦；默认 100 弦沿用原绘图密度。');
 return {...r};
}
function frame(u:number):UniformHelixCP3951Frame{
 const q=K*u,ca=Math.cos(q),sa=Math.sin(q);
 return {u,base:[1-2*R*Math.sin(q/2)**2,R*sa],basePrime:[-R*K*sa,R*K*ca],
  leftDirector:[-A*ca-B*sa,-A*sa+B*ca],rightDirector:[A*ca-B*sa,A*sa+B*ca]};
}
function sourceFrames(r:UniformHelixCP3951Recipe):UniformHelixCP3951Frame[]{
 return Array.from({length:r.segments+1},(_,i)=>frame(i===r.segments?r.parameterEnd:r.parameterStart+(r.parameterEnd-r.parameterStart)*i/r.segments));
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
 for(let i=0;i<n;i++){add(i,i+1,'U',`uniform3951-crease-${i}`);add(s+i,s+i+1,'B',`uniform3951-left-${i}`);add(2*s+i,2*s+i+1,'B',`uniform3951-right-${i}`);}
 for(const i of [0,n]){add(i,s+i,'B',`uniform3951-cap-left-${i}`);add(i,2*s+i,'B',`uniform3951-cap-right-${i}`);}
 const range=(a:number)=>Array.from({length:s},(_,i)=>a+i),faces_vertices=[ [...range(0),...range(s).reverse()],[...range(0).reverse(),...range(2*s)] ],
  map=new Map(edges_vertices.map(([a,b],i)=>[[a,b].sort((a,b)=>a-b).join(','),i])),
  faces_edges=faces_vertices.map(face=>face.map((a,i)=>map.get([a,face[(i+1)%face.length]].sort((a,b)=>a-b).join(','))!)),
  edges_faces=edges_vertices.map((_,e)=>faces_edges.flatMap((es,f)=>es.includes(e)?[f]:[])),
  faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(g=>g!==f)??null)) as unknown as number[][];
 const proof=finitePartition(curves,edges_vertices,faces_vertices);
 return {graph:{vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces} as FoldGraph,ids,proof};
}
function documentFromFrames(recipe:UniformHelixCP3951Recipe,frames:UniformHelixCP3951Frame[],trustedPreview=false):Doc{
 const curves=[frames.map(f=>clone(f.base)),frames.map(f=>offset(f.base,f.leftDirector,recipe.leftWidth)),frames.map(f=>offset(f.base,f.rightDirector,recipe.rightWidth))],
  {graph,ids,proof}=materialGraph(curves),points=graph.vertices_coords,
  bbox={width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))},
  doc:Doc={schemaVersion:2,name:'原均匀螺旋 · 解析两面纸域 CP',paper:bbox,segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:clone(points[a]),b:clone(points[b]),assignment:graph.edges_assignment[i] as 'U'|'B',angle:graph.edges_foldAngle[i]}))},
  material=createMaterialTopology(doc,graph,ids),inspection=trustedPreview?null:inspectMaterialTopology({...doc,metadata:{materialTopology:material}}),
  step=(recipe.parameterEnd-recipe.parameterStart)/recipe.segments;
 if(inspection&&(!inspection.ok||inspection.components.length!==1||inspection.components[0].boundaryLoops.length!==1))fail('实际纸域必须是一材料部件、一闭外边及两个真实面。');
 let maximumUnitDirectorResidual=0;
 for(const f of frames)for(const d of [f.leftDirector,f.rightDirector])maximumUnitDirectorResidual=Math.max(maximumUnitDirectorResidual,Math.abs(d[0]*d[0]+d[1]*d[1]-1));
 if(!finite(maximumUnitDirectorResidual)||maximumUnitDirectorResidual>BOUND)fail('解析单位母线数值复核未通过，未归一化或移动源点。');
 doc.metadata={materialTopology:material,originalUniformHelix3951:{schema:SCHEMA,recipe,
  source:{inputCell:'In[3953]',definitionCells:['In[3951]','In[3952]'],spatialReferenceCells:['In[3945]','In[3947]'],
   functions:['CurvedFoldUniformHelix2D','CurvedFoldUniformHelix3D'],radius:1,helicityAngleDeg:30,foldAngleDeg:90,
   theta:'30 Degree (no decimal)',gamma:'90 Degree (constant)',parameterIsOriginalU:true,parameterIsArcLength:false,
   initialParameter:0,initialPoint:[1,0],initialTangent:[0,1],cropRole:'absolute original parameter functions',currentStartReseeded:false,
   originalGraphicsCurveDivisions:100,originalGraphicsWidths:[1,1],originalFoldLineStyle:'FoldedLine',originalRulingStyles:['UnfoldedLine','UnfoldedLine'],
   originalMVSpecified:false,rightDirectorReversed:false,coordinateTransform:'identity',originalCoordinateUnit:'unspecified',coordinateUnit:'mm',
   localUnitConvention:'1 original world coordinate unit = 1 mm',sourceRole:'original analytic 2D functions; not a native HTTP result',wolframInterpolationReproduced:false},
  analyticConstants:{creaseRadius:R,parameterAngularRate:K,inwardRadialCoefficient:A,tangentialCoefficient:B,center:[1-R,0],leftFocalDistance:FOCAL},
  sourceFrames:trustedPreview?frames:clone(frames),
  paperDomain:{role:recipe.leftWidth===1&&recipe.rightWidth===1?'original-unit-width-on-selected-domain':'local-inset-of-original-unit-width',
   widths:[recipe.leftWidth,recipe.rightWidth],widthsAreOriginalDefaults:recipe.leftWidth===1&&recipe.rightWidth===1,
   parameterRange:[recipe.parameterStart,recipe.parameterEnd],leftJacobianLowerBound:2/Math.sqrt(5)-K*recipe.leftWidth,
   rightSignedJacobianUpperBound:-2/Math.sqrt(5),continuousAnalyticPaperInjective:true,leftRightIntersection:'common crease only',
   injectivityMethod:'strict monotone polar radius determines v; angle span below2pi determines original u',parameterRectangleQuotient:false},
  sampling:{method:'original analytic world values and local linear chords',segments:recipe.segments,parameterStep:step,
   exactContinuousCurve:false,curveSegmentsAreInterpolationPoints:false,creaseChordErrorUpperBoundMm:R*K*K*step*step/8,
   leftBoundaryChordErrorUpperBoundMm:(R+recipe.leftWidth)*K*K*step*step/8,rightBoundaryChordErrorUpperBoundMm:(R+recipe.rightWidth)*K*K*step*step/8,
   errorBoundRole:'analytic curve-to-chord approximation only; no finite3D or Wolfram interpolation claim'},
  finitePaperProof:proof,topology:{vertices:3*(recipe.segments+1),edges:3*recipe.segments+4,faces:2,boundaryEdges:2*recipe.segments+4,unassignedCreases:recipe.segments,
   vertexOrder:['crease','left boundary','right boundary'],edgeSegmentIds:ids,sourceCoordinatesUnaltered:true,coordinateWelding:false,interiorRulingSeams:0},
  numericalPolicy:{knownDerivedAbsoluteBoundMm:BOUND,parametersAndIndicesExact:true,maximumUnitDirectorResidual},
  evidence:{adoption:'explicit-cp-only',mountainValleyAssigned:false,sourceConstantGammaIsFiniteEdgeAngle:false,flatFold:false,layerOrder:false,
   threeDimensionalInitialCondition:false,isometryTo3D:false,continuousMotion:false,collisionFree:false}}};
 validateDoc(doc);return doc;
}
export function uniformHelixCP3951Document(raw:unknown):Doc{
 const recipe=validateUniformHelixCP3951Recipe(raw);return documentFromFrames(recipe,sourceFrames(recipe));
}
/** Private component snapshot: absolute source frames depend only on u range and n.
 * Every width rebuild still checks exact finite geometry and actual material topology.
 * Adopt a whole clone through the uncached public SourceMatches gate. */
export function prepareUniformHelixCP3951Preview(raw:unknown):(raw:unknown)=>Doc{
 const recipe=validateUniformHelixCP3951Recipe(raw),frames=sourceFrames(recipe),
  freeze=(x:any):void=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}};
 freeze(frames);return raw=>{const next=validateUniformHelixCP3951Recipe(raw);
  if(next.parameterStart!==recipe.parameterStart||next.parameterEnd!==recipe.parameterEnd||next.segments!==recipe.segments)fail('原裁域或弦段数已改变，须重建当前解析源。');
  return documentFromFrames(next,frames,true);
 };
}
export function readUniformHelixCP3951Recipe(doc:Doc):UniformHelixCP3951Recipe|null{
 try{const raw=doc.metadata?.originalUniformHelix3951;if(!object(raw)||raw.schema!==SCHEMA)return null;return validateUniformHelixCP3951Recipe(raw.recipe);}catch{return null;}
}
function same(a:unknown,b:unknown,path=''):boolean{
 if(typeof a==='number'&&typeof b==='number'){
  if(!finite(a)||!finite(b))return false;
  if(/^finitePaperProof\.(minimumTriangleCross|signedFaceAreas\.\d+)$/.test(path))return a>0&&b>0&&Math.abs(a-b)<=BOUND;
  if(path==='numericalPolicy.maximumUnitDirectorResidual')return a>=0&&b>=0&&a<=BOUND&&Math.abs(a-b)<=BOUND;
  if(/^sourceFrames\.\d+\.(base|basePrime|leftDirector|rightDirector)\.[01]$/.test(path)||
    /^materialTopology\.graph\.vertices_coords\.\d+\.[01]$/.test(path))return Math.abs(a-b)<=BOUND;
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
/** Current Doc is validated first; no reconstruction is allowed to conceal real changes. */
export function uniformHelixCP3951SourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);const recipe=readUniformHelixCP3951Recipe(doc),saved=doc.metadata?.originalUniformHelix3951;
  if(!recipe||!object(saved)||Object.hasOwn(doc,'flatFold'))return false;
  if(recipe.parameterStart===0&&JSON.stringify(saved.sourceFrames?.[0]?.base)!=='[1,0]')return false;
  const expected=uniformHelixCP3951Document(recipe),actual=inspectMaterialTopology(doc),target=inspectMaterialTopology(expected);
  if(!actual.ok||!target.ok||actual.foldedVertices||actual.startingFace!==undefined||!same(saved,expected.metadata!.originalUniformHelix3951)||
    !same(doc.metadata!.materialTopology,expected.metadata!.materialTopology,'materialTopology')||!same(actual.edgeSegmentIds,target.edgeSegmentIds)||
    !sameSegments(doc.segments,expected.segments)||!object(doc.paper)||!keys(doc.paper,['width','height']))return false;
  const points=doc.segments.flatMap(s=>[s.a,s.b]),bbox={width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))};
  for(const key of ['width','height'] as const)if(!finite(doc.paper[key])||doc.paper[key]<=0||Math.abs(doc.paper[key]-expected.paper[key])>BOUND||Math.abs(doc.paper[key]-bbox[key])>BOUND)return false;
  const {vertices_coords:a,...ag}=actual.graph,{vertices_coords:b,...bg}=target.graph;
  if(!same(ag,bg)||a.length!==b.length||!a.every((p,i)=>p.length===2&&p.every((x,k)=>finite(x)&&Math.abs(x-b[i][k])<=BOUND)))return false;
  return recipe.parameterStart!==0||JSON.stringify(a[0])==='[1,0]'&&doc.segments.filter(s=>s.id==='uniform3951-crease-0'||s.id==='uniform3951-cap-left-0'||s.id==='uniform3951-cap-right-0').every(s=>JSON.stringify(s.a)==='[1,0]');
 }catch{return false;}
}
