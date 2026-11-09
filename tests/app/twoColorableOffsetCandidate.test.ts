import test from 'node:test';
import assert from 'node:assert/strict';
import {changeTessParams,readTessParams} from '../../src/app/tessellation';
import {TWO_COLORABLE_OFFSET_CANDIDATE_NUMBERS,TWO_COLORABLE_OFFSET_CANDIDATE_SOURCE,TWO_COLORABLE_OFFSET_DIAGNOSTICS,
  readTwoColorableOffsetCandidate,twoColorableOffsetCandidate,
  twoColorableOffsetCandidateRequest} from '../../src/app/twoColorableOffsetCandidate';
import {twoColorableArchimedeanParams,twoColorableArchimedeanPreset}
  from '../../src/app/twoColorableArchimedeanPatchSource';

test('fixed-source n=9 rejection never claims a generated CP or computed layer result',()=>{
  const finding=TWO_COLORABLE_OFFSET_DIAGNOSTICS[9];
  assert.equal(finding.cp,null);
  assert.equal(finding.local,'source-rejected');
  assert.equal(finding.flatGeometry,'not_computed');
  assert.equal(finding.layers,'not_computed');
  assert.match(finding.sourceRejection,/顶点 \(0\.65, 0\.606217783\) 有 M=1、V=1/);
  assert.equal(TWO_COLORABLE_OFFSET_DIAGNOSTICS[1].layers,'no-solution');
  assert.equal(TWO_COLORABLE_OFFSET_DIAGNOSTICS[8].layers,'solved');
});

test('read-only In[3183] candidates retain exact source, parity and no-saved-Out identity',()=>{
  for(const number of TWO_COLORABLE_OFFSET_CANDIDATE_NUMBERS){
    const spec=twoColorableOffsetCandidate(number);
    assert.equal(spec.source,TWO_COLORABLE_OFFSET_CANDIDATE_SOURCE);
    assert.equal(spec.notebookFormulaIn,3183);
    assert.equal(spec.savedCpOut,false);
    assert.deepEqual(readTwoColorableOffsetCandidate(JSON.parse(JSON.stringify(spec))),spec);
    const request=twoColorableOffsetCandidateRequest(spec);
    assert.deepEqual(request.tileTwists?.map(tile=>tile.offset),
      spec.parity.map(sign=>sign*spec.offsetMagnitude));
    assert.deepEqual(request.tileTwists?.map(tile=>tile.centralTypes),spec.centralTypes);
    assert.equal(request.customOutput,'tile-twists');
    assert.equal('twoColorableArchimedeanPatch' in request,false);
    assert.equal('twoColorableOffsetCandidate' in request,false);
    assert.equal(JSON.stringify(request).includes(TWO_COLORABLE_OFFSET_CANDIDATE_SOURCE),false);
    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(request))),request);
  }
});

test('candidate readback rejects changed formula, numbers, parity, geometry options and forged Out',()=>{
  const original=twoColorableOffsetCandidate(8);
  for(const edit of [
    (s:typeof original)=>{s.source='foreign' as typeof original.source;},
    (s:typeof original)=>{s.notebookFormulaIn=3184 as 3183;},
    (s:typeof original)=>{s.savedCpOut=true as false;},
    (s:typeof original)=>{s.number=2 as 8;},
    (s:typeof original)=>{s.number=8.5 as 8;},
    (s:typeof original)=>{s.parity[1]=1;},
    (s:typeof original)=>{s.width=-.05;},
    (s:typeof original)=>{s.width=.2;},
    (s:typeof original)=>{s.offsetMagnitude=.04;},
    (s:typeof original)=>{s.centralTypes[0][0]='V';},
    (s:typeof original)=>(s as typeof original&{extra?:boolean}).extra=true,
    (s:typeof original)=>(s as typeof original&{extra?:boolean}).extra=undefined,
  ]){
    const forged=structuredClone(original);edit(forged);
    assert.equal(readTwoColorableOffsetCandidate(forged),null);
    assert.throws(()=>twoColorableOffsetCandidateRequest(forged));
  }
  assert.equal(readTwoColorableOffsetCandidate(null),null);
  assert.equal(readTwoColorableOffsetCandidate([]),null);
});

test('derived n=8 formula has exact provenance and rejects forged geometry or saved-Out claims',()=>{
  const spec=twoColorableArchimedeanPreset(8,'in3183-offset-derived');
  assert.equal(spec.preset,'in3183-offset-derived');
  assert.equal(spec.savedCpOut,false);
  const params=twoColorableArchimedeanParams(spec);
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  const expected=twoColorableOffsetCandidateRequest(twoColorableOffsetCandidate(8));
  const {twoColorableArchimedeanPatch:_source,...generic}=params;
  assert.deepEqual(generic,expected);
  const paper=changeTessParams(params,{paper:{shape:'square',margin:.1}});
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(paper))),paper);
  assert.deepEqual((paper as typeof params).twoColorableArchimedeanPatch,spec);
  const geometryEdit=changeTessParams(params,{vertices:params.vertices.map((point,i)=>
    i===0?[point[0]+.01,point[1]]:point)});
  assert.equal((geometryEdit as typeof params).twoColorableArchimedeanPatch,undefined);
  for(const edit of [
    (p:typeof params)=>{p.twoColorableArchimedeanPatch.savedCpOut=true as false;},
    (p:typeof params)=>{p.twoColorableArchimedeanPatch.notebookFormulaIn=3184 as 3183;},
    (p:typeof params)=>{p.tileTwists![0].offset=.04;},
    (p:typeof params)=>{p.tileTwists![0].centralTypes![0]='V';},
    (p:typeof params)=>{p.vertices[0][0]+=.01;},
  ]){
    const forged=structuredClone(params);edit(forged);
    assert.equal(readTessParams(forged),null);
  }
  assert.throws(()=>twoColorableArchimedeanPreset(1,'in3183-offset-derived'));
  assert.throws(()=>twoColorableArchimedeanPreset(9,'in3183-offset-derived'));
});

test('formula diagnostics never replace the saved two-square CP presets',()=>{
  for(const preset of ['in3184-offset','in3187-alt-pruned','in3188-offset-pruned'] as const){
    const expected=twoColorableArchimedeanParams(twoColorableArchimedeanPreset(2,preset));
    const restored=readTessParams(JSON.parse(JSON.stringify(expected)));
    assert.deepEqual(restored,expected);
    assert.equal(restored?.family,'custom');
    if(restored?.family==='custom')assert.equal(restored.twoColorableArchimedeanPatch?.preset,preset);
  }
});
