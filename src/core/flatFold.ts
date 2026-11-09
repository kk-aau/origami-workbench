import {constrainLayerSolutionTree,certifyRelativeLayerConstraints} from './relativeLayerConstraints';
import ear from 'rabbit-ear';
import { diagnose } from './diagnostics';
import {pointBounds} from './pointBounds';
import { buildFold, cross, distance, epsilonFor, polygonArea, sub } from './geometry';
import { type Doc, type FlatFoldOptions, type FlatFoldResult, type FlatFoldConflict, type FoldGraph, type Point, type FoldingConstraint,type FlatLayerAdjustment,type FlatLayerPreference } from './types';
import {createLayerSolutionSelector,selectMatchingLayerSolution,validateLayerOrders,type LayerNode} from './layerSolutions';
import {convexLayerGeometry} from './convexLayerGeometry';
import {flatLayerOrder} from './flatLayerOrder';
import {isSimpleLayerPolygon,solveConcaveLayerOrders} from './concaveLayers';
import {hasMaterialTopology,inspectMaterialTopology} from './materialTopology';
import {computeMaterialFlatGeometry} from './materialFlatGeometry';
import {hasWeakMaterialRings,hasWeakMaterialBanks,hasUnresolvedMaterialHinge} from './materialWeak';
import {materialLayerRegions} from './materialLayerRegions';
import {flatCreaseFacesAtPoint,flatCreaseLayerRegions} from './flatCreaseSupport';
import {selectAdjustedLayerSolution} from './layerAdjustment';
import {selectPreferredLayerSolution,validateLayerPreferences} from './layerPreferences';
import {solveConvexLayerCandidate} from './convexLayerCandidate';
import {solveConcaveLayerCandidate} from './concaveLayerCandidate';
import {reportFlatComputationProgress,reportExactTopologyProgress,reportLayerRegionProgress} from './flatComputationProgress';
import type {FaceOrder} from './layerSolutions';
import {buildExactModelTopology,walkExactCoverage} from '../app/modelExactTopology';
import {flatExactProof,rememberFlatExactProof} from '../app/flatExactProof';
import {makeLayerConflict,conflictsFromLayerError,maekawaConflicts} from './flatConflictDiagnostics';
import {diagnoseFlatLayerCoverage} from './flatLayerSelfDiagnosis';
import {traceFlatLayerError} from './flatLayerConflictTrace';

export function emptyFoldResult(status: FlatFoldResult['geometry']['status'], message: string): FlatFoldResult {
  return { geometry: { status, message, vertices: [], faces: [] }, layers: { status: status === 'timeout' || status === 'cancelled' ? status : 'unknown', message: '尚未得到层序解。' }, warnings: [] };
}
function hasOneBoundary(graph: FoldGraph): boolean {
  const adjacency = new Map<number, number[]>();
  graph.edges_vertices.forEach(([a, b], e) => {
    if (graph.edges_assignment[e] !== 'B') return;
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]); adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  });
  if (!adjacency.size || [...adjacency.values()].some(v => v.length !== 2)) return false;
  const seen = new Set<number>(), queue = [adjacency.keys().next().value as number];
  while (queue.length) { const v = queue.pop()!; if (seen.has(v)) continue; seen.add(v); queue.push(...(adjacency.get(v) ?? [])); }
  return seen.size === adjacency.size;
}
function isConvex(points: Point[], eps: number): boolean {
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = sub(points[(i + 1) % points.length], points[i]), b = sub(points[(i + 2) % points.length], points[(i + 1) % points.length]);
    const z = cross(a, b); if (Math.abs(z) <= eps * Math.max(Math.hypot(...a), Math.hypot(...b))) continue;
    if (sign && Math.sign(z) !== sign) return false; sign = Math.sign(z);
  }
  return sign !== 0;
}
function constraintMatches(result: FlatFoldResult, order: number[], constraints: FoldingConstraint[]): boolean {
  if (!constraints.length) return true;
  const top = order.at(-1);
  if (top === undefined) return false;
  const face = result.geometry.faces[top];
  if (!face) return false;
  const foldedArea = polygonArea(face.map(v => result.geometry.vertices[v]));
  if(!Number.isFinite(foldedArea)||foldedArea===0)return false;
  const material: FoldingConstraint['side'] = foldedArea > 0 ? 'white' : 'color';
  return constraints.some(c => c.face === top && c.side === material);
}

/** Recheck a rejected mark-mode contact model using verified private triangles.
 * Triangle rules share original material-face variables; no F line becomes a
 * hinge/layer and no old certificate or arbitrary paint order is accepted. */
function recoverDiagramLayerCandidate(result:FlatFoldResult,eps:number,requestedIndex:number|undefined,constraints:FoldingConstraint[],layerAdjustment:FlatLayerAdjustment|undefined,preferences:FlatLayerPreference[],publicGeometry:FlatFoldResult['geometry']|undefined,required:FlatLayerPreference[]):FlatFoldResult|null {
  if((publicGeometry??result.geometry).graph?.zhezhi_flatCreases!=='marks'||constraints.length||layerAdjustment)return null;
  const topology=buildExactModelTopology(publicGeometry?{...result,geometry:publicGeometry}:result,reportExactTopologyProgress);
  const normals=result.geometry.faces.map(face=>Math.sign(polygonArea(face.map(v=>result.geometry.vertices[v]))));
  const orders=(relations:FlatLayerPreference[]):FaceOrder[]=>relations.map(({above,below})=>[above,below,normals[below]] as FaceOrder);
  validateLayerPreferences(required,normals.length);validateLayerPreferences(preferences,normals.length);
  const options={coverage:{faceCount:topology.faceCount,cellCount:topology.cellCount,walk:(visitor:Parameters<typeof walkExactCoverage>[1])=>walkExactCoverage(topology,visitor)},onProgress:reportLayerRegionProgress};
  let candidate=solveConcaveLayerCandidate(result.geometry.graph!,eps,{...options,fixedOrders:orders([...required,...preferences])});
  if(!candidate&&preferences.length)candidate=solveConcaveLayerCandidate(result.geometry.graph!,eps,{...options,fixedOrders:orders(required)});
  if(!candidate)return null;
  if(!candidate.coverageCertificate)throw Error('原纸面层序复核缺少完整区域认证。');
  validateLayerOrders(candidate.orders,normals.length);
  if(requestedIndex!==undefined&&requestedIndex!==0){
    result.layers={status:'unsupported',message:'已确认当前模型存在合法层序，但复核路径尚未枚举指定的候选编号；未替换为其他方案。',constraints};
    if(publicGeometry)result.geometry=publicGeometry;
    return result;
  }
  result.layers={status:'solved',message:'已复核全部原纸面的接触约束与区域遮挡，确认存在合法层序；尚未枚举候选总数。',faceOrders:candidate.orders,constraints,...(candidate.faceOrder?{faceOrder:candidate.faceOrder}:{})};
  if(publicGeometry)result.geometry=publicGeometry;
  rememberFlatExactProof(result,{topology,certificate:candidate.coverageCertificate});
  return result;
}

function solveLayerGeometry(result: FlatFoldResult, eps: number, requestedIndex:number|undefined=undefined, constraints: FoldingConstraint[]=[],layerAdjustment?:FlatLayerAdjustment,layerPreferences:FlatLayerPreference[]=[],referenceOrders?:FaceOrder[],publicGeometry?:FlatFoldResult['geometry'],relativeConstraints:FlatLayerPreference[]=[]): FlatFoldResult {
  const {vertices,faces}=result.geometry;
  const foldedGraph=result.geometry.graph!;
  const privateGeometry=convexLayerGeometry(foldedGraph,eps);
  const solutionIndex=requestedIndex??0;
  if(faces.length>=256&&requestedIndex===undefined&&!constraints.length&&!layerAdjustment&&!layerPreferences.length&&!relativeConstraints.length){
    // The contact solver retains its established tolerance, while every actual
    // overlap is certified against the original displayed coordinates. Keep
    // this subdivision worker-local and reuse it for the final visible surface.
    const topology=buildExactModelTopology(publicGeometry?{...result,geometry:publicGeometry}:result,reportExactTopologyProgress);
    const conflicts:FlatFoldConflict[]=[];
    const candidate=solveConvexLayerCandidate(privateGeometry.graph,privateGeometry.epsilon,{coverage:{faceCount:topology.faceCount,cellCount:topology.cellCount,walk:visitor=>walkExactCoverage(topology,visitor)},onProgress:reportLayerRegionProgress,onConflict:conflict=>{if(conflicts.length<4)conflicts.push(conflict);}});
    if(!candidate){
      const recovered=recoverDiagramLayerCandidate(result,eps,requestedIndex,constraints,layerAdjustment,layerPreferences,publicGeometry,relativeConstraints);
      if(recovered)return recovered;
      result.layers={status:'no-solution',message:'约束搜索完成：没有满足当前平折几何和山谷指派的层序解。',constraints,conflicts};return result;
    }
    validateLayerOrders(candidate.orders,faces.length);
    if(!candidate.coverageCertificate)throw Error('层序搜索尚未提供全部精确区域的认证。');
    result.layers={status:'solved',message:'已确认全部精确区域的层序及接触约束；尚未枚举候选总数或分配解编号。',faceOrders:candidate.orders,constraints,...(candidate.faceOrder?{faceOrder:candidate.faceOrder}:{})};
    // Finite F routing uses private area contours for contacts, but its exact
    // coverage and published geometry both belong to the original material.
    if(publicGeometry)result.geometry=publicGeometry;
    rememberFlatExactProof(result,{topology,certificate:candidate.coverageCertificate});
    if(!candidate.faceOrder)result.warnings.push('层序关系不能转换为单一全局绘制顺序，显示使用已验证的局部遮挡关系。');
    return result;
  }
  reportFlatComputationProgress({stage:'search',label:'搜索纸层顺序',detail:'搜索总量尚不确定'});
  let originalTree:LayerNode;
  try{originalTree=ear.layer(privateGeometry.graph, privateGeometry.epsilon) as unknown as LayerNode;}
  catch(error){
    if(error instanceof Error&&error.message.includes('no solution possible')){
      const recovered=recoverDiagramLayerCandidate(result,eps,requestedIndex,constraints,layerAdjustment,layerPreferences,publicGeometry,relativeConstraints);
      if(recovered)return recovered;
      const conflicts=traceFlatLayerError(error,privateGeometry.graph,privateGeometry.epsilon);
      if(conflicts.some(c=>c.trace)){
        result.layers={status:'no-solution',message:'约束传播证明当前模型几何与山谷指派没有层序解。',constraints,conflicts};return result;
      }
    }
    throw error;
  }
  const tree = constrainLayerSolutionTree(originalTree,vertices,faces,relativeConstraints);
  let preferenceWarning='';
  if(layerPreferences.length&&!layerAdjustment){
    const answer=selectPreferredLayerSolution(tree,vertices,faces,layerPreferences);
    if(answer.status==='matched'&&answer.orders&&answer.solutionIndex!==undefined&&!constraints.length){
      validateLayerOrders(answer.orders,faces.length);
      const order=flatLayerOrder(vertices,faces,answer.orders),count=answer.count!;
      result.layers={status:'solved',message:answer.message,faceOrders:answer.orders,solutionIndex:answer.solutionIndex,constraints,solutionCountExact:String(count),...(count<=BigInt(Number.MAX_SAFE_INTEGER)?{solutionCount:Number(count)}:{}),...(order.length===faces.length?{faceOrder:order}:{})};
      if(!result.layers.faceOrder)result.warnings.push('层序关系不能转换为单一全局绘制顺序，显示不使用任意面序伪装正确遮挡。');
      return result;
    }
    preferenceWarning=constraints.length?'当前正反色可见面约束暂不合并跨步层序偏好，已按本步约束重新求解。':answer.message;
  }
  if(layerAdjustment){
    const answer=selectAdjustedLayerSolution(tree,{vertices:privateGeometry.graph.vertices_coords,faces,epsilon:privateGeometry.epsilon,request:layerAdjustment,solutionIndex,
      ...(referenceOrders?{currentOrders:referenceOrders}:{}),
      ...(constraints.length?{matches:orders=>constraintMatches(result,flatLayerOrder(vertices,faces,orders),constraints)}:{})});
    const counts=answer.count===undefined?{}:{solutionCountExact:String(answer.count),...(answer.count<=BigInt(Number.MAX_SAFE_INTEGER)?{solutionCount:Number(answer.count)}:{})};
    if(answer.status!=='solved'||!answer.orders){result.layers={status:answer.status,message:answer.message,constraints,...counts};return result;}
    validateLayerOrders(answer.orders,faces.length);
    const order=flatLayerOrder(vertices,faces,answer.orders);
    result.layers={status:'solved',message:answer.message,faceOrders:answer.orders,...(answer.solutionIndex===undefined?{}:{solutionIndex:answer.solutionIndex}),constraints,...counts,...(order.length===faces.length?{faceOrder:order}:{})};
    if(!result.layers.faceOrder)result.warnings.push('层序关系不能转换为单一全局绘制顺序，显示不使用任意面序伪装正确遮挡。');
    return result;
  }
  const selector=createLayerSolutionSelector(tree);
  if (selector.count===0n) {
    const recovered=recoverDiagramLayerCandidate(result,eps,requestedIndex,constraints,layerAdjustment,layerPreferences,publicGeometry,relativeConstraints);
    if(recovered)return recovered;
    const conflicts=relativeConstraints.length&&createLayerSolutionSelector(originalTree).count>0n?[makeLayerConflict('relative-order','constraint',relativeConstraints.flatMap(r=>[r.above,r.below]),{relations:relativeConstraints.map(({above,below})=>({above,below}))})]:[];
    result.layers = { status: 'no-solution', message: '约束搜索完成：没有满足当前平折几何和山谷指派的层序解。', constraints,conflicts }; return result;
  }
  let orders:ReturnType<typeof selector.select>,count:bigint|undefined=selector.count,incompleteMessage='';
  if (constraints.length) {
    const selected=selectMatchingLayerSolution(tree,solutionIndex,candidate=>constraintMatches(result,flatLayerOrder(vertices,faces,candidate),constraints));
    orders=selected.orders;count=selected.count;
    if(!selected.complete)incompleteMessage=`正反色约束搜索尚未完成：已检查 ${selected.checked.toLocaleString('en-US')} 个候选，确认 ${selected.matchingCount.toLocaleString('en-US')} 个匹配；匹配总数未知。`;
    if(!orders&&!selected.complete){result.layers={status:'unknown',message:incompleteMessage+'尚未找到请求的候选编号，不能判定无解。',constraints};return result;}
    if(selected.count===0n){result.layers={status:'no-solution',message:'约束搜索完成：正反色约束没有满足当前平折几何和山谷指派的层序解。',constraints,solutionCountExact:'0',solutionCount:0,conflicts:[makeLayerConflict('visible-face','constraint',constraints.map(c=>c.face))]};return result;}
  }else orders=selector.select(solutionIndex);
  const counts=count===undefined?{}:{solutionCountExact:String(count),...(count<=BigInt(Number.MAX_SAFE_INTEGER)?{solutionCount:Number(count)}:{})};
  if (!orders) { result.layers={status:'error',message:`层序解编号超出范围，共 ${count} 个候选。`,constraints,...counts};return result; }
  validateLayerOrders(orders,faces.length);
  const order = flatLayerOrder(vertices,faces,orders);
  result.layers = { status: 'solved', message: (constraints.length ? '已找到满足正反色可见面约束的平折层序解；不代表刚性运动路径或有厚度纸张的可制造性。' : '已找到符合引擎约束的平折层序解；不代表刚性运动路径或有厚度纸张的可制造性。')+incompleteMessage, faceOrders: orders, solutionIndex, constraints, ...counts, ...(order.length === faces.length ? { faceOrder: order } : {}) };
  if(preferenceWarning){result.layers.message+=preferenceWarning;result.warnings.push(`[纸层继承] ${preferenceWarning}`);}
  if (!result.layers.faceOrder) result.warnings.push('层序关系不能转换为单一全局绘制顺序，显示不使用任意面序伪装正确遮挡。');
  return result;
}

function solveConcaveLayerGeometry(result:FlatFoldResult,eps:number,solutionIndex:number|undefined=undefined,constraints:FoldingConstraint[]=[],layerAdjustment?:FlatLayerAdjustment,layerPreferences:FlatLayerPreference[]=[],relativeConstraints:FlatLayerPreference[]=[],publicGeometry?:FlatFoldResult['geometry']):FlatFoldResult{
  if(layerAdjustment){result.layers={status:'unsupported',message:'当前凹面或带孔纸面暂不支持升降纸层；原有合法层序保留。',constraints};return result;}
  if(constraints.length){result.layers={status:'unsupported',message:'凹面层序暂不支持正反色可见面约束；请取消该约束后求解。',constraints};return result;}
  if(result.geometry.faces.length>=256&&solutionIndex===undefined&&!layerPreferences.length&&!relativeConstraints.length){
    const topology=buildExactModelTopology(publicGeometry?{...result,geometry:publicGeometry}:result,reportExactTopologyProgress);
    const conflicts:FlatFoldConflict[]=[];
    const candidate=solveConcaveLayerCandidate(result.geometry.graph!,eps,{coverage:{faceCount:topology.faceCount,cellCount:topology.cellCount,walk:visitor=>walkExactCoverage(topology,visitor)},onProgress:reportLayerRegionProgress,onConflict:conflict=>{if(conflicts.length<4)conflicts.push(conflict);}});
    if(!candidate){result.layers={status:'no-solution',message:'原面接触与区域层序约束搜索完成，没有满足当前几何与山谷指派的层序解。',constraints,conflicts};return result;}
    if(!candidate.coverageCertificate)throw Error('凹面层序尚未完成全部原面区域认证。');
    validateLayerOrders(candidate.orders,result.geometry.faces.length);
    result.layers={status:'solved',message:'已确认全部原面区域的层序及接触约束；内部计算分片未独立排序，尚未枚举候选总数或分配解编号。',faceOrders:candidate.orders,constraints,...(candidate.faceOrder?{faceOrder:candidate.faceOrder}:{})};
    if(publicGeometry)result.geometry=publicGeometry;
    rememberFlatExactProof(result,{topology,certificate:candidate.coverageCertificate});
    if(!candidate.faceOrder)result.warnings.push('层序关系不能转换为单一全局绘制顺序，显示使用已验证的局部遮挡关系。');
    return result;
  }
  solutionIndex??=0;
  // Layer analysis receives an existing placement, unlike CP reflection.
  // Disconnected pieces and hole loops are valid here. The triangulation
  // checks every B edge has one owner and every crease has two owners;
  // original-face variables prevent triangles of one piece separating.
  let preferenceWarning='',answer;
  if(layerPreferences.length){
    try{validateLayerPreferences(layerPreferences,result.geometry.faces.length);answer=solveConcaveLayerOrders(result.geometry.graph!,eps,0,layerPreferences,relativeConstraints);}
    catch(error){preferenceWarning=error instanceof Error?error.message:String(error);}
    if(answer?.status==='complete'&&answer.orders&&answer.solutionIndex!==undefined)solutionIndex=answer.solutionIndex;
    else {preferenceWarning=preferenceWarning||(!answer||answer.status==='complete'?'本步的新山谷指派无法同时保持原纸层关系，已保留新 CP 的合法方案。':answer.message);answer=undefined;}
  }
  answer??=solveConcaveLayerOrders(result.geometry.graph!,eps,solutionIndex,[],relativeConstraints);
  if(answer.status!=='complete'){result.layers={status:answer.status,message:answer.message,constraints};return result;}
  const counts={solutionCountExact:String(answer.count),...(answer.count<=BigInt(Number.MAX_SAFE_INTEGER)?{solutionCount:Number(answer.count)}:{})};
  if(answer.count===0n){result.layers={status:'no-solution',message:'原面统一层序约束搜索完成，没有满足当前几何与山谷指派的层序解。',constraints,...counts,conflicts:answer.conflicts};return result;}
  if(!answer.orders){result.layers={status:'error',message:`层序解编号超出范围，共 ${answer.count} 个候选。`,constraints,...counts};return result;}
  const faceOrder=flatLayerOrder(result.geometry.vertices,result.geometry.faces,answer.orders);
  result.layers={status:'solved',message:'已求得凹面的原面统一层序；内部三角片未独立排序，不代表连续折叠路径。',faceOrders:answer.orders,solutionIndex,constraints,...counts,...(faceOrder.length===result.geometry.faces.length?{faceOrder}:{})};
  if(layerPreferences.length&&!preferenceWarning)result.layers.message='已在新 CP 的合法凹面层序解中保留未改动纸面的原有上下关系。';
  if(preferenceWarning){result.layers.message+=preferenceWarning;result.warnings.push(`[纸层继承] ${preferenceWarning}`);}
  if(!result.layers.faceOrder)result.warnings.push('层序关系不能转换为单一全局绘制顺序，显示使用原面的局部遮挡关系。');
  return result;
}

/** The private graph has the same original material-face IDs. Only its area
 * contours enter the solver; the public F routes, tips and weak boundary
 * walks remain the source/result snapshot identity. */
function solveFiniteFlatCreaseLayers(result:FlatFoldResult,regions:FoldGraph,eps:number,solutionIndex:number|undefined=undefined,constraints:FoldingConstraint[]=[],layerAdjustment?:FlatLayerAdjustment,layerPreferences:FlatLayerPreference[]=[],referenceOrders?:FaceOrder[],relativeConstraints:FlatLayerPreference[]=[]):FlatFoldResult {
  const privateResult:FlatFoldResult={...structuredClone(result),geometry:{...result.geometry,vertices:regions.vertices_coords,faces:regions.faces_vertices!,graph:regions}};
  const concave=regions.faces_holes?.some(rows=>rows.length)||regions.faces_vertices!.some(face=>!isConvex(face.map(v=>regions.vertices_coords[v]),eps));
  const solved=concave?solveConcaveLayerGeometry(privateResult,eps,solutionIndex,constraints,layerAdjustment,layerPreferences,relativeConstraints,result.geometry):solveLayerGeometry(privateResult,eps,solutionIndex,constraints,layerAdjustment,layerPreferences,referenceOrders,result.geometry,relativeConstraints);
  if(flatExactProof(solved))return solved;
  return {...result,layers:solved.layers,warnings:[...new Set([...result.warnings,...solved.warnings])]};
}

/** Geometry-only stage for an already constructed planar graph. Run off the UI thread. */
export function computeFlatGeometry(graph:FoldGraph,eps:number,options:Pick<FlatFoldOptions,'startingFace'>={}):FlatFoldResult {
  try {
    const faces=graph.faces_vertices??[];
    if (!faces.length) return emptyFoldResult('invalid', '没有闭合纸面，请检查边界与交点。');
    const startingFace = options.startingFace === undefined ? 0 : options.startingFace;
    if (!Number.isInteger(startingFace) || startingFace < 0 || startingFace >= faces.length) return emptyFoldResult('invalid', '起始面不存在，请在当前展开图中重新选择纸面。');
    if (!hasOneBoundary(graph)) {
      // Explicit rings from boundary-region construction must still pass the
      // material-area validator; multiple loops are not themselves an error.
      if(!graph.faces_holes)return emptyFoldResult('invalid','纸张边界未形成可确定的材料区域。');
      if(!flatCreaseLayerRegions(graph,eps))materialLayerRegions(graph,eps);
    }
    // Candidate planar folding is independent of mountain/valley sign. Non-flat target angles stay in the source doc.
    const flatGraph: FoldGraph = { ...graph, edges_foldAngle: graph.edges_assignment.map(a => a === 'M' ? -180 : a === 'V' || a === 'U' ? 180 : 0) };
    const matrices = ear.graph.makeFacesMatrix2(flatGraph, [startingFace]);
    const vertices: Point[] = Array(graph.vertices_coords.length);
    const faceSequence=graph.faces_holes?[startingFace,...faces.flatMap((_,f)=>f===startingFace?[]:[f])]:faces.map((_,f)=>f);
    for (const f of faceSequence) for (const v of [...faces[f],...(graph.faces_holes?.[f]??[]).flat()]) {
      const m = matrices[f], p = graph.vertices_coords[v];
      const folded: Point = [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
      if (!folded.every(Number.isFinite)) return emptyFoldResult('invalid', '平折计算产生无效坐标。');
      if (vertices[v] && distance(vertices[v], folded) > eps * 20) return emptyFoldResult('invalid', '沿不同纸面路径得到的顶点位置不一致，不能构成连续的完全平折几何。');
      // Preserve the fixed face's exact coordinates at shared corners. Later
      // transforms validate closure but must not inject reflection roundoff.
      if(!graph.faces_holes||!vertices[v])vertices[v] = folded;
    }
    // Finite F marks may have isolated tips that are not boundary vertices.
    // They follow their containing material face without adding a hinge.
    if(vertices.filter(Boolean).length!==graph.vertices_coords.length){
      const regions=flatCreaseLayerRegions(graph,eps);
      if(regions)for(let v=0;v<graph.vertices_coords.length;v++)if(!vertices[v]){
        const point=graph.vertices_coords[v],owners=flatCreaseFacesAtPoint(regions,point,eps);
        for(const f of owners){const m=matrices[f],folded:Point=[m[0]*point[0]+m[2]*point[1]+m[4],m[1]*point[0]+m[3]*point[1]+m[5]];
          if(!folded.every(Number.isFinite))return emptyFoldResult('invalid','有限展开折痕的顶点映射产生无效坐标。');
          if(vertices[v]&&distance(vertices[v],folded)>eps*20)return emptyFoldResult('invalid','有限展开折痕的顶点不能唯一对应真实纸面。');vertices[v]=folded;
        }
      }
    }
    if (vertices.filter(Boolean).length !== graph.vertices_coords.length) return emptyFoldResult('invalid', '存在不属于任何纸面的孤立顶点。');
    const foldedGraph: FoldGraph = { ...flatGraph, vertices_coords: vertices, frame_classes: ['foldedForm'], frame_attributes: ['2D'] };
    return { geometry: { status: 'ready', message: '平折几何已生成。它不等于层序解，也不证明存在可行的连续折叠路径。', vertices, faces, graph: foldedGraph, startingFace }, layers: { status: 'unknown', message: '正在独立求解层序。' }, warnings: [] };
  } catch(e) {return emptyFoldResult('error',`平折几何计算失败：${e instanceof Error?e.message:String(e)}`);}
}

/** Synchronous engine. Call in a Worker in the app; worker termination enforces cancellation/timeouts. */
function computeFlatFoldInternal(doc: Doc, onGeometry?: (result: FlatFoldResult) => void, options: FlatFoldOptions = {}, onSource?: (graph: FoldGraph) => void): FlatFoldResult {
  let result = emptyFoldResult('invalid', '尚未生成平折几何。');
  try {
    if(hasMaterialTopology(doc)){
      const material=inspectMaterialTopology(doc);
      if(material.ok&&hasWeakMaterialRings(material.graph)&&hasUnresolvedMaterialHinge(material.graph))return emptyFoldResult('unsupported',hasWeakMaterialBanks(material.graph)?'材料切口中仍有同面悬空山谷线，当前仅CP；先补齐分面或删除，再计算平折。':'材料含自由端点或单桥，当前仅CP；先连接或删除这些折痕，再计算平折。');
    }
    reportFlatComputationProgress({stage:'diagnostics',label:'检查折痕与纸张边界'});
    const report = diagnose(doc);
    const errors = report.issues.filter(i => i.severity === 'error');
    const geometryErrors = errors.filter(i => i.code !== 'maekawa');
    if (geometryErrors.length) return emptyFoldResult('invalid', `无法生成平折几何：${geometryErrors[0].message}`);
    reportFlatComputationProgress({stage:'topology',label:'建立折痕与纸面关联'});
    const { graph, warnings } = buildFold(doc,{flatCreases:options.flatCreases}), faces = graph.faces_vertices ?? [], eps = epsilonFor(doc);
    onSource?.(graph);
    reportFlatComputationProgress({stage:'geometry',label:'计算折后位置'});
    result=hasMaterialTopology(doc)?computeMaterialFlatGeometry(doc,options.startingFace):computeFlatGeometry(graph,eps,options);
    if(result.geometry.status!=='ready')return result;
    result.warnings=[...warnings,...result.warnings];
    if (doc.segments.some(s => s.assignment === 'M' || s.assignment === 'V') && doc.segments.some(s => s.angle !== null && ![0, 180, -180].includes(s.angle))) result.warnings.push('平折模式按 ±180° 计算；自定义目标角没有被覆盖，仍保留于工程。');
    onGeometry?.(structuredClone(result));
    if (errors.some(i => i.code === 'maekawa')) { result.layers = { status: 'no-solution', message: '山谷数量不满足前川必要条件；在当前完全平折与山谷指派下不存在层序解。',conflicts:maekawaConflicts(errors,graph,eps) }; return result; }
    if (graph.edges_assignment.includes('U')) { result.layers = { status: 'unknown', message: '存在未指派山谷线。当前仅展示其完全折叠的几何候选，尚未求解山谷分配与层序。' }; return result; }
    const finiteRegions=flatCreaseLayerRegions(result.geometry.graph!,eps);
    if(finiteRegions)return solveFiniteFlatCreaseLayers(result,finiteRegions,eps,options.solutionIndex,options.constraints??[],options.layerAdjustment,options.layerPreferences,undefined,options.relativeConstraints);
    if (hasWeakMaterialRings(graph)||graph.faces_holes?.some(rs=>rs.length)||faces.some(face => !isConvex(face.map(v => graph.vertices_coords[v]), eps))) return solveConcaveLayerGeometry(result,eps,options.solutionIndex,options.constraints??[],options.layerAdjustment,options.layerPreferences,options.relativeConstraints);
    return solveLayerGeometry(result, eps, options.solutionIndex, options.constraints ?? [],options.layerAdjustment,options.layerPreferences,undefined,undefined,options.relativeConstraints);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (result.geometry.status !== 'ready') return emptyFoldResult('error', `平折引擎错误：${message}`);
    result.layers = message.includes('no solution possible') ? { status: 'no-solution', message: '约束传播证明当前山谷指派没有层序解。',conflicts:conflictsFromLayerError(e,result.geometry.faces.length) } : { status: 'error', message: `层序引擎未完成：${message}` };
    return result;
  }
}

/** Reanalyse existing model coordinates; never reconstruct from the source crease document. */
function recomputeFlatLayersInternal(input: FlatFoldResult, options:Pick<FlatFoldOptions,'solutionIndex'|'constraints'|'layerAdjustment'|'layerPreferences'|'relativeConstraints'>={}): FlatFoldResult {
  const referenceOrders=options.layerAdjustment&&input.layers.solutionIndex===undefined?input.layers.faceOrders:undefined;
  const result=structuredClone(input);
  result.layers={status:'unknown',message:'正在重新分析当前模型几何的层序。'};
  try {
    const {vertices,faces,graph}=result.geometry;
    if(result.geometry.status!=='ready'||!graph||!vertices.length||!faces.length)throw new Error('没有可重新分析的完整模型。');
    if(vertices.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('模型顶点坐标无效。');
    const validIndex=(v:number)=>Number.isInteger(v)&&v>=0&&v<vertices.length;
    const weak=hasWeakMaterialRings(graph);
    if(faces.some(f=>f.length<3||!weak&&new Set(f).size!==f.length||f.some(v=>!validIndex(v)))||
      graph.edges_vertices.some(e=>e.length!==2||e.some(v=>!validIndex(v)))||
      graph.edges_assignment.length!==graph.edges_vertices.length||graph.edges_foldAngle.length!==graph.edges_vertices.length||
      graph.edges_assignment.some(a=>!['B','M','V','F','U'].includes(a)))throw new Error('模型面或边的拓扑无效。');
    if(JSON.stringify(graph.faces_vertices)!==JSON.stringify(faces)||JSON.stringify(graph.vertices_coords)!==JSON.stringify(vertices))throw new Error('模型显示坐标与计算图不一致。');
    const {minX,minY,maxX,maxY}=pointBounds(vertices);
    const eps=Math.max(1e-6,Math.max(maxX-minX,maxY-minY)*1e-8);
    if(graph.edges_vertices.some(([a,b])=>distance(vertices[a],vertices[b])<=eps))throw new Error('模型含零长边，请调整顶点后再分析。');
    const finiteRegions=flatCreaseLayerRegions(graph,eps);
    if(finiteRegions){
      if(graph.edges_assignment.includes('U')){result.layers={status:'unknown',message:'模型含未指派山谷边，尚未完成层序求解。'};return result;}
      const solved=solveFiniteFlatCreaseLayers(result,finiteRegions,eps,options.solutionIndex,options.constraints??input.layers.constraints??[],options.layerAdjustment,options.layerPreferences,referenceOrders,options.relativeConstraints);
      if(solved.layers.status==='solved'&&result.geometry.modified&&!options.layerAdjustment)solved.layers.message='已找到修改后模型的层序解；这不证明原折痕能等距折成该形状，也不证明连续路径可行。';return solved;
    }
    if(weak){
      materialLayerRegions(graph,eps);
      if(graph.edges_assignment.includes('U')){result.layers={status:'unknown',message:'模型含未指派山谷边，尚未完成层序求解。'};return result;}
      const solved=solveConcaveLayerGeometry(result,eps,options.solutionIndex,options.constraints??input.layers.constraints??[],options.layerAdjustment,options.layerPreferences,options.relativeConstraints);
      if(solved.layers.status==='solved'&&result.geometry.modified&&!options.layerAdjustment)solved.layers.message='已找到修改后弱边界模型的层序解；这不证明原折痕能等距折成该形状，也不证明连续路径可行。';return solved;
    }
    // Checking every vertex against every edge also excludes self-crossing star polygons.
    let concave=!!graph.faces_holes?.some(rs=>rs.length);
    for(const face of faces){
      const points=face.map(v=>vertices[v]),area=polygonArea(points),sign=Math.sign(area),convex=isConvex(points,eps);
      if(Math.abs(area)<=eps*eps||!convex||points.some((a,i)=>{
        const b=points[(i+1)%points.length],edge=sub(b,a),length=distance(a,b);
        return length<=eps||points.some(p=>sign*cross(edge,sub(p,a)) < -eps*length);
      })){
        if(!convex&&isSimpleLayerPolygon(points,eps))concave=true;
        else {result.layers={status:'unsupported',message:'修改后的模型含自交面或退化面，当前层序引擎不能可靠分析。'};return result;}
      }
    }
    if(graph.edges_assignment.includes('U')){result.layers={status:'unknown',message:'模型含未指派山谷边，尚未完成层序求解。'};return result;}
    delete graph.faceOrders;delete graph.faces_normal;delete graph.faces_matrix;delete graph.faces_matrix2;
    const solved=concave?solveConcaveLayerGeometry(result,eps,options.solutionIndex,options.constraints??input.layers.constraints??[],options.layerAdjustment,options.layerPreferences,options.relativeConstraints):solveLayerGeometry(result,eps,options.solutionIndex,options.constraints??input.layers.constraints??[],options.layerAdjustment,options.layerPreferences,referenceOrders,undefined,options.relativeConstraints);
    if(solved.layers.status==='solved'&&result.geometry.modified&&!options.layerAdjustment)solved.layers.message='已找到修改后模型的层序解；这不证明原折痕能等距折成该形状，也不证明连续路径可行。';
    return solved;
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    result.layers=message.includes('no solution possible')?{status:'no-solution',message:'约束传播证明当前模型几何与山谷指派没有层序解。',conflicts:conflictsFromLayerError(e,result.geometry.faces.length)}:{status:'error',message:`模型层序重新分析未完成：${message}`};
    return result;
  }
}

/** Required relationships survive every solver route and are checked again
 * before a result can be published. No fallback may silently discard them. */
export function computeFlatFold(doc:Doc,onGeometry?: (result:FlatFoldResult)=>void,options:FlatFoldOptions={},onSource?:(graph:FoldGraph)=>void):FlatFoldResult {
  const required=options.relativeConstraints??[];
  const result=certifyRelativeLayerConstraints(computeFlatFoldInternal(doc,onGeometry?result=>onGeometry(certifyRelativeLayerConstraints(result,required)):undefined,options,onSource),required);
  return withConflictExplanation(certifyRelativeLayerConstraints(selfDiagnoseLayers(result,epsilonFor(doc)),required));
}
export function recomputeFlatLayers(input:FlatFoldResult,options:Pick<FlatFoldOptions,'solutionIndex'|'constraints'|'layerAdjustment'|'layerPreferences'|'relativeConstraints'>={}):FlatFoldResult {
  const required=options.relativeConstraints??input.layers.relativeConstraints??[];
  const result=certifyRelativeLayerConstraints(recomputeFlatLayersInternal(input,{...options,relativeConstraints:required}),required);
  const bounds=pointBounds(result.geometry.vertices),span=Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY);
  return withConflictExplanation(certifyRelativeLayerConstraints(selfDiagnoseLayers(result,Math.max(1e-6,span*1e-8)),required));
}
function selfDiagnoseLayers(result:FlatFoldResult,eps:number):FlatFoldResult{
  return diagnoseFlatLayerCoverage(result,options=>{
    const sourceGraph=result.geometry.graph;
    if(!sourceGraph)throw Error('缺少接触约束图，不能安全补全层序关系。');
    // Completion must use the same area-only graph as the initial solve.
    // Drawing marks and finite F walks have no hinge incidence; keep them in
    // the public snapshot, but not in the private contact-constraint graph.
    const graph=flatCreaseLayerRegions(sourceGraph,eps)??sourceGraph;
    if(graph.zhezhi_flatCreases==='marks'||graph.faces_holes?.some(holes=>holes.length)||hasWeakMaterialRings(graph)||
      graph.faces_vertices!.some(face=>!isConvex(face.map(v=>graph.vertices_coords[v]),eps)))return solveConcaveLayerCandidate(graph,eps,options);
    const geometry=convexLayerGeometry(graph,eps);
    return solveConvexLayerCandidate(geometry.graph,geometry.epsilon,options);
  });
}
function withConflictExplanation(result:FlatFoldResult):FlatFoldResult{
  if(result.layers.status==='no-solution'&&!result.layers.conflicts?.length)result.layers.conflicts=[makeLayerConflict('global','constraint',[])];
  return result;
}
