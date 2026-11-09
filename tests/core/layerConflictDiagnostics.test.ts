import {test} from 'node:test';
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import {LayerCandidateSearch,LayerPairIndex} from '../../src/core/layerCandidateSearch';
import {solveLayerContactCandidate,solveConvexLayerCandidate} from '../../src/core/convexLayerCandidate';
import {solveConcaveLayerCandidate} from '../../src/core/concaveLayerCandidate';
import {buildConcaveLayerPartition} from '../../src/core/concaveLayers';
import type {ConvexLayerConstraints,LayerCategory} from '../../src/core/convexLayerContacts';
import type {FlatFoldConflict,FlatFoldResult,FoldGraph,Point} from '../../src/core/types';
import {buildExactModelTopology,walkExactCoverage} from '../../src/app/modelExactTopology';

const empty=():ConvexLayerConstraints=>({taco_taco:[],taco_tortilla:[],tortilla_tortilla:[],transitivity:[]});
function pairs(count:number){const index=new LayerPairIndex(count);for(let a=0;a<count;a++)for(let b=a+1;b<count;b++)index.term(a,b);return index;}
function graphFrom(polygons:Point[][]):FoldGraph{
 const vertices_coords:Point[]=[],edges_vertices:[number,number][]=[],faces_vertices:number[][]=[],faces_edges:number[][]=[],edges_faces:number[][]=[];
 for(const polygon of polygons){const start=vertices_coords.length,edge=edges_vertices.length,face=faces_vertices.length;vertices_coords.push(...polygon);faces_vertices.push(polygon.map((_,i)=>start+i));faces_edges.push(polygon.map((_,i)=>edge+i));polygon.forEach((_,i)=>{edges_vertices.push([start+i,start+(i+1)%polygon.length]);edges_faces.push([face]);});}
 return {vertices_coords,edges_vertices,faces_vertices,faces_edges,edges_faces,edges_assignment:edges_vertices.map(()=>'B'),edges_foldAngle:edges_vertices.map(()=>0)};
}
function exact(graph:FoldGraph){
 const result:FlatFoldResult={geometry:{status:'ready',message:'',vertices:graph.vertices_coords,faces:graph.faces_vertices!,graph},layers:{status:'unknown',message:''},warnings:[]};
 const topology=buildExactModelTopology(result);
 return {faceCount:topology.faceCount,cellCount:topology.cellCount,walk:(visitor:Parameters<typeof walkExactCoverage>[1])=>walkExactCoverage(topology,visitor)};
}
function provesRuleFailure(conflict:FlatFoldConflict,rules:ConvexLayerConstraints){
 const kind=conflict.kind as LayerCategory;
 return rules[kind].some(row=>{
  if([...new Set(row)].sort((a,b)=>a-b).join(',')!==conflict.faces.join(','))return false;
  const key=ear.layer.constraintToFacePairs[kind](row as never).map(([a,b])=>conflict.relations?.some(r=>r.above===a&&r.below===b)?1:conflict.relations?.some(r=>r.above===b&&r.below===a)?2:0).join('');
  return ear.layer.table[kind][key]===false;
 });
}

test('forced cyclic relations retain a local contradiction before rollback',()=>{
 const index=pairs(3),rules=empty();rules.transitivity=[[0,1,2]];
 const search=new LayerCandidateSearch(index,rules);
 assert.equal(search.seed(Uint8Array.from([1,2,1])),false);
 assert.equal(search.conflicts.length,1);const conflict=search.conflicts[0];
 assert.equal(conflict.scope,'root');assert.equal(conflict.kind,'transitivity');assert.deepEqual(conflict.faces,[0,1,2]);
 assert.ok(provesRuleFailure(conflict,rules));
 assert.deepEqual(conflict.relations,[{above:0,below:1},{above:1,below:2},{above:2,below:0}]);
});

test('exhausted search only publishes bounded branch examples after its final failure',()=>{
 const constraints=empty();constraints.taco_tortilla=[[0,1,2],[1,2,0],[2,0,1]];
 const conflicts:FlatFoldConflict[]=[],polygons:Point[][]=Array.from({length:3},()=>[[0,0],[1,0],[0,1]]);
 let searchEnded=false;
 const result=solveLayerContactCandidate({count:3,overlap:[[1,2],[0,2],[0,1]],constraints,winding:[true,true,true],adjacent:{},polygons},1e-6,{
  onProgress:stage=>{if(stage==='search')searchEnded=true;},
  onConflict:conflict=>{assert.ok(searchEnded,'a branch rejection must never publish a final diagnostic while search continues');conflicts.push(conflict);},
 });
 assert.equal(result,null);assert.ok(conflicts.length>0&&conflicts.length<=4);
 assert.ok(conflicts.every(c=>c.scope==='branch'&&provesRuleFailure(c,constraints)));
 assert.ok(conflicts.every(c=>c.faces.every(f=>f>=0&&f<3)));
});

test('a successful search clears rejected branch witnesses',()=>{
 const index=pairs(6),rules:ConvexLayerConstraints={taco_taco:[[0,5,1,2],[2,4,5,0],[0,4,1,5]],taco_tortilla:[[2,5,1],[5,3,0],[5,2,1]],tortilla_tortilla:[[0,2,3,4]],transitivity:[]};
 const search=new LayerCandidateSearch(index,rules,{switchAfterBacktracks:1});assert.ok(search.seed(new Uint8Array(index.pairs.length)));
 const result=search.first(Uint32Array.from([0,1,2,3,4,5]));
 assert.ok(result);assert.ok(search.lastSearch.backtracks>0);assert.equal(search.lastSearch.strategySwitches,1);
 assert.deepEqual(search.conflicts,[],'rejected branches are discarded once a valid answer is found');
});

test('real common coverage reports the forced regional cycle while a valid candidate stays silent',()=>{
 const polygon:Point[]=[[0,0],[1e-10,0],[1e-10,1e-10],[0,1e-10]],graph=graphFrom([polygon,polygon,polygon]),coverage=exact(graph),conflicts:FlatFoldConflict[]=[];
 const fixedOrders:[number,number,number][]=[[0,1,-1],[1,2,-1],[0,2,1]];
 assert.equal(solveConvexLayerCandidate(graph,1e-6,{coverage,fixedOrders,onConflict:c=>conflicts.push(c)}),null);
 assert.equal(conflicts.length,1);assert.equal(conflicts[0].kind,'transitivity');assert.equal(conflicts[0].scope,'root');assert.deepEqual(conflicts[0].faces,[0,1,2]);
 assert.ok(provesRuleFailure(conflicts[0],{...empty(),transitivity:[[0,1,2]]}));
 assert.ok(solveConvexLayerCandidate(graph,1e-6,{coverage,fixedOrders:fixedOrders.slice(0,2),onConflict:()=>assert.fail('successful solve cannot publish conflicts')}));
});

test('opposite hard relations identify their two original faces and both demands',()=>{
 const polygon:Point[]=[[0,0],[1,0],[1,1],[0,1]],graph=graphFrom([polygon,polygon]),conflicts:FlatFoldConflict[]=[];
 assert.equal(solveConvexLayerCandidate(graph,1e-6,{fixedOrders:[[1,0,1],[1,0,-1]],onConflict:c=>conflicts.push(c)}),null);
 assert.equal(conflicts.length,1);assert.equal(conflicts[0].kind,'relative-order');assert.equal(conflicts[0].scope,'constraint');assert.deepEqual(conflicts[0].faces,[0,1]);
 assert.deepEqual(new Set(conflicts[0].relations?.map(r=>`${r.above}>${r.below}`)),new Set(['0>1','1>0']));
});

test('concave adjacency diagnostics map private triangles back to original material faces',t=>{
 const polygon:Point[]=[[0,0],[2,0],[2,1],[1,1],[1,2],[0,2]],graph=graphFrom([polygon,polygon]),coverage=exact(graph),{parent}=buildConcaveLayerPartition(graph,1e-6);
 const first=parent.map((f,i)=>f===0?i:-1).filter(i=>i>=0),second=parent.map((f,i)=>f===1?i:-1).filter(i=>i>=0);
 assert.ok(first.length>=2&&second.length>=2);
 t.mock.method(ear.layer,'solveFlatAdjacentEdges',()=>({[`${first[0]} ${second[0]}`]:1,[`${first[1]} ${second[1]}`]:2}));
 const conflicts:FlatFoldConflict[]=[];
 assert.equal(solveConcaveLayerCandidate(graph,1e-6,{coverage,onConflict:c=>conflicts.push(c)}),null);
 assert.equal(conflicts.length,1);assert.equal(conflicts[0].kind,'adjacent');assert.equal(conflicts[0].scope,'root');assert.deepEqual(conflicts[0].faces,[0,1]);
});
