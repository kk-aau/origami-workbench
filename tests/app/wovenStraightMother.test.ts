import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {wovenNativeInputFromMother,readWovenGraphSource,recomputeWovenGraphSource} from '../../src/app/wovenGraphSource';
import {readWovenPreprocessQuery,readWovenPreprocessResult} from '../../src/app/wovenGraphPreprocess';
import {prepareTessResult,hasWovenInternalBoundary} from '../../src/app/tessellation';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {wovenHolePreset,wovenMultiRingPreset,wovenNestedSheetsPreset,wovenCurveHolePreset} from '../../src/app/wovenParams';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {computeFlatFold} from '../../src/core/flatFold';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
const saved=JSON.parse(fs.readFileSync('tests/fixtures/woven-straight-mother-1010.json','utf8'));
test('explicit native split source copies all raw coordinates and cannot discard selected material roles',()=>{
 for(const c of saved.cases){const before=structuredClone(c.query.inputGraph),input=wovenNativeInputFromMother(c.query.inputGraph);assert.deepEqual(input,before);input.vertices[0][0]+=1;assert.deepEqual(c.query.inputGraph,before);}
 for(const preset of [wovenHolePreset,wovenMultiRingPreset,wovenNestedSheetsPreset,wovenCurveHolePreset]){const g=preset().graph,before=structuredClone(g);assert.throws(()=>wovenNativeInputFromMother(g),/材料身份/);assert.deepEqual(g,before);const plain={vertices:g.vertices,edges:g.edges};assert.throws(()=>wovenNativeInputFromMother(plain,g),/材料身份/,'raw source must also preserve roles selected on its derived graph');}
});
test('crossings and endpoint-on-segment source splits preserve original points and full source-edge coverage',()=>{
 for(const c of saved.cases){const q=readWovenPreprocessQuery(c.query);assert.ok(q);const split=readWovenPreprocessResult(c.preprocess,q);assert.ok(split,c.name);assert.deepEqual(recomputeWovenGraphSource(readWovenGraphSource(split.source)!).graph,split.graph);assert.deepEqual(split.welds,[]);
  for(const point of q.inputGraph.vertices)assert.ok(split.graph.vertices.some(p=>p[0]===point[0]&&p[1]===point[1]),`${c.name}: original endpoint moved`);
  q.inputGraph.edges.forEach(([a,b],original)=>{const p=q.inputGraph.vertices[a],r=q.inputGraph.vertices[b],dx=r[0]-p[0],dy=r[1]-p[1],den=dx*dx+dy*dy,intervals=split.graph.edges.flatMap(([u,v],e)=>split.originalEdgeForSegment[e]===original?[[split.graph.vertices[u],split.graph.vertices[v]].map(z=>((z[0]-p[0])*dx+(z[1]-p[1])*dy)/den).sort((x,y)=>x-y)]:[]).sort((x,y)=>x[0]-y[0]);assert.ok(intervals[0][0]===0);assert.equal(intervals.at(-1)![1],1);for(let i=1;i<intervals.length;i++)assert.equal(intervals[i-1][1],intervals[i][0]);});
  assert.ok(Object.values(split.certificates).every(value=>value===false),'preprocess is not a CP or adoption certificate');
 }
});
test('four straight native inputs really construct, preview verified CP, adopt with solved layers and export preserved source with checked CP',()=>{
 for(const c of saved.cases){const result=prepareTessResult(c.response,c.params),inspection=inspectWovenCutTopology(result,c.params);assert.ok(inspection.ok,`${c.name}: ${inspection.ok?'':inspection.reason}`);
  const doc=hasWovenInternalBoundary(result)?wovenMaterialDocument(result,c.params):result.doc,folded=computeFlatFold(doc);assert.equal(folded.layers.status,'solved',c.name);const material=inspectMaterialTopology(doc);
  for(const format of ['json','fold'] as const){const restored=importDocument(exportDocument(doc,format).text,format).doc,actual=computeFlatFold(restored);assert.equal(actual.layers.status,'solved');assert.deepEqual(actual.geometry.graph!.edges_vertices,folded.geometry.graph!.edges_vertices);assert.deepEqual(actual.geometry.graph!.edges_assignment,folded.geometry.graph!.edges_assignment);for(let v=0;v<actual.geometry.graph!.vertices_coords.length;v++)assert.ok(Math.hypot(actual.geometry.graph!.vertices_coords[v][0]-folded.geometry.graph!.vertices_coords[v][0],actual.geometry.graph!.vertices_coords[v][1]-folded.geometry.graph!.vertices_coords[v][1])<1e-9);assert.deepEqual((restored.metadata?.tessellation as any).parameters.graphSource.inputGraph,c.query.inputGraph);if(material.ok){const m=inspectMaterialTopology(restored);assert.ok(m.ok,m.ok?'':m.reason);assert.deepEqual(m.foldedVertices,material.foldedVertices);}}
  assert.equal((exportDXF(doc).text.match(/\r?\nLINE\r?\n/g)??[]).length,doc.segments.length);
 }
});
