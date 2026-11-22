import assert from 'node:assert/strict';
import test from 'node:test';
import type {Point} from '../../src/core/types';
import {diagramPDFBranchContinuationPaths,diagramPDFRibbonSeamNeighbors} from '../../src/app/diagramPDFBranchContinuation';
import {diagramPDFRibbonPath} from '../../src/app/diagramPDFDecoration';

const paper={x:0,y:0,width:595.27559,height:841.88976};
function layout(x:number,y:number){
  const cell={x:x-50,y:y-48,width:100,height:120};
  return {cell,cells:[cell],paper,gap:17};
}
function samplesAtCut(ax:number,ay:number,bx:number,by:number,height?:number){
  const route=diagramPDFBranchContinuationPaths(layout(ax,ay),layout(bx,by),height,23);
  const samples:Point[]=[];
  for(const side of ['outgoing','incoming'] as const){
    const normalized=route[side].map(([x,y]):Point=>[x/paper.width,y/paper.height]);
    const neighbors=diagramPDFRibbonSeamNeighbors(normalized,side,route.slopes?.[side],paper);
    const d=diagramPDFRibbonPath(normalized,paper,true,neighbors);
    let start=route[side][0];
    for(const curve of d.split(' C ').slice(1)){
      const [x1,y1,x2,y2,x3,y3]=curve.split(' ').map(Number);
      for(let i=0;i<80;i++){
        const t=i/80,u=1-t;
        const x=u**3*start[0]+3*u*u*t*x1+3*u*t*t*x2+t**3*x3;
        const y=u**3*start[1]+3*u*u*t*y1+3*u*t*t*y2+t**3*y3;
        samples.push([x+(side==='incoming'?paper.width:0),y]);
      }
      start=[x3,y3];
    }
  }
  samples.push([paper.width+bx,by]);
  return {route,samples};
}
test('54 → 55A steepens all the way to the raised drawing, through its saved 61.9036% seam',()=>{
  const ax=377.1082,ay=652.7071,bx=113.3858,by=397.8660,pin=.6190360101362485;
  for(const height of [undefined,pin]){
    const {route,samples}=samplesAtCut(ax,ay,bx,by,height);
    if(height!==undefined)assert.equal(route.incoming[0][1],paper.height*height);
    assert.equal(route.outgoing.at(-1)![1],route.incoming[0][1]);
    const grade=samples.slice(1).map(([x,y],i)=>(y-samples[i][1])/(x-samples[i][0]));
    assert.ok(grade.every((v,i)=>v<0&&(!i||v<grade[i-1]+1e-7)),'no flat segment or turn back before the receiving drawing');
    assert.ok(Math.abs(grade.at(-1)!)>2*Math.abs(grade[0]),'the sides of the spread play distinct roles in the bend');
    assert.ok(grade.every((v,i)=>!i||Math.abs(Math.atan(v)-Math.atan(grade[i-1]))<.012),'no sharp shoulder at the spine or between knots');
  }
});
test('two unobstructed facing steps in one row cross at the shared height',()=>{
  const {samples}=samplesAtCut(444,170,93,170);
  assert.ok(samples.every(([,y])=>Math.abs(y-170)<1e-8));
});
test('a strongly offset linked height still gives a monotone ribbon right into the receiving drawing',()=>{
  const ay=650,by=220;
  for(const y of [ay-2,by+2]){
    const {route,samples}=samplesAtCut(445,ay,150,by,y/paper.height);
    assert.ok(Math.abs(route.incoming[0][1]-y)<1e-8);
    assert.ok(samples.every((p,i)=>!i||p[1]<=samples[i-1][1]+1e-7));
  }
});
