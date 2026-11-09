import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tessPreset,readTessParams,changeTessParams} from '../../src/app/tessellation';

test('site boundary and actual coordinates survive parameter updates and project restore',()=>{
 const voronoi={...tessPreset('nonperiodic'),kind:'voronoi',boundary:[[-2,-1],[2,-1],[1.5,2],[-1.5,2]],points:[[-1,-.5],[1,-.5],[0,1]],count:3};
 const restored=readTessParams(voronoi)!;assert.deepEqual(restored,voronoi);
 const rotated=changeTessParams(restored,{angle:45});assert.deepEqual(readTessParams(rotated),rotated);
 assert.equal(readTessParams({...voronoi,points:[[8,8],[0,0],[1,0]]}),null);
 assert.equal(readTessParams({...voronoi,boundary:[[0,0],[1,1],[1,0],[0,1]]}),null);
 assert.equal(readTessParams({...voronoi,boundaryMode:'hull'}),null);
});
test('new Delaunay selection uses the seed hull; restored legacy projects retain square behavior',()=>{
 const legacy={...tessPreset('nonperiodic'),kind:'delaunay'};
 assert.deepEqual(readTessParams(legacy),legacy);
 const current=changeTessParams(tessPreset('nonperiodic'),{kind:'delaunay'});
 assert.ok(current.family==='nonperiodic');assert.equal(current.boundaryMode,'hull');
 assert.deepEqual(readTessParams(current),current);
 const next=changeTessParams(current,{kind:'penrose'});assert.ok(next.family==='nonperiodic');assert.equal(next.boundaryMode,undefined);
 assert.equal(readTessParams({...legacy,boundaryMode:'unsupported'}),null);
 assert.equal(readTessParams({...legacy,boundary:[[0,0],[1,0],[0,1]]}),null);
});
