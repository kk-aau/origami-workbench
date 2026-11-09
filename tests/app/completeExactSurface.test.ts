import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {buildExactModelTopology,walkExactCoverage} from '../../src/app/modelExactTopology';
import {completeExactSurface} from '../../src/app/completeExactSurface';
import {rememberFlatExactProof,exactGeometryBinding,type FlatExactProof} from '../../src/app/flatExactProof';
import {computeModelSurface} from '../../src/app/modelSurfaceAnalysis';
import {exactSurfaceIssue} from '../../src/app/modelExactSurfaceData';

function model():FlatFoldResult{
 const vertices:Point[]=[[0,0],[10,0],[10,10],[0,10],[2,2],[8,2],[8,8],[2,8]];
 return {geometry:{status:'ready',message:'',vertices,faces:[[0,1,2,3],[4,5,6,7]]},layers:{status:'solved',message:'',faceOrders:[[0,1,1]]},warnings:[]};
}
function proof(result:FlatFoldResult):FlatExactProof{
 const topology=buildExactModelTopology(result),top=new Int32Array(topology.cellCount).fill(-2),bottom=top.slice(),depth=new Uint32Array(topology.cellCount);let verifiedCells=0;
 walkExactCoverage(topology,{onCell(cell,faces){const ids=[...faces].sort((a,b)=>a-b);top[cell]=ids[0]??-1;bottom[cell]=ids.at(-1)??-1;depth[cell]=ids.length;verifiedCells++;}});
 return {topology,certificate:{top,bottom,depth,verifiedCells}};
}
test('complete helper creates both sides and answers both shadow query sets in the coverage walk',()=>{
 const source=model(),p=proof(source),before=structuredClone(source),reply=completeExactSurface(source,p,{bothSides:true});
 assert.equal(reply.exactAnalysis.verifiedCells,p.topology.cellCount);assert.equal(reply.exactAnalysis.maxDepth,2);assert.equal(reply.exactAnalysis.geometryBinding,exactGeometryBinding(source));
 assert.deepEqual([...reply.exact.faceIds],[0]);assert.deepEqual([...reply.opposite!.exact.faceIds],[0,1]);
 assert.equal(reply.exact.shadows!.strips.length,0);assert.equal(reply.opposite!.exact.shadows!.strips.length,4);
 assert.equal(exactSurfaceIssue(reply,source),null);assert.equal(exactSurfaceIssue(reply.opposite!,source),null);
 assert.equal('topology' in reply,false);assert.equal('certificate' in reply,false);assert.equal('cellArea' in reply.exact,false);assert.deepEqual(source,before);
});
test('cached exact proof is preferred without recomputing approximate coverage',()=>{
 const source=model(),p=proof(source);rememberFlatExactProof(source,p);const stages:string[]=[],reply=computeModelSurface({result:source,side:'back',bothSides:true,shadows:false},progress=>stages.push(progress.stage));
 assert.equal(reply.status,'complete');if(reply.status==='complete'){assert.ok(reply.exact);assert.equal(reply.exact.side,'back');assert.equal(reply.exact.shadows,undefined);assert.ok(reply.opposite&&'exact' in reply.opposite);assert.equal(reply.opposite.exact.side,'front');}
 assert.ok(stages.length);assert.equal(stages.includes('coverage'),false);assert.equal(stages.includes('layers'),false);
});
test('partial certificates and wrong depth/member certificates never publish surfaces',()=>{
 const source=model(),p=proof(source);
 assert.throws(()=>completeExactSurface(source,{...p,certificate:{...p.certificate,verifiedCells:p.topology.cellCount-1}}),/完整覆盖/);
 const bad=structuredClone(p);bad.certificate.depth.fill(0);assert.throws(()=>completeExactSurface(source,bad),/真实覆盖不一致/);
});
test('an in-place selected-relation change invalidates the cached presentation',()=>{
 const source=model();rememberFlatExactProof(source,proof(source));source.layers.faceOrders![0][2]=-1;
 const reply=computeModelSurface({result:source,side:'front',shadows:false});assert.equal(reply.status,'complete');
 if(reply.status==='complete'){assert.equal(reply.exact,undefined);const overlap=reply.regions!.find(cell=>cell.faces.length===2)!;assert.equal(overlap.layers.status,'ordered');if(overlap.layers.status==='ordered')assert.equal(overlap.layers.topToBottom[0],1);}
});
