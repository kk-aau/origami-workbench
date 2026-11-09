import test from 'node:test';
import assert from 'node:assert/strict';
import {unitCyclicPolygonVertices} from '../../src/app/unitCyclicPolygon';

const close=(got:number[][],expected:number[][])=>{
  assert.equal(got.length,expected.length);
  got.forEach((point,i)=>point.forEach((value,j)=>
    assert.ok(Math.abs(value-expected[i][j])<1e-9,`${i},${j}: ${value}`)));
};

test('general cyclic mother polygons agree with independently derived source numerics',()=>{
  close(unitCyclicPolygonVertices([50,60,0]),
    [[0,0],[1,0],[.5923962654520477,.7059903775918712]]);
  close(unitCyclicPolygonVertices([110,125,112.5,102.5,0]),
    [[0,0],[1,0],[1.8053194064444633,1.150115305104403],[1,2.414213562373095],
      [-.6589355040748024,1.8104104183224687]]);
  close(unitCyclicPolygonVertices([130,120,112.5,117.5,0,0],1,2),
    [[0,0],[1,0],[1.5000000000000344,.8660254037844981],
      [.7588190451025489,1.8319512300735745],[-.07357643635108191,1.6851774480734871],
      [-.4396926207859475,.5240052604588167]]);
  const octagon=unitCyclicPolygonVertices(Array(8).fill(135));
  close(octagon.slice(2,5),[[1.7071067811865475,.7071067811865475],
    [1.7071067811865475,1.7071067811865475],[1,2.414213562373095]]);
});

test('even cyclic mother polygons reject unselected or degenerate branches',()=>{
  for(const args of [
    [[90,90,0,0],1,3],
    [[75,85,0,0],0,2],
    [[130,120,112.5,117.5,0,0],1,7],
    [[50,60,0],Number.POSITIVE_INFINITY,2],
    [[50,60,0],1,99],
    [[170,170,0],1,2],
  ] as [number[],number,number][])assert.throws(()=>unitCyclicPolygonVertices(...args));
});
