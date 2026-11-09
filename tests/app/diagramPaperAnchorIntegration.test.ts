import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {buildDiagramFold,distance} from '../../src/core/geometry';
import {adoptDiagramPose,createDiagramProject} from '../../src/app/diagramProject';
import {prepareDiagramPaperAnchors,moveDiagramPaperVertices} from '../../src/app/diagramPaperDeformation';
import {diagramPresentation,diagramModelMarkup,drawingSVG} from '../../src/app/diagramDrawing';
import {diagramPDFStepSVG} from '../../src/app/diagramPDF';
import {mapDiagramCPSelection} from '../../src/app/diagramCPSelection';
import {buildDiagramSnapReferences} from '../../src/app/diagramSnapReferences';
import {topDiagramFaceAtPoint} from '../../src/app/diagramLinePick';
import {modelProjection} from '../../src/app/modelProjection';
import type {Point} from '../../src/core/types';

function fixture(){
  const doc=blankDoc('同一步折痕节点显示集成',100,100);doc.segments.push({id:'half',a:[50,0],b:[50,100],assignment:'V',angle:180});
  let project=createDiagramProject(doc);project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,computeFlatFold(doc,undefined,{flatCreases:'marks'}));
  const pose=prepareDiagramPaperAnchors(project.steps[0].pose!,[{point:[50,50],faces:[0,1]}]);
  const index=pose.result.geometry.vertices.length,moved=moveDiagramPaperVertices(pose,{group:[index,index+1],selected:[index]},[60,55]);
  return {project,pose,moved,index};
}
const near=(points:Point[],point:Point)=>points.some(candidate=>distance(candidate,point)<1e-6);

test('paper paint, SVG and PDF show the moved crease node while retaining the original snapshot indices',()=>{
  const {project,moved,index}=fixture(),before=structuredClone(moved);
  const shown=diagramPresentation(moved);assert.deepEqual(shown.vertices[index],[60,55]);assert.ok(distance(shown.vertices[index+1],[50,50])<1e-6);
  for(const svg of [diagramModelMarkup(moved),drawingSVG(moved,[],'',''),diagramPDFStepSVG({...project,steps:[{...project.steps[0],pose:moved}]},{...project.steps[0],pose:moved})]){
    assert.match(svg,/60 55/);assert.doesNotMatch(svg,/undefined|NaN/);
  }
  assert.deepEqual(moved,before);assert.equal(moved.result.geometry.vertices.length,index);
});

test('CP highlights, paper-edge snapping and material picking share the moved node mapping',()=>{
  const {project,moved}=fixture(),doc=structuredClone(moved.sourceDoc);doc.segments.push({id:'new-mark',a:[0,50],b:[100,50],assignment:'F',angle:0});
  const graph=buildDiagramFold(doc).graph,index=graph.vertices_coords.findIndex(point=>distance(point,[50,50])<1e-6);assert.ok(index>=0);
  const mapped=mapDiagramCPSelection(moved,{id:'after',revision:0,doc},{kind:'vertex',index});
  assert.ok(near(mapped.points,[60,55]));assert.ok(near(mapped.points,[50,50]));
  const refs=buildDiagramSnapReferences({pose:moved,annotations:[]});assert.ok(refs.some(line=>near([line.a,line.b],[60,55])));
  assert.equal(typeof topDiagramFaceAtPoint(moved,[59,54.5]),'number');
  assert.deepEqual(project.states[0].doc,moved.sourceDoc);
});

test('moving an appended node beyond base bounds keeps the established back-view projection center',()=>{
  const {pose,index}=fixture();pose.view={...pose.view!,side:'back',rotation:37};
  const moved=moveDiagramPaperVertices(pose,{group:[index],selected:[index]},[140,55]);
  const projection=modelProjection(pose.result.geometry.vertices,true,37),shown=diagramPresentation(moved);
  assert.deepEqual(shown.vertices[index],projection.project([140,55]));
  pose.result.geometry.vertices.forEach((point,index)=>assert.deepEqual(shown.vertices[index],projection.project(point)));
});
