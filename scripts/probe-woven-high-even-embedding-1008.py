"""Diagnose combinatorial charts, with all final metric/CP gates intact.

networkx is an existing local diagnostic dependency, not added to the app.
This is not Wolfram output or public construction support.
"""
import inspect,json,math,sys,time
from pathlib import Path
import networkx as nx
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
import tessellation_woven as woven
from tessellation_patterns import make_fold
from tessellate import check_geometry,check_local_conditions
original=woven._topology
source=inspect.getsource(original).replace('plane_faces=planar_faces(initial.tolist(),edge_list)','plane_faces,rotation=combinatorial_faces(edge_list,edges)').replace('ns.sort(key=lambda n:math.atan2(*(initial[n]-initial[v])[::-1]))','ns[:]=rotation[v]')
def combinatorial_faces(edge_list,kinds):
    graph=nx.Graph();graph.add_edges_from(edge_list)
    boundary={v for e in edge_list if kinds[e]=='B' for v in e};graph.add_edges_from([(-1,v) for v in boundary])
    ok,embedding=nx.check_planarity(graph)
    if not ok:raise ValueError('Generated abstract graph is nonplanar')
    seen=set();faces=[]
    for a,b in edge_list+[(b,a) for a,b in edge_list]:
        if (a,b) in seen:continue
        face=embedding.traverse_face(a,b,seen)
        if -1 in face:continue
        faces.append(face)
    return faces,{v:[n for n in embedding.neighbors_cw_order(v) if n!=-1] for v in graph if v!=-1}
namespace=dict(woven.__dict__,combinatorial_faces=combinatorial_faces);exec(compile(source,'<diagnostic-embedding>','exec'),namespace);out=[]
for n,ratio,h in [(6,1,.03),(8,.6,.08),(10,.8,.03),(10,1,.03),(10,.6,.08),(12,.8,.03),(12,1,.03),(14,1,.03)]:
    points=[[0.,0.]]+[[math.cos(math.tau*i/n),ratio*math.sin(math.tau*i/n)] for i in range(n)]
    edges=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)];faces=[[i+1,(i+1)%n+1,0] for i in range(n)]
    data=dict(mesh=make_fold(points,edges,['B']*n+['U']*n,[f[::-1] for f in faces]),edgeLines=[-1]*n+[0]*n,edgeWidths=[0]*n+[2*h]*n,lines=[],boundary=points[1:],sourceFaceCycles=faces,graphMode=True)
    woven._topology=namespace['_topology'];begin=time.perf_counter();row=dict(degree=n,ratio=ratio,inset=h)
    try:
        cp,ff,solved=woven.woven_pattern(data,parity=1,min_pleat=.1,min_border=.001,border_inset=h)
        row.update(status='generated',graph=dict(vertices=points,edges=edges),fold=cp,foldedForm=ff,solved=solved,geometry=check_geometry(cp),local=check_local_conditions(cp))
    except ValueError as e:row.update(status='not-certified',message=str(e))
    finally:woven._topology=original
    row['seconds']=time.perf_counter()-begin;out.append(row);print(n,ratio,row['status'],round(row['seconds'],3),row.get('message',''),flush=True)
    (ROOT/'output/audits/woven-high-even-embedding-probe-1008.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
