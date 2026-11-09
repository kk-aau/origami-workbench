import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildFold,buildDiagramFold,distance,pointOnSegment,polygonArea} from '../../src/core/geometry';
import type {Point,Segment} from '../../src/core/types';
import {buildPartialCreaseSimulationMesh,coalescePartialCreaseRoutes} from '../../src/engine/simPartialCreaseMesh';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {partialCreaseNetworkFixture} from '../fixtures/partialCreaseAnimation';

const line=(id:string,a:Point,b:Point,assignment:Segment['assignment']='F'):Segment=>({id,a,b,assignment,angle:assignment==='V'?180:assignment==='M'?-180:0});

for(const internal of [false,true])test(`finite crease has exact shared tips and real two-sided hinges (${internal?'interior':'boundary'} start)`,()=>{
  const doc=blankDoc('短痕',100,100),route=line('short',internal?[23.456789,41.234567]:[0,41.234567],[67.891234,41.234567],'V');
  doc.segments.push(route);const source=buildFold(doc).graph,before=structuredClone(source);
  const mesh=buildPartialCreaseSimulationMesh(source,[route]),{prepared}=prepareSimulationDocument(mesh.fold);
  assert.deepEqual(source,before,'temporary mesh never changes the CP');
  assert.deepEqual(mesh.materialCoordinates.slice(0,source.vertices_coords.length),source.vertices_coords,'source IDs and coordinate precision stay intact');
  assert.equal(prepared.vertexCount,mesh.materialCoordinates.length);assert.equal(prepared.faceCount,mesh.triangleSourceFaces.length);
  assert.equal(prepared.sourceFaceCount,source.faces_vertices!.length);assert.deepEqual(prepared.triangleSourceFaces,mesh.triangleSourceFaces);
  const moving=prepared.creaseParams.filter(c=>prepared.edgesAssignment[c.edge]==='V');
  assert.ok(moving.length>1,'the short crease has multiple connected real hinges');
  const length=moving.reduce((sum,c)=>{const [a,b]=prepared.edgesVertices[c.edge];assert.equal(prepared.edgesFaces[c.edge].length,2);return sum+distance(mesh.materialCoordinates[a],mesh.materialCoordinates[b]);},0);
  assert.ok(Math.abs(length-distance(route.a,route.b))<1e-6,'driven length stops exactly at the short crease endpoint');
  for(const c of moving)assert.equal(c.targetAngle,180);
  assert.ok(mesh.fold.edges_assignment.filter(a=>a==='F').length>moving.length,'the continuation stays uncreased');
  for(const p of [route.a,route.b]){
    const v=mesh.materialCoordinates.findIndex(q=>distance(p,q)<1e-7);
    assert.ok(v>=0);assert.ok(mesh.vertexSourceFaces[v].length);assert.ok(mesh.fold.faces_vertices!.filter(t=>t.includes(v)).length>=2);
  }
});

test('temporary curvature retains genuine source faces and adds no material layer identities',()=>{
  const doc=blankDoc('保留纸面',100,100),route=line('partial',[0,30],[35,30]);
  doc.segments.push(line('old',[50,0],[50,100],'V'),route);
  const source=buildDiagramFold(doc).graph,mesh=buildPartialCreaseSimulationMesh(source,[route]),{prepared}=prepareSimulationDocument(mesh.fold);
  assert.equal(source.faces_vertices!.length,2);assert.equal(prepared.sourceFaceCount,2);
  assert.deepEqual(new Set(mesh.triangleSourceFaces),new Set([0,1]));
  for(let parent=0;parent<2;parent++){
    const area=mesh.fold.faces_vertices!.reduce((sum,t,f)=>sum+(mesh.triangleSourceFaces[f]===parent?Math.abs(polygonArea(t.map(v=>mesh.materialCoordinates[v]))):0),0);
    assert.ok(Math.abs(area-Math.abs(polygonArea(source.faces_vertices![parent].map(v=>source.vertices_coords[v]))))<1e-6);
  }
  assert.ok(mesh.bendingStiffness.some((s,e)=>s<.5&&mesh.edgeSourceEdges[e]===null));
  assert.ok(mesh.bendingStiffness.some((s,e)=>s===1&&mesh.edgeSourceEdges[e]===null),'distant panels retain their bending stiffness');
  mesh.edgeSourceEdges.forEach((old,e)=>{if(old!==null)assert.equal(mesh.bendingStiffness[e],1,'real CP edges retain their intended hinge semantics');});
});

test('concave paper is clipped to its real boundary instead of filling missing material',()=>{
  const corners:Point[]=[[0,0],[100,0],[100,40],[40,40],[40,100],[0,100]],doc=blankDoc('凹纸',100,100);
  doc.segments=corners.map((a,i)=>line(`boundary-${i}`,a,corners[(i+1)%corners.length],'B'));
  const route=line('partial',[0,20],[31,20]);doc.segments.push(route);
  const source=buildFold(doc).graph,mesh=buildPartialCreaseSimulationMesh(source,[route]),{prepared}=prepareSimulationDocument(mesh.fold);
  assert.equal(prepared.sourceFaceCount,1);
  const area=mesh.fold.faces_vertices!.reduce((sum,t)=>sum+Math.abs(polygonArea(t.map(v=>mesh.materialCoordinates[v]))),0);
  assert.ok(Math.abs(area-6400)<1e-6);assert.ok(mesh.materialCoordinates.every(([x,y])=>x<=40+1e-6||y<=40+1e-6));
});

test('a screenshot-like network keeps four short drive intervals and a soft corridor to each boundary',()=>{
  const {source,mesh,prepared,animation}=partialCreaseNetworkFixture();
  assert.equal(prepared.sourceFaceCount,1);assert.equal(source.faces_vertices!.length,1);
  assert.equal(animation.ranges.filter(r=>r.viaAngle!==undefined).length,12);
  assert.ok(mesh.bendingStiffness.some((s,e)=>s<1&&mesh.edgeSourceEdges[e]!==null),'uncreased F marks can bend temporarily with their surrounding material');
  for(const range of animation.ranges)if(range.viaAngle!==undefined)assert.equal(mesh.bendingStiffness[range.edge],1,'only the requested short intervals are driven');
  const tip=100*(1-1/Math.sqrt(2));
  const continuations=prepared.edgesVertices.flatMap(([a,b],e)=>{
    const p=mesh.materialCoordinates[a],q=mesh.materialCoordinates[b];
    return Math.abs(p[1]-tip)<1e-6&&Math.abs(q[1]-tip)<1e-6&&Math.min(p[0],q[0])>tip+1e-6?[e]:[];
  });
  assert.ok(continuations.length);assert.ok(continuations.every(e=>mesh.bendingStiffness[e]<1),'the crease continuation can bend all the way to the opposite paper edge');
});

test('CP crossings subdivide the drive range without inventing extra short-crease tips',()=>{
  const {source,routes}=partialCreaseNetworkFixture({activeRoutes:[0]}),route=routes[0];
  const fragments=source.edges_vertices.flatMap(([a,b])=>{
    const p=source.vertices_coords[a],q=source.vertices_coords[b];
    return [p,q].every(v=>pointOnSegment(v,route,1e-6))?[{a:p,b:q}]:[];
  });
  assert.ok(fragments.length>1);
  const whole=buildPartialCreaseSimulationMesh(source,[route],{divisions:4}),split=buildPartialCreaseSimulationMesh(source,fragments,{divisions:4});
  assert.equal(split.fold.vertices_coords.length,whole.fold.vertices_coords.length);assert.equal(split.fold.faces_vertices!.length,whole.fold.faces_vertices!.length);
  assert.equal(coalescePartialCreaseRoutes(fragments).length,1);
  const separate=coalescePartialCreaseRoutes([{a:[0,0],b:[10,0]},{a:[30,0],b:[20,0]},{a:[10,0],b:[20,0]},{a:[30,0],b:[30,20]}]);
  assert.equal(separate.length,2,'connected collinear pieces coalesce, intersecting directions remain separate');
});

for(const anchorPoint of [undefined,[50,50] as Point])test(`symmetric convex-cell candidate preserves 90-degree mesh symmetry and material IDs (${anchorPoint?'small central anchor':'original anchor size'})`,()=>{
  const {source,routes}=partialCreaseNetworkFixture(),saved=structuredClone(source),mesh=buildPartialCreaseSimulationMesh(source,routes,{divisions:4,symmetricCells:true,anchorPoint}),{prepared}=prepareSimulationDocument(mesh.fold),points=mesh.materialCoordinates,triangles=mesh.fold.faces_vertices!;
  assert.deepEqual(source,saved);assert.deepEqual(points.slice(0,source.vertices_coords.length),source.vertices_coords);
  assert.ok(mesh.vertexSourceVertices.slice(0,source.vertices_coords.length).every((v,i)=>v===i));
  assert.ok(mesh.vertexSourceVertices.slice(source.vertices_coords.length).every(v=>v===null));
  assert.equal(prepared.sourceFaceCount,1);assert.deepEqual(new Set(prepared.triangleSourceFaces),new Set([0]));
  const rotation=points.map(([x,y])=>points.findIndex(([u,v])=>Math.hypot(u-(100-y),v-x)<1e-6));
  assert.ok(rotation.every(v=>v>=0));assert.equal(new Set(rotation).size,points.length);
  const stamp=(t:number[])=>[...t].sort((a,b)=>a-b).join(':'),set=new Set(triangles.map(stamp));
  assert.ok(triangles.every(t=>set.has(stamp(t.map(v=>rotation[v])))),'every triangle has its actual rotated counterpart');
  assert.ok(Math.abs(triangles.reduce((sum,t)=>sum+Math.abs(polygonArea(t.map(v=>points[v]))),0)-10000)<1e-6);
  source.edges_vertices.forEach(([a,b],e)=>{
    const retained=mesh.fold.edges_vertices.reduce((sum,[u,v],edge)=>sum+(mesh.edgeSourceEdges[edge]===e?distance(points[u],points[v]):0),0);
    assert.ok(Math.abs(retained-distance(source.vertices_coords[a],source.vertices_coords[b]))<1e-6,'each CP segment remains complete');
  });
  if(anchorPoint){
    const nearest=triangles.map(t=>({t,d:distance([t.reduce((s,v)=>s+points[v][0],0)/3,t.reduce((s,v)=>s+points[v][1],0)/3],anchorPoint)})).sort((a,b)=>a.d-b.d)[0].t;
    assert.ok(nearest.every((v,k)=>distance(points[v],points[nearest[(k+1)%3]])<=10));
  }
});

test('symmetric fans and local refinement keep existing folded-face identities and crease targets',()=>{
  const doc=blankDoc('原材料两面',100,100),route=line('short',[0,30],[35,30]);doc.segments.push(line('old',[50,0],[50,100],'V'),route);
  const source=buildDiagramFold(doc).graph,mesh=buildPartialCreaseSimulationMesh(source,[route],{divisions:4,symmetricCells:true,anchorPoint:[80,80]}),{prepared}=prepareSimulationDocument(mesh.fold);
  assert.equal(prepared.sourceFaceCount,2);assert.deepEqual(new Set(prepared.triangleSourceFaces),new Set([0,1]));
  for(let f=0;f<2;f++){
    const area=mesh.fold.faces_vertices!.reduce((sum,t,i)=>sum+(mesh.triangleSourceFaces[i]===f?Math.abs(polygonArea(t.map(v=>mesh.materialCoordinates[v]))):0),0);
    assert.ok(Math.abs(area-5000)<1e-6);
  }
  assert.ok(prepared.creaseParams.some(c=>c.targetAngle===180));
  prepared.creaseParams.forEach(c=>{if(prepared.edgesAssignment[c.edge]==='V'){assert.equal(c.targetAngle,180);assert.equal(mesh.bendingStiffness[c.edge],1);}});
});

test('invalid short crease or unsupported mesh budget gives an explicit failure',()=>{
  const source=buildFold(blankDoc('参数',100,100)).graph;
  assert.throws(()=>buildPartialCreaseSimulationMesh(source,[]),/缺少/);
  assert.throws(()=>buildPartialCreaseSimulationMesh(source,[line('outside',[20,20],[120,20])]),/端点/);
  assert.throws(()=>buildPartialCreaseSimulationMesh(source,[line('zero',[20,20],[20,20])]),/重合/);
  assert.throws(()=>buildPartialCreaseSimulationMesh(source,[line('short',[0,40],[35,40])],{maxVertices:5}),/超过/);
  assert.throws(()=>buildPartialCreaseSimulationMesh(source,[line('short',[0,40],[35,40])],{minimumBendingStiffness:0}),/参数/);
});
