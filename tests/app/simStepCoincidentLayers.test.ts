import test from 'node:test';
import assert from 'node:assert/strict';
import {findSimulationStepCoincidentLayers} from '../../src/engine/simStepCoincidentLayers';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {planSimulationStepDynamic,validateSimulationStepDynamicMotion,createSimulationStepDynamicEvaluator} from '../../src/engine/simStepDynamic';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';

function foldedFlaps() {
  // The first two triangles fold back onto each other about edge 0. The
  // two outboard flaps attach separately along oppositely directed axes.
  const mesh={vertexCount:6,facesVertices:[[0,1,2],[1,0,3],[2,1,4],[1,3,5]],
    edgesVertices:[[0,1],[1,2],[3,1]] as [number,number][],
    creaseParams:[{edge:0,face1:0,face2:1},{edge:1,face1:0,face2:2},{edge:2,face1:1,face2:3}]};
  const animation:SimulationStepAnimation={version:1,sourceSignature:'folded flaps',fixedVertices:[0,1,2],
    initialPositions:[0,0,0, 1,0,0, 0,1,0, 0,1,0, 1,1,0, 1,1,0],
    ranges:[{edge:0,fromAngle:180,toAngle:180},{edge:1,fromAngle:0,toAngle:90},{edge:2,fromAngle:0,toAngle:-90}]};
  return {mesh,animation};
}

test('signed world-space hinge motion carries coincident layers, including a second hinge beyond the first',()=>{
  const {animation,mesh}=foldedFlaps();
  mesh.facesVertices.push([4,1,6],[1,5,7]);mesh.vertexCount+=2;
  mesh.edgesVertices.push([1,4],[5,1]);
  mesh.creaseParams.push({edge:3,face1:2,face2:4},{edge:4,face1:3,face2:5});
  animation.initialPositions.push(2,1,0,2,1,0);
  animation.ranges.push({edge:3,fromAngle:0,toAngle:-45},{edge:4,fromAngle:0,toAngle:45});
  const {faceBodies,vertexGroups}=findSimulationStepCoincidentLayers(mesh,animation);
  assert.deepEqual(faceBodies,[0,0,2,2,4,4]);
  assert.deepEqual(vertexGroups,[[2,3],[4,5],[6,7]]);
});

test('separate material, mismatched physical turns, delays, excursions and a real depth gap remain independent',()=>{
  function confirmUnmatched(edit:(fixture:ReturnType<typeof foldedFlaps>)=>void){
    const fixture=foldedFlaps();edit(fixture);
    const {vertexGroups}=findSimulationStepCoincidentLayers(fixture.mesh,fixture.animation);
    assert.ok(!vertexGroups.some(g=>g.includes(4)&&g.includes(5)));
  }
  confirmUnmatched(({mesh})=>{mesh.creaseParams.shift();});
  confirmUnmatched(({animation})=>{animation.ranges[2].toAngle=90;});
  confirmUnmatched(({animation})=>{animation.timings=[{edge:2,start:.2,end:1}];});
  confirmUnmatched(({animation})=>{animation.ranges[2].viaAngle=-80;});
  confirmUnmatched(({animation})=>{animation.initialPositions[3*3+2]=1e-9;});
  confirmUnmatched(({animation})=>{animation.ranges[0].viaAngle=90;});
  confirmUnmatched(({animation})=>{animation.materialMode='bendable';});
  confirmUnmatched(({animation})=>{
    animation.motion={version:1,method:'sequential',maxClosureResidual:0,knots:[],phases:[
      {start:0,end:.5,fromAngles:[180,0,0],toAngles:[180,90,0],kind:'linear'},
      {start:.5,end:1,fromAngles:[180,90,0],toAngles:[180,90,-90],kind:'linear'},
    ]};
  });
});

test('complete boundary matches through opposite triangulations, partial faces share just the material motion and vertices',()=>{
  const {mesh,animation}=foldedFlaps();
  // Triangulate a square on each carrier, using opposite diagonals.
  mesh.facesVertices.push([1,6,4],[3,7,5]);
  mesh.facesVertices[3]=[3,1,7];
  mesh.vertexCount+=2;animation.initialPositions.push(2,0,0,2,0,0);
  mesh.edgesVertices.push([1,4],[3,7]);
  mesh.creaseParams.push({edge:3,face1:2,face2:4},{edge:4,face1:3,face2:5});
  animation.ranges.push({edge:3,fromAngle:0,toAngle:0},{edge:4,fromAngle:0,toAngle:0});
  const sources=[0,1,2,3,2,3];
  const same=findSimulationStepCoincidentLayers({...mesh,triangleSourceFaces:sources},animation);
  assert.equal(same.faceBodies[0],same.faceBodies[1]);
  assert.equal(same.faceBodies[2],same.faceBodies[3]);
  assert.deepEqual(same.vertexGroups,[[2,3],[4,5],[6,7]]);
  sources[5]=4;
  const split=findSimulationStepCoincidentLayers({...mesh,triangleSourceFaces:sources},animation);
  assert.equal(split.faceBodies[2],split.faceBodies[3]);
  assert.equal(split.faceBodies[2],split.faceBodies[4]);
  assert.deepEqual(split.vertexGroups,[[2,3],[4,5],[6,7]]);
});

test('a numerical fold integrates two and three stacked layers together and rejects a recording that separates them',()=>{
  // Accordion-fold a rectangular sheet into overlapping strips. Each strip
  // then bends 60° about the same centre line, alternating the CP sign.
  for(const layers of [2,3]){
    const points:number[][]=[],edges:[number,number][]=[],angles:number[]=[],faces:number[][]=[];
    const vertex=(x:number,y:number)=>3*y+x;
    function edge(a:number,b:number,angle:number){edges.push([a,b]);angles.push(angle);}
    for(let y=0;y<=layers;y++){
      for(let x=0;x<3;x++)points.push([x,y]);
      for(let x=0;x<2;x++){
        edge(vertex(x,y),vertex(x+1,y),y===0||y===layers?0:y%2?180:-180);
        if(y<layers)faces.push([vertex(x,y),vertex(x+1,y),vertex(x+1,y+1),vertex(x,y+1)]);
      }
    }
    for(let y=0;y<layers;y++)for(let x=0;x<3;x++)edge(vertex(x,y),vertex(x,y+1),x===1?(y%2?-60:60):0);
    const fold={vertices_coords:points,edges_vertices:edges,edges_assignment:angles.map(a=>a===0?'B':a>0?'V':'M'),edges_foldAngle:angles,faces_vertices:faces};
    const original=structuredClone(fold),{prepared}=prepareSimulationDocument(fold);
    const topology=structuredClone({indices:prepared.indices,edges:prepared.edgesVertices,triangles:prepared.facesVertices,sources:prepared.triangleSourceFaces});
    const initialPositions=Array.from(new OrigamiModel(prepared).originalPositions);
    const rows=[initialPositions[2],initialPositions[3*vertex(0,1)+2]];
    for(let v=0;v<prepared.vertexCount;v++)initialPositions[3*v+2]=rows[Math.floor(v/3)%2];
    const animation:SimulationStepAnimation={version:1,sourceSignature:'stacked strips',initialPositions,
      fixedVertices:[0,1,3],collisionPolicy:'allow',motionPolicy:'allow-dynamic',ranges:prepared.creaseParams.map(c=>({
        edge:c.edge,fromAngle:Math.abs(c.targetAngle)===180?c.targetAngle:0,toAngle:c.targetAngle,
      }))};
    const {faceBodies,vertexGroups}=findSimulationStepCoincidentLayers(prepared,animation);
    assert.equal(new Set(faceBodies).size,2);
    assert.equal(faceBodies.filter(body=>body===faceBodies[0]).length,layers);
    const motion=planSimulationStepDynamic(prepared,animation,{steps:32,iterationsPerStep:200,finalIterations:480});
    assert.equal(motion.mergedLayers,true);
    assert.ok(motion.endAngleError<.01);
    const playback=createSimulationStepDynamicEvaluator(prepared,animation,motion);
    assert.ok(playback.evaluate(.55).some((n,i)=>Math.abs(n-initialPositions[i])>.05));
    for(const pose of [...motion.keyframes.map(frame=>frame.positions),playback.evaluate(.367),playback.evaluate(.793)]){
      for(const group of vertexGroups)for(const v of group.slice(1))for(let axis=0;axis<3;axis++){
        assert.equal(pose[3*v+axis],pose[3*group[0]+axis]);
      }
    }
    assert.deepEqual(fold,original);
    assert.deepEqual({indices:prepared.indices,edges:prepared.edgesVertices,triangles:prepared.facesVertices,sources:prepared.triangleSourceFaces},topology);
    const broken=structuredClone(motion);
    broken.keyframes[10].positions[3*vertex(2,2)+1]+=.001;
    assert.throws(()=>validateSimulationStepDynamicMotion(prepared,animation,broken),/合并纸层轨迹不一致/);
  }
});
