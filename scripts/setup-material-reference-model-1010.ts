import fs from 'node:fs';
import assert from 'node:assert/strict';
import {propertiesModelCase} from '../tests/fixtures/materialPropertiesModel';
import {weakToolSheet,weakToolSource,weakToolAnchor,weakToolMaterial as mat} from '../tests/fixtures/materialWeakTools';
import {editMaterialReferenceFace} from '../src/core/materialReferenceFace';
import {editMaterialFaces} from '../src/core/materialFaceEdit';
import {cutMaterialSelection} from '../src/app/materialClipboard';
import {exportDocument,importDocument} from '../src/core/formats';
import type {Doc} from '../src/core/types';
const source=propertiesModelCase('mountain'),weak=weakToolSource('cross');delete weak.flatFold;
const original=importDocument(fs.readFileSync('output/playwright/material-topology-model-original-saved-1009.zhezhi.json','utf8'),'json').doc,saved=editMaterialReferenceFace(source,{kind:'material-reference-face',face:1,parametric:true}).doc,plain=propertiesModelCase('source'),twoRoot=editMaterialReferenceFace(plain,{kind:'material-reference-face',face:1,parametric:true}).doc,two=editMaterialFaces(twoRoot,{kind:'material-face-trace',component:0,from:weakToolAnchor(twoRoot,[50,0]),to:weakToolAnchor(twoRoot,[50,100]),assignment:'F',fixedSide:'left',parametric:true}).doc,empty=cutMaterialSelection(saved,{kind:'material-clipboard-cut',segmentIds:mat(saved).edgeSegmentIds,lockBoundary:false,parametric:true}).doc;
const cases:Record<string,Doc>={source,hole:weakToolSheet(true),weak,original,saved,two,empty};
for(const [name,value]of Object.entries(cases)){const file=`output/playwright/material-reference-model-${name}-initial-1010.zhezhi.json`;assert.ok(!fs.existsSync(file),file);fs.writeFileSync(file,exportDocument({...value,name:`参数参考面-${name}`},'json').text);}
console.log('Prepared seven independent reference-face fixtures, retaining original material and preceding frozen evidence.');
