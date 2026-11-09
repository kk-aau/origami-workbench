"""Public P45 curve/frame helpers, preserving raw modern recovery initials.

This module evaluates only whitelist numeric expressions. It exposes original
ordered rules or the original four-element recovery list, not a crease pattern.
No Wolfram input, interpolation objects or DSolve are executed. Explicit finite
NDSolve step options share the existing accepted-step controller.
"""
import math
import numpy as np
import sympy as sp
from scipy.integrate import solve_ivp
from tessellation_curved_ndsolve_options import validate_ndsolve_options,solve_with_steps
from tessellation_curved_generic_darboux import (
    Expression,Taylor,IntervalTaylor,GenericDarbouxError,ROUNDING,dot,cross,times,
    initial_frame_compatibility,
)
from tessellation_curved_linked_common_interval import Interval,down,up
from tessellation_curved_matched_pair_query import symbolic_node,simplified,algebraic_budget

FAMILY='system-helpers-generic-native'
RESULT_FAMILY='origamica-generic-system-helpers'
COMMON={'family':FAMILY,'parameterStart':0.,'parameterEnd':1.,'segments':32}
PRESETS={
 'curve2':{**COMMON,'mode':'curve2','curve':['s','s**2/4']},
 'curve3':{**COMMON,'mode':'curve3','curve':['sin(s)','s**2/4','1-cos(s)']},
 'darboux3':{**COMMON,'mode':'darboux3','curve':['sin(s)','s**2/4','1-cos(s)'],'normal':['(s*cos(s)-sin(s))/sqrt(5+s**2)','-2/sqrt(5+s**2)','(cos(s)+s*sin(s))/sqrt(5+s**2)']},
 'ruled-normal':{**COMMON,'mode':'ruled-normal','baseCurve':['s','.1*s**2','.2*s**3'],'director':['0','0','1'],'sigma':1,'transverseStart':-.2,'transverseEnd':.2,'rulingSegments':16},
 'recover2':{**COMMON,'mode':'recover2','coefficients':['1+.1*s','.4+.1*s'],'initialParameter':0.,'initialPoint':[0.,0.],'initialTangent':[1.,0.]},
 'recover3':{**COMMON,'mode':'recover3','coefficients':['1+.1*s','.4+.1*s','.2*s'],'initialParameter':0.,'initialPoint':[0.,0.,0.],'initialTangent':[1.,0.,0.],'initialBinormal':[0.,0.,1.]},
 'recover-darboux':{**COMMON,'mode':'recover-darboux','coefficients':['1+.1*s','.4+.1*s','.1*sin(s)','.2*s'],'initialParameter':0.,'initialPoint':[0.,0.,0.],'initialTangent':[1.,0.,0.],'initialLeft':[0.,1.,0.],'initialNormal':[0.,0.,1.]},
}
SOURCE={
 'curve2':(['Curve2DSystem','NCurve2DSystem'],['In[3627]','In[3632]'],['Curve2D','Speed2D','LeftCurvature2D','Curvature2D','TangentVector2D','LeftNormalVector2D','NormalVector2D']),
 'curve3':(['Curve3DSystem','NCurve3DSystem'],['In[3669]','In[3676]'],['Curve3D','Speed3D','Curvature3D','Torsion3D','TangentVector3D','BinormalVector3D','NormalVector3D']),
 'darboux3':(['Darboux3DSystem','NDarboux3DSystem'],['In[3792]','In[3799]'],['Speed3D','GeodesicCurvature3D','NormalCurvature3D','GeodesicTorsion3D','TangentVector3D','TangentNormalVector3D','SurfaceNormalVector3D']),
 'ruled-normal':(['RuledSurfaceNormal'],['In[3817]'],['SurfaceNormalVector3D']),
 'recover2':(['RecoverCurve2DSystem','NRecoverCurve2DSystem'],['In[3637]','In[3640]'],['Curve2D','Speed2D','LeftCurvature2D','Curvature2D','TangentVector2D','LeftNormalVector2D','NormalVector2D']),
 'recover3':(['RecoverCurve3DSystem','NRecoverCurve3DSystem'],['In[3680]','In[3685]'],['Curve3D','Speed3D','Curvature3D','Torsion3D','TangentVector3D','BinormalVector3D','NormalVector3D']),
 'recover-darboux':(['RecoverDarboux3D','NRecoverDarboux3D'],['In[3811]','In[3815]'],['C','T','L','U']),
}
class SystemHelperError(GenericDarbouxError):pass
def finite(x):return type(x) in (int,float) and math.isfinite(x)
def validate_system_helpers_query(data):
 if not isinstance(data,dict) or data.get('mode') not in PRESETS:raise SystemHelperError('input-contract','公共系统模式无效。')
 preset=PRESETS[data['mode']]
 if set(data)-set(preset)-({'ndsolveOptions'} if data['mode'].startswith('recover') else set()):raise SystemHelperError('input-contract','公共系统仅接受当前原函数的字段。')
 q={**preset,**data}
 if q['family']!=FAMILY:raise SystemHelperError('input-contract','公共系统类型无效。')
 dimension=2 if q['mode'] in ('curve2','recover2') else 3
 for key,n in [('curve',dimension),('baseCurve',3),('director',3),('normal',3),('coefficients',{'recover2':2,'recover3':3,'recover-darboux':4}.get(q['mode'],0))]:
  if key not in q:continue
  if not isinstance(q[key],list) or len(q[key])!=n:raise SystemHelperError('input-contract','原源或原系数维数不匹配。')
  for value in q[key]:Expression(value,'s')
  q[key]=list(q[key])
 for key in ('parameterStart','parameterEnd','initialParameter','transverseStart','transverseEnd'):
  if key in q:
   if not finite(q[key]):raise SystemHelperError('input-contract','原参数域和ui必须有限。')
   q[key]=float(q[key])
 a,b=q['parameterStart'],q['parameterEnd']
 if not -10<=a<b<=10 or not .01<=b-a<=12:raise SystemHelperError('input-contract','s域须在±10内，跨度0.01–12。')
 if 'initialParameter' in q and not a<=q['initialParameter']<=b:raise SystemHelperError('input-contract','ui必须在完整原域内。')
 if 'transverseStart' in q and not -1e6<=q['transverseStart']<q['transverseEnd']<=1e6:raise SystemHelperError('input-contract','w域须在±10⁶内递增。')
 for key,lo,hi in [('segments',8,128),('rulingSegments',2,64)]:
  if key in q and (type(q[key]) is not int or not lo<=q[key]<=hi):raise SystemHelperError('input-contract','显示密度超出有限预算。')
 if 'sigma' in q and (type(q['sigma']) is not int or q['sigma'] not in (-1,1)):raise SystemHelperError('input-contract','原σ必须为±1。')
 for key in ('initialPoint','initialTangent','initialBinormal','initialLeft','initialNormal'):
  if key in q:
   if not isinstance(q[key],list) or len(q[key])!=dimension or any(not finite(x) or abs(x)>1e12 for x in q[key]):raise SystemHelperError('input-contract','原初向量须为±10¹²内有限raw坐标。')
   q[key]=[float(x) for x in q[key]]
 if 'ndsolveOptions' in q:q['ndsolveOptions']=validate_ndsolve_options(q['ndsolveOptions'],b-a)
 return q
def square(x):
 if not isinstance(x,Interval):return x*x
 lo=0. if x.lo<=0<=x.hi else min(x.lo*x.lo,x.hi*x.hi)
 return Interval(max(0.,down(lo)),up(max(x.lo*x.lo,x.hi*x.hi)))
def length(items):
 if not any(isinstance(x,Interval) for x in items):return math.hypot(*items)
 total=sum((square(Interval.cast(x)) for x in items),Interval(0.))
 return Interval(max(0.,down(math.sqrt(max(0.,total.lo)))),up(math.sqrt(max(0.,total.hi))))
def bounds(x):x=Interval.cast(x);return[x.lo,x.hi]
def primitive(x):
 if isinstance(x,np.ndarray):return x.tolist()
 if isinstance(x,Taylor):return float(x.value)
 return float(x)
def vec(a):return [float(x.value) if isinstance(x,Taylor) else float(x) for x in a]
def gram(frame):
 matrix=np.column_stack(frame);return float(np.max(np.abs(matrix.T@matrix-np.eye(len(frame)))))

class SystemKernel:
 def __init__(self,q):
  self.q=q;self.mode=q['mode'];self.recover=self.mode.startswith('recover');self.dimension=2 if self.mode in ('curve2','recover2') else 3
  self.groups={key:[Expression(x,'s') for x in q[key]] for key in ('curve','normal','baseCurve','director','coefficients') if key in q}
  self.a=q['parameterStart'];self.b=q['parameterEnd'];self.ui=q.get('initialParameter',self.a);self.calls=0;self.forward=self.backward=None
  argument=Taylor.variable(self.ui,4);self.parts=[]
  if self.recover:
   self.origin=q['initialPoint'];self.initial_tangent=np.asarray(q['initialTangent'])
   if self.dimension==2:self.initial_left=np.array([-self.initial_tangent[1],self.initial_tangent[0]]);self.initial_frame=[self.initial_tangent,self.initial_left]
   elif self.mode=='recover3':self.initial_binormal=np.asarray(q['initialBinormal']);self.initial_normal=np.cross(self.initial_binormal,self.initial_tangent);self.initial_frame=[self.initial_tangent,self.initial_normal,self.initial_binormal]
   else:self.initial_left=np.asarray(q['initialLeft']);self.initial_normal=np.asarray(q['initialNormal']);self.initial_frame=[self.initial_tangent,self.initial_left,self.initial_normal]
   self.frame_gram=gram(self.initial_frame);orientation=float(np.linalg.det(np.column_stack(self.initial_frame)));self.initial_compatible=bool(self.frame_gram<=64*np.finfo(float).eps and abs(orientation-1)<=64*np.finfo(float).eps)
   speed=[abs(self.groups['coefficients'][0](Taylor.variable(float(s),0)).value) for s in np.linspace(self.a,self.b,9)]
   self.scale=max(speed)*(self.b-self.a)*max((float(np.linalg.norm(x)) for x in self.initial_frame),default=0.) or 1.
   self.initial_state=np.concatenate((np.zeros(self.dimension),*self.initial_frame))
  else:
   self.base_key='baseCurve' if self.mode=='ruled-normal' else 'curve';self.parts=[f.affine_parts(argument) for f in self.groups[self.base_key]]
   self.origin=[math.fsum(offset)+dynamic.value for offset,dynamic in self.parts];distances=[];speeds=[];directors=[]
   for s in np.linspace(self.a,self.b,9):
    arg=Taylor.variable(float(s),1);p=[f.affine_parts(arg) for f in self.groups[self.base_key]]
    distances.append(math.hypot(*(dynamic.value-initial_dynamic.value+math.fsum(offset+[-x for x in initial_offset]) for (offset,dynamic),(initial_offset,initial_dynamic) in zip(p,self.parts))))
    speeds.append(math.hypot(*(dynamic.c[1] for _,dynamic in p)))
    if self.mode=='ruled-normal':directors.append(math.hypot(*(f(arg).value for f in self.groups['director']))*max(abs(q['transverseStart']),abs(q['transverseEnd'])))
   self.scale=max(*distances,max(speeds)*(self.b-self.a),*(directors or [0.])) or 1.
   self.frame_gram=None;self.initial_compatible=None
  if not math.isfinite(self.scale) or self.scale<=0:raise SystemHelperError('source-scale','原几何尺度非有限。')
  self.zero_frame_proved=False;self.raw_normal_identity=False
  if not self.recover:self.symbolic_sufficient()

 def symbolic_sufficient(self):
  try:
   if any(algebraic_budget(f.tree)>28 for g in self.groups.values() for f in g):return
   s=sp.Symbol('s',real=True);c=[symbolic_node(f.tree,s) for f in self.groups[self.base_key]];cp=[sp.diff(x,s) for x in c]
   if self.mode=='curve3':self.zero_frame_proved=all(simplified(x)==0 for x in cross(cp,[sp.diff(x,s) for x in cp]))
   elif self.mode=='darboux3':
    u=[symbolic_node(f.tree,s) for f in self.groups['normal']];self.raw_normal_identity=simplified(dot(u,u)-1)==0 and simplified(dot(cp,u))==0
  except (ValueError,TypeError,RecursionError,OverflowError,NotImplementedError,sp.PolynomialError):pass

 def source(self,s,order=4):
  arg=(IntervalTaylor if isinstance(s,Interval) else Taylor).variable(s,order)
  if self.recover:return [f(arg) for f in self.groups['coefficients']]
  out={}
  for key,functions in self.groups.items():
   if key==self.base_key:
    out['c']=[(dynamic-initial_dynamic.value+math.fsum(offset+[-x for x in initial_offset]))/self.scale for f,(initial_offset,initial_dynamic) in zip(functions,self.parts) for offset,dynamic in [f.affine_parts(arg)]]
   else:out[key]=[f(arg)/(self.scale if key=='director' else 1.) for f in functions]
  out['cp']=[x.derivative() for x in out['c']];return out

 def coefficients(self,s):
  values=[f(Taylor.variable(float(s),0)).value for f in self.groups['coefficients']]
  if not all(math.isfinite(x) for x in values):raise SystemHelperError('non-finite','原系数非有限。')
  if self.mode=='recover2':return [values[0]/self.scale,values[0]*values[1],0.,0.],values
  if self.mode=='recover3':return [values[0]/self.scale,values[0]*values[1],0.,values[0]*values[2]],values
  return [values[0]/self.scale,*values[1:]],values

 def derivative(self,s,y):
  self.calls+=1
  if self.calls>24000:raise SystemHelperError('integration-budget','原系数恢复超过有限积分预算。')
  v,g,h,z=self.coefficients(s)[0];n=self.dimension;t=y[n:2*n];l=y[2*n:3*n]
  if n==2:return np.concatenate((v*t,g*l,-g*t))
  u=y[3*n:4*n];return np.concatenate((v*t,g*l+h*u,-g*t+z*u,-h*t-z*l))

 def integrate(self):
  if not self.recover:return
  options=self.q.get('ndsolveOptions');self.accepted_steps=0
  def before_step():
   if self.accepted_steps>=options.get('MaxSteps',4096):
    raise SystemHelperError('max-steps-exceeded','原MaxSteps成功步数已耗尽，完整s域未完成；不返回截短曲线或标架。')
   self.accepted_steps+=1
  def solve(end):
   if options:
    sol=solve_with_steps(self.derivative,self.ui,end,self.initial_state,2e-12,2e-14,
     options.get('MaxStepSize',(self.b-self.a)/16),before_step)
   else:sol=solve_ivp(self.derivative,(self.ui,end),self.initial_state,method='DOP853',rtol=2e-12,atol=2e-14,dense_output=True,max_step=(self.b-self.a)/16)
   if not sol.success or not np.all(np.isfinite(sol.y)):raise SystemHelperError('integration-failed','原系数恢复未得到有限轨迹。')
   return sol
  if self.ui<self.b:self.forward=solve(self.b)
  if self.ui>self.a:self.backward=solve(self.a)

 def recover_state(self,s):
  if s==self.ui:return self.initial_state.copy()
  return (self.forward if s>self.ui else self.backward).sol(s)

 def row(self,s):
  mode=self.mode;n=self.dimension;rules={};derivatives={};reasons=[];frame=[];scalars={};director=None
  if self.recover:
   y=self.recover_state(s);dy=self.derivative(s,y);c=y[:n];cp=dy[:n];t=y[n:2*n];l=y[2*n:3*n];coeff,raw=self.coefficients(s)
   frame=[t,l] if n==2 else [t,l,y[3*n:4*n]];tp=dy[n:2*n];lp=dy[2*n:3*n]
   if mode=='recover-darboux':rules={'C':np.asarray(self.origin)+self.scale*c,'T':t,'L':l,'U':frame[2]};derivatives={'C':self.scale*cp,'T':tp,'L':lp,'U':dy[3*n:4*n]};scalars={'ds':raw[0],'sdKappaG':raw[1],'sdKappaN':raw[2],'sdTauG':raw[3]}
   elif n==2:
    k=raw[1];sign=float(np.sign(k));rules={'Curve2D':np.asarray(self.origin)+self.scale*c,'Speed2D':raw[0],'LeftCurvature2D':k,'Curvature2D':abs(k),'TangentVector2D':t,'LeftNormalVector2D':l,'NormalVector2D':sign*l}
    derivatives={'curve':self.scale*cp,'T':tp,'L':lp};scalars={'speed':raw[0],'leftCurvature':k,'curvature':abs(k)}
   else:
    rules={'Curve3D':np.asarray(self.origin)+self.scale*c,'Speed3D':raw[0],'Curvature3D':raw[1],'Torsion3D':raw[2],'TangentVector3D':t,'BinormalVector3D':frame[2],'NormalVector3D':l}
    derivatives={'curve':self.scale*cp,'T':tp,'N':lp,'B':dy[3*n:4*n]};scalars={'speed':raw[0],'curvature':raw[1],'torsion':raw[2]}
   speed=float(np.linalg.norm(cp))*self.scale;defined=True
  else:
   source=self.source(float(s));c=np.asarray(vec(source['c']));cp=np.asarray(vec(source['cp']));speed=float(np.linalg.norm(cp))*self.scale;defined=True
   if mode=='ruled-normal':
    d=np.asarray(vec(source['director']));dp=np.asarray(vec([x.derivative() for x in source['director']]));director=d;derivatives={'curve':self.scale*cp,'director':self.scale*dp};scalars={'baseSpeed':speed};frame=[]
    w=(self.q['transverseStart']+self.q['transverseEnd'])/2;normal=np.cross(cp+w*dp,d);normal_length=float(np.linalg.norm(normal));defined=bool(normal_length)
    rules={'SurfaceNormalVector3D':self.q['sigma']*normal/normal_length if normal_length else None}
    if not defined:reasons.append('zero-area-original-NormalizeReal')
   else:
    v=length([x.value for x in source['cp']]);v_jet=dot(source['cp'],source['cp']).sqrt() if v>0 else None;t=times(source['cp'],1/v_jet) if v>0 else None
    if t is None:defined=False;reasons.append('zero-speed-original-division');rules={name:None for name in SOURCE[mode][2]};rules['Curve2D' if n==2 else 'Curve3D']=np.asarray(self.origin)+self.scale*c if mode!='darboux3' else None
    else:
     tp=[x.derivative() for x in t];T=np.asarray(vec(t));TP=np.asarray(vec(tp))
     if mode=='curve2':
      l=[-t[1],t[0]];k=dot(l,tp).value/(v*self.scale);L=np.asarray(vec(l));frame=[T,L]
      rules={'Curve2D':np.asarray(self.origin)+self.scale*c,'Speed2D':speed,'LeftCurvature2D':k,'Curvature2D':abs(k),'TangentVector2D':T,'LeftNormalVector2D':L,'NormalVector2D':float(np.sign(k))*L};derivatives={'curve':self.scale*cp,'T':TP,'L':np.array([-TP[1],TP[0]])};scalars={'speed':speed,'leftCurvature':k,'curvature':abs(k)}
     elif mode=='curve3':
      cross_derivatives=cross(source['cp'],[x.derivative() for x in source['cp']]);cross_value=length([x.value for x in cross_derivatives]);k=cross_value/(v**3*self.scale)
      if cross_value>0:
       b=times(cross_derivatives,1/dot(cross_derivatives,cross_derivatives).sqrt());normal=cross(b,t);B=np.asarray(vec(b));N=np.asarray(vec(normal));tau=dot(cross_derivatives,[x.derivative().derivative() for x in source['cp']]).value/(cross_value**2*self.scale);frame=[T,N,B]
       derivatives={'curve':self.scale*cp,'T':TP,'N':vec([x.derivative() for x in normal]),'B':vec([x.derivative() for x in b])}
      else:defined=False;reasons.append('zero-curvature-original-NormalizeReal');B=N=tau=None;frame=[T];derivatives={'curve':self.scale*cp,'T':TP,'N':None,'B':None}
      rules={'Curve3D':np.asarray(self.origin)+self.scale*c,'Speed3D':speed,'Curvature3D':k,'Torsion3D':tau,'TangentVector3D':T,'BinormalVector3D':B,'NormalVector3D':N};scalars={'speed':speed,'curvature':k,'torsion':tau}
     else:
      u=source['normal'];l=cross(u,t);L=np.asarray(vec(l));U=np.asarray(vec(u));g=dot(l,tp).value/(v*self.scale);h=dot(u,tp).value/(v*self.scale);z=-dot(l,[x.derivative() for x in u]).value/(v*self.scale);frame=[T,L,U]
      rules={'Speed3D':speed,'GeodesicCurvature3D':g,'NormalCurvature3D':h,'GeodesicTorsion3D':z,'TangentVector3D':T,'TangentNormalVector3D':L,'SurfaceNormalVector3D':U};derivatives={'curve':self.scale*cp,'T':TP,'L':vec([x.derivative() for x in l]),'U':vec([x.derivative() for x in u])};scalars={'speed':speed,'geodesicCurvature':g,'normalCurvature':h,'geodesicTorsion':z}
    if t is None:
     if mode=='darboux3':rules.pop('Curve3D',None);rules['Speed3D']=speed;rules['SurfaceNormalVector3D']=vec(source['normal'])
     else:rules['Speed2D' if n==2 else 'Speed3D']=speed
     derivatives={'curve':self.scale*cp};scalars={'speed':speed}
  world=np.asarray(self.origin)+self.scale*c
  convert=lambda value:None if value is None else value.tolist() if isinstance(value,np.ndarray) else [float(x) for x in value] if isinstance(value,(list,tuple)) else float(value)
  return {'s':float(s),'transverseParameter':(self.q['transverseStart']+self.q['transverseEnd'])/2 if mode=='ruled-normal' else None,'curve':world.tolist(),'normalizedCurve':c.tolist(),'curveDerivative':(self.scale*cp).tolist(),'normalizedCurveDerivative':cp.tolist(),'rules':{key:convert(rules.get(key)) for key in SOURCE[mode][2]},
   'derivatives':{key:convert(value) for key,value in derivatives.items()},'coefficients':{key:convert(value) for key,value in scalars.items()},'frame':[vec(x) for x in frame],
   'frameGramResidual':gram(frame) if len(frame)==n else None,'systemDefined':defined,'undefinedReasons':reasons,'actualCurveSpeed':speed,
   'director':None if director is None else (self.scale*director).tolist(),'normalizedDirector':None if director is None else director.tolist()}

 def certify(self):
  cells=[];unresolved=[];evaluations=0
  def visit(a,b,depth):
   nonlocal evaluations
   evaluations+=1
   try:
    r=self.source(Interval(a,b),4);aux=None
    if self.recover:coefficient_bounds=[bounds(x.value) for x in r]
    else:
     coefficient_bounds=[];speed=length([x.value for x in r['cp']]);aux=square(speed)
     if self.mode=='curve3':aux=sum((square(x.value) for x in cross(r['cp'],[x.derivative() for x in r['cp']])),Interval(0.))
     if self.mode=='ruled-normal':
      w=Interval(self.q['transverseStart'],self.q['transverseEnd']);dp=[x.derivative() for x in r['director']];ds=[x+y*w for x,y in zip(r['cp'],dp)];aux=sum((square(x.value) for x in cross(ds,r['director'])),Interval(0.))
     if Interval.cast(aux).lo<=0 and not self.zero_frame_proved:raise ValueError('frame-norm-not-positive')
    def all_finite(value):
     if isinstance(value,Taylor):return all(all_finite(x) for x in value.c)
     if isinstance(value,Interval):return math.isfinite(value.lo) and math.isfinite(value.hi)
     if isinstance(value,(list,tuple)):return all(all_finite(x) for x in value)
     if isinstance(value,dict):return all(all_finite(x) for x in value.values())
     return math.isfinite(value)
    if not all_finite(r):raise ValueError('nonfinite-interval')
    cells.append({'start':a,'end':b,'auxiliaryNormSquaredBounds':None if aux is None else bounds(aux),'coefficientBounds':coefficient_bounds,'systemDefined':not self.zero_frame_proved})
   except (ValueError,ZeroDivisionError,OverflowError,FloatingPointError,SystemHelperError):
    if evaluations>=1023 or depth>=18:unresolved.append([a,b]);return
    m=(a+b)/2;visit(a,m,depth+1)
    if evaluations>=1023:unresolved.append([m,b]);return
    visit(m,b,depth+1)
  visit(self.a,self.b,0);certified=not unresolved and not self.zero_frame_proved
  return {'certified':certified,'evaluations':evaluations,'verifiedCells':len(cells),'cells':cells,'unresolved':unresolved,'roundingModel':ROUNDING,
   'zeroFrameIdentityProved':self.zero_frame_proved,'reason':None if certified else 'original-frame-identically-undefined' if self.zero_frame_proved else 'original-source-or-frame-not-enclosed-within-budget'}

def query_system_helpers_generic(data):
 q=validate_system_helpers_query(data);kernel=SystemKernel(q);domain=kernel.certify();kernel.integrate()
 nodes=np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1);rows=[kernel.row(float(s)) for s in nodes];validation=[kernel.row(float(s)) for s in sorted(set(nodes.tolist()+np.linspace(q['parameterStart'],q['parameterEnd'],129).tolist()))]
 grid=[];undefined_grid=0;validation_undefined_normals=0
 if q['mode']=='ruled-normal':
  ws=np.linspace(q['transverseStart'],q['transverseEnd'],q['rulingSegments']+1)
  for row in rows:
   d=np.asarray(row['normalizedDirector']);dp=np.asarray(row['derivatives']['director'])/kernel.scale;bp=np.asarray(row['normalizedCurveDerivative']);base=np.asarray(row['normalizedCurve']);entry={'s':row['s'],'points':[],'normalizedPoints':[],'normals':[],'areaSquared':[]}
   for w in ws:
    p=base+w*d;normal=np.cross(bp+w*dp,d);mag=float(np.linalg.norm(normal));entry['points'].append((np.asarray(kernel.origin)+kernel.scale*p).tolist());entry['normalizedPoints'].append(p.tolist());entry['areaSquared'].append(mag*mag)
    entry['normals'].append((q['sigma']*normal/mag).tolist() if mag else None);undefined_grid+=int(mag==0)
   grid.append(entry)
  for row in validation:
   d=np.asarray(row['normalizedDirector']);dp=np.asarray(row['derivatives']['director'])/kernel.scale;bp=np.asarray(row['normalizedCurveDerivative'])
   for w in [*ws.tolist(),(q['transverseStart']+q['transverseEnd'])/2]:validation_undefined_normals+=int(float(np.linalg.norm(np.cross(bp+w*dp,d)))==0)
 frame_residuals=[row['frameGramResidual'] for row in validation if row['frameGramResidual'] is not None]
 functions,cells,rule_names=SOURCE[q['mode']];formal=domain['certified'] and (kernel.initial_compatible if kernel.recover else kernel.raw_normal_identity if q['mode']=='darboux3' else True)
 result={'family':RESULT_FAMILY,'query':q,'source':{'functions':functions,'definitionCells':cells,'selectedFunction':functions[-1],'outputKind':'ordered-list' if q['mode']=='recover-darboux' else 'ordered-rules' if q['mode']!='ruled-normal' else 'two-parameter-normal-function',
  'ruleOrder':rule_names,'method':'whitelist-AST/modern-raw-IC/literal-system-equations','rawNormalPreserved':q['mode']=='darboux3','rawInitialVectorsPreserved':kernel.recover,'normalizeRealConvention':'vector/Mag(vector); zero remains undefined',
  'darbouxCoefficientConvention':'ds multiplies C only; sdKappaG/sdKappaN/sdTauG already parameter derivatives','symbolicObjectsReproduced':False,'interpolationReproduced':False,'wolframOptionsReproduced':False},
  'normalization':{'origin':kernel.origin,'scale':kernel.scale},'initial':None if not kernel.recover else {'parameter':kernel.ui,'point':q['initialPoint'],'frame':[x.tolist() for x in kernel.initial_frame],'frameGramResidual':kernel.frame_gram,'frameCompatibilityTolerance':64*np.finfo(float).eps,'frameCompatible':kernel.initial_compatible},
  'domain':domain,'diagnostics':{'validationNodes':129,'validationUnionNodes':len(validation),'definedRows':sum(row['systemDefined'] for row in rows),'undefinedGridNormals':undefined_grid,'validationUndefinedNormals':validation_undefined_normals,'maximumFrameGramResidual':max(frame_residuals) if frame_residuals else None,
   'rawNormalIdentityAnalytic':kernel.raw_normal_identity,'integration':{'method':'DOP853' if kernel.recover else 'none','rtol':2e-12 if kernel.recover else None,'atol':2e-14 if kernel.recover else None,'forwardEvaluations':0 if kernel.forward is None else kernel.forward.nfev,'backwardEvaluations':0 if kernel.backward is None else kernel.backward.nfev}},
  'certification':{'sourceDefinitionCertified':domain['certified'],'finiteSystemFullyDefined':all(row['systemDefined'] for row in validation) and not validation_undefined_normals,'formalFrameOrthonormalCertified':bool(formal),'integrationErrorIntervalCertified':False,'globalInjectivityChecked':False,'selfCollisionChecked':False,'adoptableCreasePattern':False,'exactStraightCreaseFOLD':False},'sample':{'rows':rows},'grid':grid}
 if 'ndsolveOptions' in q:
  steps=lambda sol:0 if sol is None else len(sol.t)-1
  parameters=lambda sol:[kernel.ui] if sol is None else sol.t.tolist()
  result['diagnostics']['integration']['stepOptions']={
   'optionSource':'Options[NDSolve]/FilterRules/recovery','definitionCell':cells[-1],
   'options':q['ndsolveOptions'],'effectiveMaxStepSize':q['ndsolveOptions'].get('MaxStepSize',(kernel.b-kernel.a)/16),
   'backwardSteps':steps(kernel.backward),'forwardSteps':steps(kernel.forward),
   'backwardParameters':parameters(kernel.backward),'forwardParameters':parameters(kernel.forward),
   'counting':'accepted-DOP853-steps/shared-backward-forward','rhsEvaluationBudget':24000,'sourceInputsPreserved':True,
   'originalAutomaticDefaultsReproduced':False,'wolframStepControllerReproduced':False,'workingPrecisionReproduced':False,'errorGoalNormReproduced':False}
 def check(value):
  if value is None or isinstance(value,(str,bool)):return
  if isinstance(value,dict):
   for x in value.values():check(x)
  elif isinstance(value,list):
   for x in value:check(x)
  elif not math.isfinite(value):raise SystemHelperError('non-finite','原公共系统输出包含非有限数值。')
 check(result);return result
