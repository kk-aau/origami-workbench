import test from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import {diagramImageCorners,type DiagramImage} from '../../src/app/diagramImages';
import {resizeDiagramImage,translateDiagramImage,type DiagramImageCorner} from '../../src/components/diagramImageGesture';

const fixture=(rotation=0):DiagramImage=>({id:'photo',name:'步骤照片',dataUrl:'data:image/png;base64,',pixelWidth:800,pixelHeight:400,position:[20,30],width:100,height:50,rotation,source:'file'});
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const nearPoint=(actual:Point,expected:Point)=>{near(actual[0],expected[0]);near(actual[1],expected[1]);};

test('image translation changes placement without changing embedded pixels, rotation or its source',()=>{
  const image=fixture(35),snapshot=structuredClone(image),moved=translateDiagramImage(image,[50,60],[85,15]);
  assert.deepEqual(moved,{...image,position:[55,-15]});assert.deepEqual(image,snapshot);
});

test('all four image corners resize proportionally around the opposite corner through arbitrary rotation',()=>{
  for(const rotation of [0,17,90,-135,360])for(const corner of [0,1,2,3] as DiagramImageCorner[]){
    const image=fixture(rotation),before=diagramImageCorners(image),anchor=before[(corner+2)%4],pointer:Point=[anchor[0]+(before[corner][0]-anchor[0])*1.7,anchor[1]+(before[corner][1]-anchor[1])*1.7];
    const resized=resizeDiagramImage(image,corner,pointer),after=diagramImageCorners(resized);
    near(resized.width,170);near(resized.height,85);nearPoint(after[(corner+2)%4],anchor);nearPoint(after[corner],pointer);
    assert.equal(resized.width/resized.height,image.width/image.height);assert.equal(resized.rotation,rotation);
    assert.deepEqual(image,fixture(rotation));
  }
});

test('dragging a resize corner across its anchor keeps a positive image with the same aspect ratio',()=>{
  const image=fixture(23),corners=diagramImageCorners(image),anchor=corners[2],pointer:Point=[anchor[0]+(anchor[0]-corners[0][0]),anchor[1]+(anchor[1]-corners[0][1])];
  const resized=resizeDiagramImage(image,0,pointer,4);
  near(resized.height,4);near(resized.width/resized.height,2);nearPoint(diagramImageCorners(resized)[2],anchor);
  assert.equal(resizeDiagramImage(image,0,[Infinity,0]),image);
});

test('large pointer displacements keep image placement and dimensions inside project limits',()=>{
  const image=fixture(),moved=translateDiagramImage(image,[0,0],[2e8,-2e8]),resized=resizeDiagramImage(image,2,[2e8,2e8]);
  assert.deepEqual(moved.position,[1_000_000,-1_000_000]);assert.equal(resized.width,1_000_000);near(resized.height,500_000);
  assert.ok(resized.position.every(value=>Math.abs(value)<=1_000_000));
});
