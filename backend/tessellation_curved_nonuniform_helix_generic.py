"""Literal In3959 helix rules and the separate In3966 planar wrapper.

The closed directions are not replaced by the Space4 Sign/Abs branch. A
valid spatial rule result survives a singular/unknown original planar frame.
"""
import math
import ast
import sympy as sp
from functools import lru_cache
import numpy as np

from tessellation_curved_generic_darboux import (
    DarbouxKernel, GenericDarbouxError, IntervalTaylor, Taylor, Expression,
    values, dot, cross, magnitude, times, ROUNDING,
)
from tessellation_curved_linked_common_interval import Interval,down,up
from tessellation_curved_fold_flatten_generic import FoldFlattenKernel, _result as flattened_result
from tessellation_curved_matched_pair_query import symbolic_node,simplified,algebraic_budget
from tessellation_curved_generic_linked_expression import GenericLinkedError

FAMILY='nonuniform-helix-generic-native'
RESULT_FAMILY='origamica-generic-nonuniform-helix'
CERTIFICATION_BUDGET=1023
PRESET=dict(family=FAMILY,radius=1.,pitchAngle=math.pi/6,foldAngle='pi/3+s/3',
            parameterStart=0.,parameterEnd=math.pi,transverseStart=0.,transverseEnd=.2,segments=48,rulingSegments=16)

class GenericNonuniformHelixError(GenericDarbouxError):pass

class HelixAngleExpression(Expression):
 """Enclose exact source pi/e leaves during interval proofs only."""
 def __call__(self,argument):
  if not isinstance(argument.value,Interval):return super().__call__(argument)
  def visit(node):
   if isinstance(node,ast.Constant):return argument.constant(float(node.value),argument.order)
   if isinstance(node,ast.Name):
    if node.id=='s':return argument
    x=math.pi if node.id=='pi' else math.e
    return argument.constant(Interval(down(x),up(x)),argument.order)
   if isinstance(node,ast.UnaryOp):
    value=visit(node.operand);return -value if isinstance(node.op,ast.USub) else value
   if isinstance(node,ast.BinOp):
    a=visit(node.left)
    if isinstance(node.op,ast.Pow):return a**self._integer(node.right)
    b=visit(node.right)
    if isinstance(node.op,ast.Add):return a+b
    if isinstance(node.op,ast.Sub):return a-b
    if isinstance(node.op,ast.Mult):return a*b
    return a/b
   a=visit(node.args[0]);name=node.func.id
   return a.sincos()[0] if name=='sin' else a.sincos()[1] if name=='cos' else getattr(a,name)()
  return visit(self.tree)

 def constant_half_angle_zero_identity(self):
  try:
   if algebraic_budget(self.tree)>24:return False
   s=sp.Symbol('s',real=True);gamma=symbolic_node(self.tree,s)
   return simplified(sp.diff(gamma,s))==0 and simplified(sp.sin(gamma/2))==0
  except (ValueError,TypeError,RecursionError,ZeroDivisionError,OverflowError,NotImplementedError):return False

def validate_generic_nonuniform_helix_query(data):
 if not isinstance(data,dict) or set(data)!=set(PRESET) or data.get('family')!=FAMILY:
  raise GenericNonuniformHelixError('input-contract','需完整原r、θ、γ(s)、s/w域和密度；未知字段不接受。')
 q=dict(data)
 try:Expression(q['foldAngle'],'s')
 except GenericLinkedError as exc:raise GenericNonuniformHelixError('expression-contract','原γ(s)须为安全标量表达式；不允许代码、属性或未知函数。') from exc
 for key in ('radius','pitchAngle','parameterStart','parameterEnd','transverseStart','transverseEnd'):
  if type(q[key]) not in (int,float) or not math.isfinite(q[key]):
   raise GenericNonuniformHelixError('input-contract','原r、θ与所有域端点须为有限实数。')
  q[key]=float(q[key])
 if abs(q['radius'])>1e6 or abs(q['pitchAngle'])>10:
  raise GenericNonuniformHelixError('input-contract','有限预算为|r|≤10⁶、|θ|≤10弧度；原r可为0或负数。')
 a,b=q['parameterStart'],q['parameterEnd']
 if not -10<=a<b<=10 or not .01<=b-a<=12:
  raise GenericNonuniformHelixError('input-contract','s域须在−10…10内且跨度0.01–12。')
 if not -1e6<=q['transverseStart']<q['transverseEnd']<=1e6:
  raise GenericNonuniformHelixError('input-contract','完整w域须递增且在±10⁶内。')
 for key,lo,hi in [('segments',8,128),('rulingSegments',2,64)]:
  if type(q[key]) is not int or not lo<=q[key]<=hi:
   raise GenericNonuniformHelixError('input-contract','显示密度须为8–128纵向段、2–64横向段。')
 return q

def lower_abs(x):
 x=Interval.cast(x);return 0. if x.lo<=0<=x.hi else min(abs(x.lo),abs(x.hi))

def fixed_sign(x):
 x=Interval.cast(x)
 if x.lo>0:return 1
 if x.hi<0:return -1
 raise ValueError('original helix planar transverse factor crosses zero')

class HelixPlanarRecovery(DarbouxKernel):
 def __init__(self,owner,side):
  self.owner,self.side=owner,side;self.query={**owner.query,'sigma':1}
  self.ui,self.scale=owner.ui,owner.scale;self.flatten,self.dimension,self.analytic=True,2,True
  self.source_origin,self.target_origin=owner.source_origin,np.asarray([1.,0.])
  self.initial_tangent,self.initial_left,self.initial_normal=np.asarray([0.,1.]),np.asarray([-1.,0.]),None
  self.initial_state=np.asarray([0.,0.,0.,1.,-1.,0.]);self.forward=self.backward=None;self.integration_calls=0
 def finite_point(self,s):return self.owner.finite(float(s))[0 if self.side=='left' else 1]

class GenericHelixKernel:
 def __init__(self,q):
  self.original_query=q;self.query={**q,'initialParameter':q['parameterStart'],'initialPoint':[1.,0.],'initialTangent':[0.,1.]}
  self.ui=q['parameterStart'];self.angle=HelixAngleExpression(q['foldAngle'],'s')
  self.c,self.a=math.cos(q['pitchAngle']),math.sin(q['pitchAngle'])
  if self.c==0:raise GenericNonuniformHelixError('helix-tangent-pole','原tan(θ)在给定θ不可有限求值。')
  self.slope=math.tan(q['pitchAngle']);r=q['radius']
  if self.a==0 and self.angle.constant_half_angle_zero_identity():
   raise GenericNonuniformHelixError('helix-rule-singularity','原γ常量的sin(γ/2)恒为0且θ=0，使In3959两个平方根分母恒为0；不以π的数值舍入伪造母线。')
  self.source_origin=np.asarray([r*math.cos(self.ui),r*math.sin(self.ui),r*self.slope*self.ui])
  self.scale=max(abs(r/self.c)*(q['parameterEnd']-q['parameterStart']),abs(q['transverseStart']),abs(q['transverseEnd']))
  if not math.isfinite(self.scale) or self.scale<=0 or not np.all(np.isfinite(self.source_origin)):
   raise GenericNonuniformHelixError('source-numerics','原螺旋没有可用的有限局部几何尺度。')
  self.left,self.right=HelixPlanarRecovery(self,'left'),HelixPlanarRecovery(self,'right')
  self.shared_analytic=True

 def raw(self,argument):
  t=(IntervalTaylor if isinstance(argument,Interval) else Taylor).variable(argument,4)
  sn,cs=t.sincos();gamma=self.angle(t);gp=gamma.derivative();sg,cg=gamma.sincos();half_sine,half_cosine=(gamma/2).sincos()
  c,a,r=self.c,self.a,self.query['radius'];zero=t*0
  # Original SqrtBox is exactly this sum of squares. Its zeros are retained.
  dl=((2*a+gp)**2+4*c*c*half_sine**2).sqrt();dr=((2*a-gp)**2+4*c*c*half_sine**2).sqrt()
  base=[r*(cs-math.cos(self.ui))/self.scale,r*(sn-math.sin(self.ui))/self.scale,r*self.slope*(t-self.ui)/self.scale]
  z=2*c*c*half_sine**2+2*a*a
  left=[-c*((1+cg)*a*sn+cs*sg+sn*gp)/dl,
        c*(cs*(1+cg)*a-sn*sg+cs*gp)/dl,(z+a*gp)/dl]
  right=[c*(-(1+cg)*a*sn+cs*sg+sn*gp)/dr,
         c*(cs*(1+cg)*a+sn*sg-cs*gp)/dr,(z-a*gp)/dr]
  normalized=[times(d,1/self.scale) for d in (left,right)]
  return dict(b=base,bp=[x.derivative() for x in base],directors=normalized,
              directorPrimes=[[x.derivative() for x in d] for d in normalized],gamma=gamma,gammaPrime=gp,
              leftDenominator=dl,rightDenominator=dr,halfSine=half_sine,halfCosine=half_cosine,
              radialNormal=[-cs,-sn,zero],pitchTangent=[-c*sn,c*cs,zero+a],pitchBinormal=[a*sn,-a*cs,zero+c])

 @lru_cache(maxsize=8192)
 def raw_finite(self,s):
  try:
   p=self.raw(float(s))
   data=[*p['b'],*p['bp'],*p['directors'][0],*p['directors'][1],*p['directorPrimes'][0],*p['directorPrimes'][1],p['gamma'],p['gammaPrime']]
   if not all(math.isfinite(float(x.value)) for x in data):raise ValueError('nonfinite helix rule')
   return p
  except (ValueError,ZeroDivisionError,OverflowError,GenericLinkedError) as exc:
   raise GenericNonuniformHelixError('helix-rule-singularity',f'In3959原螺旋在s={s:.17g}的γ源、平方根分母或导数不可有限求值；不换符号分支。') from exc

 def points(self,argument):
  p=self.raw(argument);c,a,r=self.c,self.a,self.query['radius']
  if r==0:raise ValueError('original NFlattenFold2D source speed is zero')
  sn,cs=p['halfSine'],p['halfCosine'];sign=fixed_sign(c*sn.value);orientation=1 if r*c>0 else -1
  tangent=times(p['pitchTangent'],orientation);tprime=[x.derivative() for x in tangent]
  speed=abs(r/c)/self.scale;result=[]
  for i,right in enumerate((False,True)):
   l=times([cs*n+(-sn if right else sn)*b for n,b in zip(p['radialNormal'],p['pitchBinormal'])],sign)
   u=cross(tangent,l);den=p['rightDenominator' if right else 'leftDenominator'];gp=p['gammaPrime']
   along=orientation*(2*a+(-gp if right else gp))/den/self.scale
   transverse=(-1 if right else 1)*2*sign*c*sn/den/self.scale
   g=dot(l,tprime);zero=g*0
   result.append(dict(b=p['b'],bp=p['bp'],v=zero+speed,T=tangent,L=l,U=u,d=p['directors'][i],dp=p['directorPrimes'][i],
                      p=along,q=transverse,g=g,h=zero,z=zero,transverse=transverse*(-1 if right else 1),
                      directorLength=zero+1/self.scale,denominator=den,halfAngleFactor=sn))
  return tuple(result)

 @lru_cache(maxsize=8192)
 def finite(self,s):
  try:return self.points(float(s))
  except (ValueError,ZeroDivisionError,OverflowError) as exc:
   raise GenericNonuniformHelixError('helix-planar-frame',f'In3966/NFlattenFold2D在s={s:.17g}的源速度或Normalize(T×D)帧退化；原In3959空间规则仍保留。') from exc

 target=FoldFlattenKernel.target
 jacobians=FoldFlattenKernel.jacobians

 def source_cell(self,a,b):
  p=self.raw(Interval(a,b));bounds={k:Interval.cast(p[k].value).lo for k in ('leftDenominator','rightDenominator')}
  if min(bounds.values())<=0:raise ValueError('original square-root denominator unresolved')
  fields=['b','bp'];rows=[p[k] for k in fields]+p['directors']+p['directorPrimes']
  if not all(math.isfinite(Interval.cast(x.value).lo+Interval.cast(x.value).hi) for row in rows for x in row):raise ValueError('nonfinite source interval')
  rule_bounds=[[[Interval.cast(x.value).lo,Interval.cast(x.value).hi] for x in row] for row in [p['b'],*p['directors']]]
  return dict(start=a,end=b,leftDenominatorLowerBound=bounds['leftDenominator'],rightDenominatorLowerBound=bounds['rightDenominator'],
              normalizedRuleBounds=rule_bounds,halfAngleFactorBounds=[Interval.cast(p['halfSine'].value).lo,Interval.cast(p['halfSine'].value).hi])

 def source_domain(self):
  cells=[];unresolved=[];count=0;stack=[(self.query['parameterStart'],self.query['parameterEnd'],0)]
  while stack:
   a,b,depth=stack.pop();count+=1
   if count>CERTIFICATION_BUDGET:unresolved.extend([[a,b]]+[[x,y] for x,y,_ in stack]);break
   try:cells.append(self.source_cell(a,b))
   except (ValueError,ZeroDivisionError,OverflowError,GenericLinkedError):
    self.raw_finite((a+b)/2)
    if depth>=20 or b-a<1e-10:unresolved.append([a,b])
    else:m=(a+b)/2;stack.extend(((m,b,depth+1),(a,m,depth+1)))
  cells.sort(key=lambda x:x['start']);unresolved.sort();complete=not unresolved
  return dict(certified=complete,evaluations=min(count,CERTIFICATION_BUDGET+1),verifiedCells=len(cells),cells=cells,unresolved=unresolved,
              minimumLeftDenominatorLowerBound=min((x['leftDenominatorLowerBound'] for x in cells),default=0.) if complete else None,
              minimumRightDenominatorLowerBound=min((x['rightDenominatorLowerBound'] for x in cells),default=0.) if complete else None,
              roundingModel=ROUNDING,reason=None if complete else 'literal helix rule interval budget unresolved; complete original domain retained')

 def cell(self,a,b):
  left,right=self.points(Interval(a,b));bounds=[Interval.cast(left['v'].value).lo,Interval.cast(left['transverse'].value).lo,Interval.cast(right['transverse'].value).lo]
  if min(bounds)<=0:raise ValueError('original planar frame unresolved')
  js=self.jacobians(left,right,Interval(self.query['transverseStart'],self.query['transverseEnd']))
  if not all(math.isfinite(j.lo+j.hi) for j in js.values()):raise ValueError('nonfinite planar strip interval')
  return dict(start=a,end=b,speedLowerBound=bounds[0],leftTransverseLowerBound=bounds[1],rightTransverseLowerBound=bounds[2],
              leftDirectorLengthLowerBound=1/self.scale,rightDirectorLengthLowerBound=1/self.scale,
              **{k+'NormalizedJacobianBounds':[v.lo,v.hi] for k,v in js.items()})

 domain=FoldFlattenKernel.domain
 row=FoldFlattenKernel.row

def _metric(bp,d,dp,w):
 v=bp+w*dp;return [float(v@v),float(v@d),float(d@d)]

def query_generic_nonuniform_helix(data):
 q=validate_generic_nonuniform_helix_query(data);kernel=GenericHelixKernel(q);domain=kernel.source_domain()
 nodes=np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1);ws=np.linspace(q['transverseStart'],q['transverseEnd'],q['rulingSegments']+1)
 rows=[];grid=[];unit=develop=0.
 for s in sorted(set(nodes)|set(np.linspace(q['parameterStart'],q['parameterEnd'],129))):
  p=kernel.raw_finite(float(s));bp=values(p['bp'])
  for d,dp in zip(p['directors'],p['directorPrimes']):
   d,dp=values(d),values(dp);unit=max(unit,abs(math.hypot(*d)*kernel.scale-1))
   den=math.hypot(*bp)*math.hypot(*d)*math.hypot(*dp)
   residual=abs(float(np.dot(np.cross(bp,d),dp)))/den if den else 0.
   develop=max(develop,residual)
 for s in nodes:
  p=kernel.raw_finite(float(s));row=dict(s=float(s),foldAngleRad=float(p['gamma'].value),foldAngleDerivative=float(p['gammaPrime'].value),
      leftDenominator=float(p['leftDenominator'].value),rightDenominator=float(p['rightDenominator'].value))
  for suffix,jets,origin in [('Base',p['b'],kernel.source_origin),('BaseDerivative',p['bp'],0),
      ('LeftDirector',p['directors'][0],0),('RightDirector',p['directors'][1],0),
      ('LeftDirectorDerivative',p['directorPrimes'][0],0),('RightDirectorDerivative',p['directorPrimes'][1],0)]:
   normalized=values(jets);row['source'+suffix]=(normalized*kernel.scale+origin).tolist();row['normalizedSource'+suffix]=normalized.tolist()
  rows.append(row);entry=dict(s=float(s))
  for i,side in enumerate(('Left','Right')):
   bp,d,dp=values(p['bp']),values(p['directors'][i]),values(p['directorPrimes'][i]);points=[(values(p['b'])+w*d).tolist() for w in ws]
   entry['normalizedSource'+side]=points;entry['source'+side]=[(np.asarray(x)*kernel.scale+kernel.source_origin).tolist() for x in points]
   entry['source'+side+'EFG']=[_metric(bp,d,dp,w) for w in ws]
  grid.append(entry)
 initial=dict(parameter=kernel.ui,point=[1.,0.],tangent=[0.,1.],argumentOrder=['ui','fi','ti'])
 flattening=dict(status='unknown',stage='NFlattenFold2D/In[3935]',initial=initial,
                 reason='original planar frame not certified on complete domain; spatial rules retained',result=None)
 # A full-domain frame proof precedes the ODE. No integration across an
 # unresolved half-angle zero, and no sign choice from a finite sample list.
 planar_allowed=domain['certified'] and q['radius']!=0 and all(lower_abs(Interval(*c['halfAngleFactorBounds']))>0 for c in domain['cells'])
 if q['radius']==0:
  flattening.update(status='source-singularity',reason='original NFlattenFold2D source speed is zero for r=0; spatial rules retained')
 elif any(row['foldAngleRad']==0 for row in rows):
  flattening.update(status='source-singularity',reason='original Normalize(T cross D) frame vanishes at gamma=0; spatial rules retained')
 if planar_allowed:
  try:
   fd=kernel.domain();kernel.left.integrate();fr=flattened_result(kernel,fd)
   payload={k:fr[k] for k in ('normalization','diagnostics','certification','domain','sample','grid')}
   # E/F/G have distinct units. A large E cannot hide a wrong small G.
   differences={'left':0.,'right':0.}
   audit_ws=sorted(set(ws)|{(q['transverseStart']+q['transverseEnd'])/2})
   for s in sorted(set(nodes)|set(np.linspace(q['parameterStart'],q['parameterEnd'],129))):
    l,r=kernel.finite(float(s));target=kernel.target(float(s),l,r)
    for side,frame in (('left',l),('right',r)):
     for w in audit_ws:
      sm=np.asarray(_metric(values(frame['bp']),values(frame['d']),values(frame['dp']),w))
      tm=np.asarray(_metric(target[side]['bp'],target[side]['d'],target[side]['dp'],w))
      e,g=max(sm[0],tm[0]),max(sm[2],tm[2]);natural=np.asarray([e,math.sqrt(e)*math.sqrt(g),g])
      differences[side]=max(differences[side],float(np.max(np.abs(sm-tm)/np.maximum(natural,np.finfo(float).tiny))))
   for side in ('left','right'):
    payload['diagnostics']['maximum'+side.title()+'RelativeMetricDifference']=differences[side]
    payload['certification']['finite'+side.title()+'MetricVerified']=differences[side]<=2e-8
   # Analytic evidence is the independently derived literal helix frame,
   # not the generic symbolic identity label of the shared result builder.
   for key in ('leftSourceDevelopability','rightSourceDevelopability'):
    payload['diagnostics'][key]['method']='literal-helix-closed-rule-triple-product'
   payload['diagnostics']['sharedGeodesicCurvature']['method']='literal-helix-original-normalized-cross-frame'
   flattening.update(status='computed',reason=None,result=payload)
  except GenericDarbouxError as exc:
   flattening.update(status='integration-failed',reason=str(exc))
  except (ValueError,ZeroDivisionError,OverflowError) as exc:
   flattening.update(status='integration-failed',reason='original planar wrapper could not complete; spatial rules retained: '+str(exc))
 return dict(family=RESULT_FAMILY,query=q,source=dict(functions=['CurvedFoldHelix3D','NCurvedFoldHelix3D','NCurvedFoldHelix2D'],
       definitionCells=['In[3959]','In[3963]','In[3966]'],argumentOrder=['r','theta','gamma'],
       rulingConstruction='literal In3959 square-root closed directions; no Space4 Sign/Abs substitution',
       flatteningFunctions=['NFlattenFold2D'],flatteningDefinitionCells=['In[3935]'],
       interpolationReproduced=False,wolframOptionsReproduced=False,symbolicSolverReproduced=False,metricConvention='normalized-s/world-w'),
       normalization=dict(sourceOrigin=kernel.source_origin.tolist(),targetOrigin=[1.,0.],scale=kernel.scale),domain=domain,
       sample=dict(rows=rows),grid=grid,flattening=flattening,
       diagnostics=dict(validationNodes=129,maximumUnitRulingResidual=unit,maximumRelativeDevelopabilityResidual=develop),
       certification=dict(literalSpatialRulesEvaluated=True,sourceRulesCertified=domain['certified'],
          finiteUnitRulingsVerified=unit<=2e-9,finiteDevelopabilityVerified=develop<=2e-9,
          unitRulingsAnalytic=domain['certified'],developabilityAnalytic=domain['certified'],
          sourceStripRegularityChecked=flattening['status']=='computed',
          integrationErrorIntervalCertified=False,globalInjectivityChecked=False,selfCollisionChecked=False,
          exactStraightCreaseFOLD=False,adoptableCreasePattern=False))
