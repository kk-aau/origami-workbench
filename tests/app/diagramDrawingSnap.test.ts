import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {snapDiagramDrawingLine} from '../../src/app/diagramDrawingSnap';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';
import {buildDiagramSnapReferences} from '../../src/app/diagramSnapReferences';
import {stationaryDiagramSnapReferences} from '../../src/app/diagramStationarySnapReferences';
import type {DiagramPose} from '../../src/app/diagramProject';
const line=(id:string,a:Point,b:Point):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'crease',color:'#293d35',width:.7});
const horizontal=line('horizontal',[0,0],[100,0]),vertical=line('vertical',[0,0],[0,100]);
const options={enabled:true,radius:5,targets:[] as Point[],lines:[horizontal,vertical],anchor:[0,0] as Point};
const close=(a:Point,b:Point)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7,`${a} != ${b}`);

test('a real endpoint overrides a nearby geometric direction without a false marker',()=>{
 const p:Point=[31,32],result=snapDiagramDrawingLine([32,32],{...options,targets:[p]});
 close(result.point,p);assert.equal(result.relation,null);
});
test('an endpoint exactly on an angle bisector retains its geometric feedback',()=>{
 const result=snapDiagramDrawingLine([31,32],{...options,targets:[[30,30]]});
 close(result.point,[30,30]);assert.equal(result.relation?.kind,'bisector');
});
test('a fixed endpoint on a perpendicular before the nearby foot still has a truthful right-angle marker',()=>{
 const result=snapDiagramDrawingLine([40,2],{...options,anchor:[40,50],lines:[horizontal],targets:[[40,2]]});
 close(result.point,[40,2]);assert.equal(result.relation?.kind,'perpendicular');close(result.relation!.vertex,[40,0]);close(result.relation!.point,result.point);
});
test('automatic angle bisectors take precedence over a nearby grid location',()=>{
 const result=snapDiagramDrawingLine([32,30],{...options,gridSpacing:5});
 close(result.point,[31,31]);assert.equal(result.relation?.kind,'bisector');
});
test('automatic perpendicular retains the pointer projection rather than jumping along the grid',()=>{
 const result=snapDiagramDrawingLine([31,40],{...options,anchor:[30,0],lines:[horizontal],gridSpacing:5});
 close(result.point,[30,40]);assert.equal(result.relation?.kind,'perpendicular');
});
test('Alt temporarily disables geometric snapping and the preset angle',()=>{
 const p:Point=[32,30],result=snapDiagramDrawingLine(p,{...options,altKey:true,anglePreset:90,gridSpacing:5});
 close(result.point,p);assert.equal(result.relation,null);
});
test('the snap checkbox disables automatic relations while preserving explicit angle presets',()=>{
 const free=snapDiagramDrawingLine([32,30],{...options,enabled:false});
 close(free.point,[32,30]);assert.equal(free.relation,null);
 const constrained=snapDiagramDrawingLine([0,40],{...options,enabled:false,anglePreset:90});
 assert.ok(Math.abs(constrained.point[0])<1e-7);assert.equal(constrained.relation,null);
});
test('Shift preserves its 45 degree ray even near a different perpendicular candidate',()=>{
 const a=20*Math.PI/180,reference=line('oblique',[0,0],[100*Math.cos(a),100*Math.sin(a)]);
 const result=snapDiagramDrawingLine([-13.68,37.59],{...options,lines:[reference],shiftKey:true});
 assert.ok(Math.abs(result.point[0])<1e-7&&result.point[1]>0);assert.equal(result.relation,null);
});
test('preset angle constraints are never pulled away by automatic geometry',()=>{
 const a=10*Math.PI/180,reference=line('oblique',[0,0],[100*Math.cos(a),100*Math.sin(a)]);
 const result=snapDiagramDrawingLine([-7,40],{...options,lines:[reference],anglePreset:30});
 assert.ok(Math.abs(result.point[0])<1e-7&&result.point[1]>0);assert.equal(result.relation,null);
});
test('a starting point can land on the middle of a finite reference edge',()=>{
 const result=snapDiagramDrawingLine([51,1],{...options,anchor:undefined,lines:[horizontal],gridSpacing:20});
 close(result.point,[51,0]);assert.equal(result.relation,null);
});
test('nearby intersections beyond the old first 120 references can still anchor a new line',()=>{
 const far=Array.from({length:200},(_,i)=>line('far-'+i,[1000+i,1000],[1000+i,1100]));
 const references=[...far,line('near-h',[0,20],[40,20]),line('near-v',[20,0],[20,40])];
 const before=structuredClone(references),result=snapDiagramDrawingLine([21,20.4],{...options,anchor:undefined,lines:references});
 close(result.point,[20,20]);assert.deepEqual(references,before);
});

test('a free endpoint can land anywhere on a finite reference, with truthful feedback',()=>{
 const result=snapDiagramDrawingLine([20,.2],{...options,anchor:[0,30],radius:2,lines:[horizontal]});
 close(result.point,[20,0]);assert.equal(result.relation,null);assert.equal(result.target?.kind,'edge');close(result.target!.point,result.point);
 const outside=snapDiagramDrawingLine([120,.2],{...options,anchor:[0,30],radius:2,lines:[horizontal]});
 close(outside.point,[120,.2]);assert.equal(outside.target,undefined);
});

test('geometric direction and finite paper edge combine at their exact intersection',()=>{
 const result=snapDiagramDrawingLine([39.5,41],{...options,radius:2,lines:[horizontal,vertical,line('end',[-10,40],[100,40])]});
 close(result.point,[40,40]);assert.equal(result.relation?.kind,'bisector');close(result.relation!.point,result.point);
});

test('Shift lands on a finite edge crossing without pulling the line off its constrained ray',()=>{
 const result=snapDiagramDrawingLine([30,1],{...options,anchor:[0,0],shiftKey:true,radius:2,lines:[line('end',[31,-10],[31,10])]});
 close(result.point,[31,0]);assert.equal(result.target?.kind,'edge');
});

test('start and endpoint feedback disappears immediately when snapping is disabled or Alt is held',()=>{
 for(const anchor of [undefined,[0,30] as Point])for(const disabled of [{enabled:false},{altKey:true}]){
   const result=snapDiagramDrawingLine([20,.2],{...options,anchor,lines:[horizontal],gridSpacing:5,...disabled});
   close(result.point,[20,.2]);assert.equal(result.target,undefined);assert.equal(result.relation,null);
 }
});

test('intersections are not lost behind more than 48 nearby references',()=>{
 const crowded=Array.from({length:60},(_,i)=>line('parallel-'+i,[0,i*.001],[40,i*.001]));
 const result=snapDiagramDrawingLine([20,0],{...options,anchor:undefined,radius:2,lines:[...crowded,line('cross',[20,-10],[20,10])]});
 close(result.point,[20,0]);assert.equal(result.target?.kind,'intersection');
});

test('cached reference geometry gives the same result as local intersection discovery',()=>{
 const lines=[line('h',[0,20],[40,20]),line('v',[20,0],[20,40])];
 const base={...options,anchor:undefined,lines};
 assert.deepEqual(snapDiagramDrawingLine([21,20.4],base),snapDiagramDrawingLine([21,20.4],{...base,intersections:[[20,20]]}));
});

test('a crease crossing a grid line offers its exact intersection rather than rounding off the crease',()=>{
 const reference=line('oblique',[0,3],[100,40]),gridSpacing=5;
 for(const anchor of [undefined,[0,70] as Point]){
  const result=snapDiagramDrawingLine([40.3,17.9],{...options,anchor,lines:[reference],radius:1,gridSpacing});
  close(result.point,[40,17.8]);assert.equal(result.target?.kind,'grid-intersection');close(result.target!.point,result.point);
 }
 const off=snapDiagramDrawingLine([40.3,17.9],{...options,anchor:undefined,lines:[reference],radius:1});
 assert.notEqual(off.target?.kind,'grid-intersection');
 const outside=snapDiagramDrawingLine([110,43.7],{...options,anchor:undefined,lines:[reference],radius:1,gridSpacing});
 assert.notEqual(outside.target?.kind,'grid-intersection');
});

test('paper boundary snapping combines with visible grid intersections',()=>{
 const paperEdge=line('paper-edge',[0,0],[0,100]);
 const result=snapDiagramDrawingLine([.3,25.2],{...options,anchor:[40,70],lines:[paperEdge],radius:1,gridSpacing:5});
 close(result.point,[0,25]);assert.equal(result.target?.kind,'grid-intersection');
});

test('visible diagonal grid crossings work without requiring a horizontal or vertical grid node',()=>{
 const reference=line('crease',[0,3],[100,40]);
 const result=snapDiagramDrawingLine([41.7,18.5],{...options,anchor:undefined,lines:[reference],radius:.3,gridSpacing:20,gridDiagonalSpacing:20});
 close(result.point,[57/1.37,3+.37*57/1.37]);assert.equal(result.target?.kind,'grid-intersection');
});

test('real folded paper boundaries retain exact grid crossings when drawing and moving a line endpoint',()=>{
 const sourceDoc=blankDoc('折后纸边网格交点',100,100);
 sourceDoc.segments.push({id:'diagonal-fold',a:[0,0],b:[100,100],assignment:'V',angle:180});
 const result=computeFlatFold(sourceDoc,undefined,{flatCreases:'marks'});assert.equal(result.layers.status,'solved');
 const view=defaultModelView(),pose:DiagramPose={sourceStateId:'cp',sourceRevision:0,sourceDoc,result,view};
 const moving=line('moving',[40,60],[45,45]),references=buildDiagramSnapReferences({pose,view,annotations:[moving]});
 const stationary=stationaryDiagramSnapReferences(references,[moving.id]);
 assert.ok(stationary.some(reference=>reference.id.startsWith('model-edge:')));
 const before=structuredClone({pose,moving});
 for(const lines of [references,stationary])for(const anchor of [undefined,[40,60] as Point]){
   const resolved=snapDiagramDrawingLine([25.3,25.1],{enabled:true,radius:1,targets:lines.flatMap(reference=>[reference.a,reference.b]),lines,grid:{origin:[0,0],stepX:25,stepY:25},anchor});
   close(resolved.point,[25,25]);assert.equal(resolved.target?.kind,'grid-intersection');
 }
 assert.deepEqual({pose,moving},before);
});
