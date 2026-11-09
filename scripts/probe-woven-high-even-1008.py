"""Explore actual roots of the unchanged original high-even affine construction.

Diagnostic only: bypass the public valence gate by supplying literal fan data,
and perturb nonlinear initial vectors, never geometry/assignments/constraints.
Do not count a zero residual or this script as production support.
"""
import json,math,sys,time
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
import tessellation_woven as woven
from tessellation_patterns import make_fold
from tessellate import check_geometry,check_local_conditions

def fan(n,ratio,h):
    points=[[0.,0.]]+[[math.cos(math.tau*i/n),ratio*math.sin(math.tau*i/n)] for i in range(n)]
    edges=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)]
    faces=[[i+1,(i+1)%n+1,0] for i in range(n)]
    return dict(mesh=make_fold(points,edges,['B']*n+['U']*n,[f[::-1] for f in faces]),edgeLines=[-1]*n+[0]*n,edgeWidths=[0]*n+[2*h]*n,lines=[],boundary=points[1:],sourceFaceCycles=faces,graphMode=True)

original=woven.least_squares;out=[]
for degree,ratio,h in [(10,.8,.03),(10,.6,.08),(10,1,.03),(12,.8,.03),(10,1.4,.03),(10,.4,.03)]:
    data=fan(degree,ratio,h)
    for seed in range(16):
        rng=np.random.default_rng(100800+seed)
        def solve(fun,start,**kwargs):
            lower,upper=kwargs['bounds']
            # Include genuinely asymmetric, positive initial vectors in the
            # same finite box, not a new equation or a source-point movement.
            start=np.minimum(upper-1e-4,np.maximum(lower+1e-4,(start-lower)*np.exp(rng.normal(0,1.3,len(start)))+lower))
            return original(fun,start,**kwargs)
        woven.least_squares=solve;begin=time.perf_counter()
        row=dict(degree=degree,axisRatio=ratio,inset=h,seed=seed)
        try:
            cp,ff,solved=woven.woven_pattern(data,parity=1,min_pleat=.1,min_border=.001,border_inset=h)
            row.update(status='generated',graph=dict(vertices=data['mesh']['vertices_coords'],edges=data['mesh']['edges_vertices']),fold=cp,foldedForm=ff,solved=solved,geometry=check_geometry(cp),local=check_local_conditions(cp))
        except ValueError as e:row.update(status='not-certified',message=str(e))
        finally:woven.least_squares=original
        row['seconds']=time.perf_counter()-begin;out.append(row)
        print(degree,ratio,h,seed,row['status'],round(row['seconds'],3),row.get('message',''),flush=True)
        (ROOT/'output/audits/woven-high-even-root-probe-1008.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
        if row['status']=='generated':sys.exit(0)
