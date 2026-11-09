import assert from 'node:assert/strict';
import test from 'node:test';
import {potProfileError,potProfileLimits,potProfilePreview,readPotProfile,readPotProfileJson} from '../../src/app/potProfile';
import {radialPotPreset} from '../../src/app/radialPotParams';
import {rectangularPotPreset} from '../../src/app/rectangularPotParams';
import {twistedPotPreset,twistedPotSavedPreset} from '../../src/app/twistedPotParams';

test('profile edits share all three production readers and retain non-profile options',()=>{
  for(const params of [radialPotPreset(),rectangularPotPreset(),twistedPotPreset(),twistedPotSavedPreset(3523)]){
    const original=structuredClone(params),points=structuredClone(params.crossSection);
    points.at(-1)![0]+=.12;
    assert.equal(potProfileError(params,points),'');
    const next=readPotProfile(params,points)!;
    assert.ok(next);
    assert.deepEqual({...next,crossSection:params.crossSection},params);
    assert.deepEqual(params,original);
    assert.deepEqual(readPotProfileJson(params,JSON.stringify(points)),points);
  }
});

test('profile point budget matches each constructor instead of promising unavailable subdivisions',()=>{
  const radial={...radialPotPreset(),sectors:16},rectangular={...rectangularPotPreset(),sectors:16,panels:16},twisted={...twistedPotPreset(),sectors:16};
  assert.deepEqual(potProfileLimits(radial),{min:3,max:8});
  assert.deepEqual(potProfileLimits(rectangular),{min:2,max:8});
  assert.deepEqual(potProfileLimits(twisted),{min:4,max:12});
  assert.deepEqual(potProfileLimits({...rectangular,panels:1}),{min:2,max:24});
  assert.match(potProfileError(radial,Array.from({length:9},(_,i)=>[i,i])),/3–8/);
});

test('profile validation explains local height reversals and flat segment restrictions',()=>{
  const radial=radialPotPreset(),twisted=twistedPotPreset();
  assert.match(potProfileError(radial,[[0,0],[1,1],[1,.5],[2,2]]),/点 3.*高度方向/);
  assert.match(potProfileError(radial,[[0,0],[1,0],[2,0],[2,1]]),/点 2 与点 3 等高/);
  assert.match(potProfileError(twisted,[[0,0],[1,.1],[1,1],[2,2]]),/首段必须水平/);
  assert.match(potProfileError(radial,[[0,0],[1,1],[1,1],[2,2]]),/点 2 与点 3 重合/);
  assert.match(potProfileError(radial,[[0,0],[-1,1],[1,2]]),/旋转轴/);
  assert.equal(potProfileError(radial,[[0,0],[1,0],[1,-1],[2,-2]]),'');
  assert.equal(potProfileError({...twisted,sectors:3},[[0,0],[1,0],[1,-1],[2,-2]]),'');
  assert.equal(potProfileError(rectangularPotPreset(),[[1,0],[2,-1]]),'');
});

test('advanced import rejects malformed shape, invalid values and unsupported point count',()=>{
  const params=radialPotPreset();
  for(const input of ['broken','{}','null','[[0,0],[1,1]]','[[0,0],[1,"x"],[1,2]]','[[0,0],[1,1],[1,21]]'])assert.throws(()=>readPotProfileJson(params,input));
  const points=params.crossSection;
  const imported=readPotProfileJson(params,JSON.stringify(points));
  imported[0][0]=99;
  assert.equal(points[0][0],0);
});

test('profile preview uses a common XY scale and keeps height axis upward',()=>{
  for(const points of [[[0,0],[1,1],[1,8]],[[0,0],[8,1],[8,2]],[[2,-1],[3,0],[3,3]]] as [number,number][][]){
    const {drawn}=potProfilePreview(points);
    const xScale=(drawn[1][0]-drawn[0][0])/(points[1][0]-points[0][0]);
    const yScale=(drawn[0][1]-drawn[1][1])/(points[1][1]-points[0][1]);
    assert.ok(Math.abs(xScale-yScale)<1e-10);
    assert.ok(drawn.every(([x,y])=>x>=10&&x<=100&&y>=10&&y<=94));
  }
});
