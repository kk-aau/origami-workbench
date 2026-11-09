import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelPlanarize} from '../../src/app/modelPlanarize';
import type {Point} from '../../src/core/types';

const degreeAt=(graph:ReturnType<typeof modelPlanarize>,point:Point)=>{const id=graph.vertices_coords.findIndex(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<1e-9);assert.ok(id>=0);return graph.edges_vertices.filter(edge=>edge.includes(id)).length;};
test('display arrangement retains non-collinear origin rays and their translated copies',()=>{
 for(const offset of [[0,0],[10,10],[100000,-100000]]as Point[]){const vertices:Point[]=[[0,0],[100,0],[100,1]].map(([x,y])=>[x+offset[0],y+offset[1]]),edges:[number,number][]=[[0,1],[0,2]],before=structuredClone({vertices,edges}),graph=modelPlanarize(vertices,edges,1e-8);assert.equal(graph.edges_vertices.length,2);assert.equal(graph.sourceSegments.length,2);assert.deepEqual({vertices,edges},before);}
});
test('near-end and nearby parameter crossings are cut in world distance units',()=>{
 const vertices:Point[]=[[0,0],[100,0],[.00005,-1],[.00005,1],[.0001,-1],[.0001,1],[99.99995,-1],[99.99995,1]],graph=modelPlanarize(vertices,[[0,1],[2,3],[4,5],[6,7]],1e-8);
 for(const x of [.00005,.0001,99.99995])assert.equal(degreeAt(graph,[x,0]),4);
 assert.equal(degreeAt(graph,[100,0]),1);for(const x of [.00005,.0001])assert.ok(graph.breaks.some(value=>Math.abs(value-x)<1e-12));
});
test('collinear overlaps, reversed duplicates, T joins and shared crossings keep one boundary edge',()=>{
 const overlap=modelPlanarize([[0,0],[10,0],[5,0],[15,0],[5,10]],[[0,1],[2,3],[1,0],[2,4]],1e-8);
 assert.equal(overlap.edges_vertices.length,4);assert.equal(degreeAt(overlap,[5,0]),3);
 const crossing=modelPlanarize([[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1]],[[0,1],[2,3],[4,5]],1e-8);assert.equal(degreeAt(crossing,[0,0]),6);assert.equal(crossing.vertices_coords.filter(([x,y])=>x===0&&y===0).length,1);
});
test('one stable display vertex mapping is shared by full and visible-subset arrangements',()=>{
 const epsilon=1e-8,angle=1e-9,square:Point[]=[[0,0],[10,0],[10,10],[0,10]],vertices:Point[]=[...square,...square.map(([x,y])=>[x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle)] as Point)],before=structuredClone(vertices);
 const first:[number,number][]=[[0,1],[1,2],[2,3],[3,0]],second:[number,number][]=[[4,5],[5,6],[6,7],[7,4]];
 const full=modelPlanarize(vertices,[...first,...second],epsilon),subset=modelPlanarize(vertices,second,epsilon);
 assert.deepEqual(full.sourceVertices,subset.sourceVertices);assert.deepEqual(full.sourceVertices.slice(4),square);
 assert.equal(full.sourceSegments.length,4);assert.equal(full.maximalFacesSafe,true);assert.deepEqual(vertices,before);
});

test('overlapping long and short boundaries share endpoint spans and retain every source owner',()=>{
 const vertices:Point[]=[[0,0],[100,100],[25,25+1e-12],[75,75+1e-12]],before=structuredClone(vertices),edges:[number,number][]=[[0,1],[3,2]],arrangement=modelPlanarize(vertices,edges,1e-8);
 assert.equal(arrangement.sourceSegments.length,3);
 const shared=arrangement.sourceSegmentOrigins.findIndex(origins=>origins.length===2);
 assert.ok(shared>=0);assert.deepEqual(arrangement.sourceSegmentOrigins[shared],[0,1]);
 assert.deepEqual(arrangement.sourceSegments[shared],[vertices[2],vertices[3]]);
 assert.deepEqual(arrangement.sourceSegmentPoints[0],[vertices[0],vertices[2],vertices[3],vertices[1]]);
 assert.equal(arrangement.maximalFacesSafe,false);
 assert.deepEqual(arrangement.sourceVertices,modelPlanarize(vertices,[[3,2]],1e-8).sourceVertices);
 assert.deepEqual(vertices,before);
});

test('a rounded non-collinear T contact shares its real endpoint with the long source edge',()=>{
 const vertices:Point[]=[[0,0],[100,70],[30,21+1e-12],[45,80]],original=structuredClone(vertices),graph=modelPlanarize(vertices,[[0,1],[2,3]],1e-8);
 assert.deepEqual(graph.sourceSegmentPoints[0],[vertices[0],vertices[2],vertices[1]]);
 assert.deepEqual(graph.sourceSegmentPoints[1],[vertices[2],vertices[3]]);
 assert.equal(graph.sourceSegments.length,3);assert.equal(degreeAt(graph,vertices[2]),3);
 assert.equal(graph.maximalFacesSafe,false,'coverage must use the same atomic endpoint paths');
 assert.deepEqual(vertices,original);assert.deepEqual(graph.sourceVertices,original);
 // A resolvable gap must not be pulled onto that edge.
 const separated=structuredClone(vertices);separated[2][1]+=1e-5;
 assert.equal(modelPlanarize(separated,[[0,1],[2,3]],1e-8).sourceSegmentPoints[0].length,2);
});
