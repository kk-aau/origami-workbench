import type {Point} from '../core/types';
import type {DiagramPDFPage,DiagramPDFRect} from './diagramPDFLayout';
import {diagramPDFBranchLocalPath,type DiagramPDFBranchCell,type DiagramPDFBranchNode,type DiagramPDFBranchPage,
  type DiagramPDFBranchEdge,type DiagramPDFBranchPageSpec} from './diagramPDFBranchLayout';
import {diagramPDFBranchContinuationPaths,diagramPDFForkRowTurn,diagramPDFRibbonAnchor,type ContinuationLayout} from './diagramPDFBranchContinuation';
import {defaultDiagramPDFRibbon,diagramPDFBranchRibbonTracks,diagramPDFRibbonKey,ribbonSegments} from './diagramPDFDecoration';

const defaultRibbon=defaultDiagramPDFRibbon();
const pageGeometry=new WeakMap<DiagramPDFBranchCell[],{spec:DiagramPDFBranchPageSpec;rects:DiagramPDFRect[];ink:DiagramPDFRect[][]}>();
const inkCache=new WeakMap<DiagramPDFBranchPageSpec,Map<string,DiagramPDFRect[]>>();
// A bare grid specifies the content bounds. Mirror its margins when a
// caller has not supplied the physical sheet or measured any artwork.
const paperRect=(spec:DiagramPDFBranchPageSpec)=>spec.paper??{x:0,y:0,
  width:spec.bounds.width+2*spec.bounds.x,height:spec.bounds.height+2*spec.bounds.y};

function geometry(page:DiagramPDFBranchPage,spec:DiagramPDFBranchPageSpec){
  const cached=pageGeometry.get(page.cells);
  if(cached?.spec===spec)return cached;
  const rects=page.cells.map(cell=>spec.displayRect?.(cell)??cell);
  let cache=inkCache.get(spec);
  if(!cache){cache=new Map();inkCache.set(spec,cache);}
  const ink=page.cells.map((cell,i)=>{
    const rect=rects[i];
    if(!spec.obstacleRects){
      const [x,y]=diagramPDFRibbonAnchor(rect);
      return [{x,y,width:0,height:0}];
    }
    const key=JSON.stringify([cell.id,rect.x,rect.y,rect.width,rect.height,page.columns,page.rows]);
    const stored=cache.get(key);
    if(stored)return stored;
    const boxes=spec.obstacleRects(cell,rect,page.columns,page.rows);
    cache.set(key,boxes);return boxes;
  });
  const result={spec,rects,ink};
  pageGeometry.set(page.cells,result);
  return result;
}

function ribbonContext(page:DiagramPDFBranchPage,spec:DiagramPDFBranchPageSpec){
  const {rects}=geometry(page,spec),paper=paperRect(spec);
  const plan={width:paper.width,height:paper.height,gap:spec.gap};
  const display:DiagramPDFPage={kind:spec.kind??'steps',columns:page.columns,rows:page.rows,notes:[],
    cells:page.cells.map((cell,i)=>({...cell,...rects[i],branchNodeId:cell.id,baseRect:cell,columns:page.columns,rows:page.rows,
      descriptionLines:[],descriptionOverflow:false}))};
  const options={readingOrder:'snake' as const,ribbon:spec.ribbon??defaultRibbon};
  const key=options.ribbon.paths?diagramPDFRibbonKey(plan,display):'';
  return {plan,tracks:(edges:DiagramPDFBranchEdge[])=>diagramPDFBranchRibbonTracks(options,plan,display,edges,key)};
}

function forkArrivalDirection(cell:DiagramPDFBranchCell,page:DiagramPDFBranchPage,spec:DiagramPDFBranchPageSpec):Point|undefined{
  if(!cell.parentId)return;
  // Both arms leave this fork. Neither supplies a forward tangent to the
  // incoming curve, even while only the first child has been placed.
  const edges=page.edges.filter(e=>e.from!==cell.id);
  const drawn=new Set(edges.map(e=>e.to)),cells=new Map(page.cells.map(c=>[c.id,c]));
  for(const child of page.cells){
    const parent=child.parentId&&cells.get(child.parentId);
    if(parent&&parent.id!==cell.id&&!drawn.has(child.id)){
      edges.push({from:parent.id,to:child.id,kind:'local',points:diagramPDFBranchLocalPath(parent,child,page,spec)});
    }
  }
  const index=edges.findIndex(e=>e.to===cell.id&&e.kind!=='outgoing');
  if(index<0)return;
  const {plan,tracks}=ribbonContext(page,spec),track=tracks(edges)[index];
  const segments=ribbonSegments(track.nodes,plan,track.bounded,track.neighbors);
  for(let i=segments.length-1;i>=0;i--){
    const {end,c2,c1,start}=segments[i];
    // A bounded spline can put its control point on the endpoint.
    for(const p of [c2,c1,start]){
      const dx=end[0]-p[0],dy=end[1]-p[1];
      if(Math.hypot(dx,dy)>1e-7)return [dx,dy];
    }
  }
}

export function diagramPDFBranchEndpoint(cell:DiagramPDFBranchCell,page:DiagramPDFBranchPage,spec:DiagramPDFBranchPageSpec):ContinuationLayout{
  const {rects,ink}=geometry(page,spec),index=page.cells.indexOf(cell);
  const paths=spec.ribbon?.paths,paper=paperRect(spec);
  const pathKey=paths&&diagramPDFRibbonKey(paper,{kind:spec.kind??'steps',cells:page.cells});
  return {cell:rects[index],cells:rects,paper,gap:spec.gap,
    siblings:cell.parentId?page.cells.flatMap((c,i)=>c!==cell&&c.parentId===cell.parentId?[rects[i]]:[]):undefined,
    arrivalDirection:()=>forkArrivalDirection(cell,page,spec),
    gridCell:cell,
    savedPort:paths?(from,to,kind)=>paths[pathKey+'|branch|'+JSON.stringify([from,to,kind])]?.at(kind==='incoming'?0:-1)?.[1]:undefined,
    obstacles:ink.flatMap((boxes,i)=>i===index?[]:boxes)};
}

/** Several alternatives can continue on different sheets. Give their
 * automatic ports distinct heights even when all targets occupy the same
 * grid position on their respective sheets. */
export function diagramPDFBranchRoute(source:ContinuationLayout,target:ContinuationLayout,from:string,to:string,
  spec:DiagramPDFBranchPageSpec,children:ReadonlyMap<string,readonly DiagramPDFBranchNode[]>){
  let seam=spec.seamHeight?.(from,to);
  const arms=children.get(from);
  if(seam===undefined&&arms&&arms.length>1&&(source.cells.length===1||spec.columns===1||spec.rows===1||arms.length>2)){
    const index=arms.findIndex(arm=>arm.id===to);
    if(index>=0){
      const {paper,cell}=source;
      const center=(diagramPDFRibbonAnchor(cell)[1]-paper.y)/paper.height;
      const span=Math.min(cell.height/paper.height*.88,.70);
      const top=Math.max(.02,Math.min(.98-span,center-span/2));
      seam=top+span*index/(arms.length-1);
    }
  }
  const rightColumn=spec.bounds.x+spec.bounds.width*(1-1/spec.columns);
  if(seam===undefined&&arms?.length===2&&diagramPDFRibbonAnchor(source.cell)[0]>=rightColumn&&
    (!source.gridCell||Math.abs(diagramPDFRibbonAnchor(source.cell)[1]-diagramPDFRibbonAnchor(source.gridCell)[1])<source.cell.height/2)){
    const turn=diagramPDFForkRowTurn(source,target,spec.ribbonWidth??0);
    if(turn){
      const savedOut=source.savedPort?.(from,to,'outgoing'),savedIn=target.savedPort?.(from,to,'incoming');
      const samePort=(saved:number|undefined,y:number,paper:DiagramPDFRect)=>saved===undefined||Math.abs(saved*paper.height-y)<.01;
      if(samePort(savedOut,turn.outgoing.at(-1)![1],source.paper)&&samePort(savedIn,turn.incoming[0][1],target.paper))return turn;
      // Retain a previously authored diagonal seam. Edits made to the new
      // level exit also reopen at their own recorded page-edge position.
      const standard=diagramPDFBranchContinuationPaths(source,target,undefined,spec.ribbonWidth);
      if(samePort(savedOut,standard.outgoing.at(-1)![1],source.paper)&&samePort(savedIn,standard.incoming[0][1],target.paper))return standard;
      seam=savedOut!==undefined&&savedIn!==undefined&&Math.abs(savedOut-savedIn)>1e-6?{outgoing:savedOut,incoming:savedIn}:savedOut??savedIn;
    }
  }
  return diagramPDFBranchContinuationPaths(source,target,seam,spec.ribbonWidth);
}

// Subdivide until the control polygon lies within a tenth of a PDF point of
// the chord. The same cubic controls are used for the printed PDF ribbon.
const mid=(a:Point,b:Point):Point=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
function distanceToSegment(p:Point,a:Point,b:Point){
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function flatten(a:Point,b:Point,c:Point,d:Point,points:Point[]){
  if(Math.max(distanceToSegment(b,a,d),distanceToSegment(c,a,d))<=.1){points.push(d);return;}
  const ab=mid(a,b),bc=mid(b,c),cd=mid(c,d),left=mid(ab,bc),right=mid(bc,cd),center=mid(left,right);
  flatten(a,ab,left,center,points);flatten(center,right,cd,d,points);
}
const eps=1e-7;
const samePoint=(a:Point,b:Point)=>Math.abs(a[0]-b[0])<=eps&&Math.abs(a[1]-b[1])<=eps;
const side=(a:Point,b:Point,p:Point)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function segmentsConflict(a:Point,b:Point,c:Point,d:Point,shared:Point|undefined){
  for(const axis of [0,1]){
    if(Math.max(a[axis],b[axis])+eps<Math.min(c[axis],d[axis])||Math.max(c[axis],d[axis])+eps<Math.min(a[axis],b[axis]))return false;
  }
  const abC=side(a,b,c),abD=side(a,b,d),cdA=side(c,d,a),cdB=side(c,d,b);
  if((abC>eps&&abD>eps)||(abC< -eps&&abD< -eps)||(cdA>eps&&cdB>eps)||(cdA< -eps&&cdB< -eps))return false;
  if(shared&&(samePoint(a,shared)||samePoint(b,shared))&&(samePoint(c,shared)||samePoint(d,shared))){
    // Separate arms may meet at one anchor. Doubling back along the same
    // segment still obscures which ribbon to follow.
    if(Math.abs(abC)>eps||Math.abs(abD)>eps)return false;
    const axis=Math.abs(a[0]-b[0])>Math.abs(a[1]-b[1])?0:1;
    return Math.min(Math.max(a[axis],b[axis]),Math.max(c[axis],d[axis]))-
      Math.max(Math.min(a[axis],b[axis]),Math.min(c[axis],d[axis]))>eps;
  }
  return true;
}

function pageConflicts(page:DiagramPDFBranchPage,spec:DiagramPDFBranchPageSpec,edges:DiagramPDFBranchEdge[],existing=0){
  if(edges.length<2&&page.cells.length<3)return false;
  const {rects}=geometry(page,spec),{plan,tracks}=ribbonContext(page,spec);
  const anchors=new Map(page.cells.map((cell,i)=>[cell.id,diagramPDFRibbonAnchor(rects[i])]));
  const polylines=(list:DiagramPDFBranchEdge[])=>tracks(list).map(track=>{
    const points:Point[]=[];
    for(const segment of ribbonSegments(track.nodes,plan,track.bounded,track.neighbors)){
      if(!points.length)points.push(segment.start);
      flatten(segment.start,segment.c1,segment.c2,segment.end,points);
    }
    return points.filter((p,i)=>!i||!samePoint(p,points[i-1]));
  });
  const curves=polylines(edges);
  let original:Point[][]|undefined;
  const oldCurves=()=>original??=polylines(edges.slice(0,existing));
  const hitsAnchor=(curve:Point[],p:Point)=>curve.some((b,k)=>k>0&&distanceToSegment(p,curve[k-1],b)<.2);
  const overlap=(a:Point[],b:Point[],shared?:Point)=>{
    for(let k=1;k<a.length;k++)for(let l=1;l<b.length;l++){
      if(segmentsConflict(a[k-1],a[k],b[l-1],b[l],shared))return true;
    }
    return false;
  };
  for(const [i,line] of curves.entries()){
    const edge=edges[i];
    for(const [id,p] of anchors){
      if(id!==edge.from&&id!==edge.to&&hitsAnchor(line,p)&&(i>=existing||!hitsAnchor(oldCurves()[i],p)))return true;
    }
    for(let j=0;j<i;j++){
      const other=edges[j],otherLine=curves[j];
      const id=[edge.from,edge.to].find(id=>id===other.from||id===other.to);
      const shared=id&&anchors.get(id)||undefined;
      // A saved drawing may already overlap another drawing on the source
      // sheet. Reject new intersections, including changes to old tangents.
      if(overlap(line,otherLine,shared)&&(i>=existing||!overlap(oldCurves()[i],oldCurves()[j],shared)))return true;
    }
  }
  return false;
}

/** Check both halves when a proposed page gives a previously open branch
 * its destination. Local curves include the same tangents as the export. */
export function diagramPDFBranchPlacesConflict(page:DiagramPDFBranchPage,previous:DiagramPDFBranchPage|undefined,
  spec:DiagramPDFBranchPageSpec,prior:DiagramPDFBranchPageSpec|undefined,children:ReadonlyMap<string,readonly DiagramPDFBranchNode[]>,
  earlier?:ReadonlyMap<string,{page:DiagramPDFBranchPage;spec:DiagramPDFBranchPageSpec}>,previewExits=true):boolean{
  const here=new Map(page.cells.map(cell=>[cell.id,cell])),before=new Map(previous?.cells.map(cell=>[cell.id,cell]));
  const edges:DiagramPDFBranchEdge[]=[],sources=new Map<DiagramPDFBranchPage,{spec:DiagramPDFBranchPageSpec;edges:DiagramPDFBranchEdge[]}>();
  for(const cell of page.cells){
    const parent=here.get(cell.parentId??'');
    if(parent){edges.push({from:parent.id,to:cell.id,kind:'local',points:diagramPDFBranchLocalPath(parent,cell,page,spec)});continue;}
    const parentId=cell.parentId??'',history=earlier?.get(parentId);
    const sourcePage=history?.page??previous,sourceSpec=history?.spec??prior;
    const source=before.get(parentId)??history?.page.cells.find(entry=>entry.id===parentId);
    if(sourcePage&&sourceSpec&&source){
      const from=source.id,to=cell.id;
      let group=sources.get(sourcePage);
      if(!group){group={spec:sourceSpec,edges:[...sourcePage.edges]};sources.set(sourcePage,group);}
      const route=diagramPDFBranchRoute(diagramPDFBranchEndpoint(source,sourcePage,sourceSpec),diagramPDFBranchEndpoint(cell,page,spec),from,to,sourceSpec,children);
      edges.push({from,to,kind:'incoming',points:route.incoming,slopes:route.slopes?.incoming});
      group.edges.push({from,to,kind:'outgoing',points:route.outgoing,slopes:route.slopes?.outgoing});
    }
  }
  if(previewExits){
    // For a fork crossing the seam, preview independent destinations. Treating
    // two pending children as one exit would accept a long overlapping trunk.
    const pitch=spec.bounds.height/page.rows;
    for(const cell of page.cells){
      const pending=children.get(cell.id)?.filter(child=>!here.has(child.id))??[];
      if(!pending.length)continue;
      const source=diagramPDFBranchEndpoint(cell,page,spec);
      const first=Math.max(0,Math.min(page.rows-pending.length,cell.row));
      for(const [i,next] of pending.slice(0,page.rows*page.columns).entries()){
        const row=(first+i)%page.rows,column=Math.floor((first+i)/page.rows);
        const dest={...source.cell,x:spec.bounds.x+column*spec.bounds.width/page.columns,y:source.cell.y+(row-cell.row)*pitch};
        const target={paper:source.paper,cell:dest,gap:spec.gap,cells:[dest]};
        const route=diagramPDFBranchRoute(source,target,cell.id,next.id,spec,children);
        edges.push({from:cell.id,to:next.id,kind:'outgoing',points:route.outgoing,slopes:route.slopes?.outgoing});
      }
    }
  }
  if(pageConflicts(page,spec,edges))return true;
  for(const [source,group] of sources)if(pageConflicts(source,group.spec,group.edges,source.edges.length))return true;
  return false;
}
