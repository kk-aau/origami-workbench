"""Inspect the actual source incidence, rather than weakening any public gate."""
import sys,math,json
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from tessellation_woven import _topology,_EVEN_PROBE_LEVELS
from tessellation_patterns import make_fold
out=[]
for n in (6,8,10,12):
 p=[[0.,0.]]+[[math.cos(math.tau*i/n),.8*math.sin(math.tau*i/n)] for i in range(n)];e=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)];f=[[i+1,(i+1)%n+1,0] for i in range(n)]
 d=dict(mesh=make_fold(p,e,['B']*n+['U']*n,[r[::-1] for r in f]),edgeLines=[-1]*n+[0]*n,edgeWidths=[0]*n+[.06]*n,lines=[],boundary=p[1:],sourceFaceCycles=f,graphMode=True);g=None
 for a in _EVEN_PROBE_LEVELS:
  for b in _EVEN_PROBE_LEVELS:
   try:g=_topology(d,1,.03,(a,b));break
   except ValueError:pass
  if g:break
 if g is None:out.append(dict(degree=n,status='no-chart'));continue
 lookup={v:[f,k] for (f,k),v in g['corners'].items()};other=[(i,r) for i,r in enumerate(g['faces']) if i not in g['mainFaces']];center=max(other,key=lambda r:len(r[1]))
 out.append(dict(degree=n,probe=g['topologyProbe'],centralFace=center[0],corners=[lookup.get(v,['anchor',v]) for v in center[1]],positions=g['base'][center[1]].tolist(),cycles=g['cycles'].tolist()))
 print(json.dumps({k:v for k,v in out[-1].items() if k not in ('positions','cycles')},ensure_ascii=False),flush=True)
(root/'output/audits/woven-high-even-order-1009.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
