import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument} from '../src/core/formats';
import {validateDoc} from '../src/core/types';
import {readWovenMeritReport} from '../src/app/wovenMeritReport';
import {computeFlatFold} from '../src/core/flatFold';
import {buildFold} from '../src/core/geometry';
const nativeText=fs.readFileSync('output/playwright/woven-independent-regression-period-adopted-1008.zhezhi.json','utf8');
const foldText=fs.readFileSync('output/playwright/woven-independent-regression-period-adopted-1008.fold','utf8');
const doc=importDocument(nativeText,'json').doc,foldDoc=importDocument(foldText,'fold').doc;
validateDoc(doc);validateDoc(foldDoc);
const meta=doc.metadata!.tessellation as any,q=readWovenMeritReport(meta.source);assert.ok(q);
assert.equal(meta.parameters.width,.19);assert.equal(meta.parameters.stationaryFace,1);
assert.equal(meta.parameters.optimization,'origamica-merit');assert.equal(meta.parameters.periodicity.length,4);
assert.equal(q.periodicEquationCount,15);assert.ok(q.kktResidual<1e-7);
const graph=buildFold(doc).graph,raw=JSON.parse(foldText),read=buildFold(foldDoc).graph;
assert.deepEqual(raw.vertices_coords,graph.vertices_coords,'browser FOLD output uses the ordinary graph coordinates exactly');
assert.deepEqual(raw.edges_vertices,graph.edges_vertices);assert.deepEqual(read.edges_vertices,graph.edges_vertices);
assert.equal(read.vertices_coords.length,graph.vertices_coords.length);
const error=Math.max(...read.vertices_coords.map((p,i)=>Math.hypot(p[0]-graph.vertices_coords[i][0],p[1]-graph.vertices_coords[i][1])));
assert.ok(error<1e-10,'ordinary FOLD reimport retains coordinates within floating arithmetic roundoff');
for(const candidate of [doc,foldDoc]){
 const flat=computeFlatFold(candidate);assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');
 for(const face of flat.geometry.faces)for(const a of face)for(const b of face){
  const before=buildFold(candidate).graph.vertices_coords,after=flat.geometry.vertices;
  assert.ok(Math.abs(Math.hypot(before[a][0]-before[b][0],before[a][1]-before[b][1])-Math.hypot(after[a][0]-after[b][0],after[a][1]-after[b][1]))<1e-6);
 }
}
fs.writeFileSync('output/audits/woven-independent-regression-period-download-1008.json',JSON.stringify({
 verified:true,jsonDownload:true,foldDownload:true,periodicEquationCount:q.periodicEquationCount,
 exactExportedCoordinates:true,exactEdgeTopology:true,maximumOrdinaryFoldReimportRoundoff:error,
 nativeGeometry:'ready',nativeLayers:'solved',foldGeometry:'ready',foldLayers:'solved',
 width:meta.parameters.width,stationaryFace:meta.parameters.stationaryFace,paper:doc.paper,
},null,2));
console.log('Actual JSON/FOLD downloads independently verified: exact exported coordinates, topology, isometry and solved layers.');
