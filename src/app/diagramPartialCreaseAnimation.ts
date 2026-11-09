import {distance,pointOnSegment,polygonArea} from '../core/geometry';
import type {FlatFoldResult,FoldGraph,Point,Segment} from '../core/types';
import {prepareSimulationDocument} from '../engine/simmodel';
import {coalescePartialCreaseRoutes} from '../engine/simPartialCreaseMesh';
import {buildPartialCreaseConeMesh,buildPartialCreaseConesMesh} from '../engine/simPartialCreaseConeMesh';
import {simulationSourceSignature} from '../engine/simLayerOrder';
import {validateSimulationStepAnimationStructure,type SimulationStepAnimation} from '../engine/simStepAnimation';
import {applyDiagramFoldMatrix,type DiagramFoldMatrix} from './diagramFoldLink';
import type {DiagramPose,DiagramProject,DiagramStep} from './diagramProject';
import type {DiagramStepAnimationClip} from './diagramStepAnimation';
import {defaultModelColors} from './modelColors';
import {diagramAnimationSourceSegments,diagramAnimationMaterialTimings} from './diagramAnimationTiming';

type Route={segment:Segment;fromAngle:number;toAngle:number;viaAngle?:number};
const contains=(p:Point,polygon:Point[],eps:number)=>{
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i];
    if(pointOnSegment(p,{id:'material',a,b,assignment:'F',angle:0},eps))return true;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
};

/** A finite mark is a material crease, not a cut through its supporting line.
 * The refined topology belongs solely to this isolated animation preview. */
export function buildDiagramPartialCreaseAnimation(input:{project:DiagramProject;step:DiagramStep;pose:DiagramPose;fold:FoldGraph;routes:Route[];polygons:Point[][];matrices:DiagramFoldMatrix[];eps:number}):DiagramStepAnimationClip{
  const {project,step,pose,fold:source,routes,polygons,matrices,eps}=input;
  if(routes.some(r=>r.fromAngle!==r.toAngle))throw Error('局部压痕与改变最终折形的动作请拆成两步：先压出短痕并展开，再进行折叠。');
  const moving=routes.filter(r=>r.viaAngle!==undefined),supports=coalescePartialCreaseRoutes(moving.map(r=>r.segment)),central=supports.length>1;
  if(!supports.length)throw Error('本步没有需要演示的局部短痕。');
  if(supports.length>4)throw Error('局部柔性压痕每步暂支持四组短痕，请拆分更多压痕。');
  const materialCenter:Point=[(Math.min(...source.vertices_coords.map(p=>p[0]))+Math.max(...source.vertices_coords.map(p=>p[0])))/2,(Math.min(...source.vertices_coords.map(p=>p[1]))+Math.max(...source.vertices_coords.map(p=>p[1])))/2];
  let anchor=step.foldLink?.fixed?.point??materialCenter;
  if(!step.foldLink?.fixed&&!polygons.some(poly=>contains(anchor,poly,eps))){
    const centers=polygons.map(poly=>[poly.reduce((s,p)=>s+p[0],0)/poly.length,poly.reduce((s,p)=>s+p[1],0)/poly.length] as Point).filter(p=>polygons.some(poly=>contains(p,poly,eps))).sort((a,b)=>distance(a,materialCenter)-distance(b,materialCenter));
    if(centers[0])anchor=centers[0];
  }
  const boundaries=source.edges_vertices.flatMap(([a,b],e)=>source.edges_assignment[e]==='B'?[{id:'boundary',a:source.vertices_coords[a],b:source.vertices_coords[b],assignment:'B' as const,angle:0}]:[]);
  const boundaryTip=(p:Point)=>boundaries.some(s=>pointOnSegment(p,s,eps));
  if(routes.some(r=>r.fromAngle!==0))throw Error('局部短痕动画暂支持展开纸面及已有折痕标记；已有折叠的局部压痕尚未支持。');
  if(supports.some(s=>boundaryTip(s.a)===boundaryTip(s.b)))throw Error('局部短痕动画暂需一端在纸边、另一端在纸内；两个纸内端点的压痕尚未支持。');
  const mesh=supports.length===1?buildPartialCreaseConeMesh(source,supports[0],{rayCount:17}):buildPartialCreaseConesMesh(source,supports,{rayCount:8});
  const {prepared,warnings}=prepareSimulationDocument(mesh.fold);
  const cp=mesh.materialCoordinates;
  const mapPoint=(point:Point):Point=>{
    const owners=polygons.flatMap((poly,f)=>contains(point,poly,eps)?[f]:[]);
    if(!owners.length)throw Error('局部柔性网格顶点超出原材料纸面。');
    const mapped=owners.map(f=>applyDiagramFoldMatrix(matrices[f],point));
    if(mapped.some(p=>distance(p,mapped[0])>eps*20))throw Error('操作前纸面不连续，无法生成局部压痕。');
    return mapped[0];
  };
  const shown=cp.map(mapPoint),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let v=0;v<prepared.vertexCount;v++)for(let k=0;k<3;k++){min[k]=Math.min(min[k],prepared.originalPositions[v*3+k]);max[k]=Math.max(max[k],prepared.originalPositions[v*3+k]);}
  const center=min.map((p,k)=>(p+max[k])/2);let radius=0;
  for(let v=0;v<prepared.vertexCount;v++)radius=Math.max(radius,Math.hypot(...center.map((p,k)=>prepared.originalPositions[v*3+k]-p)));
  if(radius<=1e-6)throw Error('纸张尺寸过小，无法生成局部柔性压痕。');
  const initialPositions=shown.flatMap(p=>[(p[0]-center[0])/radius,-center[1]/radius,(-p[1]-center[2])/radius]);
  const covers=(a:Point,b:Point,s:Segment)=>pointOnSegment(a,s,eps)&&pointOnSegment(b,s,eps);
  const ranges=prepared.creaseParams.map(crease=>{
    const [a,b]=prepared.edgesVertices[crease.edge],route=routes.find(r=>covers(cp[a],cp[b],r.segment));
    return {edge:crease.edge,fromAngle:route?.fromAngle??0,toAngle:route?.toAngle??0,...(route?.viaAngle!==undefined?{viaAngle:route.viaAngle}:{})};
  });
  for(const route of moving){
    const length=ranges.filter(r=>covers(cp[prepared.edgesVertices[r.edge][0]],cp[prepared.edgesVertices[r.edge][1]],route.segment)).reduce((sum,r)=>{const [a,b]=prepared.edgesVertices[r.edge];return sum+distance(cp[a],cp[b]);},0);
    if(Math.abs(length-distance(route.segment.a,route.segment.b))>eps*20)throw Error('短痕未完整进入局部柔性网格，请调整附近过短线段。');
  }
  const fixed=step.foldLink?.fixed;
  if(fixed){
    if(moving.some(r=>pointOnSegment(fixed.point,r.segment,eps)))throw Error('固定点落在本步短痕上，请在保持不动的区域内部重新指定。');
    const owner=polygons.findIndex(poly=>contains(fixed.point,poly,eps));
    if(owner<0||distance(applyDiagramFoldMatrix(fixed.matrix,fixed.point),applyDiagramFoldMatrix(matrices[owner],fixed.point))>eps*20)throw Error('固定侧参考姿态已变化，请重新选择固定侧。');
  }
  // Pin a local triangle, never every vertex of the original source face:
  // that face itself must be able to bend around an interior crease tip.
  const root=pose.result.geometry.startingFace??0;
  const pointSegmentDistance=(p:Point,s:Segment)=>{
    const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],t=Math.max(0,Math.min(1,((p[0]-s.a[0])*dx+(p[1]-s.a[1])*dy)/(dx*dx+dy*dy)));
    return distance(p,[s.a[0]+t*dx,s.a[1]+t*dy]);
  };
  const candidates=prepared.facesVertices.map((face,f)=>{
    const p:Point=[face.reduce((s,v)=>s+cp[v][0],0)/3,face.reduce((s,v)=>s+cp[v][1],0)/3];
    return {f,p,hasFixed:!fixed||contains(fixed.point,face.map(v=>cp[v]),eps),root:polygons[root]&&contains(p,polygons[root],eps),score:fixed?-distance(p,fixed.point):central?-distance(p,anchor):Math.min(...moving.map(r=>pointSegmentDistance(p,r.segment)))};
  }).filter(c=>c.hasFixed&&!moving.some(r=>pointOnSegment(c.p,r.segment,eps)));
  candidates.sort((a,b)=>(fixed?0:Number(b.root)-Number(a.root))||b.score-a.score||a.f-b.f);
  if(!candidates.length)throw Error('局部压痕缺少可保持不动的材料区域。');
  const fixedVertices=[...prepared.facesVertices[candidates[0].f]];
  if(fixed&&fixedVertices.some(v=>distance(applyDiagramFoldMatrix(fixed.matrix,cp[v]),shown[v])>eps*20))throw Error('固定侧参考方向已变化，请重新选择固定侧后播放。');
  const before=project.states.find(state=>state.id===step.beforeId)!.doc;
  const retainedCreases=prepared.edgesVertices.flatMap(([a,b],e)=>prepared.edgesAssignment[e]==='F'&&before.segments.some(s=>s.assignment==='F'&&covers(cp[a],cp[b],s))?[e]:[]);
  const beforeState=project.states.find(state=>state.id===step.beforeId)!;
  const timings=diagramAnimationMaterialTimings(step.annotations??[],diagramAnimationSourceSegments(step.annotations??[],pose,beforeState,step.foldLink),prepared.edgesVertices,cp,ranges,eps);
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(mesh.fold),initialPositions,ranges,fixedVertices,retainedCreases,flexRequest:{version:1,bendingStiffness:mesh.bendingStiffness},...(timings?{timings}:{})};
  validateSimulationStepAnimationStructure(animation,prepared,animation.sourceSignature);
  const vertices=source.vertices_coords.map(mapPoint),graph:FoldGraph={...structuredClone(source),vertices_coords:vertices};
  delete graph.faces_matrix;delete graph.faces_matrix2;delete graph.faces_normal;
  const initialGeometry:FlatFoldResult={geometry:{status:'ready',message:'局部压痕保持原始材料纸面。',vertices,faces:source.faces_vertices!,graph},layers:{status:'unknown',message:'待确认原始纸层。'},warnings:[]};
  if(pose.result.layers.status==='solved'){
    const parent=source.faces_vertices!.map(face=>polygons.findIndex(poly=>face.every(v=>contains(source.vertices_coords[v],poly,eps))));
    const children=polygons.map((_,p)=>parent.flatMap((id,f)=>id===p?[f]:[])),rows:[number,number,number][]=[];
    for(const [a,b,sign] of pose.result.layers.faceOrders??[]){
      const winding=Math.sign(polygonArea(pose.result.geometry.faces[b].map(v=>pose.result.geometry.vertices[v])));
      for(const first of children[a]??[])for(const second of children[b]??[]){
        const childWinding=Math.sign(polygonArea(source.faces_vertices![second].map(v=>vertices[v])));
        if(!winding||!childWinding)throw Error('局部压痕的初态纸面退化。');
        rows.push([first,second,sign*winding*childWinding]);
        if(rows.length>1_000_000)throw Error('局部压痕的原纸层关系过多。');
      }
    }
    initialGeometry.layers={status:'solved',message:'保持当前主图选定的材料层序。',faceOrders:rows};
  }
  warnings.push('本步采用局部柔性压痕近似演示：短痕周围形成可展曲面，中途压至 90°后精确展开；辅助网格不写入 CP。');
  const index=project.states.findIndex(s=>s.id===step.beforeId);
  return {fold:mesh.fold,animation,initialGeometry,finalGeometry:structuredClone(initialGeometry),colors:structuredClone(step.pose?.view?.colors??defaultModelColors()),beforeLabel:`CP${index}`,afterLabel:`CP${index+1}`,warnings};
}
