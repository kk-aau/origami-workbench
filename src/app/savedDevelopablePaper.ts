/** Finite paper outlines of the original saved cone/cylinder surfaces. No added crease. */
import {reshapeSurface,validateReshapeParams} from './curvedGenericCylinderReshape';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type FoldGraph,type Point} from '../core/types';

export type SavedDevelopablePaperRecipe=
 | {model:'cone-flatten';angleDeg:number;parameterEnd:number;transverseStart:number;transverseEnd:number;curveSegments:number;unitSizeMm:number}
 | {model:'flatten-cylinder'|'curl-plane';parameterEnd:number;rulingWidth:number;curveSegments:number;unitSizeMm:number};
export const SAVED_DEVELOPABLE_PAPER_NAMESPACE='originalSavedDevelopablePaper';
export const SAVED_DEVELOPABLE_PAPER_SCHEMA='original-in3886-in3891-in3892-paper-outline-v1';
const NS=SAVED_DEVELOPABLE_PAPER_NAMESPACE,SCHEMA=SAVED_DEVELOPABLE_PAPER_SCHEMA,NB_SHA='19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9';
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),object=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),keys=(x:Record<string,any>,names:string[])=>Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const same=(a:unknown,b:unknown):boolean=>Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v)):object(b)?object(a)&&keys(a,Object.keys(b))&&Object.keys(b).every(k=>same(a[k],b[k])):a===b;
function fail(message:string):never{throw Error(message);}
export function validateSavedDevelopablePaperRecipe(raw:unknown):SavedDevelopablePaperRecipe{
 if(!object(raw)||!finite(raw.unitSizeMm)||raw.unitSizeMm<.001||raw.unitSizeMm>10000)fail('纸形须含显式 0.001–10000 mm 源单位，不自动缩放或镜像。');
 if(raw.model==='cone-flatten'){
  if(!keys(raw,['model','angleDeg','parameterEnd','transverseStart','transverseEnd','curveSegments','unitSizeMm'])||!finite(raw.angleDeg)||raw.angleDeg<15||raw.angleDeg>60||!finite(raw.parameterEnd)||raw.parameterEnd<.01||raw.parameterEnd>Math.PI||!finite(raw.transverseStart)||!finite(raw.transverseEnd)||raw.transverseStart< -1||raw.transverseEnd>1||raw.transverseEnd-raw.transverseStart<.001||!Number.isInteger(raw.curveSegments)||raw.curveSegments<16||raw.curveSegments>256)fail('圆锥纸形只取原 u∈[0,π]、v∈[-1,1] 保存域；锥半角 15°–60°、段数 16–256。');
 }else if(raw.model==='flatten-cylinder'||raw.model==='curl-plane'){
  if(!keys(raw,['model','parameterEnd','rulingWidth','curveSegments','unitSizeMm']))fail('柱面纸形参数包含未知字段或缺失字段。');
  validateReshapeParams({mode:raw.model,parameterEnd:raw.parameterEnd,rulingWidth:raw.rulingWidth,curveSegments:raw.curveSegments});
 }else fail('请选择原圆锥展开、柱面展平或平面卷柱保存例。');
 return structuredClone(raw) as SavedDevelopablePaperRecipe;
}
export function savedDevelopablePaperPreset(model:SavedDevelopablePaperRecipe['model']='cone-flatten'):SavedDevelopablePaperRecipe{
 if(model==='cone-flatten')return {model,angleDeg:30,parameterEnd:Math.PI,transverseStart:-1,transverseEnd:1,curveSegments:32,unitSizeMm:100};
 if(model==='flatten-cylinder'||model==='curl-plane')return {model,parameterEnd:Math.PI,rulingWidth:1,curveSegments:32,unitSizeMm:100};
 return fail('未知原保存纸形。');
}

type PrimitiveCall={op:'sin'|'cos';args:[number];value:number};
type ArithmeticTrace={schema:'saved-developable-libm-trace-v1';recipeKey:string;maximumCalls:65536;maximumRelativeEPS:16;calls:PrimitiveCall[]};
/** Only derived sin/cos values get a fixed libm comparison. Geometry/input equality is exact. */
function arithmetic(recipe:SavedDevelopablePaperRecipe,raw?:unknown){
 const recipeKey=JSON.stringify(recipe),calls:PrimitiveCall[]=[];let saved:PrimitiveCall[]|undefined,index=0;
 if(raw!==undefined){if(!object(raw)||!keys(raw,['schema','recipeKey','maximumCalls','maximumRelativeEPS','calls'])||raw.schema!=='saved-developable-libm-trace-v1'||raw.recipeKey!==recipeKey||raw.maximumCalls!==65536||raw.maximumRelativeEPS!==16||!Array.isArray(raw.calls)||raw.calls.length>65536)fail('原纸形算术追踪或固定预算不一致。');saved=raw.calls;}
 const invoke=(op:'sin'|'cos',argument:number)=>{
  if(index>=65536||!finite(argument))fail('纸形源算术超预算或包含非有限输入。');const fresh=Math[op](argument);let value=fresh;
  if(saved){const row=saved[index];if(!object(row)||!keys(row,['op','args','value'])||row.op!==op||!same(row.args,[argument])||!finite(row.value))fail('原函数调用顺序或字面输入改变。');value=row.value;
   const identity=fresh===0||Math.abs(fresh)===1,tolerance=16*Number.EPSILON*Math.max(Number.MIN_VALUE,Math.abs(fresh),Math.abs(value));if(identity?value!==fresh:Math.abs(value-fresh)>tolerance)fail('原 sin/cos 派生值超出固定工程 roundoff 范围。');if(Math.abs(value)>1)fail('原 sin/cos 值超出实数范围。');}
  calls.push({op,args:[argument],value});index++;return value;
 };
 return {sin:(x:number)=>invoke('sin',x),cos:(x:number)=>invoke('cos',x),finish:():ArithmeticTrace=>{if(saved&&index!==saved.length)fail('源算术追踪包含未使用调用。');return {schema:'saved-developable-libm-trace-v1',recipeKey,maximumCalls:65536,maximumRelativeEPS:16,calls};}};
}

function finiteCoverage(vertices:Point[],triangles:number[][],internal:[number,number][]){
 const view=new DataView(new ArrayBuffer(8)),dyadic=(x:number):[bigint,number]=>{if(!finite(x))fail('纸边包含非有限坐标。');if(x===0)return [0n,0];view.setFloat64(0,x);const b=view.getBigUint64(0),power=Number((b>>52n)&2047n);let v=(b&((1n<<52n)-1n))+(power?1n<<52n:0n),e=power?power-1075:-1074;if(b>>63n)v=-v;while(v&&v%2n===0n){v/=2n;e++;}return [v,e];},ratios=vertices.map(p=>p.map(dyadic)),exponent=Math.min(...ratios.flat().filter(([v])=>v!==0n).map(([,e])=>e)),p=ratios.map(row=>row.map(([v,e])=>v<<BigInt(e-exponent))),n=vertices.length,
  cross=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[b][1]-p[a][1])*(p[c][0]-p[a][0]),dot=(a:number,b:number,c:number)=>(p[b][0]-p[a][0])*(p[c][0]-p[a][0])+(p[b][1]-p[a][1])*(p[c][1]-p[a][1]),on=(a:number,b:number,c:number)=>cross(a,b,c)===0n&&[0,1].every(k=>p[c][k]>=(p[a][k]<p[b][k]?p[a][k]:p[b][k])&&p[c][k]<=(p[a][k]>p[b][k]?p[a][k]:p[b][k])),sign=(v:bigint)=>v<0n?-1:v>0n?1:0;
 if(new Set(vertices.map(p=>p.join(','))).size!==n)fail('不同纸边身份坐标重合；没有近点合并或焊接。');
 const area=vertices.reduce((v,_,i)=>v+cross(0,i,(i+1)%n),0n),triangleArea=triangles.reduce((v,[a,b,c])=>{const s=cross(a,b,c);if(s<=0n)fail('有限纸形包含零面积或反向验证小面。');return v+s;},0n);if(area<=0n||triangleArea!==area)fail('验证分区没有单次完整覆盖实际纸形。');
 const edges:[number,number][]=vertices.map((_,i)=>[i,(i+1)%n]);for(const e of internal)if(!edges.some(p=>p[0]===e[0]&&p[1]===e[1]||p[0]===e[1]&&p[1]===e[0]))edges.push(e);
 if(edges.length*(edges.length-1)/2>2000000)fail('纸形验证超过 2M 边对预算。');let pairs=0,sharedPairs=0;
 const boxes=edges.map(([a,b])=>[Math.min(vertices[a][0],vertices[b][0]),Math.max(vertices[a][0],vertices[b][0]),Math.min(vertices[a][1],vertices[b][1]),Math.max(vertices[a][1],vertices[b][1])]);
 for(let i=0;i<edges.length;i++)for(let j=0;j<i;j++){
  const [a,b]=edges[i],[c,d]=edges[j],v=a===c||a===d?a:b===c||b===d?b:undefined;
  if(v!==undefined){sharedPairs++;const x=a===v?b:a,y=c===v?d:c;if(cross(v,x,y)===0n&&dot(v,x,y)>0n)fail('纸形分区共有顶点的边同射线重叠。');continue;}
  if(boxes[i][1]<boxes[j][0]||boxes[j][1]<boxes[i][0]||boxes[i][3]<boxes[j][2]||boxes[j][3]<boxes[i][2])continue;pairs++;
  if(sign(cross(a,b,c))*sign(cross(a,b,d))<0&&sign(cross(c,d,a))*sign(cross(c,d,b))<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))fail('纸形出现非相邻交叉、接触或重叠；没有移动或删除边。');
 }
 return {arithmetic:'exact binary64 dyadic signs and exact area coverage',vertices:n,paperBoundaryEdges:n,logicalFaces:1,proofTriangles:triangles.length,proofEdges:edges.length,testedOverlappingBoxPairs:pairs,sharedPairs,exactDoubledArea:area.toString(),exactAreaExponent:2*exponent-1,exactSingleCoverage:true,trianglesAreCPEdges:false,rulingsAreCPEdges:false,coordinateWelding:false,maximumEdgePairs:2000000};
}

function source(recipe:SavedDevelopablePaperRecipe,rawTrace?:unknown){
 const math=arithmetic(recipe,rawTrace),unit=recipe.unitSizeMm,triangles:number[][]=[],internal:[number,number][]=[];let raw:Point[],sourceSamples:Record<string,unknown>;
 if(recipe.model==='cone-flatten'){
  const r=recipe,n=r.curveSegments,parameters=Array.from({length:n+1},(_,i)=>i===n?r.parameterEnd:r.parameterEnd*i/n),a=math.sin(r.angleDeg*Math.PI/180),c=math.cos(r.angleDeg*Math.PI/180),
   point=(u:number,v:number)=>{const radius=1-v;return {flat:[radius*math.cos(a*u),radius*math.sin(a*u)] as Point,space:[radius*c,-radius*a*math.cos(u),radius*a*math.sin(u)] as [number,number,number]};},outer=parameters.map(u=>point(u,r.transverseStart)),inner=parameters.map(u=>point(u,r.transverseEnd)),base=parameters.map(u=>point(u,0)),apex=r.transverseEnd===1;
  if(apex&&inner.some(p=>p.flat.some(v=>v!==0)||p.space.some(v=>v!==0)))fail('原 v=1 锥尖不是同一精确顶点。');
  raw=apex?[...outer.map(p=>p.flat),[0,0]]:[...outer.map(p=>p.flat),...inner.map(p=>p.flat).reverse()];
  for(let i=0;i<n;i++)if(apex){triangles.push([n+1,i,i+1]);if(i>0)internal.push([n+1,i]);}else{const x=2*n+1-i,y=x-1;triangles.push([i,i+1,y],[i,y,x]);internal.push([i,y]);if(i>0)internal.push([i,x]);}
  sourceSamples={parameterValues:parameters,outer,inner,base,sinTheta:a,cosTheta:c,apexIdentity:apex?'original literal v=1 maps to the single cone vertex; no distance-based welding':null};
 }else{
  const params=validateReshapeParams({mode:recipe.model,parameterEnd:recipe.parameterEnd,rulingWidth:recipe.rulingWidth,curveSegments:recipe.curveSegments}),stage=recipe.model==='flatten-cylinder'?'target':'source',uv:[[number,number],[number,number],[number,number],[number,number]]=[[0,0],[params.parameterEnd,0],[params.parameterEnd,params.rulingWidth],[0,params.rulingWidth]],points=uv.map(([u,v])=>reshapeSurface(params,stage,u,v));
  if(points.some(p=>p[2]!==0))fail('原柱面保存例的指定纸面不是 XY 平面；没有采用三维投影。');raw=points.map(([x,y])=>[x,y]);triangles.push([0,1,2],[0,2,3]);internal.push([0,2]);sourceSamples={cornerParameters:uv,flatStage:stage,flatPoints:points,plane:'original XY plane z=0; no projection'};
 }
 const vertices=raw.map(p=>p.map(x=>x*unit) as Point),proof=finiteCoverage(vertices,triangles,internal);return {vertices,proof,sourceSamples,arithmeticTrace:math.finish()};
}
function build(recipe:SavedDevelopablePaperRecipe,rawTrace?:unknown):Doc{
 const result=source(recipe,rawTrace),vertices_coords=result.vertices,n=vertices_coords.length,edges_vertices:[number,number][]=vertices_coords.map((_,i)=>[i,(i+1)%n]),ids=vertices_coords.map((_,i)=>'saved-paper-boundary-'+i),graph:FoldGraph={vertices_coords,edges_vertices,edges_assignment:vertices_coords.map(()=>'B'),edges_foldAngle:vertices_coords.map(()=>0),faces_vertices:[vertices_coords.map((_,i)=>i)],faces_edges:[vertices_coords.map((_,i)=>i)],edges_faces:vertices_coords.map(()=>[0]),faces_faces:[vertices_coords.map(()=>null)] as unknown as number[][]},x=vertices_coords.map(p=>p[0]),y=vertices_coords.map(p=>p[1]),cone=recipe.model==='cone-flatten';
 const own={schema:SCHEMA,recipe:structuredClone(recipe),arithmeticTrace:result.arithmeticTrace,sourceSamples:result.sourceSamples,finiteProof:result.proof,source:{notebookSHA256:NB_SHA,functions:cone?['FlattenGeneric2D','NFlattenGeneric2D']:['ReshapeGeneric3D','NReshapeGeneric3D'],definitionCells:cone?['In[3882]','In[3885]']:['In[3890]','In[3895]'],savedCells:cone?['In[3886]']:recipe.model==='flatten-cylinder'?['In[3891]','In[3896]']:['In[3892]','In[3897]'],fixedInitial:cone?{parameter:0,point:[1,0],unitTangent:[0,1],sigma:1}:{parameter:0,point:[0,0,0],director:[0,1,0],unitTangent:[1,0,0],sigma:1,targetNormalCurvature:recipe.model==='flatten-cylinder'?0:1},originalWholeDomain:cone?{u:[0,Math.PI],v:[-1,1]}:{u:[0,Math.PI],v:[0,1]},sourceUnitUnspecified:true,unitConvention:'original planar source coordinates multiplied by explicit unitSizeMm exactly once',coordinateTranslation:false,coordinateMirror:false,coordinateSnapping:false,newCreases:false,sharedSeamAdded:false},
  sampling:{paperOutlineOnly:true,curvedBoundary:cone,finiteChordApproximation:cone,outerArcIsExactCurve:false,sourceBaseCurveIsCrease:false,trianglesAreCreases:false,rulingsAreCreases:false},
  numericPolicy:{sourceArithmetic:'persistent sin/cos primitive trace with exact scalar replay; original cylinder plane corners directly reused',primitiveComparisonMaximumRelativeEPS:16,primitiveMaximumCalls:65536,zeroAndUnitTrigonometricIdentitiesExact:true,geometryToleranceApplied:false,inputAndIndexedGeometryExact:true,intervalIntegrationCertificate:false},
  scope:{adoption:'paper outline only; all B/0; no new folding creases',originalSavedAnalyticSubdomain:true,originalSavedParameters:cone?recipe.angleDeg===30&&recipe.parameterEnd===Math.PI&&recipe.transverseStart===-1&&recipe.transverseEnd===1:recipe.parameterEnd===Math.PI&&recipe.rulingWidth===1,machineReadableWolframOutReproduced:false,finiteSampledPaperSingleCoverageVerified:true,sourceConeApexParameterSingular:cone&&recipe.transverseEnd===1,continuousSurfaceSceneAttached:false,continuousSourceReferenceOnly:true,rigidFlatFoldCertified:false,layerOrderCertified:false,continuousMotionCertified:false,realMachineVerified:false}};
 const doc:Doc={schemaVersion:2,name:cone?'原圆锥展开纸形':recipe.model==='flatten-cylinder'?'原柱面展平纸形':'原平面卷柱纸形',paper:{width:Math.max(...x)-Math.min(...x),height:Math.max(...y)-Math.min(...y)},objects:[],segments:edges_vertices.map(([a,b],i)=>({id:ids[i],a:[...vertices_coords[a]],b:[...vertices_coords[b]],assignment:'B',angle:0})),metadata:{[NS]:own}};validateDoc(doc);doc.metadata!.materialTopology=createMaterialTopology(doc,graph,ids);return doc;
}
export function savedDevelopablePaperDocument(input:unknown):Doc{return build(validateSavedDevelopablePaperRecipe(input));}
export function readSavedDevelopablePaperRecipe(doc:Doc):SavedDevelopablePaperRecipe|null{try{const own=doc.metadata?.[NS];return object(own)&&own.schema===SCHEMA?validateSavedDevelopablePaperRecipe(own.recipe):null;}catch{return null;}}
export function savedDevelopablePaperSourceMatches(doc:Doc):boolean{try{validateDoc(doc);const recipe=readSavedDevelopablePaperRecipe(doc),own=doc.metadata?.[NS],topology=inspectMaterialTopology(doc);if(!recipe||!object(own)||!topology.ok||topology.foldedVertices||topology.startingFace!==undefined||Object.hasOwn(doc,'flatFold'))return false;const expected=build(recipe,own.arithmeticTrace);return same(doc.paper,expected.paper)&&(doc.objects===undefined||same(doc.objects,expected.objects))&&same(doc.segments,expected.segments)&&same(own,expected.metadata![NS])&&same(doc.metadata!.materialTopology,expected.metadata!.materialTopology);}catch{return false;}}
function freeze(v:any):void{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}}
export function prepareSavedDevelopablePaperPreview(input:unknown){const recipe=validateSavedDevelopablePaperRecipe(input),doc=build(recipe),own=doc.metadata![NS] as {arithmeticTrace:ArithmeticTrace;sourceSamples:Record<string,unknown>},trace=structuredClone(own.arithmeticTrace);freeze(recipe);freeze(trace);return {key:JSON.stringify(recipe),recipe,doc,sourceSamples:structuredClone(own.sourceSamples),build:(next:unknown=recipe)=>{if(!same(validateSavedDevelopablePaperRecipe(next),recipe))fail('参数已经变化，旧纸形预览不能采用。');return build(recipe,trace);}};}
