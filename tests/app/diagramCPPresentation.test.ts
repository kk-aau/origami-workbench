import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import type {Doc,Segment} from '../../src/core/types';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {createDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {createDiagramCPPresentation} from '../../src/app/diagramCPPresentation';
import type {DiagramCPState,DiagramPose} from '../../src/app/diagramProject';
import {creaseLineStroke,creaseLineStyle} from '../../src/app/creaseLineStyle';
import {defaultCreaseDisplay} from '../../src/app/creaseDisplay';
import {creasePatternSVG} from '../../src/app/creasePatternSVG';
import {packCreaseGpuScene,creaseGpuHoverTitle,CREASE_GPU_STRIDE,type CreaseGpuScene} from '../../src/components/creaseGpuRenderer';

const crease=(id:string,angle:number|null=90):Segment=>({id,a:[50,0],b:[50,100],assignment:angle!==null&&angle<0?'M':'V',angle});
function source(angle:number|null=90){const doc=blankDoc('CP 展示',100,100);doc.segments.push(crease('old',angle));return {id:'before',revision:2,doc};}
function spatial(before:DiagramCPState):DiagramPose{return {sourceStateId:before.id,sourceRevision:before.revision,sourceDoc:structuredClone(before.doc),...createDiagramSpatialPose(before.doc)};}
const last=(doc:Doc)=>doc.segments.at(-1)!;

test('solid CP display preserves all six semantic colors and target angles at every zoom',()=>{
  const segments=(['M','V','B','A','U','F'] as const).map((assignment,i):Segment=>({...crease(String(i),assignment==='M'?-60:assignment==='V'?90:assignment==='U'?null:0),assignment}));
  const before=structuredClone(segments);
  for(const s of segments)for(const units of [.001,.1,1,10]){
    const stroke=creaseLineStroke(s,'WORKBENCH',1.6,units,true,false,'dashed',true);
    assert.equal(stroke.dash,undefined);assert.equal(stroke.limited,false);
    assert.equal(stroke.color,creaseLineStyle(s,'WORKBENCH',units,'dashed').color);
  }
  assert.deepEqual(segments,before);
  assert.ok(creaseLineStroke(segments[0],'WORKBENCH',1.6,1,false).dash,'ordinary editor retains its mountain dash');
  assert.ok(creaseLineStroke(segments[4],'WORKBENCH',1.6,1,false).dash,'ordinary unknown lines retain their dash');
});

test('GPU CP solid presentation retains selection and shows the same detailed tooltip during drag',()=>{
  const before=source(90),pose=spatial(before),doc={...before.doc,segments:before.doc.segments.map(s=>s.id==='old'?{...s,angle:120}:s)};
  const presentation=createDiagramCPPresentation(doc,{before,pose,phase:'after'});
  const scene:CreaseGpuScene={segments:doc.segments,selected:new Set(['old']),hiddenId:null,main:true,auxiliary:true,display:defaultCreaseDisplay(),vertices:[],solidCreases:true,segmentPresentation:presentation.segments};
  const packed=packCreaseGpuScene(scene),index=doc.segments.length-1;
  for(let i=0;i<packed.count;i++)assert.equal(packed.lines[i*CREASE_GPU_STRIDE+21],0);
  assert.equal(packed.lines[index*CREASE_GPU_STRIDE+19],1);
  assert.equal(packed.lines[index*CREASE_GPU_STRIDE+18],Math.fround(1.6*1.3));
  const title=creaseGpuHoverTitle(scene,[53,55],.1,[3,5],true)!;
  assert.match(title,/当前已折 90°.*部分折叠/);assert.match(title,/本步目标 120°/);assert.match(title,/本步修改/);
});

test('selection-dialog SVG uses solid lines while ordinary exports and callout artwork keep configured patterns',()=>{
  const doc=source(90).doc;doc.segments.push({...crease('unknown',null),assignment:'U',a:[25,0],b:[25,100]});
  const before=structuredClone(doc),display=defaultCreaseDisplay();
  const solid=creasePatternSVG(doc,display,undefined,undefined,{solidCreases:true});
  assert.doesNotMatch(solid,/stroke-dasharray=/);
  assert.match(creasePatternSVG(doc,display),/stroke-dasharray=/);
  assert.deepEqual(doc,before);assert.deepEqual(display,defaultCreaseDisplay());
});

test('uncertified before targets remain targets, including null and legacy 45-degree flattened snapshots',()=>{
  for(const angle of [45,180,null]){
    const before=source(angle),flat=computeFlatGeometry(buildDiagramFold(before.doc).graph,1e-6);
    const noPose=createDiagramCPPresentation(before.doc,{before,phase:'before'}).segments.get('old')!;
    assert.match(noPose.title,/此前目标/);assert.doesNotMatch(noPose.title,/当前已折|完全折叠/);
    if(angle!==180){
      const pose={sourceStateId:before.id,sourceRevision:before.revision,sourceDoc:before.doc,result:flat};
      const info=createDiagramCPPresentation(before.doc,{before,pose,phase:'before'}).segments.get('old')!;
      assert.equal(info.actualAngle,undefined);assert.match(info.title,/实际角未确认/);
    }
  }
});

test('a verified 180-degree flat snapshot may report complete folding; a stale snapshot may not',()=>{
  const before=source(180),pose:DiagramPose={sourceStateId:before.id,sourceRevision:before.revision,sourceDoc:before.doc,result:computeFlatGeometry(buildDiagramFold(before.doc).graph,1e-6)};
  const info=createDiagramCPPresentation(before.doc,{before,pose,phase:'before'}).segments.get('old')!;
  assert.equal(info.actualAngle,180);assert.match(info.title,/当前已折 180°.*完全折叠/);
  const stale={...pose,sourceRevision:1},unknown=createDiagramCPPresentation(before.doc,{before,pose:stale,phase:'before'}).segments.get('old')!;
  assert.equal(unknown.actualAngle,undefined);assert.match(unknown.title,/此前目标 180°/);
});

test('same revision cannot authenticate a pose when paper or physical metadata differs',()=>{
  const before=source(90),pose=spatial(before);
  for(const doc of [{...before.doc,paper:{width:120,height:100}},{...before.doc,metadata:{paperMask:{holes:[[[0,0],[1,0],[0,1]]]}}}]){
    const context={before:{...before,doc},pose,phase:'before' as const},shown=createDiagramCPPresentation(doc,context).segments.get('old')!;
    assert.equal(shown.actualAngle,undefined);assert.match(shown.title,/实际角未确认/);
  }
});

test('renaming and subdividing old creases never makes them newly drawn',()=>{
  const before=source(90),pose=spatial(before),original=last(before.doc);
  const doc={...before.doc,segments:[...before.doc.segments.slice(0,-1),{...original,id:'first',b:[50,40] as [number,number]},{...original,id:'second',a:[50,40] as [number,number]}]};
  const shown=createDiagramCPPresentation(doc,{before,pose,phase:'after'});
  for(const id of ['first','second']){const info=shown.segments.get(id)!;assert.equal(info.origin,'previous');assert.equal(info.emphasis,false);assert.ok(Math.abs(info.actualAngle!-90)<1e-5);assert.match(info.title,/当前已折 90°.*本步目标 90°/);}
});

test('new material intervals, property changes and partial extensions are distinguished without mutating CPs',()=>{
  const before=source(90),saved=structuredClone(before),doc={...before.doc,segments:[...before.doc.segments.slice(0,-1),{...last(before.doc),angle:120}, {...crease('new',60),a:[25,0] as [number,number],b:[25,100] as [number,number]}]};
  const shown=createDiagramCPPresentation(doc,{before,pose:spatial(before),phase:'after'});
  assert.equal(shown.segments.get('old')!.origin,'modified');assert.equal(shown.segments.get('new')!.origin,'new');
  assert.match(shown.segments.get('new')!.title,/当前未执行.*本步目标 60°/);
  const extended=shown.describe({...crease('extension',90),a:[50,-20],b:[50,100]});assert.equal(extended.origin,'mixed');assert.equal(extended.actualAngle,undefined);
  assert.deepEqual(before,saved);
});

test('F/0 precreases retain their press peak and distinguish before plans from after actions',()=>{
  const before=source(0),flat={...last(before.doc),assignment:'F' as const,angle:0},doc={...before.doc,segments:[...before.doc.segments.slice(0,-1),flat]},precreases=[crease('press',90)];
  const after=createDiagramCPPresentation(doc,{before,phase:'after',precreases}).segments.get('old')!;
  assert.match(after.title,/本步预折 90° → 展开/);assert.equal(after.emphasis,true);
  const prior=createDiagramCPPresentation(before.doc,{before,phase:'before',precreases}).segments.get('old')!;
  assert.match(prior.title,/本步计划预折 90°/);assert.doesNotMatch(prior.title,/本步目标/);assert.equal(prior.emphasis,false);
});
