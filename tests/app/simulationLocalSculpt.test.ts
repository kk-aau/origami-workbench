import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {simulationSculptSupports} from '../../src/engine/simSculpt';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';

const singleCrease={vertices_coords:[[0,0],[1,0],[2,0],[2,1],[1,1],[0,1]],
  edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],
  edges_assignment:['B','B','B','B','B','B','M'],edges_foldAngle:[null,null,null,null,null,null,-180],faces_vertices:[[0,1,4,5],[1,2,3,4]]};
type Mesh=Pick<PreparedOrigamiModel,'vertexCount'|'originalPositions'|'edgesVertices'|'facesVertices'>;
const point=(positions:ArrayLike<number>,index:number):[number,number,number]=>[positions[index*3],positions[index*3+1],positions[index*3+2]];
const triangle:Mesh={vertexCount:3,originalPositions:new Float32Array([0,0,0,1,0,0,0,0,1]),edgesVertices:[[0,1],[1,2],[2,0]],facesVertices:[[0,1,2]]};

test('six-vertex folded sheet uses a remote triangle at its current pose without moving source data',()=>{
  const {prepared}=prepareSimulationDocument(singleCrease),model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,{foldPercent:55,timeStepScale:.35});
  solver.step(500);
  const meshBefore=structuredClone(prepared),before=solver.capturePose(),supports=simulationSculptSupports(prepared,before.positions,0);
  assert.ok(supports);assert.equal(supports.length,3);assert.ok(supports.every(pin=>pin.index!==0));
  assert.ok(prepared.facesVertices.some(face=>face.length===3&&face.every(index=>supports.some(pin=>pin.index===index))));
  for(const pin of supports)assert.deepEqual(pin.position,point(before.positions,pin.index));
  assert.deepEqual(prepared,meshBefore);assert.deepEqual(solver.capturePose(),before);
  supports[0].position[0]+=1;
  assert.deepEqual(solver.capturePose(),before,'returned coordinates are owned copies');
});

test('all 72 vertices of the real ring have usable remote support without using folded-space proximity',()=>{
  const source=JSON.parse(fs.readFileSync(new URL('../fixtures/simulation-self-contact-default-ring.fold.json',import.meta.url),'utf8'));
  const {prepared}=prepareSimulationDocument(source),model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,{foldPercent:70,timeStepScale:.35,damping:.5});
  solver.step(400);
  assert.equal(prepared.vertexCount,72);
  const pose=solver.capturePose();
  for(let grab=0;grab<prepared.vertexCount;grab++){
    const original=simulationSculptSupports(prepared,model.originalPositions,grab),folded=simulationSculptSupports(prepared,pose.positions,grab);
    assert.ok(original);assert.ok(folded);assert.equal(folded.length,3);assert.ok(folded.every(pin=>pin.index!==grab));
    assert.deepEqual(folded.map(pin=>pin.index),original.map(pin=>pin.index));
    for(const pin of folded)assert.deepEqual(pin.position,point(pose.positions,pin.index));
  }
});

test('material edge lengths, rather than mesh hop count, determine the remote support',()=>{
  const mesh:Mesh={vertexCount:9,originalPositions:new Float32Array([0,0,0,.1,0,0,.2,0,0,.3,0,0,.3,0,.1,.4,0,.1,10,0,0,10,0,1,11,0,1]),
    edgesVertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,3],[0,6],[6,7],[7,8],[8,6]],facesVertices:[[3,4,5],[6,7,8]]};
  assert.deepEqual(simulationSculptSupports(mesh,mesh.originalPositions,0)?.map(pin=>pin.index),[6,7,8]);
});

test('existing pins remain untouched and a fully pinned support needs no additional pins',()=>{
  const {prepared}=prepareSimulationDocument(singleCrease),current=prepared.positions,supports=simulationSculptSupports(prepared,current,0)!;
  const existing=[structuredClone(supports[1])],before=structuredClone(existing);
  const added=simulationSculptSupports(prepared,current,0,existing);
  assert.ok(added);assert.equal(added.length,2);assert.ok(added.every(pin=>pin.index!==existing[0].index));assert.deepEqual(existing,before);
  assert.deepEqual(simulationSculptSupports(prepared,current,0,supports),[]);
});

test('an isolated triangle is not frozen through all neighbours, but deliberate local pins remain usable',()=>{
  assert.equal(simulationSculptSupports(triangle,triangle.originalPositions,0),null);
  assert.deepEqual(simulationSculptSupports(triangle,triangle.originalPositions,0,[{index:1,position:[1,0,0]}]),[]);
  assert.equal(simulationSculptSupports(triangle,triangle.originalPositions,0,[{index:0,position:[0,0,0]}]),null);
});

test('collapsed or collinear support faces are rejected instead of creating a misleading anchor',()=>{
  const {prepared}=prepareSimulationDocument(singleCrease),collapsed=new Float32Array(prepared.vertexCount*3),collinear=Float32Array.from(collapsed,(_,i)=>i%3===0?i:0);
  assert.equal(simulationSculptSupports(prepared,collapsed,0),null);
  assert.equal(simulationSculptSupports(prepared,collinear,0),null);
  assert.equal(simulationSculptSupports(prepared,new Float32Array([NaN]),0),null);
  assert.equal(simulationSculptSupports(prepared,prepared.positions,-1),null);
});

test('disconnected paper is held at its own current pose and cannot masquerade as a support',()=>{
  const {prepared}=prepareSimulationDocument(singleCrease),base=prepared.vertexCount;
  const rest=new Float32Array([...prepared.originalPositions,10,0,0,11,0,0,10,0,1]);
  const mesh:Mesh={vertexCount:base+3,originalPositions:rest,edgesVertices:[...prepared.edgesVertices,[base,base+1],[base+1,base+2],[base+2,base]],facesVertices:[...prepared.facesVertices,[base,base+1,base+2]]};
  const current=Float32Array.from(rest,(value,i)=>value+(i%3===1?.3:0)),supports=simulationSculptSupports(mesh,current,0)!;
  assert.equal(supports.length,6);
  for(let index=base;index<base+3;index++)assert.deepEqual(supports.find(pin=>pin.index===index)?.position,point(current,index));
  assert.equal(simulationSculptSupports(mesh,current,base),null,'other component cannot support an isolated triangle');
  assert.equal(simulationSculptSupports(mesh,current,base,[{index:0,position:point(current,0)}]),null,'unrelated user pin cannot support it either');
  const withLocalPin=simulationSculptSupports(mesh,current,base,[{index:base+1,position:point(current,base+1)}]);
  assert.ok(withLocalPin);assert.equal(withLocalPin.length,base);assert.ok(withLocalPin.every(pin=>pin.index<base));
});

test('a second sculpt uses the last edited pose and preserves original paper targets',()=>{
  const {prepared}=prepareSimulationDocument(singleCrease),model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,{foldPercent:45,timeStepScale:.35});
  solver.step(500);
  const first=solver.capturePose(),firstSupports=simulationSculptSupports(prepared,first.positions,0)!;
  solver.restorePose({...first,pins:firstSupports});solver.setMaterial({creaseStiffness:0});
  const target=point(first.positions,0);target[1]+=.08;solver.setVertexConstraint(0,target);solver.step(300);
  const during=solver.capturePose();
  assert.deepEqual(point(during.positions,0),point(new Float32Array(target),0),'the grabbed vertex follows the edit');
  for(const pin of firstSupports)assert.deepEqual(point(during.positions,pin.index),pin.position,'remote support never follows the grabbed vertex');
  solver.setVertexConstraint(0,null);const edited=solver.capturePose();solver.restorePose({...edited,pins:[]});
  const final=solver.capturePose(),next=simulationSculptSupports(prepared,final.positions,3);
  assert.ok(next);for(const pin of next)assert.deepEqual(pin.position,point(final.positions,pin.index));
  assert.ok(final.positions.some((value,i)=>Math.abs(value-first.positions[i])>.01));
  assert.deepEqual(model.originalPositions,new OrigamiModel(prepareSimulationDocument(singleCrease).prepared).originalPositions);
  assert.equal(solver.options.foldPercent,45);
});
