import {test} from 'node:test';import assert from 'node:assert/strict';
import {uniformHelixExtendedCP3951Document as build,uniformHelixExtendedCP3951SourceMatches as matches,UNIFORM_HELIX_EXTENDED_CP_3951_EXAMPLE as r} from '../../src/app/uniformHelixExtendedCP3951';
const own=(d:any)=>d.metadata.originalUniformHelixExtended3951;
test('π cosHalf/K zero and exact sinHalf ±1 identities reject MIN/ULP mutations',()=>{
 for(const gamma of [180,-180,540]){const d=build({...r,segments:16,foldAngleDeg:gamma});assert.ok(matches(d));for(const key of ['cosHalf','angularRate','sinHalf']){const bad=structuredClone(d),c=own(bad).sourceConstants;c[key]=c[key]===0?Number.MIN_VALUE:c[key]+Number.EPSILON;const before=JSON.stringify(bad);assert.equal(matches(bad),false);assert.equal(JSON.stringify(bad),before);}}
});
test('face orientation is discrete exact signed1 for both winding branches',()=>{
 for(const gamma of [90,270,-60]){const d=build({...r,segments:16,foldAngleDeg:gamma}),bad=structuredClone(d);own(bad).sourceConstants.faceOrientation+=Number.EPSILON;assert.equal(matches(bad),false);assert.ok(matches(d));}
});
test('known original θ quarter constants are exact; regular angles retain derived replay',()=>{
 for(const theta of [0,180,360,-360]){const d=build({...r,helicityAngleDeg:theta,segments:16,leftWidth:.1,rightWidth:.1});assert.ok(matches(d));for(const key of ['sinTheta','cosTheta']){const bad=structuredClone(d),c=own(bad).sourceConstants;c[key]=c[key]===0?Number.MIN_VALUE:c[key]+Number.EPSILON;assert.equal(matches(bad),false);}}
 const regular=build({...r,segments:16}),replay=structuredClone(regular);own(replay).sourceConstants.cosTheta+=Number.EPSILON;assert.ok(matches(replay));
 const near=build({...r,segments:16,foldAngleDeg:180+1e-10});assert.equal(own(near).classification.explicitAnalyticContinuation,false);assert.ok(matches(near));
});
