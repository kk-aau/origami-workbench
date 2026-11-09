import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {wovenScaledHolePreset} from '../../src/app/wovenScaledHolePreset';
import {prepareTessResult,readTessParams,tessConstructionKey,canAdoptTessWithTileLayers} from '../../src/app/tessellation';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {canAdoptWovenCP,wovenCPDocument} from '../../src/app/wovenCPDocument';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import {readWovenMeritReport} from '../../src/app/wovenMeritReport';
const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/woven-cell-hole-area-1010.json',import.meta.url),'utf8')).cases;
test('three visible presets preserve hole roles, component identity, raw points and all h values',()=>{
 for(const c of cases){const p=wovenScaledHolePreset(c.name);assert.deepEqual(p,c.params);assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(p))),p);assert.equal(p.graph.holeFaces!.length,c.name==='two-independent'?2:1);assert.ok(p.fullEdgeInsets!.entries.every(e=>e.inset===.04*1e-5));}
});
test('three genuine hole CPs pass strict void-bound/source reconstruction and actual layers',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params),proof=inspectWovenCutTopology(r,c.params);assert.ok(proof.ok,proof.ok?'':proof.reason);assert.equal(canAdoptWovenCP(r,false,key,c.params),true);
  const input=tessFlatInput(r,r.doc,key,true),flat=recomputeFlatLayers(computeTessFlatGeometry(input));assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,flat.layers.status),true);assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'no-solution'),false);
  const p=(r.source.topologyAreaRecovery as any).cellHoles;assert.equal(p.materialEuler,0);assert.equal(p.excludedCycles.length,c.params.graph.holeFaces.length);assert.ok(p.excludedBounds.every(b=>b[0]>0));
 }
});
test('CP and full FF material downloads preserve all indexed cuts/holes and actual layer audit',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params);
  for(const full of [false,true]){const d=full?wovenMaterialDocument(r,c.params):wovenCPDocument(r,c.params),material=inspectMaterialTopology(d);assert.ok(material.ok);assert.equal(material.foldedVertices!==undefined,full);
   for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(d,format).text,format).doc,m=inspectMaterialTopology(back);assert.ok(m.ok);assert.deepEqual(m.graph,material.graph);assert.deepEqual(m.foldedVertices,material.foldedVertices);assert.deepEqual(readTessParams((back.metadata?.tessellation as any).parameters),c.params);if(full)assert.equal(computeFlatFold(back).layers.status,'solved');}
  }
 }
});
test('omitted or forged void role/ring/bounds/component Euler cannot pass CP gate',()=>{
 const c=cases[2],r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params);
 for(const mutate of [(s:any)=>delete s.topologyAreaRecovery.cellHoles,(s:any)=>s.topologyAreaRecovery.cellHoles.originalCycles.reverse(),(s:any)=>s.topologyAreaRecovery.cellHoles.excludedCycles.pop(),(s:any)=>s.topologyAreaRecovery.cellHoles.excludedCycles[0].pop(),(s:any)=>s.topologyAreaRecovery.cellHoles.excludedCycles[0][0]=9999,(s:any)=>s.topologyAreaRecovery.cellHoles.excludedCycles[0][0]=0,(s:any)=>s.topologyAreaRecovery.cellHoles.excludedBounds[0][0]=0,(s:any)=>s.topologyAreaRecovery.cellHoles.excludedBounds[0][1]*=2,(s:any)=>s.topologyAreaRecovery.cellHoles.materialEuler=1,(s:any)=>s.wovenMotherHoles.faceIds.pop(),(s:any)=>s.wovenIndependentMother.vertices.pop(),(s:any)=>s.graph.vertices[0][0]+=.001]){const bad=structuredClone(r);mutate(bad.source);assert.equal(canAdoptWovenCP(bad,false,key,c.params),false);}
 const bad=structuredClone(r);(bad.source.meritReport as any).holeClosureRawResiduals[0]=1;assert.equal(readWovenMeritReport(bad.source),null);
});
