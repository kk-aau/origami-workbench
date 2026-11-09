import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLParser} from 'fast-xml-parser';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
import {foldedModelComparisonSVG} from '../../src/app/foldedModelComparisonSVG';
import {startModelComparisonExport} from '../../src/app/modelComparisonExportTask';
import {startModelBoardExport} from '../../src/app/modelBoardExportTask';
import {fittedModelCamera} from '../../src/app/modelCamera';
import {defaultModelView} from '../../src/app/modelViewState';
import {computeFlatFold} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
import {emptyFoldedModelCollection,foldedModelCollectionReducer as reduce} from '../../src/app/foldedModelCollection';
import {buildFold} from '../../src/core/geometry';
const parser=new XMLParser({ignoreAttributes:false});
const camera={rotation:0,x:20,y:25,width:30,height:40};
const geometry=()=>computeFlatFold(blankDoc('范围',100,100));
test('camera export uses exact rectangle and explicit clip without altering model coordinates',()=>{
 const result=geometry(),before=structuredClone(result),svg=foldedModelSVG(result,{name:'范围',side:'front',camera}),inner=parser.parse(svg).svg.svg;
 assert.equal(inner['@_viewBox'],'20 25 30 40');assert.equal(inner.defs.clipPath.rect['@_width'],'30');assert.equal(inner.g['@_clip-path'],'url(#model-camera-clip)');assert.deepEqual(result,before);
 assert.notEqual(parser.parse(foldedModelSVG(result,{name:'完整',side:'front'})).svg.svg['@_viewBox'],'20 25 30 40');
 for(const change of [{width:0},{x:Infinity},{rotation:90}])assert.throws(()=>foldedModelSVG(result,{name:'无效',side:'front',camera:{...camera,...change}}),/相机/);
});
test('multi-pane range exports use matching cameras and fit missing or outdated angles',()=>{
 const result=geometry(),view={...defaultModelView(),layout:'both' as const,cameras:{'front-solid':camera,'back-solid':{...camera,rotation:90}}};
 const svg=foldedModelComparisonSVG(result,'双面',view,{},'camera'),images=parser.parse(svg).svg.image;
 const sheets=images.map((i:any)=>parser.parse(decodeURIComponent(i['@_href'].split(',').slice(1).join(','))).svg.svg);
 assert.equal(sheets[0]['@_viewBox'],'20 25 30 40');assert.notEqual(sheets[1]['@_viewBox'],'20 25 30 40');assert.deepEqual(fittedModelCamera([[0,0],[100,100]],0),{rotation:0,x:-16,y:-16,width:132,height:132});
});
test('async range export freezes camera and rejects unknown framing',async()=>{
 const view={...defaultModelView(),cameras:{'front-solid':{...camera}}},result=geometry();const job=startModelComparisonExport(result,'冻结',view,1000,undefined,'camera');view.cameras['front-solid'].x=999;
 const reply=await job.promise;assert.equal(reply.status,'complete');if(reply.status==='complete')assert.match(reply.svg,/viewBox="20 25 30 40"/);
 assert.throws(()=>startModelComparisonExport(result,'错误',view,1000,undefined,'bad' as any),/范围/);
});
test('board range is passed through to real nested model sheets',async()=>{
 const doc=blankDoc('图板范围',100,100);let state=reduce(emptyFoldedModelCollection(),{type:'add',id:'a',name:'A',source:{doc,graph:buildFold(doc).graph},result:computeFlatFold(doc)});
 state=reduce(state,{type:'view',id:'a',view:{...defaultModelView(),cameras:{'front-solid':camera}}});
 const reply=await startModelBoardExport(state,undefined,'camera').promise;assert.equal(reply.status,'complete');if(reply.status==='complete'){const inner=parser.parse(reply.svg).svg.svg.image['@_href'];assert.match(decodeURIComponent(inner.split(',').slice(1).join(',')),/viewBox="20 25 30 40"/);assert.match(reply.svg,/当前视图范围/);}
 assert.throws(()=>startModelBoardExport(state,undefined,'bad' as any),/范围/);
});
