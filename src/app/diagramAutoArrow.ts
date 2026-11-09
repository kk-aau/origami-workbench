import {epsilonFor} from '../core/geometry';
import {materialFaceInside} from '../core/materialRings';
import type {Point} from '../core/types';
import {prepareSimulationDocument} from '../engine/simmodel';
import {createSimulationStepRigidDriver} from '../engine/simStepRigid';
import type {DiagramProject} from './diagramProject';
import type {DiagramSymbolAnnotation} from './diagramAnnotations';
import {buildDiagramStepAnimation} from './diagramStepAnimation';
import {isDiagramPaperPoseIsometric} from './diagramPaperState';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {pickDiagramFoldAnchor} from './diagramFoldLink';
import {modelProjection} from './modelProjection';
import {bindDiagramArrow,fitDiagramArrow} from './diagramPaperBinding';

type V3=[number,number,number];
const point=(p:ArrayLike<number>,v:number):V3=>[p[v*3],p[v*3+1],p[v*3+2]];
const mean=(points:V3[]):V3=>[0,1,2].map(axis=>points.reduce((sum,p)=>sum+p[axis],0)/points.length) as V3;
const distance=(a:ArrayLike<number>,b:ArrayLike<number>)=>Math.hypot(...Array.from(a,(n,i)=>n-b[i]));
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export interface DiagramAutoArrow {
  annotation:DiagramSymbolAnnotation;
  action:'fold'|'precrease'|'unfold';
  sourceFace:number;
  axis:[Point,Point];
  warnings:string[];
}

/** A single-axis instruction is derived from the exact material motion already
 * used by step animation. No CP IDs are matched across rebuilt snapshots and
 * no new physical folds or layer certificates are created by this operation. */
export function createDiagramAutoArrow(project:DiagramProject,stepId:string,style:{id?:string;color?:string;width?:number}={}):DiagramAutoArrow {
  const step=project.steps.find(s=>s.id===stepId),pose=step?.pose;
  if(!step||!pose||step.paperVisible===false)throw Error('请先计算并显示操作前折图，再生成主箭头。');
  const before=project.states.find(s=>s.id===step.beforeId);
  if(!before||pose.sourceStateId!==before.id||pose.sourceRevision!==before.revision||!same(pose.sourceDoc,before.doc))throw Error('当前折图不是最新的操作前姿态，请重新计算操作前 CP。');
  if(step.paperStates?.active==='pulled'||!isDiagramPaperPoseIsometric(pose))throw Error('请先切回平整状态或立体状态，再生成主箭头；生成后可继续修形。');
  if(pose.spatial)throw Error('自动主箭头目前用于平面起态的单轴折叠；空间起态请手工放置箭头。');
  let clip:ReturnType<typeof buildDiagramStepAnimation>;
  try{clip=buildDiagramStepAnimation(project,stepId);}catch(error){throw Error(`无法生成主箭头：${error instanceof Error?error.message:String(error)}`);}
  const {prepared}=prepareSimulationDocument(clip.fold),animation=clip.animation,seed=animation.initialPositions;
  if(animation.flexRequest||animation.flex||animation.dynamic)throw Error('本步包含局部柔性动作，请手工放置主箭头。');
  const active=animation.ranges.filter(r=>r.fromAngle!==r.toAngle||r.viaAngle!==undefined&&r.viaAngle!==r.fromAngle);
  if(!active.length)throw Error('操作前后没有折叠变化，请先设置本步折痕。');
  const mode=(r:typeof active[number]):DiagramAutoArrow['action']|null=>r.fromAngle===0&&Math.abs(r.toAngle)>0&&r.viaAngle===undefined?'fold':
    r.fromAngle===0&&r.toAngle===0&&Math.abs(r.viaAngle??0)>0?'precrease':Math.abs(r.fromAngle)===180&&r.toAngle===0&&r.viaAngle===undefined?'unfold':null;
  const action=mode(active[0]);
  if(!action||active.some(r=>mode(r)!==action))throw Error('本步包含不同阶段的动作。请拆步或手工放置主箭头。');
  const timing=(edge:number)=>{const t=animation.timings?.find(t=>t.edge===edge);return [t?.start??0,t?.end??1];};
  if(active.some(r=>!same(timing(r.edge),timing(active[0].edge))))throw Error('本步折痕分时启动，请分别放置动作箭头。');
  // All driven hinges must be the same line in the actual starting pose,
  // even when an already-folded stack gives them opposite M/V assignments.
  const [first,last]=prepared.edgesVertices[active[0].edge].map(v=>point(seed,v)),dx=last[0]-first[0],dz=last[2]-first[2],axisLength=Math.hypot(dx,dz),tolerance=2e-5;
  if(axisLength<tolerance||Math.abs(last[1]-first[1])>tolerance||Array.from({length:prepared.vertexCount},(_,v)=>Math.abs(seed[v*3+1]-first[1])).some(n=>n>tolerance))throw Error('本步起态或折轴不在同一平面，请手工放置箭头。');
  const axisDistance=(p:V3)=>(dx*(p[2]-first[2])-dz*(p[0]-first[0]))/axisLength;
  if(active.some(r=>prepared.edgesVertices[r.edge].some(v=>Math.abs(axisDistance(point(seed,v)))>tolerance)))throw Error('检测到多个折轴，不能用一个主箭头概括；请拆步或手工放置。');
  const targetAngles=animation.ranges.map(r=>action==='precrease'&&r.viaAngle!==undefined?r.viaAngle:r.toAngle),middleAngles=animation.ranges.map((r,i)=>(r.fromAngle+targetAngles[i])/2);
  const excursion=(r:typeof active[number])=>Math.abs((action==='precrease'?r.viaAngle!:r.toAngle)-r.fromAngle),degrees=excursion(active[0]);
  if(active.some(r=>Math.abs(excursion(r)-degrees)>1e-8))throw Error('本步各纸瓣的转动角度不同，请分别放置主箭头。');
  const angle=degrees*Math.PI/180;
  let middle:Float32Array,end:Float32Array;
  try{const drive=createSimulationStepRigidDriver(prepared,animation);middle=drive(middleAngles);end=drive(targetAngles);}
  catch(error){throw Error(`本步不能保持单轴刚性运动：${error instanceof Error?error.message:String(error)}`);}
  const moving=new Set<number>();let direction=0;
  for(let v=0;v<prepared.vertexCount;v++){
    const a=point(seed,v),b=point(end,v),m=point(middle,v);
    if(distance(a,b)<=tolerance){if(distance(a,m)>tolerance)throw Error('本步有额外往返动作，请分别放置箭头。');continue;}
    const d=axisDistance(a),foot:V3=[a[0]+dz*d/axisLength,a[1],a[2]-dx*d/axisLength];
    const planarError=(p:V3,t:number)=>Math.hypot(p[0]-foot[0]-(a[0]-foot[0])*Math.cos(t),p[2]-foot[2]-(a[2]-foot[2])*Math.cos(t));
    if(planarError(b,angle)>tolerance||planarError(m,angle/2)>tolerance||Math.abs(Math.abs(b[1]-a[1])-Math.abs(d)*Math.sin(angle))>tolerance||Math.abs(Math.abs(m[1]-a[1])-Math.abs(d)*Math.sin(angle/2))>tolerance)throw Error('本步移动不能归为一个单轴动作，请手工放置箭头。');
    const sign=Math.sign(m[1]-a[1]);if(direction&&sign!==direction)throw Error('本步纸面向两个方向移动，请分别放置箭头。');direction=sign;moving.add(v);
  }
  if(!moving.size)throw Error('本步没有可显示的纸面位移，请手工放置动作说明。');
  // Undo the simulator's shared material normalization, then use the SAME
  // drawing camera for both endpoints. Separate auto-fit cameras would invent
  // motion of the stationary side and shrink the actual displacement.
  const original=prepared.originalPositions,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let v=0;v<prepared.vertexCount;v++)for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],original[v*3+axis]);max[axis]=Math.max(max[axis],original[v*3+axis]);}
  const center=min.map((n,i)=>(n+max[i])/2);let radius=0;
  for(let v=0;v<prepared.vertexCount;v++)radius=Math.max(radius,distance(point(original,v),center));
  const projection=modelProjection(pose.result.geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0,pose.view?.projectionCenter),display=(p:V3):Point=>projection.project([p[0]*radius+center[0],-p[2]*radius-center[2]]);
  const mesh=diagramIllustrationMesh(pose),eps=epsilonFor(pose.sourceDoc)*20;
  const candidates=prepared.facesVertices.flatMap(vertices=>{
    if(!vertices.some(v=>moving.has(v)))return [];
    const cp=mean(vertices.map(v=>prepared.fold.vertices_coords[v] as V3)),materialPoint:Point=[cp[0],-cp[2]],sourceFace=mesh.baseGraph.faces_vertices!.findIndex((_,f)=>materialFaceInside(mesh.baseGraph,f,materialPoint));
    if(sourceFace<0||pose.hiddenFaces?.includes(sourceFace))return [];
    const start=display(mean(vertices.map(v=>point(seed,v)))),finish=display(mean(vertices.map(v=>point(end,v))));
    if(distance(start,finish)<eps)return [];
    // The unqualified picker succeeds only with certified local order (or one
    // unambiguous face). It never treats the fallback numbering as visibility.
    try{if(distance(pickDiagramFoldAnchor(pose,start,undefined,before).point,materialPoint)>eps)return [];}catch{return [];}
    const [a,b,c]=vertices.map(v=>prepared.fold.vertices_coords[v]),area=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]));
    return [{start,finish,sourceFace,score:distance(start,finish)*Math.sqrt(area)}];
  }).sort((a,b)=>b.score-a.score||a.sourceFace-b.sourceFace);
  const best=candidates[0];if(!best)throw Error('找不到层序明确且可见的移动纸面。请确认层序、显示移动纸面，或调整固定侧后重试。');
  const symbol=action==='precrease'?'unfold':action==='unfold'?'pull':direction*(pose.view?.side==='back'?-1:1)>0?'fold':'mountainFold';
  const annotation=bindDiagramArrow(pose,fitDiagramArrow({id:style.id??crypto.randomUUID(),kind:'symbol',symbol,position:[0,0],size:30,rotation:0,color:style.color??'#293d35',width:style.width??.7,cadProperties:{}},best.start,best.finish),best.sourceFace);
  return {annotation,action,sourceFace:best.sourceFace,axis:[display(first),display(last)],warnings:clip.warnings??[]};
}
