"""Original finite three-edge CCW/CW query, with both CheckHalfPlane branches."""
import math
import numpy as np
R=np.array([[0.,1.],[-1.,0.]])
I=np.eye(2)
RT=np.array([[R,-I],[I,R]])
def validate_three_cycle(data):
 if not isinstance(data,dict) or data.get('family')!='three-cycle-critical-native' or set(data)-{'family','edges','checkHalfPlane'}:raise ValueError('原三边角域只接受edges与CheckHalfPlane布尔选项。')
 edges=data.get('edges',[[[0,-1],[0,3]],[[-3,0],[0,-3]],[[-3,2],[0,2]]]);check=data.get('checkHalfPlane',True)
 if type(check) is not bool:raise ValueError('CheckHalfPlane须为True或False。')
 if not isinstance(edges,list) or len(edges)!=3 or any(not isinstance(e,list) or len(e)!=2 or any(not isinstance(p,list) or len(p)!=2 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>1000 for v in p) for p in e) for e in edges):raise ValueError('需要三条有向二维边，各坐标为±1000内有限数值。')
 return dict(family='three-cycle-critical-native',edges=[[[float(v) for v in p] for p in e] for e in edges],checkHalfPlane=check)
def _ccw(edges,check):
 a,b,c=[np.array(e,dtype=float) for e in edges];s1,s2,s3=[e[1]-e[0] for e in (a,b,c)]
 half=bool(any(float(s@s)==0 for s in (s1,s2,s3)) or np.sign((-R@s1)@s2)==np.sign((-R@s1)@s3))
 out=dict(sameHalfPlane=half,halfPlaneEarlyReturnUsed=bool(check and half),route='half-plane-return' if check and half else 'original-line-intersections',angleRad=None,intersections=[None,None],u2=None,numerator=None,denominator=None,reason=None)
 if check and half:out['angleRad']=math.pi/2;return out
 def direction(p,other,own):return np.einsum('i,j,ijkl,l->k',p,other,RT,own)
 def intersection(p,u,q,v):
  det=u[0]*v[1]-u[1]*v[0];scale=float(np.linalg.norm(u)*np.linalg.norm(v))
  if not math.isfinite(scale) or scale==0 or abs(det)<=1e-12*scale:return None
  d=q-p;return p+(d[0]*v[1]-d[1]*v[0])/det*u
 p12=b[1]-a[1];p23=c[1]-b[1]
 t12=intersection(a[1],direction(p12,s2,s1),b[1],direction(p12,s1,s2));t23=intersection(b[1],direction(p23,s3,s2),c[1],direction(p23,s2,s3))
 out['intersections']=[None if t is None else t.tolist() for t in (t12,t23)]
 if t12 is None or t23 is None:out['reason']='line-intersection-not-numerically-certified';return out
 u=R@(t12-t23);num=float(u@(R@s2));den=float(u@s2);out.update(u2=u.tolist(),numerator=num,denominator=den)
 if not math.isfinite(num) or not math.isfinite(den) or den==0:out['reason']='atan-ratio-not-finite';return out
 angle=math.atan(num/den)
 if not math.isfinite(angle):out['reason']='atan-ratio-not-finite';return out
 out['angleRad']=angle;return out
def query_three_cycle(data):
 q=validate_three_cycle(data);evaluations=[_ccw(q['edges'],q['checkHalfPlane']),_ccw([e[::-1] for e in q['edges']],q['checkHalfPlane'])];a,b=[e['angleRad'] for e in evaluations];angles=[a,None if b is None else math.pi+b]
 return dict(schema='origamica-three-cycle-critical-v1',query=q,source=dict(function='ThreeCycleCriticalTwistAngles',definitionCell='In[2700]',counterclockwiseCell='In[2696]',clockwiseCell='In[2698]',defaultOptionsCell='In[2695]',sameHalfPlaneCell='In[2691]',definitionLines=[200504,200536],checkHalfPlaneDefault=True,originalArcTanRatio=True,originalReversedEdgeCW=True,wolframExecuted=False,symbolicExpressionRuntime=False,paperCertification=False),data=dict(status='evaluated' if all(x is not None for x in angles) else 'numeric-evaluation-incomplete',anglesRad=angles,anglesDeg=[None if x is None else math.degrees(x) for x in angles],evaluations=evaluations,noMathematicalInfeasibilityClaim=True))
