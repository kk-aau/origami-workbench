import type { Doc, Point, Segment } from '../core/types';
import { validateDoc } from '../core/types';
import { distance, epsilonFor, segmentIntersection } from '../core/geometry';
import { reflectionRay, reflectionEnd } from './reflection';
import { reflectPoint, uncoveredCopies } from './mirror';
import {swapGeneratedLines} from './drawingSwap';

/** Only source-endpoint / axis-interior T joins qualify, matching mode 35.
 * Stops are computed against the unchanged document; previews never stop one another. */
export function transverseReflection(doc:Doc,a:Point,b:Point,lockBoundary=false,swapGenerated=false){
  validateDoc(doc);const eps=epsilonFor(doc);
  reflectPoint(a,a,b,eps); // validate axis even for an empty source document
  const axis:Segment={id:'transverse-reference',a,b,assignment:'A',angle:0};
  const axisLength=distance(a,b),sources:Segment[]=[],candidates:Segment[]=[];
  for(const source of doc.segments){
    if(lockBoundary&&source.assignment==='B')continue;
    const length=distance(source.a,source.b);if(length<=eps)continue;
    const hit=segmentIntersection(source,axis,eps);
    if(!hit||hit.u*axisLength<=eps||(1-hit.u)*axisLength<=eps)continue;
    const atA=hit.t*length<=eps,atB=(1-hit.t)*length<=eps;
    if(!atA&&!atB)continue;
    const origin=atA?source.a:source.b,other=atA?source.b:source.a;
    const axisPoint=distance(origin,a)>distance(origin,b)?a:b;
    const ray=reflectionRay(other,origin,axisPoint,eps);
    let endpoint:Point|undefined,nearest=Infinity;
    for(const target of doc.segments){
      if(target.assignment==='A')continue;
      try{
        const end=reflectionEnd(ray,target,eps),d=distance(origin,end);
        if(d<nearest){endpoint=end;nearest=d;}
      }catch{/* Non-forward, parallel, through-origin and extension-only hits are not stops. */}
    }
    if(!endpoint)throw new Error(`线段 ${source.id} 的反射方向没有可用截止线或纸边；请补充截止线或调整横截线。整组尚未生成。`);
    sources.push(source);candidates.push({...source,a:[...origin],b:endpoint});
  }
  if(!sources.length)throw new Error('横截线内部没有 T 形连接：必须经过原线端点；穿过线身或只接触横截线端点不计入。');
  return {sources,copies:uncoveredCopies(doc,swapGeneratedLines(candidates,swapGenerated),'transverse')};
}
