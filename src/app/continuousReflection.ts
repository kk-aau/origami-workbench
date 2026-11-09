import type { Assignment, Doc, Point, Segment } from '../core/types';
import { defaultAngle, validateDoc } from '../core/types';
import { cross, distance, epsilonFor, pointOnSegment, splitIntersections, sub } from '../core/geometry';
import { reflectionEnd } from './reflection';
import { uncoveredCopies } from './mirror';
import {applyDrawingFoldAngle} from './foldAngles';
import {localFlatAnalysis} from './localFlatFold';
import {generatedAssignment,swapGeneratedLines} from './drawingSwap';

export type ReflectionStop = 'boundary' | 'vertex' | 'closed' | 'no-hit' | 'selected' | 'choice';
export interface ContinuousReflectionDirectionChoice {segmentIndex:number;point:Point;direction:Point}
export interface ContinuousReflectionJunction {
  segmentIndex:number;point:Point;
  candidates:{direction:Point;degrees:number;assignment:Assignment;end:Point}[];
  message:string;
}
export interface ContinuousReflectionOptions {
  /** Defaults to the original alternating M/V construction. */
  alternateAssignments?:boolean;
  /** Reverse the completed assignment sequence before checking existing coverage. */
  swapGenerated?:boolean;
  /** Zero-based leg in the computed path, with a point on that finite leg. */
  endpoint?:{point:Point;segmentIndex:number};
  /** Explicit choices at ambiguous vertices, indexed by the incoming leg. */
  junctionChoices?:readonly ContinuousReflectionDirectionChoice[];
}
const STOP: Record<ReflectionStop,string> = {
  boundary:'已到纸张边界',vertex:'该顶点暂无可继续的局部角度方向',closed:'已回到闭环交点',
  'no-hit':'后续方向没有截止线；仅保留已到达实际交点的有限路径',
  selected:'已到指定终点',
  choice:'请选择交点后的局部角度候选方向',
};
const unit=(p:Point):Point=>{const n=Math.hypot(...p);return[p[0]/n,p[1]/n];};
const parallel=(a:Point,b:Point)=>Math.abs(cross(a,b))<=1e-9;
const validPoint=(p:Point)=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6);
function nearestHit(origin:Point,direction:Point,reference:readonly Segment[],eps:number):Point|undefined {
  let nearest:Point|undefined,minDistance=Infinity;
  for(const target of reference){
    try{const hit=reflectionEnd({origin,direction},target,eps),d=distance(origin,hit);if(d<minDistance){minDistance=d;nearest=hit;}}
    catch{/* Parallel, behind, through-origin and extension-only targets are not hits. */}
  }
  return nearest;
}

/** Complete the local angular star with its incoming construction leg. This
 * is a drawing suggestion, not an M/V or global flat-foldability certificate. */
function junctionDirections(doc:Doc,point:Point,incoming:Point,incident:readonly Segment[],reference:readonly Segment[],assignment:Assignment,eps:number):{candidates:ContinuousReflectionJunction['candidates'];message:string} {
  const rays:{direction:Point;end:Point}[]=[];
  const add=(end:Point)=>{
    if(distance(point,end)<=eps)return;
    const direction=unit(sub(end,point));
    if(!rays.some(ray=>distance(ray.direction,direction)<=2e-8))rays.push({direction,end});
  };
  for(const segment of incident){add(segment.a);add(segment.b);}add(incoming);
  // The star represents construction directions, even when the new path is
  // drawn as auxiliary/flat ink. Assignments remain the user's chosen preset.
  const star:Doc={name:doc.name,paper:doc.paper,segments:rays.map((ray,index)=>({id:`continuous-star-${index}`,a:[...point],b:[...ray.end],assignment:'U',angle:null}))};
  const local=localFlatAnalysis(star,point,assignment);
  if(local.degree%2===0)return {candidates:[],message:'该交点加入入射方向后为偶数度，无法只补一条非重合方向满足局部交替角和。'};
  if(!local.candidates.length)return {candidates:[],message:'该交点没有满足局部交替角和的非退化续线方向。'};
  const candidates=local.candidates.flatMap(candidate=>{
    const end=nearestHit(point,candidate.direction,reference,eps);
    return end?[{direction:candidate.direction,degrees:candidate.degrees,assignment,end}]:[];
  });
  return {candidates,message:candidates.length?`此交点有 ${candidates.length} 个局部角度候选；仅表示构造方向，不代表已验证平折。`:'局部角度候选的前方没有实际折线或纸边截止，未继续生成无限线。'};
}

/** Mode 52: reflect the PREVIOUS origin about the hit crease, not the forward
 * vector (ordinary optical reflection would incorrectly reverse the path). */
export function continuousReflection(doc:Doc,start:Point,toward:Point,preset:Assignment,drawingAngle?:number|null,options:ContinuousReflectionOptions={}){
  validateDoc(doc);const eps=epsilonFor(doc);
  if([start,toward].some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('连续折射的起点或方向点坐标无效。');
  if(distance(start,toward)<=eps)throw new Error('方向点不能与起点重合或过近。');
  if(options.alternateAssignments!==undefined&&typeof options.alternateAssignments!=='boolean')throw new Error('山谷交替选项无效。');
  const endpoint=options.endpoint;
  if(endpoint&&(!Number.isSafeInteger(endpoint.segmentIndex)||endpoint.segmentIndex<0||!Array.isArray(endpoint.point)||endpoint.point.length!==2||endpoint.point.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('连续折射的指定终点无效。');
  const choices=new Map<number,ContinuousReflectionDirectionChoice>();
  for(const choice of options.junctionChoices??[]){
    if(!Number.isSafeInteger(choice.segmentIndex)||choice.segmentIndex<0||!validPoint(choice.point)||!validPoint(choice.direction)||Math.hypot(...choice.direction)<1e-12||choices.has(choice.segmentIndex))throw new Error('连续折射的交点方向选择无效。');
    choices.set(choice.segmentIndex,choice);
  }
  const reference=splitIntersections(doc).segments.filter(s=>s.assignment!=='F'); // A already omitted; flat subdivision is not a mirror.
  const path:Segment[]=[],sources:Segment[]=[];
  let origin:Point=[...start],direction=unit(sub(toward,start)),firstHit:Point|undefined;
  let stop:ReflectionStop='no-hit';
  let pendingJunction:ContinuousReflectionJunction|undefined,stopMessage:string|undefined;
  const visited:{point:Point;direction:Point}[]=[];
  // A non-terminating ray must not block the editor indefinitely. This is a
  // computation deadline, independent of how many creases a document contains.
  const deadline=performance.now()+3000;
  for(let step=0;;step++){
    if(performance.now()>deadline)throw new Error('连续折射计算超时，尚未找到终点；请调整方向，整条路径未提交。');
    const nearest=nearestHit(origin,direction,reference,eps);
    if(!nearest){stop='no-hit';break;}
    const assignment=options.alternateAssignments===false||step%2===0?preset:preset==='M'?'V':preset==='V'?'M':preset;
    const segment:Segment={id:`continuous-${step+1}`,a:[...origin],b:[...nearest],assignment,angle:defaultAngle(assignment)};
    if(endpoint?.segmentIndex===step){
      if(distance(origin,endpoint.point)<=eps||!pointOnSegment(endpoint.point,segment,eps))throw new Error('指定终点须位于选中的折射路径段上，且不能与该段起点重合。');
      segment.b=[...endpoint.point];path.push(segment);
      // An interior cutoff has not reached the next reference crease. At a
      // real intersection keep that reference, but never trace beyond it.
      if(distance(endpoint.point,nearest)<=eps)for(const source of reference)if(pointOnSegment(nearest,source,eps))sources.push(source);
      stop='selected';break;
    }
    path.push(segment);
    const incident=reference.filter(s=>pointOnSegment(nearest!,s,eps));
    for(const source of incident)sources.push(source);
    if(incident.some(s=>s.assignment==='B')){stop='boundary';break;}
    if(firstHit&&distance(firstHit,nearest)<=eps){stop='closed';break;}
    firstHit??=[...nearest];
    // Each physical half-edge counts once, including a hit inside an unsplit segment.
    const arms=incident.flatMap(s=>[s.a,s.b].filter(p=>distance(p,nearest!)>eps).map(p=>unit(sub(p,nearest!))));
    let axis:Point|undefined;
    if(arms.length===2&&parallel(arms[0],arms[1])&&!parallel(arms[0],direction))axis=arms[0];
    if(arms.length===3){
      const aligned=arms.filter(a=>parallel(a,direction)),other=arms.filter(a=>!parallel(a,direction));
      if(aligned.length===1&&other.length===2&&parallel(other[0],other[1]))axis=other[0];
    }
    const choice=choices.get(step);let next:Point;
    if(axis){
      const dot=direction[0]*axis[0]+direction[1]*axis[1];
      next=unit([direction[0]-2*dot*axis[0],direction[1]-2*dot*axis[1]]);
      if(choice&&(distance(choice.point,nearest)>eps||distance(unit(choice.direction),next)>2e-8))throw new Error('原交点的折射方向已变化，请重新选择续接方向。');
    }else{
      const nextAssignment=options.alternateAssignments===false||(step+1)%2===0?preset:preset==='M'?'V':preset==='V'?'M':preset;
      const local=junctionDirections(doc,nearest,origin,incident,reference,nextAssignment,eps);
      if(!local.candidates.length){stop='vertex';stopMessage=local.message;break;}
      const selected=choice&&distance(choice.point,nearest)<=eps?local.candidates.find(candidate=>distance(candidate.direction,unit(choice.direction))<=2e-8):undefined;
      if(choice&&!selected)throw new Error('所选交点或折射方向已失效，请在当前候选中重新选择。');
      if(selected)next=selected.direction;
      else if(local.candidates.length===1)next=local.candidates[0].direction;
      else{
        stop='choice';stopMessage=local.message;pendingJunction={segmentIndex:step,point:[...nearest],candidates:local.candidates,message:local.message};break;
      }
    }
    if(visited.some(v=>distance(v.point,nearest!)<=eps&&distance(v.direction,next)<=1e-9)){stop='closed';break;}
    visited.push({point:[...nearest],direction:next});origin=nearest;direction=next;
  }
  if(endpoint&&stop!=='selected')throw new Error('指定终点超出可到达的折射路径，请在当前预览路径上重新选择。');
  if(!path.length)throw new Error('前方没有实际折线或纸边可作为截止，不能生成连续折射。');
  const angledPath=swapGeneratedLines(applyDrawingFoldAngle(path,drawingAngle),options.swapGenerated),copies=uncoveredCopies(doc,angledPath,'continuous');
  if(pendingJunction&&options.swapGenerated)pendingJunction={...pendingJunction,candidates:pendingJunction.candidates.map(candidate=>({...candidate,assignment:generatedAssignment(candidate.assignment,true)}))};
  return{path:angledPath,copies,sources:[...new Map(sources.map(s=>[s.id,s])).values()],stop,stopMessage:stopMessage??STOP[stop],pendingJunction};
}
