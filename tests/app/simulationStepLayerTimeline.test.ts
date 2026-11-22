import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {createSimulationStepPathEvaluator,planSimulationStepPath} from '../../src/engine/simStepPath';
import {buildSimulationStepLayerTimeline,rigidStepContactLookup,simulationStepLayerOrderAt} from '../../src/engine/simStepLayerTimeline';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {simulationDegreeFourFixture,simulationObstructingFlapsFixture,simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';
import {certifySimulationStepPath,createSimulationStepTangentProjector} from '../../src/engine/simStepCollision';
import {inspectSimulationStepInitialContactOrder} from '../../src/engine/simStepContactOrder';

function diagonalFixture(sign=1,precrease=false){
  const fold={vertices_coords:[[0,0],[1,0],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,2]] as [number,number][],edges_assignment:['B','B','B','B',precrease?'F':sign>0?'V':'M'],edges_foldAngle:[0,0,0,0,precrease?0:sign*180],faces_vertices:[[0,1,2],[0,2,3]]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:precrease?0:sign*180,...(precrease?{viaAngle:sign*180}:{})})),fixedVertices:[...prepared.facesVertices[1]]};
  animation.motion=planSimulationStepPath(prepared,animation);return {prepared,animation};
}
const pair=(rows:readonly (readonly number[])[],a:number,b:number)=>rows.find(r=>r[0]===a&&r[1]===b||r[0]===b&&r[1]===a);

test('numerical playback retains old contact through a common 3D rotation but rejects relative movement and stretching',()=>{
 const {prepared,animation}=diagonalFixture(),path=createSimulationStepPathEvaluator(prepared,animation,animation.motion!),seed=path.evaluate(1);
 const numeric={...animation,initialPositions:Array.from(seed)};delete numeric.motion;
 const rows:[number,number,number][]=[[0,1,1]],timeline=[{progress:0,faceOrders:rows},{progress:1,faceOrders:[]}];
 const rotated=Float32Array.from(seed,(_,i)=>{const v=i-i%3,x=seed[v],y=seed[v+1],z=seed[v+2],c=Math.cos(.7),s=Math.sin(.7);return i%3===0?c*x-s*y+3:i%3===1?s*x+c*y-2:z+1;});
 for(const progress of [.1,.5,.99,1])assert.deepEqual(simulationStepLayerOrderAt(prepared,numeric,timeline,progress,rotated),rows);
 const moved=rotated.slice(),v=prepared.facesVertices[1].find(v=>!prepared.facesVertices[0].includes(v))!;moved[v*3]+=.01;
 assert.deepEqual(simulationStepLayerOrderAt(prepared,numeric,timeline,.5,moved),[]);
 assert.deepEqual(seed,path.evaluate(1),'display proof cannot change solver geometry');
});

test('numerical recording carries a closed accordion through common planar strain only while its continuous history supports it',()=>{
  const {prepared,animation}=simulationTwoHingeFixture(),motion=planSimulationStepPath(prepared,animation);
  const initial=Array.from(createSimulationStepPathEvaluator(prepared,animation,motion).evaluate(1));
  const deformed=Float32Array.from(initial,(_,i)=>{
    const j=i-i%3,x=initial[j],y=initial[j+1],z=initial[j+2];
    return i%3===0?1.03*x+.04*z+.2:i%3===1?y+.22*x+.18*z:.95*z-.2*x-.1;
  });
  const ranges=animation.ranges.map(r=>({...r,fromAngle:r.toAngle}));
  const rows:[number,number,number][]=[[0,2,-1],[2,1,1]],timeline=[{progress:0,faceOrders:rows},{progress:1,faceOrders:[]}];
  const record=(frames:Array<[number,ArrayLike<number>]>,folds=ranges):SimulationStepAnimation=>({
    ...animation,initialPositions:initial,ranges:folds,dynamic:{version:1,method:'dynamic',keyframes:frames.map(([progress,p])=>({progress,positions:Array.from(p)})),
      maxEdgeStrain:.04,maxAreaStrain:.04,maxAngleError:0,endAngleError:0,maxFixedDisplacement:0},
  });
  const good=record([[0,initial],[.3,deformed],[1,deformed]]);
  for(const p of [.3,1,.7])assert.deepEqual(simulationStepLayerOrderAt(prepared,good,timeline,p,deformed),rows,'inherit only supplied material orders, including the two non-adjacent end sheets');
  const id=prepared.fold.vertices_coords.findIndex(p=>p[0]===3);
  assert.ok(id>=0);
  for(const axis of [0,1]){
    const displaced=deformed.slice();displaced[id*3+axis]+=.025;
    const bad=record([[0,initial],[.3,deformed],[.6,displaced],[1,deformed]]);
    assert.deepEqual(simulationStepLayerOrderAt(prepared,bad,timeline,1,deformed),[],'return to the original-looking packet after a slip or a lift is insufficient');
    assert.deepEqual(simulationStepLayerOrderAt(prepared,bad,timeline,.3,deformed),rows,'backward seek before separation retains the proven order');
    assert.deepEqual(simulationStepLayerOrderAt(prepared,good,timeline,.3,displaced),[],'all actually displayed vertices must still lie in the common image');
  }
  const hinge=prepared.creaseParams.find(c=>c.targetAngle===-180)!.edge;
  const releases=record([[0,initial],[1,deformed]],ranges.map(r=>r.edge===hinge?{...r,viaAngle:0}:r));
  assert.deepEqual(simulationStepLayerOrderAt(prepared,releases,timeline,1,deformed),[],'an authored opening is outside the permanent closed chain');
  const mirrored=Float32Array.from(initial,(v,i)=>i%3===0?-v:v),collapse=record([[0,initial],[1,mirrored]]);
  assert.deepEqual(simulationStepLayerOrderAt(prepared,collapse,timeline,1,mirrored),[],'invertible endpoints alone miss a rank collapse between them');
});

test('welded material keeps only its supplied stacking relations when the shared sheet bows out of plane',()=>{
  const {fold}=simulationTwoHingeFixture();
  // Stack three unit squares. The last sheet has two separately indexed
  // triangular faces covering the first sheet's single quadrilateral.
  fold.faces_vertices.splice(2,1,[2,3,7],[2,7,6]);fold.edges_vertices.push([2,7]);
  fold.edges_assignment.push('F');fold.edges_foldAngle.push(0);
  const {prepared}=prepareSimulationDocument(fold);
  const seed=Float32Array.from(prepared.fold.vertices_coords.flatMap(([x,,z])=>[x%2,0,z]));
  const bent=Float32Array.from(seed,(value,i)=>{
    const offset=i-i%3;
    return i%3===1?Math.fround(value+.18*seed[offset]*seed[offset+2]):value;
  });
  const recording:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(seed),fixedVertices:[],
    ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:c.targetAngle,toAngle:c.targetAngle})),
    dynamic:{version:1,method:'dynamic',mergedLayers:true,keyframes:[{progress:0,positions:Array.from(seed)},{progress:1,positions:Array.from(bent)}],
      maxEdgeStrain:.04,maxAreaStrain:.04,maxAngleError:0,endAngleError:0,maxFixedDisplacement:0}};
  const rows:[number,number,number][]=[[0,2,-1],[0,3,-1]],arrival:[number,number,number][]=[[0,2,1]];
  const timeline=[{progress:0,faceOrders:rows},{progress:1,faceOrders:arrival}];
  const intermediate=Float32Array.from(seed,(v,i)=>(v+bent[i])/2);
  assert.deepEqual(simulationStepLayerOrderAt(prepared,recording,timeline,.5,intermediate),rows);
  assert.deepEqual(simulationStepLayerOrderAt(prepared,recording,timeline,1,bent),rows,'continuous contact retains the seed side');
  assert.deepEqual(simulationStepLayerOrderAt(prepared,recording,[{progress:0,faceOrders:[]}],.5,intermediate),[],'a material group alone gives no top face');
  const old={...recording,dynamic:{...recording.dynamic!,mergedLayers:undefined}};
  assert.deepEqual(simulationStepLayerOrderAt(prepared,old,timeline,.5,intermediate),[],'legacy recordings did not enforce this curved contact');
  const separated=intermediate.slice();
  const corner=prepared.facesVertices.findLast((_,t)=>prepared.triangleSourceFaces![t]===2)!.find(v=>prepared.fold.vertices_coords[v][0]===3)!;
  separated[3*corner+1]+=.05;
  assert.deepEqual(simulationStepLayerOrderAt(prepared,recording,timeline,.5,separated),[],'the displayed pose must still share the solver vertices');
});

test('new fold contact uses the actual approach side, with opposite MV producing opposite material order',()=>{
  for(const sign of [1,-1]){
    const {prepared,animation}=diagonalFixture(sign),timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:2,faceOrders:[]});
    assert.deepEqual(timeline.map(f=>f.progress),[0,1]);assert.deepEqual(timeline[0].faceOrders,[]);
    assert.deepEqual(timeline[1].faceOrders,[[0,1,sign]]);
    assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,.99),[],'separated flaps must not inherit their future contact order');
    assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,1),[[0,1,sign]]);
  }
});

test('a moving outer flap cannot erase the known contact between the two pinned inner sheets',()=>{
  const {prepared,animation}=simulationTwoHingeFixture();
  const motion=planSimulationStepPath(prepared,animation);
  const seed=createSimulationStepPathEvaluator(prepared,animation,motion).evaluate(1);
  const fixedVertices=[...new Set(prepared.facesVertices.flatMap((t,i)=>prepared.triangleSourceFaces![i]<2?t:[]))];
  const bent=seed.slice();
  for(let v=0;v<prepared.vertexCount;v++)if(!fixedVertices.includes(v))bent[v*3+1]+=.06;
  const recording:SimulationStepAnimation={...animation,initialPositions:Array.from(seed),fixedVertices,
    ranges:animation.ranges.map(r=>({...r,fromAngle:r.toAngle})),
    dynamic:{version:1,method:'dynamic',keyframes:[{progress:0,positions:Array.from(seed)},{progress:1,positions:Array.from(bent)}],
      maxEdgeStrain:0,maxAreaStrain:0,maxAngleError:0,endAngleError:0,maxFixedDisplacement:0}};
  const rows:[number,number,number][]=[[0,1,1],[0,2,-1]];
  const timeline=[{progress:0,faceOrders:rows},{progress:1,faceOrders:[]}];
  assert.deepEqual(simulationStepLayerOrderAt(prepared,recording,timeline,1,bent),[rows[0]]);
  const intermediate=Float32Array.from(seed,(p,i)=>(p+bent[i])/2);
  assert.deepEqual(simulationStepLayerOrderAt(prepared,recording,timeline,.5,intermediate),[rows[0]]);
});

test('precrease establishes the folded contact then returns to the genuine unoverlapped initial sheet',()=>{
  const {prepared,animation}=diagonalFixture(1,true),timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:2,faceOrders:[]});
  assert.deepEqual(timeline.map(f=>f.progress),[0,.5,1]);assert.deepEqual(timeline[1].faceOrders,[[0,1,1]]);assert.deepEqual(timeline[2].faceOrders,[]);
  for(const progress of [.25,.75,1])assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,progress),[]);
});

test('old coincident sheets retain the supplied initial orientation while a different flap folds',()=>{
  const {prepared,animation}=simulationTwoHingeFixture(),oldIndex=prepared.creaseParams.findIndex(c=>c.targetAngle===180),newIndex=prepared.creaseParams.findIndex(c=>c.targetAngle===-180);
  const first:SimulationStepAnimation={...animation,ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:0,toAngle:i===oldIndex?180:0}))};
  const firstMotion=planSimulationStepPath(prepared,first),seed=createSimulationStepPathEvaluator(prepared,first,firstMotion).evaluate(1);
  const next:SimulationStepAnimation={...animation,initialPositions:Array.from(seed),ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:i===oldIndex?180:0,toAngle:i===oldIndex?180:i===newIndex?-180:0}))};
  next.motion=planSimulationStepPath(prepared,next);
  // The UI's selected flat solution is authoritative even if an unconstrained
  // endpoint solver would happen to choose the other stacking order.
  const initial={sourceFaceCount:3,faceOrders:[[1,0,-1]] as [number,number,number][]},timeline=buildSimulationStepLayerTimeline(prepared,next,initial);
  assert.deepEqual(timeline[0].faceOrders,initial.faceOrders);
  assert.deepEqual(simulationStepLayerOrderAt(prepared,next,timeline,.1),initial.faceOrders);
  assert.deepEqual(simulationStepLayerOrderAt(prepared,next,timeline,.75),initial.faceOrders);
  assert.deepEqual(pair(timeline.at(-1)!.faceOrders,0,1),[1,0,-1]);
  assert.ok(pair(timeline.at(-1)!.faceOrders,1,2),'the arriving third panel needs its own approach-derived row');
});

test('an old folded stack keeps its material order while the whole stack rotates about another hinge',()=>{
  const {prepared,animation}=simulationTwoHingeFixture(),oldIndex=prepared.creaseParams.findIndex(c=>c.targetAngle===180),newIndex=prepared.creaseParams.findIndex(c=>c.targetAngle===-180);
  const first:SimulationStepAnimation={...animation,ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:0,toAngle:i===oldIndex?180:0}))},firstMotion=planSimulationStepPath(prepared,first);
  const seed=createSimulationStepPathEvaluator(prepared,first,firstMotion).mechanism.evaluateAngles(firstMotion.phases.at(-1)!.toAngles).positions;
  const source=prepared.triangleSourceFaces!,pins=new Set(prepared.facesVertices.flatMap((face,i)=>source[i]===2?face:[]));
  const next:SimulationStepAnimation={...animation,initialPositions:Array.from(seed),fixedVertices:[...pins],ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:i===oldIndex?180:0,toAngle:i===oldIndex?180:i===newIndex?-180:0}))};
  next.motion=planSimulationStepPath(prepared,next);const timeline=buildSimulationStepLayerTimeline(prepared,next,{sourceFaceCount:3,faceOrders:[[0,1,1]]});
  const middle=createSimulationStepPathEvaluator(prepared,next,next.motion).evaluate(.5);
  assert.ok(Array.from(middle).some((v,i)=>Math.abs(v-seed[i])>.1),'the old two-sheet stack actually moves in three dimensions');
  assert.deepEqual(simulationStepLayerOrderAt(prepared,next,timeline,.5),[[0,1,1]],'moving stacks need the same layer preservation as fixed stacks');
});

test('coupled four-crease contact derives material order without independent linear-angle guesses',()=>{
  const {prepared,animation}=simulationDegreeFourFixture();animation.motion=planSimulationStepPath(prepared,animation);
  assert.equal(animation.motion.method,'coupled');const timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:4,faceOrders:[]});
  assert.ok(timeline.at(-1)!.faceOrders.length>=3,'the fully folded vertex has multiple positive-area contacts');
  const p=createSimulationStepPathEvaluator(prepared,animation,animation.motion),phase=animation.motion.phases[0],seed=p.mechanism.evaluateAngles(phase.toAngles).positions;
  const reverse:SimulationStepAnimation={...animation,initialPositions:Array.from(seed),ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:phase.toAngles[i],toAngle:phase.fromAngles[i]}))};
  reverse.motion={...animation.motion,phases:[{...phase,fromAngles:[...phase.toAngles],toAngles:[...phase.fromAngles]}],knots:animation.motion.knots.map(k=>({progress:1-k.progress,angles:[...k.angles]})).reverse()};
  const reversePath=createSimulationStepPathEvaluator(prepared,reverse,reverse.motion),m=reversePath.mechanism,projector=createSimulationStepTangentProjector({initialPositions:m.seedPositions,vertexBodies:m.vertexBodies,fromAngles:m.fromAngles,bodies:m.components.map(b=>({parent:b.parent,crease:b.parentCrease,sign:b.rotationSign,...(b.parentCrease===null?{}:{axisVertices:prepared.edgesVertices[prepared.creaseParams[b.parentCrease].edge]})}))},reverse.motion.phases);
  const checked=inspectSimulationStepInitialContactOrder(prepared,reversePath,{sourceFaceCount:4,faceOrders:timeline.at(-1)!.faceOrders},{initialSide:projector.initialContactSide});
  assert.equal(checked.status,'clear','every real endpoint overlap must have a row consistent with the actual continuous material approach');
  assert.ok(checked.checkedPairs>=3);
});

test('sequential phases preserve the first folded stack while the second paper flap moves',()=>{
  const {prepared,animation}=simulationObstructingFlapsFixture();
  animation.motion=planSimulationStepPath(prepared,animation,{checkPath:(path,motion)=>{
    const m=path.mechanism,projector=createSimulationStepTangentProjector({initialPositions:m.seedPositions,vertexBodies:m.vertexBodies,fromAngles:m.fromAngles,bodies:m.components.map(b=>({parent:b.parent,crease:b.parentCrease,sign:b.rotationSign,...(b.parentCrease===null?{}:{axisVertices:prepared.edgesVertices[prepared.creaseParams[b.parentCrease].edge]})}))},motion.phases);
    const certificate=certifySimulationStepPath({indices:prepared.indices,triangleBodies:m.triangleBodies},{evaluate:path.evaluate,motionBound:path.motionBound,projectionBounds:(a,b,axis,origin)=>projector(a,b,axis,origin,path.angleBounds(a,b)),contactSeparation:projector.separates,contactTransition:projector.contactTransition});
    return {status:certificate.status};
  }});
  assert.equal(animation.motion.method,'sequential');const timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:3,faceOrders:[]});
  assert.equal(timeline.length,3);assert.equal(timeline[1].faceOrders.length,1);
  assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,.75),timeline[1].faceOrders,'the already folded first flap keeps its correct visible side');
  const [a,b]=timeline[1].faceOrders[0].map(f=>prepared.triangleSourceFaces!.indexOf(f));
  const contact=rigidStepContactLookup(prepared,animation)!;
  for(const [progress,expected] of [[.25,false],[.5,true],[.75,true],[1,true],[.25,false],[.75,true]] as const){
    assert.equal(contact(a,b,progress),expected,'front/back and vector capture use the same phase during playback or scrubbing');
  }
  const partial=structuredClone(animation);
  const changed=partial.motion!.phases[0].toAngles.findIndex((angle,i)=>angle!==partial.motion!.phases[0].fromAngles[i]);
  for(const phase of partial.motion!.phases){
    if(phase.fromAngles[changed])phase.fromAngles[changed]/=2;
    phase.toAngles[changed]/=2;
  }
  assert.equal(rigidStepContactLookup(prepared,partial)!(a,b,.75),false,'sharing an assembly after a 90-degree fold does not make its two faces coplanar');
  assert.equal(timeline[2].faceOrders.length,3,'both arriving overlaps and the carried first contact are represented');
});

test('budget exhaustion or stale initial face indices cannot manufacture an endpoint order',()=>{
  const {prepared,animation}=simulationTwoHingeFixture();animation.motion=planSimulationStepPath(prepared,animation);
  const timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:99,faceOrders:[[0,1,1]]},{maxPairsPerPhase:1});
  assert.deepEqual(timeline[0].faceOrders,[]);assert.deepEqual(timeline.at(-1)!.faceOrders,[]);
});
