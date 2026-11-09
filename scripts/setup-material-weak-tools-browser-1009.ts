import fs from 'node:fs';
import {weakToolSource as source,weakToolSheet as sheet,weakToolLine as line,weakToolMaterial as mat,weakToolAnchor as anchor} from '../tests/fixtures/materialWeakTools';
import {materialDoc} from '../tests/fixtures/materialModel';
import {editMaterialFaces,type MaterialFaceEditIntent} from '../src/core/materialFaceEdit';
import {exportDocument} from '../src/core/formats';
import {computeFlatFold} from '../src/core/flatFold';
import type {Doc} from '../src/core/types';
const cases:{name:string;doc:Doc;intent:MaterialFaceEditIntent;solved:boolean}[]=[];
for(const name of ['interior','boundary','cross','hole']){const doc=source(name),x=name==='interior'?50:name==='cross'?40:20;cases.push({name:'trace-'+name,doc,intent:{kind:'material-face-trace',component:0,from:anchor(doc,[x,0]),to:anchor(doc,[x,100]),assignment:name==='interior'?'M':'F',fixedSide:'left',cpOnly:false},solved:true});}
{const doc=source('cross');cases.push({name:'insert-cross',doc,intent:{kind:'material-face-insert',face:0,from:anchor(doc,[0,25]),to:anchor(doc,[100,25]),assignment:'F',fixedPart:0,cpOnly:false},solved:true});}
{const doc=sheet(true);cases.push({name:'insert-bridge-M',doc,intent:{kind:'material-face-insert',face:0,from:anchor(doc,[0,50]),to:anchor(doc,[40,50]),assignment:'M',fixedPart:0,cpOnly:true},solved:false});}
{const doc=source('interior'),g=mat(doc).graph,r=g.faces_holes![0][0],er=g.faces_holeEdges![0][0],e=er.find((_,k)=>g.vertices_coords[r[(k+1)%r.length]][0]<g.vertices_coords[r[k]][0])!;cases.push({name:'ray-bank',doc,intent:{kind:'material-face-ray',component:0,from:anchor(doc,[50,50],e),through:[50,49],assignment:'F',fixedSide:'left',cpOnly:false},solved:true});}
{const doc=source('cross');cases.push({name:'ray-junction',doc,intent:{kind:'material-face-ray',component:0,from:anchor(doc,[0,0]),through:[1,1],assignment:'F',fixedSide:'left',cpOnly:false},solved:true});}
{const doc=source('interior');cases.push({name:'batch-two',doc,intent:{kind:'material-face-traces',component:0,lines:[40,60].map(x=>({from:anchor(doc,[x,0]),to:anchor(doc,[x,100]),assignment:'F'})),fixedPoint:[10,10],cpOnly:true,overrides:[]},solved:true});}
{const initial=editMaterialFaces(sheet(),line([25,50],[75,50],'F',false)).doc,g=mat(initial).graph,doc=materialDoc(g,g.vertices_coords.map(([x,y])=>[200-y,300+x]));cases.push({name:'trace-preserve-FF',doc,intent:{kind:'material-face-trace',component:0,from:anchor(doc,[50,0]),to:anchor(doc,[50,100]),assignment:'F',fixedSide:'left',cpOnly:false},solved:true});}
const recipes=cases.map(({name,doc,intent,solved})=>{doc.name=`弱材料工具-${name}`;const r=editMaterialFaces(doc,intent);if(solved&&computeFlatFold(r.doc).layers.status!=='solved')throw Error(name+' unresolved');fs.writeFileSync(`output/playwright/material-weak-tools-${name}-initial-1009.zhezhi.json`,exportDocument(doc,'json').text);return {name,intent,solved,expectedPieces:r.insertedIds?.length??1};});
fs.writeFileSync('output/audits/material-weak-tools-recipes-1009.json',JSON.stringify(recipes,null,2));
fs.writeFileSync('output/playwright/material-weak-tools-run-1009.browser.js',fs.readFileSync('scripts/verify-material-weak-tools-1009.browser.js','utf8').replace('const recipes=[];','const recipes='+JSON.stringify(recipes)+';'));
console.log('Prepared ten original material projects, actual straight/ray/batch recipes and independent flat expectations.');
