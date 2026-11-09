/** Original In[4040] known 2D ruled parameterization, with a bounded finite CP assembly. */
import {fetchNativePlanarSequenceWhenIdle,makeNativePlanarSequenceReference,parseNativePlanarSequenceResult,
 type NativePlanarSequenceQuery,type NativePlanarSequenceResult} from './curvedNativePlanarSequence';
import {flatPoint} from './curvedPlanarReflectionSequence';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point,type Segment} from '../core/types';
import {distance,polygonArea} from '../core/geometry';

export type PlanarRuledCP4040Recipe={parameterStart:number;parameterEnd:number;segments:number};
export const PLANAR_RULED_CP_4040_EXAMPLE:PlanarRuledCP4040Recipe={parameterStart:-Math.PI/4,parameterEnd:Math.PI/4,segments:16};
const SCHEMA='original-in4040-bounded-planar-ruled-cp-v1',BOUND=1e-13;
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:Record<string,unknown>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const clone=<T>(x:T):T=>structuredClone(x);
function fail(message='原 In[4040] 输入、镜像序列、纸面坐标或实际材料身份不一致。'):never{throw Error(message);}
export function validatePlanarRuledCP4040Recipe(raw:unknown):PlanarRuledCP4040Recipe{
 if(!object(raw)||!keys(raw,Object.keys(PLANAR_RULED_CP_4040_EXAMPLE))||Object.values(raw).some(x=>!finite(x)))
  fail('请填写完整原区间与弦段数，不接受隐式默认值。');
 const r=raw as PlanarRuledCP4040Recipe;
 if(r.parameterStart< -Math.PI/4||r.parameterEnd>Math.PI/4||r.parameterEnd-r.parameterStart<.1)
  fail('u 须在原 [−π/4, π/4] 内，区间跨度至少 0.1 rad。');
 if(!Number.isInteger(r.segments)||r.segments<16||r.segments>128)fail('原二维纸带 CP 须为 16…128 个弦段。');
 return {...r};
}
export function planarRuledCP4040Query(value:unknown):NativePlanarSequenceQuery{
 const r=validatePlanarRuledCP4040Recipe(value),k=1/Math.sqrt(2);
 return {family:'planar-sequence-native',baseCurve:['cos(s)','sin(s)','0'],director:['0','0','1'],
  mirrors:[{point:[1,0,1],normal:[-k,0,k]},{point:[2,0,1],normal:[-k,0,k]}],composeReflections:false,
  parameterStart:r.parameterStart,parameterEnd:r.parameterEnd,transverseStart:0,transverseEnd:3,segments:r.segments,rulingSegments:2};
}
/** Display reference only. Adoption always requires the actual native source result. */
export function planarRuledCP4040Preview(value:unknown){
 const r=validatePlanarRuledCP4040Recipe(value),parameters=Array.from({length:r.segments+1},(_,i)=>
  i===r.segments?r.parameterEnd:r.parameterStart+(r.parameterEnd-r.parameterStart)*i/r.segments);
 return {recipe:r,curves:[0,1,2,3].map(c=>parameters.map(u=>flatPoint('cylinder-symbolic',u,c===0?0:c===3?3:Math.cos(u)+c-1)))};
}
function verifiedNative(value:unknown,r:PlanarRuledCP4040Recipe){
 const query=planarRuledCP4040Query(r),native=parseNativePlanarSequenceResult(value,query),ref=makeNativePlanarSequenceReference(query);
 if(!native.domain.certified||!native.certification.sourceDomainCertified||!native.certification.mirrorNormalsCompatible||
    !native.certification.conditionalReflectionIsometryCertified||!native.certification.finiteMetricVerified)fail('原镜像序列全域与原数值核尚未通过。');
 if(native.effectiveMirrors.some((m,i)=>JSON.stringify(m.normal)!==JSON.stringify(query.mirrors[i].normal)))fail('原镜面法向量身份须保输入原值，不作归一化。');
 if(native.normalization.scale!==3||native.normalization.origin[2]!==0)fail('此固定原例的源归一化尺度须为3，原基曲线z须为零。');
 let maximumLiteralResidual=0;
 const check=(actual:number,expected:number)=>{if(!finite(actual)||!finite(expected))fail();
  const error=Math.abs(actual-expected);maximumLiteralResidual=Math.max(maximumLiteralResidual,error);if(error>BOUND)fail('原二维切距或原序列数值超出固定 10⁻¹³ 源单位舍入界。');};
 const curves:Point[][]=[[],[],[],[]];
 native.sample.rows.forEach((row,i)=>{
  const u=i===r.segments?r.parameterEnd:r.parameterStart+(r.parameterEnd-r.parameterStart)*i/r.segments;
  check(row.s,u);if((i===0&&row.s!==r.parameterStart)||(i===r.segments&&row.s!==r.parameterEnd))fail('原采样端点须保当前输入值。');
  check(native.grid[i].s,row.s);
  if(row.stages[0].parameter!==0||row.stages[0].parameterDerivative!==0)fail('原初始条目的切距和导数须严格为零。');
  const initial=row.stages[0];
  if(JSON.stringify(initial.director)!=='[0,0,1]'||JSON.stringify(initial.directorDerivative)!=='[0,0,0]'||
     JSON.stringify(initial.normalizedDirectorDerivative)!=='[0,0,0]'||
     JSON.stringify(initial.base)!==JSON.stringify(initial.fold)||JSON.stringify(initial.baseDerivative)!==JSON.stringify(initial.foldDerivative)||
     JSON.stringify(initial.normalizedBase)!==JSON.stringify(initial.normalizedFold)||
     JSON.stringify(initial.normalizedBaseDerivative)!==JSON.stringify(initial.normalizedFoldDerivative)||
     [initial.base,initial.fold,initial.baseDerivative,initial.foldDerivative,initial.normalizedBase,initial.normalizedFold,
      initial.normalizedBaseDerivative,initial.normalizedFoldDerivative].some(p=>p[2]!==0))fail('原初始 B/B/D 条目的恒等和常量须严格保留。');
  const reference=ref.evaluate(row.s);
  row.stages.forEach((stage,j)=>{
   const expected=reference.stages[j];check(stage.parameter,expected.parameter.c[0]);check(stage.parameterDerivative,expected.parameter.c[1]);
   for(const name of ['base','fold','director'] as const){
    const jets=expected[name],suffix=name[0].toUpperCase()+name.slice(1);
    for(let axis=0;axis<3;axis++){
     check(stage['normalized'+suffix as 'normalizedBase'][axis],jets[axis].c[0]);
     check(stage['normalized'+suffix+'Derivative' as 'normalizedBaseDerivative'][axis],jets[axis].c[1]);
     check(stage[name][axis],jets[axis].c[0]*ref.scale+(name==='director'?0:ref.origin[axis]));
     check(stage[name+'Derivative' as 'baseDerivative'][axis],jets[axis].c[1]*ref.scale);
    }
   }
   const grid=native.grid[i].stages[j];
   for(let wIndex=0;wIndex<3;wIndex++){
    const w=1.5*wIndex,d=expected.director.map(x=>x.c[0]),ds=expected.base.map((x,axis)=>x.c[1]+w*expected.director[axis].c[1]),
     efg=[ds.reduce((sum,x)=>sum+x*x,0),ds.reduce((sum,x,axis)=>sum+x*d[axis],0),d.reduce((sum,x)=>sum+x*x,0)];
    for(let axis=0;axis<3;axis++){
     const point=expected.base[axis].c[0]+w*expected.director[axis].c[0];
     check(grid.normalizedPoints[wIndex][axis],point);check(grid.points[wIndex][axis],point*ref.scale+ref.origin[axis]);
     check(grid.EFG[wIndex][axis],efg[axis]*ref.scale*ref.scale);
    }
   }
  });
  const cuts=[0,row.stages[1].parameter,row.stages[2].parameter,3];
  check(cuts[1],Math.cos(row.s));check(cuts[2],1+Math.cos(row.s));
  if(cuts[1]-cuts[0]<Math.SQRT1_2-BOUND||cuts[2]-cuts[1]<1-BOUND||cuts[3]-cuts[2]<1-BOUND)fail('原切线次序不成立，未裁剪或补跨空白线。');
  cuts.forEach((v,c)=>curves[c].push(flatPoint('cylinder-symbolic',row.s,v)));
 });
 return {native,curves,maximumLiteralResidual};
}
function materialGraph(curves:Point[][]):{graph:FoldGraph;ids:string[]}{
 const s=curves[0].length,n=s-1,vertices_coords=curves.flat().map(clone),edges_vertices:[number,number][]=[],
  edges_assignment:string[]=[],edges_foldAngle:(number|null)[]=[],ids:string[]=[];
 const add=(a:number,b:number,k:'U'|'B',id:string)=>{edges_vertices.push([a,b]);edges_assignment.push(k);edges_foldAngle.push(k==='B'?0:null);ids.push(id);};
 for(let c=0;c<4;c++)for(let i=0;i<n;i++)add(c*s+i,c*s+i+1,c===0||c===3?'B':'U',`in4040-curve-${c}-${i}`);
 for(const i of [0,n])for(let c=0;c<3;c++)add(c*s+i,(c+1)*s+i,'B',`in4040-cap-${i}-${c}`);
 const range=(c:number)=>Array.from({length:s},(_,i)=>c*s+i),faces_vertices=Array.from({length:3},(_,c)=>[...range(c).reverse(),...range(c+1)]),
  edgeIndex=new Map(edges_vertices.map((e,i)=>[[...e].sort((a,b)=>a-b).join(','),i])),
  faces_edges=faces_vertices.map(face=>face.map((a,i)=>edgeIndex.get([a,face[(i+1)%face.length]].sort((a,b)=>a-b).join(','))!)),
  edges_faces=edges_vertices.map((_,e)=>faces_edges.flatMap((es,f)=>es.includes(e)?[f]:[])),
  faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(g=>g!==f)??null)) as unknown as number[][];
 if(faces_vertices.some(f=>polygonArea(f.map(v=>vertices_coords[v]))<=1e-10))fail('有限纸面退化或反向，未替换原坐标。');
 return {graph:{vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces},ids};
}
/** Identity millimetres, exactly three actual faces. Display rulings never enter the CP. */
export function planarRuledCP4040Document(value:unknown,rawNative:unknown):Doc{
 const recipe=validatePlanarRuledCP4040Recipe(value),{native,curves,maximumLiteralResidual}=verifiedNative(rawNative,recipe),{graph,ids}=materialGraph(curves),
  points=graph.vertices_coords,xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),
  doc:Doc={schemaVersion:2,name:'原 In[4040] 二维三面纸带 CP',paper:{width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},
   segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:clone(points[a]),b:clone(points[b]),assignment:graph.edges_assignment[i] as 'U'|'B',angle:graph.edges_foldAngle[i]}))};
 const material=createMaterialTopology(doc,graph,ids),actual=inspectMaterialTopology({...doc,metadata:{materialTopology:material}});
 if(!actual.ok||actual.components.length!==1||actual.components[0].boundaryLoops.length!==1)fail('三真实纸面须形成单部件、单闭合纸边。');
 const step=(recipe.parameterEnd-recipe.parameterStart)/recipe.segments;
 doc.metadata={materialTopology:material,originalPlanarRuled4040:{schema:SCHEMA,recipe,nativeSequence:clone(native),
  source:{inputCell:'In[4040]',sequenceDefinition:'In[4038]',numericalDefinition:'In[4042]',planarBase:'[0,u]',planarDirector:'[1,0]',
   planarMap:'[v,u]',cutFormulas:['0','cos(u)','1+cos(u)','3'],composeReflections:false,
   actualNativeCutParametersPreserved:true,coordinateUnit:'mm',coordinateTransform:'identity',originalCoordinateUnit:'unspecified',
   localCoordinateConvention:'1 original planar coordinate unit = 1 mm; no scaling or translation',
   originalDefinesMV:false,localChoices:['bounded end caps','linear chord sampling','U assignment'],previewRulingsAreCP:false},
  intrinsicDomain:{method:'explicit-coordinate-inverse',inverse:'(u,v)=(y,x)',jacobianDeterminant:-1,jacobianAbsoluteLowerBound:1,
   parameterRange:[recipe.parameterStart,recipe.parameterEnd],transverseRange:[0,3],cutGapLowerBounds:[Math.SQRT1_2,1,1],
   globallyInjective:true,boundarySimple:true,linearInterpolatedCutOrderVerified:true},
  sampling:{method:'actual-native-row-parameters-and-linear-chords',segments:recipe.segments,parameterStep:step,
   internalCurveChordErrorUpperBound:step*step/8,boundaryCurveChordErrorUpperBound:0,endCapChordErrorUpperBound:0,unit:'mm',exactContinuousCurve:false},
  topology:{vertices:4*(recipe.segments+1),edges:4*recipe.segments+6,faces:3,components:1,boundaryLoops:1,boundaryEdges:2*recipe.segments+6,
   unassignedCreases:2*recipe.segments,euler:1,vertexOrder:'curve 0, curve 1, curve 2, curve 3',edgeSegmentIds:ids,
   sourceCoordinatesUnaltered:true,coordinateWelding:false},
  numericalPolicy:{sourceCoordinateAbsoluteBoundMm:BOUND,derivedProofAbsoluteBound:BOUND,parametersIndicesIdentityExact:true,maximumLiteralResidual},
  evidence:{adoption:'explicit-cp-only',mountainValleyAssigned:false,flatFold:false,layerOrder:false,threeDimensionalInitialCondition:false,
   finiteRigidIsometryTo3D:false,continuousMotion:false,collisionFree:false}}};
 validateDoc(doc);return doc;
}
export async function fetchPlanarRuledCP4040Document(recipe:unknown,signal?:AbortSignal):Promise<Doc>{
 const r=validatePlanarRuledCP4040Recipe(recipe),native=await fetchNativePlanarSequenceWhenIdle(planarRuledCP4040Query(r),signal);
 return planarRuledCP4040Document(r,native);
}
export function readPlanarRuledCP4040Recipe(doc:Doc):PlanarRuledCP4040Recipe|null{
 try{const saved=doc.metadata?.originalPlanarRuled4040;if(!object(saved)||saved.schema!==SCHEMA)return null;return validatePlanarRuledCP4040Recipe(saved.recipe);}catch{return null;}
}
function same(a:unknown,b:unknown,path=''):boolean{
 if(typeof a==='number'&&typeof b==='number'){
  if(!finite(a)||!finite(b))return false;
  if(path==='numericalPolicy.maximumLiteralResidual')return a>=0&&a<=BOUND&&Math.abs(a-b)<=BOUND;
  if(/^materialTopology\.graph\.vertices_coords\.\d+\.[01]$/.test(path))return Math.abs(a-b)<=BOUND;
  return a===b;
 }
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&b.every((v,i)=>same(a[i],v,`${path}.${i}`));
 if(object(a)||object(b)){if(!object(a)||!object(b)||!keys(a,Object.keys(b)))return false;return Object.keys(b).every(k=>same(a[k],b[k],path?path+'.'+k:k));}
 return a===b;
}
function sameSegments(actual:Segment[],expected:Segment[]):boolean{
 if(actual.length!==expected.length||new Set(actual.map(s=>s.id)).size!==actual.length)return false;
 return expected.every(e=>{const a=actual.find(s=>s.id===e.id);return !!a&&a.assignment===e.assignment&&a.angle===e.angle&&
  a.a.length===2&&a.b.length===2&&distance(a.a,e.a)<=BOUND&&distance(a.b,e.b)<=BOUND;});
}
/** Checks the actual Doc before reconstructing an expected certificate. No silent repair. */
export function planarRuledCP4040SourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);const recipe=readPlanarRuledCP4040Recipe(doc),saved=doc.metadata?.originalPlanarRuled4040;
  if(!recipe||!object(saved)||Object.hasOwn(doc,'flatFold'))return false;
  const expected=planarRuledCP4040Document(recipe,saved.nativeSequence),actual=inspectMaterialTopology(doc),target=inspectMaterialTopology(expected);
  if(!actual.ok||!target.ok||actual.foldedVertices||actual.startingFace!==undefined||
     !same(saved,expected.metadata!.originalPlanarRuled4040)||!same(doc.metadata!.materialTopology,expected.metadata!.materialTopology,'materialTopology')||
     !same(actual.edgeSegmentIds,target.edgeSegmentIds)||!sameSegments(doc.segments,expected.segments)||!object(doc.paper)||!keys(doc.paper,['width','height']))return false;
  const points=doc.segments.flatMap(s=>[s.a,s.b]),current={width:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),
   height:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))};
  for(const key of ['width','height'] as const)if(!finite(doc.paper[key])||doc.paper[key]<=0||Math.abs(doc.paper[key]-expected.paper[key])>BOUND||Math.abs(doc.paper[key]-current[key])>BOUND)return false;
  const {vertices_coords:a,...ag}=actual.graph,{vertices_coords:b,...bg}=target.graph;
  return same(ag,bg)&&a.length===b.length&&a.every((p,i)=>distance(p,b[i])<=BOUND);
 }catch{return false;}
}
