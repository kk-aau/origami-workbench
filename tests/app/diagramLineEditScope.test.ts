import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isolateDiagramLineEdits} from '../../src/app/diagramLineEditScope';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
const line:DiagramLineAnnotation={id:'merged',kind:'line',a:[10,20],b:[40,20],style:'valley',foldAction:'fold',foldFaces:[0,1],color:'#293d35',width:.7};
test('editing the clicked top face preserves the lower face type, purpose and coordinates',()=>{
  const before=structuredClone(line),next=isolateDiagramLineEdits([line],[{...line,style:'mountain',foldAction:'precrease'}],{merged:[1]},()=> 'lower');
  assert.deepEqual(line,before);assert.equal(next.length,2);
  assert.deepEqual(next[0],{...line,style:'mountain',foldAction:'precrease',foldFaces:[1]});assert.deepEqual(next[1],{...line,id:'lower',foldFaces:[0]});
});
test('moving a clicked shared line keeps one handle and moves every bound material route',()=>{
  const before=structuredClone(line);
  const moved=isolateDiagramLineEdits([line],[{...line,a:[15,25],b:[45,25]}],{merged:[0]},()=> 'lower');
  assert.deepEqual(moved,[{...line,a:[15,25],b:[45,25]}]);assert.deepEqual(line,before);
});

test('endpoint edits preserve the whole saved range, including inactive and unbound drawing handles',()=>{
  for(const source of [line,{...line,foldFaces:[]},(({foldFaces:_faces,...source})=>source)(line)]){
    const wanted=source.foldFaces?.length?[source.foldFaces[0]]:[];
    const changed={...source,b:[55,27] as [number,number],foldFaces:wanted};
    const moved=isolateDiagramLineEdits([source],[changed],{merged:wanted},()=> 'should-not-copy');
    const expected={...source,b:changed.b};assert.deepEqual(moved,[expected]);
    assert.equal(Object.hasOwn(moved[0],'foldFaces'),Object.hasOwn(source,'foldFaces'));
  }
});

test('removing only the clicked occurrence still retains an unselected paper route',()=>{
  assert.deepEqual(isolateDiagramLineEdits([line],[],{merged:[0]},()=> 'lower'),[{...line,id:'lower',foldFaces:[1]}]);
});
test('selection alone never splits a shared line and explicit all-face edits remain shared',()=>{
  const unchanged=[line];assert.equal(isolateDiagramLineEdits([line],unchanged,{merged:[0]}),unchanged);
  const next=isolateDiagramLineEdits([line],[{...line,color:'#ff0000'}],{merged:[0,1]},()=> 'unused');assert.equal(next.length,1);assert.equal(next[0].color,'#ff0000');
});
test('CP line remainder preserves its source identity and background scope stays empty',()=>{
  const source={...line,id:'cp-existing:route',style:'crease' as const};delete source.foldAction;
  const next=isolateDiagramLineEdits([source],[{...source,color:'#112233'}],{[source.id]:[0]},()=> 'retained');assert.equal(next[1].id,'cp-existing:retained');
  const background={...line,foldFaces:[]};assert.deepEqual(isolateDiagramLineEdits([background],[{...background,width:1}],{merged:[]}),[{...background,width:1}]);
});
test('stale face selections fail without silently editing all paper layers',()=>{
  assert.throws(()=>isolateDiagramLineEdits([line],[{...line,style:'mountain'}],{merged:[8]}),/重新选择/);
});
