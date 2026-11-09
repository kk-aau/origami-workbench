import assert from 'node:assert/strict';import fs from 'node:fs';import test from 'node:test';
import {parseGenericConicSectionResult,validateGenericConicSectionQuery,CONIC_NATIVE_PRESET,CONIC_NATIVE_SAVED_PRESETS,
 type GenericConicSectionResult} from '../../src/app/curvedNativeConicSection';
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/curved-conic-section-native-20261001.json','utf8'));
const get=(name:string)=>fixtures.find((c:{name:string})=>c.name===name)!;
const rejects=(name:string,f:(r:GenericConicSectionResult)=>void)=>{const c=get(name),r=structuredClone(c.response);f(r);assert.throws(()=>parseGenericConicSectionResult(r,c.query));};
test('16来源、原九序及完整多域严格独立回读；旧六保存参数也是真四参数来源',()=>{
 assert.equal(fixtures.length,16);for(const c of fixtures)parseGenericConicSectionResult(c.response,c.query);
 for(const q of CONIC_NATIVE_SAVED_PRESETS)validateGenericConicSectionQuery(q);
 assert.equal(get('hyperbola-both-branches').response.components.length,2);
 assert.deepEqual(get('positive-ellipse').response.components.map((x:{parameterRange:number[]})=>x.parameterRange),[[4,5],[-1.2,.3]]);
});
test('非法Infinity、未知字段、非递增/重叠/过多域及密度严格拒绝',()=>{
 for(const patch of [{leftFocus:0},{rightFocus:0},{leftFocus:null},{rightFocus:Infinity},{leftFocus:{infinity:1}},
  {rightFocus:{infinity:-1}},{leftFocus:{infinity:-1,label:'left'}},{leftCross:NaN},{parameterRanges:[[0,1],[.5,2]]},
  {parameterRanges:[[1,0]]},{parameterRanges:[[0,.001]]},{parameterRanges:[[0,.1],[1,1.1],[2,2.1],[3,3.1],[4,4.1]]},{segments:7},{extra:1}])
  assert.throws(()=>validateGenericConicSectionQuery({...CONIC_NATIVE_PRESET,...patch}));
});
test('九规则每个分量、导数、归一化及来源索引都不能以伪自洽几何替代',()=>{
 for(const field of ['rules','derivatives','normalizedRules','normalizedDerivatives'] as const)for(let k=0;k<9;k++)
  rejects('changed-ellipse',r=>{r.components[0].samples[3][field][k][0]+=.01;});
 rejects('hyperbola-both-branches',r=>{r.components.reverse();});rejects('four-independent-ranges',r=>{r.components[2].rangeIndex=0;});
 rejects('positive-ellipse',r=>{r.components[0].samples.pop();});rejects('tiny-ellipse',r=>{r.normalization.scale*=2;});
 rejects('tiny-ellipse',r=>{r.components[0].samples[0].rules[0][1]=0;});
});
test('branch/None/原规则次序/未认证布尔与完整域coverage不允许假提升',()=>{
 rejects('positive-circle',r=>{r.source.branch='ellipse';});rejects('changed-ellipse',r=>{r.source.simplification='Simplify' as 'None';});
 rejects('changed-ellipse',r=>{r.source.ruleKeys.reverse();});rejects('changed-ellipse',r=>{r.certification.adoptableCreasePattern=true as false;});
 rejects('changed-ellipse',r=>{r.source.halfAngleContinuationApplied=true as false;});
 rejects('changed-ellipse',r=>{r.domain.cells[0].start+=.01;});rejects('changed-ellipse',r=>{r.domain.cells[0].normalizedRuleBounds[0][0]=[99,100];});
 rejects('changed-ellipse',r=>{r.domain.minimumNormalizedFoldSpeedLowerBound!+=.01;});
 rejects('near-half-angle-endpoint-unknown',r=>{r.domain.certified=true;r.certification.fullOriginalDomainsCertified=true;});
 rejects('near-half-angle-endpoint-unknown',r=>{r.domain.foldRegularity='verified';});
 rejects('hyperbola-both-branches',r=>{r.poleEnclosures.pop();});rejects('hyperbola-both-branches',r=>{r.poleEnclosures[0].parameterEnclosure[0]-=.1;});
 assert.throws(()=>parseGenericConicSectionResult(get('changed-ellipse').response,{...get('changed-ellipse').query,leftCross:1}));
});

