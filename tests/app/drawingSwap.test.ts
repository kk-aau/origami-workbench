import test from 'node:test';
import assert from 'node:assert/strict';
import type {Assignment,Doc,Point,Segment} from '../../src/core/types';
import {canSwapGeneratedLines,generatedAssignment,swapGeneratedLines} from '../../src/app/drawingSwap';
import {overlayDrawnSegments} from '../../src/app/drawOverlay';
import {mirrorCopies} from '../../src/app/mirror';
import {applySelectionTransformWithIds} from '../../src/app/selectionTransform';
import {continuousReflection} from '../../src/app/continuousReflection';
import {transverseReflection} from '../../src/app/transverseReflection';
import {fishbone} from '../../src/app/fishbone';
import {rabbitEar} from '../../src/app/rabbitEar';
import {appendRayConstruction} from '../../src/app/rayConstruction';
import {appendDividedLine} from '../../src/app/dividedLine';

const s=(id:string,a:Point,b:Point,assignment:Assignment='B',angle:number|null=assignment==='M'?-180:assignment==='V'?180:assignment==='U'?null:0):Segment=>({id,a,b,assignment,angle});
const boundary=[s('top',[0,0],[200,0]),s('right',[200,0],[200,200]),s('bottom',[200,200],[0,200]),s('left',[0,200],[0,0])];
const doc=(extra:Segment[]=[]):Doc=>({name:'生成山谷互换',paper:{width:200,height:200},segments:[...boundary,...extra]});
const attributes=(segments:readonly Segment[])=>segments.map(({a,b,assignment,angle})=>({a,b,assignment,angle}));

test('new-line modifier reverses only M/V once, preserving magnitudes, zero, null and input identity',()=>{
  const lines=[s('m',[10,10],[20,10],'M',-43),s('v',[10,20],[20,20],'V',76),s('unknown',[10,30],[20,30],'M',null),s('zero',[10,40],[20,40],'V',0),...(['A','B','F','U'] as Assignment[]).map((a,i)=>s(a,[10,50+i],[20,50+i],a))];
  const before=structuredClone(lines),result=swapGeneratedLines(lines,true);
  assert.strictEqual(swapGeneratedLines(lines),lines);
  assert.deepEqual(result.map(({assignment,angle})=>[assignment,angle]),[['V',43],['M',-76],['V',null],['M',0],['A',0],['B',0],['F',0],['U',null]]);
  assert.deepEqual(lines,before);assert.deepEqual(swapGeneratedLines(result,true),before);
  for(let i=4;i<lines.length;i++)assert.strictEqual(result[i],lines[i]);
});

test('tool availability includes actual crease construction and excludes edits, moves and auxiliary tools',()=>{
  for(const tool of ['line','restrictedline','drawdivide','drawratio','continuous','fishbone','transverse','copyselection','copyfour','mirrorline','mirrorselection','localflat','foldabledraw','polygon','tangentpoint'] as const)assert.equal(canSwapGeneratedLines(tool),true,tool);
  for(const tool of ['extend','lengthen','trim','divide','ratio','moveselection','movefour','select','regionalswap','circle','lineinvert','voronoi','mark'] as const)assert.equal(canSwapGeneratedLines(tool),false,tool);
});

test('overlay exchanges authored lines without exchanging newly split old fragments or untouched overlap tails',()=>{
  const previous=doc([s('old',[0,100],[200,100],'M',-34)]),before=structuredClone(previous);
  const crossing=overlayDrawnSegments(previous,swapGeneratedLines([s('drawn',[100,0],[100,200],'M',-71)],true));
  const oldPieces=crossing.segments.filter(line=>line.a[1]===100&&line.b[1]===100);
  assert.equal(oldPieces.length,2);assert.ok(oldPieces.every(line=>line.assignment==='M'&&line.angle===-34));
  const added=crossing.segments.filter(line=>line.a[0]===100&&line.b[0]===100);
  assert.equal(added.length,2);assert.ok(added.every(line=>line.assignment==='V'&&line.angle===71));
  const overlap=overlayDrawnSegments(previous,swapGeneratedLines([s('overlap',[50,100],[150,100],'M',-71)],true));
  assert.deepEqual(overlap.segments.filter(line=>line.a[1]===100&&line.b[1]===100).map(line=>[line.a[0],line.b[0],line.assignment,line.angle]),[[0,50,'M',-34],[150,200,'M',-34],[50,150,'V',71]]);
  assert.deepEqual(previous,before);
});

test('mirror swaps before matching coverage is removed and keeps source attributes',()=>{
  const source=s('source',[10,20],[50,20],'M',-47),previous=doc([source,s('existing',[10,80],[50,80],'M',-47)]),before=structuredClone(previous);
  assert.throws(()=>mirrorCopies(previous,['source'],[0,50],[100,50]),/已存在/);
  const copies=mirrorCopies(previous,['source'],[0,50],[100,50],false,0,true);
  assert.deepEqual(attributes(copies),[{a:[10,80],b:[50,80],assignment:'V',angle:47}]);
  const next=overlayDrawnSegments(previous,copies);
  assert.deepEqual(next.segments.find(line=>line.id==='source'),source);assert.deepEqual(previous,before);
});

test('copy swaps before deduplication and does not alter crossing source fragments; moves ignore modifier',()=>{
  const previous=doc([s('source',[10,20],[50,20],'M',-68),s('existing',[10,80],[50,80],'M',-68),s('cross',[30,60],[30,100],'V',null)]),before=structuredClone(previous);
  const transform={kind:'translate' as const,from:[0,0] as Point,to:[0,60] as Point};
  assert.throws(()=>applySelectionTransformWithIds(previous,['source'],transform,true),/已存在/);
  const result=applySelectionTransformWithIds(previous,['source'],transform,true,false,true),ids=new Set(result.drawnIds);
  assert.ok(result.doc.segments.filter(line=>ids.has(line.id)).every(line=>line.assignment==='V'&&line.angle===68));
  assert.ok(result.doc.segments.filter(line=>line.a[0]===30&&line.b[0]===30).every(line=>line.assignment==='V'&&line.angle===null));
  assert.deepEqual(result.doc.segments.find(line=>line.id==='source'),previous.segments.find(line=>line.id==='source'));
  const moved=applySelectionTransformWithIds(doc([s('source',[10,20],[50,20],'M',null)]),['source'],transform,false,false,true);
  assert.ok(moved.doc.segments.filter(line=>moved.drawnIds.includes(line.id)).every(line=>line.assignment==='M'&&line.angle===null));
  assert.deepEqual(previous,before);
});

test('continuous reflection reverses the complete sequence and preserves endpoint and alternation options',()=>{
  const previous=doc([s('c1',[75,0],[75,200],'M'),s('c2',[125,0],[125,200],'V')]),before=structuredClone(previous);
  const normal=continuousReflection(previous,[25,100],[50,100],'M',63);
  const swapped=continuousReflection(previous,[25,100],[50,100],'M',63,{swapGenerated:true});
  assert.deepEqual(attributes(swapped.path),attributes(swapGeneratedLines(normal.path,true)));
  assert.equal(swapped.path.map(line=>line.assignment).join(''),'VMV');
  const constant=continuousReflection(previous,[25,100],[50,100],'M',null,{swapGenerated:true,alternateAssignments:false,endpoint:{segmentIndex:1,point:[100,100]}});
  assert.equal(constant.stop,'selected');assert.equal(constant.path.length,2);assert.deepEqual(constant.path[1].b,[100,100]);
  assert.ok(constant.path.every(line=>line.assignment==='V'&&line.angle===null));assert.deepEqual(previous,before);
});

test('continuous junction choices show the exchanged assignment while retaining the same available directions',()=>{
  const previous=doc([s('v',[100,0],[100,200],'M'),s('h',[0,100],[200,100],'V')]);
  const normal=continuousReflection(previous,[25,75],[100,100],'M');
  const swapped=continuousReflection(previous,[25,75],[100,100],'M',undefined,{swapGenerated:true});
  assert.equal(swapped.stop,'choice');
  assert.deepEqual(swapped.pendingJunction?.candidates,normal.pendingJunction?.candidates.map(candidate=>({...candidate,assignment:generatedAssignment(candidate.assignment,true)})));
});

test('transverse reflection reverses each source assignment and null angle before trimming matching coverage',()=>{
  const previous=doc([s('m',[25,50],[100,50],'M',-90),s('v',[25,150],[100,150],'V',null),s('existing',[125,50],[150,50],'M',-90)]),before=structuredClone(previous);
  const normal=transverseReflection(previous,[100,25],[100,175]);
  assert.equal(normal.copies.filter(line=>line.id.startsWith('m::')).length,2);
  const result=transverseReflection(previous,[100,25],[100,175],false,true);
  assert.deepEqual(attributes(result.copies),[{a:[100,50],b:[200,50],assignment:'V',angle:90},{a:[100,150],b:[200,150],assignment:'M',angle:null}]);
  assert.deepEqual(previous,before);
});

test('fishbone reverses all teeth exactly once; rabbit ear can overwrite same-type coverage after swap',()=>{
  const previous=doc(),normal=fishbone(previous,[25,100],[175,100],25,'M',57),swapped=fishbone(previous,[25,100],[175,100],25,'M',57,true);
  assert.deepEqual(attributes(swapped.copies),attributes(swapGeneratedLines(normal.copies,true)));
  assert.equal(swapped.copies.map(line=>line.assignment).join(''),'VMVMVMV');
  const vertices:Point[]=[[20,20],[180,20],[100,180]],ear=rabbitEar(previous,vertices,'M',41),covered=doc(ear.rays),before=structuredClone(covered);
  assert.throws(()=>rabbitEar(covered,vertices,'M',41),/已存在/);
  const exchanged=rabbitEar(covered,vertices,'M',41,true);
  assert.deepEqual(attributes(exchanged.copies),attributes(swapGeneratedLines(ear.rays,true)));assert.deepEqual(covered,before);
});

test('single-assignment ray and divided drawing consume the swapped type once and preserve explicit split points',()=>{
  const assignment=generatedAssignment('M',true),previous=doc();
  const ray=appendRayConstruction(previous,[25,100],[50,100],'right',assignment,true,52);
  assert.equal(ray.segments.find(line=>line.a[0]===25&&line.a[1]===100)?.assignment,'V');
  assert.equal(ray.segments.find(line=>line.a[0]===25&&line.a[1]===100)?.angle,52);
  const divided=appendDividedLine(previous,[25,100],[175,100],assignment,{kind:'equal',count:3},true,null);
  const pieces=divided.segments.filter(line=>line.a[1]===100&&line.b[1]===100);
  assert.deepEqual(pieces.map(line=>[line.a[0],line.b[0],line.assignment,line.angle]),[[25,75,'V',null],[75,125,'V',null],[125,175,'V',null]]);
});
