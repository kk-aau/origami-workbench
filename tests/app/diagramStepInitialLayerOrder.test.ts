import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramSingleLayerCornerFixture} from '../fixtures/diagramStepAnimationScope';
import {recomputeFlatLayers} from '../../src/core/flatFold';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {polygonArea} from '../../src/core/geometry';
import {buildDiagramPoseFold} from '../../src/app/diagramFoldGeometry';

test('new material subfaces inherit the main drawing selected initial paper-side order',()=>{
  const {project,stepId}=diagramSingleLayerCornerFixture(),pose=project.steps[0].pose!;
  pose.result=recomputeFlatLayers(pose.result);assert.equal(pose.result.layers.status,'solved');
  const saved=structuredClone(project),clip=buildDiagramStepAnimation(project,stepId),initial=clip.initialGeometry!;
  assert.equal(initial.layers.status,'solved');assert.ok(initial.layers.faceOrders!.length>=2,'the new corner divides one parent into multiple material subfaces');
  const source=buildDiagramPoseFold(pose).graph,parents=clip.fold.faces_vertices!.map(face=>{
    const x=face.reduce((sum,v)=>sum+clip.fold.vertices_coords[v][0],0)/face.length;
    return source.faces_vertices!.findIndex(f=>(f.reduce((sum,v)=>sum+source.vertices_coords[v][0],0)/f.length>50)===(x>50));
  });
  for(const [a,b,sign] of initial.layers.faceOrders!){
    const row=pose.result.layers.faceOrders!.find(([first,second])=>first===parents[a]&&second===parents[b]);assert.ok(row);
    const p=Math.sign(polygonArea(pose.result.geometry.faces[row[1]].map(v=>pose.result.geometry.vertices[v]))),c=Math.sign(polygonArea(initial.geometry.faces[b].map(v=>initial.geometry.vertices[v])));
    assert.equal(sign,row[2]*p*c,'daughter order keeps the selected material normal, including reflected parents');
  }
  assert.deepEqual(project,saved,'mapping selected layer orders never writes into the drawing');
});
