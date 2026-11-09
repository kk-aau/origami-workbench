import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument,exportDocument} from '../src/core/formats';
import {validateDoc} from '../src/core/types';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {readWovenMeritReport} from '../src/app/wovenMeritReport';
import {computeFlatFold} from '../src/core/flatFold';
import {buildFold} from '../src/core/geometry';
const input='output/playwright/woven-merit-adopted-1007.zhezhi.json';
const doc=importDocument(fs.readFileSync(input,'utf8'),'json').doc;
validateDoc(doc);
const meta=doc.metadata!.tessellation as any;
assert.equal(meta.parameters.width,.08);assert.equal(meta.parameters.optimization,'origamica-merit');
const report=readWovenMeritReport(meta.source);assert.ok(report);assert.equal(report.merit,.000004);
const material=inspectMaterialTopology(doc);assert.ok(material.ok);assert.equal(material.components.length,3);
const folded=computeFlatFold(doc);assert.equal(folded.geometry.status,'ready');assert.equal(folded.layers.status,'solved');
const text=exportDocument(doc,'fold').text;fs.writeFileSync('output/playwright/woven-merit-adopted-1007.fold',text);
const reimport=importDocument(text,'fold').doc;validateDoc(reimport);
assert.deepEqual(buildFold(reimport).graph.vertices_coords,buildFold(doc).graph.vertices_coords);
assert.deepEqual(buildFold(reimport).graph.edges_vertices,buildFold(doc).graph.edges_vertices);
assert.deepEqual(inspectMaterialTopology(reimport).graph.faces_edges,material.graph.faces_edges);
const reFolded=computeFlatFold(reimport);assert.equal(reFolded.geometry.status,'ready');assert.equal(reFolded.layers.status,'solved');
assert.deepEqual(reFolded.geometry.vertices,folded.geometry.vertices);
const concaveInput='output/playwright/woven-merit-concave-adopted-1007.zhezhi.json';
const concaveDoc=importDocument(fs.readFileSync(concaveInput,'utf8'),'json').doc;validateDoc(concaveDoc);
const concaveMeta=concaveDoc.metadata!.tessellation as any;
assert.equal(concaveMeta.parameters.minPleat,.3);assert.equal(concaveMeta.parameters.minBorderPleat,.05);
const concaveReport=readWovenMeritReport(concaveMeta.source);assert.equal(concaveReport?.certificate,'local-numerical-candidate');
const concaveFlat=computeFlatFold(concaveDoc);assert.equal(concaveFlat.geometry.status,'ready');assert.equal(concaveFlat.layers.status,'solved');
const concaveFold=exportDocument(concaveDoc,'fold').text;
fs.writeFileSync('output/playwright/woven-merit-concave-adopted-1007.fold',concaveFold);
const concaveRoundTrip=importDocument(concaveFold,'fold').doc;
assert.deepEqual(buildFold(concaveRoundTrip).graph.vertices_coords,buildFold(concaveDoc).graph.vertices_coords);
assert.deepEqual(buildFold(concaveRoundTrip).graph.edges_vertices,buildFold(concaveDoc).graph.edges_vertices);
assert.equal(computeFlatFold(concaveRoundTrip).layers.status,'solved');
fs.writeFileSync('output/audits/woven-merit-download-1007.json',JSON.stringify({
 verified:true,source:input,merit:report.merit,materialComponents:material.components.length,
 vertices:material.graph.vertices_coords.length,edges:material.graph.edges_vertices.length,
 exactCoordinates:true,exactTopology:true,flatBefore:'solved',flatAfter:'solved',
 foldExport:'programmatic-export-of-actual-browser-download',
 concave:{source:concaveInput,merit:concaveReport!.merit,lowerMerit:concaveReport!.lowerMerit,
  exactCoordinates:true,exactTopology:true,flatBefore:'solved',flatAfter:'solved'},
},null,2));
console.log('Downloaded project: source, exact CP/material topology, FOLD roundtrip and layer order verified.');
