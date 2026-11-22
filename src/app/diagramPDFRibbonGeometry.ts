import type {Point} from '../core/types';
import type {DiagramPDFRect} from './diagramPDFLayout';

/** Clip the centerline against both axes of a panel, in PDF points. */
export function diagramPDFRibbonCrossesRect(start:Point,end:Point,rect:DiagramPDFRect,clearance=0):boolean {
  let enter=0,leave=1;
  const low=[rect.x-clearance,rect.y-clearance],high=[rect.x+rect.width+clearance,rect.y+rect.height+clearance];
  for(const axis of [0,1] as const){
    const delta=end[axis]-start[axis];
    if(delta===0){
      if(start[axis]<low[axis]||start[axis]>high[axis])return false;
      continue;
    }
    const a=(low[axis]-start[axis])/delta,b=(high[axis]-start[axis])/delta;
    enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
    if(enter>leave)return false;
  }
  return true;
}

/** Return the shortest clear passage around the panels between two moved anchors.
 * An empty array means the anchors can be joined directly. */
export function diagramPDFLocalRibbonBends(start:Point,end:Point,others:DiagramPDFRect[],
  page:{width:number;height:number},clearance:number):Point[]|undefined {
  const blockers=others.filter(rect=>diagramPDFRibbonCrossesRect(start,end,rect,clearance));
  if(!blockers.length)return [];
  const pad=clearance+1;
  const left=Math.min(...blockers.map(r=>r.x))-pad,right=Math.max(...blockers.map(r=>r.x+r.width))+pad;
  const top=Math.min(...blockers.map(r=>r.y))-pad,bottom=Math.max(...blockers.map(r=>r.y+r.height))+pad;
  const candidates:Point[][]=[];
  for(const y of [top,bottom]){
    if(y<clearance||y>page.height-clearance)continue;
    const [x1,x2]=start[0]<=end[0]?[left,right]:[right,left];
    candidates.push([[x1,y],[x2,y]]);
  }
  for(const x of [left,right]){
    if(x<clearance||x>page.width-clearance)continue;
    const [y1,y2]=start[1]<=end[1]?[top,bottom]:[bottom,top];
    candidates.push([[x,y1],[x,y2]]);
  }
  let best:Point[]|undefined,shortest=Infinity;
  for(const bends of candidates){
    const path=[start,...bends,end];
    let length=0;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i];
      if(others.some(rect=>diagramPDFRibbonCrossesRect(a,b,rect,clearance))){length=Infinity;break;}
      length+=Math.hypot(b[0]-a[0],b[1]-a[1]);
    }
    if(length<shortest){best=bends;shortest=length;}
  }
  return best;
}
