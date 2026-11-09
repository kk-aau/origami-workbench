import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold,distance,polygonArea} from '../../src/core/geometry';
import type {Point,Segment} from '../../src/core/types';
import {buildPartialCreaseConeMesh} from '../../src/engine/simPartialCreaseConeMesh';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {fixture} from '../fixtures/diagramPartialCrease';

const circular=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
for(const name of ['single','network'] as const)test(`cone ${name} keeps one material face and the full original CP without an opposite hinge`,()=>{
  const f=fixture(name),source=buildDiagramFold(f.project.states[1].doc).graph,saved=structuredClone(source),route=f.project.steps[0].foldLink!.precreases![0],mesh=buildPartialCreaseConeMesh(source,route),{prepared}=prepareSimulationDocument(mesh.fold);
  assert.deepEqual(source,saved);assert.deepEqual(mesh.materialCoordinates.slice(0,source.vertices_coords.length),source.vertices_coords);
  assert.equal(prepared.sourceFaceCount,1);assert.deepEqual(new Set(prepared.triangleSourceFaces),new Set([0]));
  assert.equal(mesh.rays.length,16);assert.equal(mesh.vertexSectors[mesh.apexVertex].length,16);
  assert.ok(mesh.sectorTriangles.every(row=>row.length));assert.equal(mesh.triangleSectors.length,prepared.faceCount);
  assert.ok(mesh.rayAngles.every((a,i)=>i===0||a>mesh.rayAngles[i-1]));
  const active=mesh.rayAngles[mesh.activeRay],opposite=circular(active+Math.PI),sector=(theta:number)=>{let s=mesh.rayAngles.length-1;mesh.rayAngles.forEach((a,i)=>{if(theta>=a)s=i;});return s;};
  assert.ok(mesh.rayAngles.every(a=>Math.abs(circular(a-opposite))>.005));
  assert.equal(sector(circular(opposite-.01)),sector(circular(opposite+.01)),'both sides of the continuation are one rigid facet');
  mesh.fold.edges_vertices.forEach(([a,b],e)=>{
    const owners=mesh.fold.edges_faces![e];if(owners.length!==2)return;
    const p=mesh.materialCoordinates[a],q=mesh.materialCoordinates[b],d:Point=[Math.cos(opposite),Math.sin(opposite)];
    const onExtension=[p,q].every(v=>Math.abs((v[0]-mesh.apex[0])*d[1]-(v[1]-mesh.apex[1])*d[0])<1e-6&&(v[0]-mesh.apex[0])*d[0]+(v[1]-mesh.apex[1])*d[1]>=-1e-6);
    if(onExtension){assert.equal(mesh.triangleSectors[owners[0]],mesh.triangleSectors[owners[1]]);assert.equal(mesh.bendingStiffness[e],1);}
  });
  source.edges_vertices.forEach(([a,b],e)=>{
    const total=mesh.fold.edges_vertices.reduce((sum,[u,v],i)=>sum+(mesh.edgeSourceEdges[i]===e?distance(mesh.materialCoordinates[u],mesh.materialCoordinates[v]):0),0);
    assert.ok(Math.abs(total-distance(source.vertices_coords[a],source.vertices_coords[b]))<1e-6);
  });
  assert.ok(Math.abs(mesh.fold.faces_vertices!.reduce((sum,t)=>sum+Math.abs(polygonArea(t.map(v=>mesh.materialCoordinates[v]))),0)-10000)<1e-6);
  mesh.fold.faces_vertices!.forEach((t,f)=>t.forEach(v=>assert.ok(mesh.vertexSectors[v].includes(mesh.triangleSectors[f]))));
  const descriptor=mesh.fold.zhezhi_partial_crease_cone as {apexVertex:number;rays:unknown[];triangleSectors:number[]};
  assert.equal(descriptor.apexVertex,mesh.apexVertex);assert.deepEqual(descriptor.rays,mesh.rays);assert.deepEqual(descriptor.triangleSectors,mesh.triangleSectors);
  assert.deepEqual(JSON.parse(JSON.stringify(descriptor)),descriptor,'worker descriptor contains only serializable material data');
});

test('old finite F marks stay inside rigid sectors with all their source endpoints',()=>{
  const doc=blankDoc('有限 F 标记',100,100),route:Segment={id:'active',a:[0,40],b:[40,40],assignment:'F',angle:0};
  doc.segments.push(route,{id:'old-finite',a:[60,60],b:[80,65],assignment:'F',angle:0});
  const source=buildDiagramFold(doc).graph,mesh=buildPartialCreaseConeMesh(source,route),{prepared}=prepareSimulationDocument(mesh.fold);
  assert.equal(prepared.sourceFaceCount,1);
  for(const p of [[60,60],[80,65]] as Point[])assert.ok(mesh.materialCoordinates.some(q=>distance(p,q)<1e-6));
  assert.equal(mesh.vertexSectors[mesh.apexVertex].length,16);
});

test('cone mesh explicitly rejects two interior tips, a whole-sheet hinge, folded paper and concave paper',()=>{
  const f=fixture('interior'),source=buildDiagramFold(f.project.states[1].doc).graph;
  assert.throws(()=>buildPartialCreaseConeMesh(source,f.project.steps[0].foldLink!.precreases![0]),/一端位于纸边/);
  assert.throws(()=>buildPartialCreaseConeMesh(source,{a:[0,40],b:[100,40]}),/一端位于纸边/);
  const folded=structuredClone(source);folded.edges_assignment[folded.edges_assignment.indexOf('F')]='V';
  assert.throws(()=>buildPartialCreaseConeMesh(folded,{a:[0,40],b:[40,40]}),/展开纸面/);
  const doc=blankDoc('凹纸',100,100),corners:Point[]=[[0,0],[100,0],[100,40],[40,40],[40,100],[0,100]];
  doc.segments=corners.map((a,i)=>({id:`b-${i}`,a,b:corners[(i+1)%corners.length],assignment:'B',angle:0}));
  assert.throws(()=>buildPartialCreaseConeMesh(buildDiagramFold(doc).graph,{a:[0,20],b:[25,20]}),/凸纸边/);
});
