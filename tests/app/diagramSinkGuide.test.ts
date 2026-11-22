import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {createAutomaticSinkGuide,diagramSinkGuide,diagramSinkPattern,findAutomaticSinkPattern} from '../../src/app/diagramSinkGuide';
import {createDiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import type {DiagramProject} from '../../src/app/diagramProject';
import type {Doc,Point,Segment} from '../../src/core/types';

const tip:Point=[100,100];
const fold=(id:string,a:Point,b:Point,angle:number):Segment=>({id,a,b,assignment:angle<0?'M':'V',angle});
const sheet=(lines:Segment[]):Doc=>{
  const doc=blankDoc('沉折',200,200);
  return {...doc,segments:[...doc.segments,...lines]};
};
const midpoint=(a:Point,b:Point):Point=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
function polygonSink(ring:Point[]):[Doc,Doc,Doc]{
  const before:Segment[]=[],middle:Segment[]=[],after:Segment[]=[];
  ring.forEach((p,i)=>{
    const q=ring[(i+1)%ring.length],m=midpoint(p,q);
    before.push(fold('before-corner-'+i,tip,p,-180),fold('before-mid-'+i,tip,m,180));
    middle.push(fold('guide-rim-'+i,p,q,-70));
    after.push(fold('rim-a-'+i,p,m,-180),fold('rim-b-'+i,m,q,-180),
      fold('after-corner-'+i,tip,p,180),fold('after-mid-'+i,tip,m,-180));
  });
  return [sheet(before),sheet(middle),sheet(after)];
}

for(const [name,ring] of [
  ['三角形',[[45,40],[163,80],[76,155]]],
  ['五边形',[[47,65],[119,49],[157,91],[127,143],[54,131]]],
] as [string,Point[]][])test(name+'沉口识别采用材料闭环与反转辐射折痕',()=>{
  const [start,guide,end]=polygonSink(ring);
  const pattern=diagramSinkPattern(start,guide,end);
  assert.deepEqual(pattern?.center,tip);assert.equal(pattern?.ring.length,ring.length);
  const automatic=findAutomaticSinkPattern(start,end);
  assert.ok(automatic);assert.equal(automatic.ring.length,ring.length);
  const computed=createAutomaticSinkGuide(start,end,automatic);
  assert.equal(computed.pose.result.geometry.status,'ready');
  assert.equal(computed.pose.result.layers.status,'solved');
  const open={...guide,segments:guide.segments.slice(0,-1)};
  assert.equal(diagramSinkPattern(start,open,end),undefined);
  const retained={...end,segments:end.segments.map(s=>s.id.startsWith('after-')?fold(s.id,s.a,s.b,-s.angle!):s)};
  assert.equal(diagramSinkPattern(start,guide,retained),undefined);
  assert.equal(findAutomaticSinkPattern(start,retained),undefined);
  const foldedElsewhere=(doc:Doc)=>({...doc,segments:[...doc.segments,fold('other',[0,10],[10,0],50)]});
  assert.deepEqual(diagramSinkPattern(foldedElsewhere(start),foldedElsewhere(guide),foldedElsewhere(end))?.center,tip);
});

test('下部削去两角的六边沉口仍能沿闭环识别，六个外伸折痕属于周边纸面',()=>{
  const ring:Point[]=[[60,50],[145,50],[145,107],[123,140],[82,140],[60,107]];
  const outer:Point[]=[[0,50],[200,50],[200,107],[183,200],[22,200],[0,107]];
  const [start,guide,end]=polygonSink(ring);
  ring.forEach((p,i)=>{
    guide.segments.push(fold('outer-'+i,p,outer[i],65));
    end.segments.push(fold('outer-'+i,p,outer[i],180));
  });
  const pattern=diagramSinkPattern(start,guide,end);
  assert.deepEqual(pattern?.center,tip);assert.equal(pattern?.ring.length,6);
  assert.deepEqual(new Set(pattern.ring.map(p=>p.join(','))),new Set(ring.map(p=>p.join(','))));
  const saved=JSON.stringify([start,end]),automatic=findAutomaticSinkPattern(start,end);
  assert.ok(automatic);
  const calculated=createAutomaticSinkGuide(start,end,automatic);
  assert.equal(calculated.pose.result.layers.status,'solved');
  const gussets=calculated.doc.segments.filter(s=>s.assignment==='V');
  assert.equal(gussets.length,6);
  for(const [i,s] of gussets.entries()){
    assert.deepEqual(s.a,ring[i]);
    assert.ok(Math.sign(s.b[0]-s.a[0])===Math.sign(outer[i][0]-s.a[0]));
    if(i===3||i===4)assert.ok(s.b[1]>s.a[1]);else assert.ok(Math.abs(s.b[1]-s.a[1])<1e-8);
  }
  assert.equal(JSON.stringify([start,end]),saved);
  guide.segments=guide.segments.filter(s=>s.id!=='guide-rim-4');
  assert.equal(diagramSinkPattern(start,guide,end),undefined);
});

test('只从同一路径的操作前、已存空间中间图和无动作的终态进入，排除失效快照',()=>{
  const rim:Point[]=[[75,75],[125,75],[125,125],[75,125]],corners:Point[]=[[0,0],[200,0],[200,200],[0,200]];
  const start=sheet([...corners.map((p,i)=>fold('diag-'+i,tip,p,-180)),fold('horizontal',[0,100],[200,100],180)]);
  const outer=rim.map((p,i)=>fold('outer-'+i,p,corners[i],-180));
  const guide=sheet([...outer,...rim.map((p,i)=>fold('side-'+i,p,rim[(i+1)%4],-90)),
    ...rim.map((p,i)=>fold('flap-'+i,p,[p[0]<100?0:200,p[1]],90))]);
  const end=sheet([...outer,...rim.map((p,i)=>fold('side-'+i,p,rim[(i+1)%4],-180)),
    ...rim.map((p,i)=>fold('inside-'+i,tip,p,180)),fold('left',[0,100],[75,100],180),
    fold('right',[125,100],[200,100],180),fold('inverted',[75,100],[125,100],-180)]);
  const states=[sheet([]),start,guide,end,end].map((doc,i)=>({id:'cp-'+i,revision:1,doc}));
  const project:DiagramProject={format:'zhezhi-diagram',version:1,name:'沉折测试',activeStepId:'step-3',states,
    steps:states.slice(0,-1).map((s,i)=>({id:'step-'+i,beforeId:s.id,afterId:states[i+1].id,title:'',description:'',pose:null}))};
  const captured=createDiagramSpatialPose(guide);
  project.steps[2].pose={...captured,sourceStateId:states[2].id,sourceRevision:1,sourceDoc:guide};
  assert.deepEqual(project.steps.map(s=>diagramSinkGuide(project,s.id)?.guideIndex),[undefined,2,2,2]);
  project.states[4]={...states[4],doc:start};
  assert.equal(diagramSinkGuide(project,'step-3'),undefined);
  project.states[2]={...states[2],revision:2};
  assert.equal(diagramSinkGuide(project,'step-1'),undefined);
  const broken=structuredClone(project);
  broken.states[2].revision=1;broken.states[2].doc.segments.push(fold('invalid',[NaN,0],[0,0],-90));
  broken.steps[2].pose!.sourceDoc=broken.states[2].doc;
  assert.equal(diagramSinkGuide(broken,'step-1'),undefined);
});
