import {test} from 'node:test';import assert from 'node:assert/strict';
import {uniformHelixExtendedCP3951Document as build,uniformHelixExtendedCP3951SourceMatches as matches,UNIFORM_HELIX_EXTENDED_CP_3951_EXAMPLE as r} from '../../src/app/uniformHelixExtendedCP3951';
import {exportDocument,importDocument} from '../../src/core/formats';
const own=(d:any)=>d.metadata.originalUniformHelixExtended3951;
for(const [name,recipe,index] of [['start-zero',{...r,segments:16},0],['cross-zero',{...r,segments:16,parameterStart:-.5,parameterEnd:.5},8],['pi-crop',{...r,segments:16,foldAngleDeg:180,parameterStart:2.6},7],['negative-speed-start-zero',{...r,segments:16,helicityAngleDeg:120,foldAngleDeg:90,leftWidth:.1,rightWidth:.1},0],['negative-speed-pi',{...r,segments:16,helicityAngleDeg:120,foldAngleDeg:180,parameterStart:-.5,parameterEnd:.5},7]] as const){
 test(name+' exact zero/one tangents and saved signed speed; all metadata forges rejected',()=>{
  const d=build(recipe),f=own(d).sourceFrames[index],speed=own(d).sourceConstants.speed;assert.ok(matches(d));assert.equal(JSON.stringify(f.canonicalPhaseTangent),'[0,1]');assert.equal(JSON.stringify(f.normalizedPrimeTangent),JSON.stringify([0,Math.sign(speed)]));assert.equal(JSON.stringify(f.basePrime),JSON.stringify([0,speed]));
  for(const mutation of [(x:any)=>x.canonicalPhaseTangent[0]=Number.MIN_VALUE,(x:any)=>x.canonicalPhaseTangent[1]+=1e-14,(x:any)=>x.normalizedPrimeTangent[0]=-Number.MIN_VALUE,(x:any)=>x.normalizedPrimeTangent[1]+=1e-14,(x:any)=>x.basePrime[0]=Number.MIN_VALUE,(x:any)=>x.basePrime[1]+=1e-14]){const bad=structuredClone(d);mutation(own(bad).sourceFrames[index]);const before=JSON.stringify(bad);assert.equal(matches(bad),false);assert.equal(JSON.stringify(bad),before);}
  for(const format of ['json','fold'] as const)assert.ok(matches(importDocument(exportDocument(d,format).text,format).doc));
 });
}
test('speed is derived, not strict Node literal: saved-speed consistent one-ULP replay survives',()=>{
 const d=build({...r,foldAngleDeg:180,parameterStart:1,parameterEnd:2,segments:16}),m=own(d),speed=m.sourceConstants.speed;m.sourceConstants.speed=speed+Number.EPSILON;
 for(const f of m.sourceFrames)f.basePrime[1]=m.sourceConstants.speed;m.source.literalDerivativeAtZero[1]=m.sourceConstants.speed;
 assert.ok(matches(d));const bad=structuredClone(d);own(bad).sourceFrames[4].basePrime[1]=speed;assert.equal(matches(bad),false);const inconsistent=structuredClone(d);own(inconsistent).source.literalDerivativeAtZero[1]=speed;assert.equal(matches(inconsistent),false);
});
