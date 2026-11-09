import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildFold,buildDiagramFold,distance} from '../../src/core/geometry';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {exportModelSnapshot,importModelSnapshot} from '../../src/core/modelSnapshot';
import {defaultAngle,type Doc,type Point,type Segment} from '../../src/core/types';
import {materialCutFixture} from '../fixtures/materialModel';

const segment=(id:string,a:Point,b:Point,assignment:Segment['assignment']='F'):Segment=>({id,a,b,assignment,angle:defaultAngle(assignment)});
const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-5,`${a} != ${b}`);
function fold(doc:Doc){const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.geometry.status,'ready',result.geometry.message);assert.equal(result.layers.status,'solved',result.layers.message);return result;}

test('diagram F crossing the whole sheet remains a real CP mark without adding a face or paper layer',()=>{
  const doc=blankDoc('预折标记',100,100);doc.segments.push(segment('precrease',[0,40],[100,40]));const before=structuredClone(doc);
  const normal=buildFold(doc),diagram=buildDiagramFold(doc),result=fold(doc);
  assert.equal(normal.graph.faces_vertices!.length,2,'ordinary editor semantics remain unchanged');assert.equal(computeFlatFold(doc).geometry.faces.length,2);
  assert.equal(diagram.graph.faces_vertices!.length,1);assert.equal(result.geometry.faces.length,1);assert.deepEqual(result.layers.faceOrder,[0]);
  assert.deepEqual(diagram.graph.vertices_coords,normal.graph.vertices_coords);assert.deepEqual(diagram.graph.edges_vertices,normal.graph.edges_vertices);assert.deepEqual(diagram.edgeSourceIds,normal.edgeSourceIds);
  assert.ok(diagram.graph.edges_assignment.includes('F'));assert.equal(diagram.graph.zhezhi_flatCreases,'marks');
  diagram.graph.edges_vertices.forEach((_,edge)=>{if(diagram.graph.edges_assignment[edge]==='F'){assert.deepEqual(diagram.graph.edges_faces![edge],[]);assert.ok(diagram.graph.faces_edges!.every(face=>!face.includes(edge)));}});
  assert.deepEqual(doc,before);assert.deepEqual(buildFold(doc),normal);
});

test('closed and intersecting diagram precrease marks do not create phantom panels or paper layers',()=>{
  const doc=blankDoc('闭合预折标记',100,100),corners:Point[]=[[20,20],[80,20],[80,80],[20,80]];
  corners.forEach((a,index)=>doc.segments.push(segment(`loop-${index}`,a,corners[(index+1)%4])));
  doc.segments.push(segment('diagonal-1',[0,0],[100,100]),segment('diagonal-2',[0,100],[100,0]));
  const result=fold(doc),graph=buildDiagramFold(doc).graph;
  assert.equal(graph.faces_vertices!.length,1);assert.equal(result.geometry.faces.length,1);assert.deepEqual(result.layers.faceOrder,[0]);
  assert.ok(graph.vertices_coords.some(point=>distance(point,[50,50])<1e-8),'CP intersections are retained');
  graph.vertices_coords.forEach((point,index)=>close(result.geometry.vertices[index],point));
  assert.equal(recomputeFlatLayers(result).layers.status,'solved');
});

test('diagram F tips and crossings follow their real folded faces while the physical layer count is unchanged',()=>{
  const doc=blankDoc('已折纸面预折标记',100,100);doc.segments.push(segment('old-fold',[50,0],[50,100],'V'),segment('precrease',[0,30],[100,30]),segment('finite',[20,70],[80,70]));
  const graph=buildDiagramFold(doc).graph,result=fold(doc);assert.equal(result.geometry.faces.length,2);assert.equal(result.layers.faceOrder!.length,2);
  graph.vertices_coords.forEach(([x,y],index)=>close(result.geometry.vertices[index],[x>50?100-x:x,y]));
  assert.deepEqual(result.geometry.faces,graph.faces_vertices);assert.ok(result.layers.faceOrders!.length>0);
  const again=recomputeFlatLayers(result);assert.equal(again.layers.status,'solved');assert.deepEqual(again.geometry,result.geometry);assert.deepEqual(again.layers.faceOrders,result.layers.faceOrders);
});

test('a retained diagram F route creates two real faces only when activated as M or V',()=>{
  const doc=blankDoc('启用已有折痕',100,100);doc.segments.push(segment('route',[0,40],[100,40]));
  assert.equal(fold(doc).geometry.faces.length,1);
  for(const assignment of ['M','V'] as const){const active=structuredClone(doc);active.segments[4]={...active.segments[4],assignment,angle:defaultAngle(assignment)};const result=fold(active);assert.equal(result.geometry.faces.length,2);assert.equal(result.layers.faceOrder!.length,2);}
  assert.equal(doc.segments[4].assignment,'F');
});

test('diagram snapshots bind the explicit mark mode while old ordinary snapshots preserve their F face numbering',()=>{
  const doc=blankDoc('两种快照用途',100,100);doc.segments.push(segment('route',[0,40],[100,40]));
  const marked=fold(doc),saved=exportModelSnapshot(doc,marked),loaded=importModelSnapshot(saved);
  assert.equal(JSON.parse(saved).version,4);assert.equal(JSON.parse(saved).model.flatCreases,'marks');assert.deepEqual(loaded.source,doc);assert.equal(loaded.graph.zhezhi_flatCreases,'marks');assert.deepEqual(loaded.result.geometry.faces,marked.geometry.faces);assert.equal(recomputeFlatLayers(loaded.result).layers.status,'solved');
  const ordinary=computeFlatFold(doc),legacyText=exportModelSnapshot(doc,ordinary),legacy=importModelSnapshot(legacyText);
  assert.equal(JSON.parse(legacyText).version,2);assert.equal(legacy.graph.zhezhi_flatCreases,undefined);assert.equal(legacy.result.geometry.faces.length,2);assert.deepEqual(legacy.result.geometry.faces,ordinary.geometry.faces);
  const invalid=JSON.parse(saved);invalid.model.flatCreases='fold';assert.throws(()=>importModelSnapshot(JSON.stringify(invalid)),/用途/);
  const noMode=JSON.parse(saved);delete noMode.model.flatCreases;assert.throws(()=>importModelSnapshot(JSON.stringify(noMode)),/字段/);
});

test('diagram mode cannot absorb invalid external marks, dangling active hinges, or independent material identities',()=>{
  const outside=blankDoc('纸外预折标记',100,100);outside.segments.push(segment('outside',[20,30],[120,30]));assert.notEqual(computeFlatFold(outside,undefined,{flatCreases:'marks'}).geometry.status,'ready');
  const active=blankDoc('悬空实际折痕',100,100);active.segments.push(segment('crease',[0,40],[100,40]),segment('hinge',[20,70],[80,70],'V'));assert.notEqual(computeFlatFold(active,undefined,{flatCreases:'marks'}).geometry.status,'ready');
  const {source}=materialCutFixture();assert.deepEqual(buildDiagramFold(source),buildFold(source));assert.equal(buildDiagramFold(source).graph.zhezhi_flatCreases,undefined);
});
