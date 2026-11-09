import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fourRingFlasherParams,flasherFaceCount,type FlasherParams} from '../../src/app/flasherParams';
import {prepareTessResult,readTessParams,canAdoptTess,tessConstructionKey,type TessResponse} from '../../src/app/tessellation';
import {spatialMeshScene} from '../../src/app/spatialMeshView';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
type Case={name:string;params:FlasherParams;response:TessResponse};
const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/flasher-r4-20261010.json',import.meta.url),'utf8')).cases as Case[];

test('r4 original topology has editable real CP/static-FF presets rather than a seed adoption shortcut',()=>{
 for(const d of ['Y','Z'] as const){const p=fourRingFlasherParams(d),c=cases.find(c=>c.params.diagonal===d&&c.params.radialIncrement===.05&&c.params.heightOrder===1)!;assert.deepEqual(p,c.params);assert.deepEqual(readTessParams(p),p);assert.equal(flasherFaceCount(4,1,5),201);assert.equal(c.response.stats.faces,201);}
});
test('all genuine four-ring responses independently preserve spatial isometry and are adoptable',()=>{
 for(const c of cases){assert.deepEqual(readTessParams(c.params),c.params);const r=prepareTessResult(c.response,c.params),scene=spatialMeshScene(r);assert.ok(scene,c.name);assert.equal(scene.faces.length,c.response.stats.faces);assert.equal(canAdoptTess(r,false,tessConstructionKey(c.params),c.params),true,c.name);assert.equal(canAdoptTess(r,true,tessConstructionKey(c.params),c.params),false);assert.equal(canAdoptTess(r,false,'stale',c.params),false);assert.equal(c.response.stats.checks.layerOrder.status,'not_checked');}
});
test('forged four-ring FF fails the actual metric validation even if certification booleans remain true',()=>{
 const c=cases.find(c=>c.params.diagonal==='Y'&&c.params.radialIncrement===.05)!,r=prepareTessResult(c.response,c.params);(r.source.foldedForm3D as number[][])[0][2]+=.01;assert.equal(spatialMeshScene(r),null);assert.equal(canAdoptTess(r,false,tessConstructionKey(c.params),c.params),false);
});
test('r4 adopted CP retains original source recipe through JSON/FOLD and ordinary DXF export',()=>{
 for(const c of cases.filter(c=>c.params.heightOrder===1&&c.params.rotationalOrder===5&&c.params.radialIncrement===.05&&c.params.diagonal!=='X')){
  const r=prepareTessResult(c.response,c.params);for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(r.doc,format).text,format).doc;assert.equal(back.segments.length,r.doc.segments.length);assert.equal((back.metadata?.tessellation as any).parameters.rings,4);assert.deepEqual((back.metadata?.tessellation as any).parameters,c.params);assert.deepEqual((back.metadata?.tessellation as any).source.foldedForm3D,c.response.source.foldedForm3D);}
  assert.equal((exportDXF(r.doc).text.match(/\r?\nLINE\r?\n/g)??[]).length,r.doc.segments.length);
 }
});
