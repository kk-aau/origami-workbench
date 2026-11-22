import type {Point} from '../core/types';
import type {DiagramPDFRect} from './diagramPDFLayout';
import {diagramPDFSeamEndHeight,type DiagramPDFSeamHeight} from './diagramPDFSeams';
import {diagramPDFRibbonCrossesRect} from './diagramPDFRibbonGeometry';

export function diagramPDFRibbonAnchor(rect:DiagramPDFRect):Point {
  return [rect.x+rect.width/2,rect.y+rect.height*.4];
}

export function diagramPDFRibbonStrokeWidth(ribbon?:{enabled:boolean;widthMm:number}):number {
  return ribbon?.enabled?ribbon.widthMm*72/25.4:1.4;
}

export function diagramPDFRibbonSeamNeighbors(nodes:readonly Point[],side:'incoming'|'outgoing',slopes?:number[],paper?:{width:number;height:number}) {
  const entry=side==='incoming',tip=entry?nodes[0]:nodes.at(-1),inside=entry?nodes[1]:nodes.at(-2);
  if(!tip||!inside)return;
  const dx=tip[0]-inside[0],slope=entry?slopes?.[0]:slopes?.at(-1);
  const dy=paper&&slope!==undefined?dx*slope*paper.width/paper.height:tip[1]-inside[1];
  if(!slopes&&Math.abs(dy)<1e-10)return;
  const across:Point=[tip[0]+dx,tip[1]+dy];
  return entry?{before:across,incomingSlopes:slopes}:{after:across,outgoingSlopes:slopes};
}

export interface ContinuationLayout {
  cell:DiagramPDFRect;
  cells:readonly DiagramPDFRect[];
  paper:DiagramPDFRect;
  gap:number;
  obstacles?:readonly DiagramPDFRect[];
  siblings?:readonly DiagramPDFRect[];
  arrivalDirection?:()=>Point|undefined;
  gridCell?:DiagramPDFRect;
  savedPort?:(from:string,to:string,side:'incoming'|'outgoing')=>number|undefined;
}

interface SpreadRoute { incoming:Point[]; outgoing:Point[]; slopes?:{incoming:number[];outgoing:number[]} }

/** A fork with one level arm can turn its other arm in the empty slot above
 * or below the source. Finish the corner before the cut so the facing sheet
 * enters the child's row horizontally. */
export function diagramPDFForkRowTurn(source:ContinuationLayout,target:ContinuationLayout,strokeWidth:number):SpreadRoute|undefined{
  const [x,y]=diagramPDFRibbonAnchor(source.cell),[nextX,nextY]=diagramPDFRibbonAnchor(target.cell);
  const dy=nextY-y,rim=source.paper.x+source.paper.width;
  const levelTolerance=Math.max(source.gap,Math.min(source.cell.height,target.cell.height)*.12);
  if(Math.abs(dy)<=levelTolerance*2||!target.siblings?.some(c=>Math.abs(diagramPDFRibbonAnchor(c)[1]-y)<=levelTolerance))return;
  if(Math.abs(dy)>1.6*Math.max(source.cell.height+source.gap,target.cell.height+target.gap))return;
  if(nextX-target.paper.x>target.cell.width+target.gap*2)return;
  const occupied=source.cells.some(c=>c!==source.cell&&x>=c.x&&x<=c.x+c.width&&nextY>=c.y&&nextY<=c.y+c.height);
  if(occupied)return;

  // Follow the previous painted band through the source artwork. A caption
  // on this step is painted in front of the band, so it must not kick the
  // initial tangent sideways. Other steps and captions remain obstacles.
  const arrival=source.arrivalDirection?.();
  const slope=arrival&&arrival[1]*dy>0&&Math.abs(arrival[0])<=Math.abs(arrival[1])?arrival[0]/arrival[1]:0;
  const straightX=(atY:number)=>x+(atY-y)*slope;
  const room=rim-straightX(nextY),rise=dy*.55;
  const radius=Math.min(room*.75,source.cell.width*.60,Math.abs(rise));
  if(radius<Math.max(2,strokeWidth*.8)||room-radius<strokeWidth/2)return;
  const turnY=nextY-rise;
  const outgoing:Point[]=[[x,y]];
  if(slope){
    // Two collinear spans keep the rounded corner from steering the first
    // printed segment, including when the incoming band leans to the left.
    const leadY=(y+turnY)/2;
    outgoing.push([straightX(leadY),leadY]);
  }
  outgoing.push([straightX(turnY),turnY]);
  for(const angle of [Math.PI/6,Math.PI/3]){
    const atY=turnY+rise*Math.sin(angle);
    outgoing.push([straightX(atY)+radius*(1-Math.cos(angle)),atY]);
  }
  outgoing.push([straightX(nextY)+radius,nextY],[rim,nextY]);
  const incoming:Point[]=[[target.paper.x,nextY],[nextX,nextY]];
  // Each bounded spline segment stays in its two nodes' bounding rectangle.
  // Include half the band on all sides when testing measured drawings/captions.
  function blocked(layout:ContinuationLayout,points:Point[]){
    const obstacles=layout.obstacles??layout.cells.filter(c=>c!==layout.cell),pad=strokeWidth/2;
    return points.some(([bx,by],i)=>{
      if(!i)return false;
      const [ax,ay]=points[i-1];
      return obstacles.some(r=>r.x-pad<=Math.max(ax,bx)&&r.x+r.width+pad>=Math.min(ax,bx)&&
        r.y-pad<=Math.max(ay,by)&&r.y+r.height+pad>=Math.min(ay,by));
    });
  }
  if(blocked(source,outgoing)||blocked(target,incoming))return;
  return {outgoing,incoming,slopes:{outgoing:[0,0],incoming:[0,0]}};
}

/** Define one cubic on the open spread, using horizontal distance as its
 * parameter. An ascending branch leaves the fork gently and steepens as
 * it reaches the next drawing. The spine is only a cut through the curve. */
function clearSpreadCurve(source:ContinuationLayout,target:ContinuationLayout,width:number,seam?:number):SpreadRoute|undefined {
  const [ax,ay]=diagramPDFRibbonAnchor(source.cell),[bx,by]=diagramPDFRibbonAnchor(target.cell);
  const left=source.paper.x+source.paper.width-ax,right=bx-target.paper.x,span=left+right;
  if(left<=0||right<=0)return;
  const cut=left/span,dy=by-ay,grade=dy/span,amount=Math.min(1,Math.abs(grade)*2);
  const fixed=seam===undefined?undefined:source.paper.y+seam*source.paper.height;
  // The derivatives approach the straight chord as the steps approach one row.
  let height=(t:number)=>ay+dy*t*(1+amount*(-.7+t*(.2+.5*t)));
  let slope=(t:number)=>grade*(1+amount*(-.7+t*(.4+1.5*t)));
  if(fixed!==undefined&&(fixed!==ay||fixed!==by)){
    const fraction=dy?(fixed-ay)/dy:0;
    const curvature=(cut-fraction)/(cut*(1-cut));
    if(fraction<=0||fraction>=1){
      // A pin above or below both drawings is the apex of the turn. Give the
      // two sheets a common level tangent at that point, with no straight neck.
      height=t=>fixed+(t<=cut?(ay-fixed)*(1-t/cut)**2:(by-fixed)*((t-cut)/(1-cut))**2);
      slope=t=>t<=cut?2*(fixed-ay)*(1-t/cut)/left:2*(by-fixed)*(t-cut)/(1-cut)/right;
    }else if(Math.abs(curvature)<=1){
      // The three authored heights define a unique parabola. It is smooth
      // through the gutter, irrespective of its position between drawings.
      height=t=>ay+dy*t*(1+curvature*(t-1));
      slope=t=>grade*(1+curvature*(2*t-1));
    }else{
      // A pin very near either drawing's height would make that parabola
      // turn backwards. Join two monotone cubics with the same tangent.
      const a=(fixed-ay)/left,b=(by-fixed)/right,join=2*a*b/(a+b);
      const spanAt=(t:number)=>t<=cut?{t:t/cut,s:a,start:ay,run:left,delta:join-a}:{t:(t-cut)/(1-cut),s:b,start:fixed,run:right,delta:b-join};
      height=t=>{
        const {t:u,s,start,run,delta}=spanAt(t);
        return start+run*(s*u+(t<=cut?delta*u*u*(u-1):-delta*u*(1-u)*(1-u)));
      };
      slope=t=>{
        const {t:u,s,delta}=spanAt(t);
        return s+delta*(t<=cut?u*(3*u-2):(1-u)*(3*u-1));
      };
    }
  }
  function blocked(layout:ContinuationLayout,edgeOffset:number,sectionStart:number,sectionEnd:number){
    const obstacles=layout.obstacles??layout.cells.filter(cell=>cell!==layout.cell);
    return obstacles.some(r=>{
      const first=Math.max(sectionStart,r.x-width/2+edgeOffset),last=Math.min(sectionEnd,r.x+r.width+width/2+edgeOffset);
      if(last<first)return false;
      // Both coordinates are monotone on this sheet, including a turn at the pin.
      const a=height(first/span),b=height(last/span);
      return Math.max(a,b)>=r.y-width/2&&Math.min(a,b)<=r.y+r.height+width/2;
    });
  }
  if(blocked(source,-ax,0,left)||blocked(target,left-target.paper.x,left,span))return;
  const seamY=fixed??height(cut),outT=ay===seamY?[0,cut]:[0,cut/2,cut],inT=by===seamY?[cut,1]:[cut,(cut+1)/2,1];
  const outgoing=outT.map((t):Point=>[ax+t*span,height(t)]),incoming=inT.map((t):Point=>[target.paper.x+t*span-left,height(t)]);
  outgoing[0]=[ax,ay];
  incoming[incoming.length-1]=[bx,by];
  outgoing[outgoing.length-1][0]=source.paper.x+source.paper.width;
  incoming[0][0]=target.paper.x;
  if(fixed!==undefined)incoming[0][1]=outgoing[outgoing.length-1][1]=fixed;
  return {outgoing,incoming,...(dy===0&&ay===seamY?{}:{slopes:{outgoing:outT.map(slope),incoming:inT.map(slope)}})};
}

/** Horizontal tangents on the two ends of a height change. Use the open
 * space up to the drawing, or the clear margin if another drawing intervenes. */
export function diagramPDFRibbonPortBends(port:Point,landing:Point,otherCells:readonly DiagramPDFRect[],strokeWidth=0):Point[] {
  const dx=landing[0]-port[0];
  if(Math.abs(dx)<.001||Math.abs(landing[1]-port[1])<.001)return [];
  const top=Math.min(port[1],landing[1]),bottom=Math.max(port[1],landing[1]);
  const direction=Math.sign(dx),dy=port[1]-landing[1],vertical=Math.sign(dy);
  let room=Math.abs(dx),clearHeight=Math.abs(dy);
  for(const cell of otherCells){
    if(cell.y>=bottom||cell.y+cell.height<=top)continue;
    const distance=direction>0?cell.x-port[0]:port[0]-cell.x-cell.width;
    if(distance<0||distance>=Math.abs(dx))continue;
    room=Math.min(room,distance);
    const separation=vertical>0?cell.y-landing[1]:landing[1]-cell.y-cell.height;
    clearHeight=Math.min(clearHeight,Math.max(0,separation));
  }
  // A steep bend closer than half a stroke would recolor the page edge,
  // even though its centerline meets the correct point horizontally.
  const run=Math.min(room,Math.max(room*.12,strokeWidth/2+2));
  const bends:Point[]=[[port[0]+direction*run,port[1]]];
  if(room<Math.abs(dx)&&clearHeight>0){
    // Stay in the gutter past the intervening rows, then use the target
    // row's clear space for the last bend into the illustration.
    bends.push([port[0]+direction*Math.max(run,room*.65),landing[1]+vertical*clearHeight*.9]);
    bends.push([port[0]+direction*Math.max(run,Math.abs(dx)*.86),landing[1]]);
  }else bends.push([port[0]+direction*Math.max(run,room*.86),landing[1]]);
  return bends.filter(([x,y])=>Math.abs(x-landing[0])>.001||Math.abs(y-landing[1])>.001);
}

/** On a crowded row the final approach follows its facing gutter, outside
 * the other drawing. This gate also determines the shared height on a spread. */
function continuationGate(layout:ContinuationLayout,entry:boolean,strokeWidth:number,preferredY?:number):Point|undefined {
  const {cell,cells,paper,gap}=layout,[cx,cy]=diagramPDFRibbonAnchor(cell);
  const ahead=cells.filter(r=>r!==cell&&(entry?r.x+r.width<=cx:r.x>=cx));
  const spans=(r:DiagramPDFRect,y:number)=>r.y<y&&r.y+r.height>y;
  const blocked=ahead.filter(r=>spans(r,cy));
  if(!blocked.length)return;
  const firstRow=Math.min(...cells.map(r=>r.y)),lastRow=Math.max(...cells.map(r=>r.y+r.height)),clear=Math.max(gap/2,strokeWidth/2+gap*.25);
  const above=cell.y-(cell.y<=firstRow+.001?clear:gap/2);
  const below=cell.y+cell.height+(cell.y+cell.height>=lastRow-.001?clear:gap/2);
  // Two parallel branch lanes enter under the bottom row and leave over
  // the top row, clear of the vertical ribbons leading to the next steps.
  const topFirst=cell.y+cell.height<lastRow-.001&&(cell.y<=firstRow+.001||preferredY!==undefined&&preferredY<cy);
  const lanes=[...(topFirst?[above,below]:[below,above]),...ahead.flatMap(r=>[r.y-gap/2,r.y+r.height+gap/2])];
  const lane=lanes.find(y=>y>=paper.y&&y<=paper.y+paper.height&&!ahead.some(r=>spans(r,y)))??below;
  const facing=entry?cell.x:cell.x+cell.width;
  const gate=entry?Math.max(...blocked.map(r=>r.x+r.width)):Math.min(...blocked.map(r=>r.x));
  return [facing+Math.sign(gate-facing)*Math.min(gap/2,Math.abs(gate-facing)/2),lane];
}

// Physical PDF pages turn left to right, independently of their step order.
function continuationRoute(layout:ContinuationLayout,entry:boolean,seam:number|undefined,strokeWidth:number,join?:{slope:number;run:number;innerRun:number;gate?:Point}):Point[] {
  const {cell,cells,paper,gap}=layout;
  const [cx,cy]=diagramPDFRibbonAnchor(cell);
  const right=paper.x+paper.width,edge=entry?paper.x:right;
  const direction=entry?-1:1,other=cells.filter(r=>r!==cell);
  const border:Point=[edge,seam??cy];
  const atSeamDistance=(distance:number):Point=>[edge-direction*distance,border[1]-direction*distance*(join?.slope??0)];
  const shoulder=join?atSeamDistance(join.innerRun):border;
  // A short straight section on both sides preserves the full stroke profile
  // at the cut, including the outer edge of a wide, diagonal ribbon.
  const collar=join&&join.innerRun>join.run+.001?[atSeamDistance(join.run)]:[];
  if(join&&!join.gate){
    const distance=Math.abs(edge-cx),lead=Math.min(distance*.21,cell.width*.17);
    const direct:Point[]=[[cx,cy],[cx+direction*lead,cy],shoulder,...collar,border];
    if(direct.every((end,i)=>!i||other.every(r=>!diagramPDFRibbonCrossesRect(direct[i-1],end,r,strokeWidth/2)))){
      return entry?direct.reverse():direct;
    }
  }
  const points:Point[]=[];
  function append(x:number,y:number){
    const previous=points.at(-1);
    if(!previous||Math.abs(previous[0]-x)>.001||Math.abs(previous[1]-y)>.001)points.push([x,y]);
  }
  append(cx,cy);
  const gate=join?join.gate:continuationGate(layout,entry,strokeWidth,seam);
  if(gate){
    // Approach the gutter diagonally through the source's own slot.
    append(cx+(gate[0]-cx)*.35,cy+(gate[1]-cy)*.20);
    append(...gate);
  }
  const port=seam??gate?.[1]??cy;
  const tip:Point=join?shoulder:[edge,port];
  // For automatic detours, keep the outside of the painted band clear as
  // the centerline turns around the neighboring step and its caption.
  const obstacles=join?other.map(r=>({x:r.x-strokeWidth/2,y:r.y-strokeWidth/2,width:r.width+strokeWidth,height:r.height+strokeWidth})):other;
  const bends=diagramPDFRibbonPortBends(tip,points.at(-1)!,obstacles,strokeWidth);
  if(join){
    // The gutter helper levels out before a horizontal port. A sloping
    // port can continue straight from its last clear corner instead.
    const previous=bends[1]??points.at(-1)!;
    if(join.slope*(tip[0]-previous[0])*(tip[1]-previous[1])>0&&
        other.every(rect=>!diagramPDFRibbonCrossesRect(previous,tip,rect,Math.max(0,strokeWidth/2-.001))))bends.shift();
    for(const bend of bends.reverse())append(...bend);
    append(...tip);for(const point of collar)append(...point);append(...border);
    return entry?points.reverse():points;
  }
  append(...(bends.at(-1)??tip));
  // Round the routing corners only where a different drawing blocks the lane.
  const rounded:Point[]=[points[0]];
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1];
    const before=Math.hypot(a[0]-b[0],a[1]-b[1]),after=Math.hypot(c[0]-b[0],c[1]-b[1]);
    const radius=Math.min(Math.max(1,gap*.35),before/3,after/3);
    for(const [p,length] of [[a,before],[c,after]] as const){
      rounded.push([b[0]+(p[0]-b[0])*radius/length,b[1]+(p[1]-b[1])*radius/length]);
    }
  }
  rounded.push(points.at(-1)!);
  if(bends.length)rounded.push(...bends.slice(0,-1).reverse(),tip);
  else if(rounded.length>2){
    const last=rounded.at(-1)!,penultimate=rounded.at(-2)!;
    rounded.splice(-1,0,[(last[0]+penultimate[0])/2,(last[1]+penultimate[1])/2]);
  }
  return entry?rounded.reverse():rounded;
}

export function diagramPDFBranchContinuationPaths(source:ContinuationLayout,target:ContinuationLayout,seam?:DiagramPDFSeamHeight,strokeWidth=0):SpreadRoute {
  if(typeof seam!=='object'){
    const direct=clearSpreadCurve(source,target,strokeWidth,seam);
    if(direct)return direct;
  }
  if(typeof seam!=='object'){
    // Design one stroke on the opened spread, then split it at the fold.
    const fixed=seam===undefined?undefined:source.paper.y+source.paper.height*seam;
    const sourceGate=continuationGate(source,false,strokeWidth,fixed),targetGate=continuationGate(target,true,strokeWidth,fixed);
    const [ax,ay]=sourceGate??diagramPDFRibbonAnchor(source.cell),[bx,by]=targetGate??diagramPDFRibbonAnchor(target.cell);
    const leftMargin=source.paper.x+source.paper.width-Math.max(...source.cells.map(c=>c.x+c.width));
    const rightMargin=Math.min(...target.cells.map(c=>c.x))-target.paper.x;
    // When a row blocks the approach, only its outside margin is available
    // to gain height. Let the open facing page take the rest of the turn.
    const left=sourceGate?leftMargin:source.paper.x+source.paper.width-ax;
    const right=targetGate?rightMargin:bx-target.paper.x,span=left+right;
    if(left>1&&right>1){
      const t=left/span,dy=by-ay;
      // A long return on the same row bows toward the center of the paper.
      // Ordinary short, level transitions can pass straight through the seam.
      const row=Math.min(source.cell.height,target.cell.height);
      const bow=Math.sign(source.paper.y+source.paper.height/2-ay)*Math.min(row*.14,Math.max(0,span-source.paper.width*.5)*.16)*Math.max(0,1-Math.abs(dy)/Math.max(1,row*.45));
      const height=fixed??(ay+dy*t+4*bow*t*(1-t));
      // A manually specified height may fall beyond both drawings. Keep
      // a horizontal tangent at that extremum, as in existing edited pages.
      const leave=(height-ay)/left,enter=(by-height)/right;
      const fixedSlope=leave*enter>0?2*leave*enter/(leave+enter):0;
      const slope=Math.max(-1.25,Math.min(1.25,fixed===undefined?(dy+4*bow*(1-2*t))/span:fixedSlope));
      const run=Math.min((source.paper.x+source.paper.width-ax)*.24,(bx-target.paper.x)*.24,leftMargin*.8,rightMargin*.8,Math.max(3,strokeWidth/2+2));
      if(run>0&&(fixed===undefined||Math.abs(slope)>1e-6)){
        const innerRun=Math.abs(slope)<1e-8?run:Math.min(leftMargin,rightMargin,(source.paper.x+source.paper.width-ax)*.45,(bx-target.paper.x)*.45,run*1.55);
        const join={slope,run,innerRun};
        return {outgoing:continuationRoute(source,false,height,strokeWidth,{...join,gate:sourceGate}),
          incoming:continuationRoute(target,true,height,strokeWidth,{...join,gate:targetGate})};
      }
    }
  }
  const outgoingHeight=diagramPDFSeamEndHeight(seam,'outgoing');
  const outgoing=continuationRoute(source,false,outgoingHeight===undefined?undefined:source.paper.y+source.paper.height*outgoingHeight,strokeWidth);
  const incomingY=typeof seam==='object'?(seam.incoming===undefined?undefined:target.paper.y+target.paper.height*seam.incoming):outgoing.at(-1)![1];
  return {outgoing,incoming:continuationRoute(target,true,incomingY,strokeWidth)};
}
