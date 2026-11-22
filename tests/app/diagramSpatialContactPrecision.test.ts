import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ear from 'rabbit-ear';
import {recomputeFlatLayers} from '../../src/core/flatFold';
import {convexLayerGeometry} from '../../src/core/convexLayerGeometry';
import {constrainLayerSolutionTree,MissingLayerOverlapError,relativeLayerConstraintsMatch} from '../../src/core/relativeLayerConstraints';
import {polygonArea} from '../../src/core/geometry';
import {coveragePairMembership} from '../../src/core/regionTournament';
import {buildExactModelTopology,walkExactCoverage} from '../../src/app/modelExactTopology';
import {solveSpatialContactGroup,type SpatialContactGroupInput} from '../../src/app/diagramSpatialContactGroup';
import type {LayerNode} from '../../src/core/layerSolutions';
import type {FlatLayerPreference} from '../../src/core/types';

// Only the isolated 27-face contact group from the reported 57B model is
// retained; no project history, pictures, captions or external paths.
const fixture=():SpatialContactGroupInput=>JSON.parse(fs.readFileSync(new URL('../fixtures/spatialLayerContactPrecision1121.json',import.meta.url),'utf8'));
const membership=(input:SpatialContactGroupInput)=>{
 const topology=buildExactModelTopology(input.result);
 return coveragePairMembership({faceCount:topology.faceCount,cellCount:topology.cellCount,walk:visitor=>walkExactCoverage(topology,visitor)});
};

test('57B contact relations omitted by the tolerance tree are certified against exact material coverage',()=>{
 const input=fixture(),saved=structuredClone(input),{vertices,faces,graph}=input.result.geometry;
 const privateGeometry=convexLayerGeometry(graph!,1e-6),tree=ear.layer(privateGeometry.graph,privateGeometry.epsilon) as unknown as LayerNode;
 assert.equal(input.preferred.length,104);
 assert.throws(()=>constrainLayerSolutionTree(tree,vertices,faces,input.preferred),MissingLayerOverlapError);
 const touches=membership(input);assert.ok(input.preferred.every(({above,below})=>touches(above,below)));
 const checked=recomputeFlatLayers(input.result,{relativeConstraints:input.preferred});
 assert.equal(checked.layers.status,'solved',checked.layers.message);
 assert.ok(relativeLayerConstraintsMatch(vertices,faces,checked.layers.faceOrders!,input.preferred));
 assert.deepEqual(checked.layers.relativeConstraints,input.preferred);
 assert.deepEqual(checked.geometry,input.result.geometry);
 assert.equal(checked.layers.solutionCount,undefined);assert.equal(checked.layers.solutionIndex,undefined);
 const indexed=recomputeFlatLayers(input.result,{relativeConstraints:input.preferred,solutionIndex:1});
 assert.equal(indexed.layers.status,'unsupported');
 assert.deepEqual(input,saved);
});

test('adjusting and replaying a complete spatial contact group keeps every actual overlap',()=>{
 const input=fixture(),saved=structuredClone(input),touches=membership(input);
 const {vertices,faces}=input.result.geometry,normals=faces.map(face=>Math.sign(polygonArea(face.map(v=>vertices[v]))));
 for(const face of [0,1,3,25])for(const direction of ['up','down','top','bottom'] as const){
  const answer=solveSpatialContactGroup({...input,adjustment:{face,direction,side:'front'}});
  assert.ok(answer.ok,answer.message);if(!answer.ok)continue;
  assert.equal(answer.orders.filter(([a,b])=>touches(a,b)).length,touches.count);
  const required:FlatLayerPreference[]=answer.orders.filter(([a,b])=>touches(a,b)).map(([a,b,s])=>s*normals[b]>0?{above:a,below:b}:{above:b,below:a});
  const replay=solveSpatialContactGroup({...input,adjustment:undefined,required,preferred:[]});
  assert.ok(replay.ok,replay.message);
  if(replay.ok)assert.ok(relativeLayerConstraintsMatch(vertices,faces,replay.orders,required));
 }
 assert.deepEqual(input,saved);
});

test('exact recovery still rejects non-overlap requirements and contradictory orders',()=>{
 const input=fixture(),touches=membership(input),count=input.result.geometry.faces.length;
 let absent:FlatLayerPreference|undefined;
 for(let a=0;a<count&&!absent;a++)for(let b=a+1;b<count;b++)if(!touches(a,b)){absent={above:a,below:b};break;}
 assert.ok(absent);
 const invalid=recomputeFlatLayers(input.result,{relativeConstraints:[...input.preferred,absent]});
 assert.notEqual(invalid.layers.status,'solved');assert.match(invalid.layers.message,/没有可认证/);
 const {above,below}=input.preferred[0];
 const conflict=recomputeFlatLayers(input.result,{relativeConstraints:[...input.preferred,{above:below,below:above}]});
 assert.notEqual(conflict.layers.status,'solved');
});
