import fs from 'node:fs';
import {materialCanonical} from '../src/core/materialFaceCommon';
import {materialDoc} from '../tests/fixtures/materialModel';
import {exportDocument} from '../src/core/formats';
import type {Point} from '../src/core/types';
for(const name of ['ellipse','bezier','nested','crossing','hole','cp-only']){
 const hole=name==='hole',p:Point[]=[[0,0],[100,0],[100,100],[0,100],...(hole?[[45,45],[55,45],[55,55],[45,55]] as Point[]:[])],e:[number,number][]=[[0,1],[1,2],[2,3],[3,0],...(hole?[[4,5],[5,6],[6,7],[7,4]] as [number,number][]:[])];
 const doc=materialDoc(materialCanonical(p,e,e.map(()=>'B'),e.map(()=>null),[[0,1,2,3]],[[0,1,2,3]],hole?[[[4,7,6,5]]]:undefined,hole?[[[7,6,5,4]]]:undefined),p);doc.name=`曲线材料-${name}`;doc.paper={width:100,height:100};
 fs.writeFileSync(`output/playwright/material-curves-${name}-initial-1009.zhezhi.json`,exportDocument(doc,'json').text);
}
console.log('Six material curve base projects prepared.');
