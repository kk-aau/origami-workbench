import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold,distance,polygonArea,epsilonFor} from '../../src/core/geometry';
import {computeFlatFold,computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import type {Doc,Point,Segment} from '../../src/core/types';
import {diagramIllustrationMesh} from '../../src/app/diagramIllustrationMesh';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {followDiagramPaperAnnotations} from '../../src/app/diagramPaperFollow';
import {mapDiagramCPSelection} from '../../src/app/diagramCPSelection';
import {recordDiagramPaperPull,switchDiagramPaperState} from '../../src/app/diagramPaperState';
import {createDiagramProject,adoptDiagramPose,updateDiagramPoseResult,exportDiagramProject,importDiagramProject,type DiagramPose} from '../../src/app/diagramProject';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {flatCreaseFacesAtPoint} from '../../src/core/flatCreaseSupport';
import {nearCollinearMeshFixture,thinValidMeshFixture} from '../fixtures/diagramCollinearMesh';

const mark=(id:string,a:Point,b:Point):Segment=>({id,a,b,assignment:'F',angle:0});
const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-5,`${a} != ${b}`);
function poseOf(doc:Doc):DiagramPose {
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  assert.equal(result.geometry.status,'ready',result.geometry.message);
  assert.equal(result.layers.status,'solved',result.layers.message);
  return {sourceStateId:'before',sourceRevision:0,sourceDoc:doc,result};
}
function indexAt(pose:DiagramPose,point:Point):number {
  const index=diagramIllustrationMesh(pose).graph.vertices_coords.findIndex(p=>distance(p,point)<1e-7);
  assert.ok(index>=0,`missing source point ${point}`);return index;
}
function move(pose:DiagramPose,point:Point,destination:Point):DiagramPose {
  const index=indexAt(pose,point);
  return {...pose,result:moveFoldedVertices(pose.result,{group:[index],selected:[index]},destination)};
}
function rightFlaps():DiagramPose {
  const doc=blankDoc('三角形右侧两个小纸角',100,100);
  doc.segments.push({id:'retained-fold',a:[0,0],b:[100,100],assignment:'V',angle:180},
    mark('existing-diagonal',[0,100],[100,0]),mark('existing-midpoint',[50,50],[100,50]));
  return poseOf(doc);
}
function checkCoverageAndConstraints(pose:DiagramPose):void {
  const mesh=diagramIllustrationMesh(pose),vertices=mesh.graph.vertices_coords;
  mesh.triangles.forEach((triangles,face)=>{
    const physical=mesh.graph.faces_vertices![face].map(index=>vertices[index]);
    const expected=Math.abs(polygonArea(physical))-(mesh.graph.faces_holes?.[face]??[])
      .reduce((sum,ring)=>sum+Math.abs(polygonArea(ring.map(index=>vertices[index]))),0);
    const actual=triangles.reduce((sum,triangle)=>{
      assert.equal(new Set(triangle).size,3);const area=Math.abs(polygonArea(triangle.map(index=>vertices[index])));
      assert.ok(area>1e-8,'drawing triangles must have nonzero area');return sum+area;
    },0);
    assert.ok(Math.abs(actual-expected)<1e-5,`face ${face} coverage ${actual} != ${expected}`);
  });
  for(const [edge,[a,b]] of mesh.graph.edges_vertices.entries()){
    if(mesh.graph.edges_assignment[edge]!=='F')continue;
    assert.ok(mesh.triangles.some(row=>row.some(triangle=>triangle.includes(a)&&triangle.includes(b))),
      `F edge ${vertices[a]} -> ${vertices[b]} must constrain drawing triangles`);
  }
}

test('near-collinear boundary cells never import remote F endpoints from another physical face',()=>{
  const pose=nearCollinearMeshFixture(),before=structuredClone(pose),mesh=diagramIllustrationMesh(pose),eps=epsilonFor(pose.sourceDoc);
  for(const [face,row] of mesh.triangles.entries())for(const triangle of row)for(const vertex of triangle){
    assert.ok(flatCreaseFacesAtPoint(mesh.graph,mesh.graph.vertices_coords[vertex],eps).includes(face),
      `vertex ${vertex} must belong to physical face ${face}`);
  }
  checkCoverageAndConstraints(pose);assert.deepEqual(pose,before);
});

test('valid triangles slightly above coordinate tolerance retain their area and F constraint',()=>{
  const pose=thinValidMeshFixture(),mesh=diagramIllustrationMesh(pose),eps=epsilonFor(pose.sourceDoc);
  assert.equal(mesh.triangles[0].length,2);
  for(const triangle of mesh.triangles[0]){
    const [a,b,c]=triangle.map(vertex=>mesh.graph.vertices_coords[vertex]);
    const height=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/Math.max(distance(a,b),distance(b,c),distance(c,a));
    assert.ok(height>eps&&height<eps*1.11);
  }
  checkCoverageAndConstraints(pose);
});

test('dragging the right midpoint changes only its two small triangles and leaves the large triangle fixed',()=>{
  const pose=rightFlaps(),before=structuredClone(pose),mesh=diagramIllustrationMesh(pose),point=indexAt(pose,[100,50]);
  const face=pose.result.geometry.faces.findIndex(ring=>ring.includes(point));assert.ok(face>=0);
  const moving=mesh.triangles[face].filter(triangle=>triangle.includes(point));
  const fixed=mesh.triangles[face].filter(triangle=>!triangle.includes(point));
  assert.equal(moving.length,2,'exactly the two right-hand small triangles share this corner');
  assert.equal(fixed.length,1,'the large triangle is a separate fixed drawing region');
  assert.deepEqual(fixed[0].map(index=>mesh.graph.vertices_coords[index]).sort(),[[0,0],[50,50],[100,0]].sort());
  const pulled=move(pose,[100,50],[90,45]);
  for(const triangle of fixed)assert.deepEqual(triangle.map(index=>pulled.result.geometry.vertices[index]),
    triangle.map(index=>pose.result.geometry.vertices[index]));
  for(const triangle of moving)assert.notDeepEqual(triangle.map(index=>pulled.result.geometry.vertices[index]),
    triangle.map(index=>pose.result.geometry.vertices[index]));
  assert.deepEqual(pulled.result.geometry.faces,pose.result.geometry.faces);
  assert.deepEqual(pulled.sourceDoc,pose.sourceDoc);assert.deepEqual(pose,before);checkCoverageAndConstraints(pose);
});

test('lines on the large fixed triangle stay fixed while artwork on a small triangle follows its corner',()=>{
  const pose=rightFlaps(),face=pose.result.geometry.faces.findIndex(ring=>ring.includes(indexAt(pose,[100,50]))),pulled=move(pose,[100,50],[90,45]);
  const large:DiagramLineAnnotation={id:'large-region',kind:'line',a:[25,5],b:[50,10],style:'auxiliary',color:'#123456',width:1.4,foldFaces:[face]};
  const small:DiagramLineAnnotation={id:'small-region',kind:'line',a:[75,35],b:[95,45],style:'auxiliary',color:'#654321',width:1.1,foldFaces:[face]};
  const output=followDiagramPaperAnnotations(pose,pulled,[large,small]);
  assert.deepEqual(output.find(line=>line.id===large.id),large);
  const followed=output.find(line=>line.id===small.id) as DiagramLineAnnotation;
  assert.ok(followed);assert.notDeepEqual(followed.a,small.a);assert.notDeepEqual(followed.b,small.b);
  assert.equal(followed.color,small.color);assert.equal(followed.width,small.width);assert.deepEqual(followed.foldFaces,[face]);
});

test('an isolated finite F mark keeps both tips as movable drawing vertices without splitting physical paper',()=>{
  const doc=blankDoc('悬空有限已有折痕',100,100);doc.segments.push(mark('finite',[20,50],[80,50]));
  const pose=poseOf(doc),mesh=diagramIllustrationMesh(pose);checkCoverageAndConstraints(pose);
  assert.equal(pose.result.geometry.faces.length,1);assert.deepEqual(pose.result.layers.faceOrder,[0]);
  for(const point of [[20,50],[80,50]] as Point[])assert.ok(mesh.triangles[0].some(triangle=>triangle.includes(indexAt(pose,point))));
  const pulled=move(pose,[20,50],[25,40]),state={id:'before',revision:0,doc};
  const mapped=mapDiagramCPSelection(pulled,state,{kind:'vertex',index:indexAt(pose,[20,50])},state);
  assert.equal(mapped.points.length,1);close(mapped.points[0],[25,40]);assert.deepEqual(mapped.faces,[0]);
});

test('disconnected nested F loops are drawing constraints with complete coverage, never extra paper layers',()=>{
  const doc=blankDoc('闭合预折环',100,100),before=structuredClone(doc);
  for(const [name,points] of [['outer',[[15,15],[85,15],[85,85],[15,85]]],['inner',[[35,35],[65,35],[65,65],[35,65]]]] as const)
    points.forEach((point,index)=>doc.segments.push(mark(`${name}-${index}`,[...point],[...points[(index+1)%4]])));
  const source=structuredClone(doc);
  // Ordinary diagnosis still rejects disconnected F loops before entering
  // diagram mode. Exercise the drawing mesh with the valid marks graph,
  // independently of that unrelated ordinary-input restriction.
  const result=recomputeFlatLayers(computeFlatGeometry(buildDiagramFold(doc).graph,epsilonFor(doc)));
  const pose:DiagramPose={sourceStateId:'before',sourceRevision:0,sourceDoc:doc,result};
  assert.equal(result.geometry.status,'ready');assert.equal(result.layers.status,'solved');checkCoverageAndConstraints(pose);
  assert.equal(pose.result.geometry.faces.length,1);assert.deepEqual(pose.result.layers.faceOrder,[0]);
  assert.deepEqual(buildDiagramFold(doc).graph.faces_vertices,pose.result.geometry.faces);
  assert.deepEqual(doc,source);assert.deepEqual(before.segments.length,4);
});

test('a collinear boundary vertex and a connected interior F tip remain explicit drawing anchors',()=>{
  const doc=blankDoc('边界分点与内部尖端',100,100);doc.segments.push(mark('tip',[50,0],[50,50]));
  const pose=poseOf(doc),mesh=diagramIllustrationMesh(pose);checkCoverageAndConstraints(pose);
  const boundary=indexAt(pose,[50,0]),tip=indexAt(pose,[50,50]);
  assert.ok(mesh.triangles[0].some(triangle=>triangle.includes(boundary)));
  assert.ok(mesh.triangles[0].some(triangle=>triangle.includes(tip)));
  const pulled=move(pose,[50,0],[50,-10]);
  for(const triangle of mesh.triangles[0].filter(triangle=>!triangle.includes(boundary)))
    assert.deepEqual(triangle.map(index=>pulled.result.geometry.vertices[index]),triangle.map(index=>pose.result.geometry.vertices[index]));
  assert.equal(pulled.result.geometry.faces.length,1);assert.deepEqual(pulled.sourceDoc,doc);
});

for(const [initialSeed,count] of [[34322,8],[558693298,4]] as const)
  test(`nonorthogonal finite F crossings retain complete drawing constraints (seed ${initialSeed})`,()=>{
    const doc=blankDoc('斜向有限折痕约束',100,100);let seed:number=initialSeed;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const point=():Point=>[5+90*random(),5+90*random()];
    for(let index=0;index<count;index++)doc.segments.push(mark(`finite-${index}`,point(),point()));
    const source=structuredClone(doc),result=computeFlatGeometry(buildDiagramFold(doc).graph,epsilonFor(doc));
    assert.equal(result.geometry.status,'ready');
    const pose:DiagramPose={sourceStateId:'before',sourceRevision:0,sourceDoc:doc,result};checkCoverageAndConstraints(pose);
    assert.equal(result.geometry.faces.length,1);assert.deepEqual(doc,source);
  });

test('saving and switching between flat and pulled poses preserves local geometry, CP states and physical face identities',()=>{
  const initial=rightFlaps();let sequence=0,project=createDiagramProject(initial.sourceDoc,()=>`local-${++sequence}`);
  const stepId=project.activeStepId,beforeId=project.steps[0].beforeId;
  project=adoptDiagramPose(project,stepId,beforeId,initial.result);
  const previous=project.steps[0].pose!,states=structuredClone(project.states),originalFaces=structuredClone(previous.result.geometry.faces);
  const pulled=move(previous,[100,50],[90,45]);project=updateDiagramPoseResult(project,stepId,pulled.result);
  project=recordDiagramPaperPull(project,stepId,previous,[]);
  const loaded=importDiagramProject(exportDiagramProject(project));
  assert.deepEqual(loaded.steps[0].pose!.result.geometry.vertices,pulled.result.geometry.vertices);
  assert.deepEqual(loaded.states,states);assert.deepEqual(loaded.steps[0].pose!.result.geometry.faces,originalFaces);
  assert.deepEqual(diagramIllustrationMesh(loaded.steps[0].pose!).triangles,diagramIllustrationMesh(previous).triangles);
  const flat=switchDiagramPaperState(loaded,stepId,'flat');
  assert.deepEqual(flat.steps[0].pose!.result.geometry.vertices,previous.result.geometry.vertices);
  const restored=switchDiagramPaperState(flat,stepId,'pulled');
  assert.deepEqual(restored.steps[0].pose!.result.geometry.vertices,pulled.result.geometry.vertices);
  assert.deepEqual(restored.states,states);assert.deepEqual(restored.steps[0].pose!.result.geometry.faces,originalFaces);
  assert.equal(restored.steps[0].pose!.result.geometry.faces.length,2);
});
