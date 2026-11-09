"""Bounded diagnostic of previously untested high-aspect mother geometry.

No public input gate or source construction formula is changed. Each candidate
still must pass CP geometry and local conditions; timeouts are not no-solution.
"""
import sys,math,json,time,multiprocessing as mp
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def worker(case,queue):
 sys.path.insert(0,str(ROOT/'backend'))
 from tessellation_woven import woven_pattern
 from tessellation_patterns import make_fold
 from tessellate import check_geometry,check_local_conditions
 n,ratio,h,parity=case
 p=[[0.,0.]]+[[math.cos(math.tau*i/n),ratio*math.sin(math.tau*i/n)] for i in range(n)];e=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)];f=[[i+1,(i+1)%n+1,0] for i in range(n)]
 d=dict(mesh=make_fold(p,e,['B']*n+['U']*n,[r[::-1] for r in f]),edgeLines=[-1]*n+[0]*n,edgeWidths=[0]*n+[2*h]*n,lines=[],boundary=p[1:],sourceFaceCycles=f,graphMode=True)
 try:
  cp,ff,solved=woven_pattern(d,parity=parity,min_pleat=.1,min_border=.001,border_inset=h);geometry=check_geometry(cp);local=check_local_conditions(cp);queue.put(dict(status='candidate' if geometry['status']=='passed' and local['status']=='passed' else 'not-certified',graph=dict(vertices=p,edges=e),fold=cp,foldedForm=ff,solved=solved,geometry=geometry,local=local))
 except Exception as ex:queue.put(dict(status='not-certified',reason=str(ex)))
if __name__=='__main__':
 mp.freeze_support();out=[]
 for n,ratio,h,parity in [(10,r,h,p) for r in (.15,.3,2.,3.,5.,8.) for h in (.005,.015) for p in (1,-1)]:
  begin=time.monotonic();q=mp.Queue();process=mp.Process(target=worker,args=((n,ratio,h,parity),q));process.start();row=dict(degree=n,ratio=ratio,inset=h,parity=parity)
  try:row.update(q.get(timeout=12.))
  except Exception:row.update(status='budget-unknown',reason='Diagnostic process did not return within twelve seconds.')
  finally:
   if process.is_alive():process.terminate()
   process.join();q.close()
  row['seconds']=time.monotonic()-begin;out.append(row);print(n,ratio,h,parity,row['status'],row.get('reason',''),flush=True)
  (ROOT/'output/audits/woven-high-even-anisotropy-1009.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
  if row['status']=='candidate':break
