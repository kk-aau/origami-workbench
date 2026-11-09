import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {blankDoc} from '../../src/app/state';
import {diagramSimulationGraph} from '../../src/app/diagramSimulationAngles';
import {renderDiagramSimulationSurface,diagramSimulationSurfaceGeometry,diagramSimulationSurfaceCamera,diagramSimulationSurfaceBounds} from '../../src/app/diagramSimulationSurfaceRender';
import type {DiagramSimulationSurface} from '../../src/app/diagramSimulationSurface';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {FLEXIBLE_PAPER_SOLVER_SETTINGS} from '../../src/engine/simSettings';

function fixture(mesh:'original'|'standard'='standard'):DiagramSimulationSurface{
  const sourceDoc=blankDoc('曲面',100,100),source=diagramSimulationGraph(sourceDoc),prepared=prepareSimulationDocument(source,{mesh}).prepared;
  const solver=new ReferenceSolver(new OrigamiModel(prepared));
  const pose={version:1 as const,source,solver:solver.capturePose(),progress:0,settings:{...FLEXIBLE_PAPER_SOLVER_SETTINGS},view:{yaw:0,pitch:0,zoom:1},mesh};solver.dispose();
  return {version:1,sourceStateId:'cp-1',sourceRevision:0,sourceDoc,pose,colors:{front:'#ff00ff',back:'#00ccff',line:'#223344'}};
}
function png(markup:string){
  const bytes=Buffer.from(markup.match(/href="data:image\/png;base64,([^"]+)"/)![1],'base64');
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),chunks:Buffer[]=[];
  for(let at=8;at<bytes.length;){const n=bytes.readUInt32BE(at),type=bytes.subarray(at+4,at+8).toString();if(type==='IDAT')chunks.push(bytes.subarray(at+8,at+8+n));at+=n+12;}
  const raw=inflateSync(Buffer.concat(chunks)),rgba=new Uint8Array(width*height*4);
  for(let row=0;row<height;row++){assert.equal(raw[row*(width*4+1)],0);rgba.set(raw.subarray(row*(width*4+1)+1,(row+1)*(width*4+1)),row*width*4);}
  return {width,height,rgba,pixel:(x:number,y:number)=>[...rgba.subarray((y*width+x)*4,(y*width+x)*4+4)]};
}

test('transparent shared artwork keeps actual paper colour, closes triangle seams and leaves the captured pose unchanged',()=>{
  const surface=fixture(),saved=JSON.stringify(surface),render=renderDiagramSimulationSurface(surface,{resolution:128}),image=png(render.markup);
  assert.match(render.markup,/data-diagram-simulation-surface="true"/);
  assert.deepEqual(image.pixel(0,0),[0,0,0,0]);
  for(let y=10;y<image.height-10;y++)for(let x=10;x<image.width-10;x++)assert.deepEqual(image.pixel(x,y),[255,0,255,255],'interior pixels have one material owner, including numerical triangle seams');
  assert.equal(JSON.stringify(surface),saved);
});

test('orbit and zoom reuse solver geometry, preserve physical scale and expose the real reverse paper side',()=>{
  const surface=fixture(),geometry=diagramSimulationSurfaceGeometry(surface),front=renderDiagramSimulationSurface(surface,{resolution:128});
  const back={...surface,pose:{...surface.pose,view:{...surface.pose.view,pitch:Math.PI}}};
  assert.strictEqual(diagramSimulationSurfaceGeometry(back),geometry);
  const backImage=png(renderDiagramSimulationSurface(back,{resolution:128}).markup);
  assert.deepEqual(backImage.pixel(Math.floor(backImage.width/2),Math.floor(backImage.height/2)),[0,204,255,255]);
  const zoom={...surface,pose:{...surface.pose,view:{...surface.pose.view,zoom:2}}},expanded=renderDiagramSimulationSurface(zoom,{resolution:128});
  assert.ok(expanded.bounds.width>front.bounds.width*1.95);
  assert.equal(diagramSimulationSurfaceCamera(zoom,100,100).scale,diagramSimulationSurfaceCamera(surface,100,100).scale*2);
  assert.strictEqual(diagramSimulationSurfaceGeometry(zoom),geometry);
});

test('preview/export resolution changes pixels only and cached bounds cannot be mutated by a caller',()=>{
  const surface=fixture(),small=renderDiagramSimulationSurface(surface,{resolution:96}),large=renderDiagramSimulationSurface(surface,{resolution:192});
  assert.deepEqual(small.bounds,large.bounds);assert.equal(png(large.markup).width,png(small.markup).width*2);
  const saved={...small.bounds};small.bounds.x=999;
  assert.deepEqual(renderDiagramSimulationSurface(surface,{resolution:96}).bounds,saved);
  assert.throws(()=>renderDiagramSimulationSurface(surface,{resolution:0}),/分辨率/);
});

test('paper-only surface roll transforms the image and bounds without changing the captured pixels',()=>{
  const surface=fixture(),base=renderDiagramSimulationSurface(surface,{resolution:96}),rolled={...surface,displayRotation:45};
  const output=renderDiagramSimulationSurface(rolled,{resolution:96});
  assert.match(output.markup,/data-diagram-paper-rotation="45"/);
  assert.deepEqual(output.bounds,diagramSimulationSurfaceBounds(rolled));
  assert.deepEqual(png(output.markup).rgba,png(base.markup).rgba);
  assert.ok(output.bounds.width>base.bounds.width);
});

test('nonplanar captured vertices remain nonplanar in the shared renderer and are never converted to target fold angles',()=>{
  const surface=fixture(),prepared=prepareSimulationDocument(surface.pose.source,{mesh:'standard'}).prepared,model=new OrigamiModel(prepared);
  const snapshot=surface.pose.solver;
  snapshot.displacements=snapshot.displacements.map((_,i)=>i%3===1?Math.fround(.2*Math.cos(model.originalPositions[i-1]*2)*Math.cos(model.originalPositions[i+1]*2)):0);
  snapshot.positions=snapshot.displacements.map((v,i)=>Math.fround(model.originalPositions[i]+v));
  const before=JSON.stringify(snapshot),geometry=diagramSimulationSurfaceGeometry(surface),render=renderDiagramSimulationSurface(surface,{resolution:96});
  assert.deepEqual([...geometry.positions],snapshot.positions);
  assert.ok(new Set(snapshot.positions.filter((_,i)=>i%3===1)).size>2);
  assert.ok(render.markup.includes('data:image/png;base64,'));assert.equal(JSON.stringify(snapshot),before);
});
