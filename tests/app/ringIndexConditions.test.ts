import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ringIndexConditionalPreset} from '../../src/app/ringIndexConditionalPreset';
import {readRingVectorFunctionDefinitions} from '../../src/app/ringVectorFunctionDefinitions';
import {readTessParams,prepareTessResult,tessConstructionKey,canAdoptTessWithTileLayers,type TessResponse} from '../../src/app/tessellation';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';

const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/ring-index-conditions-20261010.json',import.meta.url),'utf8'));
const cases=fixture.cases as {name:string;params:unknown;response:TessResponse;independentExistingExpansion:{maximumCPPointError:number;maximumFFPointError:number;allEdgesFacesAssignmentsIdentical:boolean}}[];

test('user preset is a real certified original ring input and preserves verbatim definition on reload',()=>{
  const p=ringIndexConditionalPreset();assert.deepEqual(p,readTessParams(cases[0].params));
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(p))),p);
  const dialog=fs.readFileSync(new URL('../../src/components/RingVectorExpressionDialog.tsx',import.meta.url),'utf8');
  assert.ok(dialog.includes('onApply(ringIndexConditionalPreset())'));
});

test('If definitions keep formal and lexical inputs and reject malformed or unsafe declarations',()=>{
  for(const defs of [['F[x_,k_]:=If[k<1,x,x/k]'],['F[x_,k_]:=Module[{n=k},If[n>=1,x,x+1]]'],
                     ['F[x_,k_]:=conditional(k<=1,x,2x)']])assert.deepEqual(readRingVectorFunctionDefinitions(defs),defs);
  for(const defs of [['F[x_]:=If[x<1,x]'],['F[x_]:=If[x<1,x,2x,3x]'],['If[x_]:=x'],
                     ['F[x_]:=If[x<1,x,F[x]]'],['F[x_]:=If[x<1,x,Print[x]]']])assert.equal(readRingVectorFunctionDefinitions(defs),null);
});

test('six actual CP responses retain old adoption checks, full graph, independent flat isometry and expansion evidence',()=>{
  for(const c of cases){
    const p=readTessParams(c.params);assert.ok(p&&p.family==='ring');const r=prepareTessResult(c.response,p),key=tessConstructionKey(p);
    assert.equal(canAdoptTessWithTileLayers(r,false,key,p),true,c.name);
    assert.equal(canAdoptTessWithTileLayers(r,true,key,p),false);
    assert.equal(canAdoptTessWithTileLayers(r,false,key+'stale',p),false);
    for(const check of ['geometry','local'] as const){const bad=structuredClone(r);bad.stats.checks[check].status='failed';assert.equal(canAdoptTessWithTileLayers(bad,false,key,p),false);}
    assert.equal(r.doc.segments.length,r.stats.edges);
    assert.ok(c.independentExistingExpansion.allEdgesFacesAssignmentsIdentical);
    assert.ok(Math.max(c.independentExistingExpansion.maximumCPPointError,c.independentExistingExpansion.maximumFFPointError)<2e-11);
    const input=tessFlatInput(r,r.doc,key,true),geometry=computeFlatGeometry(input.graph,2e-6,{startingFace:tessFlatRoot(input.graph)});
    assert.equal(geometry.geometry.status,'ready',c.name);
    assert.equal((r.stats.checks as unknown as {layerOrder:{status:string}}).layerOrder.status,'not_checked');
  }
});

test('adopted JSON FOLD and DXF keep every source CP edge and saved input recipes',()=>{
  for(const c of cases){const p=readTessParams(c.params)!;const r=prepareTessResult(c.response,p);
    for(const format of ['json','fold'] as const){const text=exportDocument(r.doc,format).text,reloaded=importDocument(text,format).doc;
      assert.equal(reloaded.segments.length,r.stats.edges);
      const recipe=(reloaded.metadata?.tessellation as {parameters?:unknown}|undefined)?.parameters;
      assert.deepEqual(readTessParams(recipe),p);
      assert.deepEqual(reloaded.segments.map(s=>s.assignment),r.doc.segments.map(s=>s.assignment));
    }
    const tokens=exportDXF(r.doc).text.trim().split(/\r?\n/),lines:Map<number,string>[]=[];
    let current:Map<number,string>|null=null;
    for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),value=tokens[i+1];
      if(code===0){current=value==='LINE'?new Map():null;if(current)lines.push(current);}
      else current?.set(code,value);
    }
    assert.equal(lines.length,r.stats.edges);
    lines.forEach((line,i)=>{const segment=r.doc.segments[i];assert.equal(line.get(8),DXF_LAYERS[segment.assignment].name);
      assert.deepEqual([Number(line.get(10)),Number(line.get(20))],[segment.a[0],-segment.a[1]].map(v=>v||0));
      assert.deepEqual([Number(line.get(11)),Number(line.get(21))],[segment.b[0],-segment.b[1]].map(v=>v||0));
    });
  }
});
