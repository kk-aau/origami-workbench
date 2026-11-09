import fs from 'node:fs';
import {importDocument,exportDocument} from '../src/core/formats';
for(const name of ['source','hole','weak','original','empty']){
 const file=`output/playwright/material-reference-model-${name}-initial-1010.zhezhi.json`;
 const doc=importDocument(fs.readFileSync(file,'utf8'),'json').doc;
 doc.name=`材料辅助线-${name}`;
 const target=`output/playwright/material-auxiliary-${name}-initial-1010.zhezhi.json`;
 if(fs.existsSync(target))throw Error(`Existing evidence: ${target}`);
 fs.writeFileSync(target,exportDocument(doc,'json').text);
}
console.log('Prepared five actual material fixtures for auxiliary editing.');
