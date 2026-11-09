import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {wovenMeritRecoveryPreset} from '../../src/app/wovenMeritRecoveryPreset';
import {readWovenMeritReport} from '../../src/app/wovenMeritReport';
import {readTessParams,prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers,type TessResponse} from '../../src/app/tessellation';
import {canAdoptWovenCP,wovenCPDocument} from '../../src/app/wovenCPDocument';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import type {WovenParams} from '../../src/app/wovenParams';

type Case={name:string;params:WovenParams&{mode:'graph'};response:TessResponse;before?:{status:string;reason:string};independent?:{maximumLiteralFFPointError:number;maximumScalarUnfoldCPPointError:number}};
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/woven-merit-recovery-20261010.json',import.meta.url),'utf8')) as {cases:Case[];unchangedHighEvenControls:Case[]};

test('new visible preset matches a formerly failing, now valid original-target input',()=>{
 const c=fixture.cases.find(c=>c.name==='six-reverse')!,p=wovenMeritRecoveryPreset();assert.deepEqual(p,c.params);assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(p))),p);
 const controls=fs.readFileSync(new URL('../../src/components/WovenControls.tsx',import.meta.url),'utf8');assert.ok(controls.includes("e.target.value==='merit-recovery'?wovenMeritRecoveryPreset()"));
});

test('three real recovered CPs and four original high-even controls pass independent source proof and explicit CP adoption',()=>{
 for(const c of [...fixture.cases,...fixture.unchangedHighEvenControls]){
  const r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params),proof=inspectWovenCutTopology(r,c.params);assert.ok(proof.ok,c.name+': '+(proof.ok?'':proof.reason));
  assert.ok(readWovenMeritReport(r.source));assert.ok(canAdoptWovenCP(r,false,key,c.params));
  const d=wovenCPDocument(r,c.params),m=inspectMaterialTopology(d);assert.ok(m.ok);assert.equal(m.foldedVertices,undefined);assert.equal(d.segments.length,r.stats.edges);
  assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'no-solution'),false);
  assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,'checking'),false);
  if(c.before){assert.equal(c.before.status,'rejected');assert.ok(c.before.reason.includes('Positive directional derivative'));assert.ok(c.independent);assert.ok(c.independent.maximumLiteralFFPointError<2e-12);assert.ok(c.independent.maximumScalarUnfoldCPPointError<2e-11);}
 }
});

test('actual layer solving controls ordinary adoption and keeps source not_checked unchanged',()=>{
 for(const c of fixture.cases){const r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params),input=tessFlatInput(r,r.doc,key,true);
  const geometry=computeFlatGeometry(input.graph,1e-6,{startingFace:input.startingFace});assert.equal(geometry.geometry.status,'ready',c.name);
  const flat=recomputeFlatLayers(geometry);console.log(c.name,'actual layers:',flat.layers.status);
  assert.equal(canAdoptTessWithTileLayers(r,false,key,c.params,flat.layers.status),flat.layers.status==='solved');
  assert.equal((r.stats.checks as unknown as {layerOrder:{status:string}}).layerOrder.status,'not_checked');
 }
});

test('complete CP project and FOLD readback preserve all source edges and no active FF, DXF independently preserves each endpoint and MV layer',()=>{
 for(const c of fixture.cases){const r=prepareTessResult(c.response,c.params),d=wovenCPDocument(r,c.params),original=inspectMaterialTopology(d);assert.ok(original.ok);
  for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(d,format).text,format).doc,m=inspectMaterialTopology(back);assert.ok(m.ok);assert.deepEqual(m.graph,original.graph);assert.equal(m.foldedVertices,undefined);assert.equal(back.segments.length,d.segments.length);
   assert.deepEqual(readTessParams((back.metadata?.tessellation as {parameters:unknown}).parameters),c.params);}
  const tokens=exportDXF(d).text.trim().split(/\r?\n/),lines:Map<number,string>[]=[];let current:Map<number,string>|null=null;
  for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),value=tokens[i+1];if(code===0){current=value==='LINE'?new Map():null;if(current)lines.push(current);}else current?.set(code,value);}
  assert.equal(lines.length,d.segments.length);lines.forEach((line,i)=>{const s=d.segments[i];assert.equal(line.get(8),DXF_LAYERS[s.assignment].name);assert.deepEqual([Number(line.get(10)),Number(line.get(20))],[s.a[0],-s.a[1]].map(v=>v||0));assert.deepEqual([Number(line.get(11)),Number(line.get(21))],[s.b[0],-s.b[1]].map(v=>v||0));});
 }
});

test('restoration cannot bypass altered coordinates, source topology, bounds, stale state or busy admission',()=>{
 const c=fixture.cases[0],r=prepareTessResult(c.response,c.params),key=tessConstructionKey(c.params);
 assert.equal(canAdoptWovenCP(r,true,key,c.params),false);assert.equal(canAdoptWovenCP(r,false,'stale',c.params),false);
 for(const kind of ['ff','source','factor','candidate'] as const){const bad=structuredClone(r);
  if(kind==='ff')(bad.source.foldedForm as number[][])[0][0]+=.01;
  else if(kind==='source')(bad.source.graph as {edges:number[][]}).edges.pop();
  else if(kind==='factor')(bad.source.pleatFactors as number[])[0]=0;
  else bad.doc.segments[0].a[0]+=.01;
  assert.equal(canAdoptWovenCP(bad,false,key,c.params),false,kind);
 }
});
