import {buildDiagramFold,buildFold,distance,epsilonFor,pointOnSegment,polygonArea,splitIntersections} from '../core/geometry';
import {hasMaterialTopology} from '../core/materialTopology';
import {applyRigidFoldTransform,solveRigidFoldGeometry,type RigidFoldTransform3D} from '../core/rigidFoldGeometry';
import {validateDoc,type Doc,type Point,type Segment,type FlatFoldResult} from '../core/types';
import {prepareSimulationDocument} from '../engine/simmodel';
import {simulationSourceSignature} from '../engine/simLayerOrder';
import {validateSimulationStepAnimationStructure,type SimulationStepAnimation} from '../engine/simStepAnimation';
import {adjacentSimulationStepFoldedEdges,switchSimulationStepPrecreaseEdges} from '../engine/simStepRefold';
import {buildDiagramPoseFold} from './diagramFoldGeometry';
import {diagramAnimationSourceSegments,diagramAnimationMaterialTimings} from './diagramAnimationTiming';
import {inferDiagramPrecreaseActions} from './diagramInferredPrecrease';
import {mapDiagramFoldLines} from './diagramFoldLink';
import type {DiagramLineAnnotation} from './diagramAnnotations';
import {defaultModelColors} from './modelColors';
import {resolveStartingFace} from './flatFoldSettings';
import {hasNonFlatFoldAngles,liftDiagramFoldMatrix,projectDiagramSpatialPoint,validateDiagramSpatialPose,diagramSpatialContactOrders} from './diagramSpatialPose';
import type {DiagramFoldMatrix} from './diagramFoldLinkTypes';
import type {DiagramPose,DiagramProject} from './diagramProject';
import type {DiagramStepAnimationClip} from './diagramStepAnimation';

type Route={segment:Segment;fromAngle:number;toAngle:number;viaAngle?:number};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const covers=(line:Pick<Segment,'a'|'b'>,segment:Pick<Segment,'a'|'b'>,eps:number)=>{const edge:Segment={...segment,id:'source-edge',assignment:'F',angle:0};return pointOnSegment(line.a,edge,eps)&&pointOnSegment(line.b,edge,eps);};
const distance3=(a:readonly number[],b:readonly number[])=>Math.hypot(...a.map((n,i)=>n-b[i]));
function angle(segment:Segment):number {
  if(['B','A','F'].includes(segment.assignment))return 0;
  if(segment.assignment==='U'||segment.angle===null)throw Error('步骤动画需要明确的山谷折类型和折角，请先处理未赋型或未知折角。');
  return segment.angle;
}
function containing(point:Point,polygon:Point[],eps:number,strict=false):boolean {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i];
    if(pointOnSegment(point,{a,b,id:'boundary',assignment:'B',angle:0},eps))return !strict;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function liftedFlatFace(source:Point[],target:Point[],face:number[],eps:number):RigidFoldTransform3D {
  const a=face[0],b=face.find(v=>distance(source[a],source[v])>eps);
  const cross=(u:Point,v:Point)=>u[0]*v[1]-u[1]*v[0],sub=(u:Point,v:Point):Point=>[u[0]-v[0],u[1]-v[1]];
  const c=b===undefined?undefined:face.find(v=>Math.abs(cross(sub(source[b],source[a]),sub(source[v],source[a])))>eps*distance(source[b],source[a]));
  if(b===undefined||c===undefined)throw Error('步骤动画不能使用退化纸面。');
  const u=sub(source[b],source[a]),v=sub(source[c],source[a]),s=sub(target[b],target[a]),t=sub(target[c],target[a]),d=cross(u,v);
  const m:DiagramFoldMatrix=[(s[0]*v[1]-t[0]*u[1])/d,(s[1]*v[1]-t[1]*u[1])/d,(t[0]*u[0]-s[0]*v[0])/d,(t[1]*u[0]-s[1]*v[0])/d,0,0];
  m[4]=target[a][0]-m[0]*source[a][0]-m[2]*source[a][1];m[5]=target[a][1]-m[1]*source[a][0]-m[3]*source[a][1];
  const transform=liftDiagramFoldMatrix(m);
  if(Math.abs(Math.hypot(m[0],m[1])-1)>1e-7||Math.abs(Math.hypot(m[2],m[3])-1)>1e-7||Math.abs(m[0]*m[2]+m[1]*m[3])>1e-7||face.some(v=>distance3(applyRigidFoldTransform(transform,source[v]),[...target[v],0])>eps*20))throw Error('纸面经过非等距扯角，请恢复真实姿态后生成步骤动画。');
  return transform;
}

/** Both endpoints are physical 3D poses. Camera projection is never a material
 * coordinate, rest length, or flat-layer certificate. The normal planner still
 * certifies a path separately; a compatible endpoint alone is not reachability. */
export function buildDiagramSpatialStepAnimation(project:DiagramProject,stepId:string,options:{bendable?:boolean;allowStill?:boolean}={}):DiagramStepAnimationClip {
  const bendable=options.bendable===true;
  const step=project.steps.find(s=>s.id===stepId);if(!step)throw Error('找不到要播放的折序步骤。');
  const before=project.states.find(s=>s.id===step.beforeId),after=project.states.find(s=>s.id===step.afterId);
  if(!before||!after)throw Error('步骤前后 CP 不完整，无法生成动画。');
  validateDoc(before.doc);validateDoc(after.doc);
  if(hasMaterialTopology(before.doc)||hasMaterialTopology(after.doc))throw Error('步骤动画暂不支持材料切口、多张纸或带孔模型。');
  if(!same(before.doc.paper,after.doc.paper))throw Error('步骤动画要求操作前后使用相同的纸张尺寸和边界。');
  const eps=Math.max(epsilonFor(before.doc),epsilonFor(after.doc)),pose:DiagramPose|undefined=step.paperStates?.spatial??step.paperStates?.flat??step.pose??undefined;
  if(pose&&(pose.sourceStateId!==before.id||pose.sourceRevision!==before.revision||!same(pose.sourceDoc,before.doc)))throw Error('操作前 CP 已变化，请重新计算操作前折图后再播放动画。');
  const source=pose?buildDiagramPoseFold(pose).graph:buildDiagramFold(before.doc).graph;
  if(!source.faces_vertices?.length||source.faces_holes?.some(r=>r.length))throw Error('步骤动画需要连续、无孔的单张纸面。');
  const polygons=source.faces_vertices.map(face=>face.map(v=>source.vertices_coords[v]));
  let transforms:RigidFoldTransform3D[],actualAngles:(number|null)[],root:number;
  if(pose?.spatial){
    validateDiagramSpatialPose(pose,true);
    transforms=pose.spatial.faceTransforms;actualAngles=pose.spatial.measuredAngles;root=pose.result.geometry.startingFace??0;
  }else if(pose){
    if(hasNonFlatFoldAngles(before.doc))throw Error('操作前含部分折角，但当前快照仍为平面折图，请重新计算真实空间姿态后播放。');
    if(!same(source.faces_vertices,pose.result.geometry.faces))throw Error('操作前纸面身份已变化，请重新计算折图。');
    transforms=source.faces_vertices.map(face=>liftedFlatFace(source.vertices_coords,pose.result.geometry.vertices,face,eps));
    actualAngles=source.edges_foldAngle;root=pose.result.geometry.startingFace??0;
  }else{
    root=resolveStartingFace(before.doc,source).face;
    const solved=solveRigidFoldGeometry(source,{startingFace:root});
    if(solved.status!=='ready')throw Error('操作前 CP 无法生成真实折角姿态：'+solved.message);
    transforms=solved.faceTransforms;actualAngles=solved.measuredAngles;
  }
  const raw=[...before.doc.segments,...after.doc.segments].filter(s=>s.assignment!=='A');
  let authored=step.foldLink?.precreases??[];
  const explicitPartialPresses=(step.annotations??[]).filter((a):a is DiagramLineAnnotation=>a.kind==='line'&&a.foldAction==='precrease'&&a.foldAngle!==undefined&&a.foldAngle!==180&&a.foldFaces?.length!==0);
  // A manually imported annotation may predate its CP intent ledger. An
  // explicit 90° press must not fall through to the legacy 180° inference.
  if(!authored.length&&explicitPartialPresses.length&&step.foldLink?.enabled!==false){
    if(!pose)throw Error('请先计算操作前姿态，再播放已标注角度的预折动作。');
    authored=explicitPartialPresses.flatMap(line=>mapDiagramFoldLines(pose,[line],line.foldFaces?{enabled:true,layers:'selected',selectedFaces:line.foldFaces}:step.foldLink??{enabled:true,layers:'all',selectedFaces:[]},before).precreases);
  }
  const inferred=authored.length?[]:inferDiagramPrecreaseActions(before.doc,after.doc),precreases=[...authored,...inferred];
  if(raw.length+precreases.length>4000)throw Error('步骤动画预览暂限操作前后合计 4,000 条材料线段，请简化本步折痕。');
  raw.forEach(angle);
  precreases.forEach(s=>{if(!['M','V'].includes(s.assignment)||!Number.isFinite(s.angle)||s.angle===null||Math.abs(s.angle)>180||s.assignment==='M'&&s.angle>0||s.assignment==='V'&&s.angle<0)throw Error('预折动作需要明确且有效的山谷方向和折角。');});
  const geometry:Doc={name:'空间步骤动画材料',paper:before.doc.paper,segments:[...raw,...precreases].map((s,i)=>({...s,id:`animation-route-${i}`,assignment:s.assignment==='B'?'B':'F',angle:0}))};
  const planar=splitIntersections(geometry).segments;
  const sourceAngle=(part:Segment,expected:number)=>{
    if(!expected)return 0;
    const matches=source.edges_vertices.flatMap(([a,b],e)=>covers(part,{a:source.vertices_coords[a],b:source.vertices_coords[b]},eps)?[e]:[]);
    if(!matches.length)throw Error('操作前折痕缺少实际纸面铰链，请重新计算姿态。');
    const measured=matches.map(e=>actualAngles[e]);
    if(measured.some(a=>a===null||Math.abs(a-expected)>1e-5))throw Error('操作前实际折角与 CP 记录不一致，请重新计算姿态。');
    return measured[0]!;
  };
  const routes:Route[]=planar.map((segment,index)=>{
    const from=before.doc.segments.filter(s=>s.assignment!=='A'&&covers(segment,s,eps)),to=after.doc.segments.filter(s=>s.assignment!=='A'&&covers(segment,s,eps));
    if(segment.assignment==='B'){
      if(!from.some(s=>s.assignment==='B')||!to.some(s=>s.assignment==='B'))throw Error('步骤动画暂不支持更改纸张边界或新增切口。');
      return {segment:{...segment,id:`animation-edge-${index}`},fromAngle:0,toAngle:0};
    }
    const semantics=(segments:Segment[])=>{const values=[...new Set(segments.map(angle))];if(values.length>1)throw Error('CP 中存在重叠赋型冲突，请先处理后生成动画。');return values[0]??0;};
    const fromAngle=sourceAngle(segment,semantics(from)),toAngle=semantics(to);
    if(fromAngle*toAngle<0)throw Error('同一折痕从山折直接反转为谷折的动作暂不支持，请拆成展开和再折两步。');
    const pending=[...new Set(precreases.filter(s=>covers(segment,s,eps)).map(angle))];
    if(pending.length>1)throw Error('同一预折痕具有不同的折叠角度或方向，请明确属性。');
    const viaAngle=fromAngle===0&&toAngle===0?pending[0]:Math.abs(fromAngle-toAngle)<1e-5&&fromAngle!==0&&pending.some(a=>Math.abs(a-fromAngle)<1e-5)?0:undefined;
    return {segment:{...segment,id:`animation-edge-${index}`,assignment:toAngle<0?'M':toAngle>0?'V':'F',angle:toAngle},fromAngle,toAngle,...(viaAngle!==undefined?{viaAngle}:{})};
  });
  const moving=(r:{fromAngle:number;toAngle:number;viaAngle?:number})=>Math.abs(r.fromAngle-r.toAngle)>1e-5||r.viaAngle!==undefined&&Math.abs(r.viaAngle-r.fromAngle)>1e-5;
  if(!options.allowStill&&!routes.some(moving))throw Error('这一步没有实际折叠变化或带方向的预折动作；绘图符号与已有折痕不产生折叠动画。');
  const union:Doc={name:project.name,paper:before.doc.paper,segments:routes.map(r=>r.segment)},materialFold=buildFold(union).graph;
  if(!materialFold.faces_vertices?.length||materialFold.faces_holes?.some(r=>r.length))throw Error('步骤动画需要连续、无孔的单张纸面。');
  const base=prepareSimulationDocument(materialFold),warnings=[...base.warnings];
  const prepared=base.prepared;
  const fold=materialFold;
  if(bendable)warnings.push('本步使用原始网格允许纸面弯曲；固定所选纸面，姿态由数值求解生成。');
  if(prepared.vertexCount>1200||prepared.faceCount>2400)throw Error('步骤动画预览暂限 1,200 个顶点和 2,400 个三角片，请简化本步折痕。');
  const cp=prepared.fold.vertices_coords.map((p):Point=>[p[0],-p[2]]);
  const shown=cp.map(point=>{
    const owners=polygons.flatMap((polygon,f)=>containing(point,polygon,eps)?[f]:[]);
    if(!owners.length)throw Error('新增网格顶点超出操作前纸张，无法保持材料对应。');
    const mapped=owners.map(f=>applyRigidFoldTransform(transforms[f],point));
    if(mapped.some(p=>distance3(p,mapped[0])>eps*20))throw Error('操作前纸面不连续，无法为新增折痕建立一致起态。');
    return mapped[0];
  });
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let v=0;v<prepared.vertexCount;v++)for(let k=0;k<3;k++){min[k]=Math.min(min[k],prepared.originalPositions[v*3+k]);max[k]=Math.max(max[k],prepared.originalPositions[v*3+k]);}
  const center=min.map((n,k)=>(n+max[k])/2);let radius=0;
  for(let v=0;v<prepared.vertexCount;v++)radius=Math.max(radius,Math.hypot(...center.map((n,k)=>prepared.originalPositions[v*3+k]-n)));
  if(radius<=1e-6)throw Error('纸张尺寸过小，无法生成稳定步骤动画。');
  const initialPositions=shown.flatMap(p=>[(p[0]-center[0])/radius,(p[2]-center[1])/radius,(-p[1]-center[2])/radius]);
  const ranges:SimulationStepAnimation['ranges']=prepared.creaseParams.map(crease=>{
    const [a,b]=prepared.edgesVertices[crease.edge],route=routes.find(r=>covers({a:cp[a],b:cp[b]},r.segment,eps));
    return {edge:crease.edge,fromAngle:route?.fromAngle??0,toAngle:route?.toAngle??0,...(route?.viaAngle!==undefined?{viaAngle:route.viaAngle}:{})};
  });
  for(const route of routes.filter(moving)){
    const covered=ranges.filter(r=>{const [a,b]=prepared.edgesVertices[r.edge];return covers({a:cp[a],b:cp[b]},route.segment,eps);});
    const length=covered.reduce((sum,r)=>{const [a,b]=prepared.edgesVertices[r.edge];return sum+distance(cp[a],cp[b]);},0);
    if(Math.abs(length-distance(route.segment.a,route.segment.b))>eps*20)throw Error('部分折角动作包含未贯穿纸面的短痕，当前刚性网格不能完整驱动；请延伸至实际纸边或拆分步骤。');
  }
  const unionPolygons=materialFold.faces_vertices.map(face=>face.map(v=>materialFold.vertices_coords[v])),fixed=step.foldLink?.fixed;
  let fixedFace:number;
  if(fixed){
    const hits=unionPolygons.flatMap((polygon,f)=>containing(fixed.point,polygon,eps,true)?[f]:[]);
    if(hits.length===1)fixedFace=hits[0];
    else{
      const oldInterior=polygons.filter(polygon=>containing(fixed.point,polygon,eps,true)).length===1;
      const touching=oldInterior&&!routes.some(r=>moving(r)&&pointOnSegment(fixed.point,r.segment,eps))?unionPolygons.flatMap((polygon,f)=>containing(fixed.point,polygon,eps)?[f]:[]):[];
      if(!touching.length)throw Error('固定点落在本步折痕或纸边，请在固定侧内部重新指定。');
      fixedFace=touching[0];
    }
  }else{
    const candidates=unionPolygons.map((polygon,f)=>({f,area:Math.abs(polygonArea(polygon)),old:polygons[root]&&polygon.every(p=>containing(p,polygons[root],eps))}));
    candidates.sort((a,b)=>Number(b.old)-Number(a.old)||b.area-a.area||a.f-b.f);fixedFace=candidates[0].f;
    warnings.push('未指定固定侧，预览自动固定原起始纸面中的最大区域。');
  }
  const fixedSeedTriangles=prepared.facesVertices.flatMap((_,f)=>prepared.triangleSourceFaces?.[f]===fixedFace?[f]:[]);
  const fixedSeedVertices=[...new Set(fixedSeedTriangles.flatMap(f=>prepared.facesVertices[f]))];
  const changingEdges=new Set(ranges.filter(moving).map(r=>r.edge));
  const neighbours=new Set([...adjacentSimulationStepFoldedEdges(prepared,{ranges}),...switchSimulationStepPrecreaseEdges(prepared,{ranges,initialPositions})]);
  const adjacency=prepared.facesVertices.map(()=>[] as number[]);
  prepared.edgesFaces.forEach((owners,e)=>{if(owners.length!==2||changingEdges.has(e)||neighbours.has(e))return;const [a,b]=owners;adjacency[a].push(b);adjacency[b].push(a);});
  const regionOf=prepared.facesVertices.map(()=>-1),regions:number[][]=[];
  for(let f=0;f<regionOf.length;f++)if(regionOf[f]<0){const id=regions.length,region:number[]=[],todo=[f];regionOf[f]=id;while(todo.length){const face=todo.pop()!;region.push(face);for(const next of adjacency[face])if(regionOf[next]<0){regionOf[next]=id;todo.push(next);}}regions.push(region);}
  for(const edge of changingEdges){
    const [a,b]=prepared.edgesFaces[edge];
    if(a===undefined||b===undefined)throw Error('本步活动折痕缺少两侧材料纸面，无法生成动画。');
    // An unchanged F seam is bendable paper. A closed rigid component must
    // not veto the separately checked numerical material path before it runs.
    if(!bendable&&regionOf[a]===regionOf[b])return buildDiagramSpatialStepAnimation(project,stepId,{bendable:true});
  }
  const fixedRegion=regionOf[fixedSeedTriangles[0]];
  if(fixedRegion===undefined||fixedSeedTriangles.some(f=>regionOf[f]!==fixedRegion))throw Error('固定侧被本步动作分开，请在保持不动的纸面内部重新选择固定侧。');
  const fixedVertices=bendable?fixedSeedVertices:[...new Set(regions[fixedRegion].flatMap(f=>prepared.facesVertices[f]))];
  const parent=polygons.findIndex(p=>unionPolygons[fixedFace].every(v=>containing(v,p,eps)));
  if(parent<0)throw Error('无法确定固定子面的操作前材料来源。');
  if(fixed)for(const v of fixedSeedVertices){
    const expected=fixed.spatialTransform?applyRigidFoldTransform(fixed.spatialTransform,cp[v]):null;
    if(expected?distance3(expected,shown[v])>eps*20:distance([fixed.matrix[0]*cp[v][0]+fixed.matrix[2]*cp[v][1]+fixed.matrix[4],fixed.matrix[1]*cp[v][0]+fixed.matrix[3]*cp[v][1]+fixed.matrix[5]],pose?.spatial?projectDiagramSpatialPoint(shown[v],pose.spatial.camera).slice(0,2) as Point:[shown[v][0],shown[v][1]])>eps*20)throw Error('固定侧参考姿态已变化，请重新选择固定侧后播放。');
  }
  const endpoint=solveRigidFoldGeometry(materialFold,{startingFace:fixedFace,fixedFaceTransform:transforms[parent]});
  if(endpoint.status!=='ready'&&!bendable)return buildDiagramSpatialStepAnimation(project,stepId,{bendable:true});
  if(endpoint.status==='ready')for(const v of fixedVertices){
    const owners=unionPolygons.flatMap((p,f)=>containing(cp[v],p,eps)?[f]:[]);
    if(!owners.length)throw Error('本步固定区域缺少材料来源。');
    if(owners.some(f=>distance3(applyRigidFoldTransform(endpoint.faceTransforms[f],cp[v]),shown[v])>eps*20)){
      if(!bendable)return buildDiagramSpatialStepAnimation(project,stepId,{bendable:true});
      throw Error('本步折叠会改变指定固定纸面的位置，请检查固定侧。');
    }
  }
  const sourceSignature=simulationSourceSignature(fold);if(!sourceSignature)throw Error('步骤动画材料网格超过支持范围。');
  const retainedCreases=prepared.edgesVertices.flatMap(([a,b],e)=>prepared.edgesAssignment[e]!=='B'&&before.doc.segments.some(s=>s.assignment==='F'&&covers({a:cp[a],b:cp[b]},s,eps))?[e]:[]);
  if(!pose&&step.annotations?.some(a=>a.kind==='line'&&a.animationTiming))throw Error('请先计算操作前姿态，再为折线设置动画时序。');
  const timings=pose?diagramAnimationMaterialTimings(step.annotations??[],diagramAnimationSourceSegments(step.annotations??[],pose,before,step.foldLink),prepared.edgesVertices,cp,ranges,eps):undefined;
  const animation:SimulationStepAnimation={version:1,sourceSignature,initialPositions,ranges,fixedVertices,bendingFixedVertices:fixedSeedVertices,retainedCreases,...(timings?{timings}:{}),...(bendable?{materialMode:'bendable' as const,motionPolicy:'allow-dynamic' as const}:{})};
  validateSimulationStepAnimationStructure(animation,prepared,sourceSignature);
  const index=project.states.findIndex(s=>s.id===before.id);
  const rows:NonNullable<FlatFoldResult['layers']['faceOrders']>=[];
  if(pose?.spatial){
    const parents=unionPolygons.map(poly=>polygons.findIndex(parent=>poly.every(p=>containing(p,parent,eps))));
    const sourceGraph=buildDiagramFold(pose.sourceDoc).graph;
    for(const [a,b,sign] of diagramSpatialContactOrders(pose)){
      const winding=Math.sign(polygonArea(sourceGraph.faces_vertices![b].map(v=>sourceGraph.vertices_coords[v])));
      for(let first=0;first<parents.length;first++)if(parents[first]===a)for(let second=0;second<parents.length;second++)if(parents[second]===b){
        const child=Math.sign(polygonArea(materialFold.faces_vertices![second].map(v=>materialFold.vertices_coords[v])));
        if(winding&&child)rows.push([first,second,sign*winding*child]);
      }
    }
  }
  return {fold,animation,...(rows.length?{initialContactOrder:{sourceFaceCount:materialFold.faces_vertices!.length,faceOrders:rows}}:{}),colors:structuredClone(step.pose?.view?.colors??defaultModelColors()),beforeLabel:`CP${index}`,afterLabel:`CP${index+1}`,...(warnings.length?{warnings}:{})};
}
