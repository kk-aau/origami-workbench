import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {Doc,FoldGraph,Point} from '../../src/core/types';
import {createMaterialTopology,inspectMaterialTopology} from '../../src/core/materialTopology';
import {computeFlatFold} from '../../src/core/flatFold';
import {importDocument,exportDocument} from '../../src/core/formats';
import {reconcileMaterialEdit,type MaterialTransformIntent} from '../../src/app/materialEdit';
import {assign,swap,transformSelection,exampleDoc} from '../../src/app/state';
import {setStartingFace,clearStartingFace,resolveStartingFace} from '../../src/app/flatFoldSettings';
import {prepareTessResult} from '../../src/app/tessellation';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {materialDoc,materialCutFixture,materialSlitFixture} from '../fixtures/materialModel';

function read(doc:Doc){const result=inspectMaterialTopology(doc);assert.ok(result.ok,result.ok?'':result.reason);return result;}
function near(actual:Point[],expected:Point[]){assert.equal(actual.length,expected.length);actual.forEach((p,v)=>assert.ok(Math.hypot(p[0]-expected[v][0],p[1]-expected[v][1])<2e-10,`V${v}: ${p} != ${expected[v]}`));}
function hinged():Doc{
  const vertices:Point[]=[[0,0],[100,0],[200,0],[0,100],[100,100],[200,100]];
  const graph:FoldGraph={vertices_coords:vertices,edges_vertices:[[0,1],[1,2],[2,5],[5,4],[4,3],[3,0],[1,4]],edges_assignment:['B','B','B','B','B','B','M'],edges_foldAngle:[0,0,0,0,0,0,-180],faces_vertices:[[0,1,4,3],[1,2,5,4]],faces_edges:[[0,6,4,5],[1,2,3,6]],edges_faces:[[0],[1],[1],[1],[0],[0],[0,1]],faces_faces:[[null,1,null,null],[null,null,null,0]] as unknown as number[][]};
  return materialDoc(graph,[[0,0],[100,0],[0,0],[0,100],[100,100],[0,100]]);
}
function originalSources():Doc[]{
  const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/woven-original-boundaries-20261001.json','utf8')).cases.filter((f:{name:string})=>f.name.startsWith('internal-diagonal'));
  assert.equal(fixtures.length,4);return fixtures.map((f:any)=>wovenMaterialDocument(prepareTessResult(f.response,f.params),f.params));
}
function referenceTransform(doc:Doc,intent:MaterialTransformIntent){
  const ids=new Set(intent.segmentIds),points=doc.segments.filter(s=>ids.has(s.id)).flatMap(s=>[s.a,s.b]);
  const cx=(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,cy=(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2;
  return (p:Point):Point=>{
    if(intent.kind==='move')return [p[0]+intent.a,p[1]+(intent.b??0)];
    if(intent.kind==='mirrorX')return [2*cx-p[0],p[1]];
    if(intent.kind==='mirrorY')return [p[0],2*cy-p[1]];
    if(intent.kind==='scale')return [cx+intent.a*(p[0]-cx),cy+intent.a*(p[1]-cy)];
    const angle=intent.a*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=p[0]-cx,y=p[1]-cy;
    return [cx+c*x-s*y,cy+s*x+c*y];
  };
}

test('ordinary docs retain the old path; material replacement, removal and corrupt previous contracts fail closed',()=>{
  const ordinary=exampleDoc(),next={...ordinary,name:'ordinary'};assert.equal(reconcileMaterialEdit(ordinary,next),next);
  const source=materialCutFixture().source;
  assert.throws(()=>reconcileMaterialEdit(ordinary,source),/打开或采用/);
  assert.throws(()=>reconcileMaterialEdit(source,{...source,metadata:{}}),/不能删除/);
  const corrupt=structuredClone(source);corrupt.metadata!.materialTopology=null;
  assert.throws(()=>reconcileMaterialEdit(corrupt,source));
  const replaced=structuredClone(source);(replaced.metadata!.materialTopology as any).foldedVertices[0][0]+=.01;
  assert.throws(()=>reconcileMaterialEdit(source,replaced),/替换/);
});

test('four genuine cut sources update M/V/U and target angles without mutating or welding the source FF',()=>{
  for(const source of originalSources()){
    const old=read(source),snapshot=JSON.stringify(source),ids=new Set(source.segments.map(s=>s.id));
    const proposed={...source,segments:swap(source.segments,ids)},proposedSnapshot=JSON.stringify(proposed),next=reconcileMaterialEdit(source,proposed),actual=read(next);
    assert.equal(JSON.stringify(source),snapshot);assert.equal(JSON.stringify(proposed),proposedSnapshot);
    assert.deepEqual(actual.foldedVertices,old.foldedVertices);assert.deepEqual(actual.graph.faces_edges,old.graph.faces_edges);assert.deepEqual(actual.components,old.components);
    assert.notDeepEqual(actual.graph.edges_assignment,old.graph.edges_assignment);assert.notEqual(JSON.stringify(next),snapshot,'the caller must invalidate previous layers by revision');
    const crease=next.segments.find(s=>s.assignment==='M'||s.assignment==='V')!;
    for(const angle of [null,0,crease.assignment==='M'?-73:73]){
      const changed=reconcileMaterialEdit(next,{...next,segments:next.segments.map(s=>s.id===crease.id?{...s,angle}:s)});
      assert.equal(changed.segments.find(s=>s.id===crease.id)!.angle,angle);assert.deepEqual(read(changed).foldedVertices,old.foldedVertices);
    }
    const unassigned=reconcileMaterialEdit(next,{...next,segments:assign(next.segments,new Set([crease.id]),'U')});
    assert.deepEqual(read(unassigned).foldedVertices,old.foldedVertices);assert.equal(computeFlatFold(unassigned).layers.status,'unknown');
    for(const format of ['json','fold'] as const){const loaded=importDocument(exportDocument(next,format).text,format).doc;assert.deepEqual(read(loaded).graph,actual.graph);assert.deepEqual(read(loaded).foldedVertices,actual.foldedVertices);}
  }
});

test('auxiliary lines, annotations, display colours and selected root changes remain independent of material geometry',()=>{
  const source=materialCutFixture().source;
  const next:Doc={...source,name:'材料注释',segments:[...source.segments.map(s=>({...s,displayColor:'#00aacc'})),{id:'guide',a:[0,100],b:[200,100],assignment:'A',angle:0}],objects:[{id:'text',kind:'text',position:[4,8],text:'切口',fontSize:10,color:'#333333'}]};
  assert.equal(reconcileMaterialEdit(source,next),next);assert.deepEqual(read(next).graph,read(source).graph);
  const selected=setStartingFace(source,3),chosen=reconcileMaterialEdit(source,selected);assert.equal(resolveStartingFace(chosen,read(chosen).graph).face,3);
  const cleared=reconcileMaterialEdit(chosen,clearStartingFace(chosen));assert.equal(cleared.flatFold,undefined);
  const swapped=reconcileMaterialEdit(source,{...selected,segments:swap(selected.segments,new Set(selected.segments.map(s=>s.id)))});assert.equal(resolveStartingFace(swapped,read(swapped).graph).face,3);
});

test('endpoint-only reversals preserve original directed indexed edges including parallel slit banks',()=>{
  for(const source of [materialCutFixture().source,materialSlitFixture().source]){
    const next={...source,segments:source.segments.map((s,i)=>i%2?{...s,a:s.b,b:s.a}:s)},actual=read(reconcileMaterialEdit(source,next));
    assert.deepEqual(actual.graph,read(source).graph);assert.deepEqual(actual.foldedVertices,read(source).foldedVertices);
  }
});

test('B/non-B, material/A, non-A additions/removals and ID replacement are explicit topology errors',()=>{
  const source=hinged(),crease=source.segments[6],boundary=source.segments[0];
  const edits:Doc[]=[
    {...source,segments:assign(source.segments,new Set([crease.id]),'B')},
    {...source,segments:assign(source.segments,new Set([boundary.id]),'M')},
    {...source,segments:assign(source.segments,new Set([crease.id]),'A')},
    {...source,segments:source.segments.slice(1)},
    {...source,segments:source.segments.map(s=>s.id===crease.id?{...s,id:'replacement'}:s)},
    {...source,segments:[...source.segments,{id:'new-fold',a:[10,20],b:[80,90],assignment:'M',angle:-180}]},
  ];
  const before=JSON.stringify(source);for(const edit of edits)assert.throws(()=>reconcileMaterialEdit(source,edit),/材料|切口/);assert.equal(JSON.stringify(source),before);
  const withGuide:Doc={...source,segments:[...source.segments,{id:'guide',a:[10,20],b:[80,90],assignment:'A',angle:0}]};
  assert.throws(()=>reconcileMaterialEdit(withGuide,{...withGuide,segments:assign(withGuide.segments,new Set(['guide']),'M')}),/新增/);
});

test('real rotate37, scale1.3, move and both mirrors transport CP and source FF together in world coordinates',()=>{
  for(const source of originalSources()){
    const old=read(source),ids=new Set(source.segments.map(s=>s.id));
    for(const [kind,a,b] of [['rotate',37,0],['scale',1.3,0],['move',17,-9],['mirrorX',0,0],['mirrorY',0,0]] as const){
      const intent:MaterialTransformIntent={kind,segmentIds:[...ids],a,b},proposed=transformSelection(source,ids,kind,a,b),snapshot=JSON.stringify(proposed),next=reconcileMaterialEdit(source,proposed,intent),actual=read(next);
      assert.equal(JSON.stringify(proposed),snapshot);near(actual.graph.vertices_coords,old.graph.vertices_coords.map(referenceTransform(source,intent)));near(actual.foldedVertices!,old.foldedVertices!.map(referenceTransform(source,intent)));
      assert.equal(actual.components.length,3);assert.deepEqual(actual.graph.edges_faces,old.graph.edges_faces);assert.equal(actual.graph.edges_vertices.length,16);
      if(kind.startsWith('mirror'))assert.notDeepEqual(actual.graph.faces_vertices,old.graph.faces_vertices);
      assert.ok(inspectMaterialTopology(importDocument(exportDocument(next,'fold').text,'fold').doc).ok);
    }
  }
});

test('component-only rotation preserves untouched pieces and uses that component CP centre for FF placement',()=>{
  const source=materialCutFixture().source,old=read(source),component=old.components[1],ids=new Set(component.edges.map(e=>old.edgeSegmentIds[e]));
  const intent:MaterialTransformIntent={kind:'rotate',segmentIds:[...ids],a:37},next=reconcileMaterialEdit(source,transformSelection(source,ids,'rotate',37),intent),actual=read(next),vertices=new Set(component.vertices),transform=referenceTransform(source,intent);
  near(actual.foldedVertices!,old.foldedVertices!.map((p,v)=>vertices.has(v)?transform(p):p));
  old.foldedVertices!.forEach((p,v)=>{if(!vertices.has(v))assert.deepEqual(actual.foldedVertices![v],p);});
});

test('auxiliary selected endpoints participate in the real tool centre without becoming material vertices',()=>{
  const base=hinged(),source:Doc={...base,segments:[...base.segments,{id:'far-guide',a:[500,600],b:[700,600],assignment:'A',angle:0}]},ids=new Set(source.segments.map(s=>s.id));
  const intent:MaterialTransformIntent={kind:'rotate',segmentIds:[...ids],a:37},next=reconcileMaterialEdit(source,transformSelection(source,ids,'rotate',37),intent);
  near(read(next).foldedVertices!,read(source).foldedVertices!.map(referenceTransform(source,intent)));assert.equal(read(next).graph.edges_vertices.length,7);assert.equal(next.segments.at(-1)!.assignment,'A');
});

test('declared transforms never absorb even tiny inconsistent coordinates or unknown selection parameters',()=>{
  const source=hinged(),ids=new Set(source.segments.map(s=>s.id)),intent:MaterialTransformIntent={kind:'move',segmentIds:[...ids],a:17,b:-9};
  const changed=transformSelection(source,ids,'move',17,-9),snapshot=JSON.stringify(changed);changed.segments[0].a[0]+=1e-12;
  assert.throws(()=>reconcileMaterialEdit(source,changed,intent),/声明/);assert.notEqual(JSON.stringify(changed),snapshot);
  const real=transformSelection(source,ids,'move',17,-9);
  for(const invalid of [{...intent,a:Infinity},{...intent,segmentIds:['missing']},{...intent,segmentIds:[...ids,...ids]},{...intent,kind:'scale',a:0}] as MaterialTransformIntent[])assert.throws(()=>reconcileMaterialEdit(source,real,invalid));
});

test('partial edge movement cannot tear shared indexed vertices or implicitly separate a slit tip',()=>{
  for(const source of [hinged(),materialSlitFixture().source]){
    const before=JSON.stringify(source),ids=new Set([source.segments[0].id]),next=transformSelection(source,ids,'move',5,7);
    assert.throws(()=>reconcileMaterialEdit(source,next,{kind:'move',segmentIds:[...ids],a:5,b:7}),/同一个材料顶点/);assert.equal(JSON.stringify(source),before);
  }
});

test('general same-topology shape edits refold the hinge from old anchors and migrate the explicit root key',()=>{
  const source=setStartingFace(hinged(),1),change=(p:Point):Point=>[p[0]===200?240:p[0],p[1]],next=reconcileMaterialEdit(source,{...source,segments:source.segments.map(s=>({...s,a:change(s.a),b:change(s.b)}))}),actual=read(next);
  assert.equal(actual.foldedVertices![2][0],-40);assert.equal(actual.foldedVertices![5][0],-40);assert.deepEqual(resolveStartingFace(next,actual.graph),{face:1,stale:false});
  assert.deepEqual(next.flatFold!.startingFace,actual.graph.faces_vertices![1].map(v=>actual.graph.vertices_coords[v]));
  const refoldedSlit=materialSlitFixture().source,deform=(p:Point):Point=>[p[0]*1.4,p[1]*.8];
  const resized=reconcileMaterialEdit(refoldedSlit,{...refoldedSlit,segments:refoldedSlit.segments.map(s=>({...s,a:deform(s.a),b:deform(s.b)}))});
  near(read(resized).foldedVertices!,read(resized).graph.vertices_coords);assert.equal(read(resized).graph.edges_vertices.length,25);assert.deepEqual(read(resized).components[0].boundaryLoops.map(l=>l.length).sort((a,b)=>a-b),[2,12]);
});

test('F versus M/V/U changes recompute geometry while preserving face and edge identity',()=>{
  const source=hinged(),id=source.segments[6].id,unfolded=reconcileMaterialEdit(source,{...source,segments:assign(source.segments,new Set([id]),'F')}),flat=read(unfolded);
  assert.deepEqual(flat.foldedVertices,flat.graph.vertices_coords);assert.deepEqual(flat.graph.faces_edges,read(source).graph.faces_edges);
  for(const kind of ['M','V','U'] as const){const folded=reconcileMaterialEdit(unfolded,{...unfolded,segments:assign(unfolded.segments,new Set([id]),kind)});near(read(folded).foldedVertices!,read(source).foldedVertices!);}
});

test('source without FF permits harmless or declared complete transforms but cannot invent anchors for refolding',()=>{
  const withFF=hinged(),old=read(withFF),source=structuredClone(withFF);source.metadata!.materialTopology=createMaterialTopology(source,old.graph,old.edgeSegmentIds,{startingFace:0});
  const annotations={...source,name:'缺少折后锚姿'};assert.equal(reconcileMaterialEdit(source,annotations),annotations);
  const ids=new Set(source.segments.map(s=>s.id)),moved=transformSelection(source,ids,'move',12,4);
  const declared=reconcileMaterialEdit(source,moved,{kind:'move',segmentIds:[...ids],a:12,b:4});assert.equal(read(declared).foldedVertices,undefined);
  assert.throws(()=>reconcileMaterialEdit(source,moved),/没有已验证的折后位置/);
  assert.throws(()=>reconcileMaterialEdit(source,{...source,segments:assign(source.segments,new Set([source.segments[6].id]),'F')}),/没有已验证的折后位置/);
});

test('whole-component reflected slit retains separate parallel bank occurrences and selected root identity',()=>{
  const source=setStartingFace(materialSlitFixture().source,4),old=read(source),ids=new Set(source.segments.map(s=>s.id)),next=reconcileMaterialEdit(source,transformSelection(source,ids,'mirrorX',0),{kind:'mirrorX',segmentIds:[...ids],a:0}),actual=read(next);
  assert.equal(actual.graph.edges_vertices.length,25);assert.deepEqual(actual.graph.edges_vertices,old.graph.edges_vertices);assert.deepEqual(actual.graph.edges_faces,old.graph.edges_faces);
  assert.deepEqual(resolveStartingFace(next,actual.graph),{face:4,stale:false});assert.deepEqual(actual.components[0].boundaryLoops.map(l=>l.length).sort((a,b)=>a-b),[2,12]);
  const reordered=next.segments.toReversed();assert.deepEqual(read(reconcileMaterialEdit(next,{...next,segments:reordered})).graph,actual.graph);
});
