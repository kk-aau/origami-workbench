import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ringAngularIfPreset} from '../../src/app/ringAngularIfPreset';
import {readRingVectorFunctionDefinitions} from '../../src/app/ringVectorFunctionDefinitions';
import {readTessParams,prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers,type TessResponse,type TessParams} from '../../src/app/tessellation';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
type Case={name:string;params:TessParams;response:TessResponse;piecewiseParameters:TessParams;piecewiseResponse:TessResponse;comparison:Record<string,unknown>};
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/ring-angular-if-20261010.json',import.meta.url),'utf8')) as {cases:Case[]};

test('visible C1 angular If preset preserves original If and index source through strict project reload',()=>{
 const p=ringAngularIfPreset();assert.deepEqual(p,fixture.cases[0].params);assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(p))),p);
 const component=fs.readFileSync(new URL('../../src/components/RingVectorExpressionDialog.tsx',import.meta.url),'utf8');assert.ok(component.includes('onApply(ringAngularIfPreset())'));
 const controls=fs.readFileSync(new URL('../../src/components/RingControls.tsx',import.meta.url),'utf8');assert.ok(controls.includes('vectorFunctionDefinitions'));
});

test('held If branches reject writes to exterior Module state while private branch locals remain pure',()=>{
 for(const defs of [['R[t_]:=Module[{a=1},If[Cos[t]>=0,Module[{},a=2;1],1] a]'],
                   ['R[t_,k_]:=Module[{a=1},If[k<1,1,Module[{},a=2;1]] a]']])assert.equal(readRingVectorFunctionDefinitions(defs),null);
 const defs=['R[t_]:=If[Cos[t]>=0,Module[{a=1},a],1]'];assert.deepEqual(readRingVectorFunctionDefinitions(defs),defs);
});

test('four actual If and Piecewise pairs are identical CP FF source and adoptable geometry while retaining distinct source definitions',()=>{
 for(const c of fixture.cases){assert.ok(readTessParams(c.params));assert.ok(readTessParams(c.piecewiseParameters));
  assert.deepEqual(c.response.fold,c.piecewiseResponse.fold);assert.deepEqual(c.response.mother,c.piecewiseResponse.mother);assert.deepEqual(c.response.source,c.piecewiseResponse.source);
  const a=prepareTessResult(c.response,c.params),b=prepareTessResult(c.piecewiseResponse,c.piecewiseParameters),key=tessConstructionKey(c.params);
  assert.equal(canAdoptTessWithTileLayers(a,false,key,c.params),true,c.name);assert.equal(canAdoptTessWithTileLayers(a,true,key,c.params),false);assert.equal(canAdoptTessWithTileLayers(a,false,key+'stale',c.params),false);
  assert.deepEqual(a.doc.segments,b.doc.segments);assert.equal(a.doc.segments.length,a.stats.edges);
  const input=tessFlatInput(a,a.doc,key,true),geometry=computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)});assert.equal(geometry.geometry.status,'ready',c.name);
  assert.equal((a.stats.checks as unknown as {layerOrder:{status:string}}).layerOrder.status,'not_checked');
  for(const check of ['geometry','local'] as const){const bad=structuredClone(a);bad.stats.checks[check].status='failed';assert.equal(canAdoptTessWithTileLayers(bad,false,key,c.params),false);}
 }
});

test('actual JSON and FOLD exports independently match counterpart geometry and retain each complete original function source',()=>{
 for(const c of fixture.cases){const a=prepareTessResult(c.response,c.params),b=prepareTessResult(c.piecewiseResponse,c.piecewiseParameters);
  for(const format of ['json','fold'] as const){const left=importDocument(exportDocument(a.doc,format).text,format).doc,right=importDocument(exportDocument(b.doc,format).text,format).doc;
   assert.equal(left.segments.length,a.stats.edges);assert.deepEqual(left.segments,right.segments);assert.deepEqual(left.paper,right.paper);
   assert.deepEqual(readTessParams((left.metadata?.tessellation as {parameters:unknown}).parameters),c.params);
   assert.deepEqual(readTessParams((right.metadata?.tessellation as {parameters:unknown}).parameters),c.piecewiseParameters);
   assert.deepEqual((left.metadata?.tessellation as {source:unknown}).source,(right.metadata?.tessellation as {source:unknown}).source);
  }
 }
});

test('actual DXF text is identical to Piecewise and every original endpoint and MV layer survives',()=>{
 for(const c of fixture.cases){const a=prepareTessResult(c.response,c.params),b=prepareTessResult(c.piecewiseResponse,c.piecewiseParameters),text=exportDXF(a.doc).text;
  assert.equal(text,exportDXF(b.doc).text);const tokens=text.trim().split(/\r?\n/),lines:Map<number,string>[]=[];let current:Map<number,string>|null=null;
  for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),value=tokens[i+1];if(code===0){current=value==='LINE'?new Map():null;if(current)lines.push(current);}else current?.set(code,value);}
  assert.equal(lines.length,a.stats.edges);lines.forEach((line,i)=>{const s=a.doc.segments[i];assert.equal(line.get(8),DXF_LAYERS[s.assignment].name);assert.deepEqual([Number(line.get(10)),Number(line.get(20))],[s.a[0],-s.a[1]].map(v=>v||0));assert.deepEqual([Number(line.get(11)),Number(line.get(21))],[s.b[0],-s.b[1]].map(v=>v||0));});
 }
});
