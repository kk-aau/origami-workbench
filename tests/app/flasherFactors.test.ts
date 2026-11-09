import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {flasherFactorLimits,flasherFaceCount,flasherPreset,type FlasherParams} from '../../src/app/flasherParams';
import {canAdoptTess,prepareTessResult,readTessParams,tessConstructionKey,type TessResponse} from '../../src/app/tessellation';
import {spatialMeshScene} from '../../src/app/spatialMeshView';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
const originalFaces=(r:number,h:number,m:number)=>2*m*r*(r+1)*h+1;
type Case={name:string;params:FlasherParams;expectedCounts:number[];response:TessResponse};
const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/flasher-factors-20261010.json',import.meta.url),'utf8')).cases as Case[];

test('all finite factor and budget-derived rotation combinations share the literal original face and radial budget',()=>{
 let accepted=0;
 for(let r=1;r<=9;r++)for(let h=1;h<=9;h++)for(let m=3;m<=149;m++){
  const p={...flasherPreset(),rings:r,heightOrder:h,rotationalOrder:m};
  const legal=r*h<=9&&originalFaces(r,h,m)<=600;
  assert.equal(flasherFaceCount(r,h,m),originalFaces(r,h,m));
  assert.equal(readTessParams(p)!==null,legal,JSON.stringify(p));
  if(legal){accepted++;const limits=flasherFactorLimits(p);
   for(const [key,min,max] of [['rings',1,9],['heightOrder',1,9],['rotationalOrder',3,149]] as const){
    const possible=Array.from({length:max-min+1},(_,i)=>min+i).filter(n=>readTessParams({...p,[key]:n})!==null);
    assert.equal(limits[key],Math.max(...possible),`${JSON.stringify(p)} ${key}`);
    assert.ok(limits[key]>=p[key]);
   }
  }
 }
 assert.ok(accepted>100);
});
test('invalid integer domains and resource overflows still fail the actual saved-parameter reader',()=>{
 for(const patch of [{rings:10,heightOrder:1},{rings:1,heightOrder:10},{rings:5,heightOrder:2},
  {rings:9,heightOrder:1,rotationalOrder:4},{rotationalOrder:150},{rings:true},{heightOrder:1.5},
  {rotationalOrder:NaN},{diagonal:'Q'},{radialIncrement:Infinity},{unknown:true}])
  assert.equal(readTessParams({...flasherPreset(),...patch}),null);
});
test('three previously blocked original inputs pass actual static geometry and adoption gates',()=>{
 for(const c of cases){assert.deepEqual(readTessParams(c.params),c.params);
  assert.deepEqual([c.response.stats.vertices,c.response.stats.edges,c.response.stats.faces],c.expectedCounts);
  const r=prepareTessResult(structuredClone(c.response),c.params),scene=spatialMeshScene(r);
  assert.ok(scene,c.name);assert.equal(scene.faces.length,c.expectedCounts[2]);
  assert.equal(canAdoptTess(r,false,tessConstructionKey(c.params),c.params),true);
  assert.equal(canAdoptTess(r,true,tessConstructionKey(c.params),c.params),false);
  assert.equal(canAdoptTess(r,false,'stale',c.params),false);
  assert.equal(c.response.stats.checks.layerOrder.status,'not_checked');
  assert.equal(r.source.staticGlobalIsometryChecked,true);assert.equal(r.source.continuousRigidPathChecked,false);
  assert.equal(r.source.selfCollisionChecked,false);assert.equal(r.source.deployedPatternChecked,false);
  (r.source.foldedForm3D as number[][])[0][2]+=.01;
  assert.equal(spatialMeshScene(r),null);assert.equal(canAdoptTess(r,false,tessConstructionKey(c.params),c.params),false);
 }
});
test('new adopted CP recipes and literal FF survive ordinary JSON/FOLD and LINE DXF',()=>{
 for(const c of cases){const r=prepareTessResult(structuredClone(c.response),c.params);
  for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(r.doc,format).text,format).doc;
   assert.equal(back.segments.length,c.expectedCounts[1]);assert.deepEqual(back.paper,r.doc.paper);
   assert.deepEqual((back.metadata?.tessellation as any).parameters,c.params);
   assert.deepEqual((back.metadata?.tessellation as any).source,c.response.source);
  }
  const text=exportDXF(r.doc).text;
  assert.equal((text.match(/\r?\nLINE\r?\n/g)??[]).length,c.expectedCounts[1]);
  assert.ok(text.includes('1 drawing unit = 1 mm; X=x, Y=-y'));
 }
});
