import test from 'node:test';
import assert from 'node:assert/strict';
import type {FoldGraph} from '../../src/core/types';
import type {RigidFoldPoint3,RigidFoldTransform3D} from '../../src/core/rigidFoldGeometry';
import {exactMaterialSides,sharedFoldPositions} from '../../src/app/diagramSharedFoldPositions';

const identity:RigidFoldTransform3D={rotation:[1,0,0,0,1,0,0,0,1],translation:[0,0,0]};
test('fully folded banks agree on their mirrored corners and subdivided edge without welding a cut',()=>{
 const graph:FoldGraph={vertices_coords:[[0,0],[0,4],[-2,0],[-2,4],[2,0],[2,4],[2,2],[2,0],[2,4],[3,2]],
  edges_vertices:[[0,1]],edges_assignment:['V'],edges_foldAngle:[180],edges_faces:[[0,1]],faces_vertices:[[0,1,3,2],[0,4,6,5,1],[7,8,9]]};
 const gap=5e-11;
 const world:RigidFoldPoint3[]=graph.vertices_coords.map(([x,y],i)=>[-Math.abs(x)+(i===6?1e-12:0),y,i>=7?gap:0]);
 const before=structuredClone(world),mirror={rotation:[-1,0,0,0,1,0,0,0,-1],translation:[0,0,0] as RigidFoldPoint3};
 const result=sharedFoldPositions(graph,world,[identity,mirror,mirror],[180]);
 assert.deepEqual(result[2],result[4]);assert.deepEqual(result[3],result[5]);
 assert.deepEqual(result[6],[-2,2,0]);assert.equal(result[7][2],gap);
 assert.deepEqual(world,before);
 graph.edges_foldAngle=[179.999999];
 assert.deepEqual(sharedFoldPositions(graph,world,[identity,mirror,mirror],[179.999999]),world);
});

test('world half-space certificate requires a planar witness and cannot authorize a crossing',()=>{
 const graph:FoldGraph={vertices_coords:[[0,0],[2,0],[2,2],[0,2],[0,0],[1,0],[0,1]],
  edges_vertices:[],edges_assignment:[],edges_foldAngle:[],faces_vertices:[[0,1,2,3],[4,5,6]]};
 const world:RigidFoldPoint3[]=graph.vertices_coords.map(([x,y],v)=>[x,y,v>=4?2**-50:0]);
 assert.equal(exactMaterialSides(graph,world)(0,1),1);
 world[5][2]*=-1;
 assert.equal(exactMaterialSides(graph,world)(0,1),0);
 world[5][2]*=-1;world[3][2]=2**-52;
 assert.equal(exactMaterialSides(graph,world)(0,1),0);
});
