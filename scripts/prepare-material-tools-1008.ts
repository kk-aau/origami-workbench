import fs from 'node:fs';
import {importDocument,exportDocument} from '../src/core/formats';
import {inspectMaterialTopology} from '../src/core/materialTopology';
const source=importDocument(fs.readFileSync('output/playwright/material-copy-source-1008.zhezhi.json','utf8'),'json').doc;
source.name='材料构造工具验收';
source.segments.push({id:'tool-guide-source',a:[0,0],b:[200,0],assignment:'A',angle:0},{id:'tool-guide-target',a:[600,0],b:[600,200],assignment:'A',angle:0});
const material=inspectMaterialTopology(source);if(!material.ok)throw Error(material.reason);
fs.writeFileSync('output/playwright/material-tools-source-1008.zhezhi.json',exportDocument(source,'json').text);
console.log('Prepared actual original material with explicit auxiliary reference endpoints.');
