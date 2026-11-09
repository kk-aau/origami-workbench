import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {defaultModelView} from '../../src/app/modelViewState';
import {topDiagramFaceAtPoint,pickTopDiagramAnnotation} from '../../src/app/diagramLinePick';
import {diagramTearWindowOutline} from '../../src/app/diagramTearWindowGeometry';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {DiagramSymbolAnnotation,DiagramLineAnnotation} from '../../src/app/diagramAnnotations';

function fixture(){
  const doc=blankDoc('撕纸透视点选',100,100);
  doc.segments.push({id:'old',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  result.layers={...result.layers,status:'solved',faceOrder:[0,1]};
  const pose:DiagramPose={sourceStateId:'before',sourceRevision:0,sourceDoc:doc,result,view:defaultModelView()};
  const window:DiagramSymbolAnnotation={id:'window',kind:'symbol',symbol:'tearWindow',position:[25,40],size:100,rotation:0,color:'#293d35',width:.7,params:{radius:12},cutawayFaces:[1]};
  const line=(id:string,face:number):DiagramLineAnnotation=>({id,kind:'line',a:[0,40],b:[50,40],style:'valley',color:'#293d35',width:.7,foldFaces:[face]});
  return {pose,window,upper:line('upper',1),lower:line('lower',0)};
}

test('inside a cutaway selects the exposed lower crease while the outside still selects the original upper face',()=>{
  const {pose,window,upper,lower}=fixture(),annotations=[upper,lower,window],saved=structuredClone({pose,annotations});
  assert.equal(topDiagramFaceAtPoint(pose,[25,40],undefined,annotations),0);
  assert.equal(topDiagramFaceAtPoint(pose,[5,40],undefined,annotations),1);
  const inside=pickTopDiagramAnnotation(annotations,[25,40],.2,pose)!;
  assert.equal(inside.annotation.id,'lower');assert.equal(inside.face,0);
  assert.equal(pickTopDiagramAnnotation(annotations,[5,40],.2,pose)?.annotation.id,'upper');
  assert.deepEqual({pose,annotations},saved);
});

test('a completely cut-away paper line cannot reappear as a background drawing and the rim remains selectable',()=>{
  const {pose,window,upper,lower}=fixture();window.cutawayFaces=[0,1];
  const annotations=[lower,upper,window];
  assert.equal(topDiagramFaceAtPoint(pose,[25,40],undefined,annotations),undefined);
  assert.equal(pickTopDiagramAnnotation(annotations,[25,40],.2,pose),null);
  assert.equal(pickTopDiagramAnnotation(annotations,diagramTearWindowOutline(window)[0],.3,pose)?.annotation.id,'window');
  assert.equal(topDiagramFaceAtPoint(pose,[5,40],undefined,annotations),1);
});

test('global visibility and local windows remain independent on front and back views',()=>{
  const {pose,window,upper,lower}=fixture();pose.hiddenFaces=[1];window.cutawayFaces=[];
  const annotations=[upper,lower,window];
  assert.equal(topDiagramFaceAtPoint(pose,[25,40],undefined,annotations),0);
  assert.deepEqual(pose.hiddenFaces,[1]);
  window.cutawayFaces=[0];
  assert.equal(topDiagramFaceAtPoint(pose,[25,40],undefined,annotations),undefined);
  assert.equal(topDiagramFaceAtPoint(pose,[5,40],undefined,annotations),0);
  const back={...defaultModelView(),side:'back' as const};
  assert.equal(topDiagramFaceAtPoint(pose,[45,40],back,annotations),0,'the back-view face outside the window stays available');
});
