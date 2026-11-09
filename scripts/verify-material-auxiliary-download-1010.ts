import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importDocument,exportDocument} from '../src/core/formats';
import {inspectMaterialCurveModel} from '../src/core/materialCurveModel';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {editMaterialAuxiliary} from '../src/core/materialAuxiliary';
import {exportDXF} from '../src/core/dxf';
import type {Doc} from '../src/core/types';
const checks:string[]=[],read=(file:string)=>importDocument(fs.readFileSync(file,'utf8'),file.endsWith('.fold')?'fold':'json').doc;
const file=(name:string,ext='zhezhi.json')=>`output/playwright/material-auxiliary-${name}-1010.${ext}`;
const shape=(d:Doc)=>({paper:d.paper,segments:[...d.segments].sort((a,b)=>a.id.localeCompare(b.id)),flatFold:d.flatFold,topology:inspectMaterialTopology(d).ok?d.metadata?.materialTopology:null,model:inspectMaterialCurveModel(d).ok?(inspectMaterialCurveModel(d) as any).model:null});
const verify=(name:string,expected:Doc)=>{
 const json=read(file(name)),fold=read(file(name,'fold'));assert.deepEqual(shape(json),shape(expected),name+' JSON');assert.deepEqual(shape(fold),shape(json),name+' FOLD');assert.equal(fs.readFileSync(file(name,'dxf'),'utf8'),exportDXF(json).text,name+' ordinary DXF');checks.push(name+' JSON/FOLD geometry, units, auxiliary source model and exact ordinary DXF');
};
for(const name of ['source','hole','weak','original','empty']){
 const source=read(`output/playwright/material-auxiliary-${name}-initial-1010.zhezhi.json`),intent={kind:'material-auxiliary' as const,operation:{kind:'create' as const,lines:[{key:'line-1',from:{kind:'world' as const,point:[0,50] as [number,number]},to:{kind:'world' as const,point:[100,50] as [number,number]}}]},parametric:true},created=editMaterialAuxiliary(source,intent).doc;
 verify(name+'-created',created);const changed=read(file(name+'-changed')),m=inspectMaterialCurveModel(changed);assert.ok(m.ok,m.ok?'':m.reason);assert.deepEqual(changed.segments.filter(s=>s.assignment!=='A'),source.segments.filter(s=>s.assignment!=='A'));assert.deepEqual(changed.paper,source.paper);assert.deepEqual(changed.segments.find(s=>s.id===created.segments.at(-1)!.id)!.b,[100,55]);verify(name+'-changed',changed);
}
verify('cancel',read('output/playwright/material-auxiliary-source-initial-1010.zhezhi.json'));
verify('undo',read(file('source-created')));verify('redo',read(file('updated')));
const updated=read(file('updated')),removed=read(file('removed')),created=read(file('source-created')),id=created.segments.at(-1)!.id;assert.deepEqual(updated.segments.find(s=>s.id===id)!.b,[100,65]);assert.ok(!removed.segments.some(s=>s.id===id));assert.deepEqual(removed.segments.filter(s=>s.assignment!=='A'),created.segments.filter(s=>s.assignment!=='A'));verify('updated',updated);verify('removed',removed);
fs.writeFileSync('output/material-auxiliary-download-1010.json',JSON.stringify({passed:checks.length,checks},null,2));console.log(`${checks.length} actual browser export sets verified independently.`);
