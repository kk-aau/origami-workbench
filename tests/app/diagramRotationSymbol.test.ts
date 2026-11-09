import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDiagramAnnotations,type DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {buildCadSymbolGeometry} from '../../src/app/diagramCadSymbolGeometry';
import {getCadSymbolBlock} from '../../src/app/diagramCadSymbols';
import {diagramAnnotationMarkup,diagramSymbolPreview,pointHitsDiagramSymbol,annotationBounds} from '../../src/app/diagramAnnotationSVG';
import {diagramSymbolTurnAngle,diagramSymbolTurnDegrees} from '../../src/app/diagramSymbolRotation';
import {drawingSVG} from '../../src/app/diagramDrawing';

const symbol=(kind:'rotate'|'rotateCCW'='rotate'):DiagramSymbolAnnotation=>({id:'turn',kind:'symbol',symbol:kind,position:[23,-17],size:100,rotation:0,color:'#293d35',width:.7,cadProperties:{}});

test('counterclockwise rotation reuses immutable CAD entities with the actual opposite arrow geometry',()=>{
  const source=getCadSymbolBlock('rotate')!,before=JSON.stringify(source),clockwise=buildCadSymbolGeometry(symbol()),counter=buildCadSymbolGeometry(symbol('rotateCCW'));
  assert.equal(getCadSymbolBlock('rotateCCW'),source);assert.equal(counter.primitives.length,clockwise.primitives.length);
  clockwise.primitives.forEach((a,i)=>{
    const b=counter.primitives[i];assert.equal(a.kind,b.kind);assert.equal(a.sourceHandle,b.sourceHandle);assert.equal(a.blockHandle,b.blockHandle);
    if(a.kind==='path'&&b.kind==='path')a.points.forEach((p,k)=>{assert.ok(Math.abs(p[0]+b.points[k][0])<1e-10);assert.ok(Math.abs(p[1]-b.points[k][1])<1e-10);});
  });
  assert.notEqual(diagramSymbolPreview('rotate'),diagramSymbolPreview('rotateCCW'));assert.equal(JSON.stringify(source),before);
});

test('view action angles have a real independent value and follow the displayed direction through reflections',()=>{
  assert.equal(diagramSymbolTurnAngle(symbol()),45);assert.equal(diagramSymbolTurnDegrees({...symbol(),rotation:137,turnAngle:22.5}),22.5);
  assert.equal(diagramSymbolTurnDegrees({...symbol('rotateCCW'),rotation:-89,turnAngle:22.5}),-22.5);
  for(const kind of ['rotate','rotateCCW'] as const)for(const mirrored of [false,true])for(const flip of [0,1]){
    const a={...symbol(kind),mirrored,cadProperties:{'翻转状态1':flip},turnAngle:90},reverse=Number(kind==='rotateCCW')+Number(mirrored)+flip;
    assert.equal(diagramSymbolTurnDegrees(a),reverse%2?-90:90);
  }
});

test('central numeric labels stay upright and centred at arbitrary placements, reflections and sizes',()=>{
  for(const kind of ['rotate','rotateCCW'] as const)for(const mirrored of [false,true])for(const size of [25,100,250]){
    const a={...symbol(kind),rotation:137,mirrored,size,turnAngle:120},markup=diagramAnnotationMarkup(a),scale=size/100;
    assert.match(markup,/>120°<\/text>/);assert.ok(markup.includes(`scale(${mirrored?-1:1} 1) rotate(-137)`));
    // R(137) M · M R(-137) is identity: the label frame cancels arrow
    // placement and reflection, while the outer size scale is preserved.
    assert.ok(markup.includes(`scale(${mirrored?-scale:scale} ${scale})`));
    const b=annotationBounds([a])!;assert.ok(a.position[0]>=b.x&&a.position[0]<=b.x+b.width&&a.position[1]>=b.y&&a.position[1]<=b.y+b.height);
    assert.ok(pointHitsDiagramSymbol(a,a.position,.001),'the central text can be selected and double-clicked');
  }
});

test('changing the numeric action changes both drawing and export labels without rotating or replacing arrow paths',()=>{
  for(const kind of ['rotate','rotateCCW'] as const){
    const a=symbol(kind),original=diagramAnnotationMarkup(a),edited=diagramAnnotationMarkup({...a,turnAngle:67.5});
    assert.deepEqual(edited.match(/<path\b[^>]*\/>/g),original.match(/<path\b[^>]*\/>/g));assert.match(edited,/>67\.5°<\/text>/);
    assert.match(drawingSVG(null,[{...a,turnAngle:67.5}],'',''),/>67\.5°<\/text>/);
    assert.match(diagramAnnotationMarkup({...a,turnAngle:22.12345}),/>22\.12345°<\/text>/,'the visible instruction does not silently round away an edited angle');
  }
});

test('rotation angle validation rejects unknown symbol usage and invalid imported numbers while preserving supported fractional values',()=>{
  for(const kind of ['rotate','rotateCCW'] as const)for(const turnAngle of [0,22.5,45,360])assert.doesNotThrow(()=>validateDiagramAnnotations([{...symbol(kind),turnAngle}]));
  for(const turnAngle of [-1,361,NaN,Infinity,'45',null])assert.throws(()=>validateDiagramAnnotations([{...symbol(),turnAngle}]));
  assert.throws(()=>validateDiagramAnnotations([{...symbol(),symbol:'fold',turnAngle:45}]));
});
