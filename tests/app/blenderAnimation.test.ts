import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {appendDiagramStep,createDiagramProject,updateDiagramCP,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {bakeBlenderAnimation} from '../../src/app/blenderAnimation';
import {DiagramFullAnimationSession,diagramAnimationEvaluator} from '../../src/app/diagramFullAnimation';
import type {Segment} from '../../src/core/types';
import {blenderLayerMesh} from '../../src/engine/simBlenderLayers';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {materialUV} from '../../src/engine/simPaperTexture';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {viewRotationFor} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';

test('a Blender precrease includes its moving middle and both coincident endpoints',async()=>{
  const before=blankDoc('预折动画',100,100),fold:Segment={id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180};
  let project=createDiagramProject(before);const step=project.steps[0];
  const after=structuredClone(before);after.segments.push({...fold,assignment:'F',angle:0});
  project=updateDiagramCP(project,step.afterId,after);
  project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'all',selectedFaces:[],precreases:[fold]});
  const entry=new DiagramFullAnimationSession(project).prepare(0,0);
  entry.clip={...entry.clip,camera:{yaw:0.2,pitch:2.6,zoom:0.8,roll:0.15}};
  const blob=bakeBlenderAnimation({step:entry,title:'预折',speed:2},()=>{});
  const file=Buffer.from(await blob.arrayBuffer());
  assert.equal(file.toString('ascii',0,8),'ZZANIM01');
  const offset=12+file.readUInt32LE(8),header=JSON.parse(file.toString('utf8',12,offset)),info=header.steps[0];
  assert.equal(header.fps,24);assert.equal(info.frames,49);
  assert.deepEqual(header.initialView,viewRotationFor(entry.clip.camera!));
  const coords=offset+info.triangles*12+info.vertices*8,stride=info.vertices*12;
  assert.equal(file.length,coords+stride*info.frames);
  const {prepared,path}=diagramAnimationEvaluator(entry),uv=materialUV(prepared);
  assert.equal(info.ink.color,entry.clip.colors.line);
  assert.equal(info.ink.aspect,1);
  const maskCodes='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const kinds=new Set<number>();
  for(let f=0;f<info.triangles;f++){
    const verts=[0,2,1].map(k=>prepared.indices[3*f+k]);
    for(let k=0;k<3;k++){
      const a=verts[(k+1)%3],b=verts[(k+2)%3];
      const onFold=uv[2*a]===0.5&&uv[2*b]===0.5;
      const boundary=[0,1].some(axis=>uv[2*a+axis]===uv[2*b+axis]&&[0,1].includes(uv[2*a+axis]));
      const code=(maskCodes.indexOf(info.ink.masks[f])>>(2*k))&3;
      assert.equal(boundary?code===3:onFold?code===1||code===2:code===0,true);
      kinds.add(code);
    }
  }
  assert.equal(kinds.size,3,'boundary, real fold and unprinted triangulation');
  for(const f of [0,12,24,36,48]){
    const p=path.evaluate(f/48);
    for(let face=0;face<info.triangles;face++)for(let corner=0;corner<3;corner++){
      const source=prepared.indices[face*3+[0,2,1][corner]],copy=file.readUInt32LE(offset+(face*3+corner)*4);
      const at=coords+f*stride+copy*12,uvAt=offset+info.triangles*12+copy*8;
      assert.deepEqual([file.readFloatLE(uvAt),file.readFloatLE(uvAt+4)],[uv[2*source],uv[2*source+1]]);
      const expected=[p[3*source],p[3*source+2],p[3*source+1]];
      expected.forEach((n,k)=>assert.ok(Math.abs(file.readFloatLE(at+k*4)-n)<(f===24?2e-5:1e-12)));
    }
  }
  assert.notDeepEqual(file.subarray(coords,coords+stride),file.subarray(coords+24*stride,coords+25*stride));
});

test('final stills select the actual frame on the multi-step Blender timeline including pauses',async()=>{
  let project=createDiagramProject(blankDoc('时间轴',100,100));
  for(const [i,angle] of [90,180].entries()){
    if(i)project=appendDiagramStep(project);
    const doc=blankDoc('纸张',100,100);
    doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle});
    project=updateDiagramCP(project,project.steps[i].afterId,doc);
  }
  const source={project,speed:2,pauseSeconds:0.5};
  const file=Buffer.from(await bakeBlenderAnimation({...source,render:{kind:'png',stepIndex:1,progress:.5}},()=>{}).arrayBuffer());
  const header=JSON.parse(file.toString('utf8',12,12+file.readUInt32LE(8)));
  assert.deepEqual(header.finalRender,{kind:'png',frame:85});
  assert.equal(header.steps[0].hold,12);
  assert.equal(header.steps[1].frames,49);
  const range={first:1,last:1};
  const selected=Buffer.from(await bakeBlenderAnimation({...source,range,render:{kind:'png',stepIndex:1,progress:.5}},()=>{}).arrayBuffer());
  const part=JSON.parse(selected.toString('utf8',12,12+selected.readUInt32LE(8)));
  assert.equal(part.steps.length,1);
  assert.deepEqual(part.finalRender,{kind:'png',frame:25});
  assert.equal(part.steps[0].hold,0);
  assert.throws(()=>bakeBlenderAnimation({...source,range,render:{kind:'png',stepIndex:0,progress:1}},()=>{}),/帧位置/);
});

test('Blender separates certified folded material faces in the direction of the second face normal',()=>{
  const {prepared}=prepareSimulationDocument({
    vertices_coords:[[0,0],[1,0],[0,1],[1,1]],
    faces_vertices:[[0,1,2],[1,3,2]],
    edges_vertices:[[0,1],[1,2],[2,0],[1,3],[3,2]],
    edges_assignment:['B','V','B','B','B'],
  });
  // Fold the last vertex over the shared edge to coincide with vertex zero.
  const flat=Float32Array.from([0,0,0,1,0,0,0,1,0,1,1,0]),closed=flat.slice();
  closed.set([0,0,0],9);
  for(const sign of [-1,1]){
    const animation:SimulationStepAnimation={version:1,sourceSignature:'test',initialPositions:[...flat],ranges:[],fixedVertices:[],
      layerTimeline:[{progress:0,faceOrders:[]},{progress:1,faceOrders:[[0,1,sign]]}]};
    const layers=blenderLayerMesh(prepared,animation)!;
    const points=layers.positionsAt(closed,1),zs=Array.from(layers.indices,id=>points[3*id+2]);
    assert.equal(layers.vertices.length,6);
    assert.ok(sign*(zs[3]-zs[0])>1e-5);
    assert.equal(zs[0],zs[1]);assert.equal(zs[3],zs[4]);
    const lifted=closed.slice();lifted[11]=1e-6;
    for(const [pose,t] of [[flat,1],[lifted,1],[closed,0]] as const){
      const positions=layers.positionsAt(pose,t);
      assert.deepEqual([...positions],layers.vertices.flatMap(v=>[...pose.slice(v*3,v*3+3)]));
    }
  }
});

test('interleaved contacts keep local approach order below their common cover',()=>{
  // Three narrow panels meet pairwise near O, X and Y, with no triply
  // covered area. A>B at O, B>C at Y and C>A at X form a global cycle.
  const panels=[[[0,0],[0,-1],[10,0]],[[-1,-.25],[1,-.25],[0,11]],[[9,-1],[11,1],[-1,11]],
    [[-20,-20],[40,-20],[-20,40]]];
  const {prepared}=prepareSimulationDocument({
    vertices_coords:panels.flat(),
    faces_vertices:panels.map((_,i)=>[3*i,3*i+1,3*i+2]),
    edges_vertices:panels.flatMap((_,i)=>[[3*i,3*i+1],[3*i+1,3*i+2],[3*i+2,3*i]]),
    edges_assignment:Array(12).fill('B'),
  });
  const pose=Float32Array.from(panels.flatMap(t=>t.flatMap(([x,y])=>[x,y,0])));
  const previous=Float32Array.from(pose);
  // z-functions across the final contact plane, limited to the display gap
  // when exported. Face D lies above all three without joining their cycle.
  const approach=[(x:number)=>1-x/5,()=>0,()=>-0.5,()=>3];
  for(let f=0;f<4;f++)for(let k=0;k<3;k++)previous[(3*f+k)*3+2]=approach[f](pose[(3*f+k)*3]);
  const animation:SimulationStepAnimation={version:1,sourceSignature:'test',initialPositions:[...previous],ranges:[],fixedVertices:[],
    layerTimeline:[{progress:0,faceOrders:[]},{progress:1,faceOrders:[[0,1,1],[1,2,1],[2,0,1],[3,0,1],[3,1,1],[3,2,1]]}],
    dynamic:{version:1,method:'dynamic',keyframes:[{progress:0,positions:[...previous]},{progress:1,positions:[...pose]}],
      maxEdgeStrain:0,maxAreaStrain:0,maxAngleError:0,endAngleError:0,maxFixedDisplacement:0}};
  const mesh=blenderLayerMesh(prepared,animation)!,out=mesh.positionsAt(pose,1);
  const z=(v:number)=>out[3*mesh.vertices.indexOf(v)+2];
  assert.ok(z(0)>z(3),'A above B near O');
  assert.ok(z(5)>z(8),'B above C near Y');
  assert.ok(z(7)>z(2),'C above A near X');
  assert.ok(z(9)>Math.max(...[0,1,2,3,4,5,6,7,8].map(z)),'D above the complete cycle');
  const unresolved=blenderLayerMesh(prepared,{...animation,dynamic:undefined})!;
  const flat=unresolved.positionsAt(pose,1);
  const heights=unresolved.vertices.map((_,i)=>flat[3*i+2]);
  assert.equal(new Set(heights.slice(0,9)).size,1,'without approach data, the cycle retains equal depths');
  assert.ok(heights[9]>heights[0],'the cover remains unambiguous');
});
