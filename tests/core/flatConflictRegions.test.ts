import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flatConflictOverlapRegions,flatConflictSourceOverlapRegions} from '../../src/core/flatConflictRegions';
import {makeLayerConflict} from '../../src/core/flatConflictDiagnostics';
import {polygonArea} from '../../src/core/geometry';
import type {FlatFoldResult,Point} from '../../src/core/types';

function result(coords:Point[],faces:number[][],holes:number[][][]=[]):FlatFoldResult{
 return {geometry:{status:'ready',message:'',vertices:coords,faces,graph:{faces_holes:holes}},layers:{status:'no-solution',message:'冲突'}} as FlatFoldResult;
}
const totalArea=(parts:Point[][])=>parts.reduce((sum,part)=>sum+Math.abs(polygonArea(part)),0);

test('a crossing conflict highlights only the shared finite area of all implicated faces',()=>{
 const coords:Point[]=[[0,0],[4,0],[4,4],[0,4],[2,1],[6,1],[6,3],[2,3],[3,0],[5,0],[5,2],[3,2]];
 const model=result(coords,[[0,1,2,3],[4,5,6,7],[8,9,10,11]]);
 const conflict=makeLayerConflict('taco_tortilla','root',[0,1,2]);
 assert.ok(Math.abs(totalArea(flatConflictOverlapRegions(conflict,model,coords))-1)<1e-8);
 assert.deepEqual(flatConflictOverlapRegions(makeLayerConflict('maekawa','condition',[0,1,2]),model,coords),[]);
 const detached:Point[]=coords.map(point=>[...point]);detached[8]=[7,0];detached[9]=[9,0];detached[10]=[9,2];detached[11]=[7,2];
 assert.deepEqual(flatConflictOverlapRegions(conflict,result(detached,model.geometry.faces),detached),[]);
});

test('a paper hole remains empty in the stronger crossing highlight',()=>{
 const coords:Point[]=[[0,0],[4,0],[4,4],[0,4],[1,1],[3,1],[3,3],[1,3]];
 const model=result(coords,[[0,1,2,3],[0,1,2,3],[0,1,2,3]],[[[4,5,6,7]],[],[]]);
 const regions=flatConflictOverlapRegions(makeLayerConflict('taco_tortilla','root',[0,1,2]),model,coords);
 assert.ok(Math.abs(totalArea(regions)-12)<1e-8);
});

test('folded overlap maps back onto each separate source CP face',()=>{
 const folded:Point[]=[[0,0],[2,0],[2,2],[0,2],[0,0],[2,0],[2,2],[0,2],[0,0],[2,0],[2,2],[0,2]];
 const source:Point[]=folded.map((p,i)=>[p[0]+Math.floor(i/4)*4,p[1]]);
 const model=result(folded,[[0,1,2,3],[4,5,6,7],[8,9,10,11]]);
 const conflict=makeLayerConflict('taco_tortilla','root',[0,1,2]);
 assert.deepEqual(flatConflictOverlapRegions(conflict,model,source),[],'separate CP faces have no direct common intersection');
 const regions=flatConflictSourceOverlapRegions(conflict,model,source);
 assert.equal(regions.length,6,'each of the two folded triangles maps to all three source faces');
 for(const face of [0,1,2]){
  const parts=regions.filter(region=>region.face===face).map(region=>region.polygon);
  assert.ok(Math.abs(totalArea(parts)-4)<1e-8);
  assert.ok(parts.flat().every(([x,y])=>x>=face*4-1e-8&&x<=face*4+2+1e-8&&y>=-1e-8&&y<=2+1e-8));
 }
 const deformed=source.map(point=>[...point] as Point);deformed[7]=[6,3];
 assert.ok(flatConflictSourceOverlapRegions(conflict,model,deformed).every(region=>region.face!==1),'non-affine face mapping is not guessed');
});
