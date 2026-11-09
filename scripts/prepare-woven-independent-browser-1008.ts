import fs from 'node:fs';
import {exportDocument} from '../src/core/formats';
const saved=JSON.parse(fs.readFileSync('tests/fixtures/woven-independent-1008.json','utf8'));
for(const c of saved.cases)fs.writeFileSync(`output/playwright/woven-independent-${c.name}-params-1008.zhezhi.json`,exportDocument({name:`独立母图参数-${c.name}`,paper:{width:200,height:200},segments:[],metadata:{tessellation:{parameters:c.params}}},'json').text);
console.log('Prepared six parameter recipes; these are not adopted crease results.');
