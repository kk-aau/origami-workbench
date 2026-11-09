import assert from 'node:assert/strict';
import test from 'node:test';
import type {FlatFoldResult,FoldGraph,Point} from '../../src/core/types';
import {polygonArea} from '../../src/core/geometry';
import {buildExactModelTopology,walkExactCoverage} from '../../src/app/modelExactTopology';
import {modelExactSurface,type ExactModelSurface} from '../../src/app/modelExactSurface';
import {exactVisibleTileRegions,exactVisibleFaceLabels} from '../../src/app/exactVisibleTileRegions';
import {mapVisibleFlatTileDecorations,type FlatTileDecorationMapping,type FlatTileDecorationSource} from '../../src/app/flatTileDecorations';
import {defaultTileDecorations} from '../../src/app/tileDecorations';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';

const rect=(x:number,y:number,w:number,h:number):Point[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
function model(polygons:Point[][]):FlatFoldResult {
 const vertices:Point[]=[],faces:number[][]=[];
 for(const polygon of polygons){const start=vertices.length;vertices.push(...polygon);faces.push(polygon.map((_,i)=>start+i));}
 const graph:FoldGraph={vertices_coords:vertices,faces_vertices:faces,edges_vertices:[],edges_assignment:[]};
 const faceOrders:[number,number,number][]=[];for(let a=0;a<faces.length;a++)for(let b=a+1;b<faces.length;b++)faceOrders.push([a,b,1]);
 return {geometry:{status:'ready',message:'',vertices,faces,graph},layers:{status:'solved',message:'',faceOrders},warnings:[]};
}
function surface(result:FlatFoldResult,side:'front'|'back'='front'){
 const topology=buildExactModelTopology(result),front=new Int32Array(topology.cellCount).fill(-2),back=front.slice();
 walkExactCoverage(topology,{onCell(c,faces){front[c]=faces.size?Math.min(...faces):-1;back[c]=faces.size?Math.max(...faces):-1;}});
 return modelExactSurface(topology,{front,back},side);
}
function areaByFace(mapping:FlatTileDecorationMapping){
 const areas=new Map<number,number>();for(const piece of mapping.regions)areas.set(piece.topFace,(areas.get(piece.topFace)??0)+piece.area);return areas;
}
const inTriangle=(point:Point,triangle:Point[])=>triangle.every((a,i)=>{const b=triangle[(i+1)%3];return (b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0])>=0;});

test('ordinary, holed and disconnected visible regions keep the legacy folded-tile mapping',()=>{
 for(const polygons of [[rect(0,0,10,10)],[rect(0,0,10,10),rect(2,2,6,6)],[rect(0,0,10,10),rect(4,0,2,10)]]){
  const result=model(polygons),graph=result.geometry.graph!,options=defaultTileDecorations([[0,1,2,3]]);
  const source:FlatTileDecorationSource={tiles:[{points:rect(0,0,10,10),sourceIndex:0,decoration:options.tiles[0]}],options,faceTileInstance:polygons.map(()=>0)};
  for(const side of ['front','back'] as const){
   const exact=surface(result,side),before=structuredClone(exact),pieces=exactVisibleTileRegions(exact);
   assert.ok(pieces.length);assert.ok(pieces.every(p=>p.polygon.length===3&&!('faces' in p)&&!('layers' in p)));
   const actual=mapVisibleFlatTileDecorations(source,graph,result,pieces),expected=mapVisibleFlatTileDecorations(source,graph,result,modelRegionLayers(result,modelOverlapRegions(result),side));
   assert.ok(actual);assert.ok(expected);assert.deepEqual(areaByFace(actual),areaByFace(expected));
   assert.deepEqual(actual.cornerPositions,expected.cornerPositions);assert.deepEqual(actual.boundaryEdges,expected.boundaryEdges);
   assert.deepEqual(exact,before,'decoration conversion never mutates the certified surface');
   if(side==='back'&&polygons.length>1){
    assert.ok(pieces.some(p=>p.topFace===1&&inTriangle([5,5],p.polygon)));
    assert.equal(pieces.some(p=>p.topFace===0&&inTriangle([5,5],p.polygon)),false,'underlying face is never decorated through its hole/occluder');
   }
  }
 }
});

test('weak touching rings and doubled bridges preserve every visible island and hole',()=>{
 const annulus:Point[]=[[0,0],[5,0],[5,5],[0,5],[0,0],[1,1],[1,4],[4,4],[4,1],[1,1],[0,0]];
 const disconnected:Point[]=[[0,0],[2,0],[2,2],[0,2],[0,0],[4,0],[6,0],[6,2],[4,2],[4,0],[0,0]];
 const touching:Point[]=[[0,0],[2,0],[2,2],[4,2],[4,4],[2,4],[2,2],[0,2]];
 for(const [ring,expected] of [[annulus,16],[disconnected,8],[touching,8]] as const){
  const pieces=exactVisibleTileRegions(surface(model([ring])));assert.ok(pieces.length);
  assert.equal(pieces.reduce((sum,p)=>sum+polygonArea(p.polygon),0),expected);
  if(ring===annulus)assert.equal(pieces.some(p=>inTriangle([2.5,2.5],p.polygon)),false);
 }
});

test('collinear subdivisions simplify only decoration; malformed or collapsed displays disable mapping entirely',()=>{
 const good=surface(model([rect(0,0,10,10),rect(2,0,6,10)]),'front');
 assert.ok(good.ringVertices.length>4);assert.equal(exactVisibleTileRegions(good).reduce((sum,p)=>sum+polygonArea(p.polygon),0),100);
 const invalid=structuredClone(good);invalid.ringVertices[0]=invalid.vertexXY.length;
 assert.deepEqual(exactVisibleTileRegions(invalid),[]);
 const collapsed=surface(model([rect(0,0,10,10)]));collapsed.vertexXY[2]=collapsed.vertexXY[0];collapsed.vertexXY[3]=collapsed.vertexXY[1];
 assert.deepEqual(exactVisibleTileRegions(collapsed),[]);
 const nonfinite=structuredClone(good);nonfinite.vertexXY[0]=Infinity;assert.deepEqual(exactVisibleTileRegions(nonfinite),[]);
 const noRings={...good,faceRingOffsets:new Uint32Array([0,0])} as ExactModelSurface;assert.deepEqual(exactVisibleTileRegions(noRings),[]);
});

test('explicit visible fragments cannot bypass legacy unresolved layers or invalid face validation',()=>{
 const result=model([rect(0,0,10,10)]),graph=result.geometry.graph!,options=defaultTileDecorations([[0,1,2,3]]),polygon=rect(0,0,10,10);
 const source:FlatTileDecorationSource={tiles:[{points:polygon,sourceIndex:0,decoration:options.tiles[0]}],options,faceTileInstance:[0]};
 assert.ok(mapVisibleFlatTileDecorations(source,graph,result,[{polygon,topFace:0}]));
 for(const topFace of [-1,1,NaN,.5])assert.equal(mapVisibleFlatTileDecorations(source,graph,result,[{polygon,topFace}]),null);
 const unresolved={polygon,faces:[0],area:100,topFace:0,layers:{status:'unconfirmed' as const,message:'pending'}};
 assert.equal(mapVisibleFlatTileDecorations(source,graph,result,[unresolved]),null);
 assert.equal(mapVisibleFlatTileDecorations(source,graph,result,[]),null);
});

test('visible face labels avoid holes and hidden faces, while an unrepresentable face does not hide other labels',()=>{
 const result=model([rect(0,0,100,100),rect(20,20,60,60)]),back=surface(result,'back'),pieces=exactVisibleTileRegions(back),labels=exactVisibleFaceLabels(back);
 assert.deepEqual(labels.map(l=>l.face),[0,1]);
 for(const label of labels)assert.ok(pieces.some(p=>p.topFace===label.face&&inTriangle(label.point,p.polygon)));
 const base=labels.find(l=>l.face===0)!.point;
 assert.ok(base[0]<20||base[0]>80||base[1]<20||base[1]>80,'base-face centroid is occluded; visible anchor must be outside it');
 assert.deepEqual(exactVisibleFaceLabels(surface(result,'front')).map(l=>l.face),[0],'fully hidden faces have no label');
 const partial=surface(model([rect(0,0,10,10),rect(20,0,10,10)]));
 for(let i=partial.ringVertexOffsets[0];i<partial.ringVertexOffsets[1];i++)partial.vertexXY[partial.ringVertices[i]*2+1]=0;
 assert.deepEqual(exactVisibleTileRegions(partial),[],'decoration remains all-or-nothing');
 assert.deepEqual(exactVisibleFaceLabels(partial).map(l=>l.face),[1],'optional labels do not guess anchors on the collapsed face');
});
