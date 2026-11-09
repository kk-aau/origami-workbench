"""Diagnostic original objective plus full analytic unfold closure.

Use literal mother data without changing production's degree gate. Record
real geometry/local checks; a solve alone is not construction support.
"""
import sys,json,math,time
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from tessellation_woven import _topology,_face_winding,_unfold,_EVEN_PROBE_LEVELS
from tessellation_woven_holonomy import UnfoldClosureSystem
from tessellation_woven_merit import solve_merit,MeritBudget
from tessellation_patterns import make_fold
from tessellate import check_geometry,check_local_conditions
out=[]
for n,ratio,h in [(10,.8,.03),(10,1.,.03),(10,1.4,.03),(12,.8,.03),(14,.8,.03),(16,.8,.03)]:
    v=[[0.,0.]]+[[math.cos(math.tau*i/n),ratio*math.sin(math.tau*i/n)] for i in range(n)];e=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)];f=[[i+1,(i+1)%n+1,0] for i in range(n)]
    d=dict(mesh=make_fold(v,e,['B']*n+['U']*n,[face[::-1] for face in f]),edgeLines=[-1]*n+[0]*n,edgeWidths=[0]*n+[2*h]*n,lines=[],boundary=v[1:],sourceFaceCycles=f,graphMode=True);g=None;row=dict(degree=n,ratio=ratio,inset=h)
    begin=time.perf_counter()
    try:
        for a in _EVEN_PROBE_LEVELS:
            for b in _EVEN_PROBE_LEVELS:
                try:g=_topology(d,1,h,(a,b));row['probe']=[a,b];break
                except ValueError:pass
            if g:break
        if g is None:raise ValueError('No initial topology chart')
        lower=np.array([.001 if b else .1 for b in g['boundaryVariable']]);values=np.zeros(len(g['base']));mask=g['variable']>=0;values[mask]=lower[g['variable'][mask]]
        initial=g['base']+g['directions']*values[:,None];closure=UnfoldClosureSystem(g,[g['mainFaces'][0]],np.ptp(np.array(v),axis=0).max(),initial,_face_winding)
        result,ff,report=solve_merit(g,lower,MeritBudget(max_seconds=5.),closure_system=closure);cp,error=_unfold(ff,g['edges'],g['faces'],g['mainFaces'][0]);fold=make_fold(cp,g['edges'],g['assignments'],g['faces']);geometry=check_geometry(fold);local=check_local_conditions(fold)
        row.update(status='experimental-generated' if geometry['status']=='passed' and local['status']=='passed' else 'not-certified',graph=dict(vertices=v,edges=e),fold=fold,foldedForm=ff.tolist(),closureError=error,meritReport=report,pleatFactors=result.x.tolist(),geometry=geometry,local=local)
    except ValueError as exc:row.update(status='not-certified',reason=str(exc))
    row['seconds']=time.perf_counter()-begin;out.append(row);print(n,ratio,row['status'],round(row['seconds'],3),row.get('reason',row.get('geometry',{}).get('status')),flush=True)
    (root/'output/audits/woven-high-even-global-probe-1008.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
