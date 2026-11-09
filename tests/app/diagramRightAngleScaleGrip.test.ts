import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import {DIAGRAM_ANNOTATION_LIMITS,validateDiagramAnnotations,type DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {buildCadSymbolGeometry} from '../../src/app/diagramCadSymbolGeometry';
import {diagramAnnotationMarkup,moveSymbolNativeGrip,symbolNativeBaseline,symbolNativeGrips} from '../../src/app/diagramAnnotationSVG';
import {diagramGripDragPoint,diagramGripFunction} from '../../src/app/diagramSymbolGrips';
import {createDiagramProject,exportDiagramProject,importDiagramProject,updateDiagramAnnotations} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';

const marker=(patch:Partial<DiagramSymbolAnnotation>={}):DiagramSymbolAnnotation=>({id:'perpendicular',kind:'symbol',symbol:'rightAngle',position:[120,85],size:16,rotation:0,color:'#293d35',width:.7,cadProperties:{},...patch});
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const pointClose=(actual:Point,expected:Point)=>{close(actual[0],expected[0]);close(actual[1],expected[1]);};
const anchor=(a:DiagramSymbolAnnotation)=>symbolNativeGrips(a).find(g=>g.id==='center')!.point;
const scaleGrip=(a:DiagramSymbolAnnotation)=>symbolNativeGrips(a).find(g=>g.semantic==='scale')!;
function world(a:DiagramSymbolAnnotation,p:Point):Point {
  const angle=a.rotation*Math.PI/180,x=p[0]*a.size/100*(a.mirrored?-1:1),y=p[1]*a.size/100;
  return [a.position[0]+x*Math.cos(angle)-y*Math.sin(angle),a.position[1]+x*Math.sin(angle)+y*Math.cos(angle)];
}
function artwork(a:DiagramSymbolAnnotation):Point[] {
  return buildCadSymbolGeometry(a).primitives.flatMap(p=>p.kind==='path'?p.points:[p.point]).map(p=>world(a,p));
}
function target(a:DiagramSymbolAnnotation,factor:number):Point {
  const root=anchor(a),grip=scaleGrip(a).point;
  return [root[0]+(grip[0]-root[0])*factor,root[1]+(grip[1]-root[1])*factor];
}

test('the real blue perpendicular grip uniformly grows and shrinks all artwork around its fixed red anchor',()=>{
  for(const rotation of [0,37,129])for(const mirrored of [false,true])for(const cadProperties of [{},{'距离1':7,'角度1':32,'翻转状态1':1}])for(const factor of [.5,1.4]){
    const a=marker({rotation,mirrored,cadProperties}),saved=structuredClone(a),grip=scaleGrip(a),root=anchor(a),before=artwork(a);
    assert.equal(grip.sourceGripHandle,1122);assert.equal(diagramGripFunction(grip),'scale');assert.match(grip.label,/缩放/);
    const changed=moveSymbolNativeGrip(a,grip.id,target(a,factor));
    close(changed.size,a.size*factor);pointClose(anchor(changed),root);pointClose(scaleGrip(changed).point,target(a,factor));
    assert.equal(changed.rotation,a.rotation);assert.equal(changed.mirrored,a.mirrored);assert.equal(changed.width,a.width);assert.equal(changed.color,a.color);
    assert.deepEqual(changed.cadProperties,a.cadProperties,'blue-grip scaling must not invoke the native translating distance action');
    const after=artwork(changed);assert.equal(after.length,before.length);
    after.forEach((p,i)=>pointClose(p,[root[0]+(before[i][0]-root[0])*factor,root[1]+(before[i][1]-root[1])*factor]));
    assert.doesNotThrow(()=>validateDiagramAnnotations([changed]));assert.deepEqual(a,saved);
  }
});

test('blue-grip resizing uses only baseline motion and never jumps from an offset initial pointer press',()=>{
  const a=marker({rotation:37,mirrored:true}),saved=structuredClone(a),grip=scaleGrip(a),root=anchor(a),press:Point=[grip.point[0]+.8,grip.point[1]-.6];
  assert.deepEqual(moveSymbolNativeGrip(a,grip.id,diagramGripDragPoint(grip.point,press,press)),a);
  const direction:Point=[grip.point[0]-root[0],grip.point[1]-root[1]],length=Math.hypot(...direction),normal:Point=[-direction[1]/length,direction[0]/length];
  assert.deepEqual(moveSymbolNativeGrip(a,grip.id,[grip.point[0]+normal[0]*30,grip.point[1]+normal[1]*30]),a);
  const goal=target(a,1.3),changed=moveSymbolNativeGrip(a,grip.id,[goal[0]+normal[0]*12,goal[1]+normal[1]*12]);
  close(changed.size,a.size*1.3);pointClose(anchor(changed),root);assert.deepEqual(a,saved);
});

test('unreachable or non-finite blue-grip sizes fail without moving the marker or mutating its original state',()=>{
  const a=marker(),saved=structuredClone(a),grip=scaleGrip(a);
  for(const goal of [anchor(a),target(a,-1),target(a,DIAGRAM_ANNOTATION_LIMITS.size/a.size*2),target(a,1e-12),[NaN,0],[0,Infinity]] as Point[]){
    assert.throws(()=>moveSymbolNativeGrip(a,grip.id,goal));assert.deepEqual(a,saved);
  }
});

test('ordinary positioning and explicit original CAD distance edits remain distinct from the blue scale grip',()=>{
  const a=marker(),root=anchor(a),moved=moveSymbolNativeGrip(a,'center',[root[0]+10,root[1]-5]);
  pointClose(anchor(moved),[root[0]+10,root[1]-5]);assert.equal(moved.size,a.size);
  const propertyTarget=buildCadSymbolGeometry(marker({cadProperties:{'距离1':7}})).controls.find(c=>c.key==='距离1')!;
  const native=moveSymbolNativeGrip(a,'cad:距离1',world(a,propertyTarget.point));
  close(native.cadProperties!['距离1'],7);assert.equal(native.size,a.size);pointClose(anchor(native),root);
  const fold=marker({symbol:'fold',size:40}),foldGrip=scaleGrip(fold),changed=moveSymbolNativeGrip(fold,foldGrip.id,[foldGrip.point[0]+1,foldGrip.point[1]]);
  assert.equal(changed.size,fold.size);assert.notDeepEqual(changed.cadProperties,fold.cadProperties,'other symbols keep their native component behavior');
});

test('saved blue-grip sizes, anchor, rotation, mirrored artwork and CAD properties round-trip unchanged',()=>{
  const a=marker({rotation:129,mirrored:true,cadProperties:{'距离1':8,'角度2':17}}),changed=moveSymbolNativeGrip(a,scaleGrip(a).id,target(a,1.65));
  let project=createDiagramProject(blankDoc('垂直标记缩放保存',200,200));project=updateDiagramAnnotations(project,project.activeStepId,[changed]);
  const loaded=importDiagramProject(exportDiagramProject(project)).steps[0].annotations![0] as DiagramSymbolAnnotation;
  assert.deepEqual(loaded,changed);pointClose(anchor(loaded),anchor(a));assert.equal(diagramAnnotationMarkup(loaded),diagramAnnotationMarkup(changed));
  assert.deepEqual(symbolNativeBaseline(loaded),symbolNativeBaseline(changed));
});
