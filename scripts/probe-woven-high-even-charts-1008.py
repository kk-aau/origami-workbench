"""Diagnostic nonuniform negative charts of the literal affine source formula.

Only the numerical bootstrap is perturbed. Source positions, edge roles,
assignments, positive final bounds and full CP checks remain unchanged.
"""
import inspect,json,math,sys,time
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
import tessellation_woven as woven
from tessellation_patterns import make_fold
from tessellate import check_geometry,check_local_conditions

original=woven._topology
source=inspect.getsource(original).replace('initial=base-offsets[:,None]*directions','initial=base-(offsets*multipliers(len(base)))[:,None]*directions').replace('else:initial=base-probe*directions','else:initial=base-(probe*multipliers(len(base)))[:,None]*directions')
out=[]
for n,ratio,h in [(10,.8,.03),(10,1,.03),(10,.6,.08),(12,.8,.03)]:
    points=[[0.,0.]]+[[math.cos(math.tau*i/n),ratio*math.sin(math.tau*i/n)] for i in range(n)]
    edges=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)];faces=[[i+1,(i+1)%n+1,0] for i in range(n)]
    data=dict(mesh=make_fold(points,edges,['B']*n+['U']*n,[f[::-1] for f in faces]),edgeLines=[-1]*n+[0]*n,edgeWidths=[0]*n+[2*h]*n,lines=[],boundary=points[1:],sourceFaceCycles=faces,graphMode=True)
    for seed in range(48):
        def multipliers(size):return np.exp(np.random.default_rng(100810+seed).normal(0,.4 if seed<24 else 1,size))
        namespace=dict(woven.__dict__,multipliers=multipliers);exec(compile(source,'<diagnostic-nonuniform-chart>','exec'),namespace);woven._topology=namespace['_topology'];begin=time.perf_counter();row=dict(degree=n,ratio=ratio,inset=h,seed=seed)
        try:
            cp,ff,solved=woven.woven_pattern(data,parity=1,min_pleat=.1,min_border=.001,border_inset=h)
            row.update(status='generated',graph=dict(vertices=points,edges=edges),fold=cp,foldedForm=ff,solved=solved,geometry=check_geometry(cp),local=check_local_conditions(cp))
        except ValueError as e:row.update(status='not-certified',message=str(e))
        finally:woven._topology=original
        row['seconds']=time.perf_counter()-begin;out.append(row);print(n,ratio,seed,row['status'],round(row['seconds'],3),row.get('message',''),flush=True)
        (ROOT/'output/audits/woven-high-even-chart-probe-1008.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
        if row['status']=='generated':sys.exit(0)
