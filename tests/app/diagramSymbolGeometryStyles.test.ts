import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {DiagramSymbolAnnotation,DiagramSymbolKind} from '../../src/app/diagramAnnotations';
import {annotationBounds,diagramAnnotationMarkup,diagramSymbolPreview,pointHitsDiagramSymbol,symbolIntersectsBox} from '../../src/app/diagramAnnotationSVG';
import {CAD_POINT_RADIUS,CAD_REPEAT_GAP,CAD_STAR_POINTS,CAD_TURN_LABEL_SIZE} from '../../src/app/diagramCadSymbols';
import {diagramSymbolGeometryFields,resolveDiagramSymbolGeometry,validateDiagramSymbolStyles} from '../../src/app/diagramSymbolStyles';
import {buildCadSymbolGeometry} from '../../src/app/diagramCadSymbolGeometry';
import {diagramSymbolTurnDegrees} from '../../src/app/diagramSymbolRotation';
import {SYMBOL_CATALOG} from '../../src/app/diagramSymbolCatalog';

function symbol(kind:DiagramSymbolKind):DiagramSymbolAnnotation{
  return {kind:'symbol',symbol:kind,id:'demo',position:[0,0],size:100,rotation:0,color:'#293d35',width:.7,...(kind==='tearWindow'?{}:{cadProperties:{}})};
}

test('each offered project geometry parameter controls visible ink in its own symbol',()=>{
  for(const {kind,sourceOnly} of SYMBOL_CATALOG){
    for(const mode of ['cad','legacy'] as const){
      if(mode==='legacy'&&sourceOnly||mode==='cad'&&kind==='tearWindow')continue;
      const annotation=symbol(kind);
      if(mode==='legacy')delete annotation.cadProperties;
      const base=diagramAnnotationMarkup(annotation),fields=diagramSymbolGeometryFields(kind,mode);
      assert.ok(fields.length,kind);
      for(const field of fields){
        const value=field.values?.find(n=>n!==field.defaultValue)??(field.defaultValue+field.step<=field.max?field.defaultValue+field.step:field.defaultValue-field.step);
        const styles={[kind]:{[field.group]:{[field.key]:value}}};
        validateDiagramSymbolStyles(styles);
        assert.notEqual(diagramAnnotationMarkup(annotation,{symbolStyles:styles}),base,`${mode} / ${kind} / ${field.key}`);
      }
    }
  }
});

test('saved per-instance geometry overrides category settings field by field without changing its renderer',()=>{
  const styles={fold:{cadProperties:{距离1:15,距离2:12},params:{length:40,headWidth:25}}};
  const a={...symbol('fold'),cadProperties:{距离1:37}};
  assert.deepEqual(resolveDiagramSymbolGeometry(a,styles).cadProperties,{距离1:37,距离2:12});
  assert.deepEqual(a.cadProperties,{距离1:37});
  const legacy={...a,cadProperties:undefined,params:{length:60}};
  const effective=resolveDiagramSymbolGeometry(legacy,styles);
  assert.deepEqual(effective.params,{length:60,headWidth:25});assert.equal(effective.cadProperties,undefined);
  assert.equal(diagramAnnotationMarkup(legacy,{symbolStyles:styles}),diagramAnnotationMarkup(effective));
});

test('point radius is shared by SVG, fixed-scale preview, ink bounds and picking',()=>{
  for(const kind of ['referencePoint','filledReferencePoint'] as const){
    const a=symbol(kind),styles={[kind]:{cadProperties:{[CAD_POINT_RADIUS]:15},fill:'solid' as const}};
    const b=annotationBounds([a],{symbolStyles:styles})!;
    assert.ok(Math.abs(b.width-30.7)<1e-6,kind);
    assert.ok(pointHitsDiagramSymbol(a,[10,0],.001,{symbolStyles:styles}));
    assert.ok(!pointHitsDiagramSymbol(a,[20,0],.001,{symbolStyles:styles}));
    assert.ok(!symbolIntersectsBox(a,[19,0],[23,3],0,{symbolStyles:styles}));
    const frame=(svg:string)=>svg.match(/scale\(([-+e.\d]+)\)/)?.[1];
    assert.equal(frame(diagramSymbolPreview(kind,styles,true)),frame(diagramSymbolPreview(kind,undefined,true)));
    assert.notEqual(diagramSymbolPreview(kind,styles,true),diagramSymbolPreview(kind,undefined,true));
  }
});

test('rotation label, star point count and repeated mark separation retain native geometry defaults',()=>{
  const a=symbol('rotateCCW'),modified=resolveDiagramSymbolGeometry(a,{rotateCCW:{cadProperties:{[CAD_TURN_LABEL_SIZE]:24}}});
  assert.equal(diagramSymbolTurnDegrees(a),diagramSymbolTurnDegrees(modified));
  assert.match(diagramAnnotationMarkup(modified),/font-size="24"/);
  assert.throws(()=>validateDiagramSymbolStyles({rotateCCW:{cadProperties:{翻转状态1:1}}}));
  const star=symbol('star'),original=buildCadSymbolGeometry(star);
  assert.deepEqual(buildCadSymbolGeometry({...star,cadProperties:{[CAD_STAR_POINTS]:5}}),original);
  const changed=buildCadSymbolGeometry({...star,cadProperties:{[CAD_STAR_POINTS]:7}}).primitives;
  const ink=changed.filter(x=>x.kind==='path');
  assert.equal(ink.length,2);assert.equal(ink[0].d,ink[1].d);assert.equal(ink[0].d.match(/L /g)?.length,14);
  const mark=symbol('repeatMark'),w=(gap:number)=>annotationBounds([{...mark,cadProperties:{[CAD_REPEAT_GAP]:gap}}])!.width;
  assert.ok(Math.abs(w(35)-w(20)-15)<1e-7);
});

test('validation rejects ineffective cross-category and invalid body properties',()=>{
  assert.throws(()=>validateDiagramSymbolStyles({star:{cadProperties:{[CAD_POINT_RADIUS]:20}}}));
  assert.throws(()=>validateDiagramSymbolStyles({star:{cadProperties:{[CAD_STAR_POINTS]:4.5}}}));
  assert.throws(()=>validateDiagramSymbolStyles({tearWindow:{params:{headWidth:7}}}));
  assert.throws(()=>validateDiagramSymbolStyles({star:{calloutConnectors:true}}));
  assert.throws(()=>validateDiagramSymbolStyles({cpCallout:{calloutConnectors:'off'}}));
  validateDiagramSymbolStyles({paperCallout:{calloutConnectors:false},tearWindow:{params:{radius:15}}});
});
