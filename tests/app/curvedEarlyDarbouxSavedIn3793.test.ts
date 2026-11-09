import test from 'node:test';
import assert from 'node:assert/strict';
import {earlyCurve,earlyFrame,earlyIntersectionTangency,earlySavedInput,
  earlySurface,type EarlyCell} from '../../src/app/curvedEarlyDarbouxSavedIn3793';
const cells:EarlyCell[]=['3793','3794','3796','3797'];
const close=(a:number,b:number,tol=2e-9)=>
  assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const dot=(a:number[],b:number[])=>a.reduce((n,x,i)=>n+x*b[i],0);
const cross=(a:number[],b:number[])=>[
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dist=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
const derivative=(f:(x:number)=>number[],t:number)=>{
  const h=1e-5,p=f(t+h),m=f(t-h);
  return p.map((x,i)=>(x-m[i])/(2*h));
};

test('four saved cells retain distinct plot and symbolic-print inputs',()=>{
  for(const cell of cells){
    const meta=earlySavedInput(cell);
    assert.equal(meta.sourceCell,`In[${cell}]`);
    assert.equal(meta.wolframNumericOutAvailable,false);
    assert.equal(meta.exactFOLD,false);
  }
  assert.deepEqual(earlySavedInput('3793').curveRange,[-.3,.3]);
  close(earlySavedInput('3793').sourceFrameAt!, .15);
  close(earlySavedInput('3793').sourceVectorLength!, .1);
  assert.equal(earlySavedInput('3794').sourceFrameAt,null);
  assert.deepEqual(earlySavedInput('3794').curveRange,[-Math.PI/2,Math.PI/2]);
  assert.equal(earlySavedInput('3796').printedBeforeNumericPlotAssignments,true);
  assert.equal(earlySavedInput('3797').printedBeforeNumericPlotAssignments,true);
  assert.deepEqual([earlySavedInput('3796').plotK1,earlySavedInput('3796').plotK2],[1,2]);
  assert.throws(()=>earlySavedInput('3800' as EarlyCell));
  assert.throws(()=>earlyCurve('3793',.301));
});

test('saved intersection lies exactly on both unit cylinders and is tangent only at plot ends',()=>{
  for(const t of [-Math.PI/2,-1,-.4,0,.7,Math.PI/2]){
    const p=earlyCurve('3794',t),n=earlyIntersectionTangency(t),
      s1=earlySurface('3794',p[0],t,1),s2=earlySurface('3794',p[2],t,2);
    close(dist(p,s1),0);close(dist(p,s2),0);
    close(p[0]-p[2],0);
    close((p[1])**2+(1-p[2])**2,1);
    close((p[1])**2+(1-p[0])**2,1);
    close(Math.hypot(...cross(n.surface1Normal,n.surface2Normal)),
      n.normalCrossMagnitude);
    if(Math.abs(t)<Math.PI/2)
      close(dist(derivative(x=>earlyCurve('3794',x),t),earlyFrame('3794',t).first),0,2e-10);
  }
  close(earlyIntersectionTangency(Math.PI/2).normalCrossMagnitude,0);
  assert.ok(earlyIntersectionTangency(0).normalCrossMagnitude>0);
});

test('paraboloid curve formulas match their separate saved parameter paths',()=>{
  const a=Math.sqrt(3)/2,b=.5;
  for(const cell of ['3793','3796','3797'] as const){
    for(const t of [-.2,-.1,0,.15,.2]){
      const bent=cell==='3797',x=a*t-(bent?b*t*t:0),
        y=b*t+(bent?a*t*t:0),p=earlyCurve(cell,t),s=earlySurface(cell,x,y);
      close(dist(p,s),0);
      const sx=derivative(z=>earlySurface(cell,z,y),x),
        sy=derivative(z=>earlySurface(cell,x,z),y);
      close(dist(sx,[1,0,(cell==='3793'?2:1)*x]),0,2e-10);
      close(dist(sy,[0,1,(cell==='3793'?6:2)*y]),0,2e-10);
      close(Math.hypot(...cross(sx,sy)),earlyFrame(cell,t).surfaceArea,2e-10);
    }
  }
  assert.throws(()=>earlySurface('3796',.31,0));
});

test('all fixed frames satisfy Frenet and Darboux differential definitions',()=>{
  for(const cell of cells){
    const values=cell==='3794'?[-1.3,-.7,0,.8,1.3]:[-.22,-.1,0,.15,.22];
    for(const t of values){
      const f=earlyFrame(cell,t),{tangent:T,frenetNormal:N,binormal:B,
        tangentNormal:L,surfaceNormal:U}=f;
      assert.ok(f.speed>0&&f.curvature>0&&f.surfaceArea>0);
      for(const v of [T,N,B,L,U])close(dot(v,v),1);
      for(const [u,v] of [[T,N],[T,B],[N,B],[T,L],[T,U],[L,U]])
        close(dot(u,v),0);
      close(dist(cross(T,N),B),0);close(dist(cross(U,T),L),0);
      close(dist(derivative(x=>earlyCurve(cell,x),t),f.first),0,3e-10);
      const tp=derivative(x=>earlyFrame(cell,x).tangent,t),
        lp=derivative(x=>earlyFrame(cell,x).tangentNormal,t),
        up=derivative(x=>earlyFrame(cell,x).surfaceNormal,t);
      const dt=T.map((_,i)=>f.speed*(f.geodesicCurvature*L[i]+
        f.normalCurvature*U[i]));
      const dl=T.map((_,i)=>f.speed*(-f.geodesicCurvature*T[i]+
        f.geodesicTorsion*U[i]));
      const du=T.map((_,i)=>f.speed*(-f.normalCurvature*T[i]-
        f.geodesicTorsion*L[i]));
      close(dist(tp,dt),0,2e-8);close(dist(lp,dl),0,2e-8);
      close(dist(up,du),0,2e-8);
      close(f.curvature**2,f.geodesicCurvature**2+f.normalCurvature**2);
    }
  }
});

test('fixed plotted values are source-equation deductions, distinct from symbolic Print',()=>{
  const a=earlyFrame('3793',0),b=earlyFrame('3796',0),
    c=earlyFrame('3797',0),d=earlyFrame('3794',0);
  close(a.normalCurvature,3);close(a.geodesicCurvature,0);
  close(a.geodesicTorsion,Math.sqrt(3));
  close(b.normalCurvature,1.25);close(b.geodesicCurvature,0);
  close(b.geodesicTorsion,Math.sqrt(3)/4);
  close(c.normalCurvature,1.25);close(c.geodesicCurvature,2);
  close(c.geodesicTorsion,Math.sqrt(3)/4);
  close(d.geodesicCurvature,-1);close(d.normalCurvature,1);
  close(d.curvature,Math.SQRT2);close(d.torsion,0);
});
