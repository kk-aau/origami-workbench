import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildFold,buildDiagramFold,distance} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import type {Doc,Point} from '../../src/core/types';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelProjection} from '../../src/app/modelProjection';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {followDiagramPaperAnnotations} from '../../src/app/diagramPaperFollow';
import {diagramCPFaceTriangles} from '../../src/app/diagramCPSelection';
import {validateDiagramAnnotations,type DiagramAnnotation,type DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {createDiagramProject,adoptDiagramPose,updateDiagramAnnotations,updateDiagramPoseResult,exportDiagramProject,importDiagramProject,type DiagramPose} from '../../src/app/diagramProject';
import {materialDoc} from '../fixtures/materialModel';

function poseOf(doc=blankDoc('纸角跟随',100,100)):DiagramPose {
  const result=computeFlatFold(doc);assert.equal(result.geometry.status,'ready');
  return {sourceStateId:'cp-before',sourceRevision:0,sourceDoc:structuredClone(doc),result,view:defaultModelView()};
}
const line=(id='line',a:Point=[5,50],b:Point=[95,50],style:DiagramLineAnnotation['style']='crease'):DiagramLineAnnotation=>({id,kind:'line',a,b,style,color:'#123456',width:1.25});
const close=(a:Point,b:Point)=>assert.ok(distance(a,b)<1e-5,`${a} != ${b}`);
const lines=(a:DiagramAnnotation[])=>a.filter((v):v is DiagramLineAnnotation=>v.kind==='line');
function move(pose:DiagramPose,sourceVertex:Point,destination:Point):DiagramPose {
  const graph=buildFold(pose.sourceDoc).graph,index=graph.vertices_coords.findIndex(p=>distance(p,sourceVertex)<1e-7);assert.ok(index>=0);
  return {...pose,result:moveFoldedVertices(pose.result,{group:[index],selected:[index]},destination)};
}
function expected(pose:DiagramPose,next:DiagramPose,face:number,point:Point):Point {
  const graph=buildFold(pose.sourceDoc).graph,oldProjection=modelProjection(pose.result.geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0),newProjection=modelProjection(next.result.geometry.vertices,next.view?.side==='back',next.view?.rotation??0);
  const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(const triangle of diagramCPFaceTriangles(graph,face)){
    const old=triangle.map(v=>oldProjection.project(pose.result.geometry.vertices[v])),den=cross(old[0],old[1],old[2]),wb=cross(old[0],point,old[2])/den,wc=cross(old[0],old[1],point)/den,wa=1-wb-wc;
    if(Math.min(wa,wb,wc)<-1e-7)continue;
    const shown=triangle.map(v=>newProjection.project(next.result.geometry.vertices[v]));return [wa*shown[0][0]+wb*shown[1][0]+wc*shown[2][0],wa*shown[0][1]+wb*shown[1][1]+wc*shown[2][1]];
  }
  throw Error('test point outside old face');
}

test('unchanged displayed pose returns annotations unchanged and leaves CP and input untouched',()=>{
  const pose=poseOf(),annotations=[line()],before=structuredClone({pose,annotations}),next=structuredClone(pose);
  assert.strictEqual(followDiagramPaperAnnotations(pose,next,annotations),annotations);assert.deepEqual({pose,annotations},before);
});

test('inherited CP F handles await authoritative projection while ordinary crease artwork follows the paper',()=>{
  const pose=poseOf(),next=move(pose,[100,0],[120,-20]),existing=line('cp-existing:prior',[70,10],[90,10]),ordinary=line('illustration',[70,10],[90,10]);
  const output=followDiagramPaperAnnotations(pose,next,[existing,ordinary]);assert.strictEqual(output[0],existing);
  assert.equal(output.filter(annotation=>annotation.id.startsWith('cp-existing:')).length,1,'no split handles are derived from inherited CP lines');
  assert.notDeepEqual((output[1] as DiagramLineAnnotation).a,ordinary.a);assert.deepEqual(pose.sourceDoc,next.sourceDoc);
});

test('line endpoints and a middle point follow the deformed material triangle',()=>{
  const pose=poseOf(),next=move(pose,[100,0],[120,-20]),input=line('inside',[70,10],[90,10]),out=lines(followDiagramPaperAnnotations(pose,next,[input]));
  assert.equal(out.length,1);close(out[0].a,expected(pose,next,0,input.a));close(out[0].b,expected(pose,next,0,input.b));
  close([(out[0].a[0]+out[0].b[0])/2,(out[0].a[1]+out[0].b[1])/2],expected(pose,next,0,[80,10]));
  assert.equal(out[0].id,input.id);assert.equal(out[0].color,input.color);assert.equal(out[0].width,input.width);assert.deepEqual(out[0].foldFaces,[0]);
});

test('a line crossing the original triangle seam bends into connected material segments',()=>{
  const pose=poseOf(),next=move(pose,[100,0],[125,-15]),input=line(),out=lines(followDiagramPaperAnnotations(pose,next,[input]));
  assert.equal(out.length,2);close(out[0].a,expected(pose,next,0,input.a));close(out[1].b,expected(pose,next,0,input.b));close(out[0].b,out[1].a);
  const u:Point=[out[0].b[0]-out[0].a[0],out[0].b[1]-out[0].a[1]],v:Point=[out[1].b[0]-out[1].a[0],out[1].b[1]-out[1].a[1]];
  assert.ok(Math.abs(u[0]*v[1]-u[1]*v[0])>1,'the material line actually bends');assert.notEqual(out[0].id,out[1].id);
  assert.deepEqual(followDiagramPaperAnnotations(pose,next,[input]),out,'derived segment IDs are deterministic');
});

test('outside portions stay in place while the covered middle follows the paper',()=>{
  const pose=poseOf(),next=move(pose,[100,0],[120,-20]),input=line('through',[-20,50],[120,50]),out=lines(followDiagramPaperAnnotations(pose,next,[input]));
  assert.ok(out.length>=3);close(out[0].a,input.a);close(out[0].b,[0,50]);assert.equal(out[0].foldFaces,undefined);
  close(out.at(-1)!.a,[100,50]);close(out.at(-1)!.b,input.b);assert.equal(out.at(-1)!.foldFaces,undefined);
  assert.ok(out.some(part=>part.foldFaces?.includes(0)&&Math.max(part.a[0],part.b[0])>100));
  assert.doesNotThrow(()=>validateDiagramAnnotations(out));
});

test('a real material hole remains outside the paper while each covered side follows it',()=>{
  const points:Point[]=[[0,0],[100,0],[100,100],[0,100],[40,40],[60,40],[60,60],[40,60]],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]];
  const graph=materialCanonical(points,edges,edges.map(()=>'B'),edges.map(()=>0),[[0,1,2,3]],[[0,1,2,3]],[[[4,7,6,5]]],[[[7,6,5,4]]]),pose=poseOf(materialDoc(graph,points)),next=structuredClone(pose);
  next.result.geometry.vertices=pose.result.geometry.vertices.map(([x,y])=>[x+10,y+15]);const out=lines(followDiagramPaperAnnotations(pose,next,[line('through-hole',[10,50],[90,50])]));
  assert.equal(out.length,3);close(out[0].a,[20,65]);close(out[0].b,[50,65]);close(out[1].a,[40,50]);close(out[1].b,[60,50]);assert.equal(out[1].foldFaces,undefined);close(out[2].a,[70,65]);close(out[2].b,[100,65]);
});

function stacked(){
  const doc=blankDoc('重合纸层',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  return poseOf(doc);
}

test('coincident paper layers separate into their own lines and keep identities for the next edit',()=>{
  const pose=stacked(),next=move(pose,[100,0],[-20,-20]),input=line('two-layers',[10,20],[40,20]),before=structuredClone({pose,next,input}),out=lines(followDiagramPaperAnnotations(pose,next,[input]));
  const source=buildFold(pose.sourceDoc).graph,movingVertex=source.vertices_coords.findIndex(p=>distance(p,[100,0])<1e-7),movingFace=source.faces_vertices!.findIndex(face=>face.includes(movingVertex)),stationaryFace=1-movingFace;
  const stationary=out.filter(part=>part.foldFaces?.includes(stationaryFace));assert.equal(stationary.length,1);close(stationary[0].a,input.a);close(stationary[0].b,input.b);
  const moving=out.filter(part=>part.foldFaces?.includes(movingFace));assert.ok(moving.length);close(moving[0].a,expected(pose,next,movingFace,input.a));close(moving.at(-1)!.b,expected(pose,next,movingFace,input.b));
  assert.ok(out.length>=2);assert.ok(out.every(part=>part.foldFaces?.length===1));
  const further=move(next,[100,0],[-30,-35]),again=lines(followDiagramPaperAnnotations(next,further,out));
  assert.equal(again.filter(part=>part.foldFaces?.includes(stationaryFace)).length,1);close(again.find(part=>part.foldFaces?.includes(stationaryFace))!.a,input.a);
  assert.deepEqual({pose,next,input},before);
});

test('foldFaces limits a line to its actual original paper layer',()=>{
  const pose=stacked(),source=buildFold(pose.sourceDoc).graph,vertex=source.vertices_coords.findIndex(p=>distance(p,[100,0])<1e-7),face=source.faces_vertices!.findIndex(face=>face.includes(vertex)),next=move(pose,[100,0],[-20,-20]);
  const input={...line('one-layer',[10,20],[40,20]),foldFaces:[face]},out=lines(followDiagramPaperAnnotations(pose,next,[input]));
  assert.ok(out.length);assert.ok(out.every(part=>part.foldFaces?.length===1&&part.foldFaces[0]===face));close(out[0].a,expected(pose,next,face,input.a));
});

test('a shared triangle boundary and coincident final layers produce one line rather than duplicates',()=>{
  const pose=poseOf(),next=structuredClone(pose);next.result.geometry.vertices=pose.result.geometry.vertices.map(([x,y])=>[x+10,y+15]);
  const graph=buildFold(pose.sourceDoc).graph,triangles=diagramCPFaceTriangles(graph,0),shared=triangles[0].filter(v=>triangles[1].includes(v)).map(v=>pose.result.geometry.vertices[v]);
  assert.equal(shared.length,2);const out=lines(followDiagramPaperAnnotations(pose,next,[line('seam',shared[0],shared[1])]));assert.equal(out.length,1);
  close(out[0].a,[shared[0][0]+10,shared[0][1]+15]);close(out[0].b,[shared[1][0]+10,shared[1][1]+15]);
  const stackedPose=stacked(),stackedNext=structuredClone(stackedPose);stackedNext.result.geometry.vertices=stackedPose.result.geometry.vertices.map(([x,y])=>[x+10,y+15]);
  const coincident=lines(followDiagramPaperAnnotations(stackedPose,stackedNext,[line('both',[10,20],[40,20])]));assert.equal(coincident.length,1);assert.deepEqual(coincident[0].foldFaces,[0,1]);
});

test('symbols remain independent, and unlinked mountain and valley drawings follow the paper',()=>{
  const pose=poseOf(),next=move(pose,[100,0],[120,-20]),symbol:DiagramAnnotation={id:'symbol',kind:'symbol',symbol:'fold',position:[80,10],size:35,rotation:15,color:'#123456',width:.7};
  const input=[line('valley',[70,10],[90,10],'valley'),line('mountain',[70,15],[90,15],'mountain'),line('guide',[70,20],[90,20],'auxiliary'),symbol],out=followDiagramPaperAnnotations(pose,next,input);
  assert.strictEqual(out.find(a=>a.id===symbol.id),symbol);assert.ok(lines(out).every(a=>a.a[0]>70));assert.deepEqual(lines(out).map(a=>a.style),['valley','mountain','auxiliary']);
});

test('back-side rotation follows the display coordinates including the changing model center',()=>{
  const pose=poseOf();pose.view={...defaultModelView(),side:'back',rotation:37};const next=move(pose,[100,0],[120,-20]);
  const projection=modelProjection(pose.result.geometry.vertices,true,37),input=line('rotated',projection.project([70,10]),projection.project([90,10])),out=lines(followDiagramPaperAnnotations(pose,next,[input]));
  assert.equal(out.length,1);close(out[0].a,expected(pose,next,0,input.a));close(out[0].b,expected(pose,next,0,input.b));
});

test('changed source identities, missing topology and intersecting degenerate triangles fail safely',()=>{
  const pose=poseOf(),next=move(pose,[100,0],[120,-20]),input=[line()];
  for(const changed of [{...next,sourceStateId:'different'},{...next,sourceRevision:1},{...next,sourceDoc:{...next.sourceDoc,name:'changed'}}])assert.throws(()=>followDiagramPaperAnnotations(pose,changed,input),/来源 CP/);
  const missing=structuredClone(next);missing.result.geometry.vertices.pop();assert.throws(()=>followDiagramPaperAnnotations(pose,missing,input),/纸面身份/);
  const degenerate=structuredClone(pose);degenerate.result.geometry.vertices=pose.result.geometry.vertices.map(([x])=>[x,0]);
  assert.throws(()=>followDiagramPaperAnnotations(degenerate,next,[line('on-collapsed',[10,0],[90,0])]),/退化/);
  assert.doesNotThrow(()=>followDiagramPaperAnnotations(degenerate,next,[line('away',[10,20],[90,20])]));
});

test('split IDs stay unique within the strict schema including long names and existing collision names',()=>{
  const pose=poseOf(),next=move(pose,[100,0],[120,-20]),long=line('a'.repeat(256)),initial=lines(followDiagramPaperAnnotations(pose,next,[long]));assert.equal(initial.length,2);
  const collision=line(initial[1].id,[-20,-20],[-10,-10]),out=followDiagramPaperAnnotations(pose,next,[long,collision]);
  assert.equal(new Set(out.map(a=>a.id)).size,out.length);assert.ok(out.every(a=>a.id.length<=256));assert.doesNotThrow(()=>validateDiagramAnnotations(out));assert.ok(out.some(a=>a.id===collision.id));
});

test('saving and restoring a followed drawing preserves original layers and supports snapshot undo',()=>{
  const pose=stacked();let index=0,project=createDiagramProject(pose.sourceDoc,()=>`p-${++index}`),step=project.steps[0];
  project=adoptDiagramPose(project,step.id,step.beforeId,pose.result,pose.view);project=updateDiagramAnnotations(project,step.id,[line('folded-mark',[10,20],[40,20])]);
  const savedBefore=exportDiagramProject(project),previous=project.steps[0].pose!,next=move(previous,[100,0],[-20,-20]),annotations=followDiagramPaperAnnotations(previous,next,project.steps[0].annotations!);
  const updated=updateDiagramAnnotations(updateDiagramPoseResult(project,step.id,next.result),step.id,annotations),restored=importDiagramProject(exportDiagramProject(updated));
  assert.deepEqual(restored.steps[0].annotations,annotations);assert.deepEqual(restored.states,project.states);
  const restoredBefore=importDiagramProject(savedBefore);assert.deepEqual(restoredBefore.steps[0].annotations,project.steps[0].annotations);assert.deepEqual(restoredBefore.states,project.states);assert.deepEqual(restoredBefore.steps[0].pose!.result.geometry.vertices,previous.result.geometry.vertices);
  assert.deepEqual(restored.steps[0].pose?.result.geometry.vertices,next.result.geometry.vertices);assert.equal(project.steps[0].annotations!.length,1);
});

test('marks-mode precrease endpoints retain their source identity when paper is pulled, while background lines stay in place',()=>{
  const sourceDoc=blankDoc('无分面预折痕',100,100);sourceDoc.segments.push({id:'flat-mark',a:[0,40],b:[100,40],assignment:'F',angle:0});
  const result=computeFlatFold(sourceDoc,undefined,{flatCreases:'marks'}),pose:DiagramPose={sourceStateId:'marks',sourceRevision:0,sourceDoc,result};
  assert.equal(result.geometry.status,'ready');assert.equal(result.geometry.faces.length,1);
  const graph=buildDiagramFold(sourceDoc).graph,index=graph.vertices_coords.findIndex(p=>distance(p,[100,0])<1e-7);assert.ok(index>=0);
  const next={...pose,result:moveFoldedVertices(result,{group:[index],selected:[index]},[120,-20])},inside=line('inside',[70,10],[90,10]),background={...line('background',[-20,30],[0,30]),foldFaces:[]};
  const out=followDiagramPaperAnnotations(pose,next,[inside,background]);
  assert.notDeepEqual(out[0],inside);assert.deepEqual(out.at(-1),background);
  assert.deepEqual(sourceDoc,pose.sourceDoc);assert.doesNotThrow(()=>validateDiagramAnnotations(out));
});

function withPaperNode(pose:DiagramPose,face:number,cp:Point,point:Point):DiagramPose {
  return {...pose,paperDeformation:{nodes:[{face,cp,point}]}};
}

test('a newly inserted illustration anchor moves its attached line without adding source CP vertices',()=>{
  const pose=poseOf(),next=withPaperNode(pose,0,[50,50],[55,60]),input={...line('node-mark',[50,50],[100,50]),foldFaces:[0]},before=structuredClone({pose,next,input});
  const output=lines(followDiagramPaperAnnotations(pose,next,[input]));
  assert.equal(output.length,1);close(output[0].a,[55,60]);close(output[0].b,[100,50]);
  assert.equal(output[0].id,input.id);assert.equal(output[0].color,input.color);assert.equal(output[0].width,input.width);assert.deepEqual(output[0].foldFaces,[0]);
  assert.deepEqual({pose,next,input},before);assert.deepEqual(next.sourceDoc,pose.sourceDoc);assert.deepEqual(next.result,pose.result);
});

test('further illustration-anchor edits and returning to the flat pose preserve line and material identities',()=>{
  const pose=poseOf(),first=withPaperNode(pose,0,[50,50],[55,60]),second=withPaperNode(pose,0,[50,50],[60,70]),input={...line('node-mark',[50,50],[100,50]),foldFaces:[0]};
  const once=followDiagramPaperAnnotations(pose,first,[input]),twice=lines(followDiagramPaperAnnotations(first,second,once));
  assert.equal(twice.length,1);close(twice[0].a,[60,70]);close(twice[0].b,[100,50]);assert.equal(twice[0].id,input.id);assert.deepEqual(twice[0].foldFaces,[0]);
  const returned=lines(followDiagramPaperAnnotations(second,pose,twice));assert.equal(returned.length,1);close(returned[0].a,input.a);close(returned[0].b,input.b);assert.equal(returned[0].id,input.id);
  assert.deepEqual(first.result,pose.result);assert.deepEqual(second.sourceDoc,pose.sourceDoc);
});

test('an illustration anchor affects only its selected material bank among coincident paper layers',()=>{
  const pose=stacked(),graph=buildFold(pose.sourceDoc).graph,face=graph.faces_vertices!.findIndex(ring=>ring.some(v=>graph.vertices_coords[v][0]>50)),stationary=1-face;
  assert.ok(face>=0);const next=withPaperNode(pose,face,[75,50],[20,60]),moving={...line('moving-bank',[25,50],[50,50]),foldFaces:[face]},fixed={...line('fixed-bank',[25,50],[50,50]),foldFaces:[stationary]};
  const output=lines(followDiagramPaperAnnotations(pose,next,[moving,fixed])),moved=output.filter(a=>a.id===moving.id),unchanged=output.find(a=>a.id===fixed.id)!;
  assert.equal(moved.length,1);close(moved[0].a,[20,60]);close(moved[0].b,[50,50]);assert.deepEqual(moved[0].foldFaces,[face]);
  close(unchanged.a,fixed.a);close(unchanged.b,fixed.b);assert.deepEqual(unchanged.foldFaces,[stationary]);assert.deepEqual(next.result,pose.result);
});

test('anchor artwork uses the base-model view center on a rotated back side',()=>{
  const pose=poseOf();pose.view={...defaultModelView(),side:'back',rotation:37};
  const next=withPaperNode(pose,0,[50,50],[120,60]),projection=modelProjection(pose.result.geometry.vertices,true,37),input={...line('node-back',projection.project([50,50]),projection.project([100,50])),foldFaces:[0]};
  const output=lines(followDiagramPaperAnnotations(pose,next,[input]));assert.equal(output.length,1);
  close(output[0].a,projection.project([120,60]));close(output[0].b,projection.project([100,50]));assert.equal(output[0].id,input.id);
  assert.deepEqual(next.result,pose.result);assert.deepEqual(next.sourceDoc,pose.sourceDoc);
});
