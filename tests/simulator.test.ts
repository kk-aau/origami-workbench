import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFold } from '../src/core/geometry';
import type { Doc } from '../src/core/types';
import { prepareSimulationDocument } from '../src/engine/simmodel';
import {simulationObjText,simulationStlText} from '../src/engine/simExport';
import {displaySettings,simulationFoldSnapshot,strainInk} from '../src/engine/simDisplay';
import {pickSimulationVertex,simulationDragTarget} from '../src/engine/simInteraction';
import {SimulationRasterizer} from '../src/engine/simRaster';
import {cameraUniforms,projectVertices} from '../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import { OrigamiModel } from '../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import { ReferenceSolver } from '../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';

const singleCrease = (angle = -180) => ({
  vertices_coords: [[0,0],[1,0],[2,0],[2,1],[1,1],[0,1]],
  edges_vertices: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],
  edges_assignment: ['B','B','B','B','B','B',angle > 0 ? 'V' : 'M'],
  edges_foldAngle: [null,null,null,null,null,null,angle],
  faces_vertices: [[0,1,4,5],[1,2,3,4]],
});

const splitCrease = (bendDegrees = 0, angle = -180) => {
  // A two-segment crease between the same endpoints. A 5° turn moves its
  // midpoint only about 0.022 sheet units, but must remain a real vertex.
  const middleX = 1 + 0.5 * Math.tan((bendDegrees / 2) * Math.PI / 180);
  return {
    vertices_coords: [[0,0],[1,0],[2,0],[2,1],[1,1],[0,1],[middleX,0.5]],
    edges_vertices: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,6],[6,4]],
    edges_assignment: ['B','B','B','B','B','B','M','M'],
    edges_foldAngle: [null,null,null,null,null,null,angle,angle],
    faces_vertices: [[0,1,6,4,5],[1,2,3,4,6]],
  };
};

test('simulation builds and computes a 225-face paper without a 200-face cap', () => {
  const doc: Doc = { name: '225 面网格', paper: { width: 150, height: 150 }, segments: [] };
  for (let i = 0; i <= 15; i++) {
    const boundary = i === 0 || i === 15;
    doc.segments.push(
      { id: `h${i}`, a: [0, i * 10], b: [150, i * 10], assignment: boundary ? 'B' : 'M', angle: boundary ? 0 : -180 },
      { id: `v${i}`, a: [i * 10, 0], b: [i * 10, 150], assignment: boundary ? 'B' : 'V', angle: boundary ? 0 : 180 },
    );
  }
  const original = structuredClone(doc);
  const { graph } = buildFold(doc);
  assert.equal(graph.faces_vertices?.length, 225);
  const { prepared } = prepareSimulationDocument(graph);
  assert.equal(prepared.faceCount, 450);
  const model = new OrigamiModel(prepared);
  const solver = new ReferenceSolver(model, { foldPercent: 5, timeStepScale: 0.35, damping: 0.5 });
  try {
    solver.step(20);
    const positions = new Float32Array(prepared.vertexCount * 3);
    solver.readPositions(positions);
    assert.ok(Array.from(positions).every(Number.isFinite));
    assert.ok(positions.some((v, i) => i % 3 === 1 && Math.abs(v) > 1e-8));
  } finally { solver.dispose(); }
  assert.deepEqual(doc, original);
});

test('simulation triangulates quads without modifying the editor document', () => {
  const source = singleCrease();
  const original = structuredClone(source);
  const { prepared } = prepareSimulationDocument(source);
  assert.deepEqual(source, original);
  assert.equal(prepared.faceCount, 4);
  assert.ok(prepared.edgesAssignment.includes('F'));
  assert.ok(prepared.creaseParams.some(crease => crease.targetAngle === -180));
});

test('simulation display modes control actual face visibility, transparency and strain colouring',()=>{
  const base={showFaces:true,showEdges:true,faceAlpha:1,lighting:true} as Parameters<typeof displaySettings>[0];
  assert.equal(displaySettings(base,'wireframe').showFaces,false);
  assert.equal(displaySettings(base,'xray').faceAlpha,.36);
  assert.equal(displaySettings(base,'strain').colorMode,'strain');
  assert.equal(displaySettings(base,'strain').lighting,false);
  assert.notEqual(strainInk(0),strainInk(.05));
});

test('CPU surface occlusion uses perspective depth per pixel, independent of triangle order',()=>{
  const camera={center:[0,0,0] as [number,number,number],rotation:[1,0,0,0,1,0,0,0,1] as const,scale:40,width:96,height:96,depthRange:2,camDist:3.2};
  const footprint=[[-.8,-.8],[.8,-.8],[0,.8]],z=[.9,-.8,-.8];
  const positions=new Float32Array([...footprint.flatMap(([x,y],i)=>[x*(3.2-z[i])/3.2,y*(3.2-z[i])/3.2,z[i]]),...footprint.flatMap(([x,y])=>[x,y,0])]);
  const settings={frontColor:[1,0,0],backColor:[0,0,1],background:[1,1,1],showFaces:true,showEdges:false,lighting:false,faceAlpha:1} as Parameters<SimulationRasterizer['render']>[3];
  const raster=new SimulationRasterizer(),model={indices:new Uint32Array([0,1,2,5,4,3]),edgesVertices:[],edgesAssignment:[]};
  const first=raster.render(positions,model,camera,settings).slice();
  const reverse=raster.render(positions,{...model,indices:new Uint32Array([5,4,3,0,1,2])},camera,settings);
  assert.deepEqual(reverse,first,'triangle order cannot decide which sheet is visible');
  const projected=projectVertices(positions,camera).screen;
  const [ax,ay,bx,by,cx,cy]=Array.from(projected.slice(0,6)),area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
  let verified=0,nonlinear=0;
  for(let y=20;y<76;y++)for(let x=20;x<76;x++){
    const wb=((x+.5-ax)*(cy-ay)-(y+.5-ay)*(cx-ax))/area,wc=((bx-ax)*(y+.5-ay)-(by-ay)*(x+.5-ax))/area,wa=1-wb-wc;
    if(Math.min(wa,wb,wc)<.03)continue;
    const q=wa/(3.2-.9)+(wb+wc)/(3.2+.8),front=q>1/3.2;
    if(Math.abs(q-1/3.2)<1e-6)continue;
    assert.equal(first[(y*96+x)*4],front?255:0);
    assert.equal(first[(y*96+x)*4+2],front?0:255);
    nonlinear+=Number(front!==(wa*.9+(wb+wc)*-.8>0));verified++;
  }
  assert.ok(verified>500&&nonlinear>50,'covers pixels misclassified by linear view depth');
});

test('CPU paper hides nearby rear creases and resolves coincident sheets consistently',()=>{
  const camera={center:[0,0,0] as [number,number,number],rotation:[1,0,0,0,1,0,0,0,1] as const,scale:40,width:96,height:96,depthRange:2,camDist:3.2};
  const positions=new Float32Array([-1,-1,0,1,-1,0,0,1,0,-.4,0,-.0001,.4,0,-.0001]);
  const model={indices:new Uint32Array([0,1,2]),edgesVertices:[[3,4] as [number,number]],edgesAssignment:['M' as const]};
  const settings={frontColor:[1,1,1],backColor:[1,1,1],background:[0,0,0],mountainColor:[1,0,0],valleyColor:[0,0,1],borderColor:[0,0,0],creaseWidthPx:1.6,creaseDepthBias:.000002,showFaces:true,showEdges:true,lighting:false,faceAlpha:1} as Parameters<SimulationRasterizer['render']>[3];
  const raster=new SimulationRasterizer(),pixels=raster.render(positions,model,camera,settings);
  for(let x=40;x<56;x++)assert.deepEqual(Array.from(pixels.slice((48*96+x)*4,(48*96+x)*4+3)),[255,255,255],'back-layer red ink is fully hidden');
  const overlap={...model,indices:new Uint32Array([0,1,2,2,1,0]),edgesVertices:[],edgesAssignment:[]};
  settings.frontColor=[1,0,0];settings.backColor=[0,0,1];
  const stable=raster.render(positions,overlap,camera,settings).slice();
  assert.deepEqual(raster.render(positions,overlap,camera,settings),stable);
  assert.deepEqual(Array.from(stable.slice((48*96+48)*4,(48*96+48)*4+3)),[255,0,0],'the first coincident face owns the pixel');
});

test('dragging a picked vertex follows the cursor in screen space without changing its camera depth',()=>{
  const positions=new Float32Array([.3,.2,-.1,2,0,0]);
  const camera=cameraUniforms({yaw:.4,pitch:.6,zoom:.88},[0,0,0],2,800,600);
  const screen=projectVertices(positions,camera).screen;
  const pick=pickSimulationVertex(positions,camera,screen[0],screen[1],12);
  assert.equal(pick?.index,0);
  assert.equal(pickSimulationVertex(positions,camera,screen[0]+50,screen[1]+50,12),null);
  const target=simulationDragTarget(pick!,camera,screen[0]+40,screen[1]-25);
  const projected=projectVertices(new Float32Array(target),camera);
  assert.ok(Math.abs(projected.screen[0]-screen[0]-40)<1e-4);
  assert.ok(Math.abs(projected.screen[1]-screen[1]+25)<1e-4);
  assert.ok(Math.abs(projected.view[2]-pick!.depth)<1e-5);
});

test('exported simulation FOLD contains current 3D vertices but does not claim target angles as measured angles',()=>{
  const {prepared}=prepareSimulationDocument(singleCrease());
  const original=structuredClone(prepared.fold);
  const positions=prepared.positions.slice();positions[4]=.25;
  const exported=simulationFoldSnapshot(prepared,positions,.5,120);
  assert.deepEqual(exported.vertices_coords[1],[1,0,.25]);
  assert.equal(exported.vertices_coords.length,prepared.vertexCount);
  assert.deepEqual(exported.frame_classes,['foldedForm']);
  assert.deepEqual(exported.frame_attributes,['3D']);
  assert.equal(exported.edges_foldAngle,undefined);
  assert.deepEqual(prepared.fold,original);
  const broken=positions.slice();broken[1]=Infinity;
  assert.throws(()=>simulationFoldSnapshot(prepared,broken,.5,120),/三维顶点/);
});

test('CPU solver genuinely folds a crease and M/V lead to opposite 3D states', () => {
  const results = [-180, 180].map(angle => {
    const { prepared } = prepareSimulationDocument(singleCrease(angle));
    const model = new OrigamiModel(prepared);
    const solver = new ReferenceSolver(model, { foldPercent: 50, timeStepScale: 0.35, damping: 0.5 });
    solver.step(8000);
    const positions = new Float32Array(prepared.vertexCount * 3);
    solver.readPositions(positions);
    assert.ok(Array.from(positions).every(Number.isFinite));
    assert.ok(Math.max(...Array.from(positions).filter((_, i) => i % 3 === 1).map(Math.abs)) > 0.02, 'vertices move out of the original paper plane');
    assert.ok((solver.readDiagnostics().maxEdgeStrain ?? Infinity) < 0.03);
    solver.reset();
    const reset = new Float32Array(positions.length);
    solver.readPositions(reset);
    assert.deepEqual(reset, model.originalPositions);
    solver.dispose();
    return positions;
  });
  for (let i = 1; i < results[0].length; i += 3) assert.ok(Math.abs(results[0][i] + results[1][i]) < 1e-5);
  assert.ok(results[0][1 * 3 + 1] > results[0][0 * 3 + 1], 'mountain ridge rises toward the paper front (+Y)');
  assert.ok(results[1][1 * 3 + 1] < results[1][0 * 3 + 1], 'valley crease falls away from the paper front (+Y)');
});

test('zero target is flat and is not confused with unknown target', () => {
  const flat = singleCrease(0);
  const { prepared } = prepareSimulationDocument(flat);
  const model = new OrigamiModel(prepared);
  const solver = new ReferenceSolver(model, { foldPercent: 100 });
  solver.step(200);
  const positions = new Float32Array(prepared.vertexCount * 3);
  solver.readPositions(positions);
  for (let i = 1; i < positions.length; i += 3) assert.equal(positions[i], 0);
  const unknown = singleCrease();
  unknown.edges_foldAngle[6] = null;
  assert.throws(() => prepareSimulationDocument(unknown), /目标角未知/);
});

test('split straight crease merges, while a five-degree bend retains its vertex and both driven segments', () => {
  const straight = prepareSimulationDocument(splitCrease());
  assert.equal(straight.prepared.vertexCount, 6);
  assert.equal(straight.prepared.creaseParams.filter(crease => crease.targetAngle === -180).length, 1);

  const bent = prepareSimulationDocument(splitCrease(5));
  assert.equal(bent.prepared.vertexCount, 7);
  assert.equal(bent.prepared.creaseParams.filter(crease => crease.targetAngle === -180).length, 2);
  assert.ok(bent.prepared.fold.vertices_coords.some(point =>
    Math.abs(point[0] - splitCrease(5).vertices_coords[6][0]) < 1e-10));
});

test('merging two explicit zero-degree M targets does not turn them into the default 180-degree fold', () => {
  const { prepared } = prepareSimulationDocument(splitCrease(0, 0));
  assert.equal(prepared.vertexCount, 6);
  const driven = prepared.creaseParams.filter(crease => prepared.edgesAssignment[crease.edge] === 'M');
  assert.equal(driven.length, 1);
  assert.equal(driven[0].targetAngle, 0);
});

test('straight crease sections with different target angles are not averaged together', () => {
  const source = splitCrease();
  source.edges_foldAngle[6] = -90;
  const { prepared } = prepareSimulationDocument(source);
  assert.equal(prepared.vertexCount, 7);
  const targets = prepared.creaseParams
    .filter(crease => prepared.edgesAssignment[crease.edge] === 'M')
    .map(crease => crease.targetAngle)
    .sort((a, b) => a - b);
  assert.deepEqual(targets, [-180, -90]);
});

test('driven mountain and valley lines must border two paper faces', () => {
  for (const angle of [-90, 90]) {
    const oneSide = singleCrease(angle);
    oneSide.faces_vertices.pop();
    assert.throws(() => prepareSimulationDocument(oneSide), /第 7 条山谷折线没有连接两侧纸面/);
  }
  const detached = singleCrease();
  detached.edges_vertices.push([0, 2]);
  detached.edges_assignment.push('M');
  detached.edges_foldAngle.push(-90);
  assert.throws(() => prepareSimulationDocument(detached), /第 8 条山谷折线没有连接两侧纸面/);

  const flatBoundary = singleCrease(0);
  flatBoundary.faces_vertices.pop();
  assert.doesNotThrow(() => prepareSimulationDocument(flatBoundary));

  const vanishing = singleCrease();
  vanishing.vertices_coords[4] = [1, 0];
  assert.throws(() => prepareSimulationDocument(vanishing), /第 7 条山谷折线过短或端点重合/);
});

test('mesh cleanup may not silently remove one side of a driven crease', () => {
  const source = singleCrease();
  source.vertices_coords.push([1, 0.5]);
  source.faces_vertices[1] = [1, 4, 6]; // Collinear triangle: present in the input, dropped by cleanup.
  assert.throws(() => prepareSimulationDocument(source), /第 7 条山谷折线.*未进入折叠求解/);
});

test('2D and flat 3D FOLD coordinates have the same simulation basis', () => {
  const two = singleCrease();
  const three = { ...two, vertices_coords: two.vertices_coords.map(v => [...v, 0]) };
  assert.deepEqual(prepareSimulationDocument(two).prepared.positions, prepareSimulationDocument(three).prepared.positions);
});

test('invalid and unsupported geometry yields Chinese errors before native algorithms', () => {
  assert.throws(() => prepareSimulationDocument({}), /顶点/);
  assert.throws(() => prepareSimulationDocument({ ...singleCrease(), faces_vertices: [] }), /纸面/);
  const nonfinite = singleCrease(); nonfinite.vertices_coords[0][0] = Infinity;
  assert.throws(() => prepareSimulationDocument(nonfinite), /坐标无效/);
  const cut = singleCrease(); cut.edges_assignment[6] = 'C';
  assert.throws(() => prepareSimulationDocument(cut), /切割或连接/);
  const nonmanifold = singleCrease(); nonmanifold.faces_vertices.push([0,1,4,5]);
  assert.throws(() => prepareSimulationDocument(nonmanifold), /非流形/);
});

test('OBJ and STL export the same current 3D triangles with correctly oriented unit normals', () => {
  const {prepared}=prepareSimulationDocument(singleCrease(-90));
  const solver=new ReferenceSolver(new OrigamiModel(prepared),{foldPercent:60,timeStepScale:.35,damping:.5});
  const positions=new Float32Array(prepared.vertexCount*3);
  try{solver.step(8000);solver.readPositions(positions);}finally{solver.dispose();}
  const original=positions.slice();
  const obj=simulationObjText(prepared,positions),stl=simulationStlText(prepared,positions);
  assert.deepEqual(positions,original,'export does not change the solver snapshot');
  assert.equal(simulationObjText(prepared,positions),obj,'export is deterministic');
  const objVertices=obj.split('\n').filter(line=>line.startsWith('v ')).map(line=>line.slice(2).split(' ').map(Number));
  const objNormals=obj.split('\n').filter(line=>line.startsWith('vn ')).map(line=>line.slice(3).split(' ').map(Number));
  const objFaces=obj.split('\n').filter(line=>line.startsWith('f ')).map(line=>line.slice(2).split(' ').map(token=>token.split('//').map(Number)));
  assert.equal(objVertices.length,prepared.vertexCount);
  assert.equal(objNormals.length,prepared.faceCount);
  assert.equal(objFaces.length,prepared.faceCount);
  assert.ok(objVertices.some(vertex=>Math.abs(vertex[2])>.01),'exported pose is actually folded');
  objVertices.forEach((vertex,i)=>{
    assert.ok(Math.abs(vertex[0]-positions[3*i])<1e-6);
    assert.ok(Math.abs(vertex[1]+positions[3*i+2])<1e-6);
    assert.ok(Math.abs(vertex[2]-positions[3*i+1])<1e-6);
  });
  objFaces.forEach((face,i)=>{
    assert.equal(face.length,3);
    assert.deepEqual(face.map(([vertex])=>vertex-1),Array.from(prepared.indices.slice(3*i,3*i+3)));
    assert.ok(face.every(([,normal])=>normal===i+1));
    const [a,b,c]=face.map(([vertex])=>objVertices[vertex-1]);
    const u=b.map((value,axis)=>value-a[axis]),v=c.map((value,axis)=>value-a[axis]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const normal=objNormals[i];
    const length=Math.hypot(...normal),alignment=cross.reduce((sum,value,axis)=>sum+value*normal[axis],0);
    assert.ok(Math.abs(length-1)<1e-6,'one unit normal per triangle');
    assert.ok(alignment>0,'normal follows face winding');
  });
  const facets=stl.match(/^  facet normal /gm)??[];
  const stlVertices=stl.split('\n').filter(line=>line.trimStart().startsWith('vertex ')).map(line=>line.trim().slice(7).split(' ').map(Number));
  assert.equal(facets.length,prepared.faceCount);
  assert.equal(stlVertices.length,prepared.faceCount*3);
  objFaces.forEach((face,i)=>face.forEach(([vertex],corner)=>{
    objVertices[vertex-1].forEach((value,axis)=>assert.ok(Math.abs(stlVertices[3*i+corner][axis]-value)<1e-6));
  }));
});

test('mesh exports reject nonfinite positions, broken topology, and collapsed triangles', () => {
  const {prepared}=prepareSimulationDocument(singleCrease());
  assert.throws(()=>simulationObjText(prepared,new Float32Array(3)),/顶点数量/);
  const nonfinite=prepared.positions.slice();nonfinite[0]=Number.NaN;
  assert.throws(()=>simulationObjText(prepared,nonfinite),/有限坐标/);
  assert.throws(()=>simulationStlText(prepared,nonfinite),/有限坐标/);
  const invalid={...prepared,indices:prepared.indices.slice()};invalid.indices[0]=prepared.vertexCount;
  assert.throws(()=>simulationObjText(invalid,prepared.positions),/索引无效/);
  const collapsed=prepared.positions.slice(),[a,b]=prepared.indices;
  collapsed.set(collapsed.slice(3*a,3*a+3),3*b);
  assert.throws(()=>simulationStlText(prepared,collapsed),/退化/);
});
