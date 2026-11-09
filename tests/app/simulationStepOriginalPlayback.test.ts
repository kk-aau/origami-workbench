import test from 'node:test';
import assert from 'node:assert/strict';
import {planDiagramStepPlayback} from '../../src/engine/simStepPlanning';
import {simulationDegreeFourFixture,simulationObstructingFlapsFixture} from '../fixtures/simulationStepComplex';
import {simulationStepFoldProfile} from '../../src/engine/simStepAnimation';

test('diagram playback ignores legacy collision protection and keeps the original mesh and full fold target',()=>{
 const {prepared,animation,fold}=simulationDegreeFourFixture();
 const messages:string[]=[];
 const result=planDiagramStepPlayback(fold,{...animation,collisionPolicy:'contact'},s=>messages.push(s));
 assert.equal(result.animation.collisionPolicy,'allow');assert.equal(result.checkedIntervals,0);
 assert.equal(result.fold,undefined,'no refined replacement mesh');
 assert.equal(result.animation.initialPositions.length,prepared.vertexCount*3);
 assert(!result.animation.dynamic?.contactStop);
 assert(!messages.some(s=>/检查.*碰撞|检查.*穿透/.test(s)));
 const end=simulationStepFoldProfile(result.animation,1);assert.deepEqual(end.ranges.map(r=>r.toAngle),animation.ranges.map(r=>r.toAngle));
 assert(end.ranges.some(r=>Math.abs(r.toAngle)===180),'the real full target is retained');
});

test('a geometrically valid crossing is played without a contact stop or collision certification',()=>{
 const {fold,animation}=simulationObstructingFlapsFixture(),events:string[]=[];
 const result=planDiagramStepPlayback(fold,{...animation,collisionPolicy:'contact'},s=>events.push(s));
 assert(result.animation.motion);assert.equal(result.checkedIntervals,0);assert.equal(result.animation.collisionPolicy,'allow');
 assert(!result.animation.dynamic?.contactStop);assert(!events.some(s=>/检查.*碰撞|检查.*穿透/.test(s)));
});
