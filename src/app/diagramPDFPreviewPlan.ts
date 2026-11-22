import type {DiagramProject} from './diagramProject';
import {diagramPDFBranchContinuationPaths,diagramPDFRibbonStrokeWidth} from './diagramPDFBranchContinuation';
import type {DiagramPDFBranchEdge} from './diagramPDFBranchLayout';
import {diagramPDFIntroLayout,diagramPDFPageBands,planDiagramPDF,validateDiagramPDFOptions,type DiagramPDFOptions,type DiagramPDFPage,type DiagramPDFPlan} from './diagramPDFLayout';
import {diagramPDFSeamKey} from './diagramPDFSeams';
import {diagramPDFRibbonObstacleRects} from './diagramPDFRibbonObstacles';

// These settings affect drawing inside an existing page. Unknown settings take the full layout path.
const paintOnly=new Set<keyof DiagramPDFOptions>([
  'pageTextColor','pageBackground','titleAlignment','coverForeground','coverImageOffset','coverCPOffset',
  'coverGapMm','coverOverlapPercent','coverArrangement','scaleIndicators','scaleChangePercent','scaleMarkerOverrides',
  'coverCPDoc','coverCPLabel',
]);
const marginSettings=new Set<keyof DiagramPDFOptions>([
  'pageFurniture','runningTitle','runningAuthor','runningDesigner','runningText','pageNumbers',
]);
const coverTextSettings=new Set<keyof DiagramPDFOptions>([
  'title','author','designer','designDate','diagramDate','paperInfo','headerNote',
]);

function sameLayout(previous:DiagramPDFOptions,next:DiagramPDFOptions,plan:DiagramPDFPlan,projectName:string){
  const keys=new Set([...Object.keys(previous),...Object.keys(next)] as (keyof DiagramPDFOptions)[]);
  let checkMargins=false,checkIntro=false;
  for(const key of keys){
    if(previous[key]===next[key]||paintOnly.has(key)||key==='ribbonSeamHeights')continue;
    if(key==='ribbon'&&previous.ribbon?.enabled===next.ribbon?.enabled&&previous.ribbon?.paths===next.ribbon?.paths)continue;
    if(marginSettings.has(key)){checkMargins=true;continue;}
    if(coverTextSettings.has(key)){checkMargins=true;checkIntro=true;continue;}
    return false;
  }
  // Text is composed from the current options. Repaginate only when its reserved
  // space changes; checking physical pages includes odd/even styles and folios.
  if(checkMargins)for(let index=0;index<plan.pages.length;index++){
    const before=diagramPDFPageBands(previous,projectName,plan,index),after=diagramPDFPageBands(next,projectName,plan,index);
    if(before.header!==after.header||before.footer!==after.footer)return false;
  }
  if(checkIntro&&next.cover==='diagram'&&
    diagramPDFIntroLayout(plan,previous,projectName).stepsY!==diagramPDFIntroLayout(plan,next,projectName).stepsY)return false;
  return true;
}

function moveBranchSeams(plan:DiagramPDFPlan,previous:DiagramPDFOptions,next:DiagramPDFOptions,movedPage?:number):DiagramPDFPlan {
  const width=diagramPDFRibbonStrokeWidth(next.ribbon),widthChanged=diagramPDFRibbonStrokeWidth(previous.ribbon)!==width;
  if(next.readingOrder!=='snake'||movedPage===undefined&&!widthChanged&&previous.ribbonSeamHeights===next.ribbonSeamHeights)return plan;
  const paper={x:0,y:0,width:plan.width,height:plan.height};
  const changes=new Map<DiagramPDFPage,Map<DiagramPDFBranchEdge,DiagramPDFBranchEdge>>();
  function record(page:DiagramPDFPage,edge:DiagramPDFBranchEdge,points:DiagramPDFBranchEdge['points'],slopes?:number[]){
    if(points.length===edge.points.length&&points.every(([x,y],i)=>x===edge.points[i][0]&&y===edge.points[i][1]))return;
    let byEdge=changes.get(page);
    if(!byEdge){byEdge=new Map();changes.set(page,byEdge);}
    byEdge.set(edge,{...edge,points,slopes});
  }
  for(const source of plan.pages)for(const edge of source.branchEdges??[]){
    if(edge.kind!=='outgoing'||edge.otherPage===undefined)continue;
    const key=diagramPDFSeamKey(edge.from,edge.to),height=next.ribbonSeamHeights?.[key];
    if(source!==plan.pages[movedPage??-1]&&edge.otherPage!==movedPage&&!widthChanged&&height===previous.ribbonSeamHeights?.[key])continue;
    const target=plan.pages[edge.otherPage],from=source.cells.find(c=>c.branchNodeId===edge.from),to=target.cells.find(c=>c.branchNodeId===edge.to);
    const incoming=target.branchEdges?.find(e=>e.kind==='incoming'&&e.from===edge.from&&e.to===edge.to);
    if(!from||!to||!incoming)throw new Error('无法匹配跨页彩带的步骤。');
    const paths=diagramPDFBranchContinuationPaths({cell:from,cells:source.cells,paper,gap:plan.gap,obstacles:diagramPDFRibbonObstacleRects(source.cells,from)},
      {cell:to,cells:target.cells,paper,gap:plan.gap,obstacles:diagramPDFRibbonObstacleRects(target.cells,to)},height,width);
    record(source,edge,paths.outgoing,paths.slopes?.outgoing);
    record(target,incoming,paths.incoming,paths.slopes?.incoming);
  }
  if(!changes.size)return plan;
  return {...plan,pages:plan.pages.map(page=>{
    const byEdge=changes.get(page);
    if(!byEdge)return page;
    return {...page,branchEdges:page.branchEdges!.map(edge=>{
      return byEdge.get(edge)??edge;
    })};
  })};
}

/** A pointer drag updates both ends of each affected seam without repaginating. */
export function diagramPDFDragPreviewPlan(plan:DiagramPDFPlan,options:DiagramPDFOptions,pageIndex:number,page:DiagramPDFPage){
  const pages=plan.pages.slice();
  pages[pageIndex]=page;
  return moveBranchSeams({...plan,pages},options,options,pageIndex);
}

/** One dialog retains its last valid layout. Export still builds a complete plan. */
export function createDiagramPDFPreviewPlanner(){
  let last:{project:DiagramProject;options:DiagramPDFOptions;plan:DiagramPDFPlan}|undefined;
  return (project:DiagramProject,options:DiagramPDFOptions):DiagramPDFPlan=>{
    let plan:DiagramPDFPlan;
    // Validate before inspecting nested settings, even when the geometry is reused.
    if(last?.project===project)validateDiagramPDFOptions(options);
    if(last?.project===project&&sameLayout(last.options,options,last.plan,project.name)){
      plan=moveBranchSeams(last.plan,last.options,options);
      if(plan!==last.plan)baseGeometry.set(plan,diagramPDFPreviewGeometry(last.plan));
    }else plan=planDiagramPDF(project,options);
    last={project,options,plan};
    return plan;
  };
}

// A seam edit replaces edge paths while preserving step boxes on every page.
const baseGeometry=new WeakMap<DiagramPDFPlan,DiagramPDFPlan>();
export function diagramPDFPreviewGeometry(plan:DiagramPDFPlan):DiagramPDFPlan{
  return baseGeometry.get(plan)??plan;
}
