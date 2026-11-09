import fs from 'node:fs';
import type {Doc,Assignment,Point} from '../src/core/types';
import {exportDocument} from '../src/core/formats';
const edge=(id:string,a:Point,b:Point,assignment:Assignment)=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});
const doc:Doc={name:'加工统计与预览验收',paper:{width:200,height:200},segments:[edge('m1',[-30,20],[-10,20],'M'),edge('m2',[-10,20],[10,20],'M'),edge('m3',[10,20],[10,40],'M'),edge('v1',[10,40],[0,50],'V'),edge('b1',[-40,-10],[0,-10],'B'),edge('b2',[0,-10],[40,-10],'B'),edge('b3',[40,-10],[40,60],'B'),edge('b4',[40,60],[-40,60],'B'),edge('b5',[-40,60],[-40,-10],'B')]};
fs.writeFileSync('output/playwright/cp-preview-count-initial-1009.zhezhi.json',exportDocument(doc,'json').text);console.log('Prepared off-origin nine-edge source with two real straight merges and separate M/V/B groups.');
