import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRigidFoldTransform,solveRigidFoldGeometry,type RigidFoldPoint3,type RigidFoldGeometryResult} from '../../src/core/rigidFoldGeometry';
import type {FoldGraph} from '../../src/core/types';

type V=RigidFoldPoint3;
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scale=(a:V,s:number):V=>a.map(n=>n*s) as V;
const add=(a:V,b:V):V=>a.map((n,i)=>n+b[i]) as V;
const unit=(a:V)=>scale(a,1/Math.hypot(...a));
function ready(result:RigidFoldGeometryResult){assert.equal(result.status,'ready',result.message);if(result.status!=='ready')throw Error(result.message);return result;}
function near(a:number,b:number,tolerance=1e-8){assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);}
function nearPoint(a:V,b:V,tolerance=1e-8){a.forEach((n,i)=>near(n,b[i],tolerance));}
function strip(angle=90,second=-45):FoldGraph {
  return {vertices_coords:[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,7],[7,6],[6,5],[5,4],[4,0],[1,5],[2,6]],
    edges_assignment:['B','B','B','B','B','B','B','B','V','M'],
    edges_foldAngle:[0,0,0,0,0,0,0,0,angle,second],faces_vertices:[[0,1,5,4],[1,2,6,5],[2,3,7,6]]};
}
function checkDistances(graph:FoldGraph,vertices:V[]){
  for(const face of graph.faces_vertices!)for(const a of face)for(const b of face){
    near(Math.hypot(...sub(vertices[a],vertices[b])),Math.hypot(graph.vertices_coords[a][0]-graph.vertices_coords[b][0],graph.vertices_coords[a][1]-graph.vertices_coords[b][1]));
  }
}

test('signed absolute angles produce a real 3D accordion with unchanged stationary face',()=>{
  const graph=strip(),before=structuredClone(graph),result=ready(solveRigidFoldGeometry(graph));
  nearPoint(result.vertices[2],[1,0,1]);nearPoint(result.vertices[3],[1+Math.SQRT1_2,0,1+Math.SQRT1_2]);
  for(const v of graph.faces_vertices![0])nearPoint(result.vertices[v],[...graph.vertices_coords[v],0]);
  near(result.measuredAngles[8]!,90);near(result.measuredAngles[9]!,-45);checkDistances(graph,result.vertices);
  assert.equal(result.collisionChecked,false);assert.equal(result.continuousPathCertified,false);
  assert.deepEqual(result.faces,graph.faces_vertices);assert.deepEqual(graph,before);
  for(let f=0;f<result.faces.length;f++)for(const v of result.faces[f]){
    const {rotation:r,translation:t}=result.faceTransforms[f],[x,y]=graph.vertices_coords[v];
    nearPoint(result.vertices[v],[r[0]*x+r[1]*y+t[0],r[3]*x+r[4]*y+t[1],r[6]*x+r[7]*y+t[2]]);
    nearPoint(applyRigidFoldTransform(result.faceTransforms[f],[x,y]),result.vertices[v]);
  }
});

test('zero, tiny, partial and 180 degree endpoints retain true requested angles',()=>{
  for(const angle of [0,.001,17,90,179.99,180]){
    const graph=strip(angle,-angle),result=ready(solveRigidFoldGeometry(graph));
    near(result.measuredAngles[8]!,angle,1e-7);near(result.measuredAngles[9]!,-angle,1e-7);
    nearPoint(result.vertices[2],[1+Math.cos(angle*Math.PI/180),0,Math.sin(angle*Math.PI/180)]);
    assert.equal(graph.edges_assignment[8],'V');assert.equal(graph.edges_assignment[9],'M');
  }
});

test('explicit targets replace existing folded CP angles instead of adding another rotation',()=>{
  const graph=strip(180,-180),targets=[...graph.edges_foldAngle];targets[8]=30;targets[9]=-120;
  const result=ready(solveRigidFoldGeometry(graph,{edgesFoldAngle:targets}));
  nearPoint(result.vertices[2],[1+Math.sqrt(3)/2,0,.5]);
  near(result.measuredAngles[8]!,30);near(result.measuredAngles[9]!,-120);
  assert.equal(graph.edges_foldAngle[8],180);
});

test('changing the stationary face fixes that whole face and preserves all targets',()=>{
  const graph=strip();
  for(const startingFace of [0,1,2]){
    const result=ready(solveRigidFoldGeometry(graph,{startingFace}));
    for(const v of graph.faces_vertices![startingFace])nearPoint(result.vertices[v],[...graph.vertices_coords[v],0]);
    near(result.measuredAngles[8]!,90);near(result.measuredAngles[9]!,-45);checkDistances(graph,result.vertices);
  }
});

test('a stationary rigid world frame is preserved exactly, including an already flipped paper face',()=>{
  const graph=strip(),rotation=[1,0,0,0,-1,0,0,0,-1],translation:V=[10,20,30];
  const plain=ready(solveRigidFoldGeometry(graph)),result=ready(solveRigidFoldGeometry(graph,{fixedFaceTransform:{rotation,translation}}));
  plain.vertices.forEach(([x,y,z],i)=>nearPoint(result.vertices[i],[x+10,-y+20,-z+30]));
  near(result.measuredAngles[8]!,90);near(result.measuredAngles[9]!,-45);
  for(const rotation of [[2,0,0,0,1,0,0,0,1],[1,0,0,0,1,0,0,0,-1]])assert.equal(solveRigidFoldGeometry(graph,{fixedFaceTransform:{rotation,translation}}).status,'invalid');
});

test('edge direction and source ring winding never reverse mountain/valley meaning',()=>{
  const graph=strip(),reference=ready(solveRigidFoldGeometry(graph));
  graph.edges_vertices=graph.edges_vertices.map(([a,b])=>[b,a]);
  graph.faces_vertices=graph.faces_vertices!.map((face,i)=>i%2?[...face].reverse():face);
  const result=ready(solveRigidFoldGeometry(graph));result.vertices.forEach((p,i)=>nearPoint(p,reference.vertices[i]));
  near(result.measuredAngles[8]!,90);near(result.measuredAngles[9]!,-45);
});

/** Independent spherical construction: ray 3 lies on the intersection of a
 * sphere and the sector planes, not on the candidate's spanning tree. */
function spherical(theta:number){
  const s=Math.sqrt(3)/2,rays:V[]=[[1,0,0],[.5,s,0],[-s,.5,0],[0,-1,0]];
  const [u0,u1]=rays,u2=add(add(scale(rays[2],Math.cos(theta)),scale(cross(u1,rays[2]),Math.sin(theta))),scale(u1,dot(u1,rays[2])*(1-Math.cos(theta))));
  const projected=sub(u2,scale(u0,dot(u2,u0))),expected=dot(rays[2],rays[3]),n2=dot(projected,projected),base=scale(projected,expected/n2),height=Math.sqrt(1-expected*expected/n2),side=scale(unit(cross(u0,projected)),height),a=add(base,side),b=sub(base,side),u3=dot(a,rays[3])>dot(b,rays[3])?a:b;
  const world:V[]=[u0,u1,u2,u3,[0,0,0]],graph:FoldGraph={vertices_coords:rays.map(([x,y])=>[x,y]).concat([[0,0]]),edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]],edges_assignment:['B','B','B','B','U','U','U','U'],edges_foldAngle:[0,0,0,0,0,0,0,0],faces_vertices:[[0,1,4],[1,2,4],[2,3,4],[3,0,4]]};
  const normals=graph.faces_vertices!.map(([a,b,c])=>unit(cross(sub(world[b],world[a]),sub(world[c],world[a]))));
  for(let ray=0;ray<4;ray++){
    const left=(ray+3)%4,right=ray,axis=unit(sub(world[4],world[ray]));
    graph.edges_foldAngle[ray+4]=Math.atan2(dot(normals[right],cross(normals[left],axis)),dot(normals[left],normals[right]))*180/Math.PI;
  }
  return {graph,world};
}

test('a genuine coupled closed mechanism matches independent sphere-plane coordinates',()=>{
  for(const theta of [.05,.3,.8,1.1]){
    const {graph,world}=spherical(theta),result=ready(solveRigidFoldGeometry(graph));
    result.vertices.forEach((p,i)=>nearPoint(p,world[i]));checkDistances(graph,result.vertices);
    graph.edges_foldAngle.forEach((angle,e)=>near(result.measuredAngles[e]!,angle!));
  }
});

test('incompatible closed-loop angles fail instead of returning a separated or stretched preview',()=>{
  const {graph}=spherical(.8);graph.edges_foldAngle=graph.edges_foldAngle.map(a=>a!*.5);
  const result=solveRigidFoldGeometry(graph);assert.equal(result.status,'inconsistent');
  assert.ok(!('vertices' in result));assert.match(result.message,/闭合|冲突/);
});

test('a non-tree hinge conflict is detected even when every shared vertex closes',()=>{
  const graph:FoldGraph={vertices_coords:[[0,0],[1,0],[1,1],[0,1],[.5,.5]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]],edges_assignment:['B','B','B','B','U','U','U','U'],edges_foldAngle:[0,0,0,0,0,0,0,0],faces_vertices:[[0,1,4],[1,2,4],[2,3,4],[3,0,4]]};
  // Edge 6 closes the alternate material path; all tree targets remain zero.
  graph.edges_foldAngle[6]=45;
  const result=solveRigidFoldGeometry(graph);assert.equal(result.status,'inconsistent');
  assert.equal('code' in result?result.code:'','DIHEDRAL');
  assert.equal(result.diagnostics?.maximumClosureErrorMm,0);
});

test('holes retain indexed rings, and inactive internal F marks move with their material face',()=>{
  const annulus:FoldGraph={vertices_coords:[[0,0],[3,0],[3,3],[0,3],[1,1],[1,2],[2,2],[2,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]],edges_assignment:Array(8).fill('B'),edges_foldAngle:Array(8).fill(0),faces_vertices:[[0,1,2,3]],faces_holes:[[[4,5,6,7]]]};
  const before=structuredClone(annulus),result=ready(solveRigidFoldGeometry(annulus));assert.deepEqual(annulus,before);assert.equal(result.vertices.length,8);assert.deepEqual(result.faces,[[0,1,2,3]]);
  const graph=strip();graph.vertices_coords.push([1.25,.25],[1.75,.75]);graph.edges_vertices.push([8,9]);graph.edges_assignment.push('F');graph.edges_foldAngle.push(0);
  const marked=ready(solveRigidFoldGeometry(graph));nearPoint(marked.vertices[8],[1,.25,.25]);nearPoint(marked.vertices[9],[1,.75,.75]);assert.equal(marked.measuredAngles[10],null);
});

test('unknown angles, wrong signs and incomplete hinge topology are refused without mutation',()=>{
  for(const angle of [null,NaN,Infinity,181,-45]){
    const graph=strip();graph.edges_foldAngle[8]=angle;const before=structuredClone(graph),result=solveRigidFoldGeometry(graph);
    assert.equal(result.status,'invalid');assert.deepEqual(graph,before);
  }
  const graph=strip();graph.faces_vertices!.pop();assert.equal(solveRigidFoldGeometry(graph).status,'invalid');
  assert.equal(solveRigidFoldGeometry(strip(),{startingFace:12}).status,'invalid');
});

test('disconnected paper and ambiguous cut-bank edge ownership are not silently repositioned',()=>{
  const graph=strip();graph.edges_assignment[8]='B';assert.equal(solveRigidFoldGeometry(graph).status,'invalid');
  const square:FoldGraph={vertices_coords:[[0,0],[1,0],[1,1],[0,1],[3,0],[4,0],[4,1],[3,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]],edges_assignment:Array(8).fill('B'),edges_foldAngle:Array(8).fill(0),faces_vertices:[[0,1,2,3],[4,5,6,7]]};
  const result=solveRigidFoldGeometry(square);assert.equal(result.status,'unsupported');assert.ok(!('vertices' in result));
  const duplicate=strip();duplicate.edges_vertices.push([1,5]);duplicate.edges_assignment.push('V');duplicate.edges_foldAngle.push(90);assert.equal(solveRigidFoldGeometry(duplicate).status,'invalid');
});

test('the same mechanism remains rigid across small and large coordinate scales',()=>{
  for(const factor of [1e-5,1,1e5]){
    const graph=strip();graph.vertices_coords=graph.vertices_coords.map(([x,y])=>[x*factor,y*factor]);
    const result=ready(solveRigidFoldGeometry(graph));nearPoint(result.vertices[2],[factor,0,factor],factor*1e-7);near(result.measuredAngles[8]!,90);
  }
});
