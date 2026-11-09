import test from 'node:test';
import assert from 'node:assert/strict';
import {paperPreviewPolygon,previewEnvelopeCoordinates,type PaperPreviewRecipe} from '../../src/app/tessellationPaperPreview';
import type {TessGraph,XY} from '../../src/app/tessellation';

const recipe:PaperPreviewRecipe={originalVertices:6,outlineVertices:4,shape:'square',aspect:1,sides:6,margin:.1};
const source:XY[]=[[-1,-1],[0,-1],[1,-1],[1,1],[0,1],[-1,1]];
const fold:TessGraph={
  vertices_coords:[...source,[-1.2,-1.2],[1.2,-1.2],[1.2,1.2],[-1.2,1.2],[0,-1.2],[0,1.2]],
  edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4],[1,10],[4,11],[6,10],[10,7],[7,8],[8,11],[11,9],[9,6]],
  edges_assignment:['F','F','F','F','F','F','M','M','M','B','B','B','B','B','B'],
  faces_vertices:[],
};

test('paper preview moves the sheet and extended crease endpoints together',()=>{
  const moved:XY[]=source.map(([x,y])=>[x*2,y*1.5]);
  const outline=paperPreviewPolygon(moved,recipe)!;
  assert.deepEqual(outline,[[-2.4,-2.4],[2.4,-2.4],[2.4,2.4],[-2.4,2.4]]);
  const result=previewEnvelopeCoordinates(fold,moved,recipe)!;
  assert.ok(result);
  assert.deepEqual(result.slice(6,10),outline);
  assert.deepEqual(result[10],[0,-2.4]);
  assert.deepEqual(result[11],[0,2.4]);
});

test('paper preview refuses a ray that changes paper side',()=>{
  const rotated:XY[]=source.map(([x,y])=>[-y,x]);
  assert.equal(previewEnvelopeCoordinates(fold,rotated,recipe),null);
});
