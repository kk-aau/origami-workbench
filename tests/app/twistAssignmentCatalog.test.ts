import assert from 'node:assert/strict';
import test from 'node:test';
import {allCyclicTwistTypes,allValidTwistTypes,centeredTwistAngleSelfContained,centeredTwistSelfContained,centeredTwistTypeCount,centeredTwistTypes,cyclicTwistTypeCount,cyclicTwistTypes,regularPolygonTwistValid,twistAssignmentCatalog,validTwistTypeCount,validTwistTypes,type TwistTypes} from '../../src/app/twistAnalysis';

// Independent replay of In[2717]: expand all binary words, then union rotations.
function originalUnion(n:number):TwistTypes[]{
  const seen=new Set<string>();
  for(let mask=0;mask<2**n;mask++){
    const word=Array.from({length:n},(_,i)=>mask&(2**i)?'V':'M').join('');
    const rotations=Array.from({length:n},(_,i)=>word.slice(i)+word.slice(0,i));
    seen.add(rotations.sort()[0]);
  }
  return [...seen].sort().map(word=>word.split('') as TwistTypes);
}
test('direct necklace traversal reproduces the original all-word rotation union through thirteen edges',()=>{
  for(let n=3;n<=13;n++){
    const expected=originalUnion(n);
    assert.deepEqual([...cyclicTwistTypes(n)],expected);
    assert.equal(cyclicTwistTypeCount(n),BigInt(expected.length));
  }
  assert.equal(allCyclicTwistTypes(16).length,4116);
});
test('64-edge count stays exact beyond Number precision and a prefix does not enumerate the entire universe',()=>{
  const independent=(2n**64n+2n**32n+2n*2n**16n+4n*2n**8n+8n*2n**4n+16n*2n**2n+32n*2n)/64n;
  assert.equal(cyclicTwistTypeCount(64),independent);
  assert.ok(independent>BigInt(Number.MAX_SAFE_INTEGER));
  const catalog=twistAssignmentCatalog(64,36,.2,70,'pleat');
  assert.equal(catalog.counts?.all,independent.toString());
  assert.equal(catalog.all.length,24);
  assert.equal(catalog.all[0].join(''),'M'.repeat(64));
  assert.equal(new Set(catalog.all.map(t=>t.join(''))).size,24);
  assert.throws(()=>allCyclicTwistTypes(64),/结果包含/);
});
test('exact category filtering agrees with the original predicate on every small representative and threshold',()=>{
  for(let n=3;n<=13;n++)for(const angle of [1,30,36,360/n-1e-5,360/n,360/n+1e-5,90-180/n-1e-5,90-180/n,90-180/n+1e-5,90,179]){
    const expected=originalUnion(n).filter(types=>regularPolygonTwistValid(n,angle,types));
    assert.deepEqual([...validTwistTypes(n,angle)],expected,`${n}/${angle}`);
    assert.equal(validTwistTypeCount(n,angle),BigInt(expected.length));
  }
});
test('large valid queries return all actual results without scanning rejected mixed necklaces',()=>{
  assert.deepEqual(allValidTwistTypes(64,36),[Array(64).fill('M'),Array(64).fill('V')]);
  assert.deepEqual(allValidTwistTypes(64,90),[]);
  assert.equal(validTwistTypeCount(64,1),cyclicTwistTypeCount(64));
  assert.throws(()=>allValidTwistTypes(64,1),/结果包含/);
  assert.equal(validTwistTypeCount(64,NaN),0n);
});
test('centered count and iterator match both original parameter forms including containment boundaries',()=>{
  for(const n of [3,4,5,6,8,12,13])for(const width of [.09,.2,.49,.5])for(const value of [20,45,70,90,110,160])for(const form of ['pleat','twist'] as const){
    const predicate=form==='pleat'?centeredTwistSelfContained:centeredTwistAngleSelfContained;
    const expected=originalUnion(n).filter(types=>predicate(n,width,value,types));
    assert.deepEqual([...centeredTwistTypes(n,width,value,form)],expected,`${n}/${width}/${value}/${form}`);
    assert.equal(centeredTwistTypeCount(n,width,value,form),BigInt(expected.length));
  }
});
