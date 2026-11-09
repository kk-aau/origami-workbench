"""Search all scalar regular-fan branches instead of counting repeated starts.

This is diagnostic only. Original affine coordinates/MV and final CP/local
checks remain intact, and any surviving root is recorded with its exact input.
"""
import sys,math,json,time
from pathlib import Path
import numpy as np
from scipy.optimize import brentq
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from tessellation_woven import _topology,_EVEN_PROBE_LEVELS,_unfold
from tessellation_patterns import make_fold
from tessellate import check_geometry,check_local_conditions
out=[]
for n in (6,8,10,12,14,16):
 p=[[0.,0.]]+[[math.cos(math.tau*i/n),math.sin(math.tau*i/n)] for i in range(n)];e=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)];f=[[i+1,(i+1)%n+1,0] for i in range(n)];h=.03
 d=dict(mesh=make_fold(p,e,['B']*n+['U']*n,[r[::-1] for r in f]),edgeLines=[-1]*n+[0]*n,edgeWidths=[0]*n+[2*h]*n,lines=[],boundary=p[1:],sourceFaceCycles=f,graphMode=True);g=None
 for a in _EVEN_PROBE_LEVELS:
  for b in _EVEN_PROBE_LEVELS:
   try:g=_topology(d,1,h,(a,b));break
   except ValueError:pass
  if g:break
 if g is None:out.append(dict(degree=n,status='no-chart'));continue
 begin=time.monotonic();row=dict(degree=n,probe=g['topologyProbe'],roots=0,status='not-certified',failures={});base,directions,var=g['base'],g['directions'],g['variable'];mask=var>=0;boundary=np.array(g['boundaryVariable']);cycles=g['cycles']
 def positions(interior,border):
  x=np.where(boundary,border,interior);v=np.zeros(len(base));v[mask]=x[var[mask]];return base+directions*v[:,None],x
 def residual(interior,border):
  v,_=positions(interior,border);v=v[cycles[:,1:]]-v[cycles[:,0,None]];z=v[:,:,0]+1j*v[:,:,1];z/=np.maximum(np.abs(z),1e-12);return (z[:,0]*z[:,2]*np.conjugate(z[:,1]*z[:,3])).imag
 grid=np.geomspace(.10001,1000,160)
 for border in np.geomspace(.00101,1000,90):
  previous=grid[0];last=residual(previous,border)[0]
  for current in grid[1:]:
   value=residual(current,border)[0]
   if last*value<0:
    interior=brentq(lambda x:residual(x,border)[0],previous,current,xtol=1e-12);r=residual(interior,border)
    if max(abs(r))<1e-7:
     row['roots']+=1;ff,factors=positions(interior,border)
     try:
      cp,error=_unfold(ff,g['edges'],g['faces'],g['mainFaces'][0]);fold=make_fold(cp,g['edges'],g['assignments'],g['faces']);geometry=check_geometry(fold);local=check_local_conditions(fold)
      if geometry['status']=='passed' and local['status']=='passed':row.update(status='candidate',interior=float(interior),border=float(border),graph=dict(vertices=p,edges=e),fold=fold,foldedForm=ff.tolist(),factors=factors.tolist(),closureError=error,geometry=geometry,local=local);break
      reason='geometry:'+geometry['status']+'/local:'+local['status']
     except ValueError as ex:reason=str(ex)
     row['failures'][reason]=row['failures'].get(reason,0)+1
   previous,last=current,value
  if row['status']=='candidate':break
 row['seconds']=time.monotonic()-begin;out.append(row);print(n,row['status'],row['roots'],row.get('interior'),row.get('border'),row['seconds'],flush=True)
 (root/'output/audits/woven-high-even-symmetric-roots-1009.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
 if row['status']=='candidate' and n>=10:break
(root/'output/audits/woven-high-even-symmetric-roots-1009.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
