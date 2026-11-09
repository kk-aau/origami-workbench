import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc,line} from '../../src/app/state';
import {buildDiagramFold} from '../../src/core/geometry';
import {materialFaceInside} from '../../src/core/materialRings';
import {buildDiagramCPLabelGeometry,diagramCPFaceLabelPoint,layoutDiagramCPLabels} from '../../src/components/diagramCPLabels';
import type {FoldGraph,Point} from '../../src/core/types';

test('full-size F/E names use sidebar atomic topology, including split edges and F marks',()=>{
  const doc=blankDoc('CP names',100,100);
  doc.segments.push({...line([50,0],[50,100],'V'),id:'valley'},{...line([0,50],[100,50],'F'),id:'flat'},{...line([10,10],[20,20],'A'),id:'auxiliary'});
  const snapshot=structuredClone(doc),expected=buildDiagramFold(doc),geometry=buildDiagramCPLabelGeometry(doc);
  assert.deepEqual(geometry.graph,expected.graph);assert.deepEqual(geometry.edgeSourceIds,expected.edgeSourceIds);
  assert.equal(geometry.faces.length,2,'F marks must not create extra material faces');
  assert.ok(geometry.edgeSourceIds.filter(ids=>ids.includes('flat')).length>=2,'E indices name atomic edges, not source segment order');
  assert.ok(geometry.edgeSourceIds.every(ids=>!ids.includes('auxiliary')));
  const labels=layoutDiagramCPLabels(geometry,{view:{x:-10,y:-10,w:120,h:120},units:.2},{faces:true,edges:true},new Set(['valley']));
  assert.ok(labels.some(label=>label.kind==='face'));assert.ok(labels.some(label=>label.kind==='edge'&&label.selected));
  for(const label of labels){
    assert.equal(label.text,`${label.kind==='face'?'F':'E'}${label.index+1}`);
    if(label.kind==='face')assert.ok(materialFaceInside(expected.graph,label.index,label.point));
    else assert.ok(expected.graph.edges_vertices[label.index]);
  }
  assert.deepEqual(doc,snapshot);
});

test('face anchor remains in actual concave and holed material',()=>{
  const examples:{points:Point[];outer:number[];holes?:number[][]}[]=[
    {points:[[0,0],[100,0],[100,20],[20,20],[20,100],[0,100]],outer:[0,1,2,3,4,5]},
    {points:[[0,0],[100,0],[100,100],[0,100],[10,10],[10,90],[90,90],[90,10]],outer:[0,1,2,3],holes:[[4,5,6,7]]},
  ];
  for(const example of examples){
    const graph:FoldGraph={vertices_coords:example.points,edges_vertices:[],edges_assignment:[],edges_foldAngle:[],faces_vertices:[example.outer],faces_holes:[example.holes??[]]};
    const anchor=diagramCPFaceLabelPoint(graph,0);assert.ok(anchor);assert.ok(anchor.clearance>0);assert.ok(materialFaceInside(graph,0,anchor.point));
  }
});

test('zoom reveals dense small faces and their edge names without renumbering',()=>{
  const doc=blankDoc('dense CP names',100,100);
  for(let x=10;x<100;x+=10)doc.segments.push({...line([x,0],[x,100],'V'),id:`v-${x}`});
  for(let y=10;y<100;y+=10)doc.segments.push({...line([0,y],[100,y],'V'),id:`h-${y}`});
  const geometry=buildDiagramCPLabelGeometry(doc),snapshot=structuredClone(geometry),show={faces:true,edges:true};
  const far=layoutDiagramCPLabels(geometry,{view:{x:-10,y:-10,w:120,h:120},units:1},show,new Set());
  const near=layoutDiagramCPLabels(geometry,{view:{x:-1,y:-1,w:32,h:32},units:.05},show,new Set());
  assert.equal(far.filter(label=>label.kind==='face').length,0);
  assert.ok(near.filter(label=>label.kind==='face').length>=9);
  assert.ok(near.filter(label=>label.kind==='edge').length>far.filter(label=>label.kind==='edge').length);
  for(const label of near)assert.equal(label.text,`${label.kind==='face'?'F':'E'}${label.index+1}`);
  assert.deepEqual(geometry,snapshot);
});

test('name switches and panning only change labels; visible labels stay separated in pixel space',()=>{
  const doc=blankDoc('CP names viewport',100,100);doc.segments.push(line([0,0],[100,100],'M'));
  const geometry=buildDiagramCPLabelGeometry(doc),view={x:-10,y:-10,w:120,h:120},units=.25;
  const all=layoutDiagramCPLabels(geometry,{view,units},{faces:true,edges:true},new Set());
  assert.ok(all.some(label=>label.kind==='face')&&all.some(label=>label.kind==='edge'));
  for(const [faces,edges] of [[false,false],[true,false],[false,true]]){
    const labels=layoutDiagramCPLabels(geometry,{view,units},{faces,edges},new Set());
    assert.ok(labels.every(label=>label.kind==='face'?faces:edges));
  }
  assert.deepEqual(layoutDiagramCPLabels(geometry,{view:{...view,x:500,y:500},units},{faces:true,edges:true},new Set()),[]);
  const boxes=all.map(label=>{const x=(label.point[0]-view.x)/units,y=(label.point[1]-view.y)/units,w=label.text.length*12*.32+2;return {l:x-w,r:x+w,t:y-8,b:y+8};});
  boxes.forEach((a,i)=>boxes.slice(i+1).forEach(b=>assert.ok(a.r+3<=b.l||b.r+3<=a.l||a.b+3<=b.t||b.b+3<=a.t)));
});
