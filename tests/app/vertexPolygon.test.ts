import {test} from 'node:test';
import assert from 'node:assert/strict';
import {insertVertex,mergeVertex,regularPolygon} from '../../src/app/vertexPolygon';
import {splitEditableSegments} from '../../src/app/planarize';
import {validateDoc,type Doc,type Point,type Segment} from '../../src/core/types';
const s=(id:string,a:Point,b:Point,assignment:Segment['assignment']='M',angle:number|null=-90):Segment=>({id,a,b,assignment,angle});
const source=s('s',[0,0],[100,0]);
const doc=(segments:Segment[]):Doc=>({name:'vertex',paper:{width:200,height:200},segments});
const round=(v:unknown)=>JSON.parse(JSON.stringify(v,(_,n)=>typeof n==='number'?Math.round(n*1e8)/1e8:n));
test('insert vertex projects onto the source and preserves unknown angle and IDs',()=>{
  const original={...source,angle:null},d=doc([original]);const pieces=insertVertex(d,original,[30,2],3);
  assert.deepEqual(pieces.map(s=>[s.a,s.b]),[[[0,0],[30,0]],[[30,0],[100,0]]]);
  assert.ok(pieces.every(s=>s.assignment==='M'&&s.angle===null));assert.equal(pieces[0].id,'s');assert.notEqual(pieces[0].id,pieces[1].id);
  assert.equal(splitEditableSegments(doc(pieces)).segments.length,2);
});
test('insert rejects endpoints, outside points and off-line clicks',()=>{
  for(const p of [[0,0],[100,0],[110,0],[30,20]] as Point[])assert.throws(()=>insertVertex(doc([source]),source,p,3));
});
test('insert handles reversed oblique source and object ID collisions',()=>{
  const original=s('s',[100,100],[0,0]),d=doc([original]);d.objects=[{kind:'text',id:'s::divide:2',color:'#000000',position:[0,0],fontSize:10,text:'x'}];
  const pieces=insertVertex(d,original,[50,50],1);assert.equal(pieces[1].id,'s::divide:2:2');validateDoc({...d,segments:pieces});
});
test('merge reconstructs a single segment and survives automatic planarization',()=>{
  const pieces=insertVertex(doc([source]),source,[30,0],1),d=doc(pieces),before=JSON.stringify(d),result=mergeVertex(d,[30,0]);
  assert.deepEqual(result.segment,source);assert.equal(result.ids.length,2);assert.equal(JSON.stringify(d),before);
  assert.equal(splitEditableSegments(doc([result.segment])).segments.length,1);
});
test('merge accepts reversed segments and preserves zero and unknown fold angles',()=>{
  for(const angle of [0,null]){const d=doc([s('a',[50,0],[0,0],'M',angle),s('b',[100,0],[50,0],'M',angle)]);assert.equal(mergeVertex(d,[50,0]).segment.angle,angle);}
});
test('merge refuses different assignments and fold angles',()=>{
  for(const line of [s('b',[50,0],[100,0],'V',90),s('b',[50,0],[100,0],'M',-180),s('b',[50,0],[100,0],'M',null)])assert.throws(()=>mergeVertex(doc([s('a',[0,0],[50,0]),line]),[50,0]),/线型与折角/);
});
test('merge refuses corners, overlaps, T junctions and crosses',()=>{
  for(const extras of [[s('b',[50,0],[50,50])],[s('b',[50,0],[25,0])],[s('b',[50,0],[100,0]),s('c',[50,0],[50,50])],[s('b',[50,0],[100,0]),s('c',[50,-50],[50,50])]])assert.throws(()=>mergeVertex(doc([s('a',[0,0],[50,0]),...extras]),[50,0]));
});
test('merge respects boundary protection but unlocked collinear paper edges are editable',()=>{
  const d=doc([s('a',[0,0],[50,0],'B',0),s('b',[50,0],[100,0],'B',0)]);
  assert.throws(()=>mergeVertex(d,[50,0],true),/保护/);assert.equal(mergeVertex(d,[50,0]).segment.assignment,'B');
});
test('merge refuses isolated endpoints, line interiors and invalid coordinates',()=>{
  assert.throws(()=>mergeVertex(doc([source]),[50,0]));assert.throws(()=>mergeVertex(doc([source]),[0,0]));assert.throws(()=>mergeVertex(doc([source]),[NaN,0]));
});
test('square uses the first edge and supports both screen orientations',()=>{
  assert.deepEqual(round(regularPolygon([25,25],[75,25],4)),[[25,25],[75,25],[75,75],[25,75]]);
  assert.deepEqual(round(regularPolygon([25,25],[75,25],4,false)),[[25,25],[75,25],[75,-25],[25,-25]]);
});
test('all supported polygons have equal sides and stable closure',()=>{
  for(const n of [3,5,6,32,64]){const v=regularPolygon([-100,50],[-70,90],n);assert.equal(v.length,n);for(let i=0;i<n;i++){const b=v[(i+1)%n];assert.ok(Math.abs(Math.hypot(b[0]-v[i][0],b[1]-v[i][1])-50)<1e-8);}}
});
test('polygon rejects noninteger counts, coincident endpoints and coordinate overflow',()=>{
  for(const n of [2,65,3.5,NaN,Infinity])assert.throws(()=>regularPolygon([0,0],[10,0],n));
  assert.throws(()=>regularPolygon([0,0],[0,0],4));assert.throws(()=>regularPolygon([0,0],[Infinity,0],4));
  assert.throws(()=>regularPolygon([999999,999999],[1000000,999999],64));
});
