import test from 'node:test';
import assert from 'node:assert/strict';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {Point} from '../../src/core/types';
import {blankDoc} from '../../src/app/state';
import {createDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {defaultModelView} from '../../src/app/modelViewState';
import {diagramLocalSurface,diagramLocalSurfaceIssue} from '../../src/app/diagramLocalSurface';
import {diagramModelMarkup,drawingSVG} from '../../src/app/diagramDrawing';
import {diagramSpatialFaceColor} from '../../src/app/diagramSpatialAppearance';
import {diagramSpatialEdgeMarkup} from '../../src/app/diagramSpatialEdges';

function accordion(first=90,second=-45,elevation=0):DiagramPose {
  const doc=blankDoc('空间纸面显示',90,90);
  doc.segments.push({id:'crease-a',a:[30,0],b:[30,90],assignment:'V',angle:first},{id:'crease-b',a:[60,0],b:[60,90],assignment:'M',angle:second});
  return {sourceStateId:'cp',sourceRevision:0,sourceDoc:doc,...createDiagramSpatialPose(doc,0,undefined,undefined,{yaw:0,elevation}),view:defaultModelView()};
}

test('verified ninety-degree faces retain opaque local surfaces and silhouettes without changing CP or geometry',()=>{
  const pose=accordion();delete pose.result.layers.faceOrder;
  assert.ok((pose.result.geometry.graph!.zhezhi_spatialEdgeOnFaces as number[]).length);
  const before=structuredClone(pose),data=diagramLocalSurface(pose)!;
  assert.ok(data,diagramLocalSurfaceIssue(pose));assert.equal(data.omittedThinRegions,0);
  assert.ok(data.regions.every(region=>region.layers.status==='ordered'));
  assert.equal(data.boundaries!.ambiguousEdges,0);
  const markup=diagramModelMarkup(pose),svg=drawingSVG(pose,[],'','');
  assert.match(markup,/data-model-region-surface/);assert.doesNotMatch(markup,/fill-opacity="0\.09"/);
  assert.match(markup,/data-diagram-spatial-edge="true"/);assert.match(markup,/stroke-width="1\.35"/);
  assert.ok(svg.includes(markup));assert.deepEqual(pose,before);
});

test('an unverified zero-area polygon or forged edge-on marker cannot enable opaque local paint',()=>{
  const pose=accordion();delete pose.result.layers.faceOrder;delete pose.spatial;
  assert.equal(diagramLocalSurface(pose),null);assert.match(diagramLocalSurfaceIssue(pose)!,/缺少真实空间姿态/);
  const forged=accordion();delete forged.result.layers.faceOrder;
  forged.result.geometry.graph!.zhezhi_spatialEdgeOnFaces=[0];
  assert.equal(diagramLocalSurface(forged),null);assert.match(diagramLocalSurfaceIssue(forged)!,/实际姿态不一致/);
});

test('illumination keeps coplanar subdivisions identical from oblique front and back views, and leaves flat/X-ray paint intact',()=>{
  const pose=accordion(0,0,35);
  for(const side of ['front','back'] as const){
    const view={...defaultModelView(),side,rotation:23},shade=diagramSpatialFaceColor(pose,view)!;
    assert.equal(new Set(pose.result.geometry.faces.map((_,f)=>shade(f,'#c5dac2'))).size,1);
  }
  assert.equal(diagramSpatialFaceColor({...pose,spatial:undefined},defaultModelView()),null);
  assert.equal(diagramSpatialFaceColor(pose,{...defaultModelView(),xray:true}),null);
});

test('zero-degree instructions never acquire spatial boundary ink or an internal solid joint',()=>{
  const pose=accordion(0,0);delete pose.result.layers.faceOrder;
  assert.equal(diagramSpatialEdgeMarkup(pose,pose.view!,'#41634e'),'');
  const markup=diagramModelMarkup(pose,undefined,true);
  const lines=[...markup.matchAll(/<line data-region-boundary="true"[^>]+>/g)].map(m=>m[0]);
  assert.ok(lines.length);
  assert.ok(lines.every(line=>{const a=Number(line.match(/x1="([^"]+)"/)![1]),b=Number(line.match(/x2="([^"]+)"/)![1]);return a!==b||a!==30&&a!==60;}), 'zero-angle subdivisions remain ordinary crease ink');
});

/** A vertical tab's top edge crosses a higher horizontal cover; this isolated
 * display fixture tests exact depth clipping, not a physical folding path. */
function coveredEdgePose():DiagramPose {
  const vertices:Point[]=[[0,0],[10,0],[10,0],[0,0],[4,-2],[8,-2],[8,2],[4,2]];
  const faces=[[0,1,2,3],[4,5,6,7]],spatialVertices:[number,number,number][]=[[0,0,1],[10,0,1],[10,0,3],[0,0,3],[4,-2,4],[8,-2,4],[8,2,4],[4,2,4]];
  return {sourceStateId:'cp',sourceRevision:0,sourceDoc:blankDoc('遮挡试件',10,10),view:defaultModelView(),
    result:{geometry:{status:'ready',message:'fixture',vertices,faces,graph:{vertices_coords:vertices,faces_vertices:faces,edges_vertices:[],edges_assignment:[],edges_foldAngle:[],zhezhi_spatialEdgeOnFaces:[0]}},layers:{status:'solved',message:'strict depth'},warnings:[]},
    spatial:{version:1,vertices:spatialVertices,faceTransforms:[{rotation:[1,0,0,0,0,-1,0,1,0],translation:[0,0,1]},{rotation:[1,0,0,0,1,0,0,0,1],translation:[0,0,4]}],measuredAngles:[],camera:{yaw:0,elevation:0}}};
}
const spans=(markup:string)=>[...markup.matchAll(/x1="([^"]+)" y1="[^"]+" x2="([^"]+)"/g)].map(m=>[Math.min(+m[1],+m[2]),Math.max(+m[1],+m[2])]);
test('zero-area silhouettes are clipped by real depth, can reappear through hidden covers, and reverse for the back camera',()=>{
  const pose=coveredEdgePose(),before=structuredClone(pose),front=spans(diagramSpatialEdgeMarkup(pose,pose.view!,'#41634e'));
  assert.ok(front.length);assert.ok(front.every(([a,b])=>b<=4||a>=8),'the covered middle must not leak through');
  assert.ok(front.some(([a,b])=>a===0&&b===4));assert.ok(front.some(([a,b])=>a===8&&b===10));
  const back=spans(diagramSpatialEdgeMarkup(pose,{...pose.view!,side:'back'},'#41634e'));
  assert.ok(back.some(([a,b])=>a===0&&b===10),'the original upper cover is behind the tab from the back');
  const revealed=spans(diagramSpatialEdgeMarkup({...pose,hiddenFaces:[1]},pose.view!,'#41634e'));
  assert.ok(revealed.some(([a,b])=>a===0&&b===10));
  assert.equal(diagramSpatialEdgeMarkup({...pose,hiddenFaces:[0]},pose.view!,'#41634e'),'');
  assert.deepEqual(pose,before);
});

test('a nonzero fold including 180 degrees uses solid boundary ink and respects verified coplanar covering layers',()=>{
  const fixture=coveredEdgePose();
  fixture.result.geometry.vertices[2]=[10,2];fixture.result.geometry.vertices[3]=[0,2];
  fixture.spatial!.vertices=fixture.result.geometry.vertices.map(([x,y])=>[x,y,3]);
  fixture.spatial!.faceTransforms=fixture.result.geometry.faces.map(()=>({rotation:[1,0,0,0,1,0,0,0,1],translation:[0,0,3]}));
  Object.assign(fixture.result.geometry.graph!,{vertices_coords:fixture.result.geometry.vertices,edges_vertices:[[0,1]],edges_assignment:['V'],edges_foldAngle:[180],zhezhi_spatialEdgeOnFaces:[]});
  fixture.result.layers.faceOrders=[[1,0,1]];
  for(const angle of [45,180]){
    const pose=structuredClone(fixture);pose.spatial!.measuredAngles=[angle];
    const markup=diagramSpatialEdgeMarkup(pose,pose.view!,'#41634e'),pieces=spans(markup);
    assert.ok(pieces.length);assert.ok(pieces.every(([a,b])=>b<=4||a>=8));
    assert.match(markup,/stroke="#41634e" stroke-width="1\.35"/);assert.doesNotMatch(markup,/stroke-dasharray/);
    assert.ok(spans(diagramSpatialEdgeMarkup(pose,{...pose.view!,side:'back'},'#41634e')).some(([a,b])=>a===0&&b===10));
  }
});

test('adjacent opaque faces jointly cover an underlying edge on their shared F seam, while holes remain open',()=>{
  const pose=coveredEdgePose();
  pose.result.geometry.vertices.splice(4,4,[4,-2],[8,-2],[8,0],[4,0],[4,0],[8,0],[8,2],[4,2]);
  pose.result.geometry.faces.push([8,9,10,11]);pose.result.geometry.graph!.faces_vertices=pose.result.geometry.faces;
  pose.spatial!.vertices.splice(4,4,...pose.result.geometry.vertices.slice(4).map(([x,y]):[number,number,number]=>[x,y,4]));
  pose.spatial!.faceTransforms.push(structuredClone(pose.spatial!.faceTransforms[1]));
  const pieces=spans(diagramSpatialEdgeMarkup(pose,pose.view!,'#41634e'));
  assert.ok(pieces.length);assert.ok(pieces.every(([a,b])=>b<=4||a>=8),'the shared upper seam is still opaque paper');
  assert.ok(spans(diagramSpatialEdgeMarkup({...pose,hiddenFaces:[2]},pose.view!,'#41634e')).some(([a,b])=>a===0&&b===10),'a sole remaining outer edge must not acquire fake covering area');

  const holed=coveredEdgePose(),hole:Point[]=[[5,-1],[7,-1],[7,1],[5,1]];
  holed.result.geometry.vertices.push(...hole);holed.spatial!.vertices.push(...hole.map(([x,y]):[number,number,number]=>[x,y,4]));
  holed.result.geometry.graph!.faces_holes=[[],[[8,9,10,11]]];
  const visible=spans(diagramSpatialEdgeMarkup(holed,holed.view!,'#41634e'));
  assert.ok(visible.some(([a,b])=>a===5&&b===7),'the real hole reveals the lower edge');
  assert.ok(visible.every(([a,b])=>b<=4||a>=8||a>=5&&b<=7));
});

test('coplanar edge occlusion follows only order paths through faces covering this exact point',()=>{
  const pose=coveredEdgePose();
  pose.result.geometry.vertices[2]=[10,2];pose.result.geometry.vertices[3]=[0,2];
  pose.result.geometry.vertices.push([4,0],[8,0],[8,2],[4,2]);pose.result.geometry.faces.push([8,9,10,11]);
  pose.spatial!.vertices=pose.result.geometry.vertices.map(([x,y])=>[x,y,3]);
  pose.spatial!.faceTransforms=pose.result.geometry.faces.map(()=>({rotation:[1,0,0,0,1,0,0,0,1],translation:[0,0,3]}));
  Object.assign(pose.result.geometry.graph!,{vertices_coords:pose.result.geometry.vertices,faces_vertices:pose.result.geometry.faces,edges_vertices:[[0,1]],edges_assignment:['V'],edges_foldAngle:[180],zhezhi_spatialEdgeOnFaces:[]});
  pose.spatial!.measuredAngles=[180];pose.result.layers.faceOrders=[[2,0,1],[1,2,1]];
  const local=spans(diagramSpatialEdgeMarkup(pose,pose.view!,'#41634e'));
  assert.ok(local.length);assert.ok(local.every(([a,b])=>b<=4||a>=8),'a proven local path through the seam face hides the lower edge');
  const remote=structuredClone(pose);
  for(let v=8;v<12;v++){remote.result.geometry.vertices[v][1]+=10;remote.spatial!.vertices[v][1]+=10;}
  const remotePieces=spans(diagramSpatialEdgeMarkup(remote,remote.view!,'#41634e'));
  assert.ok(remotePieces.some(([a,b])=>a===0&&b===10),'a path through a remote face cannot certify local covering order');
});
