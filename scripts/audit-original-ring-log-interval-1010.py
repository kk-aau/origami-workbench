"""Independent high precision stress check; not a proof of all libm inputs."""
import ast
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import random
import sys
import mpmath as mp

root=Path.cwd().resolve()
source=root/'output/parallel/original-ring-log-1010/backend/tessellation_ring_log_interval.py'
digest=hashlib.sha256(source.read_bytes()).hexdigest()
spec=importlib.util.spec_from_file_location('independent_log_interval_under_review',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
mp.mp.dps=90
cases=[
 ('2+sin(phi)',lambda x:2+mp.sin(x)),
 ('exp(sin(phi))+1',lambda x:mp.exp(mp.sin(x))+1),
 ('(3+cos(phi))**2/(2+.1*sin(phi))',lambda x:(3+mp.cos(x))**2/(2+mp.mpf(.1)*mp.sin(x))),
 ('log(2+sin(phi))+2',lambda x:mp.log(2+mp.sin(x))+2),
 ('sqrt(2+cos(phi))+.2',lambda x:mp.sqrt(2+mp.cos(x))+mp.mpf(.2)),
 ('phi**2+.001',lambda x:x*x+mp.mpf(.001)),
 ('(phi-pi)**2+1e-12',lambda x:(x-mp.pi)**2+mp.mpf(1e-12)),
 ('(tau+phi)/degree',lambda x:(2*mp.pi+x)/(mp.pi/180)),
 ('0*exp(phi)+1',lambda x:mp.mpf(1)),
 ('sin(phi*100000000)+2',lambda x:mp.sin(x*100000000)+2),
 ('log(1e-320)',lambda x:mp.log(mp.mpf(1e-320))),
 ('_ring_log(2+sin(phi))+2',lambda x:mp.log(2+mp.sin(x))+2),
 ('_ring_log(1e-320)',lambda x:mp.log(mp.mpf(1e-320))),
]
rng=random.Random(20261010)
domains=[(0.,math.tau),(-math.pi,math.pi),(math.pi,math.pi),
         (math.nextafter(math.pi,-math.inf),math.nextafter(math.pi,math.inf)),
         (math.pi/2-1e-12,math.pi/2+1e-12),(-1e-10,1e-10)]
for _ in range(20):
 a=rng.uniform(-6,6);domains.append((a,a+rng.uniform(0,6)))
checks=0;intervals=0
for expression,oracle in cases:
 node=ast.parse(expression,mode='eval').body
 for lo,hi in domains:
  # A quotient with the original degree constant is not positive for x<-tau;
  # this test checks its enclosure, independent from the caller's positive gate.
  value,derivative=module.argument_bounds(node,lo,hi,3,lambda n,_:float(n.value))
  intervals+=1
  for k in range(25):
   x=mp.mpf(min(hi,max(lo,lo+(hi-lo)*k/24)))
   expected=oracle(x);slope=mp.diff(oracle,x)
   assert mp.mpf(value.lo)<=expected<=mp.mpf(value.hi),(expression,lo,hi,'value',str(expected),value.pair())
   assert mp.mpf(derivative.lo)<=slope<=mp.mpf(derivative.hi),(expression,lo,hi,'derivative',str(slope),derivative.pair())
   checks+=2
rejects=[]
for expression in ['log(0)','log(-1)','log(sin(phi))','log(phi-1)','1/(phi-1)','exp(1000)','log(exp(1000))','_ring_log(0)']:
 try:module.argument_bounds(ast.parse(expression,mode='eval').body,0.,math.tau,3,lambda n,_:float(n.value))
 except (ValueError,OverflowError,ZeroDivisionError):rejects.append(expression)
 else:raise AssertionError('Unsafe/nonfinite nested expression accepted: '+expression)
assert hashlib.sha256(source.read_bytes()).hexdigest()==digest,'Source changed during independent audit'
output=root/(sys.argv[1] if len(sys.argv)>1 else 'output/original-ring-log-independent-interval-1010.json')
assert output.resolve().is_relative_to(root/'output')
assert not output.exists()
result={'verified':True,'source':source.relative_to(root).as_posix(),'sourceSha256':digest,'highPrecisionDigits':90,
        'intervalCases':intervals,'independentValueAndDerivativeChecks':checks,'rejected':rejects,
        'producerEvaluatorsUsedForOracle':False,'productionChanged':False,
        'limits':'Finite stress checks of engineering enclosures; not an exhaustive proof of libm error, real-arithmetic certification or Wolfram runtime equivalence.'}
output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({key:result[key] for key in ['verified','intervalCases','independentValueAndDerivativeChecks','rejected']}))
