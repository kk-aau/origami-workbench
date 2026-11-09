import fs from 'node:fs';
import {materialDoc} from '../tests/fixtures/materialModel';
import {materialCanonical} from '../src/core/materialFaceCommon';
import {editMaterialFaces} from '../src/core/materialFaceEdit';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {materialFaceInside} from '../src/core/materialRings';
import {exportDocument,importDocument} from '../src/core/formats';
import type {Point} from '../src/core/types';
import type {MaterialCurveIntent} from '../src/core/materialCurves';
const line=(a:Point,b:Point,assignment:'M'|'F'='M'):MaterialCurveIntent=>({kind:'material-face-curves',face:0,curves:[{kind:'bezier-path',assignment,nodes:[{point:a,incoming:a,outgoing:a},{point:b,incoming:b,outgoing:b}]}],deviation:1,fixedPoint:[10,10],cpOnly:true});
const points:Point[]=[[0,0],[100,0],[100,100],[0,100]],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0]],sheet=()=>materialDoc(materialCanonical(points,edges,edges.map(()=>'B'),edges.map(()=>0),[[0,1,2,3]],[[0,1,2,3]]),points);
const read=(file:string)=>importDocument(fs.readFileSync(file,'utf8'),'json').doc;
const hinge=editMaterialFaces(sheet(),line([0,50],[100,50])).doc,m=inspectMaterialTopology(hinge);if(!m.ok)throw Error(m.reason);
const face=m.graph.faces_vertices!.findIndex((_,f)=>materialFaceInside(m.graph,f,[20,20]));
const items=[...['interior','boundary','cross','hole'].map(name=>({name,doc:read(`output/playwright/material-weak-slit-${name}-cut-1009.zhezhi.json`)})),
 {name:'free-F',doc:editMaterialFaces(sheet(),line([25,50],[75,50],'F')).doc},
 {name:'free-M',doc:editMaterialFaces(sheet(),line([25,50],[75,50])).doc},
 {name:'original-F',doc:read('output/playwright/material-weak-flat-original-F-1009.zhezhi.json')},
 {name:'hinge-F',doc:editMaterialFaces(hinge,{...line([20,20],[60,20],'F'),face}).doc}];
for(const item of items){item.doc.name=`弱边界三维-${item.name}`;fs.writeFileSync(`output/playwright/material-weak-sim-${item.name}-initial-1009.zhezhi.json`,exportDocument(item.doc,'json').text);}
console.log('Prepared eight actual CP inputs; no precomputed simulation meshes.');
