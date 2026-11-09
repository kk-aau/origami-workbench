import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import {DIAGRAM_ANNOTATION_LIMITS,DIAGRAM_SYMBOL_KINDS,isDiagramCPLine,type DiagramAnnotation,type DiagramLineAnnotation,type DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {diagramAnnotationMarkup,symbolNativeBaseline,symbolNativeGrips} from '../../src/app/diagramAnnotationSVG';
import {buildCadSymbolGeometry} from '../../src/app/diagramCadSymbolGeometry';
import {cadAttributeDefinitions,cadPropertyDefinitions} from '../../src/app/diagramCadSymbols';
import {mirrorCopyDiagramAnnotations,transformDiagramAnnotations} from '../../src/app/diagramDrawingTools';

const axes:readonly (readonly [Point,Point])[]=[[[2,3],[12,3]],[[4,-5],[4,9]],[[2,-3],[11,9]]];
const line=(id:string,a:Point=[1,2],b:Point=[7,9]):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'valley',color:'#293d35',width:.7});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
const closePoint=(a:Point,b:Point)=>{close(a[0],b[0]);close(a[1],b[1]);};
function reflect(point:Point,a:Point,b:Point):Point {
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
  const distance=(point[0]-a[0])*nx+(point[1]-a[1])*ny;
  return [point[0]-2*nx*distance,point[1]-2*ny*distance];
}
function world(annotation:DiagramSymbolAnnotation,local:Point):Point {
  const angle=annotation.rotation*Math.PI/180,x=local[0]*annotation.size/100*(annotation.mirrored?-1:1),y=local[1]*annotation.size/100;
  return [annotation.position[0]+x*Math.cos(angle)-y*Math.sin(angle),annotation.position[1]+x*Math.sin(angle)+y*Math.cos(angle)];
}
function symbol(kind:DiagramSymbolAnnotation['symbol'],cad=false):DiagramSymbolAnnotation {
  const result:DiagramSymbolAnnotation={id:kind,kind:'symbol',symbol:kind,position:[28,-16],size:83,rotation:37,color:'#385647',width:.65,
    params:{length:86,height:43,curve:27,headLength:13,headWidth:17,radius:29,gap:16,count:3,markSize:11},curveControl:[13,-39],text:'A2'};
  if(cad){
    result.cadProperties=Object.fromEntries(cadPropertyDefinitions(kind).filter(definition=>definition.editable).map(definition=>[
      definition.key,definition.type==='flip'?definition.values?.find(value=>value!==definition.defaultValue)??1:
        definition.values?.find(value=>value!==definition.defaultValue)??Math.min(definition.max,definition.defaultValue+(definition.type==='angle'?23:2)),
    ]));
    result.cadAttributes=Object.fromEntries(cadAttributeDefinitions(kind).filter(definition=>definition.editable).map((definition,index)=>[definition.key,'标签 '+index]));
  }
  return result;
}

test('mirror copies preserve originals and reflect endpoints across horizontal, vertical and oblique axes',()=>{
  const source:DiagramAnnotation[]=[line('first'),line('unselected',[13,17],[19,23]),symbol('fold')],snapshot=structuredClone(source);
  for(const [a,b] of axes){
    const copied=mirrorCopyDiagramAnnotations(source,['fold','first','first','missing'],a,b);
    assert.equal(copied.annotations.length,5);assert.equal(copied.ids.length,2);
    assert.deepEqual(copied.annotations.slice(0,source.length),source);assert.deepEqual(source,snapshot);
    assert.equal(new Set(copied.annotations.map(annotation=>annotation.id)).size,5);
    assert.ok(copied.ids.every(id=>/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)));
    const reflected=copied.annotations[3] as DiagramLineAnnotation;
    closePoint(reflected.a,reflect((source[0] as DiagramLineAnnotation).a,a,b));
    closePoint(reflected.b,reflect((source[0] as DiagramLineAnnotation).b,a,b));
    assert.equal(reflected.style,'valley');assert.equal(reflected.width,.7);assert.equal(reflected.color,'#293d35');
    const arrow=copied.annotations[4] as DiagramSymbolAnnotation;assert.equal(arrow.mirrored,true);
    closePoint(arrow.position,reflect((source[2] as DiagramSymbolAnnotation).position,a,b));
    arrow.params!.length=101;arrow.curveControl![0]=35;(copied.annotations[0] as DiagramLineAnnotation).a[0]=333;
    assert.deepEqual(source,snapshot);
  }
});

test('fresh CP and background copies retain drawing properties without inheriting a generated CP identity',()=>{
  const source:DiagramAnnotation[]=[{...line('cp-link:edge'),foldAction:'precrease',foldFaces:[2,5]},
    {...line('cp-existing:edge'),style:'crease',foldFaces:[3]}, {...line('bg:edge'),foldFaces:[]}];
  const result=mirrorCopyDiagramAnnotations(source,source.map(annotation=>annotation.id),[0,0],[1,1]);
  const copies=result.annotations.slice(3) as DiagramLineAnnotation[];
  copies.forEach((copy,index)=>{
    assert.ok(!isDiagramCPLine(copy));assert.ok(!copy.id.startsWith('bg:'));
    assert.deepEqual(copy.foldFaces,(source[index] as DiagramLineAnnotation).foldFaces);
    assert.equal(copy.style,(source[index] as DiagramLineAnnotation).style);
  });
  assert.equal(copies[0].foldAction,'precrease');copies[0].foldFaces!.push(7);
  assert.deepEqual((source[0] as DiagramLineAnnotation).foldFaces,[2,5]);
});

test('all 35 legacy and CAD symbols retain their local arrow artwork while readable angle labels remain upright',()=>{
  const sourceKinds=DIAGRAM_SYMBOL_KINDS.filter(kind=>kind!=='tearWindow');
  assert.equal(sourceKinds.length,35);
  for(const kind of sourceKinds)for(const cad of [false,true])for(const mirrored of [false,true])for(const rotation of [0,37,-219]){
    const original={...symbol(kind,cad),mirrored,rotation},snapshot=structuredClone(original);
    // A view instruction's central number deliberately cancels the placement
    // frame; the native arrow geometry still reflects exactly like every other
    // symbol. Its separate numeric semantics are tested in diagramRotationSymbol.
    const arrowMarkup=(a:DiagramSymbolAnnotation)=>diagramAnnotationMarkup(a).replace(/^<g transform="[^"]*"/,'<g').replace(/<g data-role="rotation-angle"[^>]*>.*?<\/g>/g,'');
    const markup=arrowMarkup(original);
    const geometry=cad?buildCadSymbolGeometry(original):null;
    const localPoints:Point[]=[[0,0],[1,0],[0,1],[-25,31],original.curveControl!];
    if(geometry)localPoints.push(...geometry.primitives.flatMap(primitive=>primitive.kind==='path'?primitive.points:[primitive.point]));
    for(const [a,b] of axes){
      const result=mirrorCopyDiagramAnnotations([original],[original.id],a,b),copy=result.annotations[1] as DiagramSymbolAnnotation;
      assert.equal(copy.mirrored,!mirrored);assert.equal(copy.size,original.size);assert.equal(copy.width,original.width);
      assert.deepEqual(copy.params,original.params);assert.deepEqual(copy.curveControl,original.curveControl);
      assert.deepEqual(copy.cadProperties,original.cadProperties);assert.deepEqual(copy.cadAttributes,original.cadAttributes);
      assert.equal(arrowMarkup(copy),markup,`${kind}: local arrow artwork changed`);
      for(const point of localPoints)closePoint(world(copy,point),reflect(world(original,point),a,b));
      const baseline=symbolNativeBaseline(original),copiedBaseline=symbolNativeBaseline(copy);
      if(baseline){assert.ok(copiedBaseline);assert.equal(copiedBaseline.rooted,baseline.rooted);
        for(const key of ['start','end','anchor'] as const)closePoint(copiedBaseline[key],reflect(baseline[key],a,b));}
      const copiedGrips=symbolNativeGrips(copy);
      for(const grip of symbolNativeGrips(original).filter(grip=>grip.id!=='rotate')){
        const copiedGrip=copiedGrips.find(candidate=>candidate.id===grip.id);assert.ok(copiedGrip);
        closePoint(copiedGrip.point,reflect(grip.point,a,b));
      }
    }
    assert.deepEqual(original,snapshot);
  }
});

test('reversing the axis leaves the reflection unchanged and applying it twice restores complete geometry',()=>{
  const source:DiagramAnnotation[]=[line('first'),{...symbol('fold',true),rotation:239,mirrored:true}],a:Point=[-13,7],b:Point=[22,31];
  const ids=source.map(annotation=>annotation.id),once=transformDiagramAnnotations(source,ids,{kind:'mirrorLine',a,b});
  const reversed=transformDiagramAnnotations(source,ids,{kind:'mirrorLine',a:b,b:a});
  const twice=transformDiagramAnnotations(once,ids,{kind:'mirrorLine',a,b});
  for(let index=0;index<source.length;index++){
    const initial=source[index],opposite=reversed[index],restored=twice[index],reflected=once[index];
    if(initial.kind==='line'&&opposite.kind==='line'&&restored.kind==='line'&&reflected.kind==='line'){
      closePoint(opposite.a,reflected.a);closePoint(opposite.b,reflected.b);closePoint(restored.a,initial.a);closePoint(restored.b,initial.b);
    }else if(initial.kind==='symbol'&&opposite.kind==='symbol'&&restored.kind==='symbol'&&reflected.kind==='symbol'){
      closePoint(opposite.position,reflected.position);closePoint(restored.position,initial.position);assert.equal(restored.mirrored,initial.mirrored);
      for(const local of [[0,0],[1,0],[0,1]] as Point[]){closePoint(world(opposite,local),world(reflected,local));closePoint(world(restored,local),world(initial,local));}
    }else assert.fail('annotation kind changed');
    assert.equal(restored.id,initial.id);
  }
});

test('arbitrary-axis transforms agree with the existing x/y mirror actions without changing their behavior',()=>{
  const original={...symbol('fold'),rotation:117,mirrored:true},center:Point=[11,23];
  for(const axis of ['x','y'] as const){
    const existing=transformDiagramAnnotations([original],[original.id],{kind:'mirror',axis,center})[0] as DiagramSymbolAnnotation;
    const b:Point=axis==='x'?[center[0]+10,center[1]]:[center[0],center[1]+10];
    const arbitrary=transformDiagramAnnotations([original],[original.id],{kind:'mirrorLine',a:center,b})[0] as DiagramSymbolAnnotation;
    closePoint(arbitrary.position,existing.position);assert.equal(arbitrary.mirrored,existing.mirrored);
    for(const local of [[0,0],[1,0],[0,1]] as Point[])closePoint(world(arbitrary,local),world(existing,local));
  }
});

test('invalid axes and out-of-range reflection results reject; large valid copies remain supported',()=>{
  const source=[line('line')],snapshot=structuredClone(source);
  for(const [a,b] of [[[0,0],[0,0]],[[0,0],[1e-12,0]],[[NaN,0],[1,0]],[[0,0],[0,Infinity]],[[-Number.MAX_VALUE,0],[Number.MAX_VALUE,0]]] as [Point,Point][]){
    assert.throws(()=>mirrorCopyDiagramAnnotations(source,['line'],a,b),/镜像轴/);
    assert.throws(()=>transformDiagramAnnotations([] ,[],{kind:'mirrorLine',a,b}),/镜像轴/);
  }
  assert.throws(()=>mirrorCopyDiagramAnnotations(source,['line'],[DIAGRAM_ANNOTATION_LIMITS.coordinate,0],[DIAGRAM_ANNOTATION_LIMITS.coordinate,1]),/端点.*范围/);
  const full=Array.from({length:10_000},(_,index)=>line('line-'+index));
  assert.equal(mirrorCopyDiagramAnnotations(full,['line-0'],[0,0],[0,1]).annotations.length,10_001);
  assert.deepEqual(source,snapshot);
});

test('an empty or unknown selection makes no copies and returns independent original data',()=>{
  const source=[line('line')];
  for(const ids of [[],['missing']]){
    const copied=mirrorCopyDiagramAnnotations(source,ids,[0,0],[1,0]);
    assert.deepEqual(copied.ids,[]);assert.deepEqual(copied.annotations,source);
    (copied.annotations[0] as DiagramLineAnnotation).a[0]=19;assert.equal(source[0].a[0],1);
  }
});
