import fs from 'node:fs';
import {importDocument} from '../src/core/formats';
import {inspectMaterialCurveModel} from '../src/core/materialCurveModel';
const base='output/playwright/material-auxiliary-empty-created-1010';
for(const format of ['json','fold'] as const){const d=importDocument(fs.readFileSync(base+(format==='json'?'.zhezhi.json':'.fold'),'utf8'),format).doc,m=inspectMaterialCurveModel(d);console.log(JSON.stringify({format,model:m.ok?'OK':m.reason,segments:d.segments,flatFold:d.flatFold,paper:d.paper,topology:d.metadata?.materialTopology,applied:(d.metadata?.materialCurveModel as any)?.applied}));}
