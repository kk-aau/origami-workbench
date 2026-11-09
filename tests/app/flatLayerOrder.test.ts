import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flatLayerOrder} from '../../src/core/flatLayerOrder';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import type {FlatFoldResult,Point} from '../../src/core/types';
test('renumbering faces cannot flip the camera stacking when the first face points backwards',()=>{
 const vertices:Point[]=[[0,0],[1,0],[1,1],[0,1]],faces=[[0,1,2,3],[3,2,1,0]];
 assert.deepEqual(flatLayerOrder(vertices,faces,[[0,1,1]]),[0,1]);
 const map=[1,0];assert.deepEqual(flatLayerOrder(vertices,[faces[1],faces[0]],[[1,0,1]]).map(i=>map[i]),[0,1]);
 const result:FlatFoldResult={geometry:{status:'ready',message:'',vertices,faces:[faces[1],faces[0]]},layers:{status:'solved',message:'',faceOrders:[[1,0,1]]},warnings:[]};
 const regions={cells:[{polygon:vertices,faces:[0,1],area:1}],epsilon:1e-8,maxDepth:2,omittedThinRegions:0};
 assert.deepEqual(modelRegionLayers(result,regions,'front')[0].layers,{status:'ordered',topToBottom:[0,1]});
 assert.deepEqual(modelRegionLayers(result,regions,'back')[0].layers,{status:'ordered',topToBottom:[1,0]});
});
