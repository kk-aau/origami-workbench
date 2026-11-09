import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold,buildFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import type {FoldGraph,Point,Segment} from '../../src/core/types';
import {adoptDiagramPose,createDiagramProject,exportDiagramProject,updateDiagramCP} from '../../src/app/diagramProject';
import {applyDiagramFoldSegments} from '../../src/app/diagramFoldLink';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {triangulateSimulationWeak} from '../../src/engine/simWeak';

const line=(id:string,a:Point,b:Point,assignment:Segment['assignment']='F'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});
function fixture(extra:Segment[]=[]){
  const doc=blankDoc('边界出发的有限已有折痕',100,100);
  doc.segments.push(line('finite-F',[0,25],[50,25]),...extra);
  return {doc,graph:buildFold(doc).graph};
}
const sourceOwners=(graph:FoldGraph,edge:number)=>graph.faces_edges!.flatMap((row,f)=>row.flatMap(e=>e===edge?[f]:[]));

/** Test physical preservation against the public source, not against a copy
 * whose repeated face occurrence has already been expanded for simulation. */
function assertCompleteMaterial(graph:FoldGraph,prepared:ReturnType<typeof prepareSimulationDocument>['prepared']){
  assert.equal(prepared.vertexCount,graph.vertices_coords.length,'every original source vertex retains its index');
  assert.deepEqual(prepared.edgesVertices.slice(0,graph.edges_vertices.length),graph.edges_vertices,'every original edge retains its index and endpoints');
  assert.deepEqual(prepared.edgesAssignment.slice(0,graph.edges_vertices.length),graph.edges_assignment);
  assert.deepEqual(prepared.edgesFoldAngle.slice(0,graph.edges_vertices.length),graph.edges_foldAngle);
  assert.deepEqual(prepared.fold.vertices_coords,graph.vertices_coords.map(([x,y])=>[x,0,-y]));
  assert.equal(prepared.sourceFaceCount,graph.faces_vertices!.length);
  assert.equal(new Set(prepared.facesVertices.flat()).size,graph.vertices_coords.length,'triangles actually use all original vertices');
  let area=0;
  for(const triangle of prepared.facesVertices){
    const [a,b,c]=triangle.map(v=>graph.vertices_coords[v]);
    const signed=((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
    assert.ok(signed>0,'no degenerate or reversed triangle is used to cover the finite crease');
    area+=signed;
  }
  assert.equal(area,10000,'triangulation covers the complete physical sheet');
  graph.edges_vertices.forEach((_,edge)=>{
    const actual=prepared.edgesFaces[edge].map(t=>prepared.triangleSourceFaces![t]).sort((a,b)=>a-b);
    assert.deepEqual(actual,sourceOwners(graph,edge).sort((a,b)=>a-b),'triangle sides retain their actual source face occurrences');
    assert.equal(prepared.edgesFaces[edge].length,graph.edges_assignment[edge]==='B'?1:2);
  });
}

test('a public finite F crease prepares both material sides without changing its deduplicated public incidence',()=>{
  const {doc,graph}=fixture(),docBefore=structuredClone(doc),graphBefore=structuredClone(graph),edge=graph.edges_assignment.indexOf('F');
  assert.deepEqual(sourceOwners(graph,edge),[0,0]);
  assert.deepEqual(graph.edges_faces![edge],[0],'the editor graph intentionally lists each owner face once');
  assert.ok(graph.faces_edges![0].flatMap((e,k)=>e===edge?[k]:[]).every(k=>graph.faces_faces![0][k]==null));
  // This is the old failure, and remains the correct strict-validator result:
  // only the simulation entry adapter may reconcile this representation.
  assert.throws(()=>triangulateSimulationWeak(graph as never),/弱边界模拟网格无效：源边所属材料面不符。/);
  const {prepared}=prepareSimulationDocument(graph);
  assertCompleteMaterial(graph,prepared);
  const triangles=prepared.edgesFaces[edge];
  assert.equal(new Set(triangles).size,2,'the two sides are separate nondegenerate triangles');
  const [a,b]=graph.edges_vertices[edge].map(v=>graph.vertices_coords[v]);
  const signs=triangles.map(t=>{
    const third=prepared.facesVertices[t].find(v=>!graph.edges_vertices[edge].includes(v))!,c=graph.vertices_coords[third];
    return Math.sign((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
  });
  assert.deepEqual(signs.sort(),[-1,1],'the finite F line separates opposite local material sectors');
  assert.deepEqual(graph,graphBefore);assert.deepEqual(doc,docBefore);
});

for(const assignment of ['M','V'] as const)test(`finite F incidence coexists with a complete ${assignment} hinge without dropping either`,()=>{
  const {doc,graph}=fixture([line('full-hinge',[75,0],[75,100],assignment)]),saved=structuredClone({doc,graph});
  const {prepared}=prepareSimulationDocument(graph);assertCompleteMaterial(graph,prepared);
  const hinges=graph.edges_assignment.flatMap((kind,e)=>kind===assignment?[e]:[]);
  assert.equal(hinges.length,1);
  for(const edge of hinges){assert.ok(prepared.creaseParams.some(c=>c.edge===edge));assert.equal(prepared.edgesFoldAngle[edge],assignment==='M'?-180:180);}
  assert.deepEqual({doc,graph},saved);
});

test('a finite F line crossing a full hinge retains all split source segments and their actual sides',()=>{
  const {graph}=fixture([line('crossing-valley',[25,0],[25,100],'V')]),saved=structuredClone(graph);
  const {prepared}=prepareSimulationDocument(graph);assertCompleteMaterial(graph,prepared);
  assert.equal(graph.edges_assignment.filter(a=>a==='F').length,2);
  assert.equal(graph.edges_assignment.filter(a=>a==='V').length,2);
  assert.ok(graph.edges_assignment.flatMap((a,e)=>a==='V'?[e]:[]).every(edge=>prepared.creaseParams.some(c=>c.edge===edge)));
  assert.deepEqual(graph,saved);
});

test('already explicit repeated F owners and self-neighbours remain valid without modifying source topology',()=>{
  const {graph}=fixture(),edge=graph.edges_assignment.indexOf('F');
  graph.edges_faces![edge]=[0,0];
  graph.faces_edges![0].forEach((e,k)=>{if(e===edge)graph.faces_faces![0][k]=0;});
  const saved=structuredClone(graph),{prepared}=prepareSimulationDocument(graph);
  assertCompleteMaterial(graph,prepared);assert.deepEqual(graph,saved);
});

for(const [name,mutate] of [
  ['missing finite-line owner',(g:FoldGraph)=>{g.edges_faces![g.edges_assignment.indexOf('F')]=[];}],
  ['wrong finite-line owner',(g:FoldGraph)=>{g.edges_faces![g.edges_assignment.indexOf('F')]=[1];}],
  ['unrelated boundary owner',(g:FoldGraph)=>{g.edges_faces![0]=[1];}],
  ['boundary mislabeled as flat',(g:FoldGraph)=>{g.edges_assignment[0]='F';}],
  ['finite flat line mislabeled as boundary',(g:FoldGraph)=>{g.edges_assignment[g.edges_assignment.indexOf('F')]='B';}],
  ['wrong actual face-edge slot',(g:FoldGraph)=>{g.faces_edges![0][0]=g.faces_edges![0][1];}],
  ['wrong finite-line neighbour',(g:FoldGraph)=>{const edge=g.edges_assignment.indexOf('F'),k=g.faces_edges![0].indexOf(edge);g.faces_faces![0][k]=1;}],
] as const)test(`finite F adaptation still rejects ${name} atomically`,()=>{
  const {graph}=fixture();mutate(graph);const saved=structuredClone(graph);
  assert.throws(()=>prepareSimulationDocument(graph),/弱边界模拟网格无效/);
  assert.deepEqual(graph,saved,'rejected topology is not repaired or partially mutated');
});

test('step animation with an existing finite F and a newly complete valley builds without altering either CP',()=>{
  const {doc:before}=fixture();let id=0,project=createDiagramProject(before,()=>`finite-flat-${++id}`);
  const step=project.steps[0],result=computeFlatGeometry(buildDiagramFold(before).graph,1e-6);
  assert.equal(result.geometry.status,'ready');
  project=adoptDiagramPose(project,step.id,step.beforeId,result);
  project=updateDiagramCP(project,step.afterId,applyDiagramFoldSegments(before,[line('new-valley',[75,0],[75,100],'V')]));
  const saved=exportDiagramProject(project),clip=buildDiagramStepAnimation(project,step.id),foldBefore=structuredClone(clip.fold),{prepared}=prepareSimulationDocument(clip.fold);
  assertCompleteMaterial(clip.fold,prepared);
  const active=clip.animation.ranges.filter(r=>r.fromAngle!==r.toAngle);
  assert.equal(active.length,1);assert.equal(active[0].fromAngle,0);assert.equal(active[0].toAngle,180);
  const edge=active[0].edge;
  assert.equal(prepared.edgesFaces[edge].length,2);assert.ok(prepared.creaseParams.some(c=>c.edge===edge));
  assert.deepEqual(clip.fold.edges_vertices[edge].map(v=>clip.fold.vertices_coords[v]),[[75,0],[75,100]],'the complete active hinge is not trimmed by the old finite mark');
  const finite=clip.fold.edges_vertices.findIndex(([a,b])=>clip.fold.vertices_coords[a][1]===25&&clip.fold.vertices_coords[b][1]===25);
  assert.ok(finite>=0);assert.equal(prepared.edgesFaces[finite].length,2);
  assert.deepEqual(clip.fold,foldBefore);assert.equal(exportDiagramProject(project),saved);
});
