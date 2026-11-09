import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import type {DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {SYMBOL_CATALOG} from '../../src/app/diagramSymbolCatalog';
import {getCadSymbolBlock,cadPropertyDefinitions,CAD_SYMBOL_BLOCKS} from '../../src/app/diagramCadSymbols';
import {diagramCadGripSources,diagramCadInsertBasePoint} from '../../src/app/diagramCadGripSource';
import {buildCadSymbolGeometry} from '../../src/app/diagramCadSymbolGeometry';
import {symbolNativeGrips,moveSymbolNativeGrip,diagramAnnotationMarkup} from '../../src/app/diagramAnnotationSVG';
import {layoutDiagramSymbolGrips} from '../../src/app/diagramSymbolGrips';

const cadKinds=SYMBOL_CATALOG.filter(item=>getCadSymbolBlock(item.kind)).map(item=>item.kind);
const annotation=(symbol:DiagramSymbolAnnotation['symbol'],patch:Partial<DiagramSymbolAnnotation>={}):DiagramSymbolAnnotation=>({id:symbol,kind:'symbol',symbol,position:[83,-23],size:17,rotation:127,mirrored:true,color:'#293d35',width:.7,cadProperties:{},...patch});
function world(a:DiagramSymbolAnnotation,p:Point):Point{const theta=a.rotation*Math.PI/180,x=p[0]*a.size/100*(a.mirrored?-1:1),y=p[1]*a.size/100;return [a.position[0]+x*Math.cos(theta)-y*Math.sin(theta),a.position[1]+x*Math.sin(theta)+y*Math.cos(theta)];}
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const pointClose=(a:Point,b:Point)=>{close(a[0],b[0]);close(a[1],b[1]);};

test('CAD controls retain verified source grips and repeat marks add only an overall rotation handle',()=>{
  assert.equal(SYMBOL_CATALOG.length,36);assert.equal(cadKinds.length,35);
  for(const kind of cadKinds){
    const block=getCadSymbolBlock(kind)!,a=annotation(kind),geometry=buildCadSymbolGeometry(a),grips=symbolNativeGrips(a),source=diagramCadGripSources(kind),snapshot=JSON.stringify(block);
    assert.deepEqual(diagramCadInsertBasePoint(kind),block.basePoint.slice(0,2));
    const repeat=['repeat','repeatSmall','repeatMark'].includes(kind);
    assert.equal(grips.length,geometry.basePoints.length+geometry.controls.length+(repeat?1:0),kind);
    for(const base of geometry.basePoints){const grip=grips.find(grip=>grip.id===base.id)!;assert.equal(grip.kind,'anchor');assert.equal(grip.semantic,'move');assert.equal(grip.sourceBlockHandle,block.handle);pointClose(grip.point,world(a,base.point));}
    for(const control of geometry.controls){
      const original=source.find(grip=>grip.handle===control.sourceGripHandle)!;assert.ok(original?.supported,`${kind}/${control.id}`);
      assert.ok(block.grips.some(grip=>grip.handle===original.handle),'the handle exists in immutable source metadata');
      assert.equal(control.parameterHandle,original.parameterHandle);assert.ok(original.propertyKeys.includes(control.key));
      const grip=grips.find(grip=>grip.id===`cad:${control.id}`)!;assert.ok(grip);assert.equal(grip.sourceGripHandle,original.handle);assert.equal(grip.parameterHandle,original.parameterHandle);pointClose(grip.point,world(a,control.point));
    }
    assert.ok(!grips.some(grip=>['start','end'].includes(grip.id)||grip.id.startsWith('component:')),kind);
    assert.equal(grips.some(grip=>grip.id==='rotate'&&grip.kind==='rotation'&&grip.semantic==='rotate'),repeat,kind);
    for(const units of [.05,1,5])assert.deepEqual(layoutDiagramSymbolGrips(grips,units).map(grip=>grip.point),grips.map(grip=>grip.point));
    assert.equal(JSON.stringify(block),snapshot);
  }
  const local=annotation('tearWindow');delete local.cadProperties;assert.deepEqual(symbolNativeGrips(local).map(grip=>grip.id),['center','component:radius']);
  assert.ok(Object.values(CAD_SYMBOL_BLOCKS).every(block=>JSON.stringify(block.basePoint)==='[0,0,0]'));
});

test('default source points preserve their true CAD offsets under the same uniform artwork normalization',()=>{
  for(const kind of cadKinds.filter(kind=>!['swivelDouble','rotateCCW'].includes(kind))){
    const a=annotation(kind),geometry=buildCadSymbolGeometry(a),base=geometry.basePoints[0].point,sources=diagramCadGripSources(kind).filter(grip=>grip.supported);
    if(!sources.length)continue;
    const first=sources.find(source=>Math.hypot(...source.point)>1e-6)!,control=geometry.controls.find(control=>control.sourceGripHandle===first.handle)!;
    const scale=Math.hypot(control.point[0]-base[0],control.point[1]-base[1])/Math.hypot(...first.point);assert.ok(scale>0&&Number.isFinite(scale));
    for(const source of sources){const control=geometry.controls.find(control=>control.sourceGripHandle===source.handle)!;pointClose(control.point,[base[0]+source.point[0]*scale,base[1]-source.point[1]*scale]);}
  }
});

test('every supported source control roundtrips its evaluated dynamic point and exact first-drag no-op',()=>{
  for(const kind of cadKinds){
    const sources=diagramCadGripSources(kind).filter(grip=>grip.supported),keys=new Set(sources.flatMap(source=>source.propertyKeys)),definitions=cadPropertyDefinitions(kind).filter(def=>keys.has(def.key));
    const properties=[{},...definitions.map(def=>({[def.key]:def.values?.find(value=>value!==def.defaultValue)??(def.type==='flip'?1-def.defaultValue:Math.min(def.max,def.defaultValue+(def.type==='angle'?23:Math.max(.1,Math.abs(def.defaultValue)*.2))))}))];
    for(const cadProperties of properties)for(const mirrored of [false,true]){
      const a=annotation(kind,{cadProperties,mirrored}),before=structuredClone(a),geometry=buildCadSymbolGeometry(a),grips=symbolNativeGrips(a);
      for(const control of geometry.controls){
        const values=control.readProperties?.(control.point)??{[control.key]:control.read(control.point)};
        for(const [key,value] of Object.entries(values)){
          const def=cadPropertyDefinitions(kind).find(def=>def.key===key)!;if(def.type==='flip')continue;
          const expected=cadProperties[key as keyof typeof cadProperties]??def.defaultValue;
          if(def.type==='angle')close(((value-expected)%360+540)%360-180,0);else close(value,expected);
        }
      }
      for(const grip of grips)assert.deepEqual(moveSymbolNativeGrip(a,grip.id,grip.point),a,`${kind}/${grip.id}/${JSON.stringify(cadProperties)}`);
      assert.deepEqual(a,before);
    }
  }
});

test('paired variants transform and deduplicate original controls without adding gap or stagger handles',()=>{
  const a=annotation('swivelDouble',{cadProperties:{'箭头间距':0,'上下错位':0,'角度1':31}}),geometry=buildCadSymbolGeometry(a),grips=symbolNativeGrips(a);
  assert.ok(geometry.controls.every(control=>/^source-grip:\d+:(left|right)$/.test(control.id!)));
  assert.ok(!geometry.controls.some(control=>['箭头间距','上下错位'].includes(control.key)));
  assert.equal(new Set(grips.map(grip=>grip.id)).size,grips.length);
  for(let i=0;i<geometry.controls.length;i++)for(let j=0;j<i;j++){
    const x=geometry.controls[i],y=geometry.controls[j];assert.ok(x.sourceGripHandle!==y.sourceGripHandle||Math.hypot(x.point[0]-y.point[0],x.point[1]-y.point[1])>=1e-6);
  }
});

test('original CAD parameter edits keep the real INSERT fixed, independently of the perpendicular blue-grip whole-symbol scale',()=>{
  for(const kind of ['fold','open','pull','hold','rightAngle'] as const)for(const mirrored of [false,true]){
    const a=annotation(kind,{mirrored}),before=buildCadSymbolGeometry(a),origin=world(a,before.basePoints[0].point),sources=diagramCadGripSources(kind).filter(source=>source.supported);
    for(const def of cadPropertyDefinitions(kind).filter(def=>def.type!=='flip'&&sources.some(source=>source.propertyKeys.includes(def.key)))){
      const value=def.values?.find(value=>value!==def.defaultValue)??Math.min(def.max,def.defaultValue+(def.type==='angle'?19:Math.max(.1,Math.abs(def.defaultValue)*.2)));
      const target=buildCadSymbolGeometry({...a,cadProperties:{[def.key]:value}}),control=target.controls.find(control=>sources.find(source=>source.handle===control.sourceGripHandle)?.propertyKeys.includes(def.key))!;
      // The perpendicular marker's blue drawing grip now scales the complete
      // symbol. Its original CAD distance action remains an explicit property
      // edit; all other source grips retain their native parameter behavior.
      const editId=kind==='rightAngle'&&def.key==='距离1'?`cad:${def.key}`:`cad:${control.id}`;
      const changed=moveSymbolNativeGrip(a,editId,world(a,control.point));
      assert.deepEqual(changed.position,a.position,`${kind}/${def.key} preserves original insertion data`);
      pointClose(world(changed,buildCadSymbolGeometry(changed).basePoints[0].point),origin);close(changed.cadProperties![def.key],value);
      assert.notEqual(diagramAnnotationMarkup(changed),diagramAnnotationMarkup(a));
    }
  }
});

test('three unresolved source controls are documented and never exposed as misleading draggable points',()=>{
  const unsupported=cadKinds.flatMap(kind=>diagramCadGripSources(kind).filter(source=>!source.supported).map(source=>({kind,source})));
  assert.deepEqual(unsupported.map(({kind,source})=>[kind,source.handle]).sort(),[['fold',1637],['mountainFold',11956],['repeat',3095]].sort());
  for(const {kind,source} of unsupported){assert.ok(source.reason);assert.ok(!symbolNativeGrips(annotation(kind)).some(grip=>grip.sourceGripHandle===source.handle));}
});

test('original ATTDEF text exposes its actual source handle for direct attribute editing only',()=>{
  for(const kind of cadKinds){
    const a=annotation(kind),geometry=buildCadSymbolGeometry(a),markup=diagramAnnotationMarkup(a),editable=geometry.primitives.filter(primitive=>primitive.kind==='text'&&primitive.sourceType==='ATTDEF');
    const handles=[...markup.matchAll(/data-cad-attribute="(\d+)"/g)].map(match=>Number(match[1]));
    assert.deepEqual(handles,editable.map(primitive=>primitive.sourceHandle),kind);
  }
});
