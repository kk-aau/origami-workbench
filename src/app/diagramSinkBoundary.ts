import ear from 'rabbit-ear';
import {buildDiagramFold,distance,epsilonFor,interpolate,pointOnSegment} from '../core/geometry';
import {materialPointInside} from '../core/materialTraceGeometry';
import {hasMaterialTopology} from '../core/materialTopology';
import {overlappingSegmentPairs} from '../core/segmentPairs';
import type {Doc,Point,Segment} from '../core/types';

export interface AutomaticSinkPattern {
  ring:Point[];
  assignment:'M'|'V'|'mixed';
  rimAssignments?:('M'|'V')[];
  center?:Point;
  crossingLines?:Segment[];
}

const cache=new WeakMap<Doc,AutomaticSinkPattern[]>();
const line=(a:Point,b:Point):Segment=>({a,b,id:'',assignment:'F',angle:0});

export function sameSinkRing(a:Point[],b:Point[],eps:number){
  if(a.length!==b.length)return false;
  const start=b.findIndex(p=>distance(a[0],p)<=eps);
  return start>=0&&[1,-1].some(dir=>a.every((p,i)=>distance(p,b[(start+dir*i+b.length)%b.length])<=eps));
}

export function sameSinkPattern(a:AutomaticSinkPattern,b:AutomaticSinkPattern,eps:number){
  if(a.assignment!==b.assignment||!sameSinkRing(a.ring,b.ring,eps))return false;
  if(a.assignment!=='mixed')return true;
  return a.ring.every((p,i)=>{
    const j=b.ring.findIndex(q=>distance(p,q)<=eps),next=a.ring[(i+1)%a.ring.length];
    const edge=distance(next,b.ring[(j+1)%b.ring.length])<=eps?j:(j+b.ring.length-1)%b.ring.length;
    return a.rimAssignments![i]===b.rimAssignments![edge];
  });
}

function indexCreases(doc:Doc){
  const graph=buildDiagramFold(doc).graph,eps=epsilonFor(doc);
  const {vertices_coords:coords,edges_vertices:edges,edges_assignment:assignments}=graph;
  const neighbors=coords.map(()=>[] as {edge:number;other:number}[]);
  edges.forEach(([a,b],edge)=>{
    if(assignments[edge]!=='M'&&assignments[edge]!=='V')return;
    neighbors[a].push({edge,other:b});neighbors[b].push({edge,other:a});
  });
  const reversingEdges=new Set<number>();
  const continuations=neighbors.map((incident,v)=>{
    const pairs:{first:number;second:number;reversed:boolean}[]=[];
    for(let i=0;i<incident.length;i++)for(let j=i+1;j<incident.length;j++){
      const a=incident[i],b=incident[j];
      if(!pointOnSegment(coords[v],line(coords[a.other],coords[b.other]),eps))continue;
      const reversed=assignments[a.edge]!==assignments[b.edge];
      if(reversed){reversingEdges.add(a.edge);reversingEdges.add(b.edge);}
      pairs.push({first:a.other,second:b.other,reversed});
    }
    return pairs;
  });
  return {coords,edges,assignments,neighbors,reversingEdges,continuations};
}

const indices=new WeakMap<Doc,ReturnType<typeof indexCreases>>();
function creaseIndex(doc:Doc){
  let index=indices.get(doc);
  if(!index){index=indexCreases(doc);indices.set(doc,index);}
  return index;
}

// Use the split half-edges: their midpoints lie strictly on one side unless
// the half-edge is part of the boundary itself. A tangent has no inside half.
function throughCreases(index:ReturnType<typeof indexCreases>,ring:Point[],vertices:number[],eps:number){
  const {coords,continuations}=index;
  const sides=ring.map((p,i)=>line(p,ring[(i+1)%ring.length]));
  const crossingLines:Segment[]=[];
  let unchanged=false;
  for(const v of vertices)for(const {first,second,reversed} of continuations[v]){
    const a=interpolate(coords[v],coords[first],.5),b=interpolate(coords[v],coords[second],.5);
    if(sides.some(s=>pointOnSegment(a,s,eps)||pointOnSegment(b,s,eps)))continue;
    if(materialPointInside(a,ring)===materialPointInside(b,ring))continue;
    if(!reversed)unchanged=true;
    crossingLines.push(line(coords[first],coords[second]));
  }
  return {crossingLines,unchanged};
}

/** A legacy CP without exterior spans may still describe the sink through
 * its two endpoint states. Explicit exterior evidence always takes priority. */
export function hasUnchangedSinkCrossing(doc:Doc,ring:Point[],eps:number){
  const index=creaseIndex(doc),sides=ring.map((p,i)=>line(p,ring[(i+1)%ring.length]));
  const vertices=index.coords.flatMap((p,i)=>sides.some(s=>pointOnSegment(p,s,eps))?[i]:[]);
  return throughCreases(index,ring,vertices,eps).unchanged;
}

function computePatterns(doc:Doc):AutomaticSinkPattern[]{
  const folds=doc.segments.filter(s=>s.assignment==='M'||s.assignment==='V');
  if(folds.length<5||!folds.some(s=>s.assignment==='M')||!folds.some(s=>s.assignment==='V')||hasMaterialTopology(doc))return [];
  // A polarity change along a straight crease has a shared endpoint in the
  // source drawing. Skip graph construction for ordinary grids and drawings.
  const eps=epsilonFor(doc);
  const ends=folds.flatMap(s=>[{a:s.a,b:s.a,other:s.b,assignment:s.assignment},{a:s.b,b:s.b,other:s.a,assignment:s.assignment}]);
  let joined=false;
  for(const [i,j] of overlappingSegmentPairs(ends,eps)){
    const a=ends[i],b=ends[j];
    if(a.assignment!==b.assignment&&distance(a.a,b.a)<=eps&&pointOnSegment(a.a,line(a.other,b.other),eps)){joined=true;break;}
  }
  if(!joined)return [];
  const index=creaseIndex(doc);
  const {coords,edges,assignments,neighbors,reversingEdges}=index;
  if(!reversingEdges.size)return [];

  const result:AutomaticSinkPattern[]=[];
  const planarFaces=(e:[number,number][]):number[][]=>ear.graph.makePlanarFaces({vertices_coords:coords,edges_vertices:e}).faces_vertices;
  for(const assignment of ['M','V','mixed'] as const){
    const eligible=(a:string)=>assignment==='mixed'?(a==='M'||a==='V'):a===assignment;
    const all=edges.filter((_,i)=>eligible(assignments[i]));
    const rimEdges=edges.filter((_,i)=>eligible(assignments[i])&&!reversingEdges.has(i));
    // A crossing crease can have the rim's colour on its inner half. The
    // exterior of the bounded faces recovers the rim even with a chord or
    // dangling branches. Check crossings against the complete graph below.
    for(const candidateEdges of rimEdges.length===all.length?[all]:[rimEdges,all]){
      if(candidateEdges.length<3)continue;
      const perimeter=new Map<string,[number,number]>();
      for(const face of planarFaces(candidateEdges)){
        face.forEach((a,i)=>{
          const b=face[(i+1)%face.length],key=a<b?a+','+b:b+','+a;
          if(!perimeter.delete(key))perimeter.set(key,[a,b]);
        });
      }
      for(const cycle of planarFaces([...perimeter.values()])){
        if(cycle.length<3||new Set(cycle).size!==cycle.length)continue;
        const points=cycle.map(v=>coords[v]);
        const colors=cycle.map((v,i)=>assignments[neighbors[v].find(n=>n.other===cycle[(i+1)%cycle.length])!.edge] as 'M'|'V');
        if(assignment==='mixed'&&colors.every(color=>color===colors[0]))continue;
        const corners=points.flatMap((p,i)=>{
          const prev=(i+points.length-1)%points.length;
          return colors[prev]!==colors[i]||!pointOnSegment(p,line(points[prev],points[(i+1)%points.length]),eps)?[i]:[];
        });
        const ring=corners.map(i=>points[i]);
        if(ring.length<3||result.some(p=>p.assignment===assignment&&sameSinkRing(ring,p.ring,eps)))continue;
        const {crossingLines,unchanged}=throughCreases(index,ring,cycle,eps);
        if(unchanged||!crossingLines.length)continue;
        // A common material vertex is useful to the existing tip-fold planner,
        // but parallel through-creases need no such vertex for recognition.
        const center=coords.find((p,v)=>neighbors[v].length>=3&&crossingLines.every(s=>
          Math.abs((p[0]-s.a[0])*(s.b[1]-s.a[1])-(p[1]-s.a[1])*(s.b[0]-s.a[0]))<=eps*distance(s.a,s.b))&&materialPointInside(p,ring));
        result.push({ring,assignment,crossingLines,...(assignment==='mixed'&&{rimAssignments:corners.map(i=>colors[i])}),...(center&&{center})});
      }
    }
  }
  return result;
}

export function sinkBoundaryPatterns(doc:Doc):AutomaticSinkPattern[]{
  let patterns=cache.get(doc);
  if(!patterns){patterns=computePatterns(doc);cache.set(doc,patterns);}
  return patterns;
}
