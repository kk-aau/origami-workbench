import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFlatFold, recomputeFlatLayers } from '../../src/core/flatFold';
import { blankDoc } from '../../src/app/state';
import { moveFoldedVertices } from '../../src/app/foldedVertexEdit';
import { splitIntersections } from '../../src/core/geometry';
import type { FlatFoldResult, Point } from '../../src/core/types';

test('layer reanalysis uses deformed coordinates rather than recreating original paper',()=>{
  const doc=blankDoc('变形',100,100),original=computeFlatFold(doc),before=structuredClone(doc);
  const changed=moveFoldedVertices(original,{group:[0],selected:[0]},[-20,-10]);
  const snapshot=structuredClone(changed),solved=recomputeFlatLayers(changed);
  assert.equal(solved.layers.status,'solved',solved.layers.message);
  assert.deepEqual(solved.geometry.vertices,changed.geometry.vertices);assert.equal(solved.geometry.modified,true);
  assert.match(solved.layers.message,/不证明原折痕/);assert.deepEqual(changed,snapshot);assert.deepEqual(doc,before);
});
test('an unchanged valid folded model can be independently reanalysed',()=>{
  const doc=blankDoc('对折',100,100);doc.segments.push({id:'m',a:[50,0],b:[50,100],assignment:'M',angle:-180});
  doc.segments=splitIntersections(doc).segments;
  const original=computeFlatFold(doc),result=recomputeFlatLayers(original);
  assert.equal(result.layers.status,'solved');assert.deepEqual(result.geometry.vertices,original.geometry.vertices);
  assert.deepEqual(result.layers.faceOrders,original.layers.faceOrders);
});
test('collapsed edge and inconsistent cached graph return errors, never reuse solved order',()=>{
  const original=computeFlatFold(blankDoc('纸',100,100));
  const collapsed=moveFoldedVertices(original,{group:[0],selected:[0]},original.geometry.vertices[1]);
  const result=recomputeFlatLayers(collapsed);assert.equal(result.layers.status,'error');assert.match(result.layers.message,/零长边/);assert.equal(result.layers.faceOrder,undefined);
  const inconsistent=structuredClone(original);inconsistent.geometry.vertices=structuredClone(inconsistent.geometry.vertices);inconsistent.geometry.vertices[0][0]-=1;
  assert.equal(recomputeFlatLayers(inconsistent).layers.status,'error');
});
test('self-crossing star is rejected even though successive turns have the same sign',()=>{
  const vertices:Point[]=Array.from({length:5},(_,i)=>[Math.cos(i*2*Math.PI/5)*100,Math.sin(i*2*Math.PI/5)*100]);
  const faces=[[0,2,4,1,3]],edges=faces[0].map((v,i)=>[v,faces[0][(i+1)%5]] as [number,number]);
  const input:FlatFoldResult={geometry:{status:'ready',message:'',modified:true,vertices,faces,graph:{vertices_coords:vertices,faces_vertices:faces,edges_vertices:edges,edges_assignment:edges.map(()=>'B'),edges_foldAngle:edges.map(()=>0)}},layers:{status:'solved',message:'obsolete',faceOrder:[0]},warnings:[]};
  const result=recomputeFlatLayers(input);assert.equal(result.layers.status,'unsupported');assert.equal(result.layers.faceOrder,undefined);assert.deepEqual(result.geometry.vertices,vertices);
});
test('unknown assignments and missing models remain distinct from proven no solution',()=>{
  const doc=blankDoc('未知',100,100);doc.segments.push({id:'u',a:[50,0],b:[50,100],assignment:'U',angle:null});doc.segments=splitIntersections(doc).segments;
  assert.equal(recomputeFlatLayers(computeFlatFold(doc)).layers.status,'unknown');
  const missing=computeFlatFold(blankDoc());delete missing.geometry.graph;
  assert.equal(recomputeFlatLayers(missing).layers.status,'error');
});
