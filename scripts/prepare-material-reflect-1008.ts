import fs from 'node:fs';
import {importDocument,exportDocument} from '../src/core/formats';
import {editMaterialFaces} from '../src/core/materialFaceEdit';
const square=importDocument(fs.readFileSync('output/playwright/material-batch-square-source-1008.zhezhi.json','utf8'),'json').doc;
for(const kind of ['F','M','D'] as const){const r=editMaterialFaces(square,{kind:'material-face-trace',component:0,from:{edgeId:'material-edge-3',fraction:.75},to:{edgeId:'material-edge-1',fraction:.25},assignment:kind==='D'?'F':kind,fixedSide:'left'});r.doc.name=`材料单线镜像${kind}`;r.doc.segments.push({id:'mirror-axis',a:kind==='D'?[0,0]:[0,50],b:kind==='D'?[100,100]:[100,50],assignment:'A',angle:null});fs.writeFileSync(`output/playwright/material-reflect-${kind}-source-1008.zhezhi.json`,exportDocument(r.doc,'json').text);}
console.log('Prepared material single-edge F/M mirror fixtures with an existing auxiliary axis.');
