import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationStepAxisGroups,simulationStepGroupCombinations,type SimulationStepAxisGroup} from '../../src/engine/simStepScheduling';
import {planSimulationStepPath,validateSimulationStepMotion,type SimulationStepMotion,type SimulationStepMotionPhase} from '../../src/engine/simStepPath';
import {diagramPrecreaseBatchesFixture} from '../fixtures/simulationStepPrecreaseBatches';
import {simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {compileSimulationStepRigidMechanism} from '../../src/engine/simStepRigid';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';

const crossing=()=>{const f=diagramPrecreaseBatchesFixture('diagonals'),clip=buildDiagramStepAnimation(f.project,f.stepId);return {...prepareSimulationDocument(clip.fold),animation:clip.animation};};
const motion=(phases:SimulationStepMotionPhase[]):SimulationStepMotion=>({version:1,method:'sequential',phases,maxClosureResidual:0,knots:[{progress:0,angles:[...phases[0].fromAngles]},...phases.map(p=>({progress:p.end,angles:[...p.toAngles]}))]});

test('connected collinear material hinges are atomic only for synonymous instructions',()=>{
  const {prepared,animation}=crossing(),groups=simulationStepAxisGroups(prepared,animation);
  assert.deepEqual(groups.map(g=>g.creases.length),[2,2]);
  for(const change of [{viaAngle:-180},{toAngle:180,viaAngle:undefined},{fromAngle:30}]){
    const altered=structuredClone(animation),crease=groups[0].creases[0];Object.assign(altered.ranges[crease],change);
    const actual=simulationStepAxisGroups(prepared,altered);
    assert.equal(actual.length,3,'different direction, action or starting angle is never permanently bound to its neighbour');
    assert.ok(actual.some(g=>g.creases.length===1&&g.creases[0]===crease));
  }
  // This is a physically valid bent seed, not an arbitrary coordinate edit:
  // fold the other diagonal by 90 degrees, then leave that old fold fixed.
  const folded=structuredClone(animation),mechanism=compileSimulationStepRigidMechanism(prepared,animation),old=new Set(groups[1].creases);
  const angles=animation.ranges.map((_,i)=>old.has(i)?90:0);
  folded.initialPositions=Array.from(mechanism.validatePose(angles));
  folded.ranges=folded.ranges.map((r,i)=>old.has(i)?{edge:r.edge,fromAngle:90,toAngle:90}:r);
  assert.deepEqual(simulationStepAxisGroups(prepared,folded).map(g=>g.creases.length),[1,1],'a straight material stroke bent by an existing fold needs separate physical axes');
});

test('bounded large-step search keeps every single-axis fallback and useful low-order combinations',()=>{
  const groups:SimulationStepAxisGroup[]=Array.from({length:20},(_,i)=>({creases:[i],vertices:[i],boundaryVertices:[Math.floor(i/2)],precrease:true}));
  const candidates=simulationStepGroupCombinations(groups,groups.map((_,i)=>i));
  assert.ok(candidates.length<=512);
  for(let i=0;i<groups.length;i++)assert.ok(candidates.some(c=>c.length===1&&c[0]===i));
  for(let i=0;i<groups.length;i+=2)assert.ok(candidates.some(c=>c.length===2&&c[0]===i&&c[1]===i+1),'same-corner pairs survive the budget for high-cardinality guesses');
  assert.deepEqual(candidates,simulationStepGroupCombinations(groups,groups.map((_,i)=>i)),'search order is deterministic');
});

test('batch descriptions are independently recomputed and forged timings or crease membership are rejected',()=>{
  const {prepared,animation}=crossing(),original=planSimulationStepPath(prepared,animation);
  assert.equal(original.batches?.length,2);
  for(const change of [
    (m:SimulationStepMotion)=>{m.batches![0].start=.01;},
    (m:SimulationStepMotion)=>{m.batches![0].end=.49;},
    (m:SimulationStepMotion)=>{m.batches![0].apex=.3;},
    (m:SimulationStepMotion)=>{m.batches![0].creases=[...m.batches![1].creases];},
    (m:SimulationStepMotion)=>{m.batches!.reverse();},
  ]){const forged=structuredClone(original);change(forged);assert.throws(()=>validateSimulationStepMotion(prepared,animation,forged),/批次|路径/);}
  const legacy=structuredClone(original);delete legacy.batches;
  assert.deepEqual(validateSimulationStepMotion(prepared,animation,legacy).batches,original.batches,'legacy inputs get trusted metadata rather than bypassing validation');
});

test('legacy serial precreases sharing a global midpoint remain valid while repeated peaks and old-fold motion do not',()=>{
  const {prepared,animation:source}=simulationTwoHingeFixture(),animation={...source,ranges:source.ranges.map(r=>({...r,toAngle:0,viaAngle:r.toAngle}))};
  const active=animation.ranges.flatMap((r,i)=>Math.abs(r.viaAngle)>1e-8?[i]:[]);assert.equal(active.length,2);
  const vectors=[animation.ranges.map(r=>r.fromAngle)];
  for(const [crease,value] of [[active[0],animation.ranges[active[0]].viaAngle],[active[1],animation.ranges[active[1]].viaAngle],[active[0],0],[active[1],0]]){
    const next=[...vectors.at(-1)!];next[crease]=value;vectors.push(next);
  }
  const phases=vectors.slice(1).map((to,i)=>({start:i/4,end:(i+1)/4,fromAngles:vectors[i],toAngles:to,kind:'linear' as const}));
  const valid=validateSimulationStepMotion(prepared,animation,motion(phases));
  assert.equal(valid.batches?.length,1,'overlapping legacy excursions form one combined batch');
  assert.equal(valid.batches?.[0].apex,undefined,'distinct per-crease peaks are not mislabeled as a common apex');
  const repeated=phases.map(p=>structuredClone(p));
  repeated.push({...structuredClone(phases[0]),fromAngles:[...vectors.at(-1)!]});
  repeated.push({...structuredClone(phases[2]),toAngles:[...vectors.at(-1)!]});
  repeated.forEach((p,i)=>{p.start=i/repeated.length;p.end=(i+1)/repeated.length;});
  assert.throws(()=>validateSimulationStepMotion(prepared,animation,motion(repeated)),/重复|预折|路径/);
  const onlyOne={...source,ranges:source.ranges.map((r,i)=>({...r,toAngle:0,...i===active[0]?{viaAngle:r.toAngle}:{}}))};
  const plan=planSimulationStepPath(prepared,onlyOne),old=active[1],forged=structuredClone(plan);
  forged.phases[0].toAngles[old]=10;forged.phases[1].fromAngles[old]=10;
  assert.throws(()=>validateSimulationStepMotion(prepared,onlyOne,motion(forged.phases)),/未参与|折角|路径/);
});

test('localized failed batches are not recertified for permutations of later independent instructions',()=>{
  // Five real panels joined in a tree, giving four independent straight axes.
  // The callback below tests only planner pruning; production fixtures test
  // the real continuous collision predicate separately.
  const coords=Array.from({length:2},(_,y)=>Array.from({length:6},(_,x)=>[x,y])).flat();
  const faces=Array.from({length:5},(_,x)=>[x,x+1,x+7,x+6]),boundary:Array<[number,number]>=[];
  for(let x=0;x<5;x++){boundary.push([x,x+1]);boundary.push([x+6,x+7]);}boundary.push([0,6],[5,11]);
  const edges=[...boundary,...Array.from({length:4},(_,i)=>[i+1,i+7] as [number,number])];
  const fold={vertices_coords:coords,edges_vertices:edges,faces_vertices:faces,edges_assignment:edges.map((_,i)=>i<boundary.length?'B':'F'),edges_foldAngle:edges.map(()=>0)};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const animation={version:1 as const,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),fixedVertices:[...prepared.facesVertices[0]],ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:0,...c.edge<edges.length?{viaAngle:180}:{}}))};
  const failures=new Map<string,number>();
  const planned=planSimulationStepPath(prepared,animation,{maxCandidates:48,checkPath(_path,candidate){
    const phase=candidate.phases.find(p=>p.fromAngles.filter((a,i)=>Math.abs(p.toAngles[i]-a)>1e-8).length>1);
    if(!phase)return {status:'clear'};
    const ids=phase.fromAngles.flatMap((a,i)=>Math.abs(phase.toAngles[i]-a)>1e-8?[i]:[]),key=ids.join(',');
    failures.set(key,(failures.get(key)??0)+1);
    return {status:'collision',progress:(phase.start+phase.end)/2};
  }});
  assert.equal(planned.batches?.length,4);
  assert.ok(failures.size>4,'the search tries larger parallel subsets before serial fallback');
  for(const count of failures.values())assert.equal(count,1,'a localized bad batch is not rechecked just because later batches are permuted');
});
