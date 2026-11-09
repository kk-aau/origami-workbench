import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramSpatialPose,reprojectDiagramSpatialPose,validateDiagramSpatialPose,restoreDiagramSpatialLayers,prepareDiagramSpatialHistory,cloneDiagramPoseWithSpatialProof,diagramSpatialContactOrders,completedSpatialCreases,spatialFaceMatrix,projectDiagramSpatialPoint,liftDiagramFoldMatrix} from '../../src/app/diagramSpatialPose';
import {applyRigidFoldTransform} from '../../src/core/rigidFoldGeometry';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {Doc,Point,Segment} from '../../src/core/types';

function document(first=90,second=-45):Doc {
  const segments:Segment[]=[{id:'b0',a:[0,0],b:[90,0],assignment:'B',angle:0},{id:'b1',a:[90,0],b:[90,90],assignment:'B',angle:0},{id:'b2',a:[90,90],b:[0,90],assignment:'B',angle:0},{id:'b3',a:[0,90],b:[0,0],assignment:'B',angle:0},
    {id:'crease-1',a:[30,0],b:[30,90],assignment:first<0?'M':'V',angle:first},{id:'crease-2',a:[60,0],b:[60,90],assignment:second>0?'V':'M',angle:second}];
  return {schemaVersion:2,name:'空间角度测试',paper:{width:90,height:90},segments};
}
function spatialPose(doc:Doc,previous?:DiagramPose,camera?:{yaw:number;elevation:number}):DiagramPose {
  const value=createDiagramSpatialPose(doc,0,undefined,previous,camera);return {sourceStateId:'cp',sourceRevision:0,sourceDoc:structuredClone(doc),...value};
}
function flatPose(doc=document(180,-180)):DiagramPose {
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});assert.equal(result.geometry.status,'ready');assert.equal(result.layers.status,'solved',result.layers.message);
  return {sourceStateId:'cp',sourceRevision:0,sourceDoc:structuredClone(doc),result};
}
const sortedOrders=(rows:NonNullable<DiagramPose['result']['layers']['faceOrders']>)=>[...rows].sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);

test('partial angles persist real 3D coordinates and the SVG is their actual orthographic projection',()=>{
  const pose=spatialPose(document()),graph=buildDiagramFold(pose.sourceDoc).graph;
  validateDiagramSpatialPose(pose,true);assert.ok(pose.spatial!.vertices.some(p=>Math.abs(p[2])>1));assert.equal(pose.result.layers.status,'solved');
  pose.spatial!.vertices.forEach((p,i)=>{const q=projectDiagramSpatialPoint(p,pose.spatial!.camera);assert.deepEqual(pose.result.geometry.vertices[i],q.slice(0,2));});
  graph.faces_vertices!.forEach((face,f)=>{const m=spatialFaceMatrix(pose.spatial!,f);for(const v of face){const [x,y]=graph.vertices_coords[v],shown=pose.result.geometry.vertices[v];assert.ok(Math.hypot(m[0]*x+m[2]*y+m[4]-shown[0],m[1]*x+m[3]*y+m[5]-shown[1])<1e-8);}});
  assert.equal(completedSpatialCreases(pose).length,2);
});

test('zero-angle M/V stays unfolded and is not marked as a completed crease',()=>{
  const pose=spatialPose(document(0,0));assert.ok(pose.spatial!.vertices.every(p=>p[2]===0));assert.deepEqual(completedSpatialCreases(pose),[]);
});

test('default oblique camera handles a completely folded accordion without dropping thin regions',()=>{
  const previous=flatPose(),pose=spatialPose(document(180,-180),previous);
  assert.equal(pose.result.layers.status,'solved');assert.equal(pose.result.layers.faceOrder?.length,3);
  validateDiagramSpatialPose(pose,true);
});

test('coplanar layers come from a freshly solved previous pose, not its forged saved order',()=>{
  const previous=flatPose(),expected=spatialPose(document(180,-45),previous),forged=structuredClone(previous);
  forged.result.layers.faceOrders=forged.result.layers.faceOrders!.map(([a,b,s])=>[a,b,-s]);forged.result.layers.faceOrder=[...forged.result.layers.faceOrder!].reverse();
  const result=spatialPose(document(180,-45),forged);assert.deepEqual(result.result.layers.faceOrders,expected.result.layers.faceOrders);
});

test('import replaces forged current depth order and restores coplanar ancestry in chronological order',()=>{
  const first=flatPose(),second=spatialPose(document(180,-45),first),third=spatialPose(document(180,-90),second),saved=JSON.parse(JSON.stringify([first,second,third])) as DiagramPose[],expected=third.result.layers.faceOrders;
  saved[1].result.layers={status:'solved',message:'untrusted',faceOrders:[[0,1,1]],faceOrder:[2,1,0]};
  saved[2].result.layers={status:'solved',message:'untrusted',faceOrders:[[0,2,1]],faceOrder:[2,1,0]};
  prepareDiagramSpatialHistory(saved);assert.deepEqual(saved[2].result.layers.faceOrders,expected);assert.deepEqual(saved[2].displayOrder,saved[2].result.layers.faceOrder);
});

test('non-adjacent contacts can be independently proved by a chain of real folded hinges in the same region',()=>{
  const pose=spatialPose(document(180,-180),flatPose()),expected=structuredClone(pose.result.layers.faceOrders);
  const copied=JSON.parse(JSON.stringify(pose)) as DiagramPose;
  copied.result.layers={status:'solved',message:'forged',faceOrders:[[0,2,999]],faceOrder:[0,1,2]};
  restoreDiagramSpatialLayers(copied);
  assert.deepEqual(sortedOrders(copied.result.layers.faceOrders!),sortedOrders(expected!),'derive the relation from local physical hinges rather than trusting saved ranks');
});

test('a first edge-on spatial view retains the verified contacts of a flat predecessor',()=>{
  const doc=(angle:number)=>{const d=document(180,-180);d.segments.push({id:'fourth-face',a:[75,0],b:[75,90],assignment:'V',angle});return d;};
  const previous=flatPose(doc(180)),pose=spatialPose(doc(90),previous,{yaw:23,elevation:90});
  assert.equal(pose.result.layers.faceOrders!.length,0);
  assert.equal(diagramSpatialContactOrders(pose).length,3,'all three touching pairs survive their zero-area projection');
  const original=structuredClone([previous,pose]);
  for(const camera of [{yaw:30,elevation:35},{yaw:-40,elevation:-35},{yaw:0,elevation:180}]){
    const next=reprojectDiagramSpatialPose(pose,camera,JSON.parse(JSON.stringify([previous,pose])));
    assert.equal(next.result.layers.status,'solved');
    assert.deepEqual(next.spatial.vertices,pose.spatial!.vertices);
    assert.deepEqual(next.spatial.faceTransforms,pose.spatial!.faceTransforms);
    assert.deepEqual(next.spatial.measuredAngles,pose.spatial!.measuredAngles);
  }
  assert.deepEqual([previous,pose],original);
});

test('a closed strip with ambiguous coplanar banks is still rejected when there is no verified order or folded-hinge chain',()=>{
  const doc=document(90,90);
  doc.paper.width=150;doc.segments=doc.segments.filter(s=>s.id.startsWith('b')).map(s=>({...s,a:[s.a[0]*150/90,s.a[1]] as Point,b:[s.b[0]*150/90,s.b[1]] as Point}));
  for(let x=30;x<150;x+=30)doc.segments.push({id:'tube-'+x,a:[x,0],b:[x,90],assignment:'V',angle:90});
  assert.throws(()=>spatialPose(doc,undefined,{yaw:23,elevation:35}),/共面.*前一步/);
});

test('strict depth is rebuilt without trusting any saved certificate',()=>{
  const pose=spatialPose(document()),expected=structuredClone(pose.result.layers);pose.result.layers={status:'solved',message:'forged',faceOrders:[[0,1,-1]],faceOrder:[2,1,0]};
  restoreDiagramSpatialLayers(pose);assert.deepEqual(pose.result.layers.faceOrders,expected.faceOrders);
});

test('finite matrix layout, actual angles, material identity and both projections are validated',()=>{
  const original=spatialPose(document());
  const bad:(()=>DiagramPose)[]=[
    ()=>{const p=structuredClone(original);p.spatial!.faceTransforms[0].rotation[8]=2;return p;},
    ()=>{const p=structuredClone(original);p.spatial!.faceTransforms[1].translation[2]=NaN;return p;},
    ()=>{const p=structuredClone(original);p.spatial!.camera.yaw=Infinity;return p;},
    ()=>{const p=structuredClone(original);p.spatial!.vertices[0][2]=Infinity;return p;},
    ()=>{const p=structuredClone(original);p.spatial!.measuredAngles[0]=NaN;return p;},
    ()=>{const p=structuredClone(original);p.spatial!.faceTransforms[1].rotation.pop();return p;},
  ];
  for(const make of bad)assert.throws(()=>validateDiagramSpatialPose(make(),false));
  const altered=[
    ()=>{const p=structuredClone(original);p.spatial!.measuredAngles=p.spatial!.measuredAngles.map(v=>v===null?null:v+1);return p;},
    ()=>{const p=structuredClone(original);p.spatial!.vertices[0][0]+=.01;return p;},
    ()=>{const p=structuredClone(original);p.result.geometry.vertices[0][0]+=.01;return p;},
    ()=>{const p=structuredClone(original);p.result.geometry.graph!.edges_assignment[0]='M';return p;},
    ()=>{const p=structuredClone(original);p.spatial!.measuredAngles.pop();return p;},
  ];
  for(const make of altered)assert.throws(()=>validateDiagramSpatialPose(make(),true));
});

test('interior depth crossing is rejected as a real projected face intersection',()=>{
  assert.throws(()=>spatialPose(document(150,150)),/相交/);
});

test('top-down edge-on faces retain material identity without zero-sign layer certificates',()=>{
  const pose=spatialPose(document(90,0),undefined,{yaw:0,elevation:0});
  validateDiagramSpatialPose(pose,true);assert.equal(pose.result.geometry.faces.length,3);assert.equal(pose.result.layers.status,'solved');
  assert((pose.result.geometry.graph!.zhezhi_spatialEdgeOnFaces as number[]).length>0);assert(pose.result.layers.faceOrders!.every(row=>row[2]!==0));
});

test('camera reprojection reveals an edge-on 180-degree hinge from physical mountain/valley contact',()=>{
  const pose=spatialPose(document(90,180)),original=structuredClone(pose);
  assert.equal((pose.result.geometry.graph!.zhezhi_spatialEdgeOnFaces as number[]).length,2);
  for(const camera of [{yaw:-30,elevation:35},{yaw:30,elevation:30},{yaw:135,elevation:-45}]){
    const next={...pose,...reprojectDiagramSpatialPose(pose,camera)};
    assert.deepEqual(next.spatial!.vertices,pose.spatial!.vertices);
    assert.deepEqual(next.spatial!.faceTransforms,pose.spatial!.faceTransforms);
    assert.deepEqual(next.spatial!.measuredAngles,pose.spatial!.measuredAngles);
    assert.deepEqual(next.spatial!.camera.frame,pose.spatial!.camera.frame);
    assert.equal(next.result.layers.status,'solved');
    assert.ok(next.result.layers.faceOrders!.some(([a,b])=>a===1&&b===2||a===2&&b===1));
    const copied=structuredClone(next);copied.result.layers={status:'solved',message:'forged',faceOrders:[[1,2,999]],faceOrder:[2,1,0]};
    restoreDiagramSpatialLayers(copied);
    assert.deepEqual(copied.result.layers.faceOrders,next.result.layers.faceOrders,'the new contact must be independently rebuilt from the real hinge');
    validateDiagramSpatialPose(next,true);
  }
  assert.deepEqual(pose,original);
});

test('camera changes retain fixed material and leave supplied chronological history immutable',()=>{
  const first=flatPose(),pose=spatialPose(document(180,-45),first),history=[first,pose],before=structuredClone(history);
  const next=reprojectDiagramSpatialPose(pose,{yaw:-75,elevation:-25,frame:liftDiagramFoldMatrix([1,0,0,1,100,100])},history);
  assert.deepEqual(next.spatial.vertices,pose.spatial!.vertices);
  assert.deepEqual(next.spatial.camera.frame,pose.spatial!.camera.frame,'a camera gesture cannot redefine the fixed-face material frame');
  assert.deepEqual(history,before);
  const invalid=structuredClone(pose);invalid.spatial!.vertices[0][0]+=.1;
  assert.throws(()=>reprojectDiagramSpatialPose(invalid,{yaw:10,elevation:20},history),/空间姿态|CP 折角/);
  const changed=structuredClone(pose);changed.sourceDoc.segments.find(s=>s.id==='crease-2')!.angle=-44;
  assert.throws(()=>reprojectDiagramSpatialPose(changed,{yaw:10,elevation:20},history),/材料字段|来源 CP/);
});

test('camera can pass both poles and the underside while preserving physical geometry and restorable depth',()=>{
  const pose=spatialPose(document(90,180)),before=structuredClone(pose);
  for(const elevation of [89,90,91,135,180,225,270,315,360,-90,-180,-270,-360]){
    const next={...pose,...reprojectDiagramSpatialPose(pose,{yaw:23,elevation})};
    assert.equal(next.result.layers.status,'solved');validateDiagramSpatialPose(next,true);
    for(const key of ['vertices','faceTransforms','measuredAngles'] as const)assert.deepEqual(next.spatial![key],pose.spatial![key]);
    assert.deepEqual(next.spatial!.camera.frame,pose.spatial!.camera.frame);
    const restored=JSON.parse(JSON.stringify(next)) as DiagramPose;restoreDiagramSpatialLayers(restored);
    assert.deepEqual(restored.result.layers.faceOrders,next.result.layers.faceOrders);
  }
  assert.deepEqual(pose,before);
  for(const elevation of [NaN,Infinity,361,-361])assert.throws(()=>reprojectDiagramSpatialPose(pose,{yaw:0,elevation}),/空间视角/);
});

test('a saved edge-on predecessor retains verified physical contacts for the next visible step',()=>{
  const doc=(angle:number)=>{const d=document(180,-180);d.segments.push({id:'fourth-face',a:[75,0],b:[75,90],assignment:'V',angle});return d;};
  const first=flatPose(doc(180)),second=spatialPose(doc(90),first);
  const edgeOn={...second,...reprojectDiagramSpatialPose(second,{yaw:23,elevation:90})};
  assert.equal(edgeOn.result.layers.faceOrders!.length,0,'invisible contacts are not published as visible zero-normal orders');
  const chain=JSON.parse(JSON.stringify([first,second,edgeOn,second])) as DiagramPose[];
  chain[2].result.layers={status:'solved',message:'forged',faceOrders:[[0,2,999]]};
  prepareDiagramSpatialHistory(chain);
  assert.equal(chain[2].result.layers.faceOrders!.length,0);
  assert.deepEqual(chain[3].result.layers.faceOrders,second.result.layers.faceOrders);
  assert(chain[3].result.layers.faceOrders!.some(([a,b])=>a===0&&b===2||a===2&&b===0));
  const snapshot=cloneDiagramPoseWithSpatialProof(chain[2]);
  assert.deepEqual(reprojectDiagramSpatialPose(snapshot,second.spatial!.camera).result.layers.faceOrders,second.result.layers.faceOrders,'an unchanged internal paper snapshot retains its originating proof');
  assert.deepEqual(sortedOrders(reprojectDiagramSpatialPose(structuredClone(chain[2]),second.spatial!.camera).result.layers.faceOrders!),sortedOrders(second.result.layers.faceOrders!),'a clone can independently reconstruct this physical hinge chain without borrowing cached hidden evidence');
});

test('a live camera source retains verified non-adjacent contacts after projection cache eviction',()=>{
  const pose=spatialPose(document(180,-180),flatPose()),before=structuredClone(pose);
  for(let i=0;i<24;i++){
    const next=reprojectDiagramSpatialPose(pose,{yaw:-115+i*9,elevation:25});
    assert.equal(next.result.layers.faceOrders!.length,3);
    assert.deepEqual(next.spatial.vertices,pose.spatial!.vertices);
  }
  assert.deepEqual(pose,before);
});

test('cyclic local stacking survives a real ninety-degree tab and chronological spatial restore',()=>{
  // A dimension-generated square twist with a free triangular tab. This is
  // independent of saved user documents, CP IDs and layer certificates.
  const document=(angle:number):Doc=>{
    const segments:Segment[]=[],at=([x,y]:Point):Point=>[x*96,y*96+24];
    const add=(a:Point,b:Point,assignment:Segment['assignment'],angle:number)=>segments.push({id:'twist-'+segments.length,a:at(a),b:at(b),assignment,angle});
    const boundary:Point[]=[[0,0],[.375,-.25],[.75,0],[1,0],[1,1],[0,1]];
    boundary.forEach((a,i)=>add(a,boundary[(i+1)%boundary.length],'B',0));
    const center:Point[]=[[.375,.375],[.625,.375],[.625,.625],[.375,.625]],corners:Point[]=[[0,0],[1,0],[1,1],[0,1]],ends:Point[]=[[.75,0],[1,.75],[.25,1],[0,.25]];
    center.forEach((a,i)=>{add(a,center[(i+1)%4],'M',-180);add(a,corners[i],'M',-180);add(a,ends[i],'V',180);});
    add([0,0],[.75,0],'V',angle);
    return {schemaVersion:2,name:'合成方形扭折与铰接片',paper:{width:96,height:120},segments};
  };
  const previous=flatPose(document(180)),doc=document(90),source=buildDiagramFold(doc).graph;
  assert.equal(previous.result.layers.faceOrder,undefined,'the original twist needs local cyclic stacking');
  const root=source.faces_vertices!.findIndex(row=>row.every(v=>{const [x,y]=source.vertices_coords[v];return x>=36&&x<=60&&y>=60&&y<=84;}));
  assert.ok(root>=0);const r=17.3*Math.PI/180,c=Math.cos(r),s=Math.sin(r),fixed={point:[0,0] as Point,matrix:[c,s,-s,c,13.7,-8.1] as [number,number,number,number,number,number]},unchanged=JSON.stringify([doc,previous]);
  const pose:DiagramPose={sourceStateId:'tab',sourceRevision:0,sourceDoc:doc,...createDiagramSpatialPose(doc,root,fixed,previous)};
  validateDiagramSpatialPose(pose,true);assert.equal(pose.result.layers.status,'solved');assert.equal(pose.result.layers.faceOrder,undefined,'do not invent a whole-face ordering');
  assert.equal(pose.result.geometry.faces.length,10);assert.ok(pose.spatial!.vertices.some(p=>Math.abs(p[2])>12));
  for(const v of source.faces_vertices![root]){const expected=applyRigidFoldTransform(liftDiagramFoldMatrix(fixed.matrix),source.vertices_coords[v]);assert.ok(Math.hypot(...expected.map((n,k)=>n-pose.spatial!.vertices[v][k]))<1e-8);}
  const regions=modelOverlapRegions(pose.result);assert.equal(regions.omittedThinRegions,0);assert.ok(modelRegionLayers(pose.result,regions,'front').every(cell=>cell.layers.status==='ordered'));
  const restored=JSON.parse(JSON.stringify(pose)) as DiagramPose;restoreDiagramSpatialLayers(restored,previous);
  assert.equal(restored.result.layers.faceOrder,undefined);assert.deepEqual(restored.result.layers.faceOrders,pose.result.layers.faceOrders);assert.deepEqual(restored.spatial!.vertices,pose.spatial!.vertices);
  assert.equal(JSON.stringify([doc,previous]),unchanged);
});

test('lifting a mirrored 2D face uses a proper 3D rotation and never accepts shear',()=>{
  assert.deepEqual(liftDiagramFoldMatrix([-1,0,0,1,10,20]),{rotation:[-1,0,0,0,1,0,0,0,-1],translation:[10,20,0]});
  assert.throws(()=>liftDiagramFoldMatrix([1,0,.1,1,0,0]),/剪切/);
});

test('chronological restore retains coplanar ancestry when a complete binding exceeds the shared cache byte budget',()=>{
  // A large but legal source title expands the real bound graph without an
  // expensive synthetic mesh or access to private proof/cache internals.
  const large=(angle:number)=>({...document(180,angle),name:'大'.repeat(4_100_000)});
  const first=flatPose(large(-180)),second=spatialPose(large(-45),first),third=spatialPose(large(-90),first);
  const expected=structuredClone(third.result.layers.faceOrders),saved=structuredClone([first,second,third]);
  assert(JSON.stringify(buildDiagramFold(saved[1].sourceDoc).graph).length*2>8_000_000);
  saved[1].result.layers={status:'solved',message:'不可信导入层序',faceOrders:[[0,1,1]],faceOrder:[2,1,0]};
  saved[2].result.layers={status:'solved',message:'不可信导入层序',faceOrders:[[0,2,1]],faceOrder:[2,1,0]};
  prepareDiagramSpatialHistory(saved);
  assert.deepEqual(saved[2].result.layers.faceOrders,expected);
  assert.equal(spatialPose(large(-100),saved[2]).result.layers.status,'solved');
});

test('a living verified spatial predecessor survives shared cache eviction without accepting mutated evidence',()=>{
  const first=flatPose(),retained=spatialPose(document(180,-45),first),cloned=structuredClone(retained);
  // A matching cached value is also fully checked before its clone obtains
  // object-lifetime evidence; subsequent unrelated work must not revoke it.
  assert.equal(spatialPose(document(180,-85),cloned).result.layers.status,'solved');
  for(let i=0;i<18;i++)spatialPose(document(180,-20-i),first);
  assert.equal(spatialPose(document(180,-90),retained).result.layers.status,'solved');
  assert.equal(spatialPose(document(180,-95),cloned).result.layers.status,'solved');
  const original=structuredClone(retained.result.layers);
  retained.result.layers.faceOrders=retained.result.layers.faceOrders!.map(([a,b,s])=>[a,b,-s]);
  retained.result.layers.faceOrder=[...retained.result.layers.faceOrder!].reverse();
  const rebuilt=spatialPose(document(180,-100),retained),clean=spatialPose(document(180,-100),{...retained,result:{...retained.result,layers:original}});
  assert.deepEqual(rebuilt.result.layers,clean.result.layers,'a direct physical 180-degree hinge can rebuild its contact, but must not reuse the mutated saved relation');
  retained.result.layers=original;
  retained.sourceDoc.segments.find(s=>s.id==='crease-2')!.angle=-46;
  assert.throws(()=>spatialPose(document(180,-100),retained),/材料字段|空间姿态|来源 CP/);
});
