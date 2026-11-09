import {collinearOverlap,distance,epsilonFor} from '../core/geometry';
import {defaultAngle,validateDoc,type Assignment,type Doc,type Point,type Segment} from '../core/types';
import {splitEditableSegmentsWithMap} from './planarize';
import {overlayDrawnSegments} from './drawOverlay';
import {applyDrawingFoldAngle} from './foldAngles';

export interface RadicalTerm {a:number;b:number;c:number}
export type DrawDivision={kind:'equal';count:number}|{kind:'ratio';s:RadicalTerm;t:RadicalTerm};
export const defaultDrawRatio=():Extract<DrawDivision,{kind:'ratio'}>=>({kind:'ratio',s:{a:1,b:0,c:0},t:{a:0,b:1,c:2}});

/** Evaluate a + b√c without mutating parameters on a negative result. */
export function radicalValue(term:RadicalTerm):number{
  if(!term||![term.a,term.b,term.c].every(n=>typeof n==='number'&&Number.isFinite(n))||term.c<0)
    throw new Error('比例系数须为有限数，根号内数值不能为负。');
  const value=term.a+term.b*Math.sqrt(term.c);
  if(!Number.isFinite(value))throw new Error('根式比例计算溢出，请减小系数。');
  return value;
}

/** Parameter from the press/start point toward release/end, matching mode 28. */
export function drawRatioParameter(s:RadicalTerm,t:RadicalTerm):number|null{
  const left=radicalValue(s),right=radicalValue(t);
  if(left===0&&right===0)return null;
  // Scale first: two valid large weights must not overflow their sum.
  const scale=Math.max(Math.abs(left),Math.abs(right)),a=left/scale,b=right/scale;
  if(a+b===0)throw new Error('两项比例之和为零，无法确定有限分点。');
  const result=a/(a+b);
  if(!Number.isFinite(result))throw new Error('比例无法确定有限分点。');
  if(left!==0&&right!==0&&(result===0||result===1))throw new Error('比例过于悬殊，分点与端点无法区分。');
  return result;
}

/**
 * New-line geometry, not the existing-line division command. Pure and previewable.
 * Signed external division is represented by its union with actual endpoints at
 * the start/end/split, avoiding two coincident copies of the external leg.
 * Caller owns the single append, intersection splitting, validation and history.
 */
export function dividedLineSegments(doc:Doc,start:Point,end:Point,assignment:Assignment,division:DrawDivision,drawingAngle?:number|null):Segment[]{
  validateDoc(doc);
  for(const point of [start,end])if(!Array.isArray(point)||point.length!==2||point.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))
    throw new Error('绘制坐标须在 ±1000000 mm 内。');
  const eps=epsilonFor(doc),length=distance(start,end);
  if(length<=eps)throw new Error('起点与终点不能重合或过近。');
  let parameters:number[];
  if(division.kind==='equal'){
    if(!Number.isSafeInteger(division.count)||division.count<1)
      throw new Error('绘制等分数须为正整数。');
    if(length/division.count<=eps)throw new Error('分段过短，无法形成独立端点，请调整比例或等分数。');
    parameters=Array.from({length:division.count+1},(_,i)=>i/division.count);
  }else if(division.kind==='ratio'){
    const t=drawRatioParameter(division.s,division.t);
    if(t===null)return [];
    parameters=[...new Set([0,t,1])].sort((a,b)=>a-b);
  }else throw new Error('请选择等分绘制或根式比例绘制。');
  if(parameters.some((t,i)=>i>0&&(t-parameters[i-1])*length<=eps))
    throw new Error('分段过短，无法形成独立端点，请调整比例或等分数。');
  const at=(t:number):Point=>[start[0]+t*(end[0]-start[0]),start[1]+t*(end[1]-start[1])];
  const used=new Set([...doc.segments.map(s=>s.id),...(doc.objects??[]).map(o=>o.id)]);
  const result=applyDrawingFoldAngle(parameters.slice(1).map((t,i):Segment=>{
    const base='draw-divided:'+String(i+1);let id=base,suffix=1;
    while(used.has(id))id=base+':'+ ++suffix;used.add(id);
    return{id,a:at(parameters[i]),b:at(t),assignment,angle:defaultAngle(assignment)};
  }),drawingAngle);
  // Capacity belongs to the final union, not the temporary overlapping proposal.
  validateDoc({...doc,segments:result});
  return result;
}

/** Split BEFORE deduplication so drawing over an existing line keeps new division points. */
export function appendDividedLine(doc:Doc,start:Point,end:Point,assignment:Assignment,division:DrawDivision,lockBoundary=false,drawingAngle?:number|null):Doc{
  const proposed=dividedLineSegments(doc,start,end,assignment,division,drawingAngle);
  if(!proposed.length)return doc;
  const eps=epsilonFor(doc);
  let conflict=false;
  for(const candidate of proposed)for(const existing of doc.segments){
    if(!collinearOverlap(candidate,existing,eps))continue;
    if(lockBoundary&&existing.assignment==='B')throw new Error('边界保护已开启，不能覆盖纸张边界。');
    if(candidate.assignment!==existing.assignment||candidate.angle!==existing.angle)conflict=true;
  }
  if(conflict)return overlayDrawnSegments(doc,proposed,lockBoundary);
  const split=splitEditableSegmentsWithMap({...doc,segments:[...doc.segments,...proposed]});
  const newIds=new Set(proposed.flatMap(s=>split.descendants.get(s.id)??[]));
  const segments:Segment[]=[];
  const sameGeometry=(a:Segment,b:Segment)=>(distance(a.a,b.a)<=eps&&distance(a.b,b.b)<=eps)||(distance(a.a,b.b)<=eps&&distance(a.b,b.a)<=eps);
  // Existing fragments come first; preserve their identities and any unrelated
  // pre-existing duplicates. Only redundant newly drawn fragments are omitted.
  for(const segment of split.doc.segments){
    if(newIds.has(segment.id)&&segments.some(s=>s.assignment===segment.assignment&&s.angle===segment.angle&&sameGeometry(s,segment)))continue;
    segments.push(segment);
  }
  const result={...doc,segments};validateDoc(result);
  return JSON.stringify(result)===JSON.stringify(doc)?doc:result;
}
