import fs from 'node:fs';
import {traceModelCase,traceModelBase,traceModelRecipe} from '../tests/fixtures/materialTraceModel';
import {weakToolSheet,weakToolSource,weakToolMaterial} from '../tests/fixtures/materialWeakTools';
import {materialSlitFixture} from '../tests/fixtures/materialModel';
import {editMaterialFaces} from '../src/core/materialFaceEdit';
import {networkModelRecipe} from '../tests/fixtures/materialNetworkModel';
import {exportDocument} from '../src/core/formats';
import type {MaterialTraceRecipe} from '../src/core/materialCurveModel';
const cases=[];
for(const [name,kind] of [['trace','material-face-trace'],['ray','material-face-ray'],['batch','material-face-traces'],['hole','material-face-ray'],['stale','material-face-ray'],['network-ray','material-face-ray']] as const){
 const doc=name==='hole'?weakToolSheet(true):name==='stale'?weakToolSource('interior'):name==='network-ray'?editMaterialFaces(traceModelBase(),{...networkModelRecipe(35,65),parametric:true}).doc:traceModelBase(),recipe=traceModelRecipe(doc,kind,name==='hole'?50:name==='stale'||name==='network-ray'?20:30);doc.name=`参数轨迹-${name}`;cases.push({name,doc,recipe});
}
const {source,banks}=materialSlitFixture(),m=weakToolMaterial(source),recipe:MaterialTraceRecipe={kind:'material-face-ray',component:'all',from:{edgeId:m.edgeSegmentIds[banks[0]],fraction:.5},through:[150,99],assignment:'F',fixedSide:'left',cpOnly:false};source.name='参数轨迹-bank';cases.push({name:'bank',doc:source,recipe});
for(const row of cases)fs.writeFileSync(`output/playwright/material-trace-model-${row.name}-initial-1009.zhezhi.json`,exportDocument(row.doc,'json').text);
for(const name of ['single','two','three']){const d=traceModelCase(name);d.name=`参数轨迹-${name}`;fs.writeFileSync(`output/playwright/material-trace-model-${name}-initial-1009.zhezhi.json`,exportDocument(d,'json').text);}
let eight=traceModelBase();for(let i=1;i<=8;i++)eight=editMaterialFaces(eight,{...traceModelRecipe(eight,i%2?'material-face-ray':'material-face-trace',i*10),parametric:true}).doc;eight.name='参数轨迹-eight';fs.writeFileSync('output/playwright/material-trace-model-eight-initial-1009.zhezhi.json',exportDocument(eight,'json').text);
fs.writeFileSync('output/audits/material-trace-model-recipes-1009.json',JSON.stringify(cases.map(({name,recipe})=>({name,recipe})),null,2));
console.log('Prepared seven new recording cases, mixed/stale/weak/hole inputs, ordered three-group and eight-group projects.');
