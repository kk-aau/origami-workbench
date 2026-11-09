import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTessResult,readTessParams,tessConstructionKey,canAdoptTessWithTileLayers} from '../../src/app/tessellation';
import {wovenOldIn3442Preset,readWovenOldState,readWovenOldMeritReport} from '../../src/app/wovenOld';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {canAdoptWovenCP,wovenCPDocument} from '../../src/app/wovenCPDocument';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {exportDocument,importDocument} from '../../src/core/formats';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import {scaleWovenFullInsets} from '../../src/app/wovenFullInsetScale';
const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/woven-original-old-1010.json',import.meta.url),'utf8')).cases;
test('visible In3442 preset preserves original raw mother graph, h and one-based fixed face 6',()=>{assert.deepEqual(wovenOldIn3442Preset(),cases[0].params);for(const c of cases)assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(c.params))),c.params);});
test('four literal Old d/dd constructions pass independent source/CP and actual layer adoption',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params),o=readWovenOldState(r.source,c.params),report=readWovenOldMeritReport(r.source,c.params);assert.ok(o);assert.ok(report);assert.equal(o.rawD.length,18);assert.equal(o.rawDD.length,6);assert.equal(r.source.pleatFactors,undefined);assert.equal(r.source.meritReport,undefined);assert.ok(inspectWovenCutTopology(r,c.params).ok);assert.equal(canAdoptWovenCP(r,false,key,c.params),true);
  const flat=recomputeFlatLayers(computeTessFlatGeometry(tessFlatInput(r,r.doc,key,true)));assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,flat.layers.status),true);assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'no-solution'),false);
 }
});
test('Old CP/ordinary JSON and FOLD export reread preserves saved identity, d/dd and source graph',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params);for(const d of [wovenCPDocument(r,c.params),r.doc])for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(d,format).text,format).doc,m=(back.metadata?.tessellation as any);assert.deepEqual(readTessParams(m.parameters),c.params);assert.deepEqual(m.source.oldWoven,r.source.oldWoven);assert.equal(back.segments.length,64);}}
});
test('Old raw group reorder, normalization, fake optimizer/fixed face and altered graph/chart fail adoption',()=>{
 const c=cases[0],r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params);
 for(const mutate of [(s:any)=>s.oldWoven.rawD.reverse(),(s:any)=>s.oldWoven.rawD=s.oldWoven.rawD.map((x:number)=>x/(c.params.width/2)),(s:any)=>s.oldWoven.rawDD[0]*=2,(s:any)=>s.oldWoven.signedStartFace=1,(s:any)=>s.oldWoven.originalStationaryFace=1,(s:any)=>s.oldWoven.originalOptimizer='NMinimize',(s:any)=>s.oldWoven.wolframExecuted=true,(s:any)=>s.oldWoven.cpSubstitutions.d=-1,(s:any)=>s.oldWoven.topologyInitialCP[0][0]+=.001,(s:any)=>s.oldMeritReport.lowerBounds.reverse(),(s:any)=>s.oldMeritReport.maximumResidual=1,(s:any)=>s.pleatFactors=s.oldWoven.rawD,(s:any)=>s.graph.vertices[0][0]+=.001,(s:any)=>s.periodVectors=[],(s:any)=>s.oldMeritReport.evaluationCount=0,(s:any)=>s.oldMeritReport.numericalRecovery={method:'forged-hole'}]){const bad=structuredClone(r);mutate(bad.source);assert.equal(canAdoptWovenCP(bad,false,key,c.params),false);}
 const newer={...c.params};delete newer.wovenVersion;assert.equal(canAdoptWovenCP(r,false,tessConstructionKey(newer),newer),false);
});
test('Old rejects nonoriginal extension requests without weakening current default parsing',()=>{
 const p=cases[0].params;for(const edit of [{wovenVersion:'current'},{borderInset:'none'},{periodicity:[]},{periodicityEnabled:false},{segmentInsets:[]},{fullEdgeInsets:{}},{optimization:'legacy'},{graph:{...p.graph,holeFaces:[]}}])assert.equal(readTessParams({...p,...edit}),null);
 const current={...p};delete current.wovenVersion;assert.deepEqual(readTessParams(current),current);
});
test('explicit full h proportion scales only requested absolute h and keeps source stamps and roles',()=>{
 const p=JSON.parse(fs.readFileSync(new URL('../fixtures/woven-cell-hole-area-1010.json',import.meta.url),'utf8')).cases[0].params,before=structuredClone(p),scaled=scaleWovenFullInsets(p,2);assert.deepEqual(p,before);const expected=structuredClone(p);expected.fullEdgeInsets.entries.forEach((e:any)=>e.inset*=2);assert.deepEqual(scaled,expected);for(const n of [0,-1,NaN,Infinity,1e20])assert.throws(()=>scaleWovenFullInsets(p,n));
});
