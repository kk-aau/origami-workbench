"""New diagnostic domain: explicit nonuniform mother geometry and edge insets.

Only this process relaxes the degree gate. Source geometry/formula and all CP
gates remain intact; experimental success is not production acceptance.
"""
import sys,json,inspect,math,time
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
import tessellation_woven_graph as mother
from tessellate import generate
original=mother.woven_graph_data
source=inspect.getsource(original).replace('not in (4,6,8)','not in (4,6,8,10,12,14,16)')
scope=dict(mother.__dict__);exec(compile(source,'<experimental-degree-gate>','exec'),scope);mother.woven_graph_data=scope['woven_graph_data']
out=[]
for n,seed in [(10,i) for i in range(12)]+[(12,i) for i in range(4)]:
    rng=np.random.default_rng(1008100+seed);angles=np.linspace(0,math.tau,n,endpoint=False)
    if seed:angles+=rng.uniform(-.27,.27,n)*math.tau/n
    ratio=[.6,.8,1.,1.4][seed%4]
    points=[[.04 if seed%3==1 else 0.,.03 if seed%3==2 else 0.]]+[[math.cos(a),ratio*math.sin(a)] for a in angles]
    edges=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)]
    p=dict(family='woven-lines',mode='graph',graph=dict(vertices=points,edges=edges),width=.02,parity=1,minPleat=.1,minBorderPleat=.001,borderInset='auto',stationaryFace=0)
    if seed%2:
        data=mother.woven_graph_data(p['graph']);h=np.exp(rng.uniform(-1.5,1.5,len(edges)))*.005
        p['fullEdgeInsets']=dict(edgeCount=len(edges),entries=[dict(edge=i,line=data['edgeLines'][i],**{'from':points[a]},to=points[b],inset=float(h[i])) for i,(a,b) in enumerate(edges)])
    begin=time.perf_counter();row=dict(degree=n,seed=seed,params=p)
    try:
        r=generate(p);row.update(status='experimental-generated',response=r)
    except ValueError as exc:row.update(status='not-certified',reason=str(exc))
    row['seconds']=time.perf_counter()-begin;out.append(row)
    (root/'output/audits/woven-high-even-geometry-probe-1008.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
    print(n,seed,row['status'],round(row['seconds'],3),row.get('reason',''),flush=True)
    if row['status']=='experimental-generated':break
mother.woven_graph_data=original
