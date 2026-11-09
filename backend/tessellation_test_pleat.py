"""Original In[2682] four styled graphic primitives; no paper semantics."""
import math

def validate_test_pleat(data):
 if not isinstance(data,dict) or data.get('family')!='test-pleat-native' or set(data)-{'family','points','angleDeg'}:raise ValueError('TestPleat只接受两端点与原α角参数。')
 points=data.get('points',[[0,0],[1,0]]);angle=data.get('angleDeg',36)
 if not isinstance(points,list) or len(points)!=2 or any(not isinstance(p,list) or len(p)!=2 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>1000 for v in p) for p in points):raise ValueError('TestPleat需要两个二维有限端点，坐标在±1000内。')
 if isinstance(angle,bool) or not isinstance(angle,(int,float)) or not math.isfinite(angle) or abs(angle)>36000:raise ValueError('原α输入须为±36000°内有限数值。')
 points=[[float(v) for v in p] for p in points]
 if math.dist(*points)==0:raise ValueError('原NormalizeReal需要不重合端点；未构造四图元。')
 return dict(family='test-pleat-native',points=points,angleDeg=float(angle))

def query_test_pleat(data):
 q=validate_test_pleat(data);a,b=q['points'];delta=[a[k]-b[k] for k in range(2)];distance=math.hypot(*delta);alpha=math.radians(q['angleDeg']);c,s=math.cos(alpha),math.sin(alpha)
 direction=[(c*delta[0]+s*delta[1])/distance,(-s*delta[0]+c*delta[1])/distance]
 dab=sum(delta[k]*direction[k] for k in range(2))/2;length=1.8*distance
 pa=[a[k]+(length-dab)*direction[k] for k in range(2)];pb=[b[k]+(length+dab)*direction[k] for k in range(2)]
 return dict(schema='origamica-test-pleat-v1',query=q,source=dict(function='TestPleat',definitionCell='In[2682]',definitionLines=[199210,199288],alphaRad=alpha,direction=direction,dab=dab,length=length,pa=pa,pb=pb,originalGraphicOrder=['Polygon[pa,pb,qb,qa]','Line[qa,qb]','Line[qa,pa]','Line[qb,pb]'],publicOptions=[],wolframExecuted=False,paperCertification=False),data=dict(graphics=[dict(primitive='Polygon',points=[pa,pb,b,a],style=dict(Opacity=.1)),dict(primitive='Line',points=[a,b],style='Black'),dict(primitive='Line',points=[a,pa],style='Red'),dict(primitive='Line',points=[b,pb],style='Blue')]))
