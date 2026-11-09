"""Scale negative topology probes by actual displacement, not a fixed factor.
Only this diagnostic process changes the bootstrap; actual affine geometry,
positive solve and CP/local checks remain the existing source construction.
"""
import sys,math,json,time,multiprocessing as mp,inspect
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def worker(case,queue):
 sys.path.insert(0,str(ROOT/'backend'))
 import numpy as np
 import tessellation_woven as w
 from tessellation_patterns import make_fold
 from tessellate import check_geometry,check_local_conditions
 profile,seed,parity=case;profiles=[[0,30,60,75,90],[0,45,90,95,100],[0,45,90,91,92],[0,60,120,125,130],[0,40,80,120,160]];angles=[*profiles[profile%5],*[x+180 for x in profiles[profile%5]]];n=10;radius=10.;h=.01
 radii=np.random.default_rng(100970+profile).uniform(.7,1.5,n) if profile>=5 else np.ones(n);p=[[0.,0.]]+[[radius*r*math.cos(math.radians(a)),radius*r*math.sin(math.radians(a))] for a,r in zip(angles,radii)];e=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)];f=[[i+1,(i+1)%n+1,0] for i in range(n)];d=dict(mesh=make_fold(p,e,['B']*n+['U']*n,[r[::-1] for r in f]),edgeLines=[-1]*n+[0]*n,edgeWidths=[0]*n+[2*h]*n,lines=[],boundary=p[1:],sourceFaceCycles=f,graphMode=True)
 code=inspect.getsource(w._topology);old='offsets=np.asarray([db if v>=0 and boundary_variable[v] else di for v in variable])';assert code.count(old)==1;code=code.replace(old,old+'*float(np.ptp(vertices,axis=0).max())/np.maximum(np.linalg.norm(directions,axis=1),1e-12)');scope=dict(w.__dict__);exec(compile(code,'<diagnostic-physical-topology>','exec'),scope);w._topology=scope['_topology'];original=w.least_squares;rng=np.random.default_rng(100990+seed)
 def solve(fun,start,**kw):
  if seed:
   lo,hi=kw['bounds'];hi=np.maximum(hi,2000);kw['bounds']=(lo,hi);start=np.minimum(hi-1e-4,lo+np.exp(rng.uniform(-2,6,len(start))))
  return original(fun,start,**kw)
 w.least_squares=solve
 try:
  cp,ff,solved=w.woven_pattern(d,parity=parity,min_pleat=.1,min_border=.001,border_inset=h,initial_lengths=((8.,4.),(20.,10.)));geometry=check_geometry(cp);local=check_local_conditions(cp);queue.put(dict(status='candidate' if geometry['status']=='passed' and local['status']=='passed' else 'not-certified',graph=dict(vertices=p,edges=e),fold=cp,foldedForm=ff,solved=solved,geometry=geometry,local=local))
 except Exception as ex:queue.put(dict(status='not-certified',reason=str(ex)))
if __name__=='__main__':
 mp.freeze_support();out=[]
 for case in [(p,s,k) for p in range(10) for s in range(3) for k in (1,-1)]:
  begin=time.monotonic();q=mp.Queue();process=mp.Process(target=worker,args=(case,q));process.start();row=dict(profile=case[0],seed=case[1],parity=case[2],degree=10)
  try:row.update(q.get(timeout=12.))
  except Exception:row.update(status='budget-unknown',reason='Diagnostic twelve-second budget did not return a certificate.')
  finally:
   if process.is_alive():process.terminate()
   process.join();q.close()
  row['seconds']=time.monotonic()-begin;out.append(row);print(case,row['status'],row.get('reason',''),flush=True);(ROOT/'output/audits/woven-high-even-physical-charts-1009.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
  if row['status']=='candidate':break
