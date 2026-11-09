import test from 'node:test';
import assert from 'node:assert/strict';
import {addCustomDraftPoint,addOrderedCustomDraftFace,connectCustomDraftPoints,customDraftStructureProblem,customDraftTemporaryEdgeCount,customMeshDraftFromParams,customMeshParamsFromDraft,moveCustomDraftPoint,removeCustomDraftEdge,removeCustomDraftFace,removeCustomDraftPoint,type CustomMeshParams} from '../../src/app/customMeshDraft';
import {readTessParams,tessPreset,defaultTileTwists} from '../../src/app/tessellation';
const params=():CustomMeshParams=>({family:'custom',vertices:[[0,0],[1,0],[1,1],[0,1]],faces:[[0,1,2,3]],repeatX:1,repeatY:1,angle:36,scale:.3,customOutput:'tiling'});
test('source point edits preserve precision, indices and the input; there is no normalization or clipping',()=>{
 const p=params(),d=customMeshDraftFromParams(p),x=1.2345678901234567,next=moveCustomDraftPoint(d,2,[x,11]);
 assert.equal(next.vertices[2][0],x);assert.equal(next.vertices[2][1],11);assert.deepEqual(next.faces,d.faces);assert.deepEqual(next.edges,d.edges);assert.deepEqual(p,params());
 assert.match(customDraftStructureProblem(next),/不会自动裁剪/);assert.throws(()=>customMeshParamsFromDraft(p,next));assert.throws(()=>moveCustomDraftPoint(d,2,[NaN,0]));
});
test('closing a drawn cycle never creates a face; explicit ordered face action keeps the requested ring',()=>{
 let d=customMeshDraftFromParams(params());d=addCustomDraftPoint(d,[2,0]);d=addCustomDraftPoint(d,[2,1]);d=connectCustomDraftPoints(d,1,4);d=connectCustomDraftPoints(d,4,5);d=connectCustomDraftPoints(d,5,2);
 assert.equal(d.faces.length,1);assert.equal(customDraftTemporaryEdgeCount(d),3);assert.throws(()=>customMeshParamsFromDraft(params(),d),/未加入面的点/);
 const order=[1,4,5,2];d=addOrderedCustomDraftFace(d,order);assert.deepEqual(d.faces[1],order);assert.equal(customDraftTemporaryEdgeCount(d),0);assert.equal(d.edges.length,7);
 const next=customMeshParamsFromDraft(params(),d);assert.deepEqual(next.faces,[[0,1,2,3],order]);assert.equal(next.vertices.length,6);assert.equal(Object.hasOwn(next,'edges'),false);assert.ok(readTessParams(JSON.parse(JSON.stringify(next))));
});
test('face removal keeps edges and points; referenced deletions are refused and unused deletion reindexes',()=>{
 const d=customMeshDraftFromParams(params());assert.throws(()=>removeCustomDraftPoint(d,1),/仍被面或草图边引用/);assert.throws(()=>removeCustomDraftEdge(d,0),/请先明确删面/);
 const noface=removeCustomDraftFace(d,0);assert.deepEqual(noface.vertices,d.vertices);assert.deepEqual(noface.edges,d.edges);assert.equal(noface.faces.length,0);
 let extra=addCustomDraftPoint(d,[4,4]);extra=addCustomDraftPoint(extra,[5,4]);extra=addCustomDraftPoint(extra,[6,4]);extra=connectCustomDraftPoints(extra,5,6);
 const removed=removeCustomDraftPoint(extra,4);assert.deepEqual(removed.faces,d.faces);assert.deepEqual(removed.edges.at(-1),[4,5]);assert.deepEqual(removed.vertices.at(-1),[6,4]);assert.equal(extra.vertices.length,7);
});
test('temporary edges are intentionally excluded from the existing custom source schema',()=>{
 const p=params(),d=connectCustomDraftPoints(customMeshDraftFromParams(p),0,2),next=customMeshParamsFromDraft(p,d);
 assert.equal(customDraftTemporaryEdgeCount(d),1);assert.deepEqual(next.vertices,p.vertices);assert.deepEqual(next.faces,p.faces);assert.equal(Object.hasOwn(next,'edges'),false);assert.equal(d.edges.length,5);
 assert.throws(()=>connectCustomDraftPoints(d,2,0),/已存在/);assert.throws(()=>connectCustomDraftPoints(d,0,0));
});
test('disconnected faces keep the existing source domain; coordinates do not weld or hide three owners',()=>{
 let d=customMeshDraftFromParams(params());d=addCustomDraftPoint(d,[1,0]);d=addCustomDraftPoint(d,[2,0]);d=addCustomDraftPoint(d,[2,1]);d=addCustomDraftPoint(d,[1,1]);d=addOrderedCustomDraftFace(d,[4,5,6,7]);
 assert.equal(customDraftStructureProblem(d),'');assert.equal(d.vertices.length,8);assert.deepEqual(d.vertices[1],d.vertices[4]);
 const next=customMeshParamsFromDraft(params(),d);assert.equal(next.vertices.length,8);assert.deepEqual(next.faces,[[0,1,2,3],[4,5,6,7]]);assert.deepEqual(next.vertices,d.vertices);
 const three=customMeshDraftFromParams(params());three.faces.push([1,0,2],[0,1,3]);assert.match(customDraftStructureProblem(three),/三面共用/);
 assert.throws(()=>addOrderedCustomDraftFace(three,[0,1,0]),/不同点/);assert.throws(()=>addOrderedCustomDraftFace(three,[0,1,99]));
});
test('commit delegates geometry provenance and tile settings cleanup to the existing reader',()=>{
 const raw={...params(),customOutput:'tile-twists',tileTwists:defaultTileTwists([[0,1,2,3]]),stationaryFace:0,dualTargets:[[0,0],[1,1]]};
 const p=readTessParams(raw);assert.ok(p?.family==='custom');if(p?.family!=='custom')return;
 const unchanged=customMeshParamsFromDraft(p,customMeshDraftFromParams(p));assert.deepEqual(unchanged.tileTwists,p.tileTwists);assert.equal(unchanged.stationaryFace,0);assert.equal(unchanged.dualTargets,undefined);
 const changed=customMeshParamsFromDraft(p,moveCustomDraftPoint(customMeshDraftFromParams(p),2,[1.1,1]));assert.equal(changed.stationaryFace,undefined);assert.deepEqual(changed.tileTwists,defaultTileTwists(changed.faces));assert.equal(changed.dualTargets,undefined);
 const concave=customMeshParamsFromDraft({...params(),customOutput:'twist'},moveCustomDraftPoint(customMeshDraftFromParams(params()),2,[.2,.2]));assert.equal(concave.customOutput,'tiling');assert.ok(readTessParams(concave));
 const preset=tessPreset('custom');assert.ok(preset.family==='custom');if(preset.family==='custom')assert.ok(customMeshParamsFromDraft(preset,customMeshDraftFromParams(preset)));
});
test('structure validity is separate from geometric validity; the editor does not repair a crossing face',()=>{
 const p=params(),d=customMeshDraftFromParams(p);d.faces=[[0,2,1,3]];
 assert.equal(customDraftStructureProblem(d),'');const next=customMeshParamsFromDraft(p,d);assert.deepEqual(next.faces,d.faces);assert.deepEqual(next.vertices,p.vertices);
 assert.throws(()=>addOrderedCustomDraftFace(d,Array.from({length:25},(_,i)=>i)),/3–24/);
 const many={vertices:Array.from({length:96},()=>[0,0] as [number,number]),faces:[],edges:[]};assert.throws(()=>addCustomDraftPoint(many,[0,0]),/最多96点/);
});
