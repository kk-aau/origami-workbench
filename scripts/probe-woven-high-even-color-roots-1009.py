"""Bounded two-color roots with independent incoming/outgoing boundary factors.
The original formula and full CP/local gates are preserved. Diagnostic only.
"""
import sys,math,json,time
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from tessellation_woven import _topology,_EVEN_PROBE_LEVELS,_unfold
from tessellation_patterns import make_fold
from tessellate import check_geometry,check_local_conditions
out=[]
for n in (8,10,12,14,16):
 p=[[0.,0.]]+[[math.cos(math.tau*i/n),math.sin(math.tau*i/n)] for i in range(n)];e=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)];f=[[i+1,(i+1)%n+1,0] for i in range(n)];h=.03
 d=dict(mesh=make_fold(p,e,['B']*n+['U']*n,[r[::-1] for r in f]),edgeLines=[-1]*n+[0]*n,edgeWidths=[0]*n+[2*h]*n,lines=[],boundary=p[1:],sourceFaceCycles=f,graphMode=True);g=None
 for a in _EVEN_PROBE_LEVELS:
  for b in _EVEN_PROBE_LEVELS:
   try:g=_topology(d,1,h,(a,b));break
   except ValueError:pass
  if g:break
 if g is None:out.append(dict(degree=n,status='no-chart'));continue
 base,directions,var=g['base'],g['directions'],g['variable'];mask=var>=0;groups=np.zeros(len(g['boundaryVariable']),dtype=int)
 for (face,vertex),v in g['corners'].items():
  if var[v]>=0:groups[var[v]]=3*(face%2)+(0 if vertex==0 else 1 if vertex==f[face][0] else 2)
 cycles=g['cycles'];lower=np.array([.10001,.00101,.00101]*2)
 def positions(x):
  factors=x[groups];v=np.zeros(len(base));v[mask]=factors[var[mask]];return base+directions*v[:,None],factors
 def residual(x):
  p,_=positions(x);v=p[cycles[:,1:]]-p[cycles[:,0,None]];z=v[:,:,0]+1j*v[:,:,1];z/=np.maximum(np.abs(z),1e-12);return (z[:,0]*z[:,2]*np.conjugate(z[:,1]*z[:,3])).imag
 begin=time.monotonic();row=dict(degree=n,probe=g['topologyProbe'],status='not-certified',seeds=0,roots=0,failures={})
 for seed in range(200):
  row['seeds']+=1;rng=np.random.default_rng(1009200+seed);start=np.exp(rng.uniform(-2.,5.,6))+lower
  sol=least_squares(residual,start,bounds=(lower,np.full(6,1000.)),max_nfev=100,ftol=1e-12,xtol=1e-12,gtol=1e-12)
  if max(abs(residual(sol.x)))>1e-7:continue
  row['roots']+=1;ff,factors=positions(sol.x)
  try:
   cp,error=_unfold(ff,g['edges'],g['faces'],g['mainFaces'][0]);fold=make_fold(cp,g['edges'],g['assignments'],g['faces']);geometry=check_geometry(fold);local=check_local_conditions(fold)
   if geometry['status']=='passed' and local['status']=='passed':row.update(status='candidate',seed=seed,groups=sol.x.tolist(),graph=dict(vertices=p,edges=e),fold=fold,foldedForm=ff.tolist(),factors=factors.tolist(),closureError=error,geometry=geometry,local=local);break
   reason='geometry:'+geometry['status']+'/local:'+local['status']
  except ValueError as ex:reason=str(ex)
  row['failures'][reason]=row['failures'].get(reason,0)+1
 row['seconds']=time.monotonic()-begin;out.append(row);print(n,row['status'],row['seeds'],row['roots'],row.get('groups'),row['seconds'],flush=True)
 (root/'output/audits/woven-high-even-color-roots-1009.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
 if row['status']=='candidate' and n>=10:break
(root/'output/audits/woven-high-even-color-roots-1009.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
