import test from 'node:test';
import assert from 'node:assert/strict';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {buildDiagramFold,epsilonFor} from '../../src/core/geometry';
import type {Point,Segment} from '../../src/core/types';
import {selectAutomaticSinkGuide} from '../../src/app/diagramAutomaticSinkPlan';
import {diagramAnimationEvaluator} from '../../src/app/diagramFullAnimation';
import type {DiagramProject} from '../../src/app/diagramProject';
import {findAutomaticSinkPattern} from '../../src/app/diagramSinkGuide';
import {targetForDiagramSinkLeg} from '../../src/app/diagramSinkTarget';
import {blankDoc} from '../../src/app/state';

function asymmetricHexagon():DiagramProject {
  const center:Point=[100,100],radius=28,cut=Math.SQRT2-1;
  const corners=[[-1,-1],[1,-1],[1,cut],[cut,1],[-cut,1],[-1,cut]];
  const along=(p:Point,t:number):Point=>[100+p[0]*t,100+p[1]*t];
  const boundary=(p:Point):Point=>along(p,100/Math.max(...p.map(Math.abs)));
  const rim=corners.map(p=>along(p as Point,radius));
  const normals=[-90,0,45,90,135,180].map(a=>[Math.cos(a*Math.PI/180),Math.sin(a*Math.PI/180)] as Point);
  const crease=(id:string,a:Point,b:Point,angle:number):Segment=>({id,a,b,angle,assignment:angle>0?'V':'M'});
  const start=blankDoc('削角六边形',200,200),end=blankDoc('削角六边形',200,200);
  rim.forEach((p,i)=>{
    const outer=boundary(corners[i] as Point);
    start.segments.push(crease('outer-'+i,center,outer,-180));
    end.segments.push(crease('rim-'+i,p,rim[(i+1)%rim.length],-180),crease('outer-'+i,p,outer,-180),crease('inner-'+i,center,p,180));
    // Only the first four sides have additional radial valleys. This breaks
    // the symmetry of the creases while preserving a symmetric outline.
    if(i<4){
      const touch=along(normals[i],radius),tip=boundary(normals[i]);
      start.segments.push(crease('valley-'+i,center,tip,180));
      end.segments.push(crease('valley-'+i,touch,tip,180),crease('inside-valley-'+i,center,touch,-180));
    }
  });
  const states=[start,end,end].map((doc,i)=>({id:'state-'+i,doc,revision:0}));
  const steps=states.slice(0,-1).map(({doc,id},i)=>{
    const result=recomputeFlatLayers(computeFlatGeometry(buildDiagramFold(doc).graph,epsilonFor(doc)));
    assert.equal(result.layers.status,'solved');
    return {id:'step-'+i,beforeId:id,afterId:states[i+1].id,title:'',description:'',
      pose:{sourceStateId:id,sourceRevision:0,sourceDoc:doc,result}};
  });
  return {format:'zhezhi-diagram',version:1,name:start.name,activeStepId:steps[0].id,steps,states};
}

test('六边沉口带非对称径向谷折时，外伸方向须通过撑开和压平两段轨迹校验',()=>{
  const source=asymmetricHexagon(),snapshot=JSON.stringify(source);
  const pattern=findAutomaticSinkPattern(source.states[0].doc,source.states[1].doc)!;
  assert.equal(pattern?.ring.length,6);
  const {project,opening,closing}=selectAutomaticSinkGuide(source,0,pattern);
  for(const [i,entry] of [opening,closing].entries()){
    const {path}=diagramAnimationEvaluator(entry),target=targetForDiagramSinkLeg(project,i,entry.clip)!;
    assert.ok(path.evaluate(.5).every(Number.isFinite));
    assert.ok(path.evaluate(1).every((v,k)=>Math.abs(v-target.positions[k])<2e-5));
  }
  assert.equal(JSON.stringify(source),snapshot);
});
