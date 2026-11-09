import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {diagramModelMarkup,diagramPresentation,drawingSVG} from '../../src/app/diagramDrawing';
import {projectDiagramFoldCP,mapDiagramFoldLines,diagramFoldFacesAtPoint} from '../../src/app/diagramFoldLink';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';

function fixture(){
  const doc=blankDoc('两纸层显示验证',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180},{id:'existing',a:[0,25],b:[100,25],assignment:'F',angle:0});
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.geometry.status,'ready');assert.equal(result.layers.status,'solved');
  const pose:DiagramPose={sourceStateId:'cp0',sourceRevision:0,sourceDoc:doc,result};return {doc,pose};
}
test('hiding a paper face removes its painting while retaining every original face ID, coordinate and camera extent',()=>{
  const {pose}=fixture(),before=structuredClone(pose),all=diagramPresentation(pose),top=all.order.at(-1)!,hidden={...pose,hiddenFaces:[top]};
  assert.deepEqual(diagramPresentation(hidden).order,all.order);assert.deepEqual(diagramPresentation(hidden).vertices,all.vertices);
  assert.deepEqual(diagramPresentation(hidden).visibleOrder,all.order.filter(f=>f!==top));
  assert.ok(!diagramModelMarkup(hidden).includes(`data-diagram-paper-face="${top}"`));
  assert.equal(diagramModelMarkup({...hidden,hiddenFaces:[0,1]}),'');assert.deepEqual(pose,before);
});
test('a hidden upper layer no longer occludes the lower layer crease preview or participates in main-canvas face picks',()=>{
  const {doc,pose}=fixture(),top=diagramPresentation(pose).order.at(-1)!,hidden={...pose,hiddenFaces:[top]},projected=projectDiagramFoldCP(hidden,doc,doc);
  assert.ok(projected.preview.length>0);assert.ok(projected.preview.every(part=>part.face!==top&&part.visibility==='visible'));
  assert.ok(diagramFoldFacesAtPoint(hidden,[25,40]).every(face=>face!==top));
  assert.deepEqual(diagramFoldFacesAtPoint({...hidden,hiddenFaces:[0,1]},[25,40]),[]);
});
test('visibility does not alter the material coverage of an explicit all-paper-layer crease operation',()=>{
  const {pose}=fixture(),line:DiagramLineAnnotation={id:'all-fold',kind:'line',a:[0,60],b:[50,60],style:'valley',color:'#293d35',width:.7},settings={enabled:true,layers:'all' as const,selectedFaces:[]};
  const visible=mapDiagramFoldLines(pose,[line],settings),hidden=mapDiagramFoldLines({...pose,hiddenFaces:[0,1]},[line],settings);
  assert.deepEqual(hidden.segments,visible.segments);assert.deepEqual(hidden.precreases,visible.precreases);
});
test('SVG export applies paper visibility to source creases and attached artwork without hiding independent drawing objects',()=>{
  const {doc,pose}=fixture(),hidden={...pose,hiddenFaces:[0,1]},annotations:DiagramLineAnnotation[]=[
    {id:'attached',kind:'line',a:[5,10],b:[25,10],style:'auxiliary',width:1,color:'#7f12ab',foldFaces:[0]},
    {id:'floating',kind:'line',a:[-10,10],b:[-5,20],style:'auxiliary',width:1,color:'#1fa23b',foldFaces:[]},
  ];
  const svg=drawingSVG(hidden,annotations,'图层显示','',projectDiagramFoldCP(pose,doc,doc).preview);
  assert.ok(!svg.includes('data-diagram-paper-face'));assert.ok(!svg.includes('#7f12ab'));assert.ok(svg.includes('#1fa23b'));
});
