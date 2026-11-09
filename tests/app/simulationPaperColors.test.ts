import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {defaultModelColors} from '../../src/app/modelColors';
import {buildDiagramStepAnimation} from '../../src/app/diagramStepAnimation';
import {adoptDiagramPose,createDiagramProject,updateDiagramCP} from '../../src/app/diagramProject';
import {applyDiagramFoldSegments} from '../../src/app/diagramFoldLink';
import {defaultModelView} from '../../src/app/modelViewState';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {simulationPaperColorSettings} from '../../src/engine/simColors';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {SimulationRasterizer} from '../../src/engine/simRaster';
import {DEFAULT_SIMULATION_VIEW} from '../../src/engine/simViewCube';
import {createSimulationStepRigidDriver} from '../../src/engine/simStepRigid';
import {simulationStepFoldProfile} from '../../src/engine/simStepAnimation';
import {diagramSingleLayerCornerFixture} from '../fixtures/diagramStepAnimationScope';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {cameraUniforms,centroid,boundingRadius} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';

function projectFixture(){
  const before=blankDoc('配色',100,100);let nextId=0;
  let project=createDiagramProject(before,()=>`colors-${++nextId}`);const stepId=project.activeStepId;
  project=adoptDiagramPose(project,stepId,project.steps[0].beforeId,computeFlatGeometry(buildDiagramFold(before).graph,1e-6));
  const after=applyDiagramFoldSegments(before,[{id:'new',a:[50,0],b:[50,100],assignment:'V',angle:180}]);
  return {project:updateDiagramCP(project,project.steps[0].afterId,after),stepId};
}

test('step animation copies the displayed paper palette rather than simulator defaults',()=>{
  const {project,stepId}=projectFixture();
  assert.deepEqual(buildDiagramStepAnimation(project,stepId).colors,defaultModelColors());
  const colors={front:'#cc3311',back:'#1199ee',line:'#554433'};
  project.steps[0].pose!.view={...defaultModelView(),colors};
  const clip=buildDiagramStepAnimation(project,stepId);
  assert.deepEqual(clip.colors,colors);
  clip.colors.front='#ffffff';
  assert.equal(project.steps[0].pose!.view!.colors!.front,'#cc3311','preview colour changes cannot alter the drawing');
});

test('current drawing colours win when animation geometry comes from an older flat archive',()=>{
  const {project,stepId}=projectFixture(),step=project.steps[0],flat=structuredClone(step.pose!);
  flat.view={...defaultModelView(),colors:{front:'#112233',back:'#223344',line:'#334455'}};
  step.pose!.view={...defaultModelView(),colors:{front:'#aaccee',back:'#eeddcc',line:'#336633'}};
  step.paperStates={active:'pulled',flat,pulled:structuredClone(step.pose!)};
  assert.deepEqual(buildDiagramStepAnimation(project,stepId).colors,step.pose!.view.colors);
  delete step.pose!.view.colors;
  assert.deepEqual(buildDiagramStepAnimation(project,stepId).colors,defaultModelColors(),'an archived palette must not replace the currently displayed default');
});

test('reflected orbit rendering preserves the correct material colour from either paper side',()=>{
  const {prepared}=prepareSimulationDocument(buildDiagramFold(blankDoc('纸张',100,100)).graph);
  const positions=new OrigamiModel(prepared).originalPositions,colors={front:'#cc3311',back:'#1199ee',line:'#554433'};
  const settings={...simulationPaperColorSettings(colors.front,colors.back,colors.line)!,background:[1,1,1],showFaces:true,showEdges:false,lighting:false,faceAlpha:1} as RenderSettings;
  const renderer=new SimulationRasterizer();
  for(const reversed of [false,true])for(const back of [false,true]){
    const camera=cameraUniforms({yaw:0,pitch:back?Math.PI:0,zoom:.8},[0,0,0],1,160,160);
    const indices=reversed?Uint32Array.from(prepared.indices,(_,i)=>prepared.indices[Math.floor(i/3)*3+(2-i%3)]):prepared.indices;
    const image=renderer.render(positions,{...prepared,indices},camera,settings);
    const expected=back!==reversed?[0x11,0x99,0xee]:[0xcc,0x33,0x11];
    assert.deepEqual(Array.from(image.slice((80*160+80)*4,(80*160+80)*4+3)),expected,`${back?'back':'front'} camera with ${reversed?'turned':'original'} material must agree with the drawing`);
  }
});

test('drawing line ink colours borders and both crease directions without altering the geometry',()=>{
  const positions=new Float32Array([-1,0,-1,1,0,-1,1,0,1,-1,0,1,-.7,0,0,.7,0,0]);
  const camera=cameraUniforms({yaw:0,pitch:0,zoom:.8},[0,0,0],1,120,120),renderer=new SimulationRasterizer();
  const settings={...simulationPaperColorSettings('#ffffff','#ffffff','#554433')!,background:[1,1,1],showFaces:true,showEdges:true,creaseWidthPx:2,lighting:false,faceAlpha:1} as RenderSettings;
  const saved=positions.slice();
  for(const assignment of ['B','M','V'] as const){
    const image=renderer.render(positions,{indices:new Uint32Array([0,1,2,0,2,3]),edgesVertices:[[4,5]],edgesAssignment:[assignment]},camera,settings);
    let ink=0;
    for(let p=0;p<image.length;p+=4)if(image[p]===0x55&&image[p+1]===0x44&&image[p+2]===0x33)ink++;
    assert.ok(ink>40,`${assignment} uses the drawing line colour`);
  }
  assert.deepEqual(positions,saved);
});

test('ordinary 3D two-colour commands preserve assignment inks and reject malformed palettes atomically',()=>{
  const prior={mountainColor:[1,0,0],valleyColor:[0,0,1],borderColor:[0,0,0]};
  const next={...prior,...simulationPaperColorSettings('#aabbcc','#ddeeff')!};
  assert.deepEqual(next.mountainColor,prior.mountainColor);assert.deepEqual(next.valleyColor,prior.valleyColor);assert.deepEqual(next.borderColor,prior.borderColor);
  for(const args of [[null,'#ffffff'],['#ffffff',{}],['#ffffff','#eeeeee','bad'],['#123','#ffffff'],['#ffffff','#000000',null]]){
    assert.equal(simulationPaperColorSettings(...args as [unknown,unknown,unknown?]),null);
  }
});

test('coplanar opposite paper colours do not form triangular patches under the actual isometric camera',()=>{
  const sheet=[[-.8731416,.01234567,-.725362],[.967322,.01234567,-.725362],[.967322,.01234567,.845719],[-.8731416,.01234567,.845719]];
  // The first sheet has one diagonal; the opposite-facing sheet has a distinct
  // off-centre fan. Quantised projection gives the fan a false depth gradient.
  const positions=new Float32Array([...sheet.flat(),...sheet.flat(),.1733819,.01234567,-.213747]);
  const first=new Uint32Array([0,1,2,0,2,3]),second=new Uint32Array([4,8,5,5,8,6,6,8,7,7,8,4]);
  const camera=cameraUniforms(DEFAULT_SIMULATION_VIEW,[.12,.01234567,-.04],1.4,720,480);
  const settings={frontColor:[1,0,0],backColor:[0,0,1],background:[1,1,1],showFaces:true,showEdges:false,lighting:false,faceAlpha:1} as RenderSettings;
  const renderer=new SimulationRasterizer(),model={indices:first,edgesVertices:[],edgesAssignment:[]};
  const reference=renderer.render(positions,model,camera,settings).slice();
  for(const [front,rear] of [[first,second],[second,first]]){
    const expected=renderer.render(positions,{...model,indices:front},camera,settings).slice();
    const combined=renderer.render(positions,{...model,indices:new Uint32Array([...front,...rear])},camera,settings);
    let patches=0;
    for(let p=0;p<expected.length;p+=4)if(expected[p]!==combined[p]||expected[p+2]!==combined[p+2])patches++;
    assert.equal(patches,0,'the first exactly coincident material sheet must own every covered pixel, regardless of tessellation');
  }
  // Keep actual layer separation stronger than the tie rule. Fixing coplanar
  // precision must not flatten the micro-gap used by solved layer rendering.
  for(let v=4;v<9;v++)positions[v*3+1]+=5e-5;
  const nearer=renderer.render(positions,{...model,indices:new Uint32Array([...first,...second])},camera,settings).slice();
  const nearerReference=renderer.render(positions,{...model,indices:second},camera,settings);
  let verified=0;
  for(let p=0;p<reference.length;p+=4)if(reference[p]+reference[p+2]===255&&nearerReference[p]+nearerReference[p+2]===255){
    assert.deepEqual(Array.from(nearer.slice(p,p+3)),Array.from(nearerReference.slice(p,p+3)));
    verified++;
  }
  assert.ok(verified>10000,'a real 5e-5 material gap must still select the nearer layer');
});

test('the actual single-layer animation keeps the stationary overlapping paper one colour at start and halfway',()=>{
  const fixture=diagramSingleLayerCornerFixture(),clip=buildDiagramStepAnimation(fixture.project,fixture.stepId),{prepared}=prepareSimulationDocument(clip.fold);
  const rest=new OrigamiModel(prepared).originalPositions,center=centroid(rest),radius=boundingRadius(rest,center),driver=createSimulationStepRigidDriver(prepared,clip.animation);
  const width=1098,height=542,camera=cameraUniforms(DEFAULT_SIMULATION_VIEW,center,radius,width,height);
  const settings={...simulationPaperColorSettings(clip.colors.front,clip.colors.back,clip.colors.line)!,lightDir:[-.3,.5,1],background:[.941,.953,.937],showFaces:true,showEdges:false,lighting:true,faceAlpha:1} as RenderSettings;
  // A free neighbouring panel can still stay stationary: its unchanged old
  // hinge is rigid unless a separately planned release actually opens it.
  // Follow material motion rather than treating every unpinned face as moving.
  const at=(progress:number)=>{
    const angles=new Map(simulationStepFoldProfile(clip.animation,progress).ranges.map(r=>[r.edge,r.fromAngle]));
    return driver(prepared.creaseParams.map(c=>angles.get(c.edge)!));
  };
  const initial=at(0),samples=[at(.37),at(.61)],stationary:number[]=[],moving:number[]=[];
  prepared.facesVertices.forEach((face,index)=>{
    const moves=samples.some(positions=>face.some(v=>Math.hypot(...[0,1,2].map(k=>positions[v*3+k]-initial[v*3+k]))>1e-7));
    (moves?moving:stationary).push(...prepared.indices.slice(index*3,index*3+3));
  });
  assert.equal(moving.length,3,'the actual one-corner action moves exactly one material triangle');
  const renderer=new SimulationRasterizer(),model={indices:new Uint32Array(stationary),edgesVertices:[],edgesAssignment:[]};
  for(const progress of [0,.5]){
    const angles=new Map(simulationStepFoldProfile(clip.animation,progress).ranges.map(r=>[r.edge,r.fromAngle]));
    const positions=driver(prepared.creaseParams.map(c=>angles.get(c.edge)!));
    const body=renderer.render(positions,model,camera,settings).slice();
    const full=renderer.render(positions,{...model,indices:prepared.indices},camera,settings).slice();
    const activity=renderer.render(positions,{...model,indices:new Uint32Array(moving)},camera,{...settings,frontColor:[0,0,0],backColor:[0,0,0],background:[1,1,1],lighting:false});
    let bodyRed=0,bodyBlue=0,verified=0;
    for(let p=0;p<body.length;p+=4){
      if(body[p]>body[p+1]*2&&body[p]>body[p+2]*2)bodyRed++;
      if(body[p+2]>body[p]*2&&body[p+2]>body[p+1]*1.5)bodyBlue++;
      if(activity[p]===255&&body[p]>body[p+1]*2&&body[p]>body[p+2]*2){
        assert.deepEqual(Array.from(full.slice(p,p+3)),Array.from(body.slice(p,p+3)),'moving-paper colour must not leak into a stationary coplanar triangle');verified++;
      }
    }
    assert.equal(bodyBlue,0,`${progress}: exactly coincident stationary layers do not form red/blue tessellation patches`);
    assert.ok(bodyRed>10000&&verified>10000);
  }
});
