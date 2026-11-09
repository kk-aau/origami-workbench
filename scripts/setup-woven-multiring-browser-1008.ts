import fs from 'node:fs';
import {exportDocument} from '../src/core/formats';
import type {Doc} from '../src/core/types';
const {cases}=JSON.parse(fs.readFileSync('tests/fixtures/woven-multiring-1008.json','utf8'));
for(const c of cases){const doc:Doc={schemaVersion:2,name:`多环母面参数-${c.name}`,paper:{width:200,height:200},segments:[],metadata:{tessellation:{parameters:c.params}}};fs.writeFileSync(`output/playwright/woven-multiring-${c.name}-params-1008.zhezhi.json`,exportDocument(doc,'json').text);}
console.log('Five actual multi-ring source recipes prepared.');
