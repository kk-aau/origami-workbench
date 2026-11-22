import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {adoptDiagramPose,createDiagramProject} from '../../src/app/diagramProject';
import {applyDiagramBasicSettings,readDiagramBasicSettings} from '../../src/app/diagramBasicSettings';
import {diagramPDFCoverSVG,diagramPDFStepSVG} from '../../src/app/diagramPDF';
import {diagramModelMarkup} from '../../src/app/diagramDrawing';
import {diagramBoundaryOverlay} from '../../src/app/diagramBoundaryOverlay';
import {defaultModelView} from '../../src/app/modelViewState';
import {diagramLocalSurfaceMarkup} from '../../src/app/diagramLocalSurface';
import {defaultModelColors} from '../../src/app/modelColors';
import {createDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {diagramSpatialEdgeMarkup} from '../../src/app/diagramSpatialEdges';
import {changeGlobalDiagramLineStyle,defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';

function fixture(){
 const doc=blankDoc('折叠边界',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
 const p=createDiagramProject(doc);return adoptDiagramPose(p,p.activeStepId,p.steps[0].beforeId,computeFlatFold(doc));
}
function widths(markup:string){return [...markup.matchAll(/<[^>]*stroke-width="([\d.e+-]+)"[^>]*vector-effect="non-scaling-stroke"[^>]*>/g)].map(m=>Number(m[1]));}
function thinner(before:string,after:string){const a=widths(before),b=widths(after);assert.ok(a.length>0);assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(b[i]/a[i]-.4/.7)<1e-9,`boundary ${i}: ${a[i]} -> ${b[i]}`);}
test('basic information boundary 0.7 to 0.4 changes finished-model and step outlines without changing folded geometry',()=>{
 const p=fixture(),settings=readDiagramBasicSettings(p),saved=structuredClone(p);settings.lineDefaults.boundary.width=.7;
 const normal=applyDiagramBasicSettings(p,p.name,settings);settings.lineDefaults.boundary.width=.4;const thin=applyDiagramBasicSettings(p,p.name,settings);
 for(const size of [{width:90,height:120},{width:300,height:400}]){
  thinner(diagramPDFCoverSVG(normal,normal.steps[0],undefined,undefined,size),diagramPDFCoverSVG(thin,thin.steps[0],undefined,undefined,size));
  thinner(diagramPDFStepSVG(normal,normal.steps[0],size),diagramPDFStepSVG(thin,thin.steps[0],size));
 }
 thinner(diagramModelMarkup(normal.steps[0].pose!,undefined,false,[],normal.basicSettings!.lineDefaults),diagramModelMarkup(thin.steps[0].pose!,undefined,false,[],thin.basicSettings!.lineDefaults));
 thinner(diagramBoundaryOverlay(p.steps[0].pose!,defaultModelView(),normal.basicSettings!.lineDefaults).markup,diagramBoundaryOverlay(p.steps[0].pose!,defaultModelView(),thin.basicSettings!.lineDefaults).markup);
 assert.equal(thin.states,p.states);assert.equal(thin.steps[0].pose!.result,p.steps[0].pose!.result);assert.deepEqual(p,saved);
});
test('local surface paint cache includes boundary width and retains its certified geometry',()=>{
 const p=fixture(),pose=structuredClone(p.steps[0].pose!);delete pose.result.layers.faceOrder;delete pose.displayOrder;
 const view=defaultModelView(),colors=defaultModelColors();
 const a=diagramLocalSurfaceMarkup(pose,view,colors,false,undefined,.8)!;
 const b=diagramLocalSurfaceMarkup(pose,view,colors,false,undefined,.8*.4/.7)!;
 assert.ok(a&&b);thinner(a,b);assert.equal(diagramLocalSurfaceMarkup(pose,view,colors,false,undefined,.8),a);
});
test('spatial fold silhouettes update cached widths while legacy defaults and CP remain unchanged',()=>{
 const doc=blankDoc('侧立纸面',90,90);doc.segments.push({id:'a',a:[30,0],b:[30,90],assignment:'V',angle:90},{id:'b',a:[60,0],b:[60,90],assignment:'M',angle:-45});
 const pose={sourceStateId:'cp',sourceRevision:0,sourceDoc:doc,...createDiagramSpatialPose(doc,0,undefined,undefined,{yaw:0,elevation:0}),view:defaultModelView()},saved=structuredClone(pose);
 delete pose.result.layers.faceOrder;
 const normal=defaultDiagramLineDefaults(),thin=changeGlobalDiagramLineStyle(normal,'boundary',{width:.4});
 const a=diagramModelMarkup(pose,pose.view,false,[],normal),b=diagramModelMarkup(pose,pose.view,false,[],thin);
 assert.match(a,/data-diagram-spatial-edge/);thinner(a,b);assert.equal(diagramModelMarkup(pose,pose.view,false,[],normal),a);
 thinner(diagramSpatialEdgeMarkup(pose,pose.view,'#123456'),diagramSpatialEdgeMarkup(pose,pose.view,'#123456',1.35*.4/.7));
 delete saved.result.layers.faceOrder;assert.deepEqual(pose,saved);
});
