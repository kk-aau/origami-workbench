import fs from 'node:fs';
import {networkModelCase as fixture} from '../tests/fixtures/materialNetworkModel';
import {weakToolSheet,weakToolSource} from '../tests/fixtures/materialWeakTools';
import {exportDocument} from '../src/core/formats';
for(const name of ['base','stale','single','two','network-curve','curve-network','cut','eight']){const d=name==='base'?weakToolSheet():name==='stale'?weakToolSource('interior'):fixture(name);d.name=`参数线网-${name}`;if(name==='network-curve'){d.segments.push({id:'model-aux',a:[4,6],b:[96,90],assignment:'A',angle:null,displayColor:'#765432'});d.metadata!.userNote='保留当前标注';}fs.writeFileSync(`output/playwright/material-network-model-${name}-initial-1009.zhezhi.json`,exportDocument(d,'json').text);}
console.log('Prepared base/stale/eight plus pure and mixed network/curve parameter projects.');
