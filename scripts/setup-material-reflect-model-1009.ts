import fs from 'node:fs';
import type {Doc} from '../src/core/types';
import {reflectModelBase} from '../tests/fixtures/materialReflectModel';
import {weakToolSheet,weakToolSource,weakToolAnchor,weakToolMaterial as mat} from '../tests/fixtures/materialWeakTools';
import {faceIdentityRecipe} from '../tests/fixtures/materialFaceIdentity';
import {reflectMaterialEdge} from '../src/core/materialReflect';
import {editMaterialFaces} from '../src/core/materialFaceEdit';
import {exportDocument} from '../src/core/formats';
const save=(name:string,d:Doc)=>{d.name=`参数单线镜像-${name}`;fs.writeFileSync(`output/playwright/material-reflect-model-${name}-initial-1009.zhezhi.json`,exportDocument(d,'json').text);};
const f=reflectModelBase();f.doc.segments.push({id:'mirror-axis-two',a:[0,55],b:[100,55],assignment:'A',angle:0});save('source',f.doc);const r=reflectMaterialEdge(f.doc,{...f.recipe,parametric:true});save('saved',r.doc);save('two',editMaterialFaces(r.doc,{...faceIdentityRecipe(r.doc,2),parametric:true}).doc);
const m=reflectModelBase('M');save('mountain',m.doc);const d=reflectModelBase();d.doc.segments.find(s=>s.id==='mirror-axis')!.a=[0,0];d.doc.segments.find(s=>s.id==='mirror-axis')!.b=[100,100];save('diagonal',d.doc);
for(const name of ['hole','weak']){const d=name==='hole'?weakToolSheet(true):weakToolSource('boundary'),line=editMaterialFaces(d,{kind:'material-face-trace',component:0,from:weakToolAnchor(d,[0,25]),to:weakToolAnchor(d,[100,25]),assignment:'F',fixedSide:'left',cpOnly:false}).doc;line.segments.push({id:'mirror-axis',a:name==='hole'?[0,37.5]:[0,0],b:name==='hole'?[100,37.5]:[100,100],assignment:'A',angle:0});save(name,line);}
const x=editMaterialFaces(f.doc,{kind:'material-face-trace',component:0,from:weakToolAnchor(f.doc,[50,0]),to:weakToolAnchor(f.doc,[50,100]),assignment:'F',fixedSide:'left',parametric:true}),ids=x.descendants.get(f.recipe.sourceId)!;save('split',reflectMaterialEdge(x.doc,{...f.recipe,sourceId:ids[0],sourceIds:ids,parametric:true}).doc);
console.log('Prepared F/M, exact diagonal, hole/weak bank, later chord and full subdivided source-span fixtures.');
