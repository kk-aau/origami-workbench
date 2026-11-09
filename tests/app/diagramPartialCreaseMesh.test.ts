import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDiagramFold,distance} from '../../src/core/geometry';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {fixture} from '../fixtures/diagramPartialCrease';
import {partialCreaseDiagramProjectFixture} from '../fixtures/partialCreaseDiagramProject';
import {normalizeDiagramProjectCP} from '../../src/app/diagramCP';

for(const name of ['single','network'] as const)test(`app partial-crease ${name} preserves one real material face through import and preview`,()=>{
  const {project,stepId}=fixture(name),saved=structuredClone(project),loaded=importDiagramProject(exportDiagramProject(project)),loadedBefore=structuredClone(loaded),clip=buildDiagramStepAnimation(loaded,stepId),{prepared}=prepareSimulationDocument(clip.fold);
  assert.deepEqual(project,saved);assert.deepEqual(loaded,loadedBefore);
  assert.equal(normalizeDiagramProjectCP(loaded).changed,false,'the fixture is importable through the same CP cleanup as the app');
  assert.deepEqual(loaded.states,project.states);assert.deepEqual(loaded.steps[0].foldLink,project.steps[0].foldLink);
  assert.deepEqual(loaded.steps[0].pose!.result.geometry.vertices,project.steps[0].pose!.result.geometry.vertices);
  assert.ok(clip.animation.flexRequest);assert.equal(clip.animation.fixedVertices.length,3);
  assert.equal(prepared.sourceFaceCount,1);assert.deepEqual(new Set(prepared.triangleSourceFaces),new Set([0]));
  assert.equal(clip.initialGeometry!.geometry.faces.length,1);assert.equal(clip.finalGeometry!.geometry.faces.length,1);
  for(const state of project.states)assert.equal(buildDiagramFold(state.doc).graph.faces_vertices!.length,1);
  assert.ok(clip.animation.ranges.filter(r=>r.viaAngle!==undefined).every(r=>r.fromAngle===0&&r.toAngle===0));
  assert.deepEqual(clip.initialGeometry!.geometry.vertices,clip.finalGeometry!.geometry.vertices);
});

test('a short crease with two interior ends is rejected without changing the saved drawing',()=>{
  const {project,stepId}=fixture('interior'),saved=structuredClone(project);
  assert.throws(()=>buildDiagramStepAnimation(project,stepId),/两个纸内端点/);
  assert.deepEqual(project,saved);
});

test('a user-selected stationary patch stays local to the selected side without pinning its entire source face',()=>{
  const {project,stepId}=partialCreaseDiagramProjectFixture({activeRoutes:[0],fixed:[87,86]}),clip=buildDiagramStepAnimation(project,stepId);
  assert.equal(clip.animation.fixedVertices.length,3);
  const pins=clip.animation.fixedVertices.map(v=>clip.fold.vertices_coords[v]);
  const center:[number,number]=[pins.reduce((s,p)=>s+p[0],0)/3,pins.reduce((s,p)=>s+p[1],0)/3];
  assert.ok(center[0]>50&&center[1]>50);assert.ok(distance(center,[87,86])<distance([50,50],[87,86])/2);
  assert.equal(clip.initialGeometry!.geometry.faces.length,1);
});
