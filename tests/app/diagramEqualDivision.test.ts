import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editDiagramEqualDivisionRatio,diagramEqualDivisionLabels} from '../../src/app/diagramEqualDivision';
import {buildCadSymbolGeometry} from '../../src/app/diagramCadSymbolGeometry';
import {getCadSymbolBlock} from '../../src/app/diagramCadSymbols';
import {diagramAnnotationMarkup} from '../../src/app/diagramAnnotationSVG';
import {drawingSVG} from '../../src/app/diagramDrawing';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,appendDiagramStep,updateDiagramAnnotations,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import type {DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import type {Point} from '../../src/core/types';

const symbol=():DiagramSymbolAnnotation=>({id:'ratio',kind:'symbol',symbol:'equalDivision',position:[100,80],size:24,rotation:0,color:'#293d35',width:.7,cadProperties:{}});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const near=(a:Point,b:Point)=>{close(a[0],b[0]);close(a[1],b[1]);};
function segments(annotation:DiagramSymbolAnnotation){
  const geometry=buildCadSymbolGeometry(annotation),left=geometry.primitives.find(primitive=>primitive.kind==='path'&&primitive.sourceHandle===13646),right=geometry.primitives.find(primitive=>primitive.kind==='path'&&primitive.sourceHandle===13647);
  assert.ok(left?.kind==='path'&&left.start&&left.end&&right?.kind==='path'&&right.start&&right.end);
  const world=(point:Point):Point=>{const theta=annotation.rotation*Math.PI/180,x=point[0]*annotation.size/100*(annotation.mirrored?-1:1),y=point[1]*annotation.size/100;return [annotation.position[0]+Math.cos(theta)*x-Math.sin(theta)*y,annotation.position[1]+Math.sin(theta)*x+Math.cos(theta)*y];};
  return {left:[world(left.start),world(left.end)] as [Point,Point],right:[world(right.start),world(right.end)] as [Point,Point]};
}
const length=([a,b]:[Point,Point])=>Math.hypot(a[0]-b[0],a[1]-b[1]);

test('editing a real DivLen attribute updates both the text and native source stretch geometry to the requested ratio',()=>{
  const original=symbol(),before=structuredClone(original),native=JSON.stringify(getCadSymbolBlock('equalDivision')),old=segments(original),next=editDiagramEqualDivisionRatio(original,'13648','3'),changed=segments(next);
  assert.deepEqual(diagramEqualDivisionLabels(next).map(label=>label.text),['3','1']);
  close(next.cadProperties!['距离2'],15);close(next.cadProperties!['距离1'],5);close(length(changed.left)/length(changed.right),3);
  close(length(changed.left)+length(changed.right),length(old.left)+length(old.right));near(changed.left[0],old.left[0]);near(changed.right[1],old.right[1]);near(changed.left[1],changed.right[0]);
  const labels=diagramEqualDivisionLabels(next);near(labels[0].point,[(changed.left[0][0]+changed.left[1][0])/2,(changed.left[0][1]+changed.left[1][1])/2]);near(labels[1].point,[(changed.right[0][0]+changed.right[1][0])/2,(changed.right[0][1]+changed.right[1][1])/2]);
  assert.notEqual(diagramAnnotationMarkup(next),diagramAnnotationMarkup(original));assert.deepEqual(original,before);assert.equal(JSON.stringify(getCadSymbolBlock('equalDivision')),native);
});

test('the second ratio input changes its physical half and a later edit uses the previously saved other number',()=>{
  const first=editDiagramEqualDivisionRatio(symbol(),'13648','3'),next=editDiagramEqualDivisionRatio(first,'13650','2'),changed=segments(next);
  assert.deepEqual(diagramEqualDivisionLabels(next).map(label=>label.text),['3','2']);close(length(changed.left)/length(changed.right),1.5);close(next.cadProperties!['距离2'],12);close(next.cadProperties!['距离1'],8);
  const decimal=editDiagramEqualDivisionRatio(next,'13648',' 1.25 ');assert.equal(decimal.cadAttributes!['13648'],'1.25');close(length(segments(decimal).left)/length(segments(decimal).right),1.25/2);
});

test('ratio edits preserve source rotation properties, mirrors and fixed outer endpoints without depending on drawing grips',()=>{
  for(const mirrored of [false,true])for(const rotation of [0,37,180,269]){
    const original={...symbol(),mirrored,rotation,cadProperties:{'距离1':14,'距离2':10,'角度1':15,'角度2':27}},old=segments(original),next=editDiagramEqualDivisionRatio(original,'13648','4'),changed=segments(next);
    close(length(changed.left)/length(changed.right),4);near(changed.left[0],old.left[0]);near(changed.right[1],old.right[1]);assert.equal(next.cadProperties!['角度1'],15);assert.equal(next.cadProperties!['角度2'],27);assert.equal(next.rotation,rotation);assert.equal(next.mirrored,mirrored);assert.equal(next.size,original.size);
  }
});

test('new-step editing saves the changed ratio and physical shape, restores it exactly and exports identical label and path geometry',()=>{
  const initial=createDiagramProject(blankDoc('步骤',200,200)),project=appendDiagramStep(initial),step=project.steps.at(-1)!,original=symbol(),placed=updateDiagramAnnotations(project,step.id,[original]),changed=editDiagramEqualDivisionRatio(original,'13648','3'),edited=updateDiagramAnnotations(placed,step.id,[changed]),loaded=importDiagramProject(exportDiagramProject(edited)),restored=loaded.steps.at(-1)!.annotations![0] as DiagramSymbolAnnotation;
  assert.deepEqual(edited.states,placed.states);assert.deepEqual(restored,changed);assert.equal(diagramAnnotationMarkup(restored),diagramAnnotationMarkup(changed));
  const svg=drawingSVG(null,[restored],'比例示例','3:1');assert.ok(svg.includes(diagramAnnotationMarkup(changed)));assert.match(svg,/>3<\/text>/);assert.match(svg,/>1<\/text>/);close(length(segments(restored).left)/length(segments(restored).right),3);
});

test('opening an old ratio symbol leaves its exact geometry and original DWG label metadata untouched until an explicit edit',()=>{
  const old={...symbol(),text:'8',cadAttributes:{'13650':'1'},cadProperties:{'距离1':14,'距离2':10}},before=structuredClone(old),markup=diagramAnnotationMarkup(old),metadata=JSON.stringify(getCadSymbolBlock('equalDivision'));
  assert.deepEqual(diagramEqualDivisionLabels(old).map(label=>label.text),['8','1']);assert.deepEqual(old,before);assert.equal(diagramAnnotationMarkup(old),markup);assert.equal(JSON.stringify(getCadSymbolBlock('equalDivision')),metadata);
  close(length(segments(old).left)/length(segments(old).right),10/14);
});

test('invalid, zero, nonfinite and unrepresentable ratios reject atomically without creating tick-count parameters',()=>{
  const original=symbol(),before=structuredClone(original);
  for(const value of ['', '0','-1','word','1/3','NaN','Infinity','1e999','1e-300','0x10'])assert.throws(()=>editDiagramEqualDivisionRatio(original,'13648',value),value);
  assert.throws(()=>editDiagramEqualDivisionRatio(original,'unknown','3'));assert.throws(()=>editDiagramEqualDivisionRatio({...original,symbol:'equalAngle'},'13648','3'));assert.deepEqual(original,before);
  const next=editDiagramEqualDivisionRatio(original,'13648','3');assert.equal(next.params,undefined);assert.deepEqual(Object.keys(next.cadProperties!).sort(),['距离1','距离2']);
});
