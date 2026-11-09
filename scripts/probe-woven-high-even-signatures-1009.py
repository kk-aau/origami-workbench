"""Check whether current topology dedup loses actual face cyclic orders."""
import sys,json,math,collections
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from tessellation_woven import _topology,_EVEN_PROBE_LEVELS
from tessellation_patterns import make_fold
def cycle(row):
 r=list(row);return min(tuple(a[i:]+a[:i]) for a in (r,r[::-1]) for i in range(len(r)))
out=[]
for n,ratio in [(6,1),(8,.6),(10,.8),(10,1),(10,1.2),(12,.8)]:
 p=[[0.,0.]]+[[math.cos(math.tau*i/n),ratio*math.sin(math.tau*i/n)] for i in range(n)];e=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)];f=[[i+1,(i+1)%n+1,0] for i in range(n)]
 d=dict(mesh=make_fold(p,e,['B']*n+['U']*n,[r[::-1] for r in f]),edgeLines=[-1]*n+[0]*n,edgeWidths=[0]*n+[.06]*n,lines=[],boundary=p[1:],sourceFaceCycles=f,graphMode=True);old=collections.defaultdict(dict);valid=0;examples=[]
 for probe in [(a,b) for a in _EVEN_PROBE_LEVELS for b in _EVEN_PROBE_LEVELS]:
  try:g=_topology(d,1,.03,probe)
  except ValueError:continue
  valid+=1;vertex=tuple((int(r[0]),cycle([int(v) for v in r[1:]])) for r in g['cycles']);stamp=(vertex,tuple(sorted(tuple(sorted(r)) for r in g['faces'])));actual=tuple(sorted(cycle(r) for r in g['faces']))
  if stamp in old and actual not in old[stamp]:examples.append(dict(previousProbe=next(iter(old[stamp].values())),probe=probe,faces=g['faces']))
  old[stamp][actual]=probe
 row=dict(degree=n,ratio=ratio,validProbes=valid,oldSignatures=len(old),actualSignatures=sum(map(len,old.values())),collisions=examples);out.append(row);print({k:v for k,v in row.items() if k!='collisions'},flush=True)
(root/'output/audits/woven-high-even-signatures-1009.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
