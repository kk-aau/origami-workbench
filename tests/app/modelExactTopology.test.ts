import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {buildExactModelTopology,walkExactCoverage} from '../../src/app/modelExactTopology';

function model(polygons:Point[][]):FlatFoldResult{
 const vertices:Point[]=[],faces=polygons.map(p=>{const offset=vertices.length;vertices.push(...p);return p.map((_,i)=>offset+i);});return {geometry:{status:'ready',message:'',vertices,faces},layers:{status:'unknown',message:''},warnings:[]};
}
const rect=(x:number,y:number,w:number,h:number):Point[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
test('compact result stores topology only and preserves halfedge left-cell cycles',()=>{
 const t=buildExactModelTopology(model([rect(0,0,2,2),rect(1,0,2,2)]));
 assert.equal(t.cellCount,3);assert.equal(t.exactVertices,undefined);assert.equal('cells' in t,false);assert.equal(t.cellArea.reduce((s,a)=>s+a,0),6);
 for(let h=0;h<t.halfedgeNext.length;h++)assert.equal(t.edgeCells[h],t.edgeCells[t.halfedgeNext[h]]);
 for(let e=0;e<t.edgeCount;e++){const source=t.edgeSource[e],dx=t.sourceDirectionXY[source*2],dy=t.sourceDirectionXY[source*2+1],a=t.edgeVertices[e*2],b=t.edgeVertices[e*2+1];assert.ok(Math.abs(Math.hypot(dx,dy)-1)<1e-15);assert.ok(dx*(t.vertexXY[b*2]-t.vertexXY[a*2])+dy*(t.vertexXY[b*2+1]-t.vertexXY[a*2+1])>0);}
 assert.equal(t.cellEdges.length,2*t.edgeCount);
});
test('repeatable walk batches shared-boundary swaps and rolls back to the exterior',()=>{
 const t=buildExactModelTopology(model([rect(0,0,1,1),rect(1,0,1,1)])),snapshots:unknown[]=[];
 for(let pass=0;pass<2;pass++){
  const active=new Set<number>(),visited=new Set<number>(),events:unknown[]=[];let swap=false;
  walkExactCoverage(t,{onTransition(d){for(const face of d.removed){assert.ok(active.delete(face));}for(const face of d.added){assert.ok(!active.has(face));active.add(face);}if(d.removed.length&&d.added.length)swap=true;events.push([d.fromCell,d.toCell,[...d.removed],[...d.added],d.backtrack]);},onCell(cell,faces){assert.ok(!visited.has(cell));visited.add(cell);assert.deepEqual([...faces].sort(),[...active].sort());assert.equal(faces.size,1);}});
  assert.ok(swap);assert.equal(visited.size,t.cellCount);assert.equal(active.size,0);snapshots.push(events);
 }
 assert.deepEqual(snapshots[0],snapshots[1]);
});
test('callback cancellation does not mutate topology or corrupt the next walk',()=>{
 const t=buildExactModelTopology(model([rect(0,0,2,2),rect(1,1,2,2)])),cancel=Error('cancel');
 assert.throws(()=>walkExactCoverage(t,{onCell(){throw cancel;}}),error=>error===cancel);
 let cells=0;walkExactCoverage(t,{onCell(){cells++;}});assert.equal(cells,t.cellCount);
});
test('distinct exact intersections that round to one point retain nonzero source directions',()=>{
 const t=buildExactModelTopology(model([rect(0,1,4,1),[[1,0],[2,100],[3,0]],[[1,0],[2,100+2**-46],[4,0]]]));let coincident=0;
 for(let e=0;e<t.edgeCount;e++){const a=t.edgeVertices[e*2],b=t.edgeVertices[e*2+1];if(t.vertexXY[a*2]===t.vertexXY[b*2]&&t.vertexXY[a*2+1]===t.vertexXY[b*2+1]){coincident++;assert.notEqual(a,b);const s=t.edgeSource[e];assert.ok(Math.abs(Math.hypot(t.sourceDirectionXY[s*2],t.sourceDirectionXY[s*2+1])-1)<1e-15);}}
 assert.ok(coincident>0);let cells=0;walkExactCoverage(t,{onCell(){cells++;}});assert.equal(cells,t.cellCount);
});
test('compact membership agrees with independent unit grid and preserves every cell once',()=>{
 const polygons=[rect(0,0,5,4),rect(1,2,6,4),rect(3,0,1,8)],t=buildExactModelTopology(model(polygons)),actual=new Map<string,number>(),expected=new Map<string,number>(),visited=new Uint8Array(t.cellCount);
 walkExactCoverage(t,{onCell(cell,faces){assert.equal(visited[cell]++,0);if(faces.size){const key=[...faces].sort().join(',');actual.set(key,(actual.get(key)??0)+t.cellArea[cell]);}}});
 for(let x=0;x<7;x++)for(let y=0;y<8;y++){const cover=polygons.flatMap((p,f)=>p[0][0]<x+.5&&x+.5<p[2][0]&&p[0][1]<y+.5&&y+.5<p[2][1]?[f]:[]);if(cover.length){const key=cover.join(',');expected.set(key,(expected.get(key)??0)+1);}}
 assert.deepEqual([...actual].sort(),[...expected].sort());assert.ok(visited.every(Boolean));
});
