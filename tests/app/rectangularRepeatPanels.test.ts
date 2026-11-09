import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
import {readRectangularPotParams,rectangularPotPanelLimit,rectangularPotPreset} from '../../src/app/rectangularPotParams';
import {canAdoptTess,prepareTessResult,readTessParams,tessConstructionKey,type TessResponse} from '../../src/app/tessellation';
import {spatialMeshScene} from '../../src/app/spatialMeshView';

const fixture=JSON.parse(readFileSync(new URL('../fixtures/rectangular-repeat-panels-20261010.json',import.meta.url),'utf8'));

test('PotPanels above m is an independent positive integer within the face budget',()=>{
  const base=rectangularPotPreset();
  for(const panels of [6,10,30])assert.deepEqual(readTessParams({...base,panels}),{...base,panels});
  for(const panels of [0,-1,31,6.5,Infinity,true])assert.equal(readRectangularPotParams({...base,panels}),null);
  assert.equal(rectangularPotPanelLimit(5),30);assert.equal(rectangularPotPanelLimit(24),5);
  const profile=Array.from({length:24},(_,i)=>[1,i/2] as [number,number]);
  assert.ok(readRectangularPotParams({...base,crossSection:profile,panels:5}));
  assert.equal(readRectangularPotParams({...base,crossSection:profile,panels:6}),null);
});

test('m+1 and 2m keep all original CP edges in adoption, JSON/FOLD and ordinary LINE DXF',()=>{
  for(const item of fixture.repeatCases){
    const params=readTessParams(item.query)!;
    const response=item.response as TessResponse,result=prepareTessResult(response,params);
    assert.ok(canAdoptTess(result,false,tessConstructionKey(params),params));
    const scene=spatialMeshScene(result);assert.ok(scene);
    assert.equal(scene.faces.length,response.stats.faces);
    assert.equal(result.doc.segments.length,response.stats.edges);
    assert.equal(response.source.selfCollisionChecked,false);
    assert.equal(response.source.continuousRigidPathChecked,false);
    assert.equal((response.stats.checks as any).layerOrder.status,'not_checked');
    for(const format of ['json','fold'] as const){
      const output=exportDocument(result.doc,format),restored=importDocument(output.text,format).doc;
      const metadata=restored.metadata?.tessellation as {parameters:unknown;source:Record<string,unknown>};
      assert.deepEqual(readTessParams(metadata.parameters),params);
      assert.deepEqual(metadata.source.circumferentialRepetition,response.source.circumferentialRepetition);
      assert.equal(restored.segments.length,result.doc.segments.length);
      assert.ok(spatialMeshScene({fold:response.fold,source:metadata.source}));
    }
    // Same ordinary LINE exporter as App.doExport; explicit U/F layers survive.
    const dxf=exportDXF(result.doc).text;
    const tokens=dxf.trim().split(/\r?\n/),lines=[];
    for(let i=0;i<tokens.length;i+=2)if(tokens[i].trim()==='0'&&tokens[i+1].trim()==='LINE')lines.push(i);
    assert.equal(lines.length,response.stats.edges);
    const key=(a:number[],b:number[])=>[a,b].map(p=>p.map(v=>v.toFixed(8)).join(',')).sort().join('|');
    const readLines=lines.map(start=>{
      const values=new Map<string,string>();
      for(let i=start+2;i<tokens.length&&tokens[i].trim()!=='0';i+=2)values.set(tokens[i].trim(),tokens[i+1].trim());
      return key([Number(values.get('10')), -Number(values.get('20'))],
                 [Number(values.get('11')), -Number(values.get('21'))]);
    }).sort();
    assert.deepEqual(readLines,result.doc.segments.map(s=>key(s.a,s.b)).sort());
    const altered=structuredClone(response);(altered.source.foldedForm3D as number[][])[20][2]+=.1;
    assert.equal(spatialMeshScene(altered),null);
  }
});

test('legacy source objects retain every field and carry no new repetition metadata',()=>{
  for(const item of fixture.legacyCases){
    const params=readTessParams(item.query)!;
    const response=item.response as TessResponse;
    assert.ok(params);assert.ok(spatialMeshScene(response));
    assert.equal(Object.hasOwn(response.source,'circumferentialRepetition'),false);
    const restored=importDocument(exportDocument(prepareTessResult(response,params).doc,'json').text,'json').doc;
    assert.deepEqual((restored.metadata?.tessellation as any).source,JSON.parse(JSON.stringify(response.source)));
  }
});
