import test from 'node:test';
import assert from 'node:assert/strict';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationSourceSignature} from '../../src/engine/simLayerOrder';
import {seedSimulationStepAnimation,simulationStepFoldProfile,type SimulationStepAnimation} from '../../src/engine/simStepAnimation';
import {planSimulationStepPath,createSimulationStepPathEvaluator} from '../../src/engine/simStepPath';
import {createSimulationStepPhaseMechanisms} from '../../src/engine/simStepRigid';
import {buildSimulationStepLayerTimeline,rigidStepContactLookup,simulationStepLayerOrderAt} from '../../src/engine/simStepLayerTimeline';
import {SimulationRasterizer,rasterLayerComparison} from '../../src/engine/simRaster';
import {simulationPaperColorSettings} from '../../src/engine/simColors';
import {cameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import {meshTopologyFor,type RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import {renderMeshToSvg} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/svgRenderer';

function accordion(){
  const fold={vertices_coords:[[0,0],[1,0],[2,0],[3,0],[4,0],[0,1],[1,1],[2,1],[3,1],[4,1]],
    faces_vertices:[[0,1,6,5],[1,2,7,6],[2,3,8,7],[3,4,9,8]],
    edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,9],[9,8],[8,7],[7,6],[6,5],[5,0],[1,6],[2,7],[3,8]] as [number,number][],
    edges_assignment:['B','B','B','B','B','B','B','B','B','B','V','M','V'],
    edges_foldAngle:[0,0,0,0,0,0,0,0,0,0,180,-180,180]};
  const {prepared}=prepareSimulationDocument(fold),model=new OrigamiModel(prepared);
  const x=(v:number)=>prepared.fold.vertices_coords[v][0];
  const hingeX=(edge:number)=>x(prepared.edgesVertices[edge][0]);
  const start:SimulationStepAnimation={version:1,sourceSignature:simulationSourceSignature(fold),initialPositions:Array.from(model.originalPositions),
    ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:c.targetAngle})),
    fixedVertices:[...new Set(prepared.facesVertices.filter(face=>face.every(v=>x(v)>=3)).flat())],
    timings:prepared.creaseParams.filter(c=>c.targetAngle!==0).map(c=>({edge:c.edge,start:(hingeX(c.edge)-1)/3,end:hingeX(c.edge)/3}))};
  const motion=planSimulationStepPath(prepared,start),path=createSimulationStepPathEvaluator(prepared,start,motion);
  return {fold,prepared,model,start,motion,path,hingeX};
}

test('a folded pair joins a third layer, turns as one stack, then releases only the opened hinge',()=>{
  const {fold,prepared,model,start,motion,path,hingeX}=accordion();
  const groups=createSimulationStepPhaseMechanisms(prepared,start,motion);
  const triangles=fold.faces_vertices.map((_,i)=>prepared.triangleSourceFaces!.indexOf(i));
  const bodies=(phase:number)=>triangles.map(t=>groups(phase).triangleBodies[t]);
  assert.notEqual(bodies(0)[0],bodies(0)[1]);
  assert.equal(bodies(1)[0],bodies(1)[1]);
  assert.notEqual(bodies(1)[0],bodies(1)[2]);
  assert.deepEqual(bodies(2).slice(0,3),Array(3).fill(bodies(2)[0]));
  assert.notEqual(bodies(2)[2],bodies(2)[3]);
  const a=prepared.facesVertices[triangles[0]],b=prepared.facesVertices[triangles[1]];
  assert.equal(path.sameRigidAssembly!(0,.3,a,b),false);
  assert.equal(path.sameRigidAssembly!(.2,.8,a,b),false,'a proof cannot span the closing hinge');
  const animation={...start,motion},solver=new ReferenceSolver(model);
  seedSimulationStepAnimation(solver,animation);
  const point=(pose:Float32Array,v:number)=>pose.subarray(v*3,v*3+3);
  for(const progress of [.78,.93,.42,.78,1]){
    solver.setFoldProfile(simulationStepFoldProfile(animation,progress));solver.setFoldPercent(progress*100);solver.step(1);
    const pose=path.evaluate(progress);assert.deepEqual(model.positions,pose);
    if(progress>2/3){
      for(const [a,b] of [[0,2],[1,3],[5,7],[6,8]]){
        assert.ok(point(pose,a).every((n,k)=>Math.abs(n-point(pose,b)[k])<1e-7));
      }
    }
  }
  solver.dispose();
  const open:SimulationStepAnimation={...start,timings:undefined,initialPositions:Array.from(path.evaluate(1)),
    ranges:start.ranges.map(r=>({edge:r.edge,fromAngle:r.toAngle,toAngle:hingeX(r.edge)===2?0:r.toAngle}))};
  const opening=planSimulationStepPath(prepared,open),opened=createSimulationStepPhaseMechanisms(prepared,open,opening)(0);
  assert.equal(opened.triangleBodies[triangles[0]],opened.triangleBodies[triangles[1]]);
  assert.notEqual(opened.triangleBodies[triangles[1]],opened.triangleBodies[triangles[2]]);
  const midway=createSimulationStepPathEvaluator(prepared,open,opening).evaluate(.5);
  assert.ok(point(midway,0).every((n,k)=>Math.abs(n-point(midway,2)[k])<1e-7));
  assert.ok(point(midway,1).some((n,k)=>Math.abs(n-point(midway,3)[k])>.1));
});

test('a turning three-layer accordion shows its two outer material sides in playback and the vector figure',()=>{
  const {prepared,start,motion,path}=accordion(),animation={...start,motion};
  const timeline=buildSimulationStepLayerTimeline(prepared,animation,null),contact=rigidStepContactLookup(prepared,animation)!;
  const sources=prepared.triangleSourceFaces!,topology=meshTopologyFor(prepared);
  const mask=(source:number)=>({...prepared,indices:Uint32Array.from(prepared.facesVertices.filter((_,i)=>sources[i]===source).flat())});
  const raster=new SimulationRasterizer(),blue='#6196cf',cream='#f9f1df';
  const settings={...simulationPaperColorSettings(blue,cream),background:[1,1,1],faceAlpha:1,showFaces:true,showEdges:false,lighting:false} as RenderSettings;
  const hex=(buffer:Uint8ClampedArray,offset:number)=>'#'+Buffer.from(buffer.subarray(offset,offset+3)).toString('hex');
  for(const progress of [.74,.79,.74]){
    const positions=path.evaluate(progress),faceOrders=simulationStepLayerOrderAt(prepared,animation,timeline,progress,positions);
    assert.equal(faceOrders.length,3,'only the first three sheets overlap during this part of the final turn');
    assert.ok(faceOrders.every(([a,b])=>a<3&&b<3));
    const order={triangleSourceFaces:sources,faceOrders,rigidContact:(a:number,b:number)=>contact(a,b,progress)};
    const seen=new Set<string>();
    for(const back of [false,true]){
      const camera=cameraUniforms({yaw:0,pitch:back?Math.PI:0,zoom:1.3},[0,0,0],1,320,240);
      // Faces 0 and 2 are the exterior ends of the V/M accordion. Their
      // matching material orientation is opposite that of the middle panel.
      const exterior=raster.render(positions,mask(0),camera,settings).slice();
      const middle=raster.render(positions,mask(1),camera,settings).slice();
      const fixed=raster.render(positions,mask(3),camera,settings).slice();
      const frame=raster.render(positions,prepared,camera,settings,undefined,order);
      const compare=rasterLayerComparison(positions,prepared.indices,camera,order)!;
      const svg=renderMeshToSvg(positions,topology,camera,settings,{perspective:true,background:false,compareContact:(a,b,equal)=>compare(a,b,equal===true)})!.svg;
      const polygons=[...svg.matchAll(/<polygon points="([^"]+)" fill="(#[0-9a-f]+)"/g)].map(match=>({
        points:match[1].split(' ').map(p=>p.split(',').map(Number)),color:match[2],
      }));
      let samples=0;
      for(let y=2;y<camera.height-2;y+=5)for(let x=2;x<camera.width-2;x+=5){
        const at=4*(y*camera.width+x),expected=hex(exterior,at);
        if(expected==='#ffffff'||hex(fixed,at)!=='#ffffff'||hex(middle,at)==='#ffffff')continue;
        if([at-8,at+8,at-8*camera.width,at+8*camera.width].some(i=>hex(exterior,i)!==expected))continue;
        assert.notEqual(hex(middle,at),expected);
        assert.equal(hex(frame,at),expected,'the raster must hide the middle sheet');
        const visible=polygons.findLast(({points})=>{
          let inside=false;
          for(let i=0,j=points.length-1;i<points.length;j=i++){
            const [ax,ay]=points[i],[bx,by]=points[j],px=x+.5,py=y+.5;
            if((ay>py)!==(by>py)&&px<(bx-ax)*(py-ay)/(by-ay)+ax)inside=!inside;
          }
          return inside;
        });
        assert.equal(visible?.color,expected,'the final painted SVG polygon must have the same material side');
        seen.add(expected);samples++;
      }
      assert.ok(samples>10,'sample multiple interior pixels of the moving packet away from the fixed sheet');
    }
    assert.deepEqual(seen,new Set([blue,cream]),'opposite cameras expose the blue front and cream reverse');
  }
});
