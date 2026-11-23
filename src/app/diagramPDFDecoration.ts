import type {Point} from '../core/types';
import type {DiagramPDFCell,DiagramPDFOptions,DiagramPDFPage,DiagramPDFPlan,DiagramPDFRect} from './diagramPDFLayout';
import {diagramPDFBranchContinuationPaths,diagramPDFRibbonAnchor,diagramPDFRibbonPortBends,diagramPDFRibbonStrokeWidth,diagramPDFRibbonSeamNeighbors} from './diagramPDFBranchContinuation';
import {diagramPDFLocalRibbonBends,diagramPDFRibbonCrossesRect} from './diagramPDFRibbonGeometry';
import {diagramPDFRibbonObstacleRects} from './diagramPDFRibbonObstacles';
import {diagramPDFRibbonNodeId,diagramPDFSeamEndHeight,diagramPDFSeamKey} from './diagramPDFSeams';
import {diagramPDFRibbonBranchColor} from './diagramPDFBranchColors';
import {ribbonPaintGeometry,ribbonPaintColor,ribbonPathPaintSVG} from './diagramPDFRibbonPaint';

export interface DiagramPDFColorStop {id:string;offset:number;color:string;opacity:number}
export interface DiagramPDFPaint {
  kind:'solid'|'linear'|'radial';color:string;angle:number;
  centerX:number;centerY:number;radius:number;stops:DiagramPDFColorStop[];
}
export type DiagramPDFRibbonArrowStyle='double'|'solid';
export interface DiagramPDFRibbon {
  enabled:boolean;widthMm:number;opacity:number;paint:DiagramPDFPaint;
  showArrows?:boolean;arrowColor?:string;arrowOpacity?:number;
  arrowStyle?:DiagramPDFRibbonArrowStyle;arrowThicknessPercent?:number;
  paths?:Record<string,Point[]>;
  branchColors?:Record<string,string>;
  segmentColors?:Record<string,string>;
}
export const DEFAULT_RIBBON_ARROW_COLOR='#ffffff';
export const DEFAULT_RIBBON_ARROW_OPACITY=.2;
export function diagramPDFRibbonArrowOpacity(ribbon:Pick<DiagramPDFRibbon,'arrowColor'|'arrowOpacity'>):number {
  // Older projects stored their chosen colour as an opaque six-digit value.
  return ribbon.arrowOpacity??(ribbon.arrowColor===undefined?DEFAULT_RIBBON_ARROW_OPACITY:1);
}
export const DEFAULT_RIBBON_ARROW_STYLE:DiagramPDFRibbonArrowStyle='double';
export const MIN_RIBBON_ARROW_THICKNESS=50,DEFAULT_RIBBON_ARROW_THICKNESS=100,MAX_RIBBON_ARROW_THICKNESS=150;
export function defaultDiagramPDFPaint(color='#ffffff'):DiagramPDFPaint {
  return {kind:'solid',color,angle:0,centerX:50,centerY:50,radius:70,stops:[{id:'start',offset:0,color,opacity:1},{id:'end',offset:100,color:'#e1e9e3',opacity:1}]};
}
export function defaultDiagramPDFRibbon():DiagramPDFRibbon {
  return {enabled:true,widthMm:8,opacity:1,paint:defaultDiagramPDFPaint('#c1cfc5'),showArrows:true,arrowColor:DEFAULT_RIBBON_ARROW_COLOR,arrowOpacity:DEFAULT_RIBBON_ARROW_OPACITY,
    arrowStyle:DEFAULT_RIBBON_ARROW_STYLE,arrowThicknessPercent:DEFAULT_RIBBON_ARROW_THICKNESS};
}
const hex=(value:unknown):value is string=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const between=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
function validatePaint(value:DiagramPDFPaint) {
  if(!value||!['solid','linear','radial'].includes(value.kind)||!hex(value.color)||!between(value.angle,-360,360)||
    !between(value.centerX,0,100)||!between(value.centerY,0,100)||!between(value.radius,1,150)||
    !Array.isArray(value.stops)||value.stops.length<2||value.stops.length>12)throw Error('背景或彩带的颜色设置无效。');
  const ids=new Set<string>();
  for(const stop of value.stops){
    if(!stop||typeof stop.id!=='string'||!stop.id||stop.id.length>80||ids.has(stop.id)||!between(stop.offset,0,100)||!hex(stop.color)||!between(stop.opacity,0,1))throw Error('渐变色标的颜色、位置或透明度无效。');
    ids.add(stop.id);
  }
}
export function validateDiagramPDFDecoration(options:DiagramPDFOptions) {
  if(options.pageBackground)validatePaint(options.pageBackground);
  if(options.pageTextColor!==undefined&&!hex(options.pageTextColor))throw Error('页面文字颜色无效。');
  const ribbon=options.ribbon;if(!ribbon)return;
  if(typeof ribbon.enabled!=='boolean'||!between(ribbon.widthMm,1,40)||!between(ribbon.opacity,0,1))throw Error('彩带宽度应为 1 至 40 mm，透明度应为 0 至 100%。');
  if(ribbon.showArrows!==undefined&&typeof ribbon.showArrows!=='boolean')throw Error('彩带宽箭头显示设置无效。');
  if(ribbon.arrowColor!==undefined&&!hex(ribbon.arrowColor))throw Error('彩带宽箭头颜色无效。');
  if(ribbon.arrowOpacity!==undefined&&!between(ribbon.arrowOpacity,0,1))throw Error('彩带箭头不透明度应为 0 至 100%。');
  if(ribbon.arrowStyle!==undefined&&ribbon.arrowStyle!=='double'&&ribbon.arrowStyle!=='solid')throw Error('彩带箭头样式无效。');
  if(ribbon.arrowThicknessPercent!==undefined&&!between(ribbon.arrowThicknessPercent,MIN_RIBBON_ARROW_THICKNESS,MAX_RIBBON_ARROW_THICKNESS))throw Error(`彩带箭头粗细应为 ${MIN_RIBBON_ARROW_THICKNESS}% 至 ${MAX_RIBBON_ARROW_THICKNESS}%。`);
  validatePaint(ribbon.paint);
  for(const colors of [ribbon.branchColors,ribbon.segmentColors]){
    if(colors!==undefined&&(!colors||typeof colors!=='object'||Array.isArray(colors)||Object.entries(colors).some(([id,color])=>!id||!hex(color))))throw Error('分支或步骤间的彩带颜色无效。');
  }
  if(ribbon.paths!==undefined){
    if(!ribbon.paths||typeof ribbon.paths!=='object'||Array.isArray(ribbon.paths))throw Error('彩带节点设置无效。');
    for(const nodes of Object.values(ribbon.paths)){
      if(!Array.isArray(nodes)||nodes.length<2||nodes.length>256||nodes.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!between(v,0,1))))throw Error('彩带节点必须位于页面内，且每条彩带需要 2 至 256 个节点。');
    }
  }
}
export function diagramPDFPaintSVG(paint:DiagramPDFPaint,id:string,space?:'page'|DiagramPDFRect):{defs:string;fill:string} {
  if(paint.kind==='solid')return {defs:'',fill:paint.color};
  const stops=[...paint.stops].sort((a,b)=>a.offset-b.offset).map(stop=>`<stop offset="${stop.offset}%" stop-color="${stop.color}" stop-opacity="${stop.opacity}"/>`).join('');
  const box=typeof space==='object'?space:undefined;
  const units=space?' gradientUnits="userSpaceOnUse"':'';
  const transform=box?` gradientTransform="matrix(${box.width} 0 0 ${box.height} ${box.x} ${box.y})"`:'';
  const coord=(percent:number)=>box?String(percent/100):percent+'%';
  if(paint.kind==='radial')return {fill:`url(#${id})`,defs:`<radialGradient${units}${transform} id="${id}" cx="${coord(paint.centerX)}" cy="${coord(paint.centerY)}" r="${coord(paint.radius)}">${stops}</radialGradient>`};
  const angle=paint.angle*Math.PI/180,dx=Math.cos(angle)*50,dy=Math.sin(angle)*50;
  return {fill:`url(#${id})`,defs:`<linearGradient${units}${transform} id="${id}" x1="${coord(50-dx)}" y1="${coord(50-dy)}" x2="${coord(50+dx)}" y2="${coord(50+dy)}">${stops}</linearGradient>`};
}
export function diagramPDFBackgroundSVG(options:DiagramPDFOptions,plan:DiagramPDFPlan,pageIndex:number):string {
  const paint=diagramPDFPaintSVG(options.pageBackground??defaultDiagramPDFPaint(),'pdf-bg-'+pageIndex);
  return (paint.defs?`<defs>${paint.defs}</defs>`:'')+`<rect data-pdf-page-background="true" width="${plan.width}" height="${plan.height}" fill="#ffffff"/><rect width="${plan.width}" height="${plan.height}" fill="${paint.fill}"/>`;
}
export function diagramPDFRibbonKey(plan:Pick<DiagramPDFPlan,'width'|'height'>,page:{kind:DiagramPDFPage['kind'];cells:readonly (DiagramPDFRect&{stepIndex:number;figureIndex?:number;baseRect?:DiagramPDFRect})[]}):string {
  return [page.kind,plan.width,plan.height,...page.cells.map(cell=>{const r=cell.baseRect??cell;return [cell.stepIndex,cell.figureIndex??'',r.x,r.y,r.width,r.height].join(',');})].join('|');
}
const anchor=(rect:DiagramPDFRect,plan:RibbonPageSize):Point=>{
  const [x,y]=diagramPDFRibbonAnchor(rect);
  return [x/plan.width,y/plan.height];
};
/** Custom turns travel with the nearest step, while keeping their authored offset. */
function ribbonNodesTransform(nodes:Point[],plan:RibbonPageSize,page:DiagramPDFPage,inverse=false):Point[]{
  return nodes.map((point,index)=>{
    if((index===0&&point[0]===0)||(index===nodes.length-1&&point[0]===1))return [...point];
    let nearest=page.cells[0],distance=Infinity;
    for(const cell of page.cells){const p=anchor(inverse?cell:cell.baseRect??cell,plan),d=Math.hypot(point[0]-p[0],point[1]-p[1]);if(d<distance){distance=d;nearest=cell;}}
    if(!nearest?.baseRect)return [...point];
    const before=anchor(nearest.baseRect,plan),after=anchor(nearest,plan),sign=inverse?-1:1;
    return [Math.max(0,Math.min(1,point[0]+sign*(after[0]-before[0]))),Math.max(0,Math.min(1,point[1]+sign*(after[1]-before[1])))];
  });
}
export function diagramPDFRibbonSaveNodes(nodes:Point[],plan:DiagramPDFPlan,page:DiagramPDFPage):Point[]{return ribbonNodesTransform(nodes,plan,page,true);}
export function diagramPDFRibbonNodes(options:DiagramPDFOptions,plan:DiagramPDFPlan,page:DiagramPDFPage):Point[] {
  return linearRibbonTrack(options,plan,page,diagramPDFRibbonKey(plan,page)).nodes;
}
function panelMoved(cell:DiagramPDFCell):boolean {
  const base=cell.baseRect;
  return !!base&&(base.x!==cell.x||base.y!==cell.y||base.width!==cell.width||base.height!==cell.height);
}
function linearRibbonTrack(options:DiagramPDFOptions,plan:DiagramPDFPlan,page:DiagramPDFPage,key:string):DiagramPDFRibbonTrack {
  const saved=options.ribbon?.paths?.[key];
  const nodes=saved?ribbonNodesTransform(saved,plan,page):page.cells.map(cell=>anchor(cell,plan));
  const firstArtworkNode=nodes[0];
  const track:DiagramPDFRibbonTrack={key,nodes};
  if(!page.cells.length||options.readingOrder!=='snake')return track;
  const stepPages=plan.pages.filter(p=>p.cells.length);
  const first=page.cells[0],index=stepPages.findIndex(p=>p.cells[0].stepIndex===first.stepIndex&&p.cells[0].figureIndex===first.figureIndex);
  if(index<0)return track;
  const previous=stepPages[index-1],next=stepPages[index+1];
  if(!previous&&!next&&page.cells.length===1)return {key,nodes:[anchor(first,plan)]};
  // Older edited ribbons can include the page-edge nodes that used to be automatic.
  if(previous){
    const custom=options.ribbon?.paths?.[diagramPDFRibbonKey(plan,previous)];
    const end=custom?ribbonNodesTransform(custom,plan,previous).at(-1):undefined;
    const seam=page.linearSeams?.incoming;
    const setting=seam&&options.ribbonSeamHeights?.[seam.key];
    const entryY=typeof setting==='object'?(setting.incoming??anchor(first,plan)[1]):
      (setting??end?.[1]??anchor(previous.cells[previous.cells.length-1],plan)[1]);
    if(nodes[0][0]===0)nodes[0]=[0,entryY];
    else nodes.unshift([0,entryY]);
  }else if(saved?.[0][0]===0)nodes.shift();
  const end=nodes.at(-1);
  if(next&&end){
    const seam=page.linearSeams?.outgoing;
    const exitY=diagramPDFSeamEndHeight(seam&&options.ribbonSeamHeights?.[seam.key],'outgoing')??end[1];
    if(end[0]===1)nodes[nodes.length-1]=[1,exitY];
    else nodes.push([1,exitY]);
  }
  else if(!next&&saved?.at(-1)?.[0]===1)nodes.pop();
  const bounded:{start:number;end:number;movedSegments?:Set<number>}={start:0,end:0};
  const paper={x:0,y:0,width:plan.width,height:plan.height};
  function spreadApproach(source:DiagramPDFPage,target:DiagramPDFPage,side:'incoming'|'outgoing',height:number|undefined){
    const from=source.cells.at(-1)!,to=target.cells[0];
    const paths=diagramPDFBranchContinuationPaths({paper,gap:plan.gap,cells:source.cells,cell:from,obstacles:diagramPDFRibbonObstacleRects(source.cells,from)},
      {paper,gap:plan.gap,cells:target.cells,cell:to,obstacles:diagramPDFRibbonObstacleRects(target.cells,to)},height,diagramPDFRibbonStrokeWidth(options.ribbon));
    const normalize=(route:Point[])=>{
      const points=route.map(([x,y]):Point=>[x/plan.width,y/plan.height]);
      // A level crossing needs only the artwork anchor and the edge handle.
      return points.every(p=>p[1]===points[0][1])?[points[0],points.at(-1)!]:points;
    };
    const incoming=normalize(paths.incoming),outgoing=normalize(paths.outgoing);
    const approach=side==='incoming'?incoming:outgoing;
    if(height!==undefined&&!paths.slopes&&!diagramPDFRibbonSeamNeighbors(approach,side))return;
    // Recognize an automatic approach saved by the node editor, including
    // when the author has edited other knots farther inside either page.
    function matches(sheet:DiagramPDFPage,route:Point[],atStart:boolean){
      const stored=options.ribbon?.paths?.[diagramPDFRibbonKey(plan,sheet)];
      if(!stored)return true;
      if(stored.length<route.length)return false;
      const current=ribbonNodesTransform(stored,plan,sheet),offset=atStart?0:current.length-route.length;
      return route.every(([x,y],i)=>Math.abs(x-current[offset+i][0])<1e-8&&Math.abs(y-current[offset+i][1])<1e-8);
    }
    if(matches(source,outgoing,false)&&matches(target,incoming,true))return {approach,slopes:paths.slopes?.[side]};
  }
  for(const kind of ['incoming','outgoing'] as const){
    const seam=page.linearSeams?.[kind];
    if(!seam||!options.ribbon?.enabled&&diagramPDFSeamEndHeight(options.ribbonSeamHeights?.[seam.key],kind)===undefined)continue;
    const adjacent=kind==='incoming'?previous:next;
    const setting=options.ribbonSeamHeights?.[seam.key];
    if(adjacent&&options.ribbon?.enabled&&typeof setting!=='object'){
      const entry=kind==='incoming',spread=entry?spreadApproach(adjacent,page,kind,setting):spreadApproach(page,adjacent,kind,setting);
      if(spread){
        const route=spread.approach;
        if(saved)nodes[entry?0:nodes.length-1]=entry?route[0]:route.at(-1)!;
        else if(entry)nodes.splice(0,1,...route.slice(0,-1));
        else nodes.splice(nodes.length-1,1,...route.slice(1));
        bounded[entry?'start':'end']=route.length-1;
        const neighbors=diagramPDFRibbonSeamNeighbors(route,kind,spread.slopes,plan);
        if(neighbors)track.neighbors={...track.neighbors,...neighbors};
        continue;
      }
    }
    const entry=kind==='incoming',port=entry?nodes[0]:nodes.at(-1)!;
    const target=entry?page.cells[0]:page.cells.at(-1)!;
    const neighbor=anchor(target,plan);
    if(Math.abs(neighbor[1]-port[1])<.00001)continue;
    const turn=diagramPDFRibbonPortBends([port[0]*plan.width,port[1]*plan.height],
      [neighbor[0]*plan.width,neighbor[1]*plan.height],page.cells.filter(cell=>cell!==target),diagramPDFRibbonStrokeWidth(options.ribbon))
      .map(([x,y]):Point=>[x/plan.width,y/plan.height]);
    if(!turn.length)continue;
    if(saved){
      // The editor saves the visible knots. Recover the same tangents for
      // unedited approach knots without adding any to an authored path.
      if(![...turn,neighbor].every(([x,y],i)=>{
        const point=nodes[entry?i+1:nodes.length-2-i];
        return point&&Math.abs(point[0]-x)<1e-8&&Math.abs(point[1]-y)<1e-8;
      }))continue;
    }else nodes.splice(entry?1:nodes.length-1,0,...(entry?turn:turn.reverse()));
    bounded[entry?'start':'end']=turn.length+1;
  }
  if(!saved&&page.cells.some(panelMoved)){
    const firstAnchor=nodes.indexOf(firstArtworkNode);
    const segments=new Set<number>();
    for(const [i,cell] of page.cells.entries())if(panelMoved(cell)){
      // A Catmull–Rom segment uses its two anchors and their immediate neighbours.
      for(let j=firstAnchor+i-2;j<=firstAnchor+i+1;j++)if(j>=0&&j<nodes.length-1)segments.add(j);
    }
    bounded.movedSegments=segments;
  }
  if(bounded.start||bounded.end||bounded.movedSegments)track.bounded=bounded;
  return track;
}
type RibbonPageSize=Pick<DiagramPDFPlan,'width'|'height'>;
export interface DiagramPDFRibbonNeighbors {before?:Point;after?:Point;incomingSlopes?:number[];outgoingSlopes?:number[];controls?:[Point,Point]}
export type DiagramPDFRibbonBounds=boolean|{start:number;end:number;movedSegments?:ReadonlySet<number>};
export interface DiagramPDFRibbonTrack {key:string;nodes:Point[];edgeIndex?:number;bounded?:DiagramPDFRibbonBounds;neighbors?:DiagramPDFRibbonNeighbors}
export function diagramPDFRibbonTracks(options:DiagramPDFOptions,plan:DiagramPDFPlan,page:DiagramPDFPage):DiagramPDFRibbonTrack[]{
  const pageKey=diagramPDFRibbonKey(plan,page);
  if(!page.branchEdges){
    return [linearRibbonTrack(options,plan,page,pageKey)];
  }
  return diagramPDFBranchRibbonTracks(options,plan,page,page.branchEdges,pageKey);
}
export function diagramPDFBranchRibbonTracks(options:Pick<DiagramPDFOptions,'readingOrder'|'ribbon'>,
  plan:Pick<DiagramPDFPlan,'width'|'height'|'gap'>,page:DiagramPDFPage,edges:NonNullable<DiagramPDFPage['branchEdges']>,
  pageKey:string):DiagramPDFRibbonTrack[]{
  const cells=new Map(page.cells.map(cell=>[cell.branchNodeId,cell]));
  const colored=options.readingOrder==='snake'&&options.ribbon?.enabled;
  const movedCells=colored?page.cells.filter(panelMoved):[];
  const clearance=Math.min(plan.gap/3,diagramPDFRibbonStrokeWidth(options.ribbon)/2);
  const incoming=new Map<string,number>(),outgoing=new Map<string,number[]>();
  for(const [i,edge] of edges.entries()){
    incoming.set(edge.to,i);
    const children=outgoing.get(edge.from)??[];
    children.push(i);outgoing.set(edge.from,children);
  }
  const chainEdges:number[]=[];
  const tracks:DiagramPDFRibbonTrack[]=edges.map((edge,edgeIndex)=>{
    const key=pageKey+'|branch|'+JSON.stringify([edge.from,edge.to,edge.kind]);
    const saved=options.ribbon?.paths?.[key];
    if(options.readingOrder==='snake'&&edge.kind!=='local'){
      const route=edge.points.map(([x,y]):Point=>[x/plan.width,y/plan.height]),incoming=edge.kind==='incoming';
      const step=cells.get(incoming?edge.to:edge.from),artEnd=incoming?route.length-1:0;
      if(step)route[artEnd]=anchor(step,plan);
      const authored=saved&&ribbonNodesTransform(saved,plan,page);
      const matchesRoute=authored?.length===route.length&&route.every(([x,y],i)=>Math.abs(x-authored[i][0])<1e-8&&Math.abs(y-authored[i][1])<1e-8);
      if(!authored||authored.length===2||matchesRoute){
        if(authored?.length===2)route[artEnd]=authored[incoming?1:0];
        const slopes=!authored||matchesRoute?edge.slopes:undefined;
        const neighbors=diagramPDFRibbonSeamNeighbors(route,edge.kind,slopes,plan);
        return {key,edgeIndex,nodes:route,bounded:true,...(neighbors?{neighbors}:{})};
      }
      const nodes=authored;
      // The page edge is automatic; all interior turns, including those
      // authored before side-to-side continuations, keep their saved position.
      const port=incoming?route[0]:route.at(-1)!;
      nodes[incoming?0:nodes.length-1]=port;
      return {key,edgeIndex,nodes,bounded:true};
    }
    if(saved)return {key,edgeIndex,nodes:ribbonNodesTransform(saved,plan,page)};
    // The artwork hides the ends of each band. Longer connections use the
    // empty gutters selected by the tree layout to pass intermediate steps.
    const from=cells.get(edge.from),to=cells.get(edge.to);
    const route=edge.points.map(([x,y]):Point=>[x/plan.width,y/plan.height]);
    let nodes:Point[];
    if(from&&to&&edge.kind==='local'){
      const a=anchor(from,plan),b=anchor(to,plan);
      // Consecutive steps on a branch share the same spline as a linear page.
      // Test the original grid row for detours even when a drawing has moved.
      const sameRow=colored?(from.baseRect??from).y===(to.baseRect??to).y:from.y===to.y;
      // A cross-row route may have only four points: its middle pair is the
      // gutter chosen by the layout. Dropping it creates a diagonal through
      // other branches even though the planned routes were separated.
      const differentColumn=Math.abs(from.x-to.x)>.5*Math.max(from.width,to.width);
      let detour=route.length>4||route.length>2&&(sameRow||differentColumn);
      // Diagonally adjacent panels need one smooth turn, not all four
      // orthogonal routing waypoints. The layout checks these same cubics
      // against the other branches before accepting the panel arrangement.
      if(colored&&page.cells.length===page.columns*page.rows&&!sameRow&&b[1]>a[1]&&differentColumn&&route.length<=4&&
        Math.abs(from.x-to.x)<=1.5*Math.max(from.width,to.width)&&
        Math.abs(from.y-to.y)<=1.5*Math.max(from.height,to.height)&&!movedCells.length){
        return {key,edgeIndex,nodes:[a,b],neighbors:{controls:[
          [a[0],a[1]+(b[1]-a[1])*.55],
          [b[0]-(b[0]-a[0])*.55,b[1]],
        ]}};
      }
      if(movedCells.length){
        const start=diagramPDFRibbonAnchor(from),end=diagramPDFRibbonAnchor(to);
        const affected=movedCells.some(cell=>cell===from||cell===to||diagramPDFRibbonCrossesRect(start,end,cell,clearance)||
          diagramPDFRibbonCrossesRect(start,end,cell.baseRect!,clearance));
        if(affected){
          const bends=diagramPDFLocalRibbonBends(start,end,page.cells.filter(c=>c!==from&&c!==to),plan,clearance);
          if(bends?.length)return {key,edgeIndex,bounded:true,nodes:[a,...bends.map(([x,y]):Point=>[x/plan.width,y/plan.height]),b]};
          if(bends)detour=false;
        }
      }
      if(detour)return {key,edgeIndex,nodes:[a,...route,b],bounded:true};
      else if(colored&&outgoing.get(edge.from)?.length===1){
        nodes=[a,b];chainEdges.push(edgeIndex);
      }else if(from.y!==to.y&&Math.abs(a[0]-b[0])>.001){
        const dx=b[0]-a[0],dy=b[1]-a[1];
        nodes=[a,[a[0]+dx*.15,a[1]+dy*.30],[a[0]+dx*.85,a[1]+dy*.70],b];
      }else nodes=[a,[(a[0]+b[0])/2,(a[1]+b[1])/2],b];
    }else if(edge.kind==='outgoing'&&from)nodes=[anchor(from,plan),route[route.length-1]];
    else if(edge.kind==='incoming'&&to)nodes=[route[0],anchor(to,plan)];
    else nodes=route;
    return {key,edgeIndex,nodes};
  });
  for(const i of chainEdges){
    const edge=edges[i],previous=incoming.get(edge.from),children=outgoing.get(edge.to);
    const next=children?.length===1?children[0]:undefined;
    const before=previous===undefined?undefined:tracks[previous].nodes.at(-2);
    const after=next===undefined?undefined:tracks[next].nodes[1];
    if(before||after)tracks[i].neighbors={before,after};
    if(movedCells.length){
      const affected=[edge.from,edge.to,previous===undefined?undefined:edges[previous].from,next===undefined?undefined:edges[next].to];
      if(movedCells.some(cell=>affected.includes(cell.branchNodeId)))tracks[i].bounded={start:0,end:0,movedSegments:new Set([0])};
    }
  }
  return tracks;
}

export interface DiagramPDFSeamHandle {key:string;kind:'incoming'|'outgoing';otherPage:number;height:number;stepLabel?:string}
export function diagramPDFPageSeams(options:DiagramPDFOptions,plan:DiagramPDFPlan,page:DiagramPDFPage):DiagramPDFSeamHandle[] {
  if(options.readingOrder!=='snake'||!options.ribbon?.enabled)return [];
  if(page.branchEdges){
    const cells=new Map(page.cells.map(cell=>[cell.branchNodeId,cell]));
    return page.branchEdges.flatMap(edge=>{
      if(edge.kind==='local'||edge.otherPage===undefined)return [];
      const entry=edge.kind==='incoming',at=entry?edge.points[0]:edge.points.at(-1)!;
      const cell=cells.get(entry?edge.to:edge.from);
      return [{key:diagramPDFSeamKey(edge.from,edge.to),kind:edge.kind,otherPage:edge.otherPage,height:at[1]/plan.height,stepLabel:cell?.branchLabel}];
    });
  }
  if(!page.linearSeams)return [];
  const nodes=diagramPDFRibbonNodes(options,plan,page);
  return (['incoming','outgoing'] as const).flatMap(kind=>{
    const seam=page.linearSeams?.[kind];
    return seam?[{...seam,kind,height:(kind==='incoming'?nodes[0]:nodes.at(-1)!)[1]}]:[];
  });
}

/** Render after the step artwork so the page references remain legible. */
export function diagramPDFBranchContinuations(options:DiagramPDFOptions,plan:DiagramPDFPlan,page:DiagramPDFPage):string {
  if(options.readingOrder!=='snake'||!page.branchEdges?.length)return '';
  const tracks=diagramPDFRibbonTracks(options,plan,page),markers=new Map<string,{kind:'incoming'|'outgoing';pages:Set<number>;at:Point}>();
  for(const [i,edge] of page.branchEdges.entries()){
    if(edge.kind==='local'||edge.otherPage===undefined)continue;
    const here=edge.kind==='incoming'?edge.to:edge.from;
    const at=edge.kind==='incoming'?tracks[i].nodes[0]:tracks[i].nodes.at(-1)!;
    const key=JSON.stringify([here,edge.kind,at]);
    const marker=markers.get(key)??{kind:edge.kind,pages:new Set<number>(),at};
    marker.pages.add(edge.otherPage+1);markers.set(key,marker);
  }
  const color=options.pageTextColor??'#52675d';
  return [...markers.values()].map(({kind,pages,at})=>{
    const x=Math.max(5,Math.min(plan.width-5,at[0]*plan.width)),y=Math.max(7,Math.min(plan.height-7,at[1]*plan.height));
    const align=x>plan.width*.75?'end':x<plan.width*.25?'start':'middle';
    const label=(kind==='incoming'?'接第 ':'续第 ')+[...pages].sort((a,b)=>a-b).join('、')+' 页';
    return `<text data-pdf-branch-continuation="${kind}" x="${x}" y="${y}" text-anchor="${align}" dominant-baseline="central" font-size="8" font-weight="600" fill="${color}" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke">${label}</text>`;
  }).join('');
}
interface RibbonSegment {start:Point;c1:Point;c2:Point;end:Point}
export function ribbonSegments(nodes:readonly Point[],plan:RibbonPageSize,bounded:DiagramPDFRibbonBounds=false,neighbors?:DiagramPDFRibbonNeighbors):RibbonSegment[]{
  const pagePoint=([x,y]:Point):Point=>[x*plan.width,y*plan.height];
  const points=nodes.map(pagePoint);
  if(points.length===2&&neighbors?.controls)return [{start:points[0],c1:pagePoint(neighbors.controls[0]),c2:pagePoint(neighbors.controls[1]),end:points[1]}];
  const before=neighbors?.before&&pagePoint(neighbors.before),after=neighbors?.after&&pagePoint(neighbors.after);
  return points.slice(1).map((end,i)=>{
    const start=points[i],previous=points[i-1]??before??start,next=points[i+2]??after??end;
    const arriving=neighbors?.incomingSlopes,leaving=neighbors?.outgoingSlopes;
    const offset=leaving?points.length-leaving.length:points.length;
    const slopes=arriving&&i+1<arriving.length?arriving:leaving&&i>=offset?leaving:undefined;
    if(slopes){
      // Each half of the same spread cubic keeps its derivatives in PDF points,
      // including arrow placement and edits to other segments on a linear page.
      const j=slopes===arriving?i:i-offset,run=(end[0]-start[0])/3;
      const c1:Point=[start[0]+run,start[1]+run*slopes[j]];
      const c2:Point=[end[0]-run,end[1]-run*slopes[j+1]];
      return {start,c1,c2,end};
    }
    const c1:Point=[start[0]+(end[0]-previous[0])/6,start[1]+(end[1]-previous[1])/6];
    const c2:Point=[end[0]-(next[0]-start[0])/6,end[1]-(next[1]-start[1])/6];
    const inGutter=bounded===true||bounded&&(i<bounded.start||i>=points.length-1-bounded.end);
    if(inGutter){
      // Monotone tangents stay in the clear corridor. Adjacent gutter spans
      // share their tangent even when one span is much shorter than the next.
      for(const axis of [0,1] as const){
        const delta=end[axis]-start[axis];
        c1[axis]=start[axis]+gutterHandle(start[axis]-previous[axis],delta);
        c2[axis]=end[axis]-gutterHandle(delta,next[axis]-end[axis]);
      }
    }else if(bounded&&bounded.movedSegments?.has(i)){
      fitMovedRibbonHandle(start,c1,end);
      fitMovedRibbonHandle(end,c2,start);
    }
    if(i===0&&!before&&start[0]===0){
      c1[0]=start[0]+(end[0]-start[0])/3;c1[1]=start[1];
      if(start[1]===end[1])c2[1]=end[1];
    }
    if(i===points.length-2&&!after&&end[0]===plan.width){
      c2[0]=end[0]-(end[0]-start[0])/3;c2[1]=end[1];
      if(end[1]===start[1])c1[1]=start[1];
    }
    return {start,c1,c2,end};
  });
}
/** After a step is moved close to another, a long incoming tangent must
 * turn toward the new segment. Measure each handle in that segment's frame. */
function fitMovedRibbonHandle(origin:Point,control:Point,target:Point){
  const dx=target[0]-origin[0],dy=target[1]-origin[1],squared=dx*dx+dy*dy;
  if(!squared){control[0]=origin[0];control[1]=origin[1];return;}
  const cx=control[0]-origin[0],cy=control[1]-origin[1];
  const forward=Math.max(0,Math.min(.5,(cx*dx+cy*dy)/squared));
  const limit=Math.min(.25,forward);
  const side=Math.max(-limit,Math.min(limit,(cy*dx-cx*dy)/squared));
  control[0]=origin[0]+forward*dx-side*dy;
  control[1]=origin[1]+forward*dy+side*dx;
}
function gutterHandle(incoming:number,outgoing:number):number {
  if(incoming*outgoing<=0)return 0;
  return Math.sign(incoming)*Math.min(Math.abs(incoming+outgoing)/6,Math.abs(incoming)/2,Math.abs(outgoing)/2);
}
export function diagramPDFRibbonPath(nodes:readonly Point[],plan:RibbonPageSize,bounded:DiagramPDFRibbonBounds=false,neighbors?:DiagramPDFRibbonNeighbors,paintWidth=0):string {
  return ribbonPathFromSegments(ribbonSegments(nodes,plan,bounded,neighbors),plan,neighbors,paintWidth);
}
function ribbonPathFromSegments(segments:RibbonSegment[],plan:RibbonPageSize,neighbors?:DiagramPDFRibbonNeighbors,paintWidth=0):string {
  if(!segments.length)return '';
  const first=segments[0].start,last=segments.at(-1)!.end;
  // Extend the painted stroke past the page along its actual seam tangent.
  // A round cap centered on an oblique cut would change its visible width.
  function outside(tip:Point,neighbor:Point|undefined,side:-1|1):string|undefined {
    if(!neighbor||!paintWidth||tip[0]!== (side<0?0:plan.width))return;
    const dx=neighbor[0]*plan.width-tip[0],dy=neighbor[1]*plan.height-tip[1];
    if(side*dx<=0||Math.abs(dy)<1e-9)return;
    const run=side*(paintWidth/2+1);
    return [tip[0]+run,tip[1]+run*dy/dx].join(' ');
  }
  const before=outside(first,neighbors?.before,-1),after=outside(last,neighbors?.after,1);
  const start=before?'M '+before+' L '+first.join(' '):'M '+first.join(' ');
  return start+' '+segments.map(({c1,c2,end})=>`C ${c1.join(' ')} ${c2.join(' ')} ${end.join(' ')}`).join(' ')+(after?' L '+after:'');
}

export interface DiagramPDFRibbonPaintTarget {key:string;from:string;to:string;branchStepId?:string;path:string}
const mixPoint=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
function splitRibbonCubic(curve:RibbonSegment,t:number):[RibbonSegment,RibbonSegment]{
  const {start,c1,c2,end}=curve,a=mixPoint(start,c1,t),b=mixPoint(c1,c2,t),c=mixPoint(c2,end,t);
  const left=mixPoint(a,b,t),right=mixPoint(b,c,t),at=mixPoint(left,right,t);
  return [{start,c1:a,c2:left,end:at},{start:at,c1:right,c2:c,end}];
}
function ribbonCurveSpan(curves:RibbonSegment[],first:number,last:number){
  const result:RibbonSegment[]=[];
  for(let i=Math.floor(first);i<Math.ceil(last);i++){
    const lo=Math.max(0,first-i),hi=Math.min(1,last-i);
    if(hi<=lo)continue;
    const prefix=hi===1?curves[i]:splitRibbonCubic(curves[i],hi)[0];
    result.push(lo===0?prefix:splitRibbonCubic(prefix,lo/hi)[1]);
  }
  return result;
}
function ribbonAnchorPosition(curves:RibbonSegment[],at:Point,after:number):number{
  // Automatic and unmodified artwork anchors are exact knots, even after a page turn.
  const first=Math.floor(after);
  for(let i=first;i<=curves.length;i++){
    if(i<after)continue;
    const point=i===curves.length?curves[i-1].end:curves[i].start;
    if(Math.hypot(point[0]-at[0],point[1]-at[1])<1e-6)return i;
  }
  // A manually moved or deleted knot can leave the actual curve between two
  // steps. Project in reading order and subdivide the existing cubic there.
  let best=after,distance=Infinity;
  for(let i=first;i<curves.length;i++){
    const curve=curves[i],lo=Math.max(0,after-i);
    const pointAt=(t:number):Point=>{
      const u=1-t;
      return [0,1].map(k=>u*u*u*curve.start[k]+3*u*u*t*curve.c1[k]+3*u*t*t*curve.c2[k]+t*t*t*curve.end[k]) as Point;
    };
    let p=pointAt(lo),previous=lo;
    for(let j=1;j<=24;j++){
      const t=lo+(1-lo)*j/24,q=pointAt(t),dx=q[0]-p[0],dy=q[1]-p[1];
      const weight=Math.max(0,Math.min(1,((at[0]-p[0])*dx+(at[1]-p[1])*dy)/(dx*dx+dy*dy||1)));
      const place=previous+weight*(t-previous),projected=pointAt(place),d=Math.hypot(projected[0]-at[0],projected[1]-at[1]);
      if(d<distance){distance=d;best=i+place;}
      p=q;previous=t;
    }
  }
  return best;
}
export function diagramPDFLinearRibbonPaintTargets(plan:DiagramPDFPlan,page:DiagramPDFPage,track:DiagramPDFRibbonTrack,width:number):DiagramPDFRibbonPaintTarget[]{
  const curves=ribbonSegments(track.nodes,plan,track.bounded,track.neighbors);
  if(!curves.length||!page.cells.every(cell=>cell.ribbonNodeId))return [];
  const incoming=page.linearSeams?.incoming,outgoing=page.linearSeams?.outgoing,targets:DiagramPDFRibbonPaintTarget[]=[];
  const add=(from:DiagramPDFCell,to:DiagramPDFCell,first:number,last:number)=>{
    const a=from.ribbonNodeId!,b=to.ribbonNodeId!;
    const neighbors={before:first===0?track.neighbors?.before:undefined,after:last===curves.length?track.neighbors?.after:undefined};
    const path=ribbonPathFromSegments(ribbonCurveSpan(curves,first,last),plan,neighbors,width);
    if(path)targets.push({key:diagramPDFSeamKey(a,b),from:a,to:b,branchStepId:to.branchColorStepId,path});
  };
  let position=0,previous=incoming?plan.pages[incoming.otherPage].cells.at(-1):undefined;
  for(const [i,cell] of page.cells.entries()){
    const end=!incoming&&i===0?0:!outgoing&&i===page.cells.length-1?curves.length:
      ribbonAnchorPosition(curves,diagramPDFRibbonAnchor(cell),position);
    if(previous)add(previous,cell,position,end);
    previous=cell;position=end;
  }
  if(outgoing&&previous)add(previous,plan.pages[outgoing.otherPage].cells[0],position,curves.length);
  return targets;
}
export function diagramPDFRibbonPaintTargets(options:DiagramPDFOptions,plan:DiagramPDFPlan,page:DiagramPDFPage):DiagramPDFRibbonPaintTarget[]{
  if(options.readingOrder!=='snake'||!options.ribbon?.enabled||!page.cells.length)return [];
  const width=diagramPDFRibbonStrokeWidth(options.ribbon),tracks=diagramPDFRibbonTracks(options,plan,page);
  if(!page.branchEdges)return diagramPDFLinearRibbonPaintTargets(plan,page,tracks[0],width);
  const edges=page.branchEdges;
  return tracks.map(track=>{
    const {from,to,branchColorStepId}=edges[track.edgeIndex!];
    return {key:diagramPDFSeamKey(from,to),from,to,branchStepId:branchColorStepId,path:diagramPDFRibbonPath(track.nodes,plan,track.bounded,track.neighbors,width)};
  });
}

// Coordinates along and across the band, in units of ribbon width.
function ribbonArrowPolygons(style:DiagramPDFRibbonArrowStyle=DEFAULT_RIBBON_ARROW_STYLE,thicknessPercent=DEFAULT_RIBBON_ARROW_THICKNESS):Point[][] {
  const weight=thicknessPercent/100;
  if(style==='solid'){
    return [[[0,-.5],[.95*weight,0],[0,.5]]];
  }
  const ink=.24*weight;
  const head:Point[]=[[-.34,-.43],[-.34+ink,-.43],[.29,0],[-.34+ink,.43],[-.34,.43],[.29-ink,0]];
  return [-.24,.24].map(offset=>head.map(([a,b]):Point=>[a+offset,b]));
}
function closedArrowPath(vertices:readonly Point[]):string {
  return 'M '+vertices.map(([x,y])=>`${x.toFixed(3)} ${y.toFixed(3)}`).join(' L ')+' Z';
}
export function diagramPDFRibbonArrowIconPath(style:DiagramPDFRibbonArrowStyle,thicknessPercent:number):string {
  const polygons=ribbonArrowPolygons(style,thicknessPercent);
  if(style==='solid'){
    const [triangle]=polygons;
    const centerX=(triangle[0][0]+triangle[1][0])/2;
    return closedArrowPath(triangle.map(([x,y])=>[x-centerX,y]));
  }
  return polygons.map(closedArrowPath).join(' ');
}
function ribbonArrowAt({start,c1,c2,end}:RibbonSegment,t:number,along:number,across:number,captions:readonly DiagramPDFRect[],polygons:Point[][]){
  const u=1-t;
  const pos=(i:0|1)=>u*u*u*start[i]+3*u*u*t*c1[i]+3*u*t*t*c2[i]+t*t*t*end[i];
  const tangent=(i:0|1)=>u*u*(c1[i]-start[i])+2*u*t*(c2[i]-c1[i])+t*t*(end[i]-c2[i]);
  const x=pos(0),y=pos(1),dx=tangent(0),dy=tangent(1),length=Math.hypot(dx,dy);
  if(length<1e-8)return '';
  const ux=dx/length,uy=dy/length;
  const placed=polygons.map(polygon=>polygon.map(([a,b]):Point=>[
    x+a*along*ux-b*across*uy,y+a*along*uy+b*across*ux,
  ]));
  if(captions.length){
    const vertices=placed.flat(),xs=vertices.map(p=>p[0]),ys=vertices.map(p=>p[1]);
    const left=Math.min(...xs)-2,right=Math.max(...xs)+2,top=Math.min(...ys)-2,bottom=Math.max(...ys)+2;
    if(captions.some(r=>right>r.x&&left<r.x+r.width&&bottom>r.y&&top<r.y+r.height))return '';
  }
  return placed.map(closedArrowPath).join(' ');
}
export function diagramPDFRibbonArrowPath(nodes:readonly Point[],plan:RibbonPageSize,widthMm:number,captions:readonly DiagramPDFRect[]=[],appearance:Pick<DiagramPDFRibbon,'arrowStyle'|'arrowThicknessPercent'>={},onePerEdge=false,bounded:DiagramPDFRibbonBounds=false,neighbors?:DiagramPDFRibbonNeighbors):string {
  const width=widthMm*72/25.4,paths:string[]=[];
  const polygons=ribbonArrowPolygons(appearance.arrowStyle,appearance.arrowThicknessPercent);
  const solid=appearance.arrowStyle==='solid';
  const segments=ribbonSegments(nodes,plan,bounded,neighbors);
  if(onePerEdge&&segments.length>1){
    const lengths=segments.map(({start,end})=>Math.hypot(end[0]-start[0],end[1]-start[1]));
    const total=lengths.reduce((a,b)=>a+b,0);
    if(total<Math.max(2,width*.3))return '';
    const along=Math.min(width,total*.48);
    for(const fraction of [.5,.58,.42,.66,.34,.74,.26]){
      let distance=fraction*total-(solid ? .42*along : 0);
      for(const [i,length] of lengths.entries()){
        if(length>0&&distance<=length){
          const arrow=ribbonArrowAt(segments[i],Math.max(0,distance/length),along,solid?width:along,captions,polygons);
          if(arrow)return arrow;
          break;
        }
        distance-=length;
      }
    }
    return '';
  }
  for(const segment of segments){
    const {start,end}=segment;
    const gap=Math.hypot(end[0]-start[0],end[1]-start[1]);
    if(gap<Math.max(2,width*.3))continue;
    const along=Math.min(width,gap*.48),across=solid?width:along,downward=end[1]>=start[1]?1:-1;
    // Anchor the solid base on the curve itself so its two ends meet the band edges at a turn.
    const anchorT=solid ? .5-.42*along/gap : .5;
    // Start halfway between steps. At a row break prefer the space below the caption.
    for(const offset of [0,.075,.15,-.075,-.15,.225,-.225]){
      const arrow=ribbonArrowAt(segment,anchorT+offset*downward,along,across,captions,polygons);
      if(arrow){paths.push(arrow);break;}
    }
  }
  return paths.join(' ');
}
/** The gradient coordinate system is the unrolled ribbon: X follows its
 * direction and Y crosses its width. Page backgrounds keep page coordinates. */
export function diagramPDFRibbonSVG(options:DiagramPDFOptions,plan:DiagramPDFPlan,page:DiagramPDFPage,pageIndex:number,captions:readonly DiagramPDFRect[]=[]):string {
  const ribbon=options.ribbon,colored=ribbon?.enabled;
  if(options.readingOrder!=='snake'||!page.cells.length||(!colored&&!page.branchEdges?.length))return '';
  const tracks=diagramPDFRibbonTracks(options,plan,page),width=diagramPDFRibbonStrokeWidth(colored?ribbon:undefined);
  const targetPages=new Map<DiagramPDFPage,DiagramPDFRibbonPaintTarget[]>();
  const targets=(sheet:DiagramPDFPage)=>{
    let found=targetPages.get(sheet);
    if(!found){found=diagramPDFRibbonPaintTargets(options,plan,sheet);targetPages.set(sheet,found);}
    return found;
  };
  let serial=0;
  const render=(target:DiagramPDFRibbonPaintTarget|undefined,path:string)=>{
    let paint=colored?ribbon.paint:defaultDiagramPDFPaint('#a2b0a7'),transition: {from:string;to:string}|undefined;
    if(colored&&target){
      const segment=ribbon.segmentColors?.[target.key],branch=diagramPDFRibbonBranchColor(plan.ribbonBranches??[],target.branchStepId,ribbon.branchColors);
      if(segment!==undefined)paint=defaultDiagramPDFPaint(segment);
      else if(branch!==undefined){
        paint=defaultDiagramPDFPaint(branch);
        // Only the connection entering an explicitly coloured branch changes
        // colour. Its process figures and later connections retain that colour.
        if(target.branchStepId&&Object.hasOwn(ribbon.branchColors??{},target.branchStepId)&&target.to===diagramPDFRibbonNodeId(target.branchStepId)){
          const arm=plan.ribbonBranches?.find(item=>item.stepId===target.branchStepId);
          const before=diagramPDFRibbonBranchColor(plan.ribbonBranches??[],arm?.parentStepId,ribbon.branchColors);
          const original=before?{color:before,opacity:1}:ribbonPaintColor(ribbon.paint,1);
          if(original.color.toLowerCase()!==branch.toLowerCase()||original.opacity!==1){
            transition={from:original.color,to:branch};
            paint={...paint,kind:'linear',angle:0,stops:[{id:'source',offset:0,color:original.color,opacity:original.opacity},{id:'branch',offset:100,color:branch,opacity:1}]};
          }
        }
      }
    }
    let offset=0,total=paint.kind==='solid'?0:ribbonPaintGeometry(path).length;
    if(target&&paint.kind!=='solid'){
      const edge=page.branchEdges?.find(edge=>diagramPDFSeamKey(edge.from,edge.to)===target.key);
      const seam=edge?.kind!=='local'&&edge?.otherPage!==undefined?{kind:edge.kind,otherPage:edge.otherPage}:
        page.linearSeams?.incoming?.key===target.key?{kind:'incoming',otherPage:page.linearSeams.incoming.otherPage}:
        page.linearSeams?.outgoing?.key===target.key?{kind:'outgoing',otherPage:page.linearSeams.outgoing.otherPage}:undefined;
      if(seam){
        const other=targets(plan.pages[seam.otherPage]).find(item=>item.key===target.key);
        if(other){const otherLength=ribbonPaintGeometry(other.path).length;total+=otherLength;if(seam.kind==='incoming')offset=otherLength;}
      }
    }
    const attributes='data-pdf-ribbon="true"'+(target?' data-pdf-ribbon-segment="'+encodeURIComponent(target.key)+'"':'')+
      (transition?' data-pdf-ribbon-start-color="'+transition.from+'" data-pdf-ribbon-end-color="'+transition.to+'"':'');
    return ribbonPathPaintSVG(path,width,paint,'pdf-ribbon-paint-'+pageIndex+'-'+serial++,attributes,offset,total);
  };
  const paths=tracks.map(track=>{
    const {nodes,edgeIndex,bounded,neighbors}=track,path=diagramPDFRibbonPath(nodes,plan,bounded,neighbors,width);
    if(!path)return '';
    const sections=colored?(edgeIndex===undefined?diagramPDFLinearRibbonPaintTargets(plan,page,track,width):[targets(page)[edgeIndex]]):[];
    const band=sections.length?sections.map(target=>render(target,target.path)).join(''):render(undefined,path);
    const arrows=colored&&ribbon.showArrows?`<path data-pdf-ribbon-arrows="true" d="${diagramPDFRibbonArrowPath(nodes,plan,ribbon.widthMm,captions,ribbon,edgeIndex!==undefined,bounded,neighbors)}" fill="${ribbon.arrowColor??DEFAULT_RIBBON_ARROW_COLOR}" fill-opacity="${diagramPDFRibbonArrowOpacity(ribbon)}"/>`:'';
    return edgeIndex===undefined?band+arrows:`<g data-pdf-ribbon-edge="${edgeIndex}">${band}${arrows}</g>`;
  }).join('');
  return paths?`<g data-pdf-ribbon-layer="true" opacity="${colored?ribbon.opacity:1}" pointer-events="none">${paths}</g>`:'';
}
