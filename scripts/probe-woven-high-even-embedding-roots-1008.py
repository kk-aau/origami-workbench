"""Combined diagnostic: boundary-constrained embedding and asymmetric roots.
No production input gate, source formula or final validity gate is changed.
"""
import inspect,json,math,sys,time
from pathlib import Path
import networkx as nx
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
import tessellation_woven as woven
from tessellation_patterns import make_fold
from tessellate import check_geometry,check_local_conditions
original_topology=woven._topology;original_solve=woven.least_squares
source=inspect.getsource(original_topology).replace('plane_faces=planar_faces(initial.tolist(),edge_list)','plane_faces,rotation=combinatorial_faces(edge_list,edges)').replace('ns.sort(key=lambda n:math.atan2(*(initial[n]-initial[v])[::-1]))','ns[:]=rotation[v]')
def combinatorial_faces(edge_list,kinds):
    graph=nx.Graph();graph.add_edges_from(edge_list);boundary={v for e in edge_list if kinds[e]=='B' for v in e};graph.add_edges_from([(-1,v) for v in boundary]);ok,embedding=nx.check_planarity(graph)
    if not ok:raise ValueError('Generated abstract graph is nonplanar')
    seen=set();faces=[]
    for a,b in edge_list+[(b,a) for a,b in edge_list]:
        if (a,b) in seen:continue
        face=embedding.traverse_face(a,b,seen)
        if -1 not in face:faces.append(face)
    return faces,{v:[n for n in embedding.neighbors_cw_order(v) if n!=-1] for v in graph if v!=-1}
namespace=dict(woven.__dict__,combinatorial_faces=combinatorial_faces);exec(compile(source,'<diagnostic-embedding>','exec'),namespace);out=[]
for n,ratio,h in [(10,.8,.03),(10,1,.03),(10,.6,.08),(12,.8,.03)]:
    points=[[0.,0.]]+[[math.cos(math.tau*i/n),ratio*math.sin(math.tau*i/n)] for i in range(n)]
    edges=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)];faces=[[i+1,(i+1)%n+1,0] for i in range(n)]
    data=dict(mesh=make_fold(points,edges,['B']*n+['U']*n,[f[::-1] for f in faces]),edgeLines=[-1]*n+[0]*n,edgeWidths=[0]*n+[2*h]*n,lines=[],boundary=points[1:],sourceFaceCycles=faces,graphMode=True)
    for seed in range(32):
        rng=np.random.default_rng(100880+seed)
        def solve(fun,start,**kwargs):
            lower,upper=kwargs['bounds'];start=np.minimum(upper-1e-4,np.maximum(lower+1e-4,(start-lower)*np.exp(rng.normal(0,1.3,len(start)))+lower));return original_solve(fun,start,**kwargs)
        woven._topology=namespace['_topology'];woven.least_squares=solve;begin=time.perf_counter();row=dict(degree=n,ratio=ratio,inset=h,seed=seed)
        try:
            cp,ff,solved=woven.woven_pattern(data,parity=1,min_pleat=.1,min_border=.001,border_inset=h,initial_lengths=((.1001,.0011),(.2,.05),(.4,.2),(10,2)))
            row.update(status='generated',graph=dict(vertices=points,edges=edges),fold=cp,foldedForm=ff,solved=solved,geometry=check_geometry(cp),local=check_local_conditions(cp))
        except ValueError as e:row.update(status='not-certified',message=str(e))
        finally:woven._topology=original_topology;woven.least_squares=original_solve
        row['seconds']=time.perf_counter()-begin;out.append(row);print(n,ratio,seed,row['status'],round(row['seconds'],3),row.get('message',''),flush=True)
        (ROOT/'output/audits/woven-high-even-embedding-root-probe-1008.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
        if row['status']=='generated':sys.exit(0)
