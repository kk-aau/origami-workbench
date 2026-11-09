import fs from 'node:fs';
import {importDocument,exportDocument} from '../src/core/formats';
import {computeFlatFold} from '../src/core/flatFold';
import {inspectMaterialCurveModel,editMaterialCurveModel} from '../src/core/materialCurveModel';
const load=(name:string)=>importDocument(fs.readFileSync(`output/playwright/material-curve-model-${name}-1009.zhezhi.json`,'utf8'),'json').doc;
for(const name of ['changed','json-reedited','fold-reedited','removed','slit-changed']){const d=load(name),r=computeFlatFold(d);console.log(JSON.stringify({name,layers:r.layers}));}
const doc=load('changed'),m=inspectMaterialCurveModel(doc);if(!m.ok)throw Error(m.reason);
for(const radius of [10,11,12.5,13,14]){const recipe=structuredClone(m.model.groups[1].recipe);(recipe.curves[0] as any).radii[0]=radius;const d=editMaterialCurveModel(doc,{kind:'material-curve-group-edit',group:m.model.groups[1].id,recipe}).doc;const r=computeFlatFold(d);if(radius===14)fs.writeFileSync('output/playwright/material-curve-model-thin-diagnostic-1009.zhezhi.json',exportDocument(d,'json').text);console.log(JSON.stringify({radius,layers:r.layers}));}
