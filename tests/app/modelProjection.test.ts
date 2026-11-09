import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelProjection,parseModelRotation} from '../../src/app/modelProjection';
import {flatPresentation} from '../../src/app/flatPresentation';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {pointBounds} from '../../src/core/pointBounds';
import {fittedModelCamera} from '../../src/app/modelCamera';
const vertices:Point[]=[[10,20],[50,20],[50,40],[10,40]];
const near=(a:Point,b:Point)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-9));

test('200000 source vertices project, fit and export without a function-argument stack limit',()=>{
 const points:Point[]=Array.from({length:200000},(_,i)=>[i%1000,Math.floor(i/1000)]);
 const projection=modelProjection(points,false,180);near(projection.project([0,0]),[999,199]);
 const camera=fittedModelCamera(points,0);near([camera.x,camera.y],[-159.84,-159.84]);near([camera.width,camera.height],[1318.68,518.68]);assert.equal(camera.rotation,0);
 const result:FlatFoldResult={geometry:{status:'ready',message:'',vertices:points,faces:[[0,999,199999,199000]]},layers:{status:'solved',message:'',faceOrder:[0]},warnings:[]};
 const svg=foldedModelSVG(result,{name:'20万源顶点',side:'front'});assert.match(svg,/viewBox="-59.94 -59.94 1118.88 318.88"/);assert.match(svg,/points="0,0 999,0 999,199 0,199"/);
 assert.deepEqual(points[0],[0,0]);assert.deepEqual(points.at(-1),[999,199]);
});

test('streaming bounds retain empty, signed-zero and nonfinite extrema semantics',()=>{
 for(const points of [[],[[0,-0],[-0,0]],[[2,5],[-3,-7]],[[NaN,1],[3,Infinity]]] as Point[][]){
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);assert.deepEqual(pointBounds(points),{minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)});
 }
 assert.deepEqual(fittedModelCamera([],0),{rotation:0,x:Infinity,y:Infinity,width:1.32,height:1.32});
});
test('angle input normalizes signed decimal degrees and rejects empty/nonfinite/out-of-range text',()=>{
 assert.equal(parseModelRotation('22.3'),22.3);
 for(const [text,expected] of [['22.5',22.5],['-22.5',337.5],['720',0],['-360000',0],['1e2',100],[' +.5 ',.5]] as const)assert.equal(parseModelRotation(text),expected);
 for(const text of ['', ' ', 'NaN','Infinity','0x90','2,5','360001','1e999','12deg'])assert.throws(()=>parseModelRotation(text));
});
test('rotation centers on bounds; inverse screen deltas recover front and mirrored model deltas',()=>{
 for(const back of [false,true])for(const degrees of [0,45,90,180,270,359,-45,765]){
   const p=modelProjection(vertices,back,degrees),a=p.project([12,24]),b=p.project([15,29]);
   near(p.unprojectDelta([b[0]-a[0],b[1]-a[1]]),[3,5]);
 }
 near(modelProjection(vertices,false,90).project([10,20]),[40,10]);
 near(modelProjection(vertices,true,90).project([10,20]),[40,50]);
});
test('projection never modifies geometry and rejects invalid rotation',()=>{
 const before=structuredClone(vertices);vertices.map(modelProjection(vertices,true,45).project);assert.deepEqual(vertices,before);
 assert.throws(()=>modelProjection(vertices,false,NaN),/无效/);
 assert.throws(()=>modelProjection(vertices,false,Infinity),/无效/);
 near(modelProjection([],false,0).project([0,0]),[0,0]);
});
test('rotation preserves face order/material, and SVG uses exactly the same projected vertices',()=>{
 const result:FlatFoldResult={geometry:{status:'ready',message:'',vertices,faces:[[0,1,2,3]]},layers:{status:'solved',message:'',faceOrder:[0]},warnings:[]};
 const before=structuredClone(result);
 for(const side of ['front','back'] as const){
   const base=flatPresentation(result,side),rotated=flatPresentation(result,side,45);
   assert.deepEqual(rotated.order,base.order);assert.deepEqual(rotated.frontMaterial,base.frontMaterial);
   const svg=foldedModelSVG(result,{name:'旋转',side,rotation:45});
   assert.ok(svg.includes('points="'+rotated.vertices.map(p=>p.join(',')).join(' ')+'"'));
 }
 assert.deepEqual(result,before);
});
