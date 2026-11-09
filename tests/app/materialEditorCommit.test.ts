import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {prepareTessResult} from '../../src/app/tessellation';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {exampleDoc,assign,swap,transformSelection} from '../../src/app/state';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import {setStartingFace,clearStartingFace,resolveStartingFace} from '../../src/app/flatFoldSettings';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {computeFlatFold} from '../../src/core/flatFold';
import {exportDocument,importDocument} from '../../src/core/formats';
import {buildFold,distance} from '../../src/core/geometry';
import {materialDoc,materialCutFixture} from '../fixtures/materialModel';
import type {Doc,FoldGraph,Point} from '../../src/core/types';

function material(doc:Doc){const result=inspectMaterialTopology(doc);assert.ok(result.ok,result.ok?'':result.reason);return result;}
function near(a:Point[],b:Point[]){assert.equal(a.length,b.length);a.forEach((p,i)=>assert.ok(distance(p,b[i])<1e-7,`${i}: ${p} != ${b[i]}`));}
function hinged():Doc{
  const vertices:Point[]=[[0,0],[100,0],[200,0],[0,100],[100,100],[200,100]];
  const graph:FoldGraph={vertices_coords:vertices,edges_vertices:[[0,1],[1,2],[2,5],[5,4],[4,3],[3,0],[1,4]],edges_assignment:['B','B','B','B','B','B','M'],edges_foldAngle:[0,0,0,0,0,0,-180],faces_vertices:[[0,1,4,3],[1,2,5,4]],faces_edges:[[0,6,4,5],[1,2,3,6]],edges_faces:[[0],[1],[1],[1],[0],[0],[0,1]],faces_faces:[[null,1,null,null],[null,null,null,0]] as unknown as number[][]};
  return materialDoc(graph,[[0,0],[100,0],[0,0],[0,100],[100,100],[0,100]]);
}

test('central editor commit keeps the ordinary intersection path and document validation',()=>{
  const doc=exampleDoc('blank'),next={...doc,segments:[...doc.segments,{id:'m',a:[0,100] as Point,b:[200,100] as Point,assignment:'M' as const,angle:-180},{id:'v',a:[100,0] as Point,b:[100,200] as Point,assignment:'V' as const,angle:180}]};
  const result=prepareEditorCommit(doc,next);assert.equal(result.descendants.get('m')!.length,2);assert.equal(result.descendants.get('v')!.length,2);
  assert.throws(()=>prepareEditorCommit(doc,{...next,segments:[...next.segments,next.segments[0]]}),/重复/);
});

test('all four original cut constructions can swap mountains and valleys, refold, save and reopen without welding',()=>{
  const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/woven-original-boundaries-20261001.json','utf8')).cases.filter((f:{name:string})=>f.name.startsWith('internal-diagonal'));
  for(const fixture of fixtures){
    const source=wovenMaterialDocument(prepareTessResult(fixture.response,fixture.params),fixture.params),before=JSON.stringify(source),old=material(source);
    const next=prepareEditorCommit(source,{...source,segments:swap(source.segments,new Set(source.segments.map(s=>s.id)))}).doc;
    assert.notDeepEqual(next.segments,source.segments);assert.equal(JSON.stringify(source),before);
    for(const candidate of [next,...(['json','fold'] as const).map(format=>importDocument(exportDocument(next,format).text,format).doc)]){
      const actual=material(candidate);assert.equal(actual.components.length,3);assert.equal(actual.graph.edges_vertices.length,16);assert.equal(actual.graph.vertices_coords.length,14);
      near(actual.foldedVertices!,old.foldedVertices!);assert.deepEqual(actual.graph.faces_edges,old.graph.faces_edges);assert.equal(resolveStartingFace(candidate,actual.graph).face,old.startingFace);
      const flat=computeFlatFold(candidate);assert.equal(flat.layers.status,'solved',flat.layers.message);assert.equal(flat.geometry.faces.length,5);
    }
  }
});

test('target angles, unknown assignments and flat hinges keep distinct semantics through real commit and compute',()=>{
  const source=hinged(),id=source.segments[6].id;
  for(const angle of [0,-63,null]){
    const next=prepareEditorCommit(source,{...source,segments:source.segments.map(s=>s.id===id?{...s,angle}:s)}).doc;
    assert.equal(material(next).graph.edges_foldAngle[6],angle);near(material(next).foldedVertices!,material(source).foldedVertices!);
    assert.equal(computeFlatFold(next).layers.status,'solved');
  }
  const unassigned=prepareEditorCommit(source,{...source,segments:assign(source.segments,new Set([id]),'U')}).doc;
  assert.equal(computeFlatFold(unassigned).geometry.status,'ready');assert.equal(computeFlatFold(unassigned).layers.status,'unknown');
  const unfolded=prepareEditorCommit(source,{...source,segments:assign(source.segments,new Set([id]),'F')}).doc;
  near(material(unfolded).foldedVertices!,material(unfolded).graph.vertices_coords);
  const again=prepareEditorCommit(unfolded,{...unfolded,segments:assign(unfolded.segments,new Set([id]),'M')}).doc;
  near(material(again).foldedVertices!,material(source).foldedVertices!);assert.equal(computeFlatFold(again).layers.status,'solved');
});

test('a valid nonuniform coordinate edit recomputes the hinge and preserves chosen face identity',()=>{
  const source=setStartingFace(hinged(),1),change=(p:Point):Point=>[p[0]===200?240:p[0],p[1]];
  const next=prepareEditorCommit(source,{...source,segments:source.segments.map(s=>({...s,a:change(s.a),b:change(s.b)}))}).doc;
  const actual=material(next);assert.equal(actual.foldedVertices![2][0],-40);assert.equal(actual.foldedVertices![5][0],-40);
  assert.deepEqual(resolveStartingFace(next,actual.graph),{face:1,stale:false});
  const chosen=computeFlatFold(next,undefined,{startingFace:1});assert.equal(chosen.layers.status,'solved');
  for(const v of actual.graph.faces_vertices![1])assert.ok(distance(chosen.geometry.vertices[v],actual.graph.vertices_coords[v])<1e-7);
});

test('whole material component movement transports only that component and complete history frames survive undo redo',()=>{
  const source=materialCutFixture().source,old=material(source),component=old.components[0],ids=new Set(component.edges.map(e=>old.edgeSegmentIds[e]));
  const next=prepareEditorCommit(source,transformSelection(source,ids,'move',17,-9),{kind:'move',segmentIds:[...ids],a:17,b:-9}).doc,actual=material(next),moved=new Set(component.vertices);
  near(actual.foldedVertices!,old.foldedVertices!.map((p,v)=>moved.has(v)?[p[0]+17,p[1]-9]:p));
  let history=emptyEditorHistory(source);history=editorHistoryReducer(history,{type:'commit',doc:next});
  assert.equal(history.past.length,1);history=editorHistoryReducer(history,{type:'undo'});assert.deepEqual(history.present,source);
  history=editorHistoryReducer(history,{type:'redo'});assert.deepEqual(history.present,next);assert.ok(inspectMaterialTopology(history.present).ok);
  const loaded=importDocument(exportDocument(next,'json').text,'json').doc;near(material(loaded).foldedVertices!,actual.foldedVertices!);
});

test('explicit root selection and reset still commit, while ambiguous topology edits fail before any history frame',()=>{
  const source=materialCutFixture().source,old=JSON.stringify(source),root=1;
  const chosen=prepareEditorCommit(source,setStartingFace(source,root)).doc;assert.equal(resolveStartingFace(chosen,buildFold(chosen).graph).face,root);
  const reset=prepareEditorCommit(chosen,clearStartingFace(chosen)).doc;assert.equal(reset.flatFold,undefined);assert.equal(resolveStartingFace(reset,buildFold(reset).graph).face,material(source).startingFace);
  const bads:Doc[]=[{...source,metadata:{}},{...source,segments:source.segments.slice(1)},{...source,segments:[...source.segments,{id:'new',a:[5,6],b:[22,38],assignment:'M',angle:-180}]}];
  const torn=structuredClone(source);torn.segments[0].a[0]+=.1;bads.push(torn);
  for(const bad of bads)assert.throws(()=>prepareEditorCommit(source,bad));assert.equal(JSON.stringify(source),old);
});
