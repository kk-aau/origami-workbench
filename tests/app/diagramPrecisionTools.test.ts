import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramRatioPoint,diagramSpecialPoint,evaluateDiagramRatio,diagramAnglePoint} from '../../src/app/diagramPrecisionTools';
import {diagramAnglePresetDirection,isValidDiagramAnglePreset} from '../../src/app/diagramAnglePreset';
import {snapAnglePoint} from '../../src/app/angleSystem';
import {snapDiagramDrawingLine} from '../../src/app/diagramDrawingSnap';
import type {Point,Segment} from '../../src/core/types';

const close=(actual:Point,expected:Point)=>assert.ok(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<1e-7,`${actual} != ${expected}`);
const line=(a:Point,b:Point):Segment=>({id:'finite-target',a,b,assignment:'U',angle:0});

test('ratio measures AP:PB from ordered endpoints and leaves inputs untouched',()=>{
  const a:Point=[10,-20],b:Point=[90,60],before=structuredClone([a,b]);
  close(diagramRatioPoint(a,b,1,3),[30,0]);
  close(diagramRatioPoint(b,a,1,3),[70,40]);
  close(diagramRatioPoint(a,b,3,1),[70,40]);
  assert.deepEqual([a,b],before);
});

test('ratio scales large positive weights before summing and rejects external or collapsed points',()=>{
  close(diagramRatioPoint([0,0],[100,0],1e308,1e308),[50,0]);
  for(const pair of [[0,1],[-1,1],[1,0],[1,Infinity],[NaN,1],[Number.MIN_VALUE,Number.MAX_VALUE]])
    assert.throws(()=>diagramRatioPoint([0,0],[100,0],pair[0],pair[1]));
  assert.throws(()=>diagramRatioPoint([0,0],[0,0],1,1));
  assert.throws(()=>diagramRatioPoint([NaN,0],[1,1],1,1));
  assert.throws(()=>diagramRatioPoint([1e6+1,0],[1e6,1],1,1));
});

test('special point interprets the expression as AP/AB, including common square-root fractions',()=>{
  close(diagramSpecialPoint([0,0],[100,100],'(√2+1)/3'),[100*(Math.sqrt(2)+1)/3,100*(Math.sqrt(2)+1)/3]);
  close(diagramSpecialPoint([100,0],[0,0],'sqrt(2)-1'),[100*(2-Math.sqrt(2)),0]);
  assert.ok(Math.abs(evaluateDiagramRatio('1/(1+√2)')-(Math.sqrt(2)-1))<1e-12);
  assert.ok(Math.abs(evaluateDiagramRatio('(2−√2)÷2')-(2-Math.sqrt(2))/2)<1e-12);
});

test('arithmetic respects precedence, signs, nested roots and whitespace',()=>{
  assert.equal(evaluateDiagramRatio(' 1 / 2 + 1 / 8 * 2 - .25 '),.5);
  assert.equal(evaluateDiagramRatio('-(1-2)/4'),.25);
  assert.equal(evaluateDiagramRatio('sqrt(sqrt(16))/4'),.5);
  assert.equal(evaluateDiagramRatio('5e-1'),.5);
  assert.equal(evaluateDiagramRatio('1 × 1 ÷ 2'),.5);
});

test('negative radicands, nonpositive divisors, noninterior ratios and nonfinite arithmetic reject',()=>{
  for(const expression of ['sqrt(-2)/2','√(-1)','1/0','1/(-2)','1/(√4-2)','0','1','2','-1/2','1e999','1e308*1e308/2','1/(1e-999)'])
    assert.throws(()=>evaluateDiagramRatio(expression),expression);
  assert.throws(()=>diagramSpecialPoint([1e6,1e6],[1e6-1,1e6],'1e-300'));
});

test('formula parser rejects code, identifiers, malformed input and excessive nesting',()=>{
  for(const expression of ['', ' ', 'Math.sqrt(2)/2','globalThis.process.exit()','(()=>.5)()','1;alert(1)', '.5/**/', '2**-1','sqrt2/2','sqrt(2','√','1 2/3','(1+2)) / 4','[.5]','0x1/2'])
    assert.throws(()=>evaluateDiagramRatio(expression),expression);
  assert.throws(()=>evaluateDiagramRatio('('.repeat(40)+'.5'+')'.repeat(40)));
  assert.throws(()=>evaluateDiagramRatio(' '.repeat(257)+'.5'));
});

test('preset angles project orthogonally at 45 and 22.5 degrees, with free mode retaining coordinates',()=>{
  close(diagramAnglePoint([0,0],[100,80],45),[90,90]);
  const angle=Math.PI/8,direction:Point=[Math.cos(angle),Math.sin(angle)],length=100*direction[0]+40*direction[1];
  close(diagramAnglePoint([0,0],[100,40],22.5),[length*direction[0],length*direction[1]]);
  close(diagramAnglePoint([7,8],[100,80],0),[100,80]);
  close(diagramAnglePoint([10,10],[-90,-70],45),[-80,-80]);
});

test('preset vertex snapping keeps the same forward ray and rejects nearby off-ray or reverse points',()=>{
  close(diagramAnglePoint([0,0],[100,80],45,{radius:5,vertices:[[92,92]]}),[92,92]);
  close(diagramAnglePoint([0,0],[100,80],45,{radius:5,vertices:[[90,91]]}),[90,90]);
  close(diagramAnglePoint([0,0],[1,0],45,{radius:5,vertices:[[-1,0],[0,0]]}),[1,0]);
});

test('preset line snapping uses finite forward intersections, never target extensions',()=>{
  close(diagramAnglePoint([0,0],[99,80],45,{radius:20,segments:[line([100,0],[100,200])]}),[100,100]);
  close(diagramAnglePoint([0,0],[99,80],45,{radius:20,segments:[line([100,70],[100,90])]}),[89.5,89.5]);
  close(diagramAnglePoint([0,0],[1,0],90,{radius:5,segments:[line([-1,-1],[-1,1])]}),[1,0]);
});

test('a specified baseline rotates the angle fan and maintains world-space snapping',()=>{
  close(diagramAnglePoint([10,20],[110,30],45,{baselineDegrees:90}),[110,20]);
  const c=Math.sqrt(3)/2,origin:Point=[10,20],target:Point=[10+100*c,70];
  close(diagramAnglePoint(origin,[target[0]+1,target[1]-2],45,{baselineDegrees:30,radius:5,vertices:[target]}),target);
  close(diagramAnglePoint([1e6,-1e6],[-1e6,1e6],45,{baselineDegrees:90}),[-1e6,1e6]);
});

test('angle options reject invalid steps, radius, baselines, tolerances and coordinates',()=>{
  for(const step of [-1,Infinity,NaN,.1,90.01,180])assert.throws(()=>diagramAnglePoint([0,0],[1,1],step));
  for(const options of [{radius:-1},{radius:Infinity},{baselineDegrees:NaN},{eps:0},{eps:Infinity}])
    assert.throws(()=>diagramAnglePoint([0,0],[1,1],45,options));
  assert.throws(()=>diagramAnglePoint([NaN,0],[1,1],0));
  assert.throws(()=>diagramAnglePoint([1e6,0],[1e6,1],45,{baselineDegrees:30}));
  close(diagramAnglePoint([2,3],[2,3],45),[2,3]);
});

const polar=(angle:number,length=100):Point=>[Math.cos(angle*Math.PI/180)*length,Math.sin(angle*Math.PI/180)*length];
function projectDirection(pointer:Point,angle:number):Point{
  const direction=polar(angle,1),length=pointer[0]*direction[0]+pointer[1]*direction[1];return [length*direction[0],length*direction[1]];
}

test('decimal increments select real half-turn axes rather than requiring an integer division of 180',()=>{
  close(diagramAnglePoint([0,0],[100,80],37.5),projectDirection([100,80],37.5));
  close(diagramAnglePoint([0,0],polar(51),17.3),projectDirection(polar(51),51.9));
  for(const value of [0,.5,13,17.3,37.5,89.999,90])assert.equal(isValidDiagramAnglePreset(value),true);
  for(const value of [null,undefined,'17.3',.49,90.01,NaN,Infinity])assert.equal(isValidDiagramAnglePreset(value),false);
});

test('nondividing increments have bounded final gaps, stable ties and opposite directions for reversed lines',()=>{
  assert.equal(diagramAnglePresetDirection(18.75,37.5),37.5);assert.equal(diagramAnglePresetDirection(198.75,37.5),217.5);
  assert.equal(diagramAnglePresetDirection(164,37.5),150);assert.equal(diagramAnglePresetDirection(165,37.5),180);assert.equal(diagramAnglePresetDirection(166,37.5),180);
  for(const step of [17.3,37.5,89.999])for(const angle of [-.001,.001,18.75,51.9,164.999,165,165.001,179.999,180.001,359.999]){
    const pointer=polar(angle),forward=diagramAnglePoint([0,0],pointer,step),reverse=diagramAnglePoint([0,0],[-pointer[0],-pointer[1]],step);
    close(reverse,[-forward[0],-forward[1]]);assert.ok(pointer[0]*forward[0]+pointer[1]*forward[1]>0,'the chosen axis cannot send the endpoint behind the anchor');
  }
  close(diagramAnglePoint([0,0],polar(179.999),37.5),projectDirection(polar(179.999),180));
  close(diagramAnglePoint([0,0],polar(359.999),37.5),projectDirection(polar(359.999),360));
});

test('all existing dividing presets retain exactly the original direction selection and projection',()=>{
  const origin:Point=[10,-30];
  for(const step of [.5,1,15,22.5,30,45,60,90])for(const angle of [-.01,0,step/2,45,89.99,135,180,225,359.99]){
    const delta=polar(angle),pointer:Point=[origin[0]+delta[0],origin[1]+delta[1]];
    assert.deepEqual(diagramAnglePoint(origin,pointer,step),snapAnglePoint(origin,pointer,{kind:'divided',divider:180/step}));
  }
});

test('custom increments reuse finite forward edge and vertex snapping without accepting extensions or far near-parallel cuts',()=>{
  const target=polar(37.5),pointer:Point=[target[0]+1,target[1]-1],projected=projectDirection(pointer,37.5);
  close(diagramAnglePoint([0,0],pointer,37.5,{radius:3,segments:[line([target[0],target[1]-5],[target[0],target[1]+5])]}),target);
  close(diagramAnglePoint([0,0],pointer,37.5,{radius:3,segments:[line([target[0],target[1]+2],[target[0],target[1]+5])]}),projected);
  close(diagramAnglePoint([0,0],pointer,37.5,{radius:3,vertices:[[-target[0],-target[1]],[target[0],target[1]+.1],target]}),target);
  close(diagramAnglePoint([0,0],[50,-9.5],37.5,{radius:10,segments:[line([0,-10],[2000,10])]}),[50,0]);
  const anchor:Point=[10,20],rotated=polar(67.5),world:Point=[anchor[0]+rotated[0],anchor[1]+rotated[1]];
  close(diagramAnglePoint(anchor,[world[0]+1,world[1]-1],37.5,{baselineDegrees:30,radius:3,vertices:[world]}),world);
});

test('custom drawing presets retain Alt free movement and Shift constraints even when ordinary snapping is disabled',()=>{
  const pointer:Point=[100,80],options={enabled:false,radius:2,targets:[],lines:[],anchor:[0,0] as Point,anglePreset:37.5};
  close(snapDiagramDrawingLine(pointer,options).point,projectDirection(pointer,37.5));
  close(snapDiagramDrawingLine(pointer,{...options,altKey:true}).point,pointer);
  const shifted=snapDiagramDrawingLine(pointer,{...options,shiftKey:true}).point;assert.ok(Math.abs(shifted[0]-shifted[1])<1e-8);
  close(snapDiagramDrawingLine(pointer,{...options,altKey:true,shiftKey:true}).point,shifted);
});
