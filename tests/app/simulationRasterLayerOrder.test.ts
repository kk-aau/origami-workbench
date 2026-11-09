import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationRasterizer,type SimulationRasterLayerOrder} from '../../src/engine/simRaster';
import {simulationPaperColorSettings} from '../../src/engine/simColors';
import {cameraUniforms,type CameraUniforms,type Mat3} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';

const settings={frontColor:[1,0,0],backColor:[0,0,1],background:[1,1,1],showFaces:true,showEdges:false,lighting:false,faceAlpha:1} as RenderSettings;
const model=(indices:Uint32Array)=>({indices,edgesVertices:[],edgesAssignment:[]});
const centre=(pixels:Uint8ClampedArray,camera:CameraUniforms)=>Array.from(pixels.slice((Math.floor(camera.height/2)*camera.width+Math.floor(camera.width/2))*4,(Math.floor(camera.height/2)*camera.width+Math.floor(camera.width/2))*4+3));
const trianglePair=new Float32Array([-.6,0,.6,.6,0,.6,0,0,-.6,-.6,0,.6,.6,0,.6,0,0,-.6]);

test('certified coplanar paper order wins over triangle IDs from both sides and either material winding',()=>{
  const raster=new SimulationRasterizer();
  for(const reversed of [false,true])for(const sign of [-1,1])for(const back of [false,true]){
    const first=reversed?[0,2,1]:[0,1,2],second=reversed?[3,4,5]:[3,5,4];
    const camera=cameraUniforms({yaw:0,pitch:back?Math.PI:0,zoom:.8},[0,0,0],1,160,160);
    const frontFace=sign===-1?(reversed?1:0):(reversed?0:1),expectedFace=back?1-frontFace:frontFace;
    const expected=centre(raster.render(trianglePair,model(Uint32Array.from(expectedFace?second:first)),camera,settings),camera);
    for(const bottomFirst of [false,true]){
      const indices=Uint32Array.from(bottomFirst?[...second,...first]:[...first,...second]);
      const certificate:SimulationRasterLayerOrder={triangleSourceFaces:bottomFirst?[1,0]:[0,1],faceOrders:[[0,1,sign]]};
      assert.deepEqual(centre(raster.render(trianglePair,model(indices),camera,settings,undefined,certificate),camera),expected,`sign ${sign}, reversed ${reversed}, back ${back}, reordered ${bottomFirst}`);
    }
  }
});

function fanFixture(){
  const points=[[-.8731416,-.725362],[.967322,-.725362],[.967322,.845719],[-.8731416,.845719]];
  const lift=([x,z]:number[])=>[x,.1234567+x*.257136+z*.343273,z];
  const positions=new Float32Array([...points.flatMap(lift),...points.flatMap(lift),...lift([.1733819,-.213747])]);
  const first=new Uint32Array([0,1,2,0,2,3]),second=new Uint32Array([4,8,5,5,8,6,6,8,7,7,8,4]);
  const camera=cameraUniforms({yaw:-.35,pitch:.55,zoom:.88},[.12,.12,-.04],1.4,720,480);
  return {positions,first,second,camera};
}

test('different tessellations of a tilted Float32 coplanar sheet have one certified visible material',()=>{
  const {positions,first,second,camera}=fanFixture(),raster=new SimulationRasterizer();
  const expected=raster.render(positions,model(first),camera,settings).slice();
  const indices=new Uint32Array([...second,...first]),certificate:SimulationRasterLayerOrder={triangleSourceFaces:[1,1,1,1,0,0],faceOrders:[[0,1,1]]};
  const actual=raster.render(positions,model(indices),camera,settings,undefined,certificate).slice();
  let checked=0;
  for(let p=0;p<expected.length;p+=4)if(expected[p+1]===0){
    assert.deepEqual(Array.from(actual.slice(p,p+3)),Array.from(expected.slice(p,p+3)),`pixel ${p/4}`);checked++;
  }
  assert.ok(checked>10000);
  assert.deepEqual(positions,fanFixture().positions,'display ordering never moves material vertices');
});

function cancelledOriginStack(){
  // Two retained valley-folded sheets from a genuine mid-motion rigid pose.
  // The old valley closes the paper fronts together: either outside is blue.
  // Independently transformed copies of the same hinge point cancel to these
  // different near-zero doubles before their final Float32 conversion.
  const a=[-5.024295781800919e-15,0,5.124781841432538e-15],b=[-.2135099619626999,.2835486829280853,.2135099619626999],c=[.12132034450769424,0,.12132034450769424];
  const otherA=[8.038873123826528e-16,0,-4.019436561913264e-16],middle=b.map((n,k)=>(n+otherA[k]+c[k])/3);
  const vertices=[a,b,c,b,otherA,c,middle];
  return {vertices,first:[0,1,2],second:[3,4,5],fan:[3,4,6,4,5,6,5,3,6]};
}

test('cancelled near-origin rigid coordinates retain a complete folded-paper exterior across tessellations, transforms and draw orders',()=>{
  const fixture=cancelledOriginStack(),raster=new SimulationRasterizer(),angle=.43,c=Math.cos(angle),s=Math.sin(angle);
  const paperSettings={...settings,...simulationPaperColorSettings('#FF0000','#0000FF')};
  const rotations:Mat3[]=[[1,0,0,0,1,0,0,0,1],[c,-s,0,s,c,0,0,0,1]];
  for(const rotation of rotations)for(const translation of [[0,0,0],[1e-12,-1e-12,1e-12],[1000,-1000,1000]]){
    const transform=(p:number[])=>[0,1,2].map(k=>rotation[k*3]*p[0]+rotation[k*3+1]*p[1]+rotation[k*3+2]*p[2]+translation[k]);
    const positions=Float32Array.from(fixture.vertices.flatMap(transform)),saved=positions.slice(),inverse:Mat3=[rotation[0],rotation[3],rotation[6],rotation[1],rotation[4],rotation[7],rotation[2],rotation[5],rotation[8]];
    for(const back of [false,true])for(const lower of [fixture.second,fixture.fan]){
      const camera=cameraUniforms({yaw:-.35,pitch:back?Math.PI+.55:.55,zoom:2,orient:inverse},transform([0,.1,.1]) as [number,number,number],.5,480,360);
      let reference:Uint8ClampedArray|undefined;
      for(const reverse of [false,true]){
        const indices=Uint32Array.from(reverse?[...lower,...fixture.first]:[...fixture.first,...lower]);
        const certificate:SimulationRasterLayerOrder={triangleSourceFaces:reverse?[...Array(lower.length/3).fill(1),0]:[0,...Array(lower.length/3).fill(1)],faceOrders:[[0,1,1]]};
        const actual=raster.render(positions,model(indices),camera,paperSettings,undefined,certificate).slice();
        let checked=0,wrong=0;
        for(let y=1;y<camera.height-1;y++)for(let x=1;x<camera.width-1;x++){
          const p=(y*camera.width+x)*4;
          if([p,p-4,p+4,p-camera.width*4,p+camera.width*4].some(q=>actual[q+1]!==0))continue;
          checked++;if(actual[p]!==0||actual[p+2]!==255)wrong++;
        }
        assert.ok(checked>500,'the independent old-valley exterior oracle includes a real panel interior');
        assert.equal(wrong,0,`fronts remain inside the old valley; back ${back}, translation ${translation}, fan ${lower.length>3}, reverse ${reverse}`);
        if(reference)assert.deepEqual(actual,reference,'changing triangle submission order cannot change a certified paper exterior');
        else reference=actual;
      }
    }
    assert.deepEqual(positions,saved,'rendering a retained layer never moves its geometry');
  }
});

test('a real micro-gap and a crossing foreground retain physical depth despite the opposite certificate',()=>{
  const raster=new SimulationRasterizer(),camera=cameraUniforms({yaw:0,pitch:0,zoom:.8},[0,0,0],1,160,160);
  const indices=new Uint32Array([0,1,2,3,5,4]),certificate:SimulationRasterLayerOrder={triangleSourceFaces:[0,1],faceOrders:[[0,1,-1]]};
  // The certificate prefers face 0; face 1 is physically nearer the front eye.
  for(const gap of [1e-10,1e-8,1e-6,5e-5]){
    const positions=trianglePair.slice();for(let v=3;v<6;v++)positions[v*3+1]+=gap;
    const expected=centre(raster.render(positions,model(indices.slice(3)),camera,settings),camera);
    assert.deepEqual(centre(raster.render(positions,model(indices),camera,settings,undefined,certificate),camera),expected);
  }
  const crossing=trianglePair.slice();crossing[10]=.25;crossing[13]=.25;crossing[16]=-.2;
  const expected=centre(raster.render(crossing,model(indices),camera,settings),camera);
  assert.deepEqual(centre(raster.render(crossing,model(indices),camera,settings,undefined,certificate),camera),expected);
  // Resolve a tilted, quantised surface's real gap too, rather than using a
  // global depth tolerance sized for the entire model.
  const tilted=fanFixture(),tiltedPositions=tilted.positions.slice();
  for(let v=4;v<9;v++)tiltedPositions[v*3+1]+=1e-6;
  const tiltedIndices=new Uint32Array([...tilted.first,...tilted.second]);
  const tiltedOrder:SimulationRasterLayerOrder={triangleSourceFaces:[0,0,1,1,1,1],faceOrders:[[0,1,1]]};
  const certified=raster.render(tiltedPositions,model(tiltedIndices),tilted.camera,settings,undefined,tiltedOrder).slice();
  assert.deepEqual(certified,raster.render(tiltedPositions,model(tiltedIndices),tilted.camera,settings));
});

test('uncertified and translucent drawing keep existing behaviour while strain uses the selected layer',()=>{
  const raster=new SimulationRasterizer(),camera=cameraUniforms({yaw:0,pitch:0,zoom:.8},[0,0,0],1,160,160),indices=new Uint32Array([0,1,2,3,5,4]);
  const certificate:SimulationRasterLayerOrder={triangleSourceFaces:[0,1],faceOrders:[[0,1,1]]};
  const untrusted={...certificate,faceOrders:[]};
  const original=raster.render(trianglePair,model(indices),camera,settings).slice();
  assert.deepEqual(raster.render(trianglePair,model(indices),camera,settings,undefined,untrusted),original);
  const transparent={...settings,faceAlpha:.36};
  const prior=raster.render(trianglePair,model(indices),camera,transparent).slice();
  assert.deepEqual(raster.render(trianglePair,model(indices),camera,transparent,undefined,certificate),prior);
  const strain=new Float32Array([0,0,0,.05,.05,.05]);
  const expected=centre(raster.render(trianglePair,model(indices.slice(3)),camera,settings,strain),camera);
  assert.deepEqual(centre(raster.render(trianglePair,model(indices),camera,settings,strain,certificate),camera),expected);
});
