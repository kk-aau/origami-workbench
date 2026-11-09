import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildFold,distance} from '../../src/core/geometry';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {defaultAngle,type Doc,type Point,type Segment} from '../../src/core/types';
import type {DiagramPose} from '../../src/app/diagramProject';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelProjection} from '../../src/app/modelProjection';
import {alignDiagramFoldResult,applyDiagramFoldMatrix,applyDiagramFoldSegments,diagramFoldStartingFace,pickDiagramFoldAnchor} from '../../src/app/diagramFoldLink';
import {chooseDiagramPrecreaseAnchor,diagramPrecreaseLayerOrderMatches,hasDiagramActiveFoldChanges} from '../../src/app/diagramPrecreaseAdvance';
import {normalizeDiagramCP} from '../../src/app/diagramCP';

const segment=(a:Point,b:Point,assignment:Segment['assignment'],id='line'):Segment=>({id,a,b,assignment,angle:defaultAngle(assignment)});
function poseOf(doc:Doc):DiagramPose {
  const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready',result.geometry.message);
  return {sourceStateId:'before',sourceRevision:3,sourceDoc:structuredClone(doc),result,view:defaultModelView()};
}
const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-5,`${a} != ${b}`);
const mean=(points:Point[]):Point=>[points.reduce((sum,p)=>sum+p[0],0)/points.length,points.reduce((sum,p)=>sum+p[1],0)/points.length];
function contains(point:Point,polygon:Point[]):boolean {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)):0;
    if(distance(point,[a[0]+t*dx,a[1]+t*dy])<1e-6)return true;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function advanceAndCompare(pose:DiagramPose,after:Doc){
  const savedPose=structuredClone(pose),savedAfter=structuredClone(after),anchor=chooseDiagramPrecreaseAnchor(pose,after);
  const startingFace=diagramFoldStartingFace(after,anchor),result=computeFlatFold(after,undefined,{startingFace});
  assert.equal(result.geometry.status,'ready',result.geometry.message);
  const aligned=alignDiagramFoldResult(after,result,anchor),source=buildFold(pose.sourceDoc).graph,next=buildFold(after).graph;
  const camera=modelProjection(pose.result.geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0);
  const matrices=source.faces_vertices!.map((face,f)=>pickDiagramFoldAnchor(pose,camera.project(mean(face.map(v=>pose.result.geometry.vertices[v]))),f).matrix);
  next.vertices_coords.forEach((point,v)=>{
    const oldFace=source.faces_vertices!.findIndex(face=>contains(point,face.map(v=>source.vertices_coords[v])));
    assert.ok(oldFace>=0);close(aligned.geometry.vertices[v],applyDiagramFoldMatrix(matrices[oldFace],point));
  });
  assert.deepEqual(pose,savedPose);assert.deepEqual(after,savedAfter);
  return aligned;
}

test('only dormant F additions or removal do not count as an active folding change',()=>{
  const before=blankDoc('预折',100,100),after=applyDiagramFoldSegments(before,[segment([0,30],[100,30],'F')]);
  assert.equal(hasDiagramActiveFoldChanges(before,after),false);
  assert.equal(hasDiagramActiveFoldChanges(after,before),false);
  for(const assignment of ['M','V','U'] as const){
    const folded=applyDiagramFoldSegments(before,[segment([0,30],[100,30],assignment)]);
    assert.equal(hasDiagramActiveFoldChanges(before,folded),true);
    assert.equal(hasDiagramActiveFoldChanges(folded,after),true,'F replacing an existing fold actually unfolds it');
    assert.equal(hasDiagramActiveFoldChanges(after,folded),true,'using an existing F route actually folds it');
  }
});

test('IDs, reversed endpoints, CP segmentation and starting-face preferences do not activate folds',()=>{
  const before=blankDoc('分段',100,100);before.segments.push(segment([0,50],[100,50],'V','fold'));
  const after=structuredClone(before);
  after.name='重新命名';after.metadata={startingFace:4};
  after.segments=after.segments.filter(s=>s.id!=='fold').map((s,i)=>({...s,id:`new-boundary-${i}`,a:s.b,b:s.a}));
  after.segments.push(segment([40,50],[0,50],'V','part-1'),segment([100,50],[40,50],'V','part-2'),segment([20,0],[20,100],'F','precrease'));
  assert.equal(hasDiagramActiveFoldChanges(before,after),false);
});

test('reordered boundary edges can change the default root by 90 degrees while automatic material alignment preserves the unchanged folded pose',()=>{
  const before=blankDoc('不含旋转指令的同一 CP',100,100),ends:Point[]=[[100,50],[100,100],[50,100],[0,0]];
  ends.forEach((b,i)=>before.segments.push(segment([50,50],b,i===0?'M':'V',`hinge-${i}`)));
  const pose=poseOf(before),after=structuredClone(before),boundaries=after.segments.slice(0,4);
  after.segments=[...boundaries.slice(2),...boundaries.slice(0,2),...after.segments.slice(4)];
  const cleaned=normalizeDiagramCP(after).doc,saved=structuredClone(cleaned),old=buildFold(before).graph,next=buildFold(cleaned).graph;
  assert.equal(hasDiagramActiveFoldChanges(before,cleaned),false);assert.equal(pose.result.layers.status,'solved');
  const unaligned=computeFlatFold(cleaned);assert.equal(unaligned.layers.status,'solved');
  const oldCoordinates=next.vertices_coords.map(point=>{
    const index=old.vertices_coords.findIndex(source=>distance(source,point)<1e-8);assert.ok(index>=0);return pose.result.geometry.vertices[index];
  });
  oldCoordinates.forEach(([x,y],v)=>close(unaligned.geometry.vertices[v],[100-y,x]));
  const aligned=advanceAndCompare(pose,cleaned);oldCoordinates.forEach((point,v)=>close(aligned.geometry.vertices[v],point));
  assert.deepEqual(cleaned,saved);assert.equal(pose.view!.rotation,0);assert.equal(pose.view!.side,'front');
});

test('a precrease-only next pose stays unfolded and maintains the full previous placement',()=>{
  const before=blankDoc('原纸',100,100),pose=poseOf(before);
  pose.result.geometry.vertices=pose.result.geometry.vertices.map(([x,y])=>[x+17,y-23]);
  pose.result.geometry.graph!.vertices_coords=structuredClone(pose.result.geometry.vertices);
  const after=applyDiagramFoldSegments(before,[segment([0,40],[100,40],'F')]),aligned=advanceAndCompare(pose,after);
  assert.ok(aligned.geometry.faces.length>pose.result.geometry.faces.length);
  assert.equal(recomputeFlatLayers(aligned).layers.status,'solved');
});

test('precreases on already folded paper keep opening direction and rotated back-view placement',()=>{
  const before=blankDoc('已折两层',100,100);before.segments.push(segment([50,0],[50,100],'V','old-fold'));
  const pose=poseOf(before),angle=37*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  // The raw placement may itself be reflected. This is distinct from the
  // observation back-side/rotation, which remains in pose.view.
  pose.result.geometry.vertices=pose.result.geometry.vertices.map(([x,y])=>[-c*x+s*y+17,s*x+c*y-23]);
  pose.result.geometry.graph!.vertices_coords=structuredClone(pose.result.geometry.vertices);
  pose.result.layers={status:'unknown',message:'原姿态层序待分析'};
  pose.view={...defaultModelView(),side:'back',rotation:73};
  const after=applyDiagramFoldSegments(before,[segment([0,30],[100,30],'F','horizontal'),segment([0,0],[100,100],'F','diagonal')]);
  const aligned=advanceAndCompare(pose,after);
  assert.equal(aligned.layers.status,'unknown','a reflected alignment requires fresh solver relationships');
  assert.equal(aligned.layers.faceOrder,undefined);assert.equal(aligned.layers.faceOrders,undefined);
  assert.equal(recomputeFlatLayers(aligned).layers.status,'solved');
});

test('automatic interior seed moves away when new precreases pass through the old centroid',()=>{
  const before=blankDoc('避开中心',100,100),pose=poseOf(before),first=chooseDiagramPrecreaseAnchor(pose,before);
  const after=applyDiagramFoldSegments(before,[segment([0,first.point[1]],[100,first.point[1]],'F','through-centre'),segment([first.point[0],0],[first.point[0],100],'F','through-centre-2')]);
  const anchor=chooseDiagramPrecreaseAnchor(pose,after);
  assert.ok(Math.abs(anchor.point[0]-first.point[0])>1e-6);
  assert.ok(Math.abs(anchor.point[1]-first.point[1])>1e-6);
  assert.doesNotThrow(()=>diagramFoldStartingFace(after,anchor));advanceAndCompare(pose,after);
});

test('automatic preservation rejects a pulled face or an actual new fold without mutating inputs',()=>{
  const before=blankDoc('安全限制',100,100),pose=poseOf(before),after=applyDiagramFoldSegments(before,[segment([0,30],[100,30],'F')]);
  pose.result.geometry.vertices[2][0]+=10;
  const saved=structuredClone(pose);
  assert.throws(()=>chooseDiagramPrecreaseAnchor(pose,after),/非等距/);assert.deepEqual(pose,saved);
  assert.throws(()=>chooseDiagramPrecreaseAnchor(poseOf(before),applyDiagramFoldSegments(before,[segment([0,30],[100,30],'V')])),/实际折叠发生变化/);
});

test('new certified F subfaces retain actual old material-layer relationships and reject a reversed candidate',()=>{
  const before=blankDoc('认证继承',100,100);before.segments.push(segment([50,0],[50,100],'V','old-fold'));
  const pose=poseOf(before),after=applyDiagramFoldSegments(before,[segment([0,30],[100,30],'F','precrease')]),result=advanceAndCompare(pose,after);
  assert.equal(pose.result.layers.status,'solved');assert.equal(result.layers.status,'solved');
  assert.equal(diagramPrecreaseLayerOrderMatches(pose,after,result),true);
  const wrong=structuredClone(result);wrong.layers.faceOrders=wrong.layers.faceOrders!.map(([a,b,sign])=>[a,b,-sign]);
  assert.equal(diagramPrecreaseLayerOrderMatches(pose,after,wrong),false);
  const unknown=structuredClone(result);unknown.layers={status:'unknown',message:'尚未认证'};
  assert.equal(diagramPrecreaseLayerOrderMatches(pose,after,unknown),false);
});

test('old and new reflected face normals are compared in the genuine +Z direction',()=>{
  const before=blankDoc('反射认证',100,100);before.segments.push(segment([50,0],[50,100],'V','old-fold'));
  const pose=poseOf(before);
  pose.result.geometry.vertices=pose.result.geometry.vertices.map(([x,y])=>[-x+13,y-7]);
  pose.result.geometry.graph!.vertices_coords=structuredClone(pose.result.geometry.vertices);
  pose.result=recomputeFlatLayers(pose.result);assert.equal(pose.result.layers.status,'solved');
  pose.view={...defaultModelView(),side:'back',rotation:123};
  const after=applyDiagramFoldSegments(before,[segment([0,60],[100,60],'F','precrease')]);
  const result=recomputeFlatLayers(advanceAndCompare(pose,after));assert.equal(result.layers.status,'solved');
  assert.equal(diagramPrecreaseLayerOrderMatches(pose,after,result),true);
  const wrong=structuredClone(result);wrong.layers.faceOrders=wrong.layers.faceOrders!.map(([a,b,sign])=>[a,b,-sign]);
  assert.equal(diagramPrecreaseLayerOrderMatches(pose,after,wrong),false);
});

test('an uncertified old pose does not pretend to constrain later solver order',()=>{
  const before=blankDoc('未知层序',100,100);before.segments.push(segment([50,0],[50,100],'V','old-fold'));
  const pose=poseOf(before),after=applyDiagramFoldSegments(before,[segment([0,30],[100,30],'F')]),result=advanceAndCompare(pose,after);
  pose.result.layers={status:'unknown',message:'未认证'};
  result.layers={status:'unknown',message:'新姿态也未认证'};
  const saved=structuredClone(result);
  assert.equal(diagramPrecreaseLayerOrderMatches(pose,after,result),true);assert.deepEqual(result,saved);
});

test('adjacent flat F faces require no invented stacking order',()=>{
  const before=blankDoc('邻接平面',100,100);before.segments.push(segment([50,0],[50,100],'F','existing'));
  const pose=poseOf(before),after=applyDiagramFoldSegments(before,[segment([0,30],[100,30],'F','precrease')]),result=advanceAndCompare(pose,after);
  assert.equal(pose.result.layers.status,'solved');assert.deepEqual(pose.result.layers.faceOrders,[]);
  assert.equal(result.layers.status,'solved');assert.deepEqual(result.layers.faceOrders,[]);
  assert.equal(diagramPrecreaseLayerOrderMatches(pose,after,result),true);
});
