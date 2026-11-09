import fs from 'node:fs';
import assert from 'node:assert/strict';
import type {Doc} from '../src/core/types';
import {importDocument} from '../src/core/formats';
import {upgradeProject} from '../src/core/project';
import {splitEditableSegments} from '../src/app/planarize';
import {exportDXF,DXF_LAYERS} from '../src/core/dxf';
import {inspectMaterialTopology} from '../src/core/materialTopology';
import {inspectMaterialCurveModel} from '../src/core/materialCurveModel';
import {editMaterialFaces} from '../src/core/materialFaceEdit';
import {copyMaterialSelection,pasteMaterialSelection,cutMaterialSelection,buildMaterialClipboardPaste,type MaterialPasteIntent} from '../src/app/materialClipboard';
import {computeFlatFold} from '../src/core/flatFold';
import {prepareSimulationDocument} from '../src/engine/simmodel';
const text=(name:string,ext='zhezhi.json')=>fs.readFileSync(`output/playwright/material-location-move-model-clipboard-regression-${name}-1009.${ext}`,'utf8'),load=(name:string)=>importDocument(text(name),'json').doc,initial=(name:string)=>splitEditableSegments(upgradeProject(importDocument(fs.readFileSync(`output/playwright/material-clipboard-model-${name}-initial-1009.zhezhi.json`,'utf8'),'json').doc));
const mat=(d:Doc)=>{const m=inspectMaterialTopology(d);assert.ok(m.ok,m.ok?'':m.reason);return m;},model=(d:Doc)=>{const c=inspectMaterialCurveModel(d);assert.ok(c.ok,c.ok?'':c.reason);return c;},normalize=(d:Doc)=>{const n=upgradeProject(d);for(const key of ['sourceFormat','sourceFoldExtras','sourceFoldFrameExtras'])if(n.metadata)delete n.metadata[key];n.segments.sort((a,b)=>a.id.localeCompare(b.id));return JSON.parse(JSON.stringify(n));};
const same=(a:Doc,b:Doc)=>{assert.deepEqual(normalize(a),normalize(b));const am=inspectMaterialTopology(a),bm=inspectMaterialTopology(b);assert.equal(am.ok,bm.ok);if(am.ok&&bm.ok){assert.deepEqual(am.graph,bm.graph);assert.deepEqual(am.foldedVertices,bm.foldedVertices);assert.deepEqual(am.edgeSegmentIds,bm.edgeSegmentIds);}};
const source=initial('source'),target=initial('target'),request:MaterialPasteIntent={kind:'material-clipboard-paste',clipboard:copyMaterialSelection(source,mat(source).edgeSegmentIds),offset:[200,20],cpOnly:false,splitTarget:false,parametric:true},expected:Record<string,Doc>={cancel:target,undo:target};expected.applied=pasteMaterialSelection(target,request).doc;expected.redo=expected.applied;
const update=(d:Doc,offset:[number,number])=>{const c=model(d),recipe=c.model.groups[0].recipe;assert.equal(recipe.kind,'material-clipboard-paste');return editMaterialFaces(d,{kind:'material-curve-group-edit',group:c.model.groups[0].id,recipe:{...recipe,offset} as MaterialPasteIntent}).doc;};
expected['two-changed']=update(initial('two'),[300,-20]);expected['json-reedited']=update(expected.applied,[230,20]);expected['fold-reedited']=expected['json-reedited'];
for(const name of ['empty','plain','accordion','noff'])expected[name+'-final']=pasteMaterialSelection(initial(name),{...request,offset:[400,0],cpOnly:name==='noff'}).doc;
for(const name of ['hole','weak','original']){const s=initial(name);expected[name+'-final']=pasteMaterialSelection(initial('empty'),{...request,clipboard:copyMaterialSelection(s,mat(s).edgeSegmentIds),offset:[0,0]}).doc;}
const pasted=initial('pasted'),clipboard=copyMaterialSelection(pasted,mat(pasted).edgeSegmentIds);expected['cut-all']=cutMaterialSelection(pasted,{kind:'material-clipboard-cut',segmentIds:mat(pasted).edgeSegmentIds,lockBoundary:false,parametric:true}).doc;
const cutModel=model(expected['cut-all']),cutRecipe=cutModel.model.groups[1].recipe;assert.equal(cutRecipe.kind,'material-clipboard-cut');expected['cut-reedited']=editMaterialFaces(expected['cut-all'],{kind:'material-curve-group-edit',group:cutModel.model.groups[1].id,recipe:{...cutRecipe,segmentIds:mat(pasted).components[0].edges.map(e=>mat(pasted).edgeSegmentIds[e])} as typeof cutRecipe}).doc;expected['cut-undo']=expected['cut-all'];expected['cut-redo']=expected['cut-reedited'];expected['cut-pasted']=pasteMaterialSelection(initial('empty'),{...request,clipboard,offset:[0,0]}).doc;const {parametric:_,...plain}=request;expected.unrecorded=buildMaterialClipboardPaste(target,{...plain,clipboard,offset:[300,0]}).doc;
const cases:Record<string,unknown>={};
for(const [name,wanted] of Object.entries(expected)){
 const d=load(name);same(d,wanted);const fold=importDocument(text(name,'fold'),'fold').doc;
 // Ordinary empty FOLD omits the project title and ordinary metadata may be represented by importer extras.
 if(!inspectMaterialTopology(d).ok){assert.deepEqual(fold.segments,d.segments);assert.deepEqual(fold.paper,d.paper);if(d.metadata?.materialCurveModel)assert.deepEqual(model(fold).model,model(d).model);}else same(fold,d);
 if(d.metadata?.materialCurveModel)assert.ok(model(d));const file=text(name,'dxf');assert.equal(file,exportDXF(d).text);assert.ok(file.includes('AC1009')&&!file.includes('POLYLINE'));const pairs=file.trimEnd().split(/\r?\n/),rows:Map<number,string>[]=[];let row:Map<number,string>|null=null;for(let i=0;i<pairs.length;i+=2){const code=Number(pairs[i]),value=pairs[i+1];if(code===0){if(row)rows.push(row);row=value==='LINE'?new Map():null;}else if(row)row.set(code,value);}assert.equal(rows.length,d.segments.length);d.segments.forEach((s,i)=>{assert.equal(rows[i].get(8),DXF_LAYERS[s.assignment].name);for(const [code,value]of [[10,s.a[0]],[20,-s.a[1]],[11,s.b[0]],[21,-s.b[1]]])assert.ok(Number(rows[i].get(code))===value);});
 const m=inspectMaterialTopology(d),flat=m.ok?computeFlatFold(d):null;if(m.ok)prepareSimulationDocument(m.graph);cases[name]={segments:d.segments.length,groups:d.metadata?.materialCurveModel?model(d).model.groups.length:0,material:m.ok,flatGeometry:flat?.geometry.status,layers:flat?.layers.status,ordinaryR12LINEExact:true};
}
fs.writeFileSync('output/material-location-move-model-clipboard-regression-download-1009.json',JSON.stringify({verified:true,actualDownloads:true,cases,sourceSnapshots:true,sourceOriginsIndependent:true,emptyState:true,JSONFOLDReopen:true,exactOrdinaryLINE:true,physicalDeviceVerified:false},null,2));console.log(`Verified ${Object.keys(cases).length} actual JSON/FOLD/ordinary DXF groups: independent paste origins, later face replay, empty cut history and exact LINE coordinates/layers.`);
