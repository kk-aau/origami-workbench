import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {distance} from '../../src/core/geometry';
import type {Doc,Point,Segment} from '../../src/core/types';
import type {DiagramPose} from '../../src/app/diagramProject';
import {defaultModelView} from '../../src/app/modelViewState';
import {mapDiagramFoldLines,projectDiagramFoldCP,type DiagramFoldPreviewSegment} from '../../src/app/diagramFoldLink';

function poseOf(doc:Doc,marks=false):DiagramPose {
  const result=computeFlatFold(doc,undefined,marks?{flatCreases:'marks'}:{});assert.equal(result.geometry.status,'ready',result.geometry.message);
  return {sourceStateId:'cp0',sourceRevision:0,sourceDoc:structuredClone(doc),result,view:defaultModelView()};
}
function segment(a:Point,b:Point,assignment:Segment['assignment']='V',id='new'):Segment {
  return {id,a,b,assignment,angle:assignment==='V'?180:assignment==='M'?-180:assignment==='U'?null:0};
}
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
const span=(part:DiagramFoldPreviewSegment)=>{assert.ok(part.strokeSpan);return part.strokeSpan;};
const byOffset=(parts:DiagramFoldPreviewSegment[])=>[...parts].sort((a,b)=>span(a).offset-span(b).offset);

test('occlusion clips retain the complete material stroke and advance the phase without persisting it',()=>{
  const doc=blankDoc('遮挡相位',100,100);doc.segments.push(segment([30,0],[30,100],'V','old'));
  const pose=poseOf(doc),annotation={id:'stroke',kind:'line' as const,a:[-40,30] as Point,b:[30,30] as Point,style:'valley' as const,color:'#314b3c',width:.7};
  const longFace=pose.result.geometry.faces.findIndex(face=>{const xs=face.map(v=>pose.result.geometry.vertices[v][0]);return Math.max(...xs)-Math.min(...xs)>60;});
  pose.result.layers={status:'unknown',message:'测试展示层序'};pose.displayOrder=[longFace,1-longFace];
  const saved=structuredClone({pose,annotation}),mapped=mapDiagramFoldLines(pose,[annotation],{enabled:true,layers:'all',selectedFaces:[]});
  const splitFace=mapped.preview.find(part=>mapped.preview.filter(other=>other.face===part.face).length===2)!.face;
  const parts=byOffset(mapped.preview.filter(part=>part.face===splitFace));
  assert.equal(parts.length,2);near(span(parts[0]).length,70);near(span(parts[1]).length,70);
  near(span(parts[0]).offset,0);near(span(parts[1]).offset,distance(parts[0].a,parts[0].b));
  assert.deepEqual(new Set(parts.map(part=>part.visibility)),new Set(['visible','hidden']));
  assert.ok(mapped.segments.every(s=>!Object.hasOwn(s,'strokeSpan')));assert.deepEqual({pose,annotation},saved);
});

test('one CP source crease keeps its complete arc across a folded indexed face boundary',()=>{
  const before=blankDoc('跨折边',100,100);before.segments.push(segment([50,0],[50,100],'V','old'));
  const pose=poseOf(before),after=structuredClone(before);after.segments.push(segment([0,30],[100,30]));
  const saved=structuredClone({before,after,pose}),parts=byOffset(projectDiagramFoldCP(pose,before,after).preview);
  assert.equal(parts.length,2);assert.equal(new Set(parts.map(part=>part.face)).size,2);
  for(const part of parts){near(span(part).length,100);near(distance(part.a,part.b),50);}
  near(span(parts[0]).offset,0);near(span(parts[1]).offset,50);assert.deepEqual({before,after,pose},saved);
});

test('CP occlusion clips advance the accumulated face offset in the actual source direction',()=>{
  const before=blankDoc('跨纸面遮挡',100,100);before.segments.push(segment([30,0],[30,100],'V','old'));
  const pose=poseOf(before),longFace=pose.result.geometry.faces.findIndex(face=>{const xs=face.map(v=>pose.result.geometry.vertices[v][0]);return Math.max(...xs)-Math.min(...xs)>60;});
  pose.result.layers={status:'unknown',message:'测试展示层序'};pose.displayOrder=[longFace,1-longFace];
  for(const reversed of [false,true]){
    const after=structuredClone(before);after.segments.push(segment(reversed?[100,30]:[0,30],reversed?[0,30]:[100,30]));
    const parts=byOffset(projectDiagramFoldCP(pose,before,after).preview.filter(part=>part.face===longFace));
    assert.equal(parts.length,2);assert.deepEqual(new Set(parts.map(part=>part.visibility)),new Set(['visible','hidden']));
    for(const part of parts)near(span(part).length,100);
    near(span(parts[0]).offset,reversed?0:30);near(span(parts[1]).offset,span(parts[0]).offset+distance(parts[0].a,parts[0].b));
  }
});

test('non-isometric triangle pieces accumulate projected arc rather than source CP distance',()=>{
  const before=blankDoc('折后弧长',100,100),pose=poseOf(before),after=structuredClone(before);
  after.segments.push(segment([50,0],[50,100]));pose.result.geometry.vertices[2]=[140,120];
  const parts=byOffset(projectDiagramFoldCP(pose,before,after).preview),first=Math.hypot(20,60),total=first+50;
  assert.equal(parts.length,2);for(const part of parts)near(span(part).length,total);
  near(span(parts[0]).offset,0);near(distance(parts[0].a,parts[0].b),first);near(span(parts[1]).offset,first);near(distance(parts[1].a,parts[1].b),50);
  pose.view={...defaultModelView(),side:'back',rotation:73};
  const rotated=byOffset(projectDiagramFoldCP(pose,before,after).preview);
  for(let i=0;i<parts.length;i++){near(span(rotated[i]).length,total);near(span(rotated[i]).offset,span(parts[i]).offset);}
});

test('a source crease on a shared triangle seam counts its displayed length once',()=>{
  const before=blankDoc('接缝去重',100,100),pose=poseOf(before),after=structuredClone(before);
  after.segments.push(segment([10,10],[90,90]));pose.result.geometry.vertices[2]=[140,120];
  const parts=projectDiagramFoldCP(pose,before,after).preview;assert.equal(parts.length,1);
  near(span(parts[0]).length,Math.hypot(112,96));near(span(parts[0]).offset,0);
});

test('F intent subtraction retains the complete parent mark and independent press span',()=>{
  const before=blankDoc('平折线拆分',100,100);before.segments.push(segment([0,40],[100,40],'F','flat'));
  const pose=poseOf(before,true),intent=segment([20,40],[80,40],'V','press'),saved=structuredClone({before,pose,intent});
  const parts=projectDiagramFoldCP(pose,before,before,undefined,[intent]).preview;
  const existing=byOffset(parts.filter(part=>part.existing)),pending=parts.filter(part=>part.existing===false);
  assert.equal(existing.length,2);assert.equal(pending.length,1);
  for(const part of existing){near(span(part).length,100);near(distance(part.a,part.b),20);}
  near(span(existing[0]).offset,0);near(span(existing[1]).offset,80);
  near(span(pending[0]).length,60);near(span(pending[0]).offset,0);assert.equal(pending[0].style,'valley');
  assert.deepEqual({before,pose,intent},saved);
});

test('trimming overlapping marks advances the original source offset instead of restarting',()=>{
  const before=blankDoc('重复覆盖裁剪',100,100),pose=poseOf(before),after=structuredClone(before);
  after.segments.push(segment([0,40],[60,40],'F','first'),segment([40,40],[100,40],'F','second'));
  const parts=projectDiagramFoldCP(pose,before,after).preview;assert.equal(parts.length,2);
  const trimmed=parts.find(part=>Math.abs(distance(part.a,part.b)-40)<1e-6)!;
  near(span(trimmed).length,60);near(span(trimmed).offset,20);
});

test('difference fragments preserve their actual parent source span without joining touching independent creases',()=>{
  const before=blankDoc('来源身份',100,100),pose=poseOf(before),after=structuredClone(before);
  after.segments.push(segment([0,40],[60,40],'V','first'),segment([40,40],[100,40],'V','second'));
  const parts=projectDiagramFoldCP(pose,before,after).preview;assert.equal(parts.length,2);
  for(const part of parts)near(span(part).length,60);
  near(span(parts.find(part=>Math.abs(distance(part.a,part.b)-40)<1e-6)!).offset,20);
  const touching=structuredClone(before);touching.segments.push(segment([0,60],[50,60],'V','left'),segment([100,60],[50,60],'V','right'));
  for(const part of projectDiagramFoldCP(pose,before,touching).preview){near(span(part).length,50);near(span(part).offset,0);}
});

test('a missing material interval starts a distinct run rather than counting an invisible chord',()=>{
  const points:Point[]=[[0,0],[100,0],[100,30],[30,30],[30,100],[0,100]];
  const before:Doc={schemaVersion:2,name:'缺纸区间',paper:{width:100,height:100},segments:points.map((a,i)=>segment(a,points[(i+1)%points.length],'B',`b${i}`))};
  const pose=poseOf(before),after=structuredClone(before);after.segments.push(segment([0,80],[80,0]));
  pose.result.geometry.vertices=pose.result.geometry.vertices.map(([x,y])=>[x*1.5,y*.8]);
  const parts=projectDiagramFoldCP(pose,before,after).preview,expected=Math.hypot(1.5,.8)*30;
  for(const part of parts){near(span(part).length,expected);assert.ok(span(part).offset>=-1e-8);assert.ok(span(part).offset+distance(part.a,part.b)<=expected+1e-6);}
  assert.equal(parts.filter(part=>span(part).offset<1e-6).length,2);
});
