import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold,recomputeFlatLayers} from '../../src/core/flatFold';
import {diagramStepLayerPreferences,inheritDiagramFixedAnchor} from '../../src/app/diagramStepInheritance';
import {alignDiagramFoldResult,diagramFoldStartingFace,pickDiagramFoldAnchor} from '../../src/app/diagramFoldLink';
import {buildDiagramPoseFold} from '../../src/app/diagramFoldGeometry';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {Doc,Point} from '../../src/core/types';
import {modelProjection} from '../../src/app/modelProjection';

function poseOf(doc:Doc,solutionIndex=0):DiagramPose{const result=computeFlatFold(doc,undefined,{flatCreases:'marks',solutionIndex});assert.equal(result.geometry.status,'ready',result.geometry.message);return {sourceDoc:structuredClone(doc),sourceStateId:'old-state',sourceRevision:3,result};}
function strip(){const doc=blankDoc('五联多解',100,100);for(let i=1;i<5;i++)doc.segments.push({id:String(i),a:[i*20,0],b:[i*20,100],assignment:'V',angle:180});return doc;}
function fixedOf(pose:DiagramPose,face=0){const row=pose.result.geometry.faces[face],points=row.map(v=>pose.result.geometry.vertices[v]),center:Point=[points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length];return pickDiagramFoldAnchor(pose,modelProjection(pose.result.geometry.vertices,false,0).project(center),face);}

test('same material face relationships preserve every previous chosen legal solution after source IDs/revision change',()=>{
  const doc=strip();let remappedIndex=false;for(let i=0;i<4;i++){
    const previous=poseOf(doc,i),after=structuredClone(doc);after.segments=after.segments.reverse().map((segment,n)=>({...segment,id:`new-${n}`,a:segment.b,b:segment.a}));
    const fixed=fixedOf(previous),next=poseOf(after);next.result=alignDiagramFoldResult(after,computeFlatFold(after,undefined,{flatCreases:'marks',startingFace:diagramFoldStartingFace(after,fixed)}),fixed);
    const wanted=diagramStepLayerPreferences(previous,after,next.result);assert.ok(wanted.length);
    const solved=recomputeFlatLayers(next.result,{layerPreferences:wanted});assert.equal(solved.layers.status,'solved');if(solved.layers.solutionIndex!==i)remappedIndex=true;
    const canonical=recomputeFlatLayers(next.result,{solutionIndex:solved.layers.solutionIndex});assert.deepEqual(solved.layers.faceOrders,canonical.layers.faceOrders);assert.match(solved.layers.message,/保留未改动纸面/);
  }assert.equal(remappedIndex,true,'different material numbering can legitimately require another canonical solver index');
});

test('new active fold changes inherit only unchanged rigid material faces, never the moved/merged face IDs',()=>{
  const previous=poseOf(strip(),3),after=structuredClone(previous.sourceDoc);after.segments=after.segments.filter(segment=>segment.id!=='4');
  const fixed=fixedOf(previous),result=alignDiagramFoldResult(after,computeFlatFold(after,undefined,{flatCreases:'marks',startingFace:diagramFoldStartingFace(after,fixed)}),fixed),wanted=diagramStepLayerPreferences(previous,after,result);
  assert.ok(wanted.length,'unchanged overlapping paper retains its prior relationships');assert.ok(wanted.length<previous.result.layers.faceOrders!.length);
  const solved=recomputeFlatLayers(result,{layerPreferences:wanted});assert.equal(solved.layers.status,'solved',solved.layers.message);assert.deepEqual(solved.geometry,result.geometry);
  assert.ok(solved.layers.message.includes('保留未改动纸面')||solved.warnings.some(message=>message.startsWith('[纸层继承]')),'a genuine conflict is explicit and never forces a fake inherited certificate');
});

test('unknown certificates, changed raw placement and deformed material never inherit arbitrary drawing permutations',()=>{
  const previous=poseOf(strip(),3),next=poseOf(previous.sourceDoc);previous.result.layers={status:'unknown',message:'待分析'};previous.displayOrder=[4,3,2,1,0];
  assert.deepEqual(diagramStepLayerPreferences(previous,next.sourceDoc,next.result),[]);
  const source=poseOf(strip(),3),shifted=structuredClone(next.result);shifted.geometry.vertices=shifted.geometry.vertices.map(([x,y])=>[x+10,y]);shifted.geometry.graph!.vertices_coords=structuredClone(shifted.geometry.vertices);
  assert.deepEqual(diagramStepLayerPreferences(source,next.sourceDoc,shifted),[]);
});

test('unchanged fixed material face survives state replacement and collinear boundary segmentation, with refreshed targets',()=>{
  const doc=blankDoc('固定纸面',100,100),previous=poseOf(doc),fixed={...fixedOf(previous),target:{stateId:'old-state',kind:'vertex' as const,point:[0,0] as Point}},after=structuredClone(doc);
  const edge=after.segments.findIndex(segment=>segment.a[1]===0&&segment.b[1]===0),boundary=after.segments.splice(edge,1)[0],mid:Point=[(boundary.a[0]+boundary.b[0])/2,0];after.segments.push({...boundary,id:'split-a',b:mid},{...boundary,id:'split-b',a:mid});
  const next=poseOf(after);next.sourceStateId='next-state';next.sourceRevision=8;next.result=alignDiagramFoldResult(after,next.result,fixed);
  const inherited=inheritDiagramFixedAnchor(previous,next,fixed);assert.ok(inherited);assert.deepEqual(inherited!.point,fixed.point);assert.deepEqual(inherited!.target,{stateId:'next-state',kind:'vertex',point:[0,0]});
  assert.equal(diagramFoldStartingFace(after,inherited!),0);assert.notEqual(inherited!.matrix,fixed.matrix);
});

test('fixed material face split by a new crease, merged by removing a crease or moved cannot persist silently',()=>{
  const previous=poseOf(blankDoc('分割',100,100)),fixed=fixedOf(previous),split=structuredClone(previous.sourceDoc);split.segments.push({id:'new-fold',a:[20,0],b:[20,100],assignment:'V',angle:180});
  assert.equal(inheritDiagramFixedAnchor(previous,poseOf(split),fixed),undefined);
  const folded=poseOf(strip()),foldedFixed=fixedOf(folded),merged=blankDoc('已展开',100,100);assert.equal(inheritDiagramFixedAnchor(folded,poseOf(merged),foldedFixed),undefined);
  const moved=structuredClone(previous);moved.result.geometry.vertices=moved.result.geometry.vertices.map(([x,y])=>[x+15,y]);moved.result.geometry.graph!.vertices_coords=structuredClone(moved.result.geometry.vertices);assert.equal(inheritDiagramFixedAnchor(previous,moved,fixed),undefined);
});

test('a removed collinear target vertex becomes an interior face target while the unchanged fixed material remains selected',()=>{
  const doc=blankDoc('删共线点',100,100),edge=doc.segments.findIndex(segment=>segment.a[1]===0&&segment.b[1]===0),boundary=doc.segments.splice(edge,1)[0];doc.segments.push({...boundary,id:'split-a',b:[50,0]},{...boundary,id:'split-b',a:[50,0]});
  const previous=poseOf(doc),fixed={...fixedOf(previous),target:{stateId:'old-state',kind:'vertex' as const,point:[50,0] as Point}},next=poseOf(blankDoc('同面',100,100));
  assert.ok(buildDiagramPoseFold(previous).graph.vertices_coords.some(([x,y])=>x===50&&y===0));const inherited=inheritDiagramFixedAnchor(previous,next,fixed,'next-state');assert.ok(inherited);assert.deepEqual(inherited!.target,{stateId:'next-state',kind:'face',point:fixed.point});
});

test('a separately authored next after CP must preserve the whole fixed material face',()=>{
  const doc=blankDoc('下一步固定范围',100,100),previous=poseOf(doc),next=poseOf(doc),fixed=fixedOf(previous),unchanged=structuredClone(doc);
  unchanged.name='操作后仅重命名';assert.ok(inheritDiagramFixedAnchor(previous,next,fixed,'next-after',unchanged));
  const split=structuredClone(doc);split.segments.push({id:'split-fixed-material',a:[20,0],b:[20,100],assignment:'V',angle:180});
  assert.equal(inheritDiagramFixedAnchor(previous,next,fixed,'next-after',split),undefined,'a split target material face requires an explicit new fixed choice');
  const folded=poseOf(strip()),merged=blankDoc('下一步已合并',100,100);
  assert.equal(inheritDiagramFixedAnchor(folded,folded,fixedOf(folded),'next-after',merged),undefined,'a merged target material face cannot silently retain a former face seed');
});

test('a collinear fixed vertex removed only from the next after CP falls back to its preserved material face',()=>{
  const doc=blankDoc('目标CP合并边',100,100),edge=doc.segments.findIndex(segment=>segment.a[1]===0&&segment.b[1]===0),boundary=doc.segments.splice(edge,1)[0];doc.segments.push({...boundary,id:'split-a',b:[50,0]},{...boundary,id:'split-b',a:[50,0]});
  const previous=poseOf(doc),fixed={...fixedOf(previous),target:{stateId:'old-state',kind:'vertex' as const,point:[50,0] as Point}},inherited=inheritDiagramFixedAnchor(previous,poseOf(doc),fixed,'next-after',blankDoc('目标同面',100,100));
  assert.ok(inherited);assert.deepEqual(inherited!.target,{stateId:'next-after',kind:'face',point:fixed.point});
});
