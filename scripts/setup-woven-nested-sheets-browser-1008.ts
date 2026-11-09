import fs from 'node:fs';
import {exportDocument} from '../src/core/formats';
import type {Doc} from '../src/core/types';
const {cases}=JSON.parse(fs.readFileSync('tests/fixtures/woven-nested-sheets-1008.json','utf8'));
cases.push(JSON.parse(fs.readFileSync('tests/fixtures/woven-nested-hole-sheet-1008.json','utf8')));
for(const c of cases){const doc:Doc={schemaVersion:2,name:`嵌套纸片参数-${c.name}`,paper:{width:200,height:200},segments:[],metadata:{tessellation:{parameters:c.params}}};fs.writeFileSync(`output/playwright/woven-nested-sheets-${c.name}-params-1008.zhezhi.json`,exportDocument(doc,'json').text);}
console.log('Four actual source recipe projects prepared for UI restore.');
