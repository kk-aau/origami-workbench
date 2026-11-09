import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationStepAnimation} from './simStepAnimation';
import {simulationStepAxisGroups} from './simStepScheduling';

type StepRanges=Pick<SimulationStepAnimation,'ranges'>;
const different=(a:number,b:number)=>Math.abs(a-b)>1e-8;
const changes=(r:SimulationStepAnimation['ranges'][number])=>different(r.fromAngle,r.toAngle)||r.viaAngle!==undefined&&(different(r.fromAngle,r.viaAngle)||different(r.viaAngle,r.toAngle));

/** Find old physical hinges on the immediate material neighbours of this
 * step's moving panels. Triangulation seams are joined before testing face
 * adjacency; coincident projections and a shared corner are not neighbours.
 * This does not release anything by itself, and does not inspect or edit pins. */
export function adjacentSimulationStepFoldedEdges(prepared:PreparedOrigamiModel,animation:StepRanges):number[]{
  const ranges=new Map(animation.ranges.map(r=>[r.edge,r])),parent=prepared.facesVertices.map((_,i)=>i);
  const find=(face:number):number=>{while(parent[face]!==face){parent[face]=parent[parent[face]];face=parent[face];}return face;};
  prepared.edgesFaces.forEach((faces,edge)=>{
    const range=ranges.get(edge);
    if(faces.length===2&&prepared.edgesAssignment[edge]==='F'&&range&&!changes(range)&&Math.abs(range.fromAngle)<1e-8)parent[find(faces[1])]=find(faces[0]);
  });
  const participating=new Set<number>();
  for(const crease of prepared.creaseParams){
    const range=ranges.get(crease.edge);
    if(range&&changes(range)&&prepared.edgesFaces[crease.edge]?.length===2){participating.add(find(crease.face1));participating.add(find(crease.face2));}
  }
  return prepared.creaseParams.flatMap(crease=>{
    const edge=crease.edge,range=ranges.get(edge);
    if(!range||range.viaAngle!==undefined||different(range.fromAngle,range.toAngle)||Math.abs(Math.abs(range.fromAngle)-180)>1e-8||
      !['M','V'].includes(prepared.edgesAssignment[edge])||prepared.edgesFaces[edge]?.length!==2)return [];
    return participating.has(find(crease.face1))||participating.has(find(crease.face2))?[edge]:[];
  });
}

/** A local crease-axis switch can press an F mark without unfolding the old
 * surrounding stack. Release one same-MV material hinge at a time, keeping
 * collinear pieces of that hinge together. Distinct folded layers that merely
 * project onto the same line are not joined without shared material vertices.
 * The result is only a search instruction; pins, closure and full CCD remain
 * authoritative, and neither endpoint CP nor the precrease ledger is changed. */
function switchPrecreaseGroups(prepared:PreparedOrigamiModel,animation:Pick<SimulationStepAnimation,'ranges'|'initialPositions'>):number[][]{
  const ranges=new Map(animation.ranges.map(r=>[r.edge,r]));
  const explicit=new Set(animation.ranges.filter(r=>Math.abs(r.fromAngle)<1e-8&&Math.abs(r.toAngle)<1e-8&&r.viaAngle!==undefined&&Math.abs(Math.abs(r.viaAngle)-180)<1e-8).map(r=>r.edge));
  if(!explicit.size)return [];
  // The old axis can meet the pressed ray at a vertex without bordering its
  // immediate panel: intervening folded sectors are still the same junction.
  // Do not restrict this switch to adjacentSimulationStepFoldedEdges.
  const eligible=new Set(prepared.creaseParams.flatMap(crease=>{
    const edge=crease.edge,old=ranges.get(edge);
    return old&&old.viaAngle===undefined&&!different(old.fromAngle,old.toAngle)&&Math.abs(Math.abs(old.fromAngle)-180)<1e-8&&
      ['M','V'].includes(prepared.edgesAssignment[edge])&&prepared.edgesFaces[edge]?.length===2&&
      [...explicit].some(e=>Math.sign(ranges.get(e)!.viaAngle!)===Math.sign(old.fromAngle))?[edge]:[];
  }));
  if(!eligible.size)return [];
  // Axis grouping checks both the actual seed's 3D line and indexed material
  // adjacency. It groups an old hinge split by CP intersections, rather than
  // trying only all neighbours or a physically incomplete single segment.
  // Axis grouping reads only ranges and the seed. No fixed point is needed
  // here, so the app can exclude these candidates before expanding auto pins.
  const grouped=simulationStepAxisGroups(prepared,{version:1,sourceSignature:'material-axis-grouping',fixedVertices:[],...animation,ranges:animation.ranges.map(r=>eligible.has(r.edge)?{...r,viaAngle:0}:r)});
  const presses=grouped.filter(group=>group.creases.every(i=>explicit.has(prepared.creaseParams[i].edge)));
  const oldGroups=grouped.filter(group=>group.creases.every(i=>eligible.has(prepared.creaseParams[i].edge)));
  return oldGroups.filter(old=>presses.some(press=>
    old.vertices.some(v=>press.vertices.includes(v))&&Math.sign(ranges.get(prepared.creaseParams[old.creases[0]].edge)!.fromAngle)===Math.sign(ranges.get(prepared.creaseParams[press.creases[0]].edge)!.viaAngle!)
  )).sort((a,b)=>b.creases.length-a.creases.length||a.creases[0]-b.creases[0]).map(group=>group.creases.map(i=>prepared.creaseParams[i].edge));
}

export function switchSimulationStepPrecreaseEdges(prepared:PreparedOrigamiModel,animation:Pick<SimulationStepAnimation,'ranges'|'initialPositions'>):number[]{
  return [...new Set(switchPrecreaseGroups(prepared,animation).flat())];
}

export function* switchSimulationStepPrecreaseCandidates(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,options:{maxCandidates?:number}={}):Generator<SimulationStepAnimation>{
  const candidates=switchPrecreaseGroups(prepared,animation);
  const limit=Math.max(0,Math.min(12,Math.trunc(options.maxCandidates??8)));
  for(const group of candidates.slice(0,limit)){
    const released=new Set(group),candidate={...animation,ranges:animation.ranges.map(r=>released.has(r.edge)?{...r,viaAngle:0}:{...r})};
    delete candidate.motion;delete candidate.layerTimeline;delete candidate.flex;
    yield candidate;
  }
}

/** Bounded candidate search, never a blanket unlock. Small openings are tried
 * first; a full opening is still restricted to the original MV half-space.
 * Explicit precrease excursions, all endpoint angles, and every pin survive.
 * Each yielded candidate still needs rigid closure and continuous collision
 * certification before it may become a playback animation. */
export function* adjacentSimulationStepFoldedCandidates(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation,options:{maxCandidates?:number}={}):Generator<SimulationStepAnimation>{
  const adjacent=adjacentSimulationStepFoldedEdges(prepared,animation);
  if(!adjacent.length)return;
  const limit=Math.max(0,Math.min(24,Math.trunc(options.maxCandidates??12)));
  if(!limit)return;
  const sets:number[][]=[adjacent],seen=new Set([adjacent.join(',')]);
  // A small neighbourhood can be searched without exponential subset growth.
  // Larger ones are released as a single local assembly, still one ring only.
  if(adjacent.length<=4)for(const edge of adjacent){const key=String(edge);if(!seen.has(key)){seen.add(key);sets.push([edge]);}}
  let count=0;
  for(const edges of sets)for(const opening of [15,45,90,180]){
    if(count++>=limit)return;
    const selected=new Set(edges),candidate={...animation,ranges:animation.ranges.map(r=>selected.has(r.edge)?{...r,viaAngle:Math.sign(r.fromAngle)*(180-opening)}:{...r})};
    delete candidate.motion;delete candidate.layerTimeline;delete candidate.flex;
    yield candidate;
  }
}

/** A change of flat-folding pattern may need to reopen an old fold even when
 * its two endpoint angles agree. Generate a temporary candidate only after
 * direct motion fails. Indexed interior material vertices transmit coupling;
 * touching at a paper corner does not couple two independent flaps.
 * This is a search policy, never permission to relax pins or collision checks. */
export function reopenSimulationStepFoldedComponents(prepared:PreparedOrigamiModel,animation:SimulationStepAnimation):SimulationStepAnimation|null {
  const zero=(angle:number)=>Math.abs(angle)<1e-8;
  const changed=animation.ranges.filter(r=>Math.abs(r.fromAngle-r.toAngle)>1e-8);
  // Explicit precrease instructions already specify an excursion. Do not
  // replace them with an inferred unfold, or invent motion for unchanged CPs.
  if(animation.ranges.some(r=>r.viaAngle!==undefined)||!changed.some(r=>!zero(r.fromAngle)&&zero(r.toAngle))||!changed.some(r=>zero(r.fromAngle)&&!zero(r.toAngle)))return null;
  const boundary=new Set<number>();
  prepared.edgesFaces.forEach((faces,e)=>{if(faces.length===1)prepared.edgesVertices[e].forEach(v=>boundary.add(v));});
  const oldIncident=new Map<number,number[]>();
  for(const range of animation.ranges)if(!zero(range.fromAngle))for(const vertex of prepared.edgesVertices[range.edge]){
    const edges=oldIncident.get(vertex)??[];edges.push(range.edge);oldIncident.set(vertex,edges);
  }
  const touched=new Set(changed.flatMap(r=>prepared.edgesVertices[r.edge]).filter(v=>!boundary.has(v)));
  const release=new Set<number>(),queue=[...touched];
  for(let i=0;i<queue.length;i++)for(const edge of oldIncident.get(queue[i])??[]){
    if(release.has(edge))continue;release.add(edge);
    for(const vertex of prepared.edgesVertices[edge])if(!boundary.has(vertex)&&!touched.has(vertex)){touched.add(vertex);queue.push(vertex);}
  }
  if(!animation.ranges.some(r=>release.has(r.edge)&&Math.abs(r.fromAngle-r.toAngle)<1e-8))return null;
  return {...animation,ranges:animation.ranges.map(r=>({...r,...(release.has(r.edge)||zero(r.fromAngle)&&!zero(r.toAngle)?{viaAngle:0}:{})}))};
}
