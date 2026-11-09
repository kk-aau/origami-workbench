import {test} from 'node:test';
import assert from 'node:assert/strict';
import {processingOutputPaths} from '../../src/app/cpProcessingOutput';
import {optimizeCPPaths,cpPathMetrics} from '../../src/core/cpPathOptimizer';
import {defaultAngle,type Doc} from '../../src/core/types';

test('LINE兼容预览显示实际独立边数，连续版保留优化路径；位置、顺序、长度和次数不变',()=>{
  const doc:Doc={name:'兼容',paper:{width:10,height:10},segments:[
    {id:'a',a:[0,0],b:[1,0],assignment:'M',angle:defaultAngle('M')},
    {id:'b',a:[1,0],b:[1,1],assignment:'M',angle:defaultAngle('M')},
  ]};
  const plan=optimizeCPPaths(doc),before=structuredClone(plan),lines=processingOutputPaths(plan,true);
  assert.equal(processingOutputPaths(plan),plan.paths);assert.equal(plan.paths.length,1);assert.equal(lines.length,2);
  assert.deepEqual(lines.flatMap(p=>p.sourceSegmentIds),plan.paths.flatMap(p=>p.sourceSegmentIds));
  assert.equal(cpPathMetrics(lines).drawLength,plan.after.drawLength);assert.equal(cpPathMetrics(lines).travelDistance,plan.after.travelDistance);
  assert.deepEqual(plan,before);
});
test('兼容预览不合并重复次数或在闭环末尾增加隐式边',()=>{
  const doc:Doc={name:'多次',paper:{width:10,height:10},segments:[{id:'a',a:[-2,3],b:[4,3],assignment:'V',angle:180}]};
  const plan=optimizeCPPaths(doc,{profiles:{V:{passes:2}}}),lines=processingOutputPaths(plan,true);
  assert.equal(lines.length,2);assert.deepEqual(lines.map(p=>p.sourceSegmentIds),[['a'],['a']]);
  assert.equal(cpPathMetrics(lines).drawLength,12);assert.equal(new Set(lines.map(p=>p.id)).size,2);
});
