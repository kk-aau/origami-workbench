import fs from 'node:fs';
import {mergeHoleRing} from '../tests/fixtures/materialHoles';
import {exportDocument} from '../src/core/formats';
const {source,result}=mergeHoleRing();source.name='孔洞面合并来源';result.doc.name='孔洞面合并来源';fs.writeFileSync('output/playwright/material-holes-source-1008.zhezhi.json',exportDocument(source,'json').text);fs.writeFileSync('output/playwright/material-holes-expected-1008.zhezhi.json',exportDocument(result.doc,'json').text);console.log('Prepared eight-face ring and expected true one-face annulus without CP helper edges.');
