import type {Point} from '../core/types';
import type {DiagramLineAnnotation} from './diagramAnnotations';
import {defaultDiagramStrokePattern} from './diagramLineStyles';
import type {AdaptiveLineSpan} from './adaptiveLineStyle';

type InkLine=Pick<DiagramLineAnnotation,'a'|'b'|'style'|'color'|'width'|'strokePattern'>;
export interface ProjectedInkSpan extends AdaptiveLineSpan {reverse:boolean}
interface Interval {index:number;start:number;end:number;reverse:boolean}
interface Support {origin:Point;ux:number;uy:number;intervals:Interval[]}

// Only the ink shares a dash origin. Every fragment keeps its own face, mask,
// opacity, endpoints and hit target, including fully overlapping fragments.
export function projectedFoldInkSpans(lines:readonly InkLine[]):Map<number,ProjectedInkSpan>{
  const spans=new Map<number,ProjectedInkSpan>();
  const styles=new Map<string,Support[]>();
  const angleBins=1_000_000;
  const tolerance=1e-7;
  for(const [index,line] of lines.entries()){
    if(line.style!=='valley'&&line.style!=='mountain')continue;
    const pattern=line.strokePattern??defaultDiagramStrokePattern(line.style);
    if(pattern==='solid')continue;
    const dx=line.b[0]-line.a[0],dy=line.b[1]-line.a[1],length=Math.hypot(dx,dy);
    if(length<=tolerance)continue;
    // Index by slope before checking the actual supporting line. Parallel
    // strokes still have to agree in perpendicular distance at both endpoints.
    const angle=Math.atan2(dy,dx);
    const bucket=(Math.round(angle*angleBins/Math.PI)+angleBins)%angleBins;
    const key=[line.style,pattern,line.width,line.color.toLowerCase()].join('|');
    let support:Support|undefined;
    for(const bin of [bucket,(bucket+angleBins-1)%angleBins,(bucket+1)%angleBins]){
      support=styles.get(key+'|'+bin)?.find(({origin,ux,uy})=>
        Math.abs((line.a[0]-origin[0])*uy-(line.a[1]-origin[1])*ux)<=tolerance&&
        Math.abs((line.b[0]-origin[0])*uy-(line.b[1]-origin[1])*ux)<=tolerance);
      if(support)break;
    }
    if(!support){
      const sign=(Math.abs(dx)>=Math.abs(dy)?dx:dy)<0?-1:1;
      support={origin:line.a,ux:sign*dx/length,uy:sign*dy/length,intervals:[]};
      const binKey=key+'|'+bucket,group=styles.get(binKey);
      if(group)group.push(support);else styles.set(binKey,[support]);
    }
    const {origin,ux,uy}=support;
    const along=(p:Point)=>(p[0]-origin[0])*ux+(p[1]-origin[1])*uy;
    const a=along(line.a),b=along(line.b);
    support.intervals.push({index,start:Math.min(a,b),end:Math.max(a,b),reverse:b<a});
  }
  for(const supports of styles.values())for(const {intervals} of supports){
    intervals.sort((a,b)=>a.start-b.start);
    for(let first=0;first<intervals.length;){
      const start=intervals[first].start;
      let next=first+1,end=intervals[first].end;
      while(next<intervals.length&&intervals[next].start<=end+tolerance){
        end=Math.max(end,intervals[next].end);next++;
      }
      if(next-first>1)for(let i=first;i<next;i++){
        const part=intervals[i];
        spans.set(part.index,{length:end-start,offset:part.start-start,reverse:part.reverse});
      }
      first=next;
    }
  }
  return spans;
}
