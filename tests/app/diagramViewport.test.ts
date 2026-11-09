import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import type {DiagramAnnotation} from '../../src/app/diagramAnnotations';
import {diagramAnnotationsInBox} from '../../src/app/diagramDrawingTools';
import {rotateDiagramViewportPoint,diagramViewportRotatedBounds,zoomDiagramViewport,normalizeDiagramViewportAngle,diagramViewportAnnotations} from '../../src/app/diagramViewport';

const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);
const pointClose=(actual:Point,expected:Point)=>{close(actual[0],expected[0]);close(actual[1],expected[1]);};

test('rotated viewport bounds enclose all drawing corners while preserving its center',()=>{
  const rect={x:-30,y:12,width:150,height:70},center:Point=[45,47];
  for(const angle of [-165,-90,-45,0,15,45,90,179]){
    const bounds=diagramViewportRotatedBounds(rect,angle);
    close(bounds.x+bounds.width/2,center[0]);close(bounds.y+bounds.height/2,center[1]);
    for(const point of [[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x+rect.width,rect.y+rect.height],[rect.x,rect.y+rect.height]] as Point[]){
      const p=rotateDiagramViewportPoint(point,center,angle);
      assert.ok(p[0]>=bounds.x-1e-8&&p[0]<=bounds.x+bounds.width+1e-8);
      assert.ok(p[1]>=bounds.y-1e-8&&p[1]<=bounds.y+bounds.height+1e-8);
    }
  }
});

test('rotated world pointer and screen-aligned selection corners can be inverted without changing drawing coordinates',()=>{
  const center:Point=[43,-17],world:Point=[-12,86];
  for(const angle of [-150,-45,15,90,180])pointClose(rotateDiagramViewportPoint(rotateDiagramViewportPoint(world,center,angle),center,-angle),world);
  assert.deepEqual(world,[-12,86]);
});

test('cursor anchored zoom stays stationary through an arbitrary viewport rotation',()=>{
  const before={x:11,y:-26,width:180,height:90},anchor:Point=[42,37],factor=.8;
  const after=zoomDiagramViewport(before,anchor,factor),beforeCenter:Point=[before.x+before.width/2,before.y+before.height/2],afterCenter:Point=[after.x+after.width/2,after.y+after.height/2];
  for(const angle of [0,15,45,120]){
    const a=rotateDiagramViewportPoint(anchor,beforeCenter,angle),b=rotateDiagramViewportPoint(anchor,afterCenter,angle);
    close((a[0]-beforeCenter[0])/before.width,(b[0]-afterCenter[0])/after.width);
    close((a[1]-beforeCenter[1])/before.height,(b[1]-afterCenter[1])/after.height);
  }
  assert.deepEqual(before,{x:11,y:-26,width:180,height:90});
  assert.throws(()=>zoomDiagramViewport(before,anchor,0),/有限正数/);
});

test('viewport angle stays bounded through clockwise and counterclockwise rotation',()=>{
  assert.equal(normalizeDiagramViewportAngle(375),15);
  assert.equal(normalizeDiagramViewportAngle(-375),-15);
  assert.equal(normalizeDiagramViewportAngle(180),-180);
});

test('screen-aligned box selection uses rotated real strokes and permits large temporary screen coordinates without changing the file',()=>{
  const original:DiagramAnnotation[]=[
    {id:'line',kind:'line',a:[5,0],b:[15,0],style:'valley',color:'#333333',width:.4},
    {id:'hollow',kind:'symbol',symbol:'referencePoint',position:[30,0],size:12,rotation:17,color:'#333333',width:.4,params:{radius:25}},
    {id:'large',kind:'line',a:[1000000,-1000000],b:[999900,-999900],style:'valley',color:'#333333',width:.4},
  ];
  const snapshot=JSON.stringify(original),projected=diagramViewportAnnotations(original,[0,0],90);
  assert.deepEqual(diagramAnnotationsInBox(projected,[-1,9],[1,11]),['line']);
  assert.deepEqual(diagramAnnotationsInBox(projected,[-.2,29.8],[.2,30.2]),[]);
  const large=diagramViewportAnnotations(original,[0,0],45).find(a=>a.id==='large');
  assert.ok(large?.kind==='line'&&large.a[0]>1000000);
  assert.equal(JSON.stringify(original),snapshot);
});
