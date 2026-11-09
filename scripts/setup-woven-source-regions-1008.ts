import fs from 'node:fs';
import {exportDocument} from '../src/core/formats';
import type {Doc} from '../src/core/types';
const cases=JSON.parse(fs.readFileSync('tests/fixtures/woven-source-regions-1008.json','utf8')).cases;
for(const c of cases){const {graphSource:_,...params}=c.params;const doc:Doc={schemaVersion:2,name:`自动拆分区域-${c.name}`,paper:{width:200,height:200},segments:[],metadata:{tessellation:{parameters:params}}};fs.writeFileSync(`output/playwright/woven-source-regions-${c.name}-params-1008.zhezhi.json`,exportDocument(doc,'json').text);}
console.log('Four source region recipes prepared.');
