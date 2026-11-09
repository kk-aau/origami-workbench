import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {distance,polygonArea} from '../../src/core/geometry';
import type {Point} from '../../src/core/types';
import {defaultModelView,validateModelView} from '../../src/app/modelViewState';
import {diagramDepthAvailable,diagramDepthMaterialPoint,diagramDepthVertices} from '../../src/app/diagramDepth';
import {diagramIllustrationMesh} from '../../src/app/diagramIllustrationMesh';
import {diagramModelMarkup,diagramPresentation} from '../../src/app/diagramDrawing';
import {modelProjection} from '../../src/app/modelProjection';
import {mapDiagramFoldLines,pickDiagramFoldAnchor,applyDiagramFoldMatrix,diagramFoldFacesAtPoint} from '../../src/app/diagramFoldLink';
import {updateDiagramDepth} from '../../src/app/diagramDepthTransaction';
import {createDiagramProject,adoptDiagramPose,updateDiagramAnnotations,updateDiagramFoldLink,exportDiagramProject,importDiagramProject,type DiagramPose} from '../../src/app/diagramProject';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {reconcileDiagramFoldAnnotations} from '../../src/app/diagramFoldTransactions';
import {applyDiagramLayerSolution,applyDiagramLayerAnalysis,diagramLayerAnalysisKey} from '../../src/app/diagramLayerAnalysis';

function fixture(){
 const doc=blankDoc('图解展开',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
 const result=computeFlatFold(doc);assert.equal(result.layers.status,'solved');
 const pose:DiagramPose={sourceStateId:'cp0',sourceRevision:0,sourceDoc:doc,result,view:{...defaultModelView(),depth:{amount:.05,direction:135}}};
 return {doc,result,pose};
}
const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-6,`${a} != ${b}`);
const stroke=(a:Point,b:Point,face:number):DiagramLineAnnotation=>({id:'crease',kind:'line',a,b,style:'valley',color:'#123456',width:1,foldFaces:[face]});
const mix=(points:Point[],w:number[]):Point=>[0,1].map(axis=>points.reduce((sum,p,i)=>sum+p[axis]*w[i],0)) as Point;

test('display relief preserves source CP and physical vertices, shares every hinge, and restores exactly',()=>{
 const {pose}=fixture(),before=structuredClone(pose),mesh=diagramIllustrationMesh(pose);
 assert.ok(diagramDepthAvailable(pose));assert.notDeepEqual(mesh.vertices,pose.result.geometry.vertices);
 for(const row of mesh.triangles)for(const tri of row){const old=polygonArea(tri.map(i=>pose.result.geometry.vertices[i])),next=polygonArea(tri.map(i=>mesh.vertices[i]));assert.ok(next/old>=.2-1e-8);}
 const hinge=mesh.graph.vertices_coords.map((p,i)=>p[0]===50?i:-1).filter(i=>i>=0);
 assert.ok(hinge.length>=2);for(const v of hinge)close(mesh.vertices[v],pose.result.geometry.vertices[v]);
 assert.deepEqual(pose,before);
 const flat={...pose,view:{...pose.view!,depth:{amount:0,direction:135}}};assert.deepEqual(diagramIllustrationMesh(flat).vertices,pose.result.geometry.vertices);
 assert.notEqual(diagramModelMarkup(pose),diagramModelMarkup(flat));
 assert.equal(diagramModelMarkup(pose,flat.view),diagramModelMarkup(flat));
});

test('drawing on expanded cells maps back to material coordinates on either side, fixed anchors stay rigid',()=>{
 for(const side of ['front','back'] as const){
  const {pose}=fixture();pose.view={...pose.view!,side,rotation:47};
  const mesh=diagramIllustrationMesh(pose),shown=diagramPresentation(pose).vertices;
  for(let face=0;face<mesh.triangles.length;face++){
   const tri=mesh.triangles[face][0],a=mix(tri.map(i=>shown[i]),[.6,.2,.2]),b=mix(tri.map(i=>shown[i]),[.2,.4,.4]);
   const cpA=mix(tri.map(i=>mesh.graph.vertices_coords[i]),[.6,.2,.2]),cpB=mix(tri.map(i=>mesh.graph.vertices_coords[i]),[.2,.4,.4]);
   const mapped=mapDiagramFoldLines(pose,[stroke(a,b,face)],{enabled:true,layers:'selected',selectedFaces:[face]});
   assert.ok(mapped.segments.length);close(mapped.segments[0].a,cpA);close(mapped.segments.at(-1)!.b,cpB);
   assert.ok(Math.abs(mapped.segments.reduce((sum,s)=>sum+distance(s.a,s.b),0)-distance(cpA,cpB))<1e-6);
   for(let i=1;i<mapped.segments.length;i++)close(mapped.segments[i-1].b,mapped.segments[i].a);
   assert.ok(diagramFoldFacesAtPoint(pose,a).includes(face));
   const anchor=pickDiagramFoldAnchor(pose,a,face);close(anchor.point,cpA);
   close(applyDiagramFoldMatrix(anchor.matrix,cpA),mix(tri.map(i=>pose.result.geometry.vertices[i]),[.6,.2,.2]));
   const q=diagramDepthMaterialPoint(mesh,cpA)!;close(modelProjection(pose.result.geometry.vertices,side==='back',47).project(q),a);
  }
 }
});

test('display settings survive export, keep physical results and CP revisions, and annotation material ownership',()=>{
 const {doc,result}=fixture();let count=0,p=createDiagramProject(doc,()=>`depth-${++count}`);
 p=adoptDiagramPose(p,p.activeStepId,p.states[0].id,result,defaultModelView());
 assert.equal(p.steps[0].pose?.view?.depth,undefined);
 p=updateDiagramDepth(p,p.activeStepId,{amount:0,direction:135});
 const pose=p.steps[0].pose!,mesh=diagramIllustrationMesh(pose),tri=mesh.triangles[0][0],a=mix(tri.map(i=>mesh.vertices[i]),[.6,.2,.2]),b=mix(tri.map(i=>mesh.vertices[i]),[.2,.4,.4]);
 p=updateDiagramAnnotations(p,p.activeStepId,[stroke(a,b,0)]);
 const original=structuredClone(p),next=updateDiagramDepth(p,p.activeStepId,{amount:.1,direction:75});
 assert.deepEqual(next.states,p.states);assert.deepEqual(next.steps[0].pose!.result,p.steps[0].pose!.result);assert.deepEqual(p,original);
 const lines=next.steps[0].annotations!.filter((a):a is DiagramLineAnnotation=>a.kind==='line');assert.equal(lines.length,1);assert.deepEqual(lines[0].foldFaces,[0]);assert.notDeepEqual(lines[0].a,a);
 const back=updateDiagramDepth(next,next.activeStepId,{amount:0,direction:135}),line=back.steps[0].annotations![0] as DiagramLineAnnotation;close(line.a,a);close(line.b,b);
 let saved=importDiagramProject(exportDiagramProject(next));assert.deepEqual(saved.steps[0].pose!.view!.depth,{amount:.1,direction:75});
 const restoredLayers=recomputeFlatLayers(saved.steps[0].pose!.result);saved=applyDiagramLayerAnalysis(saved,saved.activeStepId,diagramLayerAnalysisKey(saved,saved.activeStepId)!,restoredLayers);
 assert.ok(diagramDepthAvailable(saved.steps[0].pose!));assert.deepEqual(saved.steps[0].annotations,next.steps[0].annotations);assert.deepEqual(diagramIllustrationMesh(saved.steps[0].pose!).vertices,diagramIllustrationMesh(next.steps[0].pose!).vertices);
 delete original.steps[0].pose!.view!.depth;assert.equal(importDiagramProject(exportDiagramProject(original)).steps[0].pose!.view!.depth,undefined);
});

test('unknown layer order, pulled poses and real spatial poses do not receive cosmetic displacement',()=>{
 const {pose}=fixture();
 for(const other of [{...pose,result:{...pose.result,layers:{status:'unknown' as const,message:'unknown'}}},{...pose,result:{...pose.result,geometry:{...pose.result.geometry,modified:true,vertices:pose.result.geometry.vertices.map(([x,y],i):Point=>[x+(i===0?5:0),y])}}}]){
  assert.equal(diagramDepthAvailable(other),false);assert.deepEqual(diagramIllustrationMesh(other).vertices,other.result.geometry.vertices);
 }
 assert.equal(diagramDepthAvailable({...pose,spatial:{} as NonNullable<DiagramPose['spatial']>}),false);
});

test('tiny faces reduce display displacement without reversing triangle orientation',()=>{
 const {pose}=fixture(),vertices:Point[]=[[0,0],[1,0],[0,.00001],[1,.00001],[0,1],[1,1]],triangles=[[[0,1,2]],[[2,3,4],[3,4,5]]];
 pose.result={...pose.result,geometry:{...pose.result.geometry,vertices}};pose.view!.depth={amount:.15,direction:270};
 const relief=diagramDepthVertices(pose,vertices,triangles);assert.ok(relief.effectiveAmount<.15);
 for(const row of triangles)for(const t of row)assert.ok(polygonArea(t.map(i=>relief.vertices[i]))/polygonArea(t.map(i=>vertices[i]))>=.2-1e-8);
});

test('invalid depth settings are rejected before rendering or saving',()=>{
 for(const depth of [{amount:NaN,direction:0},{amount:.16,direction:0},{amount:.05,direction:360},{amount:-.1,direction:0}])assert.throws(()=>validateModelView({...defaultModelView(),depth}),/展开量或方向/);
});

test('editing a crease in the expanded view updates the same material CP and toggling preserves it',()=>{
 const {doc,result}=fixture();let p=createDiagramProject(doc);
 p=adoptDiagramPose(p,p.activeStepId,p.states[0].id,result);
 p=updateDiagramFoldLink(p,p.activeStepId,{enabled:true,layers:'selected',selectedFaces:[0],drawingVersion:1});
 p=updateDiagramDepth(p,p.activeStepId,{amount:.08,direction:135});
 const pose=p.steps[0].pose!,mesh=diagramIllustrationMesh(pose),tri=mesh.triangles[0][0];
 const a=mix(tri.map(i=>mesh.vertices[i]),[.6,.2,.2]),b=mix(tri.map(i=>mesh.vertices[i]),[.2,.4,.4]);
 const next=reconcileDiagramFoldAnnotations(p,p.activeStepId,[stroke(a,b,0)]);
 assert.ok(next.states[1].revision>p.states[1].revision);assert.deepEqual(next.states[0],p.states[0]);
 const flat=updateDiagramDepth(next,next.activeStepId,{amount:0,direction:135});assert.deepEqual(flat.states,next.states);
 const again=updateDiagramDepth(flat,flat.activeStepId,{amount:.08,direction:135});assert.deepEqual(again.states,next.states);
 const saved=importDiagramProject(exportDiagramProject(again));assert.deepEqual(saved.steps[0].pose!.view!.depth,again.steps[0].pose!.view!.depth);
});

test('changing a certified layer solution transports annotations with their material faces',()=>{
 const doc=blankDoc('层序与展开',100,100);for(let x=20;x<100;x+=20)doc.segments.push({id:`fold-${x}`,a:[x,0],b:[x,100],assignment:'V',angle:180});
 const first=computeFlatFold(doc),other=recomputeFlatLayers(first,{solutionIndex:1});let p=createDiagramProject(doc);
 p=adoptDiagramPose(p,p.activeStepId,p.states[0].id,first);p=updateDiagramDepth(p,p.activeStepId,{amount:.08,direction:135});
 const pose=p.steps[0].pose!,mesh=diagramIllustrationMesh(pose),tri=mesh.triangles[0][0];
 const input=stroke(mix(tri.map(i=>mesh.vertices[i]),[.6,.2,.2]),mix(tri.map(i=>mesh.vertices[i]),[.2,.4,.4]),0);
 p=updateDiagramAnnotations(p,p.activeStepId,[input]);
 const next=applyDiagramLayerSolution(p,p.activeStepId,diagramLayerAnalysisKey(p,p.activeStepId)!,other,1);
 assert.notEqual(next,p);assert.deepEqual(next.states,p.states);
 const lines=next.steps[0].annotations!.filter((a):a is DiagramLineAnnotation=>a.kind==='line');
 const mapped=mapDiagramFoldLines(next.steps[0].pose!,lines,{enabled:true,layers:'selected',selectedFaces:[0]});
 close(mapped.segments[0].a,mix(tri.map(i=>mesh.graph.vertices_coords[i]),[.6,.2,.2]));close(mapped.segments.at(-1)!.b,mix(tri.map(i=>mesh.graph.vertices_coords[i]),[.2,.4,.4]));
});
