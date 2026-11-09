import { cross, distance, epsilonFor, sub } from '../core/geometry';
import { defaultAngle, validateDoc, type Assignment, type Doc, type Point, type Segment } from '../core/types';
import { reflectionEnd } from './reflection';
import { uncoveredCopies } from './mirror';
import { distanceToSegment } from './state';
import {applyDrawingFoldAngle} from './foldAngles';
import {swapGeneratedLines} from './drawingSwap';

/** Mode 33: sample the baseline at grid-width intervals, including its start.
 * The baseline is never inserted. Missing ray stops do not invent endpoints. */
export function fishbone(doc:Doc,a:Point,b:Point,spacing:number,preset:Assignment,drawingAngle?:number|null,swapGenerated=false){
  validateDoc(doc);const eps=epsilonFor(doc);
  if([a,b].some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('鱼骨基线坐标无效。');
  const length=distance(a,b);
  if(length<=eps)throw new Error('鱼骨基线两点不能重合或过近。');
  if(!Number.isFinite(spacing)||spacing<=eps)throw new Error('网格间距必须为有效正数。');
  const count=Math.floor(length/spacing+1e-10)+1;
  if(!Number.isSafeInteger(count))throw new Error('鱼骨取点间距无法形成可区分的有限取点。');
  const u:Point=[(b[0]-a[0])/length,(b[1]-a[1])/length],normal:Point=[-u[1],u[0]];
  const references=doc.segments.filter(s=>s.assignment!=='A'&&distance(s.a,s.b)>eps);
  const candidates:Segment[]=[],deadline=performance.now()+3000;let skipped=0,missing=0;
  for(let i=0;i<count;i++){
    if(performance.now()>deadline)throw new Error('鱼骨构造计算超时，请调整网格间距；整组未生成。');
    const origin:Point=[a[0]+u[0]*i*spacing,a[1]+u[1]*i*spacing];
    // Existing transverse creases suppress this station, but still advance color.
    if(references.some(s=>Math.abs(cross(sub(s.b,s.a),u))/distance(s.a,s.b)>1e-10&&distanceToSegment(origin,s)<=eps)){skipped++;continue;}
    const assignment=i%2===0?preset:preset==='M'?'V':preset==='V'?'M':preset;
    const ends:Point[]=[];
    for(const sign of [1,-1]){
      let nearest:Point|undefined,min=Infinity;
      for(const target of references){try{const hit=reflectionEnd({origin,direction:[normal[0]*sign,normal[1]*sign]},target,eps),d=distance(origin,hit);if(d<min){nearest=hit;min=d;}}catch{/* Not a finite forward intersection. */}}
      if(nearest)ends.push(nearest);else missing++;
    }
    if(ends.length)candidates.push({id:`fishbone-${i+1}`,a:ends.length===2?ends[1]:origin,b:ends[0],assignment,angle:defaultAngle(assignment)});
  }
  if(!candidates.length)throw new Error('没有可生成的鱼骨线：取点已在横向折线上，或两侧均无实际截止线／纸边。');
  return{copies:uncoveredCopies(doc,swapGeneratedLines(applyDrawingFoldAngle(candidates,drawingAngle),swapGenerated),'fishbone','鱼骨构造'),sources:[] as Segment[],stopMessage:`间距 ${Number(spacing.toFixed(4))} mm · ${count} 个取点 · 跳过 ${skipped} 点 · ${missing} 个方向无截止`};
}
