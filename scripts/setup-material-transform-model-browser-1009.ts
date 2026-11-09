import fs from 'node:fs';
import {transformModelCase,transformModelRecipe} from '../tests/fixtures/materialTransformModel';
import {importDocument,exportDocument} from '../src/core/formats';
import {inspectMaterialTopology} from '../src/core/materialTopology';
const save=(name:string,doc:ReturnType<typeof transformModelCase>)=>{doc.name=`参数变换-${name}`;fs.writeFileSync(`output/playwright/material-transform-model-${name}-initial-1009.zhezhi.json`,exportDocument(doc,'json').text);};
for(const name of ['source','moved','two','ray','cut'])save(name,transformModelCase(name));
const original=importDocument(fs.readFileSync('output/playwright/material-topology-model-original-saved-1009.zhezhi.json','utf8'),'json').doc,m=inspectMaterialTopology(original);if(!m.ok||!m.foldedVertices)throw Error('原版材料与实际FF输入无效。');save('original',original);
const recipes=['move','rotate','scale','mirrorX','mirrorY'].map(kind=>({name:kind,source:'source',recipe:transformModelRecipe(kind as 'move'|'rotate'|'scale'|'mirrorX'|'mirrorY',kind==='scale'?1.25:kind==='rotate'?30:20,10)}));recipes.push({name:'original',source:'original',recipe:{...transformModelRecipe('rotate',25),components:m.components.map((_,i)=>i)}});fs.writeFileSync('output/audits/material-transform-model-recipes-1009.json',JSON.stringify(recipes,null,2));console.log('Prepared five transform modes, downstream ray, cut piece and actual original posed material.');
