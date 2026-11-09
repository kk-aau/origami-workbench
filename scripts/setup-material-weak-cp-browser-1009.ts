import fs from 'node:fs';
import {materialCanonical} from '../src/core/materialFaceCommon';
import {materialDoc} from '../tests/fixtures/materialModel';
import {exportDocument} from '../src/core/formats';
import type {Point} from '../src/core/types';
import type {MaterialCurveIntent} from '../src/core/materialCurves';
const sheet=(hole=false)=>{const p:Point[]=[[0,0],[100,0],[100,100],[0,100],...(hole?[[40,40],[60,40],[60,60],[40,60]] as Point[]:[])],e:[number,number][]=[[0,1],[1,2],[2,3],[3,0],...(hole?[[4,5],[5,6],[6,7],[7,4]] as [number,number][]:[])];return materialDoc(materialCanonical(p,e,e.map(()=>'B'),e.map(()=>0),[[0,1,2,3]],[[0,1,2,3]],hole?[[[4,7,6,5]]]:undefined,hole?[[[7,6,5,4]]]:undefined),p);};
const path=(a:Point,b:Point)=>({kind:'bezier-path' as const,assignment:'M' as const,nodes:[{point:a,incoming:a,outgoing:a},{point:b,incoming:b,outgoing:b}]});
const req=(...curves:ReturnType<typeof path>[]):MaterialCurveIntent=>({kind:'material-face-curves',face:0,curves,deviation:1,fixedPoint:[10,10],cpOnly:true});
const recipes=[{name:'interior',hole:false,intent:req(path([25,50],[75,50]))},{name:'boundary',hole:false,intent:req(path([0,50],[50,50])),complete:req(path([50,50],[100,50]))},{name:'cross',hole:false,intent:req(path([25,50],[75,50]),path([50,25],[50,75]))},{name:'hole',hole:true,intent:req(path([0,50],[40,50])),complete:req(path([60,50],[100,50]))},{name:'clipped',hole:false,intent:req(path([-20,50],[50,50]))},{name:'bent',hole:false,intent:req(path([20,40],[50,50]),path([50,50],[80,60]))}];
fs.mkdirSync('output/playwright',{recursive:true});
for(const r of recipes){const doc=sheet(r.hole);doc.name=`自由端点-${r.name}`;fs.writeFileSync(`output/playwright/material-weak-cp-${r.name}-initial-1009.zhezhi.json`,exportDocument(doc,'json').text);}
fs.writeFileSync('output/audits/material-weak-cp-recipes-1009.json',JSON.stringify(recipes,null,2));
fs.writeFileSync('output/playwright/material-weak-cp-run-1009.browser.js',fs.readFileSync('scripts/verify-material-weak-cp-1009.browser.js','utf8').replace('const recipes=[];','const recipes='+JSON.stringify(recipes)+';'));
console.log('Prepared six actual material sources and UI-only construction recipes; no precomputed result is imported.');
