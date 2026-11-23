import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold} from '../../src/core/geometry';
import {solveRigidFoldGeometry} from '../../src/core/rigidFoldGeometry';
import {solveSpatialLayerContacts,solveSpatialLayerContactsAsync,spatialContactGeometry} from '../../src/app/diagramSpatialLayerSolver';
import {solveSpatialContactGroup,type SpatialContactGroupInput} from '../../src/app/diagramSpatialContactGroup';
import type {DiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import type {FoldGraph,Point} from '../../src/core/types';

function strip(angles:number[]){
  const doc=blankDoc('空间接触纸组',(angles.length+1)*10,10);
  angles.forEach((angle,i)=>doc.segments.push({id:'hinge-'+i,a:[(i+1)*10,0],b:[(i+1)*10,10],assignment:angle<0?'M':'V',angle}));
  const source=buildDiagramFold(doc).graph,geometry=solveRigidFoldGeometry(source);
  if(geometry.status!=='ready')throw Error(geometry.message);
  const spatial:DiagramSpatialPose={version:1,camera:{yaw:0,elevation:0},vertices:geometry.vertices,faceTransforms:geometry.faceTransforms,measuredAngles:geometry.measuredAngles};
  return {source,spatial};
}

test('inherited candidates and published contacts exclude edge-only and disjoint neighbours in the same plane',()=>{
  const {source,spatial}=strip([180,0,0]),asked:string[]=[];
  const solved=solveSpatialLayerContacts(source,spatial,[],undefined,undefined,true,(a,b)=>{asked.push([a,b].join(':'));return undefined;});
  assert.equal(asked.length,1);
  assert.deepEqual(asked,solved.contacts.map(([a,b])=>[a,b].sort((i,j)=>i-j).join(':')));
  const selected=solved.contacts[0],both=[selected[0],selected[1]],outside=source.faces_vertices!.findIndex((_,i)=>!both.includes(i));
  const restored=solveSpatialLayerContacts(source,spatial,[[selected[0],outside,1]],undefined,undefined,true);
  assert.deepEqual(restored.contacts,solved.contacts);
  const carried=solveSpatialLayerContacts(source,spatial,[selected,[selected[0],outside,1]]);
  assert.deepEqual(carried.contacts,solved.contacts);
});

test('a shared radial crease can couple two stacks without making their edge neighbours into overlapping layers',()=>{
  const doc=blankDoc('两叠相邻的三角纸面',10,10);
  const rim:Point[]=[[5,0],[10,0],[10,5],[10,10],[5,10],[0,10],[0,5],[0,0]];
  const angles=[0,-180,-180,180,180,180,0,180];
  rim.forEach((b,i)=>doc.segments.push({id:'radial-'+i,a:[5,5],b,assignment:angles[i]<0?'M':'V',angle:angles[i]}));
  const source=buildDiagramFold(doc).graph,geometry=solveRigidFoldGeometry(source);
  if(geometry.status!=='ready')throw Error(geometry.message);
  const spatial:DiagramSpatialPose={version:1,camera:{yaw:0,elevation:0},vertices:geometry.vertices,faceTransforms:geometry.faceTransforms,measuredAngles:geometry.measuredAngles};
  const result=solveSpatialLayerContacts(source,spatial,[],undefined,undefined,true);
  // F1/F2 form one stack; F3…F8 form a second. The flat engine's
  // auxiliary F1/F8 relation spans the shared edge and must stay private.
  const expected=['0:1'];
  for(let a=2;a<8;a++)for(let b=a+1;b<8;b++)expected.push(a+':'+b);
  assert.deepEqual(result.contacts.map(([a,b])=>[Math.min(a,b),Math.max(a,b)].join(':')).sort(),expected.sort());
});

test('positive overlap with the representative plane cannot mask a gap between two other faces',()=>{
  const corners:Point[]=[[0,0],[10,0],[10,10],[0,10]],levels=[0,3.5e-12,-3.5e-12];
  const faces=levels.map((_,i)=>corners.map((_,v)=>4*i+v));
  const source:FoldGraph={
    vertices_coords:levels.flatMap(()=>corners),faces_vertices:faces,faces_edges:faces,
    edges_vertices:faces.flatMap(r=>r.map((v,i)=>[v,r[(i+1)%4]] as [number,number])),
    edges_faces:faces.flatMap((r,i)=>r.map(()=>[i])),edges_assignment:Array(12).fill('B'),edges_foldAngle:Array(12).fill(0),
  };
  const spatial:DiagramSpatialPose={version:1,camera:{yaw:0,elevation:0},
    vertices:levels.flatMap(z=>corners.map(([x,y])=>[x,y,z] as [number,number,number])),
    faceTransforms:levels.map(z=>({rotation:[1,0,0,0,1,0,0,0,1],translation:[0,0,z]})),measuredAngles:Array(12).fill(0)};
  const asked:number[][]=[];
  assert.throws(()=>solveSpatialLayerContacts(source,spatial,[],undefined,undefined,true,(a,b)=>{asked.push([a,b]);return undefined;}),/F2 与 F3.*超出共面精度/);
  assert.deepEqual(asked,[]);
});

test('flat-connected faces use an inclusive absolute plane distance in millimetres',()=>{
  const {source,spatial}=strip([0]);
  const [first,second]=source.faces_vertices!;
  const corner=second.find(v=>!first.includes(v))!;
  for(const [gap,expected] of [[0.99e-10,true],[1e-10,true],[1.01e-10,false]] as const){
    spatial.vertices[corner][2]=gap;
    assert.equal(spatialContactGeometry(source,spatial).coplanar(0,1),expected);
  }
});

test('the flat-hinge allowance only applies along fully flat hinge paths',()=>{
  const {source,spatial}=strip([180,-180]);
  // Simulate reaching the middle face along a different rigid propagation
  // path. Its published shared vertices still come from the other banks.
  const mid=spatial.faceTransforms[1],tilt=6e-13;
  const x=mid.rotation.slice(0,3),z=mid.rotation.slice(6,9);
  for(let i=0;i<3;i++){
    mid.rotation[i]=Math.cos(tilt)*x[i]+Math.sin(tilt)*z[i];
    mid.rotation[i+6]=-Math.sin(tilt)*x[i]+Math.cos(tilt)*z[i];
  }
  assert.equal(solveSpatialLayerContacts(source,spatial,[],undefined,undefined,true).contacts.length,3);
  // An intentional near-half-turn breaks that proof, even when the same
  // screen geometry and shared-vertex residual are supplied.
  const hinge=source.edges_faces!.findIndex(row=>row.includes(1)&&row.includes(2));
  source.edges_foldAngle[hinge]=179.999999;
  assert.throws(()=>solveSpatialLayerContacts(source,spatial,[],undefined,undefined,true),/超出共面精度/);
});

test('distant coplanar stacks merge identically on worker success or transport fallback',async t=>{
  const depth=128,stack=Array.from({length:depth-1},(_,i)=>i%2?180:-180);
  const {source,spatial}=strip([...stack,90,90,0,0,90,-90,...stack]);
  const onBase=source.faces_vertices!.filter(ring=>ring.every(v=>Math.abs(spatial.vertices[v][2])<1e-8));
  assert.equal(onBase.length,depth*2);
  const expected=solveSpatialLayerContacts(source,spatial,[],undefined,undefined,true);
  assert.equal(expected.contacts.length,depth*(depth-1));
  for(const mode of ['success','transport','compute'] as const){
    let messages=0,terminated=0;
    class GroupWorker {
      onmessage?:Function;onerror?:Function;
      postMessage(input:SpatialContactGroupInput[]){
        messages++;
        assert.equal(input.length,1);assert.equal(input[0].result.geometry.faces.length,depth);
        if(mode==='transport')throw Error('structured clone unavailable');
        queueMicrotask(()=>this.onmessage?.({data:mode==='compute'?{error:'group computation failed'}:{results:structuredClone(input).map(solveSpatialContactGroup)}}));
      }
      terminate(){terminated++;}
    }
    const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker');
    Object.defineProperty(globalThis,'Worker',{value:GroupWorker,configurable:true});
    const cpus=t.mock.getter(navigator,'hardwareConcurrency',()=>4);
    try{
      const result=solveSpatialLayerContactsAsync(source,spatial,[],undefined,undefined,true);
      if(mode==='compute')await assert.rejects(result,/group computation failed/);
      else assert.deepEqual(await result,expected);
      assert.equal(messages,1);assert.equal(terminated,1);
    }finally{
      cpus.mock.restore();
      if(previous)Object.defineProperty(globalThis,'Worker',previous);else Reflect.deleteProperty(globalThis,'Worker');
    }
  }
});
test('small stacks stay in the parent solver without querying any cross-stack pair',async t=>{
  const {source,spatial}=strip(Array.from({length:39},(_,i)=>i===19?90:i%2?180:-180));
  const considered:number[][]=[];
  const expected=solveSpatialLayerContacts(source,spatial,[],undefined,undefined,true,(a,b)=>{considered.push([a,b]);return undefined;});
  assert.equal(considered.length,380);
  assert.equal(expected.contacts.length,380);
  let batches=0;
  class GroupWorker {
    constructor(){batches++;throw Error('small job created a child worker');}
  }
  const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker');
  Object.defineProperty(globalThis,'Worker',{value:GroupWorker,configurable:true});
  const cpus=t.mock.getter(navigator,'hardwareConcurrency',()=>4);
  try{
    assert.deepEqual(await solveSpatialLayerContactsAsync(source,spatial,[],undefined,undefined,true),expected);
    assert.equal(batches,0);
  }finally{
    cpus.mock.restore();
    if(previous)Object.defineProperty(globalThis,'Worker',previous);else Reflect.deleteProperty(globalThis,'Worker');
  }
});
