import copy,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from tessellation_curved_uncurl_generic import PRESET,generate_uncurl_generic_query

cases={
 'zero-initial-direction':dict(initialTangent=[0,0]),
 'unit-radial-helix':dict(curve=['cos(s)','sin(s)','s/2'],normal=['cos(s)','sin(s)','0']),
 'backward-domain':dict(parameterStart=-2,parameterEnd=-1,initialPoint=[2,-3],initialTangent=[-5,0]),
 'curvature-zero-straight':dict(curve=['2*s','0','0'],normal=['0','0','1']),
 'zero-source-speed':dict(curve=['s**2','s**4','0']),
 'higher-jet-radical':dict(curve=['s','sqrt(s**4)','0']),
 'cancelled-radical':dict(curve=['s','sqrt(s-s)','0']),
 'undefined-source-value':dict(curve=['log(s)','s','0']),
 'undefined-normal-value':dict(normal=['0','0','sqrt(s)']),
 'tiny-circle':dict(curve=['1e-140*sin(s)','1e-140*(1-cos(s))','0']),
 'huge-circle':dict(curve=['(1e12**8)*(1e11**4)*sin(s)','(1e12**8)*(1e11**4)*(1-cos(s))','0']),
 'translated-tiny-circle':dict(curve=['1e12+1e-20*sin(s)','1e12+1e-20*(1-cos(s))','0']),
 'zero-normal':dict(normal=['0','0','0']),
 'normal-constant-radical':dict(normal=['sqrt(0)','0','1']),
 'source-constant-small-quotient':dict(curve=['s','(1e-160*1e-160)/(1e-160*1e-160)','0']),
 'literal-zero-product':dict(curve=['s','0*sqrt(s**2)','0']),
 'literal-zero-power':dict(curve=['s','(sqrt(s**2))**0','0']),
 'undefined-zero-product':dict(curve=['s','0*log(-1)','0']),
 'valid-display-undefined-anchor':dict(curve=['log(s)','s','0'],parameterStart=1,parameterEnd=2),
 'constant-tiny-log':dict(curve=['s','0','log(1e-320)'],parameterStart=0,parameterEnd=.01),
 'subnormal-curvature-overflow':dict(curve=['1e-320*s','1e-320*s**2/2','0'],parameterStart=0,parameterEnd=.01),
 'large-tangential-acceleration':dict(curve=['1e-200*s+((1e10)**8*(1e10)**8*(1e10)**4)*s**2/2','0','0'],parameterStart=0,parameterEnd=.01),
 'nondyadic-polynomial-straight':dict(curve=['s**2','2*s**2','3*s**2'],parameterStart=.1,parameterEnd=.2),
 'nondyadic-sine-straight':dict(curve=['sin(s)','2*sin(s)','3*sin(s)'],parameterStart=.1,parameterEnd=.2),
 'rational-straight':dict(curve=['s/(1+s)','2*s/(1+s)','3*s/(1+s)'],parameterStart=.1,parameterEnd=.2),
 'straight-original-radical-domain':dict(curve=['sqrt(s)','2*sqrt(s)','3*sqrt(s)'],parameterStart=-.1,parameterEnd=.1),
 'compensated-constant-real-curvature':dict(curve=['s','(1000000000+1/10**8-1000000000)*s**2','0'],parameterStart=.1,parameterEnd=.2),
}
output=[]
for name,change in cases.items():
 q=copy.deepcopy(PRESET);q.update(change);q['segments']=8
 try:output.append({'name':name,'result':generate_uncurl_generic_query(q)})
 except Exception as error:output.append({'name':name,'error':str(error),'type':type(error).__name__})
(ROOT/'tests/fixtures/uncurl-native-boundary-responses.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
print([(c['name'],c.get('error','ready')) for c in output])
