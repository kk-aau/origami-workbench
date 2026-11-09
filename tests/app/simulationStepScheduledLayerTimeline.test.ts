import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationTwoHingeFixture} from '../fixtures/simulationStepComplex';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {createSimulationStepPathEvaluator,planSimulationStepPath} from '../../src/engine/simStepPath';
import {buildSimulationStepLayerTimeline,simulationStepLayerOrderAt} from '../../src/engine/simStepLayerTimeline';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';

type V=[number,number,number];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const point=(positions:ArrayLike<number>,v:number):V=>[positions[v*3],positions[v*3+1],positions[v*3+2]];

/** Real three-panel material strip. At 100% both outer panels completely cover
 * the fixed centre panel. An 80% delayed start splits both full half turns into
 * partial phases; it must not remove the resulting three contact relations. */
function scheduledStrip(sign:1|-1,mirrored:boolean,delay:number,precrease=false){
  const original=simulationTwoHingeFixture().fold,fold={...original,
    vertices_coords:original.vertices_coords.map(([x,y])=>[mirrored?-x:x,y]),
    edges_assignment:original.edges_assignment.map(a=>sign===1?a:a==='M'?'V':a==='V'?'M':a),
    edges_foldAngle:original.edges_foldAngle.map(a=>sign*a)};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared),source=prepared.triangleSourceFaces!;
  const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),
    fixedVertices:[...new Set(prepared.facesVertices.flatMap((vertices,t)=>source[t]===1?vertices:[]))],
    ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:precrease?0:c.targetAngle,...(precrease&&c.targetAngle!==0?{viaAngle:c.targetAngle}:{})}))};
  const [a,b]=animation.ranges.filter(r=>r.toAngle!==0||r.viaAngle!==undefined),duration=1+delay;
  animation.timings=[{edge:a.edge,start:0,end:1/duration},{edge:b.edge,start:delay/duration,end:1}];
  animation.motion=planSimulationStepPath(prepared,animation);
  return {prepared,animation};
}

for(const sign of [1,-1] as const)for(const mirrored of [false,true])test(`partial scheduled contact keeps actual material approach with MV ${sign} and mirrored=${mirrored}`,()=>{
  for(const delay of [.2,.8,.999]){
    const {prepared,animation}=scheduledStrip(sign,mirrored,delay),timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:3,faceOrders:[]});
    const path=createSimulationStepPathEvaluator(prepared,animation,animation.motion!),final=path.mechanism.evaluateAngles(path.angles(1)).positions;
    const finishA=animation.timings![0].end,firstContact=timeline.find(f=>Math.abs(f.progress-finishA)<1e-12)!;
    assert.equal(firstContact.faceOrders.length,1,'the first completed flap acquires its contact even when the other hinge is at a partial angle');
    assert.ok(firstContact.faceOrders.some(([a,b])=>a===0&&b===1));
    assert.equal(timeline.at(-1)!.faceOrders.length,3,'the final three coincident real panels retain all three material pairs');
    const sourceVertices=[0,1,2].map(face=>[...new Set(prepared.facesVertices.flatMap((vertices,t)=>prepared.triangleSourceFaces![t]===face?vertices:[]))]);
    const centre=(positions:ArrayLike<number>,face:number):V=>[0,1,2].map(axis=>sourceVertices[face].reduce((s,v)=>s+positions[v*3+axis],0)/sourceVertices[face].length) as V;
    for(const [a,b,side] of timeline.at(-1)!.faceOrders){
      assert.ok(Math.hypot(...sub(centre(final,a),centre(final,b)))<1e-7,'the tested panels genuinely coincide within the immutable Float32 seed precision, without artificial thickness');
      const [u,v,w]=prepared.facesVertices.find((_,t)=>prepared.triangleSourceFaces![t]===b)!,normal=cross(sub(point(final,v),point(final,u)),sub(point(final,w),point(final,u)));
      const arrival=a===0&&b===1?finishA:1,before=path.mechanism.evaluateAngles(path.angles(arrival-1e-5)).positions;
      const gap=sub(centre(before,a),centre(before,b)),approach=normal.reduce((sum,n,i)=>sum+n*gap[i],0);
      assert.ok(Math.abs(approach)>1e-7,'this independently measured material approach has a definite side');
      assert.equal(Math.sign(approach),side,'the contact sign follows the actual arriving material, including opposite material normals');
    }
    assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,(finishA+1)/2),firstContact.faceOrders,'the completed first flap keeps its own order while the second moves');
    assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,finishA/2),[],'no future contact is applied to still separated panels');
    const saved=structuredClone(timeline);
    for(const progress of [1,.99,0,.7,1,finishA,.1,1])simulationStepLayerOrderAt(prepared,animation,timeline,progress);
    assert.deepEqual(timeline,saved,'seeking backwards does not mutate the recorded material order');
  }
});

test('delayed precreases record their genuine partial-phase apex contacts and remove them after unfolding',()=>{
  const {prepared,animation}=scheduledStrip(1,false,.8,true),timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:3,faceOrders:[]});
  for(let i=0;i<2;i++){
    const timing=animation.timings![i],apex=(timing.start+timing.end)/2,rows=simulationStepLayerOrderAt(prepared,animation,timeline,apex);
    assert.ok(rows.some(([a,b])=>a===i&&b===i+1),`precrease ${i+1} must have an actual contact at its own apex`);
  }
  assert.deepEqual(timeline.at(-1)!.faceOrders,[],'an unfolded strip does not retain contacts from either precrease');
  assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,.99),[]);
});
