import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {appendWovenEllipseHole,sampleWovenEllipseHole,wovenEllipseChordError} from '../../src/app/wovenCurveHoles';
import {wovenCurveHolePreset,readWovenParams} from '../../src/app/wovenParams';
import {readWovenGraph,wovenGraphEdgeKinds} from '../../src/app/wovenGraph';
import {editWovenGraphDraft,readWovenGraphDraft} from '../../src/app/wovenGraphEdit';
import {prepareTessResult} from '../../src/app/tessellation';
import {inspectWovenCutTopology} from '../../src/app/wovenCutTopology';
import {wovenMaterialDocument} from '../../src/app/wovenMaterialDocument';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {computeFlatFold} from '../../src/core/flatFold';
import {exportDocument,importDocument} from '../../src/core/formats';
import {exportDXF} from '../../src/core/dxf';
const saved=JSON.parse(fs.readFileSync('tests/fixtures/woven-curve-holes-1010.json','utf8'));

test('analytic curve-hole creation preserves original arrays and commits explicit bounded chords',()=>{
 const p=wovenCurveHolePreset(),g=p.graph,before=structuredClone(g),curve=g.curveHoles![0];
 assert.deepEqual(readWovenParams(p),p);assert.deepEqual(readWovenGraph(g),g);assert.deepEqual(readWovenGraphDraft(g),g);
 assert.deepEqual(g.vertices.slice(5),sampleWovenEllipseHole(curve.curve,curve.segments));assert.ok(wovenEllipseChordError(curve.curve,curve.segments)<=curve.maxError);
 assert.deepEqual(wovenGraphEdgeKinds(g)?.slice(8),Array(curve.segments).fill(-1));assert.deepEqual(g,before);
 const plain={vertices:g.vertices.slice(0,5),edges:g.edges.slice(0,8)},original=structuredClone(plain);
 assert.deepEqual(editWovenGraphDraft(plain,{kind:'add-ellipse-hole',face:0,curve:curve.curve,maxError:curve.maxError}).graph,g);assert.deepEqual(plain,original);
});
test('whole-interval affine circle error bound covers rotated eccentric ellipse samples',()=>{
 const curve={kind:'ellipse' as const,center:[2.1234,1.9876] as [number,number],radii:[.8,.15] as [number,number],rotation:47.12},n=20,ps=sampleWovenEllipseHole(curve,n),bound=wovenEllipseChordError(curve,n),a=curve.rotation*Math.PI/180;
 for(let i=0;i<n;i++)for(let k=0;k<=40;k++){const u=k/40,t=(i+u)*2*Math.PI/n,x=curve.radii[0]*Math.cos(t),y=curve.radii[1]*Math.sin(t),p=[curve.center[0]+Math.cos(a)*x-Math.sin(a)*y,curve.center[1]+Math.sin(a)*x+Math.cos(a)*y],q=ps[i],r=ps[(i+1)%n];assert.ok(Math.hypot(p[0]-q[0]*(1-u)-r[0]*u,p[1]-q[1]*(1-u)-r[1]*u)<=bound+1e-15);}
});
test('analytic parameters, sample sequence, contour identity and requested bound cannot be forged',()=>{
 const p=wovenCurveHolePreset();
 const mutations=[(g:any)=>g.curveHoles[0].curve.radii[0]+=.01,(g:any)=>g.vertices[5][0]+=.0001,(g:any)=>g.curveHoles[0].component=0,(g:any)=>g.curveHoles[0].maxError=.000001,(g:any)=>g.curveHoles[0].segments=true,(g:any)=>g.curveHoles.push(g.curveHoles[0]),(g:any)=>delete g.ringHoles];
 for(const mutate of mutations){const g=structuredClone(p.graph);mutate(g);assert.equal(readWovenGraph(g),null);assert.equal(readWovenGraphDraft(g),null);}
 assert.throws(()=>editWovenGraphDraft(p.graph,{kind:'move',vertex:5,point:[3,3]}),/解析参数/);
 assert.throws(()=>editWovenGraphDraft(p.graph,{kind:'toggle-ring-hole',face:0,component:1}),/来源绑定/);
 const original=structuredClone(p.graph);assert.throws(()=>appendWovenEllipseHole(p.graph,0,{kind:'ellipse',center:[0,0],radii:[1,1],rotation:0},1e-12),/256段/);assert.deepEqual(p.graph,original);
});
test('a curve outside the selected face is rejected without changing the draft',()=>{
 const p=wovenCurveHolePreset(),plain={vertices:p.graph.vertices.slice(0,5),edges:p.graph.edges.slice(0,8)},before=structuredClone(plain);
 assert.throws(()=>editWovenGraphDraft(plain,{kind:'add-ellipse-hole',face:0,curve:{kind:'ellipse',center:[20,20],radii:[.4,.4],rotation:0},maxError:.015}),/严格位于/);assert.deepEqual(plain,before);
});
test('six public analytic-hole responses independently verify, adopt, solve layers and export exact material',()=>{
 for(const c of saved.cases){const r=prepareTessResult(c.response,c.params),i=inspectWovenCutTopology(r,c.params);assert.ok(i.ok,`${c.name}: ${i.ok?'':i.reason}`);
  const doc=wovenMaterialDocument(r,c.params),m=inspectMaterialTopology(doc);assert.ok(m.ok,m.ok?'':m.reason);assert.equal(m.graph.faces_holes!.flat().length,c.params.graph.curveHoles.length);assert.equal(computeFlatFold(doc).layers.status,'solved');
  for(const format of ['json','fold'] as const){const back=importDocument(exportDocument(doc,format).text,format).doc,b=inspectMaterialTopology(back);assert.ok(b.ok,b.ok?'':b.reason);assert.deepEqual(b.graph,m.graph);assert.deepEqual(b.foldedVertices,m.foldedVertices);assert.equal(computeFlatFold(back).layers.status,'solved');}
  assert.equal((exportDXF(doc).text.match(/\r?\nLINE\r?\n/g)??[]).length,doc.segments.length);
 }
});
test('missing curve provenance, forged replay precision and filling a real hole are refused',()=>{
 const c=saved.cases[0],response=prepareTessResult(c.response,c.params);
 for(const mutate of [(r:any)=>delete r.source.wovenMotherCurveHoles,(r:any)=>r.source.wovenMotherCurveHoles.chordErrors[0]=0,(r:any)=>r.source.wovenMotherCurveHoles.sampledVertexIds[0][0]=0,(r:any)=>r.fold.faces_holes=r.fold.faces_holes.map(()=>[])]){const r=structuredClone(response);mutate(r);assert.equal(inspectWovenCutTopology(r,c.params).ok,false);}
});
