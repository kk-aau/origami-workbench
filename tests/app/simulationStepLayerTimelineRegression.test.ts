import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {planSimulationStepPath,createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';
import {buildSimulationStepLayerTimeline,simulationStepLayerOrderAt} from '../../src/engine/simStepLayerTimeline';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {inspectSimulationStepInitialContactOrder} from '../../src/engine/simStepContactOrder';
import {createSimulationStepTangentProjector} from '../../src/engine/simStepCollision';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';

/** Four successive complete folds of a five-panel strip. Older hinges stay
 * at 180 degrees, so the third and fourth steps move genuine old paper stacks
 * with alternating front/back material normals. */
function strip(sign:1|-1=1,mirrored=false){
  const count=5,vertices=Array.from({length:(count+1)*2},(_,i)=>[(i%(count+1))*(mirrored?-1:1),Math.floor(i/(count+1))]);
  const faces=Array.from({length:count},(_,i)=>[i,i+1,i+count+2,i+count+1]),edges:Array<[number,number]>=[],assignments:string[]=[],angles:number[]=[];
  for(let i=0;i<count;i++){edges.push([i,i+1],[i+count+1,i+count+2]);assignments.push('B','B');angles.push(0,0);}
  edges.push([0,count+1],[count,2*count+1]);assignments.push('B','B');angles.push(0,0);
  for(let i=1;i<count;i++){edges.push([i,i+count+1]);assignments.push(sign===1?'V':'M');angles.push(sign*180);}
  const fold={vertices_coords:vertices,faces_vertices:faces,edges_vertices:edges,edges_assignment:assignments,edges_foldAngle:angles},{prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const make=(step:number,initialPositions:readonly number[],precrease=false):SimulationStepAnimation=>({version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:[...initialPositions],
    fixedVertices:prepared.fold.vertices_coords.flatMap((p,v)=>Math.abs(p[0])>=step?[v]:[]),
    ranges:prepared.creaseParams.map(c=>{
      const [v]=prepared.edgesVertices[c.edge],x=Math.abs(prepared.fold.vertices_coords[v][0]),hinge=prepared.edgesAssignment[c.edge]==='V'||prepared.edgesAssignment[c.edge]==='M';
      return {edge:c.edge,fromAngle:hinge&&x<step?sign*180:0,toAngle:hinge&&(x<step||x===step&&!precrease)?sign*180:0,...(hinge&&x===step&&precrease?{viaAngle:sign*180}:{})};
    })});
  return {prepared,make,initial:Array.from(model.originalPositions),count};
}

function checkFinalApproach(prepared:ReturnType<typeof strip>['prepared'],animation:SimulationStepAnimation,orders:Array<[number,number,number]>){
  const phase=animation.motion!.phases.at(-1)!,path=createSimulationStepPathEvaluator(prepared,animation,animation.motion!),seed=path.mechanism.evaluateAngles(phase.toAngles).positions;
  const reverse:SimulationStepAnimation={...animation,initialPositions:Array.from(seed),ranges:prepared.creaseParams.map((c,i)=>({edge:c.edge,fromAngle:phase.toAngles[i],toAngle:phase.fromAngles[i]}))};
  reverse.motion={...animation.motion!,phases:[{...phase,start:0,end:1,fromAngles:[...phase.toAngles],toAngles:[...phase.fromAngles]}],knots:[{progress:0,angles:[...phase.toAngles]},{progress:1,angles:[...phase.fromAngles]}]};
  // This independently constructed single reverse phase is not the original
  // multi-batch instruction, so its forward scheduling metadata is inapplicable.
  delete reverse.motion.batches;if(reverse.motion.method==='batched')reverse.motion.method='simultaneous';
  const reversedPath=createSimulationStepPathEvaluator(prepared,reverse,reverse.motion),mechanism=reversedPath.mechanism;
  const projector=createSimulationStepTangentProjector({initialPositions:mechanism.seedPositions,vertexBodies:mechanism.vertexBodies,fromAngles:mechanism.fromAngles,bodies:mechanism.components.map(body=>({parent:body.parent,crease:body.parentCrease,sign:body.rotationSign,...(body.parentCrease===null?{}:{axisVertices:prepared.edgesVertices[prepared.creaseParams[body.parentCrease].edge]})}))},reverse.motion.phases);
  const result=inspectSimulationStepInitialContactOrder(prepared,reversedPath,{sourceFaceCount:5,faceOrders:orders},{initialSide:projector.initialContactSide});
  assert.equal(result.status,'clear','every actual terminal overlap has an order consistent with its continuous material approach');
  assert.equal(result.checkedPairs,result.overlapPairs);assert.deepEqual(result.violations,[]);return seed;
}

test('third and fourth consecutive strip folds keep complete contact orders across both MV signs and reflected material winding',()=>{
  for(const sign of [1,-1] as const)for(const mirrored of [false,true]){
    const fixture=strip(sign,mirrored),{prepared}=fixture;let positions=fixture.initial,previous:Array<[number,number,number]>=[];
    for(let step=1;step<fixture.count;step++){
      const animation=fixture.make(step,positions);animation.motion=planSimulationStepPath(prepared,animation);
      const timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:fixture.count,faceOrders:previous}),final=timeline.at(-1)!.faceOrders;
      assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,0),previous);
      assert.deepEqual(simulationStepLayerOrderAt(prepared,animation,timeline,1),final);
      const seed=checkFinalApproach(prepared,animation,final);
      if(step===4){
        assert.equal(final.length,10,'the final five coincident source faces retain every material pair');
        const normals=prepared.facesVertices.map(([a,b,c])=>{const ab=[0,1,2].map(k=>seed[b*3+k]-seed[a*3+k]),ac=[0,1,2].map(k=>seed[c*3+k]-seed[a*3+k]);return Math.sign(ab[2]*ac[0]-ab[0]*ac[2]);});
        assert.ok(normals.includes(1)&&normals.includes(-1),'the contact proof includes both original material-side orientations');
      }
      const before=structuredClone(timeline),seek=[.99,1,.001,0,1,.5,1],results=seek.map(p=>simulationStepLayerOrderAt(prepared,animation,timeline,p));
      assert.deepEqual(results[1],results[4]);assert.deepEqual(results[4],results[6]);assert.deepEqual(timeline,before,'reverse seeking cannot rewrite or reorder timeline contacts');
      previous=final;positions=Array.from(seed);
    }
  }
});

test('a fourth-step precrease reaches the new contact then unfolds without replacing its older stack order',()=>{
  const fixture=strip(),{prepared}=fixture;let positions=fixture.initial,previous:Array<[number,number,number]>=[];
  for(let step=1;step<=3;step++){
    const animation=fixture.make(step,positions);animation.motion=planSimulationStepPath(prepared,animation);
    const timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:fixture.count,faceOrders:previous});previous=timeline.at(-1)!.faceOrders;
    positions=Array.from(createSimulationStepPathEvaluator(prepared,animation,animation.motion).mechanism.evaluateAngles(animation.motion.phases.at(-1)!.toAngles).positions);
  }
  const animation=fixture.make(4,positions,true);animation.motion=planSimulationStepPath(prepared,animation);
  const timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:fixture.count,faceOrders:previous}),path=createSimulationStepPathEvaluator(prepared,animation,animation.motion);
  assert.deepEqual(timeline.map(frame=>frame.progress),[0,.5,1]);assert.equal(timeline[1].faceOrders.length,10);
  checkFinalApproach(prepared,animation,timeline.at(-1)!.faceOrders);
  for(let i=0;i<positions.length;i++)assert.ok(Math.abs(path.evaluate(1)[i]-positions[i])<1e-7,'a precrease returns the actual original folded material pose');
  for(const progress of [.01,.49,.51,.99])for(const row of simulationStepLayerOrderAt(prepared,animation,timeline,progress))assert.ok(row[0]<4&&row[1]<4,'old rigid-stack rows persist; the departing fourth hinge does not impose a future contact');
});
