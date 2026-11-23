import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMeshToSvg} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/svgRenderer';
import {cameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import {meshTopologyFor,type RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import {frameInkSVG,validateFrameArtwork,type DiagramFrameArtwork} from '../../src/app/diagramFrameArtwork';
import {changeGlobalDiagramLineStyle,defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {simulationStepFlatCreases,simulationStepDisplayAssignments} from '../../src/engine/simStepEdges';
import type {SimulationStepAnimation} from '../../src/engine/simStepAnimation';

test('capture keeps authored flat CP marks as creases on numerically curved paper, but preserves silhouettes and moving hinges',()=>{
 const model={indices:new Uint32Array([0,1,2,1,0,3]),edgesVertices:[[0,1]] as [number,number][],edgesAssignment:['F'] as const,edgesFaces:[[0,1]],facesVertices:[[0,1,2],[1,0,3]],triangleSourceFaces:[0,1]};
 const camera=cameraUniforms({yaw:0,pitch:0,zoom:.8},[0,0,0],1,200,200);
 const p=new Float32Array([-.7,0,0,.7,0,0,0,.7,0,0,-.7,.003]);
 const animation:SimulationStepAnimation={version:1,sourceSignature:'fixture',initialPositions:Array.from(p),fixedVertices:[],ranges:[{edge:0,fromAngle:0,toAngle:0}],targetCreases:['F']};
 const settings={frontColor:[1,1,1],backColor:[1,1,1],mountainColor:[0,0,0],valleyColor:[0,0,0],borderColor:[0,0,0],background:[1,1,1],showFaces:false,showEdges:true,lighting:false,faceAlpha:1,creaseWidthPx:1} as RenderSettings;
 const roles=simulationStepDisplayAssignments(model,animation,p,camera,.6,'target');
 const topology={...meshTopologyFor(model),edgeAssignments:Uint8Array.from(roles,r=>r==='B'?0:r==='M'?1:r==='V'?2:3)};
 const render=(topologyOverride=topology)=>renderMeshToSvg(p,topologyOverride,camera,settings,{coloredEdges:new Set(),flatCreases:simulationStepFlatCreases(animation,.6)})!.svg;
 assert.match(render(),/data-diagram-line-style="crease"/);
 assert.match(render({...topology,edgeAssignments:new Uint8Array([0])}),/data-diagram-line-style="boundary"/);
 const moving={...animation,ranges:[{edge:0,fromAngle:-180,toAngle:0}]};
 assert.equal(simulationStepFlatCreases(moving,.6).has(0),false);
 assert.equal(simulationStepFlatCreases(moving,1).has(0),true);
 const precrease={...animation,ranges:[{edge:0,fromAngle:0,toAngle:0,viaAngle:180}]};
 assert.equal(simulationStepFlatCreases(precrease,.5).has(0),false);
 assert.equal(simulationStepFlatCreases(precrease,1).has(0),true);
 assert.equal(simulationStepFlatCreases({...animation,targetCreases:[null]},.6).has(0),false,'mesh seams are not authored creases');
 assert.equal(simulationStepFlatCreases({...animation,targetCreases:['M']},.6).has(0),false,'active mountain marks retain their own category');
});

test('capture distinguishes unchanged flat creases from real folded contours with identical black ink',()=>{
 const model={indices:new Uint32Array([0,1,2,1,0,3]),edgesVertices:[[0,1]] as [number,number][],edgesAssignment:['M'] as const};
 const camera=cameraUniforms({yaw:0,pitch:0,zoom:.8},[0,0,0],1,200,200);
 const settings={frontColor:[1,1,1],backColor:[1,1,1],mountainColor:[0,0,0],valleyColor:[0,0,0],borderColor:[0,0,0],background:[1,1,1],showFaces:false,showEdges:true,lighting:false,faceAlpha:1,creaseWidthPx:1} as RenderSettings;
 const flat=new Float32Array([-.7,0,0,.7,0,0,0,.7,0,0,-.7,0]);
 const draw=(positions:Float32Array,active=false)=>renderMeshToSvg(positions,meshTopologyFor(model),camera,settings,{coloredEdges:new Set(active?[0]:[])})!.svg;
 assert.match(draw(flat),/data-diagram-line-style="crease"/);
 const folded=flat.slice();folded[11]=.4;assert.match(draw(folded),/data-diagram-line-style="boundary"/);
 assert.match(draw(flat,true),/data-diagram-line-style="mountain"/);
 assert.deepEqual(flat,new Float32Array([-.7,0,0,.7,0,0,0,.7,0,0,-.7,0]));
});

test('captured crease styling is independent from boundary styling, including cached output and save/reopen',()=>{
 const frame:DiagramFrameArtwork={box:{x:0,y:0,width:100,height:100},pieces:[
  {kind:'line',color:'#000000',points:[0,0,100,0],lineStyle:'boundary'},
  {kind:'line',color:'#000000',points:[0,50,100,50],lineStyle:'crease'},
  {kind:'line',color:'#ff0000',points:[0,75,100,75],lineStyle:'mountain'},
 ]};
 const saved=structuredClone(frame),base=defaultDiagramLineDefaults(),normal=frameInkSVG(frame,base);
 const tags=(s:string)=>s.match(/<line[^>]+>/g)!;
 assert.match(tags(normal)[1],/stroke="#8d9b92"/);assert.match(tags(normal)[1],/stroke-width="0.45"/);
 assert.match(tags(normal)[0],/stroke="#000000"/);assert.match(tags(normal)[0],/stroke-width="1.35"/);
 const thin=changeGlobalDiagramLineStyle(base,'boundary',{width:.4}),changed=tags(frameInkSVG(frame,thin));
 assert.notEqual(changed[0],tags(normal)[0]);assert.equal(changed[1],tags(normal)[1]);assert.equal(changed[2],tags(normal)[2]);
 const crease=changeGlobalDiagramLineStyle(base,'crease',{width:.7,color:'#123456',strokePattern:'dashed'}),styled=tags(frameInkSVG(frame,crease));
 assert.equal(styled[0],tags(normal)[0]);assert.match(styled[1],/stroke="#123456"/);assert.match(styled[1],/stroke-width="0.9"/);assert.match(styled[1],/stroke-dasharray=/);
 assert.equal(frameInkSVG(frame,base),normal);assert.equal(frameInkSVG(JSON.parse(JSON.stringify(frame)),crease),frameInkSVG(frame,crease));assert.deepEqual(frame,saved);
 assert.throws(()=>validateFrameArtwork({...frame,pieces:[{...frame.pieces[0],lineStyle:'made-up'}]}));
});
