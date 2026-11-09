import type {FoldGraph,FlatFoldResult} from '../core/types';
import {prepareSimulationDocument} from './simmodel';
import {simulationSourceSignature,validateSimulationLayerOrder} from './simLayerOrder';
import {validateSimulationStepAnimationStructure,type SimulationStepAnimation} from './simStepAnimation';
import {planSimulationStepPath,SimulationStepPathError} from './simStepPath';
import {certifySimulationStepPath,createSimulationStepTangentProjector} from './simStepCollision';
import {inspectSimulationStepInitialContactOrder,type SimulationStepInitialOrder} from './simStepContactOrder';
import {recomputeFlatLayers} from '../core/flatFold';
import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepPlanningResult} from './simStepPlanningClient';
import {pointOnSegment} from '../core/geometry';
import {buildSimulationStepLayerTimeline,buildSimulationStepDynamicLayerTimeline} from './simStepLayerTimeline';
import {combineSimulationStepFlexMotions,inspectSimulationStepFlexCurvature,planSimulationStepFlex,type SimulationStepFlexMotion} from './simStepFlex';
import {certifySimulationStepFlexPath} from './simStepFlexCollision';
import {simulationStepAxisGroups} from './simStepScheduling';
import {planSimulationStepCone,type SimulationStepConeDescription} from './simStepCone';
import {adjacentSimulationStepFoldedCandidates,reopenSimulationStepFoldedComponents,switchSimulationStepPrecreaseCandidates} from './simStepRefold';
import {retimeSimulationStepFlexMotions} from './simStepFlexTiming';
import {planSimulationStepDynamic,SimulationStepMaterialStrainError} from './simStepDynamic';
import {refineSimulationStepForBending} from './simStepBending';

/** Strict callers require a continuous material-separation certificate. Diagram
 * previews can allow intersections, and separately opt into an approximate
 * numerical trajectory when the bounded rigid search cannot find a path. */
export function planVerifiedSimulationStepAnimation(fold:FoldGraph,input:SimulationStepAnimation,onProgress?:(message:string)=>void,options:{initialGeometry?:FlatFoldResult;initialContactOrder?:SimulationStepInitialOrder;ignoreCollisions?:boolean;originalMeshOnly?:boolean}={}):SimulationStepPlanningResult{
  const unplanned={...input};delete unplanned.motion;delete unplanned.layerTimeline;delete unplanned.flex;delete unplanned.dynamic;
  const {prepared}=prepareSimulationDocument(fold),animation=validateSimulationStepAnimationStructure(unplanned,prepared,simulationSourceSignature(fold));
  const allowIntersections=animation.collisionPolicy==='allow',warnings:string[]=[];
  const warn=(message:string)=>{if(!warnings.includes(message))warnings.push(message);};
  const collisionWarning=(status:string,reason?:string)=>warn(status==='collision'?'此步骤存在纸面穿插，已按允许穿模设置保留播放。':`此步骤未确认全程无穿模，仍可播放。${reason??''}`);
  if(animation.flexRequest){
    const groups=simulationStepAxisGroups(prepared,animation);
    if(groups.length>4)throw Error('局部柔性压痕每步暂支持四组短痕，请将更多压痕拆分为后续步骤。');
    const parts:{motion:SimulationStepFlexMotion;edges:number[]}[]=[];let checkedIntervals=0;
    for(let g=0;g<groups.length;g++){
      onProgress?.(`正在求解局部压痕 · 第 ${g+1} / ${groups.length} 组…`);
      const edges=groups[g].creases.map(i=>prepared.creaseParams[i].edge),active=new Set(edges);
      const subAnimation={...animation,ranges:animation.ranges.map(r=>{const row={...r};if(!active.has(r.edge))delete row.viaAngle;return row;})};
      // Solve the intrinsic, reversible curve first. Explicit user windows are
      // applied to the complete shared material mesh after all parts exist.
      delete subAnimation.timings;
      const descriptions=fold.zhezhi_partial_crease_cones as SimulationStepConeDescription[]|undefined;
      if(descriptions&&(!Array.isArray(descriptions)||descriptions.length>4))throw Error('局部压痕的曲面分组无效。');
      const cone=(fold.zhezhi_partial_crease_cone as SimulationStepConeDescription|undefined)??descriptions?.find(d=>{
        if(!d||!Array.isArray(d.rays)||!d.rays[d.activeRay]||!edges.some(e=>prepared.edgesVertices[e].includes(d.apexVertex)))return false;
        const apex=prepared.fold.vertices_coords[d.apexVertex],direction=d.rays[d.activeRay].direction;
        return !!apex&&edges.every(e=>prepared.edgesVertices[e].every(v=>{const p=prepared.fold.vertices_coords[v],dx=p[0]-apex[0],dy=-p[2]+apex[2];return Math.abs(dx*direction[1]-dy*direction[0])<1e-5&&dx*direction[0]+dy*direction[1]>=-1e-5;}));
      });
      if(descriptions&&!cone)throw Error('未找到本组短痕对应的材料曲面。');
      const motion=cone?planSimulationStepCone(prepared,subAnimation,cone):planSimulationStepFlex(prepared,subAnimation,animation.flexRequest,groups.length>1?{localizeBending:true,steps:96,maxIterations:80}:{});
      if(!inspectSimulationStepFlexCurvature(prepared,subAnimation,motion).curved)throw Error('短痕端点附近尚未形成真实曲面过渡，未把整条延长线折叠作为局部压痕播放。');
      // Both flex planners validate edge lengths, triangle areas, hinge angles,
      // fixed vertices and the complete linear interpolation before returning.
      // A permissive preview only relaxes the separate self-contact certificate.
      if(!animation.timings?.length&&!options.ignoreCollisions){
        onProgress?.(`正在检查曲面自穿透 · 第 ${g+1} / ${groups.length} 组…`);
        const certificate=certifySimulationStepFlexPath({indices:prepared.indices,triangleSourceFaces:prepared.triangleSourceFaces},motion.keyframes,allowIntersections?{maxTimeMs:250,maxPairs:20_000,maxEvaluations:2049}:{});
        if(certificate.status!=='clear'){
          if(!allowIntersections)throw Error(certificate.reason??'局部压痕未通过连续防穿透检查。');
          collisionWarning(certificate.status,certificate.reason);
        }
        checkedIntervals+=certificate.certifiedIntervals;
      }
      parts.push({motion,edges});
    }
    // Joining serial groups at their common seed introduces no new motion.
    // Explicit windows instead produce one newly validated shared trajectory.
    const flex=animation.timings?.length?retimeSimulationStepFlexMotions(prepared,animation,parts):parts.length===1?parts[0].motion:combineSimulationStepFlexMotions(prepared,animation,parts);
    if(animation.timings?.length&&!options.ignoreCollisions){
      // Overlapping windows create a new combined trajectory. Individual part
      // certificates do not certify their relative motion on that trajectory.
      const certificate=certifySimulationStepFlexPath({indices:prepared.indices,triangleSourceFaces:prepared.triangleSourceFaces},flex.keyframes,allowIntersections?{maxTimeMs:250,maxPairs:20_000,maxEvaluations:2049}:{});
      if(certificate.status!=='clear'){
        if(!allowIntersections)throw Error(certificate.reason??'局部压痕时序未通过连续防穿透检查。');
        collisionWarning(certificate.status,certificate.reason);
      }
      checkedIntervals=certificate.certifiedIntervals;
    }
    // A reversible precrease restores exactly the original material layers.
    // Intermediate curved faces use real depth, never a fabricated paint order.
    const rows=options.initialGeometry?.layers.status==='solved'?options.initialGeometry.layers.faceOrders??[]:[];
    const layerTimeline:NonNullable<SimulationStepAnimation['layerTimeline']>=[{progress:0,faceOrders:rows},{progress:1,faceOrders:rows}];
    return {animation:{...animation,flex,layerTimeline},checkedIntervals,method:'local-flex',...(warnings.length?{warnings}:{})};
  }
  onProgress?.('正在确认操作前的纸层顺序…');
  // A partial fold (or a tilted flat sheet) cannot be projected onto XZ and
  // handed to the flat layer solver: that drops actual height and can invent
  // overlapping faces or degenerate a 90-degree face into a line.
  const heights=animation.initialPositions.filter((_,i)=>i%3===1),spatialInitial=Math.max(...heights)-Math.min(...heights)>1e-8;
  // A refined bending mesh keeps the original material-face identities. Its
  // numerical triangles must not become independently inferred flat layers.
  const initial=spatialInitial?null:options.initialGeometry??(animation.materialMode==='bendable'?null:initialMaterialGeometry(fold,prepared,animation));
  const selectedInitial=initial?.layers.status==='solved'?validateSimulationLayerOrder({sourceSignature:simulationSourceSignature(fold),sourceFaceCount:initial.geometry.faces.length,faceOrders:initial.layers.faceOrders},simulationSourceSignature(fold),prepared.sourceFaceCount??initial.geometry.faces.length):null;
  // Allowing intersections only relaxes collision checks. The seed stack is
  // still needed to display stationary, coincident sheets throughout the move,
  // including imported projects whose layer analysis has not been cached.
  const solvedInitial=initial?(selectedInitial?initial:recomputeFlatLayers(initial)):null;
  const contact=options.initialContactOrder;
  const inheritedContact=contact?validateSimulationLayerOrder({sourceSignature:simulationSourceSignature(fold),...contact},simulationSourceSignature(fold),prepared.sourceFaceCount??prepared.facesVertices.length):null;
  if(contact?.faceOrders.length&&!inheritedContact)throw Error('起态接触层序与当前材料纸面不匹配。');
  const initialOrder=inheritedContact??(solvedInitial?.layers.status==='solved'?{sourceFaceCount:solvedInitial.geometry.faces.length,faceOrders:solvedInitial.layers.faceOrders??[]}:null);
  if(allowIntersections&&!initialOrder&&!spatialInitial)warn('操作前的纸层顺序尚未确认，重叠区域可能显示不完整；仍可播放本步动画。');
  const dynamicResult=():SimulationStepPlanningResult=>{
    const dynamic=planSimulationStepDynamic(prepared,animation,{onProgress});
    const layerTimeline=buildSimulationStepDynamicLayerTimeline(prepared,{...animation,dynamic},initialOrder);
    warn(`本步采用${animation.materialMode==='bendable'?(options.originalMeshOnly?'原始网格的曲面数值':'细分纸面的曲面数值'):'与三维模拟相同的数值'}求解；最大边长变化 ${(dynamic.maxEdgeStrain*100).toFixed(2)}%，终点折角误差 ${dynamic.endAngleError.toFixed(1)}°。${dynamic.settleStart!==undefined?'末段已连续收敛至本步通过几何校验的目标姿态。':'进度表示目标折叠进度，实际姿态未作为精确终态确认。'}${animation.collisionPolicy==='contact'?'已连续检查实际回放的纸面接触；保护不包含摩擦或接触滑动。':'过程尚未认证无穿透。'}`);
    if(dynamic.contactStop)warn(`纸面碰撞保护在 ${(dynamic.contactStop.progress*100).toFixed(1)}% 处停止：${dynamic.contactStop.reason}`);
    return {animation:{...animation,dynamic,layerTimeline},method:'dynamic',checkedIntervals:animation.collisionPolicy==='contact'?dynamic.keyframes.length-1:0,warnings};
  };
  if(animation.materialMode==='bendable'&&animation.motionPolicy==='allow-dynamic'&&['allow','contact'].includes(animation.collisionPolicy??'')){
    onProgress?.('正在生成允许纸面弯曲的折叠动作…');
    return dynamicResult();
  }
  let checkedIntervals=0,candidates=0;
  // Diagram playback runs in a cancellable worker. Elapsed wall time alone
  // cannot invalidate a progressing search, including its refold candidates.
  const searchDeadline=options.originalMeshOnly?Infinity:Date.now()+24_000;
  const findMotion=(candidateAnimation:SimulationStepAnimation,maxSearchMs:number)=>{
    if(options.originalMeshOnly)maxSearchMs=Infinity;
    const candidateDeadline=Math.min(searchDeadline,Date.now()+maxSearchMs);
    return planSimulationStepPath(prepared,candidateAnimation,{maxCandidates:48,maxSearchMs,checkPath:(path,candidate)=>{
    candidates++;onProgress?.(allowIntersections?'正在生成折叠动作…':candidates===1?'正在检查纸层碰撞…':`正在调整折叠先后 · 方案 ${candidates}`);
    let geometryFailed=false,geometryFailure:unknown;
    const checkedGeometry=<T,>(evaluate:()=>T):T=>{try{return evaluate();}catch(error){geometryFailed=true;geometryFailure=error;throw error;}};
    try{
    if(options.ignoreCollisions)return {status:'clear'};
    const mechanism=path.mechanism;
    const projector=createSimulationStepTangentProjector({initialPositions:mechanism.seedPositions,vertexBodies:mechanism.vertexBodies,fromAngles:mechanism.fromAngles,
      bodies:mechanism.components.map(body=>({parent:body.parent,crease:body.parentCrease,sign:body.rotationSign,...(body.parentCrease===null?{}:{axisVertices:prepared.edgesVertices[prepared.creaseParams[body.parentCrease].edge]})}))},candidate.phases);
    const departure=inspectSimulationStepInitialContactOrder(prepared,path,initialOrder,{initialSide:projector.initialContactSide,...(allowIntersections?{maxPairs:20_000,maxOverlapPairs:1000}:{})});
    if(departure.status!=='clear'){
      if(!allowIntersections)return {status:departure.status,message:departure.reason};
      collisionWarning(departure.status,departure.reason);
      return {status:'clear'};
    }
    const remaining=candidateDeadline-Date.now();
    if(remaining<=0){
      if(allowIntersections){collisionWarning('inconclusive');return {status:'clear'};}
      return {status:'inconclusive',message:'本步动画的连续安全检查超出规划时间，请拆分步骤后重试。'};
    }
    const result=certifySimulationStepPath({indices:prepared.indices,triangleBodies:mechanism.triangleBodies,triangleSourceFaces:prepared.triangleSourceFaces},
      {evaluate:p=>checkedGeometry(()=>path.evaluate(p)),motionBound:(a,b)=>checkedGeometry(()=>path.motionBound(a,b)),projectionBounds:(a,b,axis,origin)=>projector(a,b,axis,origin,checkedGeometry(()=>path.angleBounds(a,b))),contactSeparation:projector.separates,contactTransition:projector.contactTransition},
      {maxPairs:allowIntersections?20_000:1_000_000,maxEvaluations:2049,maxDepth:24,tolerance:1e-8,minInterval:1e-8,maxTimeMs:Math.min(allowIntersections?250:8000,remaining)});
    if(geometryFailed)throw geometryFailure;
    if(result.status==='clear')checkedIntervals=result.certifiedIntervals;
    else if(allowIntersections){collisionWarning(result.status,result.reason);return {status:'clear'};}
    return {status:result.status,message:result.reason,progress:result.progress,interval:result.interval};
    }catch(error){
      if(!allowIntersections||geometryFailed)throw error;
      // Geometry was already validated by planSimulationStepPath.accept. An
      // unsupported contact proof cannot invalidate a permitted intersection.
      collisionWarning('inconclusive');return {status:'clear'};
    }
  }});
  };
  let pathAnimation=animation,motion:ReturnType<typeof planSimulationStepPath>|undefined;
  try{
  try{motion=findMotion(pathAnimation,8000);}
  catch(error){
    // A known collision may be avoidable by opening a neighbouring old fold.
    // An inconclusive certificate is never permission to keep blindly trying
    // candidates after the continuous checker has exhausted its own budget.
    if(!(error instanceof SimulationStepPathError)||error.reason==='inconclusive')throw error;
    let lastError:unknown=error;
    const attempt=(candidate:SimulationStepAnimation,message:string,budget:number):boolean=>{
      const remaining=searchDeadline-Date.now();if(remaining<=0)return false;
      onProgress?.(message);
      const validated=validateSimulationStepAnimationStructure(candidate,prepared,animation.sourceSignature);
      try{const found=findMotion(validated,Math.min(remaining,budget));pathAnimation=validated;motion=found;return true;}
      catch(retryError){
        if(!(retryError instanceof SimulationStepPathError)||retryError.reason==='inconclusive')throw retryError;
        lastError=retryError;return false;
      }
    };
    // Preserve the previously supported change-of-folding-pattern search.
    // It has a larger coupled component and should not be starved by many
    // narrower local guesses. Explicit precrease vias are never replaced.
    const reopened=reopenSimulationStepFoldedComponents(prepared,animation);
    if(reopened)attempt(reopened,'正在尝试展开相关旧折痕后重新折叠…',18_000);
    // Prefer a minimal local MV-axis replacement to opening every adjacent
    // old fold. The latter can unnecessarily release an entire twisted ring.
    if(!motion)for(const candidate of switchSimulationStepPrecreaseCandidates(prepared,animation)){
      if(Date.now()>=searchDeadline)break;
      if(attempt(candidate,'正在尝试替换局部折痕轴后预折…',6000))break;
    }
    let triedAdjacent=false;
    if(!motion)for(const candidate of adjacentSimulationStepFoldedCandidates(prepared,animation)){
      if(Date.now()>=searchDeadline)break;
      triedAdjacent=true;
      if(attempt(candidate,'正在尝试小幅打开相邻旧折痕…',2400))break;
    }
    if(!motion&&triedAdjacent&&lastError instanceof SimulationStepPathError&&lastError.reason==='geometry')throw new SimulationStepPathError('geometry','已尝试在允许折角内打开相邻旧折痕，仍未找到保持固定侧与材料连接的连续刚性路径。若短痕终止于旧折痕或纸面内部，该步骤可能需要相邻纸面局部弯曲；请拆步或调整压痕范围。');
    if(!motion)throw lastError;
  }
  }catch(error){
    if(animation.motionPolicy!=='allow-dynamic'||!['allow','contact'].includes(animation.collisionPolicy??'')||!(error instanceof SimulationStepPathError)||error.reason!=='geometry'&&!(animation.collisionPolicy==='contact'&&error.reason==='collision'))throw error;
    onProgress?.('刚性路径暂不可用，正在用三维数值求解生成本步动作…');
    if(animation.materialMode!=='bendable'&&!options.originalMeshOnly){
      // Preserve the original material panels first. Refinement changes the
      // available bending modes and can trap a previously working step in a
      // different numerical branch, even when the target pose is compatible.
      if(allowIntersections){
        try{return dynamicResult();}
        catch(error){if(!(error instanceof SimulationStepMaterialStrainError))throw error;}
      }
      const bending=refineSimulationStepForBending(fold,animation);
      const result=planVerifiedSimulationStepAnimation(bending.fold,bending.animation,onProgress,{initialGeometry:options.initialGeometry});
      return {...result,fold:bending.fold};
    }
    return dynamicResult();
  }
  if(!motion)throw Error('本步未找到通过连续防穿透检查的折叠路径。');
  const planned={...pathAnimation,motion};
  onProgress?.('正在同步动画的纸层颜色…');
  let layerTimeline:NonNullable<SimulationStepAnimation['layerTimeline']>;
  try{
    layerTimeline=buildSimulationStepLayerTimeline(prepared,planned,initialOrder);
  }catch(error){
    if(!allowIntersections)throw error;
    // A self-intersecting motion has no physical total stack order. Keep only
    // established seed relations, and never fabricate an endpoint paint order.
    const rows=initialOrder?.faceOrders.map(row=>[...row] as [number,number,number])??[];
    layerTimeline=[{progress:0,faceOrders:rows},{progress:1,faceOrders:[]}];
    warn('运动中的纸层顺序暂未确认，已保留初态关系并按几何深度显示。');
  }
  return {animation:{...planned,layerTimeline},checkedIntervals,method:motion.method,...(warnings.length?{warnings}:{})};
}

/** Preserve original material-face IDs for headless callers too. Triangulation
 * F seams must not manufacture separate physical paper layers. */
function initialMaterialGeometry(fold:FoldGraph,prepared:PreparedOrigamiModel,animation:SimulationStepAnimation):FlatFoldResult{
  const cp=prepared.fold.vertices_coords.map(p=>[p[0],-p[2]] as [number,number]);
  const extent=Math.max(1,...cp.flat().map(Math.abs)),eps=extent*1e-8;
  const sourcePoint=(p:readonly number[]):[number,number]=>{
    const exact=cp.findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<=eps);
    if(exact>=0)return [animation.initialPositions[exact*3],-animation.initialPositions[exact*3+2]];
    const cross=(a:readonly number[],b:readonly number[],c:readonly number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    for(const face of prepared.facesVertices){
      const [a,b,c]=face.map(v=>cp[v]),area=cross(a,b,c);if(Math.abs(area)<eps*eps)continue;
      const weights=[cross(p,b,c)/area,cross(a,p,c)/area,cross(a,b,p)/area];
      if(weights.some(w=>w< -1e-8||w>1+1e-8))continue;
      return [weights.reduce((s,w,i)=>s+w*animation.initialPositions[face[i]*3],0),-weights.reduce((s,w,i)=>s+w*animation.initialPositions[face[i]*3+2],0)];
    }
    throw Error('初态纸层网格缺少材料顶点对应，无法判断正确的离层方向。');
  };
  const ranges=new Map(animation.ranges.map(r=>[r.edge,r.fromAngle]));
  const angles=fold.edges_vertices.map(([a,b],e)=>{
    if(fold.edges_assignment[e]==='B')return 0;
    const start=fold.vertices_coords[a],end=fold.vertices_coords[b],middle:[number,number]=[(start[0]+end[0])/2,(start[1]+end[1])/2];
    const edge=prepared.edgesVertices.findIndex(([v,w])=>{
      const line={id:'initial-hinge',a:cp[v],b:cp[w],assignment:'F' as const,angle:0};
      return pointOnSegment(middle,line,eps)&&Math.abs((end[0]-start[0])*(cp[w][1]-cp[v][1])-(end[1]-start[1])*(cp[w][0]-cp[v][0]))<=eps*Math.max(1,Math.hypot(end[0]-start[0],end[1]-start[1]));
    });
    return ranges.get(edge)??0;
  });
  const points=fold.vertices_coords.map(sourcePoint),graph:FoldGraph={...structuredClone(fold),vertices_coords:points,edges_assignment:angles.map((a,e)=>fold.edges_assignment[e]==='B'?'B':a<0?'M':a>0?'V':'F'),edges_foldAngle:angles};
  delete graph.faces_matrix;delete graph.faces_matrix2;delete graph.faces_normal;delete graph.faceOrders;
  return {geometry:{status:'ready',message:'本步操作前的材料网格。',vertices:points,faces:graph.faces_vertices!,graph},layers:{status:'unknown',message:'正在确认操作前的纸层顺序。'},warnings:[]};
}

/** Diagram playback has no collision protection or mesh-quality fallback.
 * Contact relations below are display ownership, never movement constraints. */
export function planDiagramStepPlayback(fold:FoldGraph,input:SimulationStepAnimation,onProgress?:(message:string)=>void,options:{initialGeometry?:FlatFoldResult;initialContactOrder?:SimulationStepInitialOrder}={}){
 return planVerifiedSimulationStepAnimation(fold,{...input,collisionPolicy:'allow',motionPolicy:'allow-dynamic'},onProgress,{...options,ignoreCollisions:true,originalMeshOnly:true});
}
