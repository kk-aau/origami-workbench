import {originalLogRingOracle} from '../helpers/ringLogOriginalOracle';
import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {ringLogPreset} from '../../src/app/ringLogPreset';import {ringLogSourceMatches} from '../../src/app/ringLogSource';import {inspectRingBuiltinLogInput,readRingVectorFunctionDefinitions} from '../../src/app/ringVectorFunctionDefinitions';
import {prepareTessResult,readTessParams,tessConstructionKey,canAdoptTessWithTileLayers,needsTessellationLayerCheck,canAdoptTess} from '../../src/app/tessellation';import {tessFlatInput} from '../../src/app/tessellationFlat';import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';import {recomputeFlatLayers} from '../../src/core/flatFold';import {exportDocument,importDocument} from '../../src/core/formats';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/ring-log-20261010.json',import.meta.url),'utf8')),cases=fixture.cases;
test('raw Log preset/three parameter variants preserve literal Function inputs and actual layers',()=>{
 assert.deepEqual(ringLogPreset(),cases[0].params);
 for(const c of cases){assert.deepEqual(readTessParams(structuredClone(c.params)),c.params);const r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params);assert.equal(inspectRingBuiltinLogInput(c.params),true);assert.equal(ringLogSourceMatches(r.source,c.params),true);assert.equal(needsTessellationLayerCheck(c.params),true);assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'no-solution'),false);const flat=recomputeFlatLayers(computeTessFlatGeometry(tessFlatInput(r,r.doc,key,true)));assert.equal(flat.geometry.status,'ready');assert.equal(flat.layers.status,'solved');assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'solved'),true);}
});
test('missing/forged model flags or raw binding cannot adopt a Log CP even with real layers',()=>{
 const c=cases[0],r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params);for(const mutate of [(s:any)=>delete s.logNumericDomain,(s:any)=>s.logNumericDomain.roundingModel='real-certified',(s:any)=>s.logNumericDomain.machineCheckedRealArithmetic=true,(s:any)=>s.logNumericDomain.wolframExecuted=true,(s:any)=>s.logNumericDomain.parsedIntrinsicCalls=false,(s:any)=>s.logNumericDomain.argumentPolicy='sampled-positive',(s:any)=>s.logNumericDomain.rawInputBinding.outerVectorTemplate[0]='Cos[phi]',(s:any)=>s.logNumericDomain.rawInputBinding.extra=1,(s:any)=>s.logNumericDomain.extra=1]){const bad=structuredClone(r);mutate(bad.source);assert.equal(ringLogSourceMatches(bad.source,c.params),false);assert.equal(canAdoptTessWithTileLayers(bad,false,key,c.params,'solved'),false);}
});
test('all original nonLog controls retain old source/adoption/layer path and reject fake Log provenance',()=>{
 for(const c of fixture.unchangedControls){const r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params);assert.equal(inspectRingBuiltinLogInput(c.params),false);assert.equal(ringLogSourceMatches(r.source,c.params),true);assert.equal(needsTessellationLayerCheck(c.params),!!c.params.paper);assert.equal(canAdoptTess(r,false,key,c.params),c.response.stats.checks.geometry.status==='passed'&&c.response.stats.checks.local.status==='passed');const s={...r.source,logNumericDomain:cases[0].response.source.logNumericDomain};assert.equal(ringLogSourceMatches(s,c.params),false);}
});
test('lexical inspection respects explicit Log/log names, scopes and intrinsic aliases',()=>{
 for(const [body,defs] of [['Log[phi,i] Cos[phi]',['Log[t_,k_]:=1+.03 Sin[t]']],['log[phi,i] Sin[phi]',['log[t_,k_]:=1+.03 Sin[t]']],['Module[{log=2},log Cos[phi]]',undefined]] as const){const p={outerVectorTemplate:[body,'Sin[phi]'],...(defs?{vectorFunctionDefinitions:[...defs]}:{})};assert.equal(inspectRingBuiltinLogInput(p),false);assert.equal(ringLogSourceMatches({},p),true);if(defs)assert.ok(readRingVectorFunctionDefinitions([...defs]));}
 assert.equal(inspectRingBuiltinLogInput({outerVectorTemplate:['Log[2+Sin[phi]] Cos[phi]','Sin[phi]'],vectorFunctionDefinitions:['log[x_]:=x+2']}),true);
 assert.equal(inspectRingBuiltinLogInput({outerVectorTemplate:['Module[{x=2},Log[x] Cos[phi]]','Sin[phi]']}),true);
 assert.equal(inspectRingBuiltinLogInput({outerVectorTemplate:['notAllowed[phi]','Sin[phi]']}),null);
});
test('JSON/FOLD reopens raw original request and engineering model without promoting it to exact proof',()=>{
 for(const c of cases){const r=prepareTessResult(c.response,c.params);for(const f of ['json','fold'] as const){const d=importDocument(exportDocument(r.doc,f).text,f).doc,m=d.metadata!.tessellation as any;assert.deepEqual(readTessParams(m.parameters),c.params);assert.deepEqual(m.source,c.response.source);assert.equal(ringLogSourceMatches(m.source,m.parameters),true);assert.equal(m.source.logNumericDomain.machineCheckedRealArithmetic,false);}}
});

test('independent original p/q/r/s convex ray replay verifies every CP/FF point and all original edge order/types',()=>{
 for(const c of cases){const actual=c.response,expected=originalLogRingOracle(c.params);assert.deepEqual(actual.fold.edges_vertices,expected.edges);assert.deepEqual(actual.fold.edges_assignment,expected.assignments);for(const [a,b] of [[actual.fold.vertices_coords,expected.vertices],[actual.source.foldedForm,expected.foldedForm]]){assert.equal(a.length,b.length);assert.ok(Math.max(...a.map((q:number[],i:number)=>Math.hypot(q[0]-b[i][0],q[1]-b[i][1])))<2e-10);}}
});
