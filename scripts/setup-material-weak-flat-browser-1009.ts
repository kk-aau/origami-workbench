import fs from 'node:fs';
import {materialDoc,materialCutFixture} from '../tests/fixtures/materialModel';
import {materialCanonical} from '../src/core/materialFaceCommon';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {materialFaceInside} from '../src/core/materialRings';
import {exportDocument,importDocument} from '../src/core/formats';
import type {Point} from '../src/core/types';
import type {MaterialCurveIntent} from '../src/core/materialCurves';
const request=(a:Point,b:Point,assignment:'F'|'M'='F',cpOnly=false):MaterialCurveIntent=>({kind:'material-face-curves',face:0,curves:[{kind:'bezier-path',assignment,nodes:[{point:a,incoming:a,outgoing:a},{point:b,incoming:b,outgoing:b}]}],deviation:1,fixedPoint:[10,10],cpOnly});
const p:Point[]=[[0,0],[100,0],[100,100],[0,100]],e:[number,number][]=[[0,1],[1,2],[2,3],[3,0]],sheet=materialDoc(materialCanonical(p,e,e.map(()=>'B'),e.map(()=>0),[[0,1,2,3]],[[0,1,2,3]]),p);
const original=materialCutFixture().source,m=inspectMaterialTopology(original);if(!m.ok)throw Error(m.reason);let originalRequest:MaterialCurveIntent|undefined;
for(let f=0;f<m.graph.faces_vertices!.length;f++){const ps=m.graph.faces_vertices![f].map(v=>m.graph.vertices_coords[v]),c:Point=[ps.reduce((n,p)=>n+p[0],0)/ps.length,ps.reduce((n,p)=>n+p[1],0)/ps.length],d=.02*Math.min(Math.max(...ps.map(p=>p[0]))-Math.min(...ps.map(p=>p[0])),Math.max(...ps.map(p=>p[1]))-Math.min(...ps.map(p=>p[1]))),a:Point=[c[0]-d,c[1]],b:Point=[c[0]+d,c[1]],fp:Point=[c[0],c[1]+d];if(d>0&&[a,b,fp].every(p=>materialFaceInside(m.graph,f,p))){originalRequest={...request(a,b),face:f,fixedPoint:fp};break;}}
if(!originalRequest)throw Error('No strict original material interior found');
const cut=(name:string)=>importDocument(fs.readFileSync(`output/playwright/material-weak-slit-${name}-cut-1009.zhezhi.json`,'utf8'),'json').doc;
const items=[...['interior','boundary','cross','hole'].map(name=>({name,doc:cut(name)})),{name:'free-F',doc:sheet,intent:request([25,50],[75,50])},{name:'original-F',doc:original,intent:originalRequest},{name:'corner-M',doc:cut('boundary'),intent:request([50,0],[50,50],'M',true),rebase:true}];
for(const item of items){item.doc.name=`弱边界平折-${item.name}`;fs.writeFileSync(`output/playwright/material-weak-flat-${item.name}-initial-1009.zhezhi.json`,exportDocument(item.doc,'json').text);}
fs.writeFileSync('output/audits/material-weak-flat-recipes-1009.json',JSON.stringify(items.map(({doc:_,...r})=>r),null,2));
fs.writeFileSync('output/playwright/material-weak-flat-run-1009.browser.js',fs.readFileSync('scripts/verify-material-weak-flat-1009.browser.js','utf8').replace('const recipes=[];','const recipes='+JSON.stringify(items.map(({doc:_,...r})=>r))+';'));
console.log('Prepared four actual slit CPs, two ordinary source CP/FF projects and a real slit-tip corner-fold UI construction.');
