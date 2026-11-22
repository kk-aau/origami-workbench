import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareSimulationDocument} from '../../src/engine/simmodel';
import {simulationObjText,simulationStlText} from '../../src/engine/simExport';
import {simulationFoldSnapshot} from '../../src/engine/simDisplay';
import {OrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';
import {frameArtworkSVG,validateFrameArtwork,type DiagramFrameArtwork} from '../../src/app/diagramFrameArtwork';
import {diagramPaperPrint} from '../../src/app/diagramPaperPatternSVG';
import {encodePng} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/png';
import {projectedPrintPatches} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/paperPrintSvg';
import {projectVertices,type CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';

for(const size of [100,200])test('all three solver exports restore translated FOLD axes and material size '+size,()=>{
  const coords=[[31,-23,6],[31+size,-23,6],[31+size,-23+size,16],[31,-23+size,16]];
  const source={frame_unit:'mm',vertices_coords:coords,edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B'],faces_vertices:[[0,1,2,3]]};
  const {prepared}=prepareSimulationDocument(source),solver=new ReferenceSolver(new OrigamiModel(prepared));
  const p=new Float32Array(prepared.vertexCount*3);
  try{solver.readPositions(p);}finally{solver.dispose();}
  const fold=simulationFoldSnapshot(prepared,p,0,0);
  assert.equal(fold.frame_unit,'mm');assert.deepEqual(fold.vertices_coords,coords);
  const points=(text:string,prefix:string)=>text.split('\n').map(line=>line.trim()).filter(line=>line.startsWith(prefix)).map(line=>line.slice(prefix.length).split(/\s+/).map(Number));
  const obj=simulationObjText(prepared,p);assert.match(obj,/^# zhezhi-coordinate-unit mm$/m);
  assert.deepEqual(points(obj,'v '),coords);
  assert.deepEqual(points(simulationStlText(prepared,p),'vertex '),Array.from(prepared.indices,i=>coords[i]));
});

test('saved vector prints keep a mirrored material back, alpha and clipped scalable artwork',()=>{
  const cam:CameraUniforms={center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],scale:50,width:100,height:100,depthRange:2,camDist:3};
  const vertices=new Float32Array([-1,-1,0,1,-1,0,-1,1,0]),q=projectVertices(vertices,cam,{precision:'double'});
  const footprint=Array.from({length:3},(_,i):[number,number]=>[q.screen[2*i],q.screen[2*i+1]]);
  const uv=new Float32Array([0,0,1,0,0,1]),front=projectedPrintPatches([0,1,2],footprint,q,uv,'front',3,true)[0],back=projectedPrintPatches([0,1,2],footprint,q,uv,'back',3,true)[0];
  const map=(p:number[],u:number,v:number)=>[p[0]*u+p[2]*v+p[4],p[1]*u+p[3]*v+p[5]];
  assert.deepEqual(map(front.mapping.matrix,0,0),footprint[0]);assert.deepEqual(map(back.mapping.matrix,1,0),footprint[0]);
  const png=encodePng(2,1,new Uint8ClampedArray([200,0,100,127,0,200,20,255]));
  const frame:DiagramFrameArtwork={box:{x:30,y:35,width:20,height:40},prints:{back:png},pieces:[{kind:'face',points:footprint.flat(),color:'#123456',print:back.mapping}]};
  const saved=JSON.parse(JSON.stringify(frame)),out=frameArtworkSVG(saved,12,24,200,400);
  assert.match(out,/viewBox="30 35 20 40"/);assert.match(out,/width="200" height="400"/);
  assert.match(out,/patternTransform="matrix\(/);assert.match(out,/<polygon/);assert.match(out,/#123456/);assert.equal(out.split(png).length,2);
  assert.throws(()=>validateFrameArtwork({...frame,prints:{back:'https://invalid/image.png'}}));
  assert.throws(()=>validateFrameArtwork({...frame,pieces:[{...frame.pieces[0],print:{side:'back',matrix:[0,0,0,NaN,1,0]}}]}));
});

test('opaque single-pixel paper prints stay vector in step drawings and saved frames',()=>{
  const color=encodePng(1,1,new Uint8ClampedArray([106,156,210,255])),alpha=encodePng(1,1,new Uint8ClampedArray([106,156,210,120]));
  const points:[number,number][]=[[0,0],[20,0],[0,20]];
  const print=diagramPaperPrint({front:color,back:alpha},points,points);
  const front=print.triangle([0,1,2],true,1),back=print.triangle([0,1,2],false,1);
  assert.match(front,/<polygon[^>]*fill="#6a9cd2"/);assert.doesNotMatch(front,/<use/);
  assert.match(back,/<use/);assert.ok(print.defs.join('').includes(alpha));
  const frame:DiagramFrameArtwork={box:{x:0,y:0,width:20,height:20},prints:{front:color},pieces:[{kind:'face',points:points.flat(),color:'#ffffff',print:{side:'front',matrix:[1,0,0,1,0,0]}}]};
  const saved=frameArtworkSVG(frame,0,0,50,50);
  assert.match(saved,/fill="#6a9cd2"/);assert.doesNotMatch(saved,/<pattern|<image/);
});

test('perspective texture maps stay on their source face across clipped fragments',()=>{
  const cam:CameraUniforms={center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],scale:64,width:200,height:160,depthRange:2,camDist:3};
  const xyz=new Float32Array([-1,-1,-1,1,-1,1,0,1,0]),q=projectVertices(xyz,cam,{precision:'double'});
  const points=Array.from({length:3},(_,i):[number,number]=>[q.screen[2*i],q.screen[2*i+1]]);
  const midpoint=(a:number[],b:number[]):[number,number]=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const clipped=[points[0],midpoint(points[0],points[1]),midpoint(points[0],points[2])];
  const pieces=projectedPrintPatches([0,1,2],clipped,q,new Float32Array([0,0,1,0,0,1]),'front',3,true);
  assert.ok(pieces.length>1);
  for(const {points:p,mapping:{matrix:[a,b,c,d,e,f]}} of pieces){
    const x=(p[0][0]+p[1][0]+p[2][0])/3,y=(p[0][1]+p[1][1]+p[2][1])/3;
    const u=((x-e)*d-(y-f)*c)/(a*d-b*c),v=((y-f)*a-(x-e)*b)/(a*d-b*c);
    const pt=xyz.slice(0,3).map((n,k)=>n*(1-u-v)+u*xyz[3+k]+v*xyz[6+k]);
    const projected=projectVertices(pt,cam,{precision:'double'}).screen;
    assert.ok(Math.hypot(projected[0]-x,projected[1]-y)<.32,'interior projection agrees with the real camera');
  }
});
