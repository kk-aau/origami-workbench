import type {Doc,FoldGraph,Point,Segment} from './types';
import {distance,epsilonFor,pointOnSegment,segmentIntersection} from './geometry';
import {BoundsIndex,type Bounds2} from './boundsIndex';
import {hasMaterialTopology,type MaterialTopologyData} from './materialTopology';

export interface JunctionWarning {kind:'t'|'angle'|'loose';point:Point;degrees?:number;rayCount?:number}
const countsAsFold=(s:Segment)=>s.assignment==='M'||s.assignment==='V'||s.assignment==='U';
const samePoint=(a:Point,b:Point)=>a[0]===b[0]&&a[1]===b[1];
const sameSegment=(a:Segment,b:Segment)=>a===b||a.assignment===b.assignment&&a.angle===b.angle&&
  (samePoint(a.a,b.a)&&samePoint(a.b,b.b)||samePoint(a.a,b.b)&&samePoint(a.b,b.a));
const bounds=({a,b}:Segment):Bounds2=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];

function classify(point:Point,incident:Segment[],eps:number):JunctionWarning|undefined{
  if(!incident.length||incident.some(s=>s.assignment==='B'))return;
  if(incident.length===1){
    const s=incident[0];
    if(distance(s.a,point)<=eps||distance(s.b,point)<=eps)return {kind:'loose',point};
    return;
  }
  const rays:number[]=[];
  for(const s of incident)if(countsAsFold(s))for(const end of [s.a,s.b]){
    if(distance(point,end)>eps)rays.push(Math.atan2(end[1]-point[1],end[0]-point[0]));
  }
  rays.sort((a,b)=>a-b);
  const angles=rays.filter((a,i)=>!i||a-rays[i-1]>1e-8);
  if(angles.length>1&&angles[0]+2*Math.PI-angles[angles.length-1]<=1e-8)angles.pop();
  if(angles.length===3&&angles.some((a,i)=>angles.slice(i+1).some(b=>Math.abs(b-a-Math.PI)<=1e-4)))return {kind:'t',point};
  if(angles.length<2)return;
  if(angles.length%2)return {kind:'angle',point,rayCount:angles.length};
  let alternating=0;
  for(let i=0;i<angles.length;i+=2)alternating+=angles[i+1]-angles[i];
  if(Math.abs(alternating-Math.PI)>1e-4)return {kind:'angle',point,degrees:alternating*180/Math.PI};
}

/** Read-only views backed by an already split graph use its actual vertex identities. */
export function graphJunctions(graph:FoldGraph,spatial=false):JunctionWarning[]{
  const fans=graph.vertices_coords.map(()=>[] as Segment[]);
  let span=1;
  for(const [i,[a,b]] of graph.edges_vertices.entries()){
    const assignment=graph.edges_assignment[i] as Segment['assignment'];
    if(assignment==='A')continue;
    const edge={id:String(i),a:graph.vertices_coords[a],b:graph.vertices_coords[b],assignment,angle:graph.edges_foldAngle[i]};
    span=Math.max(span,distance(edge.a,edge.b));
    fans[a].push(edge);fans[b].push(edge);
  }
  const eps=Math.max(1e-6,span*1e-8);
  const partial=graph.edges_foldAngle.some((angle,i)=>angle!==null&&Math.abs(angle)>0&&Math.abs(angle)<180&&['M','V','U'].includes(graph.edges_assignment[i]));
  return fans.flatMap((edges,i)=>{
    const issue=classify(graph.vertices_coords[i],edges,eps);
    return issue&&(!(spatial||partial)||issue.kind!=='angle')?[issue]:[];
  });
}

// Reuse the spatial index for unchanged segments across edits. Recent additions
// are queried alongside it until enough edits justify rebuilding the tree.
class NearbySegments {
  private tree:BoundsIndex;
  private base:Segment[];
  private added=new Map<string,Segment>();
  private removed=new Set<string>();
  constructor(lines:Segment[]){this.base=lines;this.tree=new BoundsIndex(lines.map(bounds));}
  update(old:Segment[],fresh:Segment[],all:Segment[]){
    for(const s of old){this.removed.add(s.id);this.added.delete(s.id);}
    for(const s of fresh)this.added.set(s.id,s);
    if(this.removed.size+this.added.size>Math.max(32,this.base.length/8)){
      this.base=all;this.tree=new BoundsIndex(all.map(bounds));this.added.clear();this.removed.clear();
    }
  }
  query(box:Bounds2,eps:number){
    const local=this.tree.query(box,eps).map(i=>this.base[i]).filter(s=>!this.removed.has(s.id));
    for(const s of this.added.values()){
      const b=bounds(s);
      if(b[0]<=box[2]+eps&&b[2]>=box[0]-eps&&b[1]<=box[3]+eps&&b[3]>=box[1]-eps)local.push(s);
    }
    return local;
  }
}

/** Only edited spans and their old/new neighbours produce candidate vertices. */
export class EditedJunctionCheck {
  private doc?:Doc;
  private index?:NearbySegments;
  check(before:Doc,after:Doc,priorWarnings:readonly JunctionWarning[]=[]):JunctionWarning[]|undefined{
    const topologyChanged=before.metadata?.materialTopology!==after.metadata?.materialTopology;
    if(before.segments===after.segments&&!topologyChanged)return;
    const previous=new Map(before.segments.map(s=>[s.id,s])),next=new Map(after.segments.map(s=>[s.id,s]));
    const changed=(s:Segment,other:Map<string,Segment>)=>s.assignment!=='A'&&(!other.has(s.id)||!sameSegment(s,other.get(s.id)!));
    const old=before.segments.filter(s=>changed(s,next)),fresh=after.segments.filter(s=>changed(s,previous));
    if(!old.length&&!fresh.length){
      // A seam may change which coincident vertices are connected without
      // changing any CP coordinates. Rebuild fans only for this topology edit.
      if(topologyChanged&&after.segments.length)
        return this.check({...after,segments:[]},after);
      return;
    }
    if(before.segments.length&&hasMaterialTopology(before)!==hasMaterialTopology(after))
      return this.check({...after,segments:[]},after);
    const eps=epsilonFor(after);
    const changes=[...old,...fresh];
    const changeIndex=priorWarnings.length?new BoundsIndex(changes.map(bounds)):null;
    const retained=priorWarnings.filter(({point:p})=>!changeIndex!.query([p[0],p[1],p[0],p[1]],eps).some(i=>pointOnSegment(p,changes[i],eps)));
    if(hasMaterialTopology(after)){
      // Distinct slit banks or sheets can occupy identical CP coordinates.
      // Inspect only the indexed vertex fans touched by this edit.
      const material=after.metadata?.materialTopology as MaterialTopologyData;
      if(!Array.isArray(material?.edgeSegmentIds)||!Array.isArray(material.graph?.edges_vertices)||
        !Array.isArray(material.graph.vertices_coords)||material.edgeSegmentIds.length!==material.graph.edges_vertices.length)return [];
      const g=material.graph,edges=new Set(fresh.map(s=>s.id)),affected=new Set<number>();
      const oldMaterial=before.metadata?.materialTopology as MaterialTopologyData|undefined;
      const tips=new Map<string,Point[]>();
      if(oldMaterial?.graph&&Array.isArray(oldMaterial.edgeSegmentIds)&&oldMaterial.edgeSegmentIds.length===oldMaterial.graph.edges_vertices?.length&&old.length){
        const removedIds=new Set(old.map(s=>s.id)),vertices=new Set<number>();
        oldMaterial.edgeSegmentIds.forEach((id,e)=>{if(removedIds.has(id))for(const v of oldMaterial.graph.edges_vertices[e])vertices.add(v);});
        oldMaterial.edgeSegmentIds.forEach((id,e)=>{const ps=oldMaterial.graph.edges_vertices[e].filter(v=>vertices.has(v)).map(v=>oldMaterial.graph.vertices_coords[v]);if(ps.length)tips.set(id,ps);});
      }
      material.edgeSegmentIds.forEach((id,e)=>{for(const v of g.edges_vertices[e])if(edges.has(id)||tips.get(id)?.some(p=>distance(p,g.vertices_coords[v])<=eps))affected.add(v);});
      if(changeIndex){
        g.vertices_coords.forEach((p,v)=>{
          if(changeIndex.query([p[0],p[1],p[0],p[1]],eps).some(i=>pointOnSegment(p,changes[i],eps)))affected.add(v);
        });
      }
      const fans=new Map<number,Segment[]>();
      material.edgeSegmentIds.forEach((id,e)=>{const s=next.get(id);if(s&&s.assignment!=='A')for(const v of g.edges_vertices[e])if(affected.has(v)){const rows=fans.get(v)??[];rows.push(s);fans.set(v,rows);}});
      return retained.concat([...fans].flatMap(([v,lines])=>classify(g.vertices_coords[v],lines,eps)??[]));
    }
    const all=after.segments.filter(s=>s.assignment!=='A');
    if(this.doc?.segments===before.segments&&this.index)this.index.update(old,fresh,all);
    else this.index=new NearbySegments(all);
    this.doc=after;
    const index=this.index,points=new Map<string,Point[]>(),issues:JunctionWarning[]=[];
    function visit(p:Point){
      const x=Math.floor(p[0]/eps),y=Math.floor(p[1]/eps);
      for(let i=x-1;i<=x+1;i++)for(let j=y-1;j<=y+1;j++)if(points.get(i+','+j)?.some(q=>distance(p,q)<=eps))return;
      const key=x+','+y,bucket=points.get(key)??[];bucket.push(p);points.set(key,bucket);
      const lines=index.query([p[0],p[1],p[0],p[1]],eps).filter(s=>distance(s.a,s.b)>eps&&pointOnSegment(p,s,eps));
      const issue=classify(p,lines,eps);if(issue)issues.push(issue);
    }
    for(const s of [...old,...fresh]){
      visit(s.a);visit(s.b);
      for(const t of index.query(bounds(s),eps)){
        if(t.id===s.id)continue;
        const hit=s.id<t.id?segmentIntersection(s,t,eps):segmentIntersection(t,s,eps);if(hit)visit(hit.point);
        else for(const p of [t.a,t.b])if(pointOnSegment(p,s,eps))visit(p);
      }
    }
    return retained.concat(issues);
  }
}

interface CheckedCP {all:JunctionWarning[];spatial:JunctionWarning[];partial:boolean}
const cache=new WeakMap<Doc,CheckedCP>();
export function checkedJunctions(doc:Doc,spatial=false,before?:Doc,checker?:EditedJunctionCheck):JunctionWarning[]{
  let result=cache.get(doc);
  if(!result){
    checker??=new EditedJunctionCheck();
    const prior=before&&cache.get(before);
    const all=prior&&before?(checker.check(before,doc,prior.all)??prior.all):
      checker.check({...doc,segments:[]},doc)??[];
    const partial=doc.segments.some(s=>countsAsFold(s)&&s.angle!==null&&Math.abs(s.angle)>0&&Math.abs(s.angle)<180);
    result={all,partial,spatial:all.filter(w=>w.kind!=='angle')};cache.set(doc,result);
  }
  return spatial||result.partial?result.spatial:result.all;
}
