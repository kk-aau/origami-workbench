import {defaultAngle,type Assignment,type Doc,type Point,type Segment} from '../core/types';
import {distance,epsilonFor} from '../core/geometry';
import { localFlatAnalysis } from './localFlatFold';
import {finishFoldableInput,type FoldableInput} from './foldableInput';

export type FoldableDrawMode = 'foldable' | 'free';

/**
 * Mode 71 dispatches odd-degree existing vertices to the local foldable-line
 * input and keeps every other start point on the ordinary free-line path.
 * Invalid or ambiguous topology must not trap the user in a construction mode;
 * it deliberately falls back to a normal line.
 */
export function foldableDrawMode(doc: Doc, origin: Point, preset: Assignment): FoldableDrawMode {
  try {
    const result = localFlatAnalysis(doc, origin, preset);
    return result.degree % 2 === 1 && result.candidates.length > 0 ? 'foldable' : 'free';
  } catch {
    return 'free';
  }
}

/** Resolve the supplement from existing rays, independently of the drawing preset. */
export function foldableDrawAssignment(doc:Doc,origin:Point):Pick<Segment,'assignment'|'angle'>{
  const {degree,sourceIds}=localFlatAnalysis(doc,origin,'M');
  if(!degree||degree%2===0)throw new Error('自动补线需要已有奇数度顶点，请重新选择起点。');
  const ids=new Set(sourceIds),sources=doc.segments.filter(s=>ids.has(s.id));
  if(degree===1)return{assignment:sources[0].assignment,angle:sources[0].angle};
  if(sources.some(s=>s.assignment!=='M'&&s.assignment!=='V'))throw new Error('该交点含边界或未指派线，无法自动确定山谷；请先明确相邻折痕的山谷类型。');
  const eps=epsilonFor(doc);
  // An unsplit segment through the vertex contributes two incident rays.
  const difference=sources.reduce((sum,s)=>sum+(s.assignment==='M'?1:-1)*(Number(distance(origin,s.a)>eps)+Number(distance(origin,s.b)>eps)),0);
  const choices=(['M','V'] as const).filter(type=>Math.abs(difference+(type==='M'?1:-1))===2);
  if(choices.length!==1)throw new Error('现有山谷数量无法通过补一条线配平，请先调整相邻折痕。');
  return{assignment:choices[0],angle:defaultAngle(choices[0])};
}

export function finishFoldableDraw(doc:Doc,state:FoldableInput,target?:Segment):Omit<Segment,'id'>{
  const type=foldableDrawAssignment(doc,state.origin);
  return{...finishFoldableInput(state,type.assignment,target,epsilonFor(doc)),...type};
}
