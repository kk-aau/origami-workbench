import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareTessResult} from '../../src/app/tessellation';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {splitEditableSegments} from '../../src/app/planarize';
import {paperPath,paperFillRule} from '../../src/app/paper';
import {creasePatternSVG} from '../../src/app/creasePatternSVG';
import {defaultCreaseDisplay} from '../../src/app/creaseDisplay';
import {materialDoc} from '../fixtures/materialModel';
import {resolveStartingFace,setStartingFace} from '../../src/app/flatFoldSettings';
import {buildFold,distance} from '../../src/core/geometry';
import {diagnose} from '../../src/core/diagnostics';
import {computeFlatFold} from '../../src/core/flatFold';
import {exportDocument,importDocument,importFold} from '../../src/core/formats';
import {upgradeProject} from '../../src/core/project';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {wovenCutFold} from '../../src/app/wovenGraphInspection';
import {flatPresentation} from '../../src/app/flatPresentation';
import type {Doc,Point} from '../../src/core/types';

const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/woven-original-boundaries-20261001.json','utf8')).cases.filter((f:{name:string})=>f.name.startsWith('internal-diagonal'));
const create=(f=fixtures[0])=>wovenMaterialDocument(prepareTessResult(structuredClone(f.response),f.params),f.params);
const near=(a:Point[],b:Point[])=>{assert.equal(a.length,b.length);a.forEach((p,i)=>assert.ok(distance(p,b[i])<1e-8));};

test('four original cut sources survive replace, native save/reopen and material FOLD without welding or moving pieces',()=>{
  for(const fixture of fixtures){
    const doc=create(fixture),original=JSON.stringify(doc),material=inspectMaterialTopology(doc);assert.ok(material.ok);
    const expected=computeFlatFold(doc);assert.equal(expected.geometry.status,'ready',expected.geometry.message);assert.equal(expected.layers.status,'solved',expected.layers.message);
    for(const candidate of [doc,splitEditableSegments(upgradeProject(doc)),...(['json','fold'] as const).map(format=>splitEditableSegments(upgradeProject(importDocument(exportDocument(doc,format).text,format).doc)))]){
      const graph=buildFold(candidate).graph,read=inspectMaterialTopology(candidate);assert.ok(read.ok);
      assert.equal(graph.vertices_coords.length,14);assert.equal(graph.edges_vertices.length,16);assert.equal(graph.faces_vertices!.length,5);assert.equal(read.components.length,3);
      assert.deepEqual(graph.faces_edges,material.graph.faces_edges);assert.deepEqual(graph.edges_faces,material.graph.edges_faces);
      assert.equal(diagnose(candidate).summary.errors,0);assert.equal((paperPath(candidate).match(/Z/g)??[]).length,3);
      const root=resolveStartingFace(candidate,graph);assert.equal(root.stale,false);assert.equal(root.face,material.startingFace??0);
      const folded=computeFlatFold(candidate,undefined,{startingFace:root.face});assert.equal(folded.layers.status,'solved',folded.layers.message);near(folded.geometry.vertices,expected.geometry.vertices);
      const front=flatPresentation(folded,'front'),back=flatPresentation(folded,'back');assert.deepEqual(front.frontMaterial.map(x=>!x),back.frontMaterial);
    }
    assert.equal(JSON.stringify(doc),original,'roundtrips never change the source');
  }
});

test('downloaded original CP/FF pair imports only after independent material and isometry validation',()=>{
  for(const fixture of fixtures){
    const inspected=inspectWovenCutTopology(fixture.response,fixture.params);assert.ok(inspected.ok);
    const raw=JSON.parse(JSON.stringify(wovenCutFold(inspected.topology))),doc=importFold(raw).doc,material=inspectMaterialTopology(doc);assert.ok(material.ok);
    assert.equal(resolveStartingFace(doc,buildFold(doc).graph).face,inspected.topology.stationaryFoldFace);
    assert.deepEqual((doc.metadata!.sourceFoldExtras as Record<string,unknown>).zhezhi_source_edge,inspected.topology.edgeSource);
    assert.deepEqual((doc.metadata!.sourceFoldFrameExtras as Record<string,unknown>).zhezhi_source_face,inspected.topology.faceCorners.map((_,i)=>i));
    near(material.foldedVertices!,inspected.topology.splitFolded);assert.equal(buildFold(doc).graph.edges_vertices.length,16);
    const bad=structuredClone(raw);bad.file_frames[0].vertices_coords[0][0]+=.2;assert.throws(()=>importFold(bad));
    const bank=structuredClone(raw);bank.file_frames[0].faces_edges[0][0]=1;assert.throws(()=>importFold(bank));
  }
});

test('unbound edits and corrupt material metadata cannot fall back to the coordinate-welding path',()=>{
  const doc=create(),bad=structuredClone(doc);bad.segments[0].a[0]+=.2;
  assert.throws(()=>buildFold(bad));assert.throws(()=>splitEditableSegments(bad));assert.throws(()=>upgradeProject(bad));assert.throws(()=>exportDocument(bad,'json'));assert.equal(paperPath(bad),'');assert.ok(diagnose(bad).summary.errors>0);assert.notEqual(computeFlatFold(bad).geometry.status,'ready');
  const broken=structuredClone(doc);broken.metadata!.materialTopology=null;assert.throws(()=>buildFold(broken));assert.throws(()=>importDocument(JSON.stringify(broken),'json'));
  const raw=JSON.parse(exportDocument(doc,'fold').text);raw.edges_assignment[0]='M';assert.throws(()=>importFold(raw));
});

test('annotations and auxiliary edits survive save without changing material identity',()=>{
  const doc=create(),edited:Doc={...structuredClone(doc),name:'切口注释',segments:[...doc.segments.map(s=>({...s,displayColor:'#009eae'})),{id:'guide',a:[0,100],b:[200,100],assignment:'A',angle:0}],objects:[{id:'label',kind:'text',position:[50,50],text:'切口',fontSize:12,color:'#202124'}]};
  assert.equal(splitEditableSegments(edited),edited);assert.deepEqual(buildFold(edited).graph.edges_vertices,buildFold(doc).graph.edges_vertices);
  for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(edited,format).text,format).doc;assert.ok(inspectMaterialTopology(loaded).ok);assert.equal(loaded.segments.filter(s=>s.assignment==='A').length,1);}
});

test('material FOLD unit conversion applies to every piece, folded frame and auxiliary line with independent frame units',()=>{
  const doc=create();doc.segments.push({id:'aux',a:[10,20],b:[30,40],assignment:'A',angle:0});
  const raw=JSON.parse(exportDocument(doc,'fold').text),bad=structuredClone(raw);bad.frame_unit='cm';assert.throws(()=>importFold(bad),/单位/);
  raw.frame_unit='cm';raw.file_frames[0].frame_unit='cm';
  const loaded=importFold(raw).doc,old=inspectMaterialTopology(doc),next=inspectMaterialTopology(loaded);assert.ok(old.ok&&next.ok);
  near(next.graph.vertices_coords,old.graph.vertices_coords.map(([x,y])=>[x*10,y*10]));near(next.foldedVertices!,old.foldedVertices!.map(([x,y])=>[x*10,y*10]));
  assert.deepEqual(loaded.segments.at(-1)!.a,[100,200]);assert.equal(loaded.paper.width,doc.paper.width*10);assert.equal(next.components.length,3);
});

test('choosing another root transforms all pieces together and preserves every cross-piece distance',()=>{
  const doc=create(),initial=computeFlatFold(doc),material=inspectMaterialTopology(doc);assert.ok(material.ok);
  const target=(material.startingFace!+1)%5,changed=setStartingFace(doc,target),root=resolveStartingFace(changed,buildFold(changed).graph);assert.equal(root.face,target);
  const next=computeFlatFold(changed,undefined,{startingFace:root.face});assert.equal(next.layers.status,'solved',next.layers.message);
  const graph=buildFold(changed).graph;for(const v of graph.faces_vertices![target])assert.ok(distance(next.geometry.vertices[v],graph.vertices_coords[v])<1e-8);
  const a=initial.geometry.vertices,b=next.geometry.vertices;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)assert.ok(Math.abs(distance(a[i],a[j])-distance(b[i],b[j]))<1e-8);
});

test('separate overlapping material pieces retain positive fill winding in screen and exported SVG',()=>{
  const vertices:Point[]=[[0,0],[100,0],[100,100],[0,100],[50,50],[150,50],[150,150],[50,150]],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]];
  const doc=materialDoc({vertices_coords:vertices,edges_vertices:edges,edges_assignment:edges.map(()=>'B'),edges_foldAngle:edges.map(()=>0),faces_vertices:[[0,1,2,3],[4,5,6,7]],faces_edges:[[0,1,2,3],[4,5,6,7]],edges_faces:[[0],[0],[0],[0],[1],[1],[1],[1]],faces_faces:[[undefined,undefined,undefined,undefined],[undefined,undefined,undefined,undefined]] as unknown as number[][]},vertices);
  const material=inspectMaterialTopology(doc);assert.ok(material.ok);assert.equal(material.components.length,2);
  assert.equal(paperFillRule(doc),'nonzero');assert.equal((paperPath(doc).match(/Z/g)??[]).length,2);
  assert.match(creasePatternSVG(doc,defaultCreaseDisplay()),/fill-rule="nonzero"/);
  const ordinary={...doc,metadata:{}};assert.equal(paperFillRule(ordinary),'evenodd');
});
