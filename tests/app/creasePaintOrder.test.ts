import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creasePaintOrder} from '../../src/app/creasePaintOrder';
test('auxiliary strokes paint underneath all main strokes without mutating source order',()=>{
 const source=[{assignment:'V',id:1},{assignment:'A',id:2},{assignment:'B',id:3},{assignment:'A',id:4},{assignment:'M',id:5}],before=structuredClone(source);
 assert.deepEqual(creasePaintOrder(source).map(s=>s.id),[2,4,1,3,5]);assert.deepEqual(source,before);
});
