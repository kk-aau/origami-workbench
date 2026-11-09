"""Diagnostic only: seek a simple central FF face before accepting any high-even CP.

Source formula/coordinates, positive factor bounds and all final public-style
geometric checks remain unchanged. Convex-face inequalities are a seed search,
not a replacement original objective or a production input restriction.
"""
import sys,json,math,time
from pathlib import Path
import numpy as np
from scipy.optimize import minimize
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from tessellation_woven import _topology,_unfold,_EVEN_PROBE_LEVELS,_face_winding
from tessellation_woven_merit import ReflectionSystem,MeritBudget
from tessellation_patterns import make_fold
from tessellate import check_geometry,check_local_conditions
report=[]
for n,ratio in [(6,1.),(8,.6),(10,.8),(10,1.2),(10,.6),(12,.8)]:
 p=[[0.,0.]]+[[math.cos(math.tau*i/n),ratio*math.sin(math.tau*i/n)] for i in range(n)];e=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)];f=[[i+1,(i+1)%n+1,0] for i in range(n)];h=.03
 data=dict(mesh=make_fold(p,e,['B']*n+['U']*n,[r[::-1] for r in f]),edgeLines=[-1]*n+[0]*n,edgeWidths=[0]*n+[2*h]*n,lines=[],boundary=p[1:],sourceFaceCycles=f,graphMode=True);g=None
 for a in _EVEN_PROBE_LEVELS:
  for b in _EVEN_PROBE_LEVELS:
   try:g=_topology(data,1,h,(a,b));break
   except ValueError:pass
  if g:break
 if g is None:report.append(dict(degree=n,ratio=ratio,status='no-chart'));continue
 central=max((r for i,r in enumerate(g['faces']) if i not in g['mainFaces']),key=len)
 lower=np.array([.001 if b else .1 for b in g['boundaryVariable']]);base,directions,variable=g['base'],g['directions'],g['variable'];mask=variable>=0
 for orientation in (1,-1):
  for seed in range(3):
   begin=time.monotonic();budget=MeritBudget(max_seconds=4.,max_evaluations=5000);system=ReflectionSystem(base,directions,variable,g['cycles'],budget)
   start=lower+np.random.default_rng(100900+seed).uniform(.1,8.,len(lower));scale=math.hypot(2,2*ratio)
   def inequalities(x):
    budget.spend();v=system.positions(x)[central]/scale;rows=[]
    for i,a in enumerate(v):
     b=v[(i+1)%len(v)];d=b-a
     for j,c in enumerate(v):
      if j not in (i,(i+1)%len(v)):rows.append(orientation*(d[0]*(c[1]-a[1])-d[1]*(c[0]-a[0]))-1e-7)
    return np.array(rows)
   row=dict(degree=n,ratio=ratio,orientation=orientation,seed=seed,centralFaceVertices=len(central))
   try:
    solution=minimize(lambda x:float(x@x),start,jac=lambda x:2*x,method='SLSQP',bounds=[(v,None) for v in lower],constraints=[dict(type='eq',fun=lambda x:system.evaluate(x)[0],jac=lambda x:system.evaluate(x)[1]),dict(type='ineq',fun=inequalities)],options=dict(maxiter=150,ftol=1e-10))
    ff=system.positions(solution.x);row.update(optimizerSuccess=bool(solution.success),residual=float(np.max(np.abs(system.evaluate(solution.x)[0]))),minimumInequality=float(np.min(inequalities(solution.x))),ffWinding=[_face_winding(ff,r) for r in g['faces']])
    cp,error=_unfold(ff,g['edges'],g['faces'],g['mainFaces'][0]);fold=make_fold(cp,g['edges'],g['assignments'],g['faces']);geometry=check_geometry(fold);local=check_local_conditions(fold)
    row.update(status='candidate' if solution.success and geometry['status']=='passed' and local['status']=='passed' else 'not-certified',geometry=geometry,local=local,closureError=error,graph=dict(vertices=p,edges=e),fold=fold,foldedForm=ff.tolist(),factors=solution.x.tolist())
   except ValueError as ex:row.update(status='not-certified',reason=str(ex))
   row['seconds']=time.monotonic()-begin;report.append(row);print(n,ratio,orientation,seed,row['status'],row.get('residual'),row.get('reason',''),flush=True)
   (root/'output/audits/woven-high-even-face-feasibility-1009.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
   if row['status']=='candidate' and n>=10:sys.exit(0)

(root/'output/audits/woven-high-even-face-feasibility-1009.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
