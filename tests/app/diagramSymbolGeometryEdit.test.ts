import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveDiagramSymbolGeometry,type DiagramSymbolStyles} from '../../src/app/diagramSymbolStyles';
import {editDiagramSymbolGeometry} from '../../src/app/diagramSymbolGeometryEdit';
import {symbolNativeGrips,moveSymbolNativeGrip,symbolNativeBaseline} from '../../src/app/diagramAnnotationSVG';
import {fitDiagramArrow} from '../../src/app/diagramPaperBinding';
import type {DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';

const arrow:DiagramSymbolAnnotation={id:'fold',kind:'symbol',symbol:'fold',size:20,position:[45,65],rotation:0,color:'#293d35',width:.7,cadProperties:{'角度1':18}};
const styles:DiagramSymbolStyles={fold:{cadProperties:{'角度1':32,'距离1':48,'距离2':12}}};
test('dragging one CAD grip keeps other geometry defaults inherited',()=>{
  const shown=resolveDiagramSymbolGeometry(arrow,styles);
  const grip=symbolNativeGrips(shown).find(g=>g.label==='距离1')!;
  const edited=editDiagramSymbolGeometry(arrow,styles,a=>moveSymbolNativeGrip(a,grip.id,[grip.point[0]+3,grip.point[1]+3]));
  assert.equal(edited.cadProperties!['角度1'],18);
  assert.ok(!Object.hasOwn(edited.cadProperties!,'距离2'));
  assert.ok(Object.hasOwn(edited.cadProperties!,'距离1'));
  assert.notEqual(edited.cadProperties!['距离1'],48);
  const rebound=resolveDiagramSymbolGeometry(edited,{fold:{cadProperties:{'距离1':33,'距离2':29}}});
  assert.equal(rebound.cadProperties!['距离2'],29);assert.equal(rebound.cadProperties!['距离1'],edited.cadProperties!['距离1']);
});
test('dragging an anchor preserves sparse shape and bound arrows use styled baselines',()=>{
 const shown=resolveDiagramSymbolGeometry(arrow,styles),g=symbolNativeGrips(shown).find(g=>g.kind==='anchor')!;
 const moved=editDiagramSymbolGeometry(arrow,styles,a=>moveSymbolNativeGrip(a,g.id,[g.point[0]+5,g.point[1]-3]));
 assert.deepEqual(moved.cadProperties,arrow.cadProperties);assert.deepEqual(moved.position,[50,62]);
 const bound=fitDiagramArrow(arrow,[8,10],[28,40],false,styles),baseline=symbolNativeBaseline(resolveDiagramSymbolGeometry(bound,styles))!;
 assert.ok(Math.hypot(baseline.start[0]-8,baseline.start[1]-10)<1e-7);assert.ok(Math.hypot(baseline.end[0]-28,baseline.end[1]-40)<1e-7);
 assert.deepEqual(bound.cadProperties,arrow.cadProperties);
});
