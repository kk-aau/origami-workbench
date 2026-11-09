import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SYMBOL_CATALOG} from '../../src/app/diagramSymbolCatalog';
import {symbolNativeGrips,moveSymbolNativeGrip} from '../../src/app/diagramAnnotationSVG';
import {DIAGRAM_GRIP_STYLES,layoutDiagramSymbolGrips,diagramGripDragPoint,diagramGripFunction} from '../../src/app/diagramSymbolGrips';
import type {DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';

const annotation:DiagramSymbolAnnotation={id:'grips',kind:'symbol',symbol:'fold',position:[20,50],rotation:0,size:100,color:'#293d35',width:.7,cadProperties:{}};
test('verified original functions retain distinct visual semantics',()=>{
  assert.equal(DIAGRAM_GRIP_STYLES.move.shape,'circle');assert.equal(DIAGRAM_GRIP_STYLES.scale.shape,'square');assert.equal(DIAGRAM_GRIP_STYLES.mirror.shape,'diamond');
  assert.equal(new Set(Object.values(DIAGRAM_GRIP_STYLES).map(style=>style.color)).size,5);
  for(const item of SYMBOL_CATALOG)for(const grip of symbolNativeGrips({...annotation,symbol:item.kind}))assert.ok(DIAGRAM_GRIP_STYLES[diagramGripFunction(grip)],item.kind+'/'+grip.id);
});
test('all 36 symbols keep every source point at its exact model coordinate at every zoom',()=>{
  for(const item of SYMBOL_CATALOG)for(const units of [.05,.7,5]){
    const symbol={...annotation,symbol:item.kind,size:20,rotation:73,mirrored:true},native=symbolNativeGrips(symbol),before=structuredClone(native),displayed=layoutDiagramSymbolGrips(native,units);
    assert.deepEqual(native,before);assert.equal(displayed.length,native.length);
    for(let i=0;i<displayed.length;i++){
      assert.equal(displayed[i].id,native[i].id);assert.deepEqual(displayed[i].point,native[i].point);assert.deepEqual(displayed[i].anchorPoint,native[i].point);assert.equal(displayed[i].displaced,false);
      assert.deepEqual(moveSymbolNativeGrip(symbol,displayed[i].id,displayed[i].point),symbol);
    }
  }
});
test('coincident source controls remain coincident and are never replaced by artificial spacing',()=>{
  const point:[number,number]=[7,9],native=symbolNativeGrips(annotation).slice(0,2).map(grip=>({...grip,point}));
  assert.equal(native.length,2);
  const displayed=layoutDiagramSymbolGrips(native,1);assert.deepEqual(displayed.map(grip=>grip.point),[point,point]);assert.ok(displayed.every(grip=>!grip.displaced));
});
test('numeric label reservations never move the original INSERT or original dynamic grips',()=>{
  for(const symbol of ['rotate','rotateCCW'] as const)for(const units of [.05,.7,5])for(const size of [20,100,250]){
    const a={...annotation,symbol,size,rotation:137,mirrored:true,turnAngle:120},native=symbolNativeGrips(a),before=structuredClone(native),displayed=layoutDiagramSymbolGrips(native,units,24,[{point:a.position,radius:Math.max(units*24,size*.34+units*8)}]);
    assert.deepEqual(native,before);assert.deepEqual(displayed.map(grip=>grip.point),native.map(grip=>grip.point));assert.ok(displayed.every(grip=>!grip.displaced));
  }
});
test('pressing within a grip applies pointer delta without first-drag jumps',()=>{
  const grip=symbolNativeGrips(annotation).find(grip=>grip.semantic==='scale')!,press:[number,number]=[grip.point[0]+.8,grip.point[1]-.6];
  assert.deepEqual(diagramGripDragPoint(grip.point,press,press),grip.point);
  assert.deepEqual(moveSymbolNativeGrip(annotation,grip.id,diagramGripDragPoint(grip.point,press,press)),annotation);
  const moved=diagramGripDragPoint(grip.point,press,[press[0]+2,press[1]-3]);assert.deepEqual(moved,[grip.point[0]+2,grip.point[1]-3]);
});
test('invalid zoom and reserved metadata are rejected without modifying source points',()=>{
  const native=symbolNativeGrips(annotation),before=structuredClone(native);
  for(const zoom of [NaN,0,-1])assert.throws(()=>layoutDiagramSymbolGrips(native,zoom));
  assert.throws(()=>layoutDiagramSymbolGrips(native,1,24,[{point:annotation.position,radius:NaN}]));
  assert.throws(()=>layoutDiagramSymbolGrips(native,1,24,[[Infinity,0]]));assert.deepEqual(native,before);
});
