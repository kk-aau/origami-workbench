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
 n,ratio,h,parity,mode=case
 p=[[0.,0.]]+[[math.cos(math.tau*i/n),ratio*math.sin(math.tau*i/n)] for i in range(n)];e=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)];f=[[i+1,(i+1)%n+1,0] for i in range(n)]
 if mode=='quad':
  p=[[0.,0.]]+[[math.cos(math.tau*i/(2*n)),ratio*math.sin(math.tau*i/(2*n))] for i in range(2*n)];e=[[i+1,(i+1)%(2*n)+1] for i in range(2*n)]+[[0,2*i+1] for i in range(n)];f=[[2*i+1,2*i+2,(2*i+2)%(2*n)+1,0] for i in range(n)]
 d=dict(mesh=make_fold(p,e,['B']*n+['U']*n,[r[::-1] for r in f]),edgeLines=[-1]*(len(e)-n)+[0]*n,edgeWidths=[0]*(len(e)-n)+[2*h]*n,lines=[],boundary=p[1:],sourceFaceCycles=f,graphMode=True)
 if mode=='square-lines':
  records=[]
  for i in range(n):
   angle=math.tau*i/n+math.radians(7);x,y=math.cos(angle),math.sin(angle);t=min(1/abs(x) if x else math.inf,ratio/abs(y) if y else math.inf);records.append((angle%math.tau,[t*x,t*y],True))
  for x,y in [(-1,-ratio),(1,-ratio),(1,ratio),(-1,ratio)]:records.append((math.atan2(y,x)%math.tau,[x,y],False))
  records.sort(key=lambda r:r[0]);p=[[0.,0.]]+[r[1] for r in records];size=len(records);spokes=[i+1 for i,r in enumerate(records) if r[2]];e=[[i+1,(i+1)%size+1] for i in range(size)]+[[0,i] for i in spokes];f=[]
  for k,a in enumerate(spokes):
   b=spokes[(k+1)%len(spokes)];ring=[a];v=a
   while v!=b:v=v%size+1;ring.append(v)
   f.append([*ring,0])
  d=dict(mesh=make_fold(p,e,['B']*size+['U']*n,[r[::-1] for r in f]),edgeLines=[-1]*size+[0]*n,edgeWidths=[0]*size+[2*h]*n,lines=[],boundary=p[1:],sourceFaceCycles=f,graphMode=True)

 try:
  cp,ff,solved=woven_pattern(d,parity=parity,min_pleat=.1,min_border=.001,border_inset=h);geometry=check_geometry(cp);local=check_local_conditions(cp);queue.put(dict(status='candidate' if geometry['status']=='passed' and local['status']=='passed' else 'not-certified',graph=dict(vertices=p,edges=e),fold=cp,foldedForm=ff,solved=solved,geometry=geometry,local=local))
 except Exception as ex:queue.put(dict(status='not-certified',reason=str(ex)))
if __name__=='__main__':
 mp.freeze_support();out=[]
 for n,ratio,h,parity,mode in [(10,r,h,p,mode) for mode in ('square-lines',) for r in (.5,.8,1.,1.5,2.) for h in (.01,.03) for p in (1,-1)]:
  begin=time.monotonic();q=mp.Queue();process=mp.Process(target=worker,args=((n,ratio,h,parity,mode),q));process.start();row=dict(degree=n,ratio=ratio,inset=h,parity=parity,mode=mode)
  try:row.update(q.get(timeout=12.))
  except Exception:row.update(status='budget-unknown',reason='Diagnostic process did not return within twelve seconds.')
  finally:
   if process.is_alive():process.terminate()
   process.join();q.close()
  row['seconds']=time.monotonic()-begin;out.append(row);print(n,ratio,h,parity,row['status'],row.get('reason',''),flush=True)
  (ROOT/'output/audits/woven-high-even-cells-1009.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
  if row['status']=='candidate':break
