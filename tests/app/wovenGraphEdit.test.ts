import test from 'node:test';
import assert from 'node:assert/strict';
import {editWovenGraphDraft,readWovenGraphDraft} from '../../src/app/wovenGraphEdit';
import {readWovenGraph,wovenGraphPreset} from '../../src/app/wovenGraph';

test('visual mother moves preserve all indices, double precision and untouched geometry without snapping',()=>{
 const g=wovenGraphPreset(),before=structuredClone(g),point:[number,number]=[.000000000001234567,.002345678901234567],r=editWovenGraphDraft(g,{kind:'move',vertex:0,point});
 assert.deepEqual(g,before);assert.deepEqual(r.graph.vertices[0],point);assert.deepEqual(r.graph.vertices.slice(1),g.vertices.slice(1));assert.deepEqual(r.graph.edges,g.edges);assert.equal(r.vertex,0);
});
test('incomplete drafts can be drawn from empty but cannot masquerade as valid submitted graphs',()=>{
 let g={vertices:[] as [number,number][],edges:[] as [number,number][]};assert.ok(readWovenGraphDraft(g));assert.equal(readWovenGraph(g),null);
 for(const point of [[0,0],[1,0],[0,1]] as [number,number][])g=editWovenGraphDraft(g,{kind:'add-point',point}).graph;
 assert.equal(readWovenGraph(g),null);for(const [from,to] of [[0,1],[1,2],[2,0]])g=editWovenGraphDraft(g,{kind:'add-edge',from,to}).graph;assert.deepEqual(readWovenGraph(g),g);
});
test('explicit point deletion removes incident edges and remaps subsequent references in original order',()=>{
 const g=wovenGraphPreset(),before=structuredClone(g),r=editWovenGraphDraft(g,{kind:'delete-point',vertex:2});
 assert.deepEqual(r.graph.vertices,[g.vertices[0],g.vertices[1],g.vertices[3],g.vertices[4]]);assert.deepEqual(r.graph.edges,[[2,3],[3,1],[0,1],[0,2],[0,3]]);assert.deepEqual(g,before);
});
test('explicit edge subdivision preserves geometric coverage, untouched IDs and source orientation',()=>{
 const g=wovenGraphPreset(),r=editWovenGraphDraft(g,{kind:'split-edge',edge:0,fraction:.25});assert.deepEqual(r.graph.vertices.slice(0,5),g.vertices);assert.deepEqual(r.graph.vertices[5],[.75,.25]);assert.deepEqual(r.graph.edges[0],[1,5]);assert.deepEqual(r.graph.edges.slice(1,8),g.edges.slice(1));assert.deepEqual(r.graph.edges[8],[5,2]);
});
test('duplicate/zero edges, invalid endpoints, fractions and nonfinite coordinates fail atomically',()=>{
 const g=wovenGraphPreset(),before=structuredClone(g);
 for(const c of [{kind:'add-edge',from:2,to:1},{kind:'add-edge',from:1,to:1},{kind:'delete-point',vertex:999},{kind:'delete-edge',edge:-1},{kind:'move',vertex:0,point:[Infinity,0]},{kind:'move',vertex:0,point:[1001,0]},{kind:'split-edge',edge:0,fraction:0},{kind:'split-edge',edge:0,fraction:NaN}] as Parameters<typeof editWovenGraphDraft>[1][])assert.throws(()=>editWovenGraphDraft(g,c));assert.deepEqual(g,before);
 const sparse=[0,,2];assert.equal(readWovenGraphDraft({vertices:[sparse],edges:[]}),null);
});
test('native line input and ordinary graph limits reject excess additions without partial mutation',()=>{
 const g=wovenGraphPreset(),before=structuredClone(g);assert.throws(()=>editWovenGraphDraft(g,{kind:'add-edge',from:1,to:3},8),/最多8/);assert.throws(()=>editWovenGraphDraft(g,{kind:'split-edge',edge:0,fraction:.5},8),/容量/);assert.deepEqual(g,before);
});
