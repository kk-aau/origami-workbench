import {buildDiagramFold,distance,epsilonFor,interpolate,parameter,pointOnSegment} from '../core/geometry';
import {overlappingSegmentPairs} from '../core/segmentPairs';
import {hasMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';
import {validateDoc,type Doc,type Point,type Segment} from '../core/types';
import {mergeAllVertices} from './mergeAllVertices';
import {splitEditableSegmentsWithMap} from './planarize';
import {validateDiagramProject,type DiagramProject} from './diagramProject';
import {resolveStartingFace} from './flatFoldSettings';
import {setDiagramStartingFace} from './diagramFoldSettings';

export interface DiagramCPNormalization {
  doc:Doc;
  changed:boolean;
  /** End occurrences moved by less than the existing CP geometry tolerance. */
  snappedEndpoints:number;
  /** Extra pieces created at real crossings, T joins and overlap endpoints. */
  splitSegments:number;
  /** Removed zero-length and same-property duplicate pieces. */
  removedSegments:number;
  /** Same-property, collinear degree-two vertices removed by the editor tool. */
  mergedVertices:number;
  /** Geometric overlaps retained because their assignments or angles differ. */
  conflicts:number;
  materialPreserved:boolean;
  warnings:string[];
}

const pointKey=(point:Point)=>point.join(',');
function geometryKey(segment:Segment):string {
  const a=pointKey(segment.a),b=pointKey(segment.b);
  return a<b?`${a}|${b}`:`${b}|${a}`;
}
const semantics=(segment:Segment)=>`${segment.assignment}|${segment.angle===null?'null':segment.angle}`;
// Display properties are retained too: differently coloured source edges do
// not become one implicit style choice during an automatic update.
const properties=(segment:Segment)=>`${semantics(segment)}|${segment.displayColor??''}`;

/** Ignore only tolerance-sized duplicates and subdivisions along a finite edge. */
function contourCorners(points:Point[],eps:number):Point[] {
  const ring=[...points];let index=0,checked=0;
  while(checked<ring.length&&ring.length>3) {
    const a=ring[(index+ring.length-1)%ring.length],p=ring[index],b=ring[(index+1)%ring.length];
    if(distance(a,p)<=eps||distance(p,b)<=eps||distance(a,b)>eps&&pointOnSegment(p,{id:'contour',a,b,assignment:'F',angle:0},eps)) {
      ring.splice(index,1);index=(index+ring.length-1)%ring.length;checked=0;
    }else {index=(index+1)%ring.length;checked++;}
  }
  return ring;
}
function sameContour(a:Point[],b:Point[],eps:number):boolean {
  if(a.length<3||a.length!==b.length)return false;
  return b.some((point,start)=>distance(a[0],point)<=eps&&[1,-1].some(direction=>
    a.every((point,index)=>distance(point,b[(start+direction*index+b.length)%b.length])<=eps)));
}
function preserveStartingFace(source:Doc,cleaned:Doc,eps:number):Doc {
  if(!source.flatFold)return cleaned;
  try {
    const before=buildDiagramFold(source).graph,selected=resolveStartingFace(source,before);
    if(selected.stale||!before.faces_vertices?.[selected.face])return cleaned;
    const after=buildDiagramFold(cleaned).graph;
    if(!resolveStartingFace(cleaned,after).stale)return cleaned;
    const wanted=contourCorners(before.faces_vertices[selected.face].map(vertex=>before.vertices_coords[vertex]),eps);
    const matches=(after.faces_vertices??[]).flatMap((face,index)=>
      sameContour(wanted,contourCorners(face.map(vertex=>after.vertices_coords[vertex]),eps),eps)?[index]:[]);
    return matches.length===1?setDiagramStartingFace(cleaned,matches[0]):cleaned;
  }catch{return cleaned;} // A stale or unverifiable selection never becomes a guessed face.
}

/**
 * Normalize a newly supplied diagram CP, never a stored project or pose.
 * Reuses the editor's intersection splitting and same-property vertex merge;
 * unlike the manual overlap repair, it never chooses a mountain/valley winner.
 * Independent material banks are indexed identities, not duplicate geometry.
 */
export function normalizeDiagramCP(doc:Doc):DiagramCPNormalization {
  validateDoc(doc);
  const next=structuredClone(doc),empty={snappedEndpoints:0,splitSegments:0,removedSegments:0,mergedVertices:0,conflicts:0};
  if(hasMaterialTopology(next)) {
    const material=inspectMaterialTopology(next);
    if(!material.ok)throw new Error(material.reason);
    return {doc,changed:false,...empty,materialPreserved:true,
      warnings:['CP 包含独立材料切口，已保留原有点与边的身份；同位置切口两侧不作为重复线删除。']};
  }

  const eps=epsilonFor(next),vertices:Point[]=[],buckets=new Map<string,number[]>(),canonical=new Map<string,Point>();
  // The generic planarizer preserves an existing endpoint at a T join. Put a
  // nearly-on-edge endpoint exactly on that finite edge first, so a paper
  // boundary is never bent towards a nearby crease endpoint by that rule.
  const projected=new Map<string,{point:Point;boundary:boolean;distance:number;sourceId:string}>();
  const lengths=next.segments.map(segment=>distance(segment.a,segment.b));
  const boundaryCoordinates=new Set(next.segments.filter(segment=>segment.assignment==='B').flatMap(segment=>[pointKey(segment.a),pointKey(segment.b)]));
  const projectEnd=(owner:Segment,point:Point,target:Segment,length:number)=>{
    if(owner.assignment==='B'||boundaryCoordinates.has(pointKey(point))||length<=eps)return;
    const t=parameter(point,target);if(t<0||t>1)return;
    const candidate=interpolate(target.a,target.b,t),delta=distance(point,candidate);
    const roundoff=Math.max(1,Math.abs(point[0]),Math.abs(point[1]))*Number.EPSILON*32;
    if(delta<=roundoff||delta>eps)return;
    const key=pointKey(point),previous=projected.get(key),boundary=target.assignment==='B';
    if(previous&&(Number(previous.boundary)>Number(boundary)||previous.boundary===boundary&&
        (previous.distance<delta||previous.distance===delta&&previous.sourceId.localeCompare(target.id)<=0)))return;
    projected.set(key,{point:candidate,boundary,distance:delta,sourceId:target.id});
  };
  for(const [i,j] of overlappingSegmentPairs(next.segments,eps)) {
    for(const point of [next.segments[i].a,next.segments[i].b])projectEnd(next.segments[i],point,next.segments[j],lengths[j]);
    for(const point of [next.segments[j].a,next.segments[j].b])projectEnd(next.segments[j],point,next.segments[i],lengths[i]);
  }
  const originals=next.segments.map(segment=>({a:[...segment.a] as Point,b:[...segment.b] as Point}));
  next.segments=next.segments.map(segment=>({...segment,a:projected.get(pointKey(segment.a))?.point??segment.a,b:projected.get(pointKey(segment.b))?.point??segment.b}));
  const endpoints=next.segments.flatMap(segment=>[segment.a,segment.b].map(point=>({point,boundary:segment.assignment==='B'})));
  // Keep exact boundary coordinates when a fold endpoint almost coincides
  // with the paper outline. Otherwise choose a stable existing endpoint.
  endpoints.sort((a,b)=>Number(b.boundary)-Number(a.boundary)||a.point[0]-b.point[0]||a.point[1]-b.point[1]);
  for(const {point} of endpoints) {
    const key=pointKey(point);if(canonical.has(key))continue;
    const x=Math.floor(point[0]/eps),y=Math.floor(point[1]/eps);let found:Point|undefined;
    for(let dx=-1;dx<=1&&!found;dx++)for(let dy=-1;dy<=1&&!found;dy++) {
      for(const index of buckets.get(`${x+dx},${y+dy}`)??[])if(distance(vertices[index],point)<=eps){found=vertices[index];break;}
    }
    if(!found) {
      found=[...point];const index=vertices.push(found)-1,bucket=`${x},${y}`;
      const entries=buckets.get(bucket);if(entries)entries.push(index);else buckets.set(bucket,[index]);
    }
    canonical.set(key,found);
  }
  let snappedEndpoints=0,removedSegments=0;
  next.segments=next.segments.map<Segment>((segment,index)=>{
    const a=canonical.get(pointKey(segment.a))!,b=canonical.get(pointKey(segment.b))!;
    if(a[0]!==originals[index].a[0]||a[1]!==originals[index].a[1])snappedEndpoints++;
    if(b[0]!==originals[index].b[0]||b[1]!==originals[index].b[1])snappedEndpoints++;
    return {...segment,a:[...a],b:[...b]};
  }).filter(segment=>{
    if(distance(segment.a,segment.b)>eps)return true;
    removedSegments++;return false;
  });
  const planar=splitEditableSegmentsWithMap(next).doc;
  const splitSegments=Math.max(0,planar.segments.length-next.segments.length);
  const groups=new Map<string,Map<string,Segment>>();
  const kept:Segment[]=[];
  for(const segment of planar.segments) {
    const geometry=geometryKey(segment),property=properties(segment);
    let group=groups.get(geometry);if(!group){group=new Map();groups.set(geometry,group);}
    if(group.has(property)){removedSegments++;continue;}
    group.set(property,segment);kept.push(segment);
  }
  const conflicts=[...groups.values()].filter(group=>new Set([...group.values()].map(semantics)).size>1).length;
  const cleaned={...planar,segments:kept};validateDoc(cleaned);
  const merged=mergeAllVertices(cleaned);
  const preserved=preserveStartingFace(doc,merged.doc,eps);validateDoc(preserved);
  const changed=JSON.stringify(preserved)!==JSON.stringify(doc);
  return {doc:changed?preserved:doc,changed,snappedEndpoints,splitSegments,
    removedSegments,mergedVertices:merged.merged,conflicts,materialPreserved:false,
    warnings:conflicts?[`已保留 ${conflicts} 处线型或折角冲突，请在 CP 中明确处理；自动清理不会改变山谷赋型。`]:[]};
}

export interface DiagramProjectCPNormalization {
  project:DiagramProject;
  changed:boolean;
  changedStateIds:string[];
  stats:{snappedEndpoints:number;splitSegments:number;removedSegments:number;mergedVertices:number;conflicts:number;materialStates:number};
  warnings:string[];
}

/** Explicitly clean restored CP states while retaining every saved pose source.
 * Changed states advance one revision, so saved models remain honest snapshots.
 * All states are prepared before one project clone; invalid input is atomic.
 */
export function normalizeDiagramProjectCP(project:DiagramProject):DiagramProjectCPNormalization {
  validateDiagramProject(project);
  const prepared=project.states.map(state=>({state,result:normalizeDiagramCP(state.doc)}));
  const changedStateIds=prepared.filter(({result})=>result.changed).map(({state})=>state.id);
  const stats={snappedEndpoints:0,splitSegments:0,removedSegments:0,mergedVertices:0,conflicts:0,materialStates:0};
  const warnings:string[]=[];
  for(const {state,result} of prepared) {
    if(result.changed&&state.revision===Number.MAX_SAFE_INTEGER)throw new Error('CP 修订号已超过可保存范围。');
    stats.snappedEndpoints+=result.snappedEndpoints;stats.splitSegments+=result.splitSegments;
    stats.removedSegments+=result.removedSegments;stats.mergedVertices+=result.mergedVertices;stats.conflicts+=result.conflicts;
    if(result.materialPreserved)stats.materialStates++;
    warnings.push(...result.warnings.map(warning=>`${state.id}：${warning}`));
  }
  if(!changedStateIds.length)return {project,changed:false,changedStateIds,stats,warnings};
  const next={...project,states:prepared.map(({state,result})=>result.changed?{...state,doc:result.doc,revision:state.revision+1}:state)};
  validateDiagramProject(next);
  return {project:next,changed:true,changedStateIds,stats,warnings};
}
