import ear from 'rabbit-ear';
import {buildDiagramFold,collinearOverlap,cross,distance,epsilonFor,interpolate,parameter,pointOnSegment,polygonArea,segmentIntersection,sub} from '../core/geometry';
import {hasMaterialTopology} from '../core/materialTopology';
import {materialPointInside} from '../core/materialTraceGeometry';
import {overlappingSegmentPairs} from '../core/segmentPairs';
import type {Doc,FoldGraph,Point,Segment} from '../core/types';
import {diffDiagramFoldCP} from './diagramFoldLink';
import type {DiagramCPState,DiagramPose,DiagramProject,DiagramStep} from './diagramProject';
import {createDiagramSpatialPose,validateDiagramSpatialPose} from './diagramSpatialPose';
import {hasUnchangedSinkCrossing,sameSinkPattern,sameSinkRing,sinkBoundaryPatterns,type AutomaticSinkPattern} from './diagramSinkBoundary';
export type {AutomaticSinkPattern} from './diagramSinkBoundary';

interface SinkPattern {center?:Point;ring:Point[]}
export interface DiagramSinkGuide extends SinkPattern {
  /** Indices of the three CP states on the currently projected branch. */
  startIndex:number;guideIndex:number;endIndex:number;pose:DiagramPose;
}
// UI renders and the two legs share the same saved pose. A CP edit replaces
// its document; changing any of the three documents invalidates this result.
const checkedGuides=new WeakMap<DiagramPose,{start:Doc;guide:Doc;end:Doc;pattern?:SinkPattern}>();
const mountainValley=(assignment:string)=>assignment==='M'||assignment==='V';
const flatFold=(s:Segment)=>mountainValley(s.assignment)&&Math.abs(s.angle??0)===180;
const segment=(a:Point,b:Point):Segment=>({id:'interval',a,b,angle:0,assignment:'F'});

/** The ring or spoke may span several collinear CP segments. */
function covered(line:Segment,creases:Segment[],eps:number):boolean {
  const tolerance=eps/distance(line.a,line.b);
  const spans=creases.filter(s=>collinearOverlap(line,s,eps)).map(s=>{
    const a=parameter(s.a,line),b=parameter(s.b,line);
    return [Math.min(a,b),Math.max(a,b)];
  }).sort((a,b)=>a[0]-b[0]);
  let end=0;
  for(const [lo,hi] of spans){
    if(lo>end+tolerance)return false;
    end=Math.max(hi,end);
    if(end>=1-tolerance)return true;
  }
  return false;
}

/** Match the partially folded material rim in a saved guide to the sink
 * whose entering creases reverse across that rim in the end CP. */
export function diagramSinkPattern(start:Doc,guide:Doc,end:Doc):SinkPattern|undefined {
  if([start,guide,end].some(hasMaterialTopology))return;
  if([start,end].some(doc=>doc.paper.width!==guide.paper.width||doc.paper.height!==guide.paper.height))return;
  const eps=Math.max(epsilonFor(start),epsilonFor(guide),epsilonFor(end));
  const partial=(angle:number|null)=>angle!==null&&Math.abs(angle)>0&&Math.abs(angle)<180;
  if(!guide.segments.some(s=>mountainValley(s.assignment)&&partial(s.angle)))return;
  const boundary=findAutomaticSinkPattern(start,end);
  if(boundary?.crossingLines){
    const hinges=guide.segments.filter(s=>mountainValley(s.assignment)&&partial(s.angle));
    if(boundary.ring.every((p,i)=>covered(segment(p,boundary.ring[(i+1)%boundary.ring.length]),
      hinges.filter(s=>s.assignment===(boundary.rimAssignments?.[i]??boundary.assignment)),eps)))return boundary;
    return;
  }
  const finalFolds=end.segments.filter(flatFold),initialFolds=start.segments.filter(flatFold);
  const graph=buildDiagramFold(guide).graph;
  const rimEdges=graph.edges_vertices.filter(([a,b],edge)=>{
    const assignment=graph.edges_assignment[edge];
    return mountainValley(assignment)&&partial(graph.edges_foldAngle[edge])&&
      covered(segment(graph.vertices_coords[a],graph.vertices_coords[b]),finalFolds.filter(s=>s.assignment===assignment),eps);
  });
  const tip=findInvertedTip(graph,rimEdges,buildDiagramFold(end).graph,initialFolds,finalFolds,eps);
  return tip&&!hasUnchangedSinkCrossing(end,tip.ring,eps)?tip:undefined;
}

function findInvertedTip(graph:FoldGraph,rimEdges:[number,number][],finalGraph:FoldGraph,initialFolds:Segment[],finalFolds:Segment[],eps:number):SinkPattern|undefined {
  if(rimEdges.length<3)return;
  const {faces_vertices:cycles}=ear.graph.makePlanarFaces({vertices_coords:graph.vertices_coords,edges_vertices:rimEdges});
  if(!cycles.length)return;
  const incident=finalGraph.vertices_coords.map(()=>[] as number[]);
  finalGraph.edges_vertices.forEach(([a,b],edge)=>{
    if(mountainValley(finalGraph.edges_assignment[edge])&&Math.abs(finalGraph.edges_foldAngle[edge]??0)===180){
      incident[a].push(edge);incident[b].push(edge);
    }
  });
  for(const cycle of cycles){
    if(cycle.length<3||new Set(cycle).size!==cycle.length)continue;
    const ring=cycle.map(v=>graph.vertices_coords[v]);
    const boundary=ring.map((p,i)=>segment(p,ring[(i+1)%ring.length]));
    for(const [v,edges] of incident.entries()){
      const center=finalGraph.vertices_coords[v];
      if(edges.length<3||!materialPointInside(center,ring))continue;
      const reach=2*Math.max(...ring.map(p=>distance(center,p)));
      const inverted=edges.every(edge=>{
        const [a,b]=finalGraph.edges_vertices[edge],p=finalGraph.vertices_coords[a===v?b:a];
        const scale=reach/distance(center,p);
        const ray=segment(center,[center[0]+(p[0]-center[0])*scale,center[1]+(p[1]-center[1])*scale]);
        let closest=Infinity;
        for(const side of boundary){const hit=segmentIntersection(ray,side,eps);if(hit&&hit.t>0)closest=Math.min(closest,hit.t);}
        if(!Number.isFinite(closest))return false;
        const spoke=segment(center,[center[0]+(ray.b[0]-center[0])*closest,center[1]+(ray.b[1]-center[1])*closest]);
        const assignment=finalGraph.edges_assignment[edge];
        return covered(spoke,finalFolds.filter(s=>s.assignment===assignment),eps)&&
          covered(spoke,initialFolds.filter(s=>s.assignment!==assignment),eps);
      });
      if(inverted)return {center,ring};
    }
  }
}

const automaticPatterns=new WeakMap<Doc,WeakMap<Doc,AutomaticSinkPattern|null>>();
/** Static CP feature, including a drawing opened without any step history. */
export function findSinkBoundaryPattern(doc:Doc):AutomaticSinkPattern|undefined {
  return sinkBoundaryPatterns(doc)[0];
}
const foldKey=(s:Segment)=>[s.assignment,...[s.a.join(','),s.b.join(',')].sort()].join('/');
function containsReversal(initial:Segment[],final:Segment[],eps:number):boolean {
  const original=new Set(initial.map(foldKey)),changed=final.filter(s=>!original.has(foldKey(s)));
  if(changed.length<3)return false;
  const folded=[...initial,...changed];
  for(const [a,b] of overlappingSegmentPairs(folded,eps)){
    if(a<initial.length&&b>=initial.length&&folded[a].assignment!==folded[b].assignment&&collinearOverlap(folded[a],folded[b],eps))return true;
  }
  return false;
}
function sameBoundary(before:Doc,after:Doc,eps:number):boolean {
  const borders=(doc:Doc)=>doc.segments.filter(s=>s.assignment==='B');
  const a=borders(before),b=borders(after);
  return a.length>=3&&b.length>=3&&a.every(s=>covered(s,b,eps))&&b.every(s=>covered(s,a,eps));
}
/** Detect the event from two material drawings; a guide snapshot is optional. */
export function findAutomaticSinkPattern(before:Doc,after:Doc):AutomaticSinkPattern|undefined {
  if(before===after||before.paper.width!==after.paper.width||before.paper.height!==after.paper.height||hasMaterialTopology(before)||hasMaterialTopology(after))return;
  let cached=automaticPatterns.get(before);
  if(cached?.has(after))return cached.get(after)??undefined;
  if(!cached){cached=new WeakMap();automaticPatterns.set(before,cached);}
  let result:AutomaticSinkPattern|undefined;
  try{
    const eps=Math.max(epsilonFor(before),epsilonFor(after));
    if(!sameBoundary(before,after,eps)){cached.set(after,null);return;}
    const current=sinkBoundaryPatterns(after);
    if(current.length){
      const previous=sinkBoundaryPatterns(before);
      result=current.find(r=>!previous.some(p=>sameSinkPattern(p,r,eps)));
    }
    // Some older step files store only the crease spans inside the polygon.
    // Their material tip can still be inferred from the two recorded states.
    const initial=before.segments.filter(flatFold),final=after.segments.filter(flatFold);
    if(!result&&initial.length>=2&&final.length>=6&&containsReversal(initial,final,eps)){
      const graph=buildDiagramFold(after).graph;
      for(const assignment of ['M','V'] as const){
        const edges=graph.edges_vertices.filter(([a,b],i)=>graph.edges_assignment[i]===assignment&&Math.abs(graph.edges_foldAngle[i]??0)===180&&
          !covered(segment(graph.vertices_coords[a],graph.vertices_coords[b]),initial,eps));
        const pattern=findInvertedTip(graph,edges,graph,initial,final,eps);
        if(!pattern)continue;
        // Material intersections on a straight rim are real CP nodes, but do
        // not introduce wall corners or require an extra gusset.
        const ring=pattern.ring.filter((p,i,row)=>!pointOnSegment(p,segment(row[(i+row.length-1)%row.length],row[(i+1)%row.length]),eps));
        if(ring.length>=3&&!current.some(p=>sameSinkRing(p.ring,ring,eps))&&!hasUnchangedSinkCrossing(after,ring,eps)){
          result={center:pattern.center,ring,assignment};break;
        }
      }
    }
  }catch{/* Incomplete or inconsistent drawings retain ordinary playback. */}
  cached.set(after,result??null);return result;
}

const unit=(p:Point):Point=>{const length=Math.hypot(...p);return [p[0]/length,p[1]/length];};
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1];

export type SinkSupportDirection='preferred'|'next'|'previous';
/** A right-angle wall on each side of the sink. At a convex corner the two
 * wall normals meet when its exterior bisector folds flat and a gusset
 * folds by the interior angle. These construction hinges live only in playback. */
export function* automaticSinkGuideDocuments(before:Doc,after:Doc,pattern:AutomaticSinkPattern,direction?:SinkSupportDirection):Generator<{direction:SinkSupportDirection;doc:Doc}> {
  if(pattern.assignment==='mixed')throw Error('已识别沉折。沉口各边同时包含山折和谷折，目前需用保存的立体中间姿态引导动画。');
  const ring=polygonArea(pattern.ring)>0?pattern.ring:[...pattern.ring].reverse();
  const eps=Math.max(epsilonFor(before),epsilonFor(after)),sign=pattern.assignment==='M'?-1:1;
  const boundary=before.segments.filter(s=>s.assignment==='B'),active=before.segments.filter(s=>mountainValley(s.assignment));
  const reach=2*Math.hypot(before.paper.width,before.paper.height);
  const outgoing=(p:Point,dir:Point):Point=>{
    const ray=segment(p,[p[0]+dir[0]*reach,p[1]+dir[1]*reach]);
    let hit:ReturnType<typeof segmentIntersection>=null;
    for(const side of boundary){
      const crossing=segmentIntersection(ray,side,eps);
      if(crossing&&crossing.t*reach>eps&&(!hit||crossing.t<hit.t))hit=crossing;
    }
    if(!hit)throw Error('沉口外伸辅助折线未能与纸张边界相交。');
    return hit.point;
  };
  const center=pattern.center;
  const onCrossing=(s:Segment)=>(pattern.crossingLines??[]).some(c=>
    Math.abs(cross(sub(s.a,c.a),sub(c.b,c.a)))<=eps*distance(c.a,c.b)&&
    Math.abs(cross(sub(s.b,c.a),sub(c.b,c.a)))<=eps*distance(c.a,c.b));
  const stationary=after.segments.filter(s=>mountainValley(s.assignment)&&covered(s,active.filter(a=>a.assignment===s.assignment&&a.angle===s.angle),eps)&&
    !(center?Math.abs(cross(sub(s.a,center),sub(s.b,s.a)))<=eps*distance(s.a,s.b):onCrossing(s)));
  const spokes=active.filter(s=>s.assignment!==pattern.assignment&&(center?pointOnSegment(center,s,eps):onCrossing(s))).map(s=>unit(sub(s.b,s.a)));
  const crease=(a:Point,b:Point,angle:number,id:string):Segment=>({id,a,b,angle,assignment:angle>0?'V':'M'});
  const sides=ring.map((p,i)=>unit(sub(ring[(i+1)%ring.length],p)));
  const lengths=ring.map((p,i)=>distance(p,ring[(i+1)%ring.length])),longest=Math.max(...lengths);
  const reference=sides.filter((_,i)=>longest-lengths[i]<=eps).sort((a,b)=>{
    const alignment=(v:Point)=>Math.max(0,...spokes.map(s=>Math.abs(dot(s,v))))+1e-9*Math.abs(v[0]);
    return alignment(b)-alignment(a);
  })[0];
  const marks=[...before.segments,...after.segments];
  const score=(p:Point,normal:Point)=>{
    const stub=segment(p,outgoing(p,normal));
    // Preserve an authored outside crease. Otherwise use a common axis of
    // the rim for both sides, keeping symmetric corners paired on the page.
    const drawn=marks.some(s=>mountainValley(s.assignment)&&pointOnSegment(p,s,eps)&&collinearOverlap(stub,s,eps));
    return (drawn?2:0)+Math.abs(dot(reference,normal));
  };
  const corners=ring.map((p,i)=>{
    const incoming=sides[(i+ring.length-1)%ring.length],out=sides[i];
    const turn=Math.atan2(cross(incoming,out),dot(incoming,out)),angle=180-Math.abs(turn)*180/Math.PI;
    const previous:Point=[incoming[1],-incoming[0]],next:Point=[out[1],-out[0]],bisector=unit([previous[0]+next[0],previous[1]+next[1]]);
    return {p,angle,turn,previous,next,bisector,preferred:score(p,previous)>=score(p,next)?previous:next};
  });
  const attempted=new Set<string>();
  for(const choice of direction?[direction]:['preferred','next','previous'] as const){
    const folds:Segment[]=[];
    corners.forEach((corner,i)=>{
      const {p,turn,angle,bisector}=corner,normal=corner[choice];
      folds.push(crease(p,ring[(i+1)%ring.length],sign*90,'sink-rim-'+i),
        crease(p,outgoing(p,bisector),sign*Math.sign(turn)*180,'sink-pleat-'+i),
        crease(p,outgoing(p,normal),-sign*Math.sign(turn)*angle,'sink-wall-'+i));
    });
    const key=JSON.stringify(folds.map(s=>s.b));if(attempted.has(key))continue;attempted.add(key);
    // An existing rim may already carry the final flat-fold angle. Replace
    // only the span owned by the temporary guide and keep both outside tails.
    const retained=stationary.flatMap(s=>{
      const cuts=[0,1];
      for(const f of folds)if(collinearOverlap(s,f,eps))cuts.push(...[f.a,f.b].map(p=>Math.max(0,Math.min(1,parameter(p,s)))));
      cuts.sort((a,b)=>a-b);
      return cuts.slice(1).flatMap((end,i)=>{
        const start=cuts[i];
        if((end-start)*distance(s.a,s.b)<=eps)return [];
        const part={...s,a:interpolate(s.a,s.b,start),b:interpolate(s.a,s.b,end)};
        return folds.some(f=>collinearOverlap(part,f,eps))?[]:[part];
      });
    });
    const segments=[...boundary,...retained,...folds].map((s,i)=>({...s,id:'sink-guide-'+i}));
    const doc:Doc={name:before.name,paper:{...before.paper},segments};
    yield {direction:choice,doc};
  }
}

export function createAutomaticSinkGuide(before:Doc,after:Doc,pattern:AutomaticSinkPattern,direction?:SinkSupportDirection):{doc:Doc;pose:ReturnType<typeof createDiagramSpatialPose>} {
  let failure='';
  for(const {doc} of automaticSinkGuideDocuments(before,after,pattern,direction)){
    try{return {doc,pose:createDiagramSpatialPose(doc)};}catch(error){failure=error instanceof Error?error.message:String(error);}
  }
  throw Error('按沉口轮廓生成的辅助折线无法形成有效的空间姿态。'+failure);
}

export function isDiagramSinkDisplayStep(step:DiagramStep,before:DiagramCPState,after:DiagramCPState):boolean {
  if(step.beforeId!==before.id||step.afterId!==after.id||step.foldLink?.precreases?.length||
      step.annotations?.some(a=>a.kind==='line'&&a.foldAction==='precrease'))return false;
  return before.doc===after.doc||JSON.stringify(before.doc)===JSON.stringify(after.doc)||
    (before.doc.paper.width===after.doc.paper.width&&before.doc.paper.height===after.doc.paper.height&&
      !hasMaterialTopology(before.doc)&&!hasMaterialTopology(after.doc)&&!diffDiagramFoldCP(before.doc,after.doc).length&&!diffDiagramFoldCP(after.doc,before.doc).length);
}

export function diagramSinkGuide(project:DiagramProject,stepId:string):DiagramSinkGuide|undefined {
  const selected=project.steps.findIndex(s=>s.id===stepId);
  if(selected<0)return;
  // Only adjacent states on this route can form the operation. A following
  // drawing can replay the sink when it merely displays the finished shape.
  for(const guideIndex of [selected,selected+1,selected-1]){
    const startIndex=guideIndex-1,endIndex=guideIndex+1;
    const start=project.states[startIndex],guide=project.states[guideIndex],end=project.states[endIndex];
    const first=project.steps[startIndex],middle=project.steps[guideIndex];
    if(!first||!middle||!start||!guide||!end||first.beforeId!==start.id||first.afterId!==guide.id||
      middle.beforeId!==guide.id||middle.afterId!==end.id)continue;
    const pose=middle.paperStates?.spatial??middle.pose;
    if(!pose?.spatial||pose.result.geometry.status!=='ready'||pose.sourceStateId!==guide.id||pose.sourceRevision!==guide.revision)continue;
    try{
      if(selected===endIndex){
        const tail=project.steps[selected],after=project.states[selected+1];
        if(!after||!isDiagramSinkDisplayStep(tail,end,after))continue;
      }
      let checked=checkedGuides.get(pose);
      if(!checked||checked.start!==start.doc||checked.guide!==guide.doc||checked.end!==end.doc){
        if(pose.sourceDoc!==guide.doc&&JSON.stringify(pose.sourceDoc)!==JSON.stringify(guide.doc))continue;
        const pattern=diagramSinkPattern(start.doc,guide.doc,end.doc);
        if(pattern)validateDiagramSpatialPose(pose,true);
        checked={start:start.doc,guide:guide.doc,end:end.doc,pattern};checkedGuides.set(pose,checked);
      }
      if(checked.pattern)return {startIndex,guideIndex,endIndex,pose,...checked.pattern};
    }catch{
      // This is optional route discovery in the render path. Keep ordinary
      // playback available so its normal diagnostics can explain an invalid CP.
      continue;
    }
  }
}
