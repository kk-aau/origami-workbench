import type {Point} from '../core/types';

export interface DiagramToolbarBounds {x:number;y:number;width:number;height:number}
export interface DiagramCreaseToolbarPosition {left:number;top:number;anchor:Point;side:'above'|'below'}

/** Clip a presented screen-space crease to the visible canvas before anchoring its controls. */
function clipSegment(a:Point,b:Point,rect:DiagramToolbarBounds):[Point,Point]|null {
  const dx=b[0]-a[0],dy=b[1]-a[1],p=[-dx,dx,-dy,dy];
  const q=[a[0]-rect.x,rect.x+rect.width-a[0],a[1]-rect.y,rect.y+rect.height-a[1]];
  let from=0,to=1;
  for(let i=0;i<4;i++){
    if(Math.abs(p[i])<1e-10){if(q[i]<0)return null;continue;}
    const ratio=q[i]/p[i];
    if(p[i]<0)from=Math.max(from,ratio);else to=Math.min(to,ratio);
    if(from>to)return null;
  }
  return [[a[0]+from*dx,a[1]+from*dy],[a[0]+to*dx,a[1]+to*dy]];
}

/** Endpoints are supplied in pairs; an optional final point represents a single projected anchor. */
export function diagramCreaseToolbarPosition(points:readonly Point[],viewport:DiagramToolbarBounds,toolbar:{width:number;height:number}):DiagramCreaseToolbarPosition|null {
  if(viewport.width<32||viewport.height<32||toolbar.width<=0||toolbar.height<=0)return null;
  const padding=8,gap=12,minLeft=viewport.x+padding,minTop=viewport.y+padding;
  const maxLeft=Math.max(minLeft,viewport.x+viewport.width-toolbar.width-padding);
  const maxTop=Math.max(minTop,viewport.y+viewport.height-toolbar.height-padding);
  // A CP edge remains editable before the folded main diagram is available.
  // Only an absent projection uses this fallback; an offscreen crease stays hidden.
  if(!points.length){
    const anchor:Point=[viewport.x+viewport.width/2,viewport.y];
    return {left:Math.max(minLeft,Math.min(maxLeft,anchor[0]-toolbar.width/2)),top:Math.min(maxTop,viewport.y+16),anchor,side:'below'};
  }
  const visible:Point[]=[];
  for(let i=0;i<points.length;i+=2){
    const a=points[i],b=points[i+1]??a;
    if(![...a,...b].every(Number.isFinite))continue;
    const clipped=clipSegment(a,b,viewport);if(clipped)visible.push(...clipped);
  }
  if(!visible.length)return null;
  const xs=visible.map(p=>p[0]),ys=visible.map(p=>p[1]);
  const anchor:Point=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
  const side=anchor[1]-toolbar.height-gap<minTop?'below':'above';
  const proposedTop=side==='above'?anchor[1]-toolbar.height-gap:anchor[1]+gap;
  return {left:Math.max(minLeft,Math.min(maxLeft,anchor[0]-toolbar.width/2)),top:Math.max(minTop,Math.min(maxTop,proposedTop)),anchor,side};
}
