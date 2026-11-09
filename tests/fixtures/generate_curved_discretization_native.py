"""Frozen backend response witnesses, distinct from the independent 80-digit reference."""
import json, math, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from tessellation_curved_discretization_generic import query_discretization_generic
ref=json.loads((ROOT/'tests/fixtures/curved-discretization-generic-reference-20261001.json').read_text())
cases=[]
def add(name,mode,**fields):
    q={'family':'discretization-generic-native','mode':mode,**fields}
    cases.append({'name':name,'query':q,'response':query_discretization_generic(q)})
def uniform(name,curve,n=4,a=0,b=1):add(name,'uniform',curve=curve,divisions=n,parameterStart=a,parameterEnd=b)
add('system','system',rules=[{'key':'Curve2D','expression':['s','s**2']},{'key':'Curve2D','expression':'s+1'}],parameters=[0,.25,.5,.75,1])
add('ragged','system',rules=[{'key':'A','expression':'s+1'},{'key':'A','expression':[['s','s**2'],['3'],[]]},{'key':'B','expression':[]}],parameters=[2,-.5,2,0])
add('empty-system','system',rules=[],parameters=[1,0])
add('empty-samples','system',rules=[{'key':'A','expression':'s'}],parameters=[])
add('undefined','system',rules=[{'key':'R','expression':['1/s','sqrt(s)']}],parameters=[0,-1,1])
add('math','system',rules=[{'key':'f','expression':['sin(s)','cos(s)','tan(s)','atan(s)','exp(s)','log(s)','s**-2','Pi + E','(1e12+s)-1e12']}],parameters=[.2,.5,1])
add('offset-product','system',rules=[{'key':'p','expression':'((1+1+1+1)**4)**2'}],parameters=[0])
uniform('parabola',ref['parabola']['curve'])
uniform('oscillatory',ref['oscillatoryUnconstrained']['curve'])
uniform('reverse-5d',['cos(s)','sin(s)','s/3','2*s','0'],6,1.2,-.6)
uniform('line-1d',['s'],3)
uniform('line-64d',['s']*64,2)
uniform('stationary',['s**3'],2,-1,1)
uniform('sqrt-endpoint',['sqrt(s)','0'],1)
uniform('constant',['3','3'],1)
uniform('tiny',['1000000000-1e-8*s**2','1000000000+1e-8*s'])
uniform('constant-radical',['s+sqrt(0)','s'])
uniform('overflowing-origin-norm',['1e12**8*1e12**8*1e12**8*1e10**2+1e-8*s']*4,2)
kink={k:ref['kink'][k] for k in ['foldPoints','leftRulings','rightRulings']}
add('multipliers','multipliers',**kink)
for label,scale in [('large',1e100),('small',1e-100)]:
    add('multipliers-'+label,'multipliers',foldPoints=kink['foldPoints'],**{k:[[x*scale for x in p] for p in kink[k]] for k in ['leftRulings','rightRulings']})
add('zero-denominator','multipliers',foldPoints=[[0,0],[1,0]],leftRulings=[[0,1],[0,1]],rightRulings=[[0,-1],[0,-1]])
angle=math.pi/2+1e-13
add('small-denominator','multipliers',foldPoints=[[0,0],[1,0]],leftRulings=[[math.cos(angle),math.sin(angle)],[0,1]],rightRulings=[[0,-1],[0,-1]])
(ROOT/'tests/fixtures/curved-discretization-native-20261001.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
print(f'{len(cases)} response witnesses generated')
