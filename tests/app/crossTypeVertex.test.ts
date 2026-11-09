import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeCrossTypeVertex} from '../../src/app/vertexPolygon';
import {defaultAngle,type Doc,type Segment,type Point} from '../../src/core/types';
import {splitEditableSegments} from '../../src/app/planarize';
import {historyReducer,type History} from '../../src/app/state';
const s=(id:string,a:Point,b:Point,assignment:Segment['assignment'],angle=defaultAngle(assignment)):Segment=>({id,a,b,assignment,angle});
const doc=(x:Segment['assignment'],y:Segment['assignment']):Doc=>({name:'跨线型合点',paper:{width:200,height:200},segments:[s('a',[0,50],[50,50],x),s('b',[50,50],[100,50],y)],objects:[]});
const p:Point=[50,50];
test('all ordered boundary/mountain/valley combinations follow upstream colour table',()=>{
  const expected={B:{B:'B',M:'M',V:'V'},M:{B:'M',M:'M',V:'B'},V:{B:'V',M:'B',V:'V'}};
  for(const x of ['B','M','V'] as const)for(const y of ['B','M','V'] as const){
    const d=doc(x,y),before=JSON.stringify(d),r=mergeCrossTypeVertex(d,p);
    assert.equal(r.segment.assignment,expected[x][y]);assert.equal(r.segment.angle,defaultAngle(r.segment.assignment));
    assert.deepEqual([r.segment.a,r.segment.b],[[0,50],[100,50]]);assert.equal(JSON.stringify(d),before);
  }
});
test('same auxiliary/unknown/flat allowed but mixed kinds reject in either order',()=>{
  for(const type of ['A','U','F'] as const){assert.equal(mergeCrossTypeVertex(doc(type,type),p).segment.assignment,type);
    for(const other of ['B','M','V','A','U','F'] as const)if(other!==type){
      assert.throws(()=>mergeCrossTypeVertex(doc(type,other),p),/仅支持/);
      assert.throws(()=>mergeCrossTypeVertex(doc(other,type),p),/仅支持/);
    }
  }
});
test('boundary plus fold keeps custom, zero or unspecified fold angle regardless of order',()=>{
  for(const type of ['M','V'] as const)for(const angle of [type==='M'?-30:30,0,null])for(const reverse of [false,true]){
    const d=doc('B',type);d.segments[1].angle=angle;if(reverse)d.segments.reverse();
    assert.equal(mergeCrossTypeVertex(d,p).segment.angle,angle);
  }
});
test('same-fold conflicting angles need explicit resolution; null is an intentional choice',()=>{
  const d=doc('M','M');d.segments[0].angle=-30;d.segments[1].angle=null;
  assert.throws(()=>mergeCrossTypeVertex(d,p),/明确选择/);
  for(const angle of [-30,-180,0,null])assert.equal(mergeCrossTypeVertex(d,p,false,angle).segment.angle,angle);
  for(const angle of [30,181,NaN,Infinity])assert.throws(()=>mergeCrossTypeVertex(d,p,false,angle));
});
test('geometry rejects T/cross/corner/overlap and respects protected boundary',()=>{
  const d=doc('B','M');assert.throws(()=>mergeCrossTypeVertex(d,p,true),/保护/);
  for(const extra of [s('c',p,[50,100],'A'),s('c',[50,0],[50,100],'V')])assert.throws(()=>mergeCrossTypeVertex({...d,segments:[...d.segments,extra]},p),/恰好/);
  for(const end of [[50,100],[25,50]] as Point[]){const bad=doc('M','V');bad.segments[1].b=end;assert.throws(()=>mergeCrossTypeVertex(bad,p),/共线/);}
  assert.throws(()=>mergeCrossTypeVertex(d,[NaN,50]),/坐标/);
});
test('reversed endpoints merge and normal planarization does not resurrect removed vertex; undo restores types',()=>{
  const d=doc('M','V');d.segments[0].a=p;d.segments[0].b=[0,50];d.segments[1].a=[100,50];d.segments[1].b=p;
  const r=mergeCrossTypeVertex(d,p),next=splitEditableSegments({...d,segments:[r.segment]});assert.equal(next.segments.length,1);
  assert.equal(next.objects,d.objects);assert.equal(next.segments[0].assignment,'B');
  const initial:History={past:[],present:d,future:[]},committed=historyReducer(initial,{type:'commit',doc:next});
  const undo=historyReducer(committed,{type:'undo'});assert.deepEqual(undo.present,d);assert.deepEqual(historyReducer(undo,{type:'redo'}).present,next);
});
