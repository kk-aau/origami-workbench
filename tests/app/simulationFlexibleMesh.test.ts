import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {refinePreparedSimulationMesh,simulationInputMeshFold,type SimulationMeshProvenance} from '../../src/engine/simFlexibleMesh';
import {FLEXIBLE_PAPER_SOLVER_SETTINGS,DEFAULT_SIMULATION_SOLVER_SETTINGS} from '../../src/engine/simSettings';
import {validateSimulationPose,type SimulationPose} from '../../src/engine/simPose';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {blankDoc} from '../../src/app/state';
import {applyDiagramSimulationAngles,diagramSimulationGraph} from '../../src/app/diagramSimulationAngles';
import {holesMaterial,mergeHoleRing} from '../fixtures/materialHoles';
import {materialDoc} from '../fixtures/materialModel';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {cutMaterialEdges} from '../../src/core/materialCut';
import {inspectMaterialTopology} from '../../src/core/materialTopology';

function source(){const doc=blankDoc('细分纸张',100,100);doc.segments.push({id:'crease',a:[50,0],b:[50,100],assignment:'V',angle:180});return {doc,fold:diagramSimulationGraph(doc)};}
const area=(p:ReturnType<typeof prepareSimulationDocument>['prepared'])=>p.facesVertices.reduce((sum,[a,b,c])=>{const coords=p.fold.vertices_coords,u=coords[b].map((x,k)=>x-coords[a][k]),v=coords[c].map((x,k)=>x-coords[a][k]);return sum+Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;},0);

test('conforming refinement preserves paper area, real creases and source material without inventing scored diagonals',()=>{
  const {fold}=source(),saved=structuredClone(fold),base=prepareSimulationDocument(fold).prepared;
  for(const mesh of ['standard','fine'] as const){
    const prepared=prepareSimulationDocument(fold,{mesh}).prepared,provenance=prepared.fold.zhezhi_flexible_mesh as SimulationMeshProvenance;
    assert(prepared.vertexCount>base.vertexCount);assert.equal(area(prepared),area(base));
    const length=prepared.edgesVertices.reduce((s,[a,b],e)=>s+(prepared.edgesAssignment[e]==='V'?Math.hypot(...prepared.fold.vertices_coords[a].map((v,k)=>v-prepared.fold.vertices_coords[b][k])):0),0);
    assert.equal(length,100);assert.equal(prepared.sourceFaceCount,2);
    prepared.edgesVertices.forEach((_,e)=>{assert.equal(prepared.edgesFaces[e].length,prepared.edgesAssignment[e]==='B'?1:2);if(provenance.edgeSourceEdges[e]===null){assert.equal(prepared.edgesAssignment[e],'F');assert.equal(prepared.edgesFoldAngle[e],0);assert.equal(new Set(prepared.edgesFaces[e].map(f=>prepared.triangleSourceFaces![f])).size,1);}});
    for(let v=0;v<prepared.vertexCount;v++)for(let k=0;k<3;k++)assert(provenance.vertexWeights[v].reduce((s,[i,w])=>s+base.fold.vertices_coords[i][k]*w,0)===prepared.fold.vertices_coords[v][k]);
    assert.deepEqual(prepareSimulationDocument(simulationInputMeshFold(prepared)).prepared.positions,prepared.positions);
  }
  assert.deepEqual(fold,saved);
});

test('refinement preserves holes and every separate indexed slit bank',()=>{
  const hole=holesMaterial(mergeHoleRing().result.doc).graph,base=prepareSimulationDocument(hole).prepared,refined=refinePreparedSimulationMesh(base,1);
  assert.equal(area(refined),80000);
  for(const [a,b,c]of refined.facesVertices){const p=[a,b,c].map(v=>refined.fold.vertices_coords[v]),x=p.reduce((s,v)=>s+v[0],0)/3,y=-p.reduce((s,v)=>s+v[2],0)/3;assert(!(x>100&&x<200&&y>100&&y<200),'the hole must not acquire paper');}
  const points:[number,number][]=[[0,0],[100,0],[100,100],[0,100]],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0]];
  const sheet=materialDoc(materialCanonical(points,edges,edges.map(()=>'B'),edges.map(()=>0),[[0,1,2,3]],[[0,1,2,3]]),points);
  const drawn=editMaterialFaces(sheet,{kind:'material-face-curves',face:0,curves:[{kind:'bezier-path',assignment:'M',nodes:[{point:[25,50],incoming:[25,50],outgoing:[25,50]},{point:[75,50],incoming:[75,50],outgoing:[75,50]}]}],deviation:1,fixedPoint:[10,10],cpOnly:true});
  const cut=cutMaterialEdges(drawn.doc,{kind:'material-cut',segmentIds:drawn.insertedIds!}).doc,material=inspectMaterialTopology(cut);assert(material.ok);
  const weak=prepareSimulationDocument(material.graph).prepared,mesh=refinePreparedSimulationMesh(weak,1),provenance=mesh.fold.zhezhi_flexible_mesh as SimulationMeshProvenance;
  assert.equal(area(mesh),10000);assert.equal(mesh.edgesAssignment.filter(a=>a==='B').length,weak.edgesAssignment.filter(a=>a==='B').length*2);
  const banks=weak.edgesVertices.flatMap((pair,e)=>weak.edgesVertices.some((p,i)=>i<e&&p[0]===pair[0]&&p[1]===pair[1])?[e]:[]);assert(banks.length>0);
  for(const bank of banks){const other=weak.edgesVertices.findIndex((p,e)=>e!==bank&&p[0]===weak.edgesVertices[bank][0]&&p[1]===weak.edgesVertices[bank][1]);const descendants=(e:number)=>mesh.edgesVertices.flatMap((pair,i)=>provenance.edgeSourceEdges[i]===e?pair:[]).filter(v=>v>=weak.vertexCount);assert.notDeepEqual(descendants(bank),descendants(other),'separate banks may not share a new midpoint');}
  assert.deepEqual(prepareSimulationDocument(simulationInputMeshFold(mesh)).prepared.edgesFaces,mesh.edgesFaces);
});

test('unavailable resolution rejects atomically instead of silently removing triangles or lowering quality',()=>{
  const {fold}=source(),base=prepareSimulationDocument(fold).prepared,before=structuredClone(base.fold);
  assert.throws(()=>refinePreparedSimulationMesh(base,3,{maxVertices:12,maxTriangles:100}),/超过当前模拟容量/);
  assert.throws(()=>prepareSimulationDocument(fold,{mesh:'unknown' as never}),/精细度无效/);
  assert.deepEqual(base.fold,before);
});

test('saved refined poses retain their CP, exact topology and pins and reject wrong resolution',()=>{
  const {fold}=source(),prepared=prepareSimulationDocument(fold,{mesh:'standard'}).prepared,model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,FLEXIBLE_PAPER_SOLVER_SETTINGS);
  const index=prepared.vertexCount-1;solver.setVertexConstraint(index,[...model.positions.slice(index*3,index*3+3)] as [number,number,number]);
  const pose:SimulationPose={version:1,source:fold,solver:solver.capturePose(),mesh:'standard',progress:0,settings:{...FLEXIBLE_PAPER_SOLVER_SETTINGS},view:{yaw:.5,pitch:.7,zoom:1}};solver.dispose();
  const serialized=JSON.parse(JSON.stringify(pose));assert.deepEqual(validateSimulationPose(serialized),serialized);
  assert.throws(()=>validateSimulationPose({...pose,mesh:'original'}),/不一致/);assert.throws(()=>validateSimulationPose({...pose,mesh:'fine'}),/不一致/);assert.throws(()=>validateSimulationPose({...pose,mesh:'bad'}),/格式无效/);
});

test('applying angles collects all refined sub-hinges while preserving the actual source CP and rejecting curved crease disagreement',()=>{
  const {doc,fold}=source(),prepared=prepareSimulationDocument(fold,{mesh:'standard'}).prepared,model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,FLEXIBLE_PAPER_SOLVER_SETTINGS),snapshot=solver.capturePose();solver.dispose();
  prepared.fold.vertices_coords.forEach(([x,y,z],v)=>{const position=x>50?[50,y+x-50,z]:[x,y,z];position.forEach((value,k)=>{const i=v*3+k;snapshot.displacements[i]=Math.fround(value-model.originalPositions[i]);snapshot.positions[i]=Math.fround(model.originalPositions[i]+snapshot.displacements[i]);});});
  prepared.creaseParams.forEach((c,i)=>{if(prepared.edgesAssignment[c.edge]==='V')snapshot.creaseAngles[i]=Math.PI/2;});
  const pose:SimulationPose={version:1,source:fold,solver:snapshot,mesh:'standard',progress:.5,settings:{...FLEXIBLE_PAPER_SOLVER_SETTINGS},view:{yaw:0,pitch:0,zoom:1}};
  const before=structuredClone(doc),result=applyDiagramSimulationAngles(doc,pose);assert.equal(result.doc.segments.find(s=>s.assignment==='V')!.angle,90);assert.equal(result.doc.segments.length,doc.segments.length);assert.deepEqual(doc,before);
  const bent=structuredClone(pose),vertex=prepared.facesVertices[prepared.creaseParams.find(c=>prepared.edgesAssignment[c.edge]==='V')!.face2].find(v=>prepared.fold.vertices_coords[v][0]>50)!;
  bent.solver.displacements[vertex*3]+=5;bent.solver.positions[vertex*3]+=5;
  assert.throws(()=>applyDiagramSimulationAngles(doc,bent),/同一折痕发生弯曲/);
});

test('flexible paper preset reduces bending resistance without weakening lengths, scored hinges or in-plane shape',()=>{
  assert(FLEXIBLE_PAPER_SOLVER_SETTINGS.panelStiffness<DEFAULT_SIMULATION_SOLVER_SETTINGS.panelStiffness);
  for(const key of ['axialStiffness','faceStiffness','creaseStiffness']as const)assert.equal(FLEXIBLE_PAPER_SOLVER_SETTINGS[key],DEFAULT_SIMULATION_SOLVER_SETTINGS[key]);
});

test('a finite scored crease bends refined paper locally while retaining finite, low-strain material',()=>{
  const points:[number,number][]=[[0,0],[100,0],[100,100],[0,100]],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0]],sheet=materialDoc(materialCanonical(points,edges,edges.map(()=>'B'),edges.map(()=>0),[[0,1,2,3]],[[0,1,2,3]]),points);
  const doc=editMaterialFaces(sheet,{kind:'material-face-curves',face:0,curves:[{kind:'bezier-path',assignment:'M',nodes:[{point:[25,50],incoming:[25,50],outgoing:[25,50]},{point:[75,50],incoming:[75,50],outgoing:[75,50]}]}],deviation:1,fixedPoint:[10,10],cpOnly:true}).doc;
  const material=inspectMaterialTopology(doc);assert(material.ok);
  const prepared=prepareSimulationDocument(material.graph,{mesh:'standard'}).prepared,model=new OrigamiModel(prepared),solver=new ReferenceSolver(model,{...FLEXIBLE_PAPER_SOLVER_SETTINGS,foldPercent:25});
  try{
    solver.step(2500);const pose=solver.capturePose(),provenance=prepared.fold.zhezhi_flexible_mesh as SimulationMeshProvenance;
    assert(pose.positions.every(Number.isFinite));
    assert(prepared.creaseParams.some((c,i)=>provenance.edgeSourceEdges[c.edge]===null&&Math.abs(pose.creaseAngles[i])>.04),'curvature must be real bending across temporary support edges');
    assert((solver.readDiagnostics().maxEdgeStrain??Infinity)<.1,'flexible paper must not act as stretched rubber');
    assert(prepared.edgesAssignment.filter(kind=>kind==='M').length>1,'the short scored crease must survive subdivision');
  }finally{solver.dispose();}
});
