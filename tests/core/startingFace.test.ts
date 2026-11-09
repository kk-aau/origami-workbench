import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFlatFold } from '../../src/core/flatFold';
import { buildFold, distance, splitIntersections } from '../../src/core/geometry';
import { defaultAngle, type Assignment, type Doc, type FlatFoldResult, type Point } from '../../src/core/types';

function sample(assignment: Assignment = 'M'): Doc {
  const corners: Point[] = [[0,0],[100,0],[100,100],[0,100]];
  const d: Doc = { name: '起始面', paper: { width:100, height:100 }, segments: [
    ...corners.map((a,i) => ({id:`b${i}`,a,b:corners[(i+1)%4],assignment:'B' as const,angle:0})),
    {id:'crease',a:[50,0],b:[50,100],assignment,angle:defaultAngle(assignment)},
  ] };
  d.segments = splitIntersections(d).segments;
  return d;
}

test('each selected starting face remains at its original coordinates; the other half reflects', () => {
  const d = sample(), before = structuredClone(d), graph = buildFold(d).graph;
  const results = [0,1].map(startingFace => computeFlatFold(d, undefined, {startingFace}));
  for (const [root,result] of results.entries()) {
    assert.equal(result.geometry.status, 'ready');
    assert.equal(result.geometry.startingFace, root);
    assert.equal(result.layers.status, 'solved', result.layers.message);
    for (const v of graph.faces_vertices![root]) assert.ok(distance(result.geometry.vertices[v],graph.vertices_coords[v]) < 1e-8);
    for (const v of graph.faces_vertices![1-root]) {
      const p = graph.vertices_coords[v];
      assert.ok(distance(result.geometry.vertices[v],[100-p[0],p[1]]) < 1e-8);
    }
  }
  assert.notDeepEqual(results[0].geometry.vertices,results[1].geometry.vertices);
  assert.deepEqual(d,before);
});

test('omitting the starting face retains the previous face-zero default', () => {
  const d = sample();
  assert.deepEqual(computeFlatFold(d),computeFlatFold(d,undefined,{startingFace:0}));
});

test('invalid or stale starting indices reject rather than silently choosing a different face', () => {
  for (const startingFace of [-1,2,0.5,NaN,Infinity]) {
    let published = false;
    const result = computeFlatFold(sample(),()=>{published=true;},{startingFace});
    assert.equal(result.geometry.status,'invalid');
    assert.match(result.geometry.message,/起始面/);
    assert.equal(published,false);
  }
});

test('geometry progress carries the selected root independently of final layer results', () => {
  let progress: FlatFoldResult | undefined;
  const result = computeFlatFold(sample(),r=>{progress=r;},{startingFace:1});
  assert.equal(progress?.geometry.startingFace,1);
  assert.equal(progress?.layers.status,'unknown');
  assert.equal(result.layers.status,'solved');
  assert.notEqual(result,progress);
});

test('flat and unassigned edges keep their own meaning when changing the starting face', () => {
  const flat = sample('F'), graph = buildFold(flat).graph;
  const result = computeFlatFold(flat,undefined,{startingFace:1});
  assert.equal(result.layers.status,'solved');
  assert.deepEqual(result.geometry.vertices,graph.vertices_coords);
  const unassigned = computeFlatFold(sample('U'),undefined,{startingFace:1});
  assert.equal(unassigned.geometry.status,'ready');
  assert.equal(unassigned.geometry.startingFace,1);
  assert.equal(unassigned.layers.status,'unknown');
});

test('three-face chain propagates from either end or the middle without changing intrinsic distances', () => {
  const d = sample();
  d.segments = d.segments.filter(s=>s.assignment==='B');
  d.segments.push({id:'m',a:[25,0],b:[25,100],assignment:'M',angle:-180},
    {id:'v',a:[75,0],b:[75,100],assignment:'V',angle:180});
  d.segments = splitIntersections(d).segments;
  const graph = buildFold(d).graph;
  assert.equal(graph.faces_vertices?.length,3);
  const results = [0,1,2].map(startingFace=>computeFlatFold(d,undefined,{startingFace}));
  for (const [root,result] of results.entries()) {
    assert.equal(result.layers.status,'solved',result.layers.message);
    for (const v of graph.faces_vertices![root]) assert.ok(distance(result.geometry.vertices[v],graph.vertices_coords[v])<1e-8);
    for (let i=0;i<graph.vertices_coords.length;i++) for (let j=0;j<i;j++) {
      assert.ok(Math.abs(distance(result.geometry.vertices[i],result.geometry.vertices[j])-
        distance(results[0].geometry.vertices[i],results[0].geometry.vertices[j]))<1e-8);
    }
  }
});
