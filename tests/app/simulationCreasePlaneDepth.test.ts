import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationRasterizer} from '../../src/engine/simRaster';
import {cameraUniforms,toViewSpace,projectViewPoint,type OrbitView} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import {creasePlaneInverseDepthGradient} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/creasePlaneDepth';
import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import {meshTopologyFor} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import {renderMeshToSvg} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/svgRenderer';

type V=[number,number,number];
const settings:RenderSettings={frontColor:[.7,.8,.7],backColor:[.9,.9,.8],mountainColor:[1,0,0],valleyColor:[0,0,1],borderColor:[0,0,0],lightDir:[0,0,1],background:[1,1,1],showFaces:true,showEdges:true,lighting:false,creaseWidthPx:1.6,faceAlpha:1,creaseDepthBias:1e-7,creaseWritesDepth:false};
const redPixels=(pixels:Uint8ClampedArray)=>{
  let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]===255&&pixels[i+1]===0&&pixels[i+2]===0)count++;return count;
};

function planarPair(view:OrbitView,visible:boolean,normalSign=1,rotate=0){
  const gap=5e-5,quad:V[]=[[-.8,0,-.8],[.8,0,-.8],[.8,0,.8],[-.8,0,.8]],lower=quad,upper=quad.map(([x,,z])=>[x,gap,z] as V);
  const rotatePoint=([x,y,z]:V):V=>[Math.cos(rotate)*x-Math.sin(rotate)*y,Math.sin(rotate)*x+Math.cos(rotate)*y,z];
  const normal:V=[-Math.sin(rotate),Math.cos(rotate),0],camera=cameraUniforms(view,[0,0,0],1,800,600);
  const eyeNormal=normal.reduce((sum,n,axis)=>sum+n*camera.rotation[6+axis],0),frontY=eyeNormal>=0?gap:0,edgeY=visible?frontY:gap-frontY;
  const positions=new Float32Array([...lower,...upper,[-.5,edgeY,0],[.5,edgeY,0]].map(p=>rotatePoint(p as V)).flat());
  return {positions,model:{indices:new Uint32Array([0,1,2,0,2,3,4,5,6,4,6,7]),edgesVertices:[[8,9]] as [number,number][],edgesAssignment:['M'] as const},camera,normal:normal.map(n=>n*normalSign) as V};
}

test('planar crease ribbons follow the surface at front, back, rolled and rotated oblique views',()=>{
  for(const view of [
    {yaw:-.35,pitch:0,zoom:.88},{yaw:-.35,pitch:.1,zoom:.88},{yaw:-.35,pitch:.55,zoom:.88},
    {yaw:1.1,pitch:1.1,roll:.4,zoom:.88},{yaw:-.8,pitch:Math.PI-.55,roll:-.2,zoom:.88},
  ])for(const normalSign of [-1,1])for(const rotate of [0,.37]){
    const hidden=planarPair(view,false,normalSign,rotate),visible=planarPair(view,true,normalSign,rotate),raster=new SimulationRasterizer();
    const before=hidden.positions.slice();
    assert.equal(redPixels(raster.render(hidden.positions,hidden.model,hidden.camera,{...settings,creasePlaneNormal:hidden.normal})),0,`the wholly buried edge stays hidden: ${JSON.stringify({view,normalSign,rotate})}`);
    assert.ok(redPixels(raster.render(visible.positions,visible.model,visible.camera,{...settings,creasePlaneNormal:visible.normal}))>40,'the visible surface keeps its own crease');
    assert.deepEqual(hidden.positions,before);
  }
});

test('without an explicit plane, existing bent/moving-mesh rendering keeps its previous behaviour',()=>{
  const fixture=planarPair({yaw:-.35,pitch:.55,zoom:.88},false),raster=new SimulationRasterizer();
  const old=redPixels(raster.render(fixture.positions,fixture.model,fixture.camera,settings));
  assert.ok(old>100,'regression fixture exposes the former centre-line depth bug without the opt-in');
  assert.equal(redPixels(raster.render(fixture.positions,fixture.model,fixture.camera,{...settings,creasePlaneNormal:[0,0,0]})),old);
  assert.equal(redPixels(raster.render(fixture.positions,fixture.model,fixture.camera,{...settings,creaseDepthBias:0,creasePlaneNormal:fixture.normal})),0,'the fix works even without depth bias');
});

test('inverse-depth gradients agree with exact perspective projection on an arbitrary world plane',()=>{
  const anchor:V=[.1,.3,-.2],u:V=[.7,.2,.1],v:V=[-.2,.1,.8],normal:V=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  for(const pitch of [.3,1.3,2.6]){
    const camera=cameraUniforms({yaw:.7,pitch,roll:.2,zoom:.9},[.03,-.02,.05],1,800,600),view=toViewSpace(...anchor,camera),screen=projectViewPoint(view,camera),q=1/(camera.camDist-view[2]),gradient=creasePlaneInverseDepthGradient(normal,camera,view)!;
    assert.ok(gradient);
    for(const [a,b] of [[-.4,.2],[.3,-.2],[.2,.4]]){
      const point=anchor.map((n,k)=>n+a*u[k]+b*v[k]) as V,otherView=toViewSpace(...point,camera),otherScreen=projectViewPoint(otherView,camera),expected=1/(camera.camDist-otherView[2]),actual=q+gradient[0]*(otherScreen[0]-screen[0])+gradient[1]*(otherScreen[1]-screen[1]);
      assert.ok(Math.abs(expected-actual)<1e-12,`${expected} vs ${actual}`);
    }
  }
  const camera=cameraUniforms({yaw:0,pitch:0,zoom:1},[0,0,0],1,100,100);
  assert.equal(creasePlaneInverseDepthGradient(undefined,camera,[0,0,0]),null);
  assert.equal(creasePlaneInverseDepthGradient([0,0,0],camera,[0,0,0]),null);
  assert.equal(creasePlaneInverseDepthGradient([NaN,1,0],camera,[0,0,0]),null);
  assert.equal(creasePlaneInverseDepthGradient([1,0,0],camera,[0,0,0]),null,'a plane through the eye has no finite screen-depth gradient');
});

test('planar SVG stacks do not promote a buried stroke through an oblique sheet',()=>{
  for(const view of [
    {yaw:-.35,pitch:0,zoom:.88},{yaw:-.35,pitch:.55,zoom:.88},
    {yaw:.8,pitch:1.1,roll:.4,zoom:.88},{yaw:-.8,pitch:Math.PI-.55,roll:-.2,zoom:.88},
  ]){
    const hidden=planarPair(view,false),visible=planarPair(view,true),render=(fixture:ReturnType<typeof planarPair>,normal=true)=>renderMeshToSvg(fixture.positions,meshTopologyFor(fixture.model),fixture.camera,{...settings,...normal?{creasePlaneNormal:fixture.normal}:{}})!.svg;
    assert.doesNotMatch(render(hidden),/stroke="#ff0000"/,'the buried line is covered in the vector export');
    assert.match(render(visible),/stroke="#ff0000"/,'the visible plane retains its own stroke');
    if(view.pitch===.55)assert.match(render(hidden,false),/stroke="#ff0000"/,'ordinary SVG callers retain the previous ink-straddle behaviour');
  }
});
