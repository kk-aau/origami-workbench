import test from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import type {DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {diagramSymbolInitialSize,getSymbolParameters} from '../../src/app/diagramSymbolCatalog';
import {buildCadSymbolGeometry} from '../../src/app/diagramCadSymbolGeometry';
import {getCadSymbolBlock} from '../../src/app/diagramCadSymbols';
import {annotationBounds,diagramAnnotationMarkup,moveSymbolNativeGrip,symbolNativeBaseline,symbolNativeGrips,toggleSymbolNativeMirror} from '../../src/app/diagramAnnotationSVG';
import {createDiagramProject,exportDiagramProject,importDiagramProject,updateDiagramAnnotations} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';

const symbol=(patch:Partial<DiagramSymbolAnnotation>={}):DiagramSymbolAnnotation=>({id:'right-angle',kind:'symbol',symbol:'rightAngle',position:[120,85],size:100,rotation:0,color:'#293d35',width:.7,cadProperties:{},...patch});
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const pointClose=(actual:Point,expected:Point)=>{close(actual[0],expected[0]);close(actual[1],expected[1]);};
function world(annotation:DiagramSymbolAnnotation,local:Point):Point{
  const theta=annotation.rotation*Math.PI/180,x=local[0]*annotation.size/100*(annotation.mirrored?-1:1),y=local[1]*annotation.size/100;
  return [annotation.position[0]+x*Math.cos(theta)-y*Math.sin(theta),annotation.position[1]+x*Math.sin(theta)+y*Math.cos(theta)];
}
const center=(annotation:DiagramSymbolAnnotation)=>symbolNativeGrips(annotation).find(grip=>grip.id==='center'||grip.id==='base')!.point;

test('the CAD perpendicular marker uses its original external insert origin on the bisector extension',()=>{
  const annotation=symbol(),source=getCadSymbolBlock('rightAngle')!,geometry=buildCadSymbolGeometry(annotation),baseline=symbolNativeBaseline(annotation)!;
  assert.deepEqual(source.basePoint,[0,0,0]);
  pointClose(geometry.baseline.start,[-250/3,250/3]);
  assert.equal(baseline.rooted,true);pointClose(center(annotation),world(annotation,geometry.baseline.start));
  const corner:Point=[-50,50],armLength=100;
  close(corner[0]-geometry.baseline.start[0],armLength/3);close(geometry.baseline.start[1]-corner[1],armLength/3);
  assert.ok(center(annotation)[0]<world(annotation,corner)[0]&&center(annotation)[1]>world(annotation,corner)[1]);
  assert.ok(!symbolNativeGrips(annotation).some(grip=>grip.id==='start'),'the insert origin replaces a duplicate scale grip');
});

test('new compact perpendicular markers place their real external vertex at the clicked paper point',()=>{
  const size=diagramSymbolInitialSize('rightAngle',{width:900,height:700},{width:200,height:200});assert.equal(size,16);
  const annotation=symbol({size}),paperVertex:Point=[40,60],placed=moveSymbolNativeGrip(annotation,'center',paperVertex),geometry=buildCadSymbolGeometry(placed);
  pointClose(center(placed),paperVertex);pointClose(symbolNativeBaseline(placed)!.start,paperVertex);
  const visibleCorner=world(placed,[-50,50]);pointClose(visibleCorner,[paperVertex[0]+16/3,paperVertex[1]-16/3]);
  const bounds=annotationBounds([placed])!;assert.ok(bounds.width>=16&&bounds.width<18&&bounds.height>=16&&bounds.height<18);
  assert.equal(placed.size,size);assert.deepEqual(geometry.primitives,buildCadSymbolGeometry(annotation).primitives,'moving the virtual vertex only translates saved artwork');
});

test('scaled, rotated and mirrored perpendicular markers retain the same paper vertex without first-drag jumps',()=>{
  for(const rotation of [0,37,129])for(const mirrored of [false,true]){
    const annotation=symbol({size:16,rotation,mirrored}),before=structuredClone(annotation),anchor=center(annotation),baseline=symbolNativeBaseline(annotation)!;
    for(const grip of symbolNativeGrips(annotation))assert.deepEqual(moveSymbolNativeGrip(annotation,grip.id,grip.point),annotation);
    const scaled=moveSymbolNativeGrip(annotation,'end',[anchor[0]+(baseline.end[0]-anchor[0])*1.4,anchor[1]+(baseline.end[1]-anchor[1])*1.4]);
    close(scaled.size,annotation.size*1.4);pointClose(center(scaled),anchor);assert.deepEqual(scaled.cadProperties,annotation.cadProperties);
    assert.ok(!symbolNativeGrips(annotation).some(grip=>grip.id==='rotate'),'there is no invented generic rotation handle');
    const delta:Point=[-(baseline.end[1]-anchor[1]),baseline.end[0]-anchor[0]],theta=20*Math.PI/180;
    const rotated=moveSymbolNativeGrip(annotation,'rotate',[anchor[0]+Math.cos(theta)*delta[0]-Math.sin(theta)*delta[1],anchor[1]+Math.sin(theta)*delta[0]+Math.cos(theta)*delta[1]]);
    close(rotated.rotation,rotation+20);pointClose(center(rotated),anchor);
    for(const flip of symbolNativeGrips(annotation).filter(grip=>grip.semantic==='mirror'))pointClose(center(toggleSymbolNativeMirror(annotation,flip.id)),anchor);
    assert.deepEqual(annotation,before);
  }
});

test('native CAD dimension and independent arm-angle changes retain the real insert origin',()=>{
  const annotation=symbol({rotation:27,mirrored:true}),anchor=center(annotation);
  for(const [key,value] of [['距离1',7],['角度1',32],['角度2',46]] as const){
    const target=symbol({...annotation,cadProperties:{[key]:value}}),control=buildCadSymbolGeometry(target).controls.find(control=>control.key===key)!;
    const changed=moveSymbolNativeGrip(annotation,`cad:${key}`,world(annotation,control.point));
    close(changed.cadProperties![key],value);pointClose(center(changed),anchor);
  }
});

test('legacy parameter markers keep their old artwork and dimensions while moving from the external vertex',()=>{
  const annotation=symbol({size:95,rotation:23,mirrored:true,params:{length:84,height:60,markSize:18}});delete annotation.cadProperties;
  const snapshot=structuredClone(annotation),markup=diagramAnnotationMarkup(annotation),params=getSymbolParameters(annotation),localAnchor:Point=[-params.length*5/6,params.height*5/6];
  assert.equal(symbolNativeBaseline(annotation),null);pointClose(center(annotation),world(annotation,localAnchor));
  assert.match(markup,/M -42 -30 L -42 30 L 42 30/,'the saved visible L path is unchanged');
  const placed=moveSymbolNativeGrip(annotation,'base',[10,20]);pointClose(center(placed),[10,20]);assert.equal(placed.size,annotation.size);assert.deepEqual(placed.params,annotation.params);
  assert.deepEqual(symbolNativeGrips(annotation).map(grip=>grip.id),['base'],'unmapped legacy geometry exposes positioning only');
  const changed=moveSymbolNativeGrip(annotation,'component:length',world(annotation,[params.length/2+5,params.height/2]));
  pointClose(center(changed),center(annotation));assert.notEqual(changed.params?.length,annotation.params?.length);
  assert.equal(diagramAnnotationMarkup(annotation),markup);assert.deepEqual(annotation,snapshot);
});

test('reading and roundtripping old CAD or legacy right-angle artwork never rewrites saved size, position or shape',()=>{
  const legacy=symbol({id:'legacy',size:72});delete legacy.cadProperties;
  const cad=symbol({id:'cad',size:143,cadProperties:{'距离1':7,'角度1':28}}),annotations=[legacy,cad],snapshot=structuredClone(annotations),markup=annotations.map(diagramAnnotationMarkup);
  for(const annotation of annotations){symbolNativeGrips(annotation);symbolNativeBaseline(annotation);}
  let project=createDiagramProject(blankDoc('旧垂直符号',200,200));project=updateDiagramAnnotations(project,project.activeStepId,annotations);
  const restored=importDiagramProject(exportDiagramProject(project));assert.deepEqual(restored.steps[0].annotations,snapshot);
  assert.deepEqual(restored.steps[0].annotations!.map(diagramAnnotationMarkup),markup);assert.deepEqual(annotations,snapshot);
});
