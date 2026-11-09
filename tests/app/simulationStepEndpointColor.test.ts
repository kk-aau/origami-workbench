import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramSingleLayerCornerFixture} from '../fixtures/diagramStepAnimationScope';
import {diagramFourthCornerColorFixture} from '../fixtures/simulationStepColors';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {planVerifiedSimulationStepAnimation} from '../../src/engine/simStepPlanning';
import {createSimulationStepPathEvaluator,planSimulationStepPath} from '../../src/engine/simStepPath';
import {buildSimulationStepLayerTimeline,simulationStepLayerOrderAt} from '../../src/engine/simStepLayerTimeline';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {SimulationRasterizer} from '../../src/engine/simRaster';
import {DEFAULT_SIMULATION_VIEW} from '../../src/engine/simViewCube';
import {simulationPaperColorSettings} from '../../src/engine/simColors';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {cameraUniforms,centroid,boundingRadius,type OrbitView,type Mat3} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';

const settings={...simulationPaperColorSettings('#FF0000','#0000FF','#222222')!,background:[1,1,1],showFaces:true,showEdges:false,lighting:false,faceAlpha:1} as RenderSettings;
function fixtureData(fixture:ReturnType<typeof diagramSingleLayerCornerFixture>|ReturnType<typeof diagramFourthCornerColorFixture>){
  const saved=exportDiagramProject(fixture.project),project=importDiagramProject(saved),clip=buildDiagramStepAnimation(project,fixture.stepId),{prepared}=prepareSimulationDocument(clip.fold),planned=planVerifiedSimulationStepAnimation(clip.fold,clip.animation,undefined,{initialGeometry:clip.initialGeometry}),path=createSimulationStepPathEvaluator(prepared,planned.animation,planned.animation.motion!);
  const rest=new OrigamiModel(prepared).originalPositions,center=centroid(rest),radius=boundingRadius(rest,center);
  // Pins identify hard anchors, not the complete stationary material. Sample
  // the actual verified path away from either contact endpoint so unlocked old
  // neighbours do not become part of the moving-corner colour oracle.
  const initial=path.evaluate(0),samples=[path.evaluate(.37),path.evaluate(.61)];
  const moving=prepared.facesVertices.flatMap((face,f)=>samples.some(positions=>face.some(v=>Math.hypot(...[0,1,2].map(k=>positions[v*3+k]-initial[v*3+k]))>1e-7))?[f]:[]);
  assert.equal(moving.length,1,'the independent colour oracle follows one actual moving material triangle');
  const movingSource=prepared.triangleSourceFaces![moving[0]],movingIndices=prepared.indices.slice(moving[0]*3,moving[0]*3+3);
  return {fixture,saved,clip,prepared,animation:planned.animation,path,center,radius,movingSource,movingIndices};
}
function renderModels(data:ReturnType<typeof fixtureData>){
  const original={indices:data.prepared.indices,edgesVertices:[],edgesAssignment:[],sourceFaces:data.prepared.triangleSourceFaces!};
  // A second legal fan of every intact source polygon changes old material
  // diagonals. The moving original triangle and all source-face identities stay
  // unchanged; these are two tessellations of the same material, not cut cells.
  const triangles:number[][]=[],sourceFaces:number[]=[];
  data.clip.fold.faces_vertices!.forEach((ring,source)=>{
    const shifted=[ring.at(-1)!,...ring.slice(0,-1)];for(let i=1;i+1<shifted.length;i++){triangles.push([shifted[0],shifted[i],shifted[i+1]]);sourceFaces.push(source);}
  });
  const alternate={...original,indices:Uint32Array.from(triangles.flat()),sourceFaces};
  const reverse=Array.from({length:original.indices.length/3},(_,f)=>f).reverse();
  return [original,alternate,{...original,indices:Uint32Array.from(reverse.flatMap(f=>Array.from(original.indices.slice(f*3,f*3+3)))),sourceFaces:reverse.map(f=>original.sourceFaces[f])}];
}
function assertMovingCornerComplete(data:ReturnType<typeof fixtureData>,view:OrbitView,progress:number,positions=data.path.evaluate(progress),center=data.center){
  const raster=new SimulationRasterizer(),camera=cameraUniforms(view,center,data.radius,640,400),rows=simulationStepLayerOrderAt(data.prepared,data.animation,data.animation.layerTimeline!,progress),reference=raster.render(positions,{indices:data.movingIndices,edgesVertices:[],edgesAssignment:[]},camera,settings).slice();
  const models=renderModels(data),back=Math.cos(view.pitch)<0;let checked=0,red=0;
  for(let p=0;p<reference.length;p+=4)if(reference[p+1]===0){checked++;if(reference[p]===255)red++;}
  assert.ok(checked>300,'the oracle checks the moving paper interior, not an empty background');
  if(progress===1&&view.pitch<Math.PI/2)assert.ok(red>300,'the newly contacted paper front is visible above the blue stationary layer');
  for(const model of models){
    const actual=raster.render(positions,model,camera,settings,undefined,{triangleSourceFaces:model.sourceFaces,faceOrders:rows});let wrong=0;
    for(let p=0;p<reference.length;p+=4)if(reference[p+1]===0){
      // Looking from underneath, the intact lower sheet hides the moving
      // corner's initial red front. Its blue BACK is the visible exterior.
      const expected=back?[0,0,255]:Array.from(reference.slice(p,p+3));
      if(actual[p]!==expected[0]||actual[p+1]!==expected[1]||actual[p+2]!==expected[2])wrong++;
    }
    assert.equal(wrong,0,`the complete known top corner stays visible at ${progress}, pitch ${view.pitch}; no triangle may reveal covered material`);
  }
  return {checked,red};
}

const views:OrbitView[]=[DEFAULT_SIMULATION_VIEW,{yaw:-.35,pitch:.55,zoom:.88},{yaw:0,pitch:0,zoom:.88},{yaw:0,pitch:Math.PI,zoom:.88},{yaw:.7,pitch:.8,roll:.31,zoom:.88},{yaw:.7,pitch:Math.PI+.8,roll:-.41,zoom:.88}];

test('newly contacted paper front covers the whole corner at the exact 100% endpoint, across views and tessellations',()=>{
  const data=fixtureData(diagramSingleLayerCornerFixture()),savedPose=data.path.evaluate(1).slice();
  const rows=simulationStepLayerOrderAt(data.prepared,data.animation,data.animation.layerTimeline!,1);assert.ok(rows.some(([a,b,s])=>a===1&&b===data.movingSource&&s===-1),'the certified new-contact order is known before checking pixels');
  for(const view of views)for(const p of [0,.99,1,0,1])assertMovingCornerComplete(data,view,p);
  assert.deepEqual(data.path.evaluate(1),savedPose);assert.equal(exportDiagramProject(data.fixture.project),data.saved);
});

test('the real CP3-to-CP4 drawing with a rotated front or mirrored back view preserves the complete new-contact colour',()=>{
  for(const side of ['front','back'] as const){
    const data=fixtureData(diagramFourthCornerColorFixture(side,37));assert.equal(data.clip.beforeLabel,'CP3');assert.equal(data.clip.afterLabel,'CP4');
    assert.equal(data.fixture.project.steps[3].pose!.view!.side,side);assert.equal(data.fixture.project.steps[3].pose!.view!.rotation,37);
    for(const view of views.slice(0,4))for(const p of [0,.99,1,.99,1])assertMovingCornerComplete(data,view,p);
    assert.equal(exportDiagramProject(data.fixture.project),data.saved);
  }
});

test('proper world rotation and translation retain contact colour without moving material to another depth layer',()=>{
  const data=fixtureData(diagramSingleLayerCornerFixture()),angle=.43,c=Math.cos(angle),s=Math.sin(angle),rotation:Mat3=[c,-s,0,s,c,0,0,0,1],inverse:Mat3=[c,s,0,-s,c,0,0,0,1],translation=[.123,.217,-.319];
  const transform=(x:number,y:number,z:number)=>[rotation[0]*x+rotation[1]*y+rotation[2]*z+translation[0],rotation[3]*x+rotation[4]*y+rotation[5]*z+translation[1],rotation[6]*x+rotation[7]*y+rotation[8]*z+translation[2]];
  const animation={...structuredClone(data.animation),initialPositions:Array.from({length:data.prepared.vertexCount},(_,v)=>transform(...data.animation.initialPositions.slice(v*3,v*3+3) as [number,number,number])).flat()},path=createSimulationStepPathEvaluator(data.prepared,animation,animation.motion!),rotated={...data,animation,path},center=transform(...data.center) as [number,number,number],saved=structuredClone(animation);
  for(const view of views.slice(0,4))for(const p of [0,.99,1,0,1])assertMovingCornerComplete(rotated,{...view,orient:inverse},p,path.evaluate(p),center);
  assert.deepEqual(animation,saved);assert.equal(exportDiagramProject(data.fixture.project),data.saved);
});

test('five consecutive exact half-turns retain the independently visible intact panel after arbitrary seed rotations and translations',()=>{
  const n=6,vertices_coords=Array.from({length:n+1},(_,i)=>[i,0]).concat(Array.from({length:n+1},(_,i)=>[i,1])),edges_vertices:Array<[number,number]>=[],edges_assignment:string[]=[],edges_foldAngle:number[]=[];
  const edge=(a:number,b:number,kind:string,angle:number)=>{edges_vertices.push([a,b]);edges_assignment.push(kind);edges_foldAngle.push(angle);};
  for(let i=0;i<n;i++){edge(i,i+1,'B',0);edge(n+1+i,n+2+i,'B',0);}edge(0,n+1,'B',0);edge(n,2*n+1,'B',0);
  for(let i=1;i<n;i++)edge(i,n+1+i,i%2?'V':'M',i%2?180:-180);
  const fold={vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices:Array.from({length:n},(_,i)=>[i,i+1,n+2+i,n+1+i])},savedFold=structuredClone(fold);
  const dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
  const rotate=(point:number[],degrees:number[])=>{
    let [x,y,z]=point;
    for(let axis=0;axis<3;axis++){
      const a=degrees[axis]*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
      if(axis===0)[y,z]=[c*y-s*z,s*y+c*z];
      if(axis===1)[x,z]=[c*x+s*z,-s*x+c*z];
      if(axis===2)[x,y]=[c*x-s*y,s*x+c*y];
    }
    return [x,y,z];
  };
  for(const euler of [[17,33,45],[1e-10,33,1e-10]])for(const translation of [[0,0,0],[1e-12,-1e-12,1e-12],[1000,-1000,1000]]){
    const {prepared}=prepareSimulationDocument(fold),original=new OrigamiModel(prepared).originalPositions;
    const initialPositions=Array.from({length:prepared.vertexCount},(_,v)=>rotate(Array.from(original.slice(v*3,v*3+3)),euler).map((x,i)=>x+translation[i])).flat();
    const fixedVertices=[...new Set(prepared.facesVertices.flatMap((face,i)=>prepared.triangleSourceFaces![i]===0?face:[]))];
    const animation:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions,fixedVertices,ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:c.targetAngle}))};
    animation.motion=planSimulationStepPath(prepared,animation);
    const timeline=buildSimulationStepLayerTimeline(prepared,animation,{sourceFaceCount:n,faceOrders:[]}),savedAnimation=structuredClone(animation),path=createSimulationStepPathEvaluator(prepared,animation,animation.motion);
    const pose=path.evaluate(1),approach=path.evaluate(.999),normal=rotate([0,1,0],euler),center=centroid(Float32Array.from(initialPositions)),radius=boundingRadius(Float32Array.from(initialPositions),center),raster=new SimulationRasterizer();
    assert.equal(timeline.at(-1)!.faceOrders.length,n*(n-1)/2,'all six coincident panels have a complete trusted contact relation');
    assert.equal(path.angles(1).filter(a=>Math.abs(a)===180).length,5,'the real endpoint contains five full half-turns');
    for(const back of [false,true]){
      const camera=cameraUniforms({yaw:-.35,pitch:back?Math.PI+.55:.55,zoom:.88},center,radius,520,360),eye=camera.center.map((x,i)=>x+camera.camDist*camera.rotation[i+6]),side=Math.sign(dot(normal,eye.map((x,i)=>x-center[i])));
      // Determine the outside material from the genuine noncoplanar approach,
      // independently of both the contact rows and the raster depth winner.
      const heights=Array.from({length:n},(_,source)=>{
        const vertices=[...new Set(prepared.facesVertices.flatMap((face,i)=>prepared.triangleSourceFaces![i]===source?face:[]))];
        return vertices.reduce((sum,v)=>sum+dot(Array.from(approach.slice(v*3,v*3+3)).map((x,i)=>x-center[i]),normal),0)/vertices.length*side;
      });
      const sorted=heights.slice().sort((a,b)=>b-a);assert.ok(sorted[0]-sorted[1]>1e-5,'the independent approach oracle distinguishes its top material panel');
      const top=heights.indexOf(sorted[0]),indices=Uint32Array.from(prepared.facesVertices.flatMap((face,i)=>prepared.triangleSourceFaces![i]===top?face:[]));
      const oracle=raster.render(pose,{indices,edgesVertices:[],edgesAssignment:[]},camera,settings).slice(),actual=raster.render(pose,prepared,camera,settings,undefined,{triangleSourceFaces:prepared.triangleSourceFaces!,faceOrders:timeline.at(-1)!.faceOrders});
      let checked=0,wrong=0;
      for(let y=1;y<359;y++)for(let x=1;x<519;x++){
        const pixel=(y*520+x)*4;
        // Erode the reference mask by one pixel so round-off at the shared
        // silhouette cannot substitute for a missing material interior.
        if([pixel,pixel-4,pixel+4,pixel-520*4,pixel+520*4].some(p=>oracle[p+1]!==0))continue;
        checked++;if(actual[pixel]!==oracle[pixel]||actual[pixel+1]!==0||actual[pixel+2]!==oracle[pixel+2])wrong++;
      }
      assert.ok(checked>400,'an intact panel interior is actually tested');assert.equal(wrong,0,`no covered colour leaks through five full folds, Euler ${euler}, translation ${translation}, back ${back}`);
    }
    path.evaluate(0);path.evaluate(.26);assert.deepEqual(path.evaluate(1),pose,'seek order does not perturb an exact contact pose');
    assert.deepEqual(animation,savedAnimation);assert.deepEqual(fold,savedFold);
  }
});
