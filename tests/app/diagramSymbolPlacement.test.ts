import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {DIAGRAM_SYMBOL_KINDS,type DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {diagramSymbolInitialSize,getSymbolParameters} from '../../src/app/diagramSymbolCatalog';
import {buildCadSymbolGeometry} from '../../src/app/diagramCadSymbolGeometry';
import {annotationBounds,diagramAnnotationMarkup,moveSymbolNativeGrip,symbolNativeBaseline,symbolNativeGrips} from '../../src/app/diagramAnnotationSVG';
import {createDiagramProject,exportDiagramProject,importDiagramProject,updateDiagramAnnotations} from '../../src/app/diagramProject';

const symbol=(size:number):DiagramSymbolAnnotation=>({id:'angle-marker',kind:'symbol',symbol:'equalAngle',position:[50,60],size,rotation:0,color:'#293d35',width:.7,cadProperties:{}});
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);

test('new angle bisector markers occupy about 16 mm on a 200 mm sheet with two small original CAD dots',()=>{
  const size=diagramSymbolInitialSize('equalAngle',{width:200,height:200},{width:200,height:200}),annotation=symbol(size);
  assert.equal(size,16);
  const bounds=annotationBounds([annotation])!;assert.ok(bounds.width>=15&&bounds.width<=20);assert.ok(bounds.height>=15&&bounds.height<=20);
  const dots=buildCadSymbolGeometry(annotation).primitives.filter(primitive=>primitive.kind==='path'&&primitive.sourceType==='CIRCLE');
  assert.equal(dots.length,2);
  const measures=dots.map(dot=>{
    assert.equal(dot.kind,'path');if(dot.kind!=='path')throw Error('circle path missing');
    const xs=dot.points.map(point=>point[0]*size/100),ys=dot.points.map(point=>point[1]*size/100);
    return {center:[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2],radius:(Math.max(...xs)-Math.min(...xs))/2};
  });
  assert.ok(measures.every(dot=>dot.radius>2&&dot.radius<2.3));
  const separation=Math.hypot(measures[0].center[0]-measures[1].center[0],measures[0].center[1]-measures[1].center[1]);
  assert.ok(separation>16&&separation<17);
});

test('new marker size follows the paper rather than zoom, paper-exterior artwork or accumulated drawing bounds',()=>{
  for(const drawing of [{width:200,height:200},{width:2000,height:1500},{width:40,height:60}]){
    assert.equal(diagramSymbolInitialSize('equalAngle',drawing,{width:200,height:200}),16);
  }
  assert.equal(diagramSymbolInitialSize('equalAngle',{width:400,height:400},{width:100,height:300}),8);
  assert.equal(diagramSymbolInitialSize('equalAngle',{width:200,height:200}),16,'a drawing without paper still has the compact initial size');
});

test('new reference points match the actual small circles of the angle bisector marker',()=>{
  for(const paper of [{width:100,height:300},{width:200,height:200},{width:420,height:297}])for(const drawing of [{width:200,height:200},{width:2000,height:1500}]){
    const angle=symbol(diagramSymbolInitialSize('equalAngle',drawing,paper));
    const reference={...symbol(diagramSymbolInitialSize('referencePoint',drawing,paper)),symbol:'referencePoint' as const};
    const diameter=(annotation:DiagramSymbolAnnotation)=>buildCadSymbolGeometry(annotation).primitives.filter(primitive=>primitive.kind==='path'&&primitive.sourceType==='CIRCLE').map(circle=>{
      if(circle.kind!=='path')throw Error('circle path missing');
      return (Math.max(...circle.points.map(point=>point[0]))-Math.min(...circle.points.map(point=>point[0])))*annotation.size/100;
    });
    const referenceDiameter=diameter(reference)[0];
    for(const angleDiameter of diameter(angle))close(referenceDiameter,angleDiameter);
    assert.ok(referenceDiameter<6.5,'the reference is a small point rather than the full marker envelope');
  }
});

test('other symbols keep exactly their previous new-placement formula and size limits',()=>{
  for(const kind of DIAGRAM_SYMBOL_KINDS.filter(kind=>kind!=='equalAngle'&&kind!=='rightAngle'&&kind!=='referencePoint')){
    assert.equal(diagramSymbolInitialSize(kind,{width:280,height:100},{width:200,height:200}),20,kind);
    assert.equal(diagramSymbolInitialSize(kind,{width:1,height:1}),1,kind);
    assert.equal(diagramSymbolInitialSize(kind,{width:1e8,height:1e8}),1_000_000,kind);
  }
});

test('saved legacy and CAD marker dimensions and component defaults survive roundtrip unchanged',()=>{
  const legacy=symbol(95);delete legacy.cadProperties;
  const cad={...symbol(123),id:'saved-CAD',cadProperties:{'距离6':5}};
  const referenceLegacy={...legacy,id:'saved-reference-legacy',symbol:'referencePoint' as const,size:40,params:{radius:32}};
  const referenceCad={...cad,id:'saved-reference-CAD',symbol:'referencePoint' as const,size:120,cadProperties:{}};
  const annotations=[legacy,cad,referenceLegacy,referenceCad];
  const before=annotations.map(annotation=>({annotation:structuredClone(annotation),markup:diagramAnnotationMarkup(annotation),params:getSymbolParameters(annotation)}));
  let project=createDiagramProject(blankDoc('旧符号尺寸',200,200));
  project=updateDiagramAnnotations(project,project.activeStepId,annotations);
  diagramSymbolInitialSize('equalAngle',{width:600,height:600},{width:200,height:200});
  diagramSymbolInitialSize('referencePoint',{width:600,height:600},{width:200,height:200});
  const restored=importDiagramProject(exportDiagramProject(project));
  assert.deepEqual(restored.steps[0].annotations,annotations);
  for(const item of before){
    const saved=restored.steps[0].annotations!.find(annotation=>annotation.id===item.annotation.id) as DiagramSymbolAnnotation;
    assert.equal(diagramAnnotationMarkup(saved),item.markup);assert.deepEqual(getSymbolParameters(saved),item.params);
  }
});

test('compact markers can be enlarged through size properties without exposing extra scale handles',()=>{
  const annotation=symbol(diagramSymbolInitialSize('equalAngle',{width:200,height:200},{width:200,height:200}));
  const center=symbolNativeGrips(annotation).find(grip=>grip.id==='center')!.point;
  const enlarged={...structuredClone(annotation),size:32},changedCenter=symbolNativeGrips(enlarged).find(grip=>grip.id==='center')!.point;
  enlarged.position=[enlarged.position[0]+center[0]-changedCenter[0],enlarged.position[1]+center[1]-changedCenter[1]];
  close(enlarged.size,32);assert.deepEqual(enlarged.cadProperties,annotation.cadProperties);
  symbolNativeGrips(enlarged).find(grip=>grip.id==='center')!.point.forEach((value,index)=>close(value,center[index]));
  assert.ok(!symbolNativeGrips(enlarged).some(grip=>['start','end','rotate'].includes(grip.id)));
  const bounds=annotationBounds([annotation])!,enlargedBounds=annotationBounds([enlarged])!;
  assert.ok(enlargedBounds.width>bounds.width*1.9&&enlargedBounds.height>bounds.height*1.9);
});
