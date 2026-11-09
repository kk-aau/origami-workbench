import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DIAGRAM_SYMBOL_KINDS} from '../../src/app/diagramAnnotations';
import {CAD_SYMBOL_BLOCKS,CAD_SYMBOL_SOURCE,getCadSymbolBlock,getCadBlockByHandle,cadPropertyDefinitions,cadAttributeDefinitions} from '../../src/app/diagramCadSymbols';
const CAD_KINDS=DIAGRAM_SYMBOL_KINDS.filter(kind=>getCadSymbolBlock(kind));

test('all thirty-three source symbols resolve with every nested head and component dependency intact',()=>{
  assert.equal(Object.keys(CAD_SYMBOL_BLOCKS).length,45);
  assert.equal(CAD_KINDS.length,35);for(const kind of CAD_KINDS)assert.ok(getCadSymbolBlock(kind),kind);
  for(const block of Object.values(CAD_SYMBOL_BLOCKS))for(const entity of block.entities)if(entity.entity==='INSERT')assert.ok(getCadBlockByHandle(entity.block_header as number),`${block.cadName} → ${entity.block_header}`);
  assert.equal(CAD_SYMBOL_SOURCE.sha256,'899c4964559e0284cb7f30a0678453169eff9eda8643958de981159f7d4e65ce');
  assert.equal(getCadSymbolBlock('equalDivision')!.cadName,'1-NDivLen');
  assert.equal(getCadSymbolBlock('filledReferencePoint')!.cadName,'1-HMkPT');
  assert.equal(getCadSymbolBlock('repeatMark')!.cadName,'5-NMkRept');
});

test('frozen source geometry keeps original cubic splines, connected bulges, ellipse ratio and independent flip circle',()=>{
  const spline=getCadSymbolBlock('fold')!.entities.find(entity=>entity.entity==='SPLINE')!;
  assert.equal(spline.degree,3);assert.equal((spline.ctrl_pts as unknown[]).length,5);assert.equal((spline.knots as unknown[]).length,9);
  const unfolded=getCadSymbolBlock('unfoldDouble')!.entities;
  assert.equal(unfolded.filter(entity=>entity.entity==='LWPOLYLINE').length,1);assert.equal(unfolded.filter(entity=>entity.entity==='INSERT').length,1);
  assert.equal((unfolded.find(entity=>entity.entity==='LWPOLYLINE')!.points as unknown[]).length,3);
  const ellipse=getCadSymbolBlock('mountainFold')!.entities.find(entity=>entity.entity==='ELLIPSE')!;
  assert.ok(Math.abs((ellipse.axis_ratio as number)-2/3)<1e-12);
  assert.deepEqual(getCadSymbolBlock('flip')!.entities.map(entity=>entity.entity),['CIRCLE','ARC','INSERT']);
  assert.ok(Object.isFrozen(spline));assert.ok(Object.isFrozen(spline.ctrl_pts));
});

test('source property metadata publishes cross-checked polar ranges and explicitly disables unread constraint actions',()=>{
  for(const kind of CAD_KINDS)for(const definition of cadPropertyDefinitions(kind)) {
    assert.equal(Number.isFinite(definition.defaultValue),true);
    assert.equal(Number.isFinite(definition.min),true);assert.equal(Number.isFinite(definition.max),true);
    if(definition.editable){assert.ok(definition.defaultValue>=definition.min&&definition.defaultValue<=definition.max);if(definition.values)assert.ok(definition.values.includes(definition.defaultValue));}
  }
  const size=cadPropertyDefinitions('open').find(definition=>definition.key==='距离2')!;
  assert.deepEqual(size.values,[1.5,2,2.5,3,3.5,4]);assert.equal(size.defaultValue,2);assert.equal(size.editable,true);
  const polarDistance=cadPropertyDefinitions('mountainFold').find(definition=>definition.key==='距离1')!;
  const polarAngle=cadPropertyDefinitions('mountainFold').find(definition=>definition.key==='角度3')!;
  assert.equal(polarDistance.type,'distance');assert.equal(polarDistance.min,0);assert.equal(polarDistance.max,1_000_000);
  assert.equal(polarAngle.type,'angle');assert.equal(polarAngle.min,0);assert.equal(polarAngle.max,360);
  assert.equal(polarDistance.editable,false);assert.equal(polarAngle.editable,false);assert.match(polarDistance.description!,/椭圆末端约束/);
  const otherPolar=cadPropertyDefinitions('angleMarker');
  assert.equal(otherPolar.find(definition=>definition.key==='距离1')!.type,'distance');assert.equal(otherPolar.find(definition=>definition.key==='距离1')!.editable,true);
  assert.equal(otherPolar.find(definition=>definition.key==='角度1')!.type,'angle');assert.equal(otherPolar.find(definition=>definition.key==='角度1')!.editable,true);
  assert.ok(cadPropertyDefinitions('equalAngle').some(definition=>!definition.editable&&definition.description?.includes('约束')));
  assert.equal(cadAttributeDefinitions('equalDivision').length,2);
  assert.equal(cadAttributeDefinitions('fold').length,0);
  for(const block of Object.values(CAD_SYMBOL_BLOCKS))assert.ok(!Object.hasOwn(block,'evaluationGraphs'));
});

test('independent DWG reader restores action multipliers, offsets, scale mode and actual ellipse end bindings',()=>{
  const scale=getCadSymbolBlock('fold')!.actions.find(action=>action.object==='BLOCKSCALEACTION')!;
  assert.equal(scale.scale_type,0);assert.equal(scale.verifiedReader,'ACadSharp');assert.deepEqual(scale.boundEntityHandles,[1644]);
  const stretch=getCadSymbolBlock('fold')!.actions.find(action=>action.object==='BLOCKSTRETCHACTION')!;
  assert.equal(stretch.distance_multiplier,1);assert.equal(stretch.angle_offset,0);assert.equal(Object.hasOwn(stretch,'suspectFields'),false);
  assert.deepEqual(stretch.vertexBindings,[{entityHandle:1644,indexes:[4]},{entityHandle:1645,indexes:[0]}]);
  const polar=getCadSymbolBlock('mountainFold')!.actions.find(action=>action.object==='BLOCKPOLARSTRETCHACTION')!;
  assert.deepEqual(polar.vertexBindings,[{entityHandle:11936,indexes:[3]}]);assert.equal(polar.angle_offset,0);
  assert.deepEqual(polar.rotateBindings,[]);
  assert.ok(CAD_SYMBOL_SOURCE.corrections);
});

test('application scale ratios retain source zero bounds while using a positive non-degenerate minimum',()=>{
  for(const kind of CAD_KINDS) {
    const block=getCadSymbolBlock(kind)!;
    for(const action of block.actions.filter(action=>action.object==='BLOCKSCALEACTION')) {
      const definition=block.propertyDefinitions.find(definition=>definition.parameterHandle===action.inputParameterHandle&&definition.type==='distance')!;
      assert.ok(definition.min>=1e-6,`${kind}.${definition.key}`);
    }
  }
  const scale=cadPropertyDefinitions('fold').find(definition=>definition.key==='距离1')!;
  assert.equal(scale.sourceMinimum,0);assert.equal(scale.min,1e-6);assert.match(scale.description!,/原范围允许零/);
  const move=cadPropertyDefinitions('fold').find(definition=>definition.key==='距离2')!;
  assert.equal(move.min,0);assert.equal(move.sourceMinimum,undefined);
});

test('native physical grips preserve independent base/end roles and source offsets while filled outlines have usable normalization',()=>{
  const distance=cadPropertyDefinitions('fold').find(definition=>definition.key==='距离2')!;
  assert.deepEqual(distance.grips!.map(grip=>grip.role),['end','base']);
  assert.equal(distance.grips![0].handle,1634);assert.equal(distance.grips![1].handle,1637);
  const open=getCadSymbolBlock('open')!,openDistance=cadPropertyDefinitions('open').find(definition=>definition.key==='距离2')!;
  assert.deepEqual(openDistance.grips![0].point,[-1.75986638693646,0]);
  assert.notDeepEqual(openDistance.grips![0].point,open.parameters.find(parameter=>parameter.handle===openDistance.parameterHandle)!.def_endpt!.slice(0,2));
  const cut=getCadSymbolBlock('cut')!.normalization;
  assert.ok(cut.nativeBounds.width>0&&cut.nativeBounds.height>0);assert.ok(cut.uniformScale>0&&cut.uniformScale<1e5);
});
