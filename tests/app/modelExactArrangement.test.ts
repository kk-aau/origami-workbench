import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {modelExactArrangement} from '../../src/app/modelExactArrangement';

const rect=(x:number,y:number,w:number,h:number):Point[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
function model(polygons:Point[][],holes:Point[][][]=[]):FlatFoldResult{
 const vertices:Point[]=[],faces:number[][]=[],faces_holes:number[][][]=[];
 const append=(p:Point[])=>{const offset=vertices.length;vertices.push(...p);return p.map((_,i)=>offset+i);};
 polygons.forEach((p,f)=>{faces.push(append(p));faces_holes.push((holes[f]??[]).map(append));});
 return {geometry:{status:'ready',message:'',vertices,faces,graph:{vertices_coords:vertices,faces_vertices:faces,faces_holes}},layers:{status:'unknown',message:''},warnings:[]};
}
const area=(analysis:ReturnType<typeof modelExactArrangement>,face:number)=>analysis.cells.filter(c=>c.faces.includes(face)).reduce((s,c)=>s+c.area,0);

test('exact arrangement shares overlapping rectangle cells and left/right adjacency',()=>{
 const source=model([rect(0,0,2,2),rect(1,0,2,2)]),before=structuredClone(source),a=modelExactArrangement(source);
 assert.equal(a.cells.length,3);assert.equal(area(a,0),4);assert.equal(area(a,1),4);
 assert.deepEqual(a.cells.map(c=>c.faces).sort(),[[0],[0,1],[1]].sort());
 assert.equal(a.edges.length,10);assert.ok(a.edges.every(e=>e.leftCell!==e.rightCell));assert.deepEqual(source,before);
});
test('coincident reversed boundaries retain all source owners without duplicate cells',()=>{
 const a=modelExactArrangement(model([rect(0,0,2,2),rect(0,0,2,2).reverse()]));
 assert.equal(a.cells.length,1);assert.deepEqual(a.cells[0].faces,[0,1]);assert.equal(a.edges.length,4);assert.ok(a.edges.every(e=>e.ringOwners.length===2));
});
test('positive sub-tolerance faces and true tiny overlap are retained',()=>{
 const a=modelExactArrangement(model([rect(0,0,5e-12,10),rect(3e-12,2,8e-12,6)]));
 assert.ok(Math.abs(area(a,0)-5e-11)<1e-25);assert.ok(Math.abs(area(a,1)-4.8e-11)<1e-25);
 assert.ok(Math.abs(a.cells.filter(c=>c.faces.length===2).reduce((s,c)=>s+c.area,0)-1.2e-11)<1e-25);
});
test('disconnected nested components retain holes and an island, using union of hole rings',()=>{
 const a=modelExactArrangement(model([rect(0,0,10,10),rect(4,4,1,1)],[[rect(2,2,4,4),rect(3,3,4,4)]]));
 assert.equal(area(a,0),77);assert.equal(area(a,1),1);assert.ok(a.cells.some(c=>c.holes.length));assert.ok(a.cells.some(c=>c.faces.length===0));
});
test('multiple disjoint components share only the exterior cell',()=>{
 const a=modelExactArrangement(model([rect(0,0,2,2),rect(10,10,2,2)]));
 assert.equal(a.cells.length,2);assert.equal(a.diagnostics.components,2);assert.ok(a.edges.every(e=>e.leftCell===-1||e.rightCell===-1));
});
test('three proper crossings at one rational point have one identity',()=>{
 const triangles:Point[][]=[[[0,0],[3,3],[0,3]],[[0,2],[3,1],[3,3]],[[1,0],[2,3],[0,3]]];
 const a=modelExactArrangement(model(triangles));
 const keys=a.exactVertices.map(v=>v.join(','));assert.equal(new Set(keys).size,keys.length);
 const shared=a.vertices.flatMap(([x,y],id)=>x===1.5&&y===1.5?[id]:[]);assert.equal(shared.length,1);assert.equal(a.edges.filter(e=>e.a===shared[0]||e.b===shared[0]).length,6);
 triangles.forEach((_,f)=>assert.ok(area(a,f)>0));
});
test('multiple lines crossing at an existing origin share its canonical exact identity',()=>{
 const a=modelExactArrangement(model([[[0,0],[2,0],[0,2]],[[-2,-2],[2,2],[-2,2]],[[-3,3],[3,-3],[3,3]]]));
 assert.equal(a.exactVertices.filter(([x,y])=>x===0n&&y===0n).length,1);
 assert.ok(a.exactVertices.filter(([x,y])=>x===0n&&y===0n).every(([, ,w])=>w===1n));
 assert.equal(area(a,0),2);assert.equal(area(a,1),8);assert.equal(area(a,2),18);
});
test('weak ring retracing a bridge does not create phantom paper',()=>{
 // An exterior square with a bridge to an inner clockwise ring: an annulus.
 const ring:Point[]=[[0,0],[5,0],[5,5],[0,5],[0,0],[1,1],[1,4],[4,4],[4,1],[1,1],[0,0]];
 const a=modelExactArrangement(model([ring]));assert.equal(area(a,0),16);assert.ok(a.diagnostics.neutralSegments>0);
});
test('zero-area input rings fail explicitly',()=>{
 assert.throws(()=>modelExactArrangement(model([[[0,0],[1,0],[2,0]]])),/零面积/);
});
test('underflow in floating products does not erase positive exact geometry',()=>{
 const side=2**-600,a=modelExactArrangement(model([rect(0,0,side,side)]));
 assert.equal(a.cells.length,1);assert.deepEqual(a.cells[0].faces,[0]);assert.equal(a.cells[0].positiveArea,true);assert.equal(a.cells[0].area,0);assert.equal(a.edges.length,4);
});
test('almost-filling holes use exact area when outer and inner areas cancel',()=>{
 const t=2**-52,a=modelExactArrangement(model([rect(0,0,1,1)],[[rect(t,t,1-2*t,1-2*t)]]));
 assert.equal(area(a,0),4*t-4*t*t);assert.ok(a.cells.every(c=>c.positiveArea));
});
test('integer rectangle arrangements agree with an independent unit-grid coverage oracle',()=>{
 let seed=918273;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let trial=0;trial<40;trial++){
  const boxes=Array.from({length:8},()=>{const x=random()%8,y=random()%8;return [x,y,x+1+random()%5,y+1+random()%5];}),oracle=new Map<string,number>();
  for(let x=0;x<13;x++)for(let y=0;y<13;y++){
   const ids=boxes.flatMap(([a,b,c,d],i)=>a<x+.5&&x+.5<c&&b<y+.5&&y+.5<d?[i]:[]);if(ids.length){const key=ids.join(',');oracle.set(key,(oracle.get(key)??0)+1);}
  }
  const a=modelExactArrangement(model(boxes.map(([x,y,r,t])=>rect(x,y,r-x,t-y)))),actual=new Map<string,number>();
  for(const cell of a.cells)if(cell.faces.length){const key=cell.faces.join(',');actual.set(key,(actual.get(key)??0)+cell.area);}
  assert.deepEqual([...actual].sort(),[...oracle].sort());
 }
});

const witnesses:{polygons:Point[][];overlap:number}[]=[
 {polygons:[[[ -77.08333325544926,-141.666666637627],[-79.16666658528814,-141.6666665412034],[-77.08333349051976,-145.83333325732283],[-76.04166678246165,-144.79166663525777],[-76.56249994315992,-142.18749999184115]],[[-77.08333333333687,-141.66666666666845],[-79.16666666666951,-139.5833333333345],[-81.25000000000254,-139.58333333333314],[-79.16666666667015,-141.6666666666675]]],overlap:1.6094328143726464e-7},
 {polygons:[[[-78.12499999651135,-112.49999999850436],[-76.24999999865588,-112.49999999886562],[-76.56249999836604,-110.93749999879482],[-77.08333333156659,-110.41666666535761],[-79.16666667777758,-110.41666665624686]],[[-79.16666632722865,-112.4999999553414],[-77.08333307661016,-116.66666666334095],[-76.04166639267135,-115.6250000171566],[-76.562499398721,-113.02083319005501],[-77.0833326885647,-112.4999998171225]]],overlap:1.5304956478906452e-7},
 {polygons:[[[-77.08333286792018,-133.33333321436146],[-77.08333310972014,-137.4999998693074],[-76.04166637205851,-136.45833328765792],[-76.56249956796853,-133.85416659438607]],[[-76.04166614499374,-132.2916666210193],[-77.0833328660051,-133.33333323334034],[-76.0416662498271,-134.37499995434933]]],overlap:2.7416229766068298e-9},
];
for(const [i,witness]of witnesses.entries())test(`dragon micro-overlap ${i+1} agrees with independent exact rational clipping`,()=>{
 const a=modelExactArrangement(model(witness.polygons)),overlap=a.cells.filter(c=>c.faces.length===2).reduce((s,c)=>s+c.area,0);
 assert.ok(Math.abs(overlap-witness.overlap)<=witness.overlap*1e-14,`${overlap} !== ${witness.overlap}`);
});
