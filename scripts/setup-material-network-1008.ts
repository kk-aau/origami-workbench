import fs from 'node:fs';
import type {Point} from '../src/core/types';
import {materialCanonical} from '../src/core/materialFaceCommon';
import {materialDoc} from '../tests/fixtures/materialModel';
import {exportDocument} from '../src/core/formats';
import type {MaterialFaceNetworkIntent} from '../src/core/materialFaceEdit';
fs.mkdirSync('output/playwright',{recursive:true});
for(const hole of [false,true]){const p:Point[]=[[0,0],[100,0],[100,100],[0,100],...(hole?[[44,44],[56,44],[56,56],[44,56]] as Point[]:[])],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0],...(hole?[[4,5],[5,6],[6,7],[7,4]] as [number,number][]:[])],doc=materialDoc(materialCanonical(p,edges,edges.map(()=>'B'),edges.map(()=>null),[[0,1,2,3]],[[0,1,2,3]],hole?[[[4,7,6,5]]]:undefined,hole?[[[7,6,5,4]]]:undefined),p);doc.name=hole?'线网带孔源':'线网方纸源';doc.paper={width:100,height:100};fs.writeFileSync(`output/playwright/material-network-${hole?'hole':'sheet'}-source-1008.zhezhi.json`,exportDocument(doc,'json').text);}
const square=(a:number,b:number):Point[]=>[[a,a],[b,a],[b,b],[a,b]],ring:[number,number][]=[[0,1],[1,2],[2,3],[3,0]];
const cases:{name:string;source:string;intent:MaterialFaceNetworkIntent}[]=[
 {name:'rectangle',source:'sheet',intent:{kind:'material-face-network',face:0,graph:{vertices:square(35,65),edges:ring},assignments:Array(4).fill('F'),fixedPoint:[20,50],cpOnly:false}},
 {name:'cross',source:'sheet',intent:{kind:'material-face-network',face:0,graph:{vertices:[[15,20],[70,20],[70,65],[15,65],[40,40],[85,40],[85,85],[40,85]],edges:[...ring,...ring.map(([a,b])=>[a+4,b+4] as [number,number])]},assignments:Array(8).fill('F'),fixedPoint:[10,10],cpOnly:false}},
 {name:'nested-hole',source:'hole',intent:{kind:'material-face-network',face:0,graph:{vertices:[...square(20,80),...square(35,65)],edges:[...ring,...ring.map(([a,b])=>[a+4,b+4] as [number,number])]},assignments:Array(8).fill('F'),fixedPoint:[10,10],cpOnly:false}},
 {name:'cp-only',source:'sheet',intent:{kind:'material-face-network',face:0,graph:{vertices:square(35,65),edges:ring},assignments:Array(4).fill('M'),fixedPoint:[20,50],cpOnly:true}}
];fs.writeFileSync('output/playwright/material-network-cases-1008.json',JSON.stringify(cases,null,2));
console.log('Created actual material sources and independently replayable cases.');
