import {defaultAngle,type Doc,type Point,type Segment,type Assignment} from '../core/types';
import {distance,epsilonFor} from '../core/geometry';
import {localFlatAnalysis} from './localFlatFold';
import {angleRayCutoff} from './angleSystem';
import {distanceToSegment} from './state';

/** Mode 39 combines angular suggestions with replaceable endpoint input. No document mutations. */
export interface FoldableInput {origin:Point;end:Point|null;suggestions:Point[];degree:number}
function valid(p:Point){if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('输入点坐标无效或超出范围。');}
export function beginFoldableInput(doc:Doc,origin:Point,previewLength:number):FoldableInput{
  valid(origin);if(!Number.isFinite(previewLength)||previewLength<=epsilonFor(doc)||previewLength>1e6)throw new Error('候选显示长度必须为有效正数。');
  const result=localFlatAnalysis(doc,origin,'M');
  const suggestions:Point[]=result.candidates.map(c=>[origin[0]+previewLength*c.direction[0],origin[1]+previewLength*c.direction[1]]);
  // These candidate endpoints can become actual user-confirmed endpoints, so validate them too.
  suggestions.forEach(valid);
  return{origin:[...origin],end:suggestions.length===1?[...suggestions[0]]:null,suggestions,degree:result.degree};
}
export function chooseFoldableDirection(state:FoldableInput,index:number):FoldableInput{
  if(!Number.isInteger(index)||!state.suggestions[index])throw new Error('请选择有效的补线候选。');
  return setFoldableEndpoint(state,state.suggestions[index]);
}
/** A pointer shared by two equally near candidates must not choose by array order. */
export function pickFoldableDirection(state:Pick<FoldableInput,'origin'|'suggestions'>,position:Point,radius:number,ambiguityTolerance=1e-6):number|null{
  valid(position);
  if(!Number.isFinite(radius)||radius<0||!Number.isFinite(ambiguityTolerance)||ambiguityTolerance<0)throw new Error('候选拾取范围无效。');
  const hits=state.suggestions.map((end,index)=>({index,distance:distanceToSegment(position,{a:state.origin,b:end})}))
    .filter(hit=>hit.distance<=radius).sort((a,b)=>a.distance-b.distance);
  if(hits.length>1&&Math.abs(hits[0].distance-hits[1].distance)<=ambiguityTolerance)throw new Error('多个补线方向同样接近，请靠近一条紫色方向，或使用候选编号。');
  return hits[0]?.index??null;
}
export function setFoldableEndpoint(state:FoldableInput,end:Point,eps=1e-6):FoldableInput{
  valid(state.origin);valid(end);if(distance(state.origin,end)<=eps)throw new Error('终点不能与起点重合。');
  return{...state,end:[...end]};
}
/** Unlike mode 38, mode 39 ALWAYS uses the current drawing preset, even for degree one. */
export function finishFoldableInput(state:FoldableInput,preset:Assignment,target?:Segment,eps=1e-6):Omit<Segment,'id'>{
  if(!state.end)throw new Error('请先选择候选方向或指定终点，再确认生成。');
  const checked=setFoldableEndpoint(state,state.end,eps),origin=checked.origin,end=checked.end!;
  const b=target?angleRayCutoff(origin,[end[0]-origin[0],end[1]-origin[1]],target,eps):[...end] as Point;
  return{a:[...origin],b,assignment:preset,angle:defaultAngle(preset)};
}
