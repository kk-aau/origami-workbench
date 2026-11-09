import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SURFACE_NORMAL_NATIVE_PRESET,parseGenericSurfaceNormalResult,validateGenericSurfaceNormalQuery} from '../../src/app/curvedNativeSurfaceSystem';
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/curved-surface-normal-native-20261001.json','utf8')).cases,
  copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
test('86 literal front/back two-variable normal sources independently replay full rectangles',()=>{
  assert.equal(fixtures.length,86);
  for(const c of fixtures)assert.doesNotThrow(()=>parseGenericSurfaceNormalResult(c.response,c.query),c.name);
  const front=fixtures.find((c:any)=>c.name==='original-in3778-front'),back=fixtures.find((c:any)=>c.name==='original-in3778-back');
  for(let i=0;i<25;i++){assert.deepEqual(front.response.sample.rows[i].sourcePoint,back.response.sample.rows[i].sourcePoint);
    for(let j=0;j<3;j++)assert.equal(front.response.sample.rows[i].normal[j],-back.response.sample.rows[i].normal[j]);}
});
test('zero identity front/back normals and original partial domains cannot be forged',()=>{
  for(const name of ['identity-variable-difference-front','identity-mixed-cubic-back','identity-rational-copy-front']){
    const c=fixtures.find((x:any)=>x.name===name);for(const change of [(r:any)=>{r.grid.rows[3][2].normal=[0,0,1];},
      (r:any)=>{r.sample.rows[4].sourceTangents[1][2]=0;},(r:any)=>{r.query.surfaceOrientation*=-1;}]){
      const r=copy(c.response);change(r);assert.throws(()=>parseGenericSurfaceNormalResult(r,c.query),name);}}
  const c=fixtures.find((x:any)=>x.name==='identity-variable-difference-front');
  for(const source of ['sqrt(1/u-1/u)','sqrt((1/u)**0-1)','sqrt(log(u)-log(u))','sqrt(0*sqrt(-1))']){
    const r=copy(c.response);r.query.surface[2]='u*v+.3*v**2+'+source;assert.throws(()=>parseGenericSurfaceNormalResult(r,r.query),source);}
});
test('normal orientation, source, tangent, rectangle evidence and interpolation claims cannot be forged',()=>{
  const c=fixtures.find((c:any)=>c.name==='mixed-saddle-back');
  for(const change of [(r:any)=>{r.sample.rows[2].normal[0]*=-1;},(r:any)=>{r.grid.rows[1][3].normal[1]+=.1;},
    (r:any)=>{r.sample.rows[2].sourceTangents[0][2]+=.1;},(r:any)=>{r.domain.cells[0].normalizedBasicRuleBounds[7]=[20,21];},
    (r:any)=>{r.domain.unresolved.push(r.domain.cells[0].rectangle);r.domain.certified=false;r.domain.reason='fake';},
    (r:any)=>{r.source.numericalWrapperInterpolationReproduced=true;},(r:any)=>{r.certification.adoptableCreasePattern=true;},
    (r:any)=>{r.query.surfaceOrientation=1;}]){const r=copy(c.response);change(r);assert.throws(()=>parseGenericSurfaceNormalResult(r,c.query));}
});
test('strict standalone normal contract rejects inherited principal switch and fabricated directions',()=>{
  for(const extra of [{principalAnalysis:true},{surfaceOrientation:0},{surfaceOrientation:true},{orientation:-1},
    {surface:['u','s','0']},{vStart:2},{uSegments:7}])assert.throws(()=>validateGenericSurfaceNormalQuery({...SURFACE_NORMAL_NATIVE_PRESET,...extra}));
});
