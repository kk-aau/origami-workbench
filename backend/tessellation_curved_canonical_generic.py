"""Bounded literal Canonical*DevelopableSystem native scalar sources.

The four original rules are three dimensional. Arc-length quadrature has no
interval trajectory certificate; nondevelopable literal outputs remain read
only. Identity branch selection is never a near-zero sampling decision.
"""
import ast
import math
from functools import lru_cache
import numpy as np
import sympy as sp
from scipy.integrate import solve_ivp
from tessellation_curved_generic_linked_expression import Expression,GenericLinkedError,Taylor
from tessellation_curved_generic_darboux import IntervalTaylor,ROUNDING,dot,cross,times,values
from tessellation_curved_linked_common_interval import Interval,down,up
from tessellation_curved_matched_pair_query import symbolic_node,simplified,algebraic_budget,invariant_expression

FAMILY='canonical-developable-native'
RESULT_FAMILY='origamica-generic-canonical'
OPERATIONS=('cylinder','cone','tangent','general')
CELLS={'cylinder':'In[3825]','cone':'In[3829]','tangent':'In[3832]','general':'In[3836]'}
FUNCTIONS={'cylinder':'CanonicalCylinderDevelopableSystem','cone':'CanonicalConeDevelopableSystem','tangent':'CanonicalTangentDevelopableSystem','general':'CanonicalDevelopableSystem'}
CERTIFICATION_BUDGET=1023
INTEGRATION_BUDGET=24000
PRESETS={
 'cylinder':dict(baseCurve=['cos(s)','sin(s)','2*s'],director=['0','0','2'],parameterStart=-math.pi/4,parameterEnd=3*math.pi/4,rulingStart=0.,rulingEnd=1.,crossParameterStart=0.,crossParameterEnd=1.),
 'cone':dict(baseCurve=['0','0','.5'],director=['sqrt(3)','sin(s)','-cos(s)'],parameterStart=0.,parameterEnd=math.pi,rulingStart=0.,rulingEnd=1.,crossParameterStart=0.,crossParameterEnd=1.),
 'tangent':dict(baseCurve=['sqrt(3)/2*cos(s)','sqrt(3)/2*sin(s)','.5*s'],parameterStart=0.,parameterEnd=math.pi,rulingStart=-.5,rulingEnd=.5,crossParameterStart=0.,crossParameterEnd=math.pi),
 'general':dict(baseCurve=['sqrt(3)/2*(cos(s)-s*sin(s))','sqrt(3)/2*(sin(s)+s*cos(s))','s'],director=['-sqrt(3)/2*sin(s)','sqrt(3)/2*cos(s)','.5'],parameterStart=0.,parameterEnd=math.pi,rulingStart=-.5,rulingEnd=.5,crossParameterStart=0.,crossParameterEnd=math.pi)}
PRESETS={k:dict(v,family=FAMILY,operation=k,segments=32,rulingSegments=8) for k,v in PRESETS.items()}

class GenericCanonicalError(GenericLinkedError):pass

def validate_generic_canonical_query(data):
 if not isinstance(data,dict) or data.get('family')!=FAMILY or data.get('operation') not in OPERATIONS:raise GenericCanonicalError('input-contract','请选择原规范柱／锥／切线／一般构造。')
 operation=data['operation'];keys=set(PRESETS[operation])
 if set(data)!=keys:raise GenericCanonicalError('input-contract','需完整原来源及两个独立v域；切线构造不接受额外director。')
 q=dict(data)
 for key in ('baseCurve',)+(() if operation=='tangent' else ('director',)):
  row=q[key]
  if not isinstance(row,list) or len(row)!=3:raise GenericCanonicalError('input-contract','原三维函数须有三个安全标量表达式。')
  expressions=[Expression(x,'s') for x in row];q[key]=row.copy()
  if key=='director' and operation=='cylinder' and any(any(isinstance(n,ast.Name) and n.id=='s' for n in ast.walk(f.tree)) for f in expressions):raise GenericCanonicalError('constant-director-contract','原柱面SlotCount(ddf)=0：母线源不得含s，即使幅度恒向或表达式可抵消。')
 for key in ('parameterStart','parameterEnd','rulingStart','rulingEnd','crossParameterStart','crossParameterEnd'):
  value=q[key]
  if type(value) not in (float,int) or not math.isfinite(value):raise GenericCanonicalError('input-contract','原参数域须为有限实数。')
  q[key]=float(value)
 for begin,end in [('parameterStart','parameterEnd'),('crossParameterStart','crossParameterEnd')]:
  if not -10<=q[begin]<q[end]<=10 or not .01<=q[end]-q[begin]<=12:raise GenericCanonicalError('input-contract','两个参数域须各在−10…10内且长度0.01–12。')
 if not -1e6<=q['rulingStart']<q['rulingEnd']<=1e6:raise GenericCanonicalError('input-contract','普通母线长度域须递增并位于±10⁶。')
 for key,lo,hi in [('segments',8,128),('rulingSegments',2,32)]:
  if type(q[key]) is not int or not lo<=q[key]<=hi:raise GenericCanonicalError('input-contract','显示密度超出有限预算。')
 return q

def _zero_identity(expressions):
 try:
  if sum(sp.count_ops(x) for x in expressions)>900:return False
  return all(simplified(x)==0 for x in expressions)
 except (ValueError,TypeError,sp.PolynomialError,NotImplementedError,RecursionError):return False

def _norm_bounds(vector):
 """Euclidean interval norm, including genuine zero; never sqrt(x*x) hull."""
 components=[Interval.cast(v) for v in vector]
 lows=[0. if v.lo<=0<=v.hi else min(abs(v.lo),abs(v.hi)) for v in components]
 highs=[max(abs(v.lo),abs(v.hi)) for v in components]
 return Interval(max(0.,down(math.hypot(*lows))),up(math.hypot(*highs)))

def _status(zero,nonzero=False):return {'status':'zero' if zero else 'nonzero' if nonzero else 'unknown','analyticIdentity':zero,'method':'bounded-safe-symbolic-identity' if zero else 'outward-singleton-witness' if nonzero else 'identity-budget-unresolved'}

class CanonicalKernel:
 def __init__(self,q):
  self.q=q;self.operation=q['operation'];self.base=[Expression(x,'s') for x in q['baseCurve']];self.raw_director=[] if self.operation=='tangent' else [Expression(x,'s') for x in q['director']]
  self.anchor=q['parameterStart'];self.parts=[f.affine_parts(Taylor.variable(self.anchor,3)) for f in self.base]
  self.raw_origin=np.asarray([math.fsum(c)+d.value for c,d in self.parts])
  sample=np.linspace(q['parameterStart'],q['parameterEnd'],17)
  velocities=[math.hypot(*(f.affine_parts(Taylor.variable(float(s),1))[1].c[1] for f in self.base)) for s in sample]
  directors=[math.hypot(*(f(Taylor.variable(float(s),1)).value for f in self.raw_director)) for s in sample] if self.raw_director else velocities
  self.dscale=max(directors)
  if not math.isfinite(self.dscale) or self.dscale<=0:raise GenericCanonicalError('director-singularity','原母线或切线速度为零，无法单位化。')
  self.scale=max(max(velocities)*(q['parameterEnd']-q['parameterStart']),self.dscale,abs(q['rulingStart']),abs(q['rulingEnd']))
  if not math.isfinite(self.scale) or self.scale<=0:raise GenericCanonicalError('source-domain','源几何尺度超出有限数值域。')
  self.symbolic=None;self.symbolic_new=None;self.speed_squared=None;self.dprime_squared=None;self.dprime_zero=False;self.canonical_base_zero=False;self.constant_direction=False;self.cylinder_proof=_status(self.operation=='cylinder');self.apex_proof=_status(False);self.developability_proof=_status(self.operation in ('cylinder','tangent'));self.tangent_proof=_status(self.operation=='tangent')
  self._symbolic()
  if self.symbolic is not None and _zero_identity(self.symbolic[1]):raise GenericCanonicalError('director-singularity','原母线或切线速度被有界代数恒等证明为零，不能用浮点残差单位化。')
  if self.operation in ('cylinder','tangent'):self.developability_proof['method']='literal-construction-identity'
  if self.operation=='cylinder':self.cylinder_proof['method']='source-constant-AST'
  if self.operation=='tangent':self.tangent_proof['method']='literal-derivative-normalization'
  if self.operation=='general':
   zero=self.symbolic is not None and _zero_identity(cross(self.symbolic[1],[sp.diff(x,self.symbolic[2]) for x in self.symbolic[1]]))
   self.constant_direction=zero
   self.cylinder_proof=_status(zero,not zero and self._witness('direction'))
   if self.cylinder_proof['status']=='unknown':raise GenericCanonicalError('branch-unknown','无法证明单位母线D′恒等零或非恒等零；不凭近零采样猜分支。')
   self.branch='cylinder' if zero else 'tangent'
  else:self.branch=self.operation;self.constant_direction=self.operation=='cylinder'
  self.beta_anchor=None;self.canonical_origin=self.raw_origin.copy()
  first=self._raw(self.anchor)
  if self.branch=='cylinder':
   director=values(first['d']);self.canonical_origin=self.raw_origin-float(self.raw_origin@director)*director
  elif self.operation=='general':
   beta=self._beta(first).value;self.beta_anchor=beta*values(first['d']);self.canonical_origin=self.raw_origin-self.scale*self.beta_anchor
  self._canonical_symbolic()
  if self.operation=='tangent':self.tangent_proof['method']='literal-derivative-normalization'
  if self.operation=='general' and self.branch!='cylinder':
   zero=self.symbolic_new is not None and _zero_identity([sp.diff(x,self.symbolic[2]) for x in self.symbolic_new])
   self.apex_proof=_status(zero,not zero and self._witness('base'))
   if self.apex_proof['status']=='unknown':raise GenericCanonicalError('branch-unknown','无法证明规范基线B′恒等零或非恒等零；不凭近零采样猜锥／切线分支。')
   if zero:self.branch='cone';self.tangent_proof=dict(status='not-applicable',analyticIdentity=False,method='constant-apex-branch')
  elif self.operation=='cone':
   zero=self.symbolic is not None and _zero_identity([sp.diff(x,self.symbolic[2]) for x in self.symbolic[0]])
   self.apex_proof=_status(zero,not zero and self._witness('base'))
  self.arc_required=self.branch=='tangent'
  self.arc_solution=None;self.arc_scale=None;self.integration_calls=0

 def _symbolic(self):
  try:
   sources=self.base+self.raw_director
   if sum(len(list(ast.walk(f.tree))) for f in sources)>576 or any(algebraic_budget(f.tree)>32 for f in sources):return
   s=sp.Symbol('s',real=True);b=[symbolic_node(f.tree,s) for f in self.base];d=[symbolic_node(f.tree,s) for f in self.raw_director]
   if not d:d=[sp.diff(x,s) for x in b]
   self.symbolic=(b,d,s)
   bp,dp=[sp.diff(x,s) for x in b],[sp.diff(x,s) for x in d]
   zero=self.operation in ('cylinder','tangent') or _zero_identity([dot(cross(bp,d),dp)])
   self.developability_proof=_status(zero)
  except (ValueError,TypeError,sp.PolynomialError,NotImplementedError,RecursionError):pass

 def _canonical_symbolic(self):
  if self.symbolic is None:return
  try:
   b,raw,s=self.symbolic
   if self.constant_direction:
    # Constant direction follows an exact identity and nonzero normalization;
    # this anchor constant is used only for proving zero derivatives.
    raw=[x.subs(s,sp.Rational(str(self.anchor))) for x in raw]
   n=simplified(dot(raw,raw));d=[simplified(x/sp.sqrt(n)) for x in raw]
   if self.branch=='cylinder':new=[simplified(x-dot(b,d)*y) for x,y in zip(b,d)]
   elif self.operation=='general':
    bp,dp=[sp.diff(x,s) for x in b],[sp.diff(x,s) for x in d];beta=simplified(dot(bp,dp)/dot(dp,dp));new=[simplified(x-beta*y) for x,y in zip(b,d)]
   else:new=b
   self.symbolic_new=new
   self.canonical_base_zero=_zero_identity([sp.diff(x,s) for x in new]);self.dprime_zero=_zero_identity([sp.diff(x,s) for x in d])
   self.speed_squared=invariant_expression(simplified(dot([sp.diff(x,s) for x in new],[sp.diff(x,s) for x in new])))
   self.dprime_squared=invariant_expression(simplified(dot([sp.diff(x,s) for x in d],[sp.diff(x,s) for x in d])))
   if self.branch=='tangent':self.tangent_proof=_status(self.operation=='tangent' or _zero_identity(cross([sp.diff(x,s) for x in new],d)))
  except (ValueError,TypeError,ZeroDivisionError,sp.PolynomialError,NotImplementedError,RecursionError):pass

 def _coordinates(self,t):
  result=[]
  for f,(co,dy) in zip(self.base,self.parts):
   c,d=f.affine_parts(t);result.append((d-dy.value+math.fsum(c+[-x for x in co]))/self.scale)
  return result

 def _raw(self,s):
  t=(IntervalTaylor if isinstance(s,Interval) else Taylor).variable(s,3);b=self._coordinates(t)
  raw=[f(t)/self.dscale for f in self.raw_director] if self.raw_director else [x.derivative()*(self.scale/self.dscale) for x in b]
  norm=dot(raw,raw).sqrt();d=times(raw,1/norm)
  c=cross(raw,[x.derivative() for x in raw]);q=times(cross(raw,c),-1)
  # r'/|r| - r(r.r')/|r|^3 loses tiny transverse derivatives when
  # |r| varies. Q=-r×(r×r') is the exact same numerator without the
  # subtraction of two large parallel vectors.
  if self.constant_direction:d=[Taylor.constant(x.value,x.order) for x in d]
  else:
   dp=times(q,1/(norm**3));d=[Taylor([x.value]+[v/(j+1) for j,v in enumerate(y.c)]) for x,y in zip(d,dp)]
  return dict(b=b,rawD=raw,d=d,rawLength=norm*self.dscale,rawCross=c,rawQ=q,rawNorm=norm)

 def _beta(self,p):return dot([x.derivative() for x in p['b']],p['rawQ'])*p['rawNorm']/dot(p['rawCross'],p['rawCross'])

 def point(self,s):
  p=self._raw(s);b,d=p['b'],p['d']
  if self.branch=='cylinder':new=[x-dot(b,d)*y for x,y in zip(b,d)]
  elif self.operation=='general':
   beta=self._beta(p);new=[x-beta*y+offset for x,y,offset in zip(b,d,self.beta_anchor)]
  else:new=b
  p.update(canonicalB=new,bp=[x.derivative() for x in new],dp=[x.derivative() for x in d])
  return p

 @lru_cache(maxsize=8192)
 def finite(self,s):
  try:return self.point(float(s))
  except (ValueError,ZeroDivisionError,OverflowError) as exc:raise GenericCanonicalError('source-singularity',f'原规范公式在s={s:.12g}未定义；保留原域并拒绝，不替换零母线或D′分母。') from exc

 def _witness(self,what):
  for s in np.linspace(self.q['parameterStart'],self.q['parameterEnd'],9):
   try:
    p=self._raw(Interval(float(s))) if what=='direction' else self.point(Interval(float(s)))
    v=[x.derivative().value for x in p['d']] if what=='direction' else cross([x.value for x in p['bp']],[x.value for x in p['d']]) if what=='regression' else [x.value for x in p['bp']]
    if _norm_bounds(v).lo>0:return True
   except (ValueError,ZeroDivisionError,OverflowError):pass
  return False

 def arc_speed(self,s,interval=False):
  if self.operation=='tangent':
   t=(IntervalTaylor if interval else Taylor).variable(s,1);v=[x.derivative().value for x in self._coordinates(t)]
  else:v=[x.value for x in self.point(s)['bp']]
  return _norm_bounds(v) if interval else math.hypot(*v)

 def invariant_norm(self,expression,s,scale=1):
  if expression is None:return None
  try:
   squared=Interval.cast(expression(IntervalTaylor.variable(s,0)).value)
   if squared.hi<0:return None
   return Interval(max(0.,down(math.sqrt(max(0.,squared.lo))/scale)),up(math.sqrt(max(0.,squared.hi))/scale))
  except (ValueError,ZeroDivisionError,OverflowError):return None

 def domain(self):
  q=self.q;lo,hi=q['parameterStart'],q['parameterEnd'];arc_lo=min(lo,q['crossParameterStart']) if self.arc_required else lo;arc_hi=max(hi,q['crossParameterEnd']) if self.arc_required else hi
  stack=[(arc_lo,arc_hi)];cells=[];unresolved=[];evaluations=0
  while stack:
   a,b=stack.pop();evaluations+=1
   if evaluations>CERTIFICATION_BUDGET:unresolved.extend([(a,b),*stack]);break
   try:
    s=Interval(a,b);literal_arc=self.arc_speed(s,True) if self.arc_required else None
    # Tightened invariant bounds cannot erase a hole in the original AST.
    arc_speed=(self.invariant_norm(self.speed_squared,s,self.scale) or literal_arc) if self.arc_required else None
    # Tangent arc at v needs only |B′(v)|, not D(v); a zero speed there
    # defines A and is separately a singular CrossCurveSurface direction.
    ua,ub=max(a,lo),min(b,hi)
    p=self.point(Interval(ua,ub)) if ua<=ub else None
    if p is None:cell=dict(start=a,end=b,arcSpeedBounds=[arc_speed.lo,arc_speed.hi])
    else:
     bp,d,dp=[[x.value for x in p[k]] for k in ('bp','d','dp')];w=Interval(q['rulingStart']/self.scale,q['rulingEnd']/self.scale)
     area=_norm_bounds(cross([x+w*y for x,y in zip(bp,dp)],d));dprime=self.invariant_norm(self.dprime_squared,Interval(ua,ub)) or _norm_bounds(dp);speed=self.invariant_norm(self.speed_squared,Interval(ua,ub),self.scale) or _norm_bounds(bp)
     if self.branch=='cylinder':area=speed # Unit D constant, projected B′ perpendicular to D.
     elif self.tangent_proof['analyticIdentity'] or self.apex_proof['analyticIdentity']:
      wnorm=_norm_bounds([w]);area=Interval(max(0.,down(wnorm.lo*dprime.lo)),up(wnorm.hi*dprime.hi))
     cell=dict(start=a,end=b,areaBounds=[area.lo,area.hi],directorDerivativeBounds=[dprime.lo,dprime.hi],baseSpeedBounds=[speed.lo,speed.hi],arcSpeedBounds=None if arc_speed is None else [arc_speed.lo,arc_speed.hi])
    if any(not math.isfinite(x) for value in cell.values() if isinstance(value,list) for x in value):raise ValueError('nonfinite interval')
    cells.append(cell)
   except (ValueError,ZeroDivisionError,OverflowError):
    # A real midpoint failure remains a source error; an interval hull
    # straddling zero only exhausts a certificate and is not a proof of zero.
    mid=(a+b)/2
    if lo<=mid<=hi:self.finite(mid)
    if self.arc_required:self.arc_speed(mid)
    if b-a<(arc_hi-arc_lo)*2**-18:unresolved.append((a,b));continue
    stack.extend(((mid,b),(a,mid)))
  valid=not unresolved;area_cells=[c for c in cells if 'areaBounds' in c];arc_cells=[c for c in cells if c.get('arcSpeedBounds') is not None]
  area_min=min((c['areaBounds'][0] for c in area_cells),default=0.) if valid else None
  collapsed=self.dprime_zero and (self.canonical_base_zero or self.tangent_proof['analyticIdentity'])
  canonical_singular=collapsed or (self.branch=='cone' and self.apex_proof['analyticIdentity'] or self.tangent_proof['analyticIdentity']) and q['rulingStart']<=0<=q['rulingEnd']
  canonical_status='singular' if canonical_singular else 'verified' if valid and area_min>0 else 'unknown'
  cross_status=canonical_status if not self.arc_required and (q['crossParameterStart'],q['crossParameterEnd'])==(q['rulingStart'],q['rulingEnd']) else 'unknown'
  cross_lower=area_min if cross_status=='verified' else None
  if collapsed:cross_status='singular'
  if self.arc_required and self.tangent_proof['analyticIdentity'] and max(lo,q['crossParameterStart'])<=min(hi,q['crossParameterEnd']):cross_status='singular'
  elif self.arc_required and self.tangent_proof['analyticIdentity'] and valid:
   gap=max(q['crossParameterStart']-hi,lo-q['crossParameterEnd']);speed=min(c['arcSpeedBounds'][0] for c in arc_cells);director=min(c['directorDerivativeBounds'][0] for c in area_cells)
   if gap>0 and speed>0 and director>0:cross_lower=down(gap*speed*speed*director);cross_status='verified'
  return dict(certified=valid,roundingModel=ROUNDING,evaluations=min(evaluations,CERTIFICATION_BUDGET+1),verifiedCells=len(cells),cells=cells,unresolved=unresolved,
              reason=None if valid else 'complete source interval subdivision budget unresolved; original domains retained',
              canonicalRegularity=dict(status=canonical_status,minimumNormalizedJacobianLowerBound=area_min if canonical_status=='verified' else None),
              crossRegularity=dict(status=cross_status,minimumNormalizedJacobianLowerBound=cross_lower))

 def integrate_arc(self):
  if not self.arc_required:return
  q=self.q;lo=min(q['parameterStart'],q['crossParameterStart']);hi=max(q['parameterEnd'],q['crossParameterEnd'])
  self.arc_scale=max(self.arc_speed(float(s)) for s in np.linspace(lo,hi,17))*(hi-lo)
  if not math.isfinite(self.arc_scale) or self.arc_scale<=0:raise GenericCanonicalError('arc-singularity','原弧长速度没有可用有限尺度。')
  def rhs(s,_):
   self.integration_calls+=1
   if self.integration_calls>INTEGRATION_BUDGET:raise GenericCanonicalError('arc-budget','完整原弧长域超出数值积分预算；不缩窄或改为v-u。')
   return [self.arc_speed(s)/self.arc_scale]
  sol=solve_ivp(rhs,(lo,hi),[0.],method='DOP853',rtol=2e-12,atol=2e-14,dense_output=True)
  if not sol.success:raise GenericCanonicalError('arc-integration','原弧长差积分失败，保留完整域。')
  self.arc_solution=sol

 def arc_delta(self,u,v):return float(self.arc_solution.sol(v)[0]-self.arc_solution.sol(u)[0])*self.arc_scale

def query_generic_canonical(data):
 q=validate_generic_canonical_query(data)
 try:
  k=CanonicalKernel(q)
  # Audit the exact displayed source parameters before integrating A. An
  # actually undefined D or beta must not turn into a downstream arc budget
  # error merely because quadrature nodes miss that same source parameter.
  for s in dict.fromkeys((*np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1),*np.linspace(q['parameterStart'],q['parameterEnd'],33))):k.finite(float(s))
  domain=k.domain();k.integrate_arc()
  return _result(k,domain)
 except GenericCanonicalError:raise
 except (ValueError,ZeroDivisionError,OverflowError) as exc:raise GenericCanonicalError('source-domain','原规范来源未能在完整域产生有限三维规则。') from exc

def _result(k,domain):
 q=k.q;u=np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1);ws=np.linspace(q['rulingStart'],q['rulingEnd'],q['rulingSegments']+1);vs=np.linspace(q['crossParameterStart'],q['crossParameterEnd'],q['rulingSegments']+1)
 samples=[];raw_grid=[];canonical_grid=[];cross_grid=[];maximum_unit=maximum_develop=0.
 for s in u:
  p=k.finite(float(s));b,rb,d,rd,bp,dp=[values(p[key]) for key in ('canonicalB','b','d','rawD','bp','dp')];raw_d=rd*k.dscale
  if k.operation=='tangent':raw_d=d # Original tangent input has only B.
  world_b=k.canonical_origin+k.scale*b;world_raw=k.raw_origin+k.scale*rb
  maximum_unit=max(maximum_unit,abs(float(d@d)-1))
  den=math.hypot(*bp)*math.hypot(*dp)
  residual=0. if den==0 or k.canonical_base_zero else abs(float(np.asarray(cross(bp,d))@dp))/den;maximum_develop=max(maximum_develop,residual)
  cg=[];rg=[];xg=[];metric=[];cross_metric=[]
  for w in ws:
   normal=b+(w/k.scale)*d;cg.append(normal.tolist());rg.append((rb+(w/k.scale)*raw_d).tolist())
   a=bp+(w/k.scale)*dp;area=math.hypot(*cross(a,d))
   if k.dprime_zero and (k.canonical_base_zero or k.tangent_proof['analyticIdentity']) or w==0 and (k.canonical_base_zero or k.tangent_proof['analyticIdentity']):area=0.
   metric.append(dict(E=float(a@a)*k.scale**2,F=float(a@d)*k.scale,G=float(d@d),normalizedArea=area,regular=area>0))
  for v in vs:
   w=k.arc_delta(float(s),float(v))*k.scale if k.arc_required else float(v)
   # arc_delta is normalized in geometry units; it was integrated with an
   # independent arc scale so tiny curves keep relative numerical accuracy.
   xg.append((b+(w/k.scale)*d).tolist())
   su=bp+(w/k.scale)*dp;sv=d.copy()
   if k.arc_required:su=su-k.arc_speed(float(s))*d;sv=k.arc_speed(float(v))*d
   area=math.hypot(*cross(su,sv))
   if k.arc_required and k.tangent_proof['analyticIdentity'] and float(s)==float(v):area=0. # Exact original regression-curve identity, including reversed D.
   if not k.arc_required and (k.dprime_zero and k.canonical_base_zero or v==0 and k.canonical_base_zero):area=0.
   cross_metric.append(dict(E=float(su@su)*k.scale**2,F=float(su@sv)*(k.scale**2 if k.arc_required else k.scale),G=float(sv@sv)*(k.scale**2 if k.arc_required else 1),normalizedArea=area,regular=area>0))
  samples.append(dict(s=float(s),rawBase=world_raw.tolist(),rawDirector=raw_d.tolist(),canonicalBase=world_b.tolist(),canonicalDirector=d.tolist(),canonicalBaseDerivative=(k.scale*bp).tolist(),canonicalDirectorDerivative=dp.tolist(),canonicalEFG=metric,crossEFG=cross_metric))
  raw_grid.append(rg);canonical_grid.append(cg);cross_grid.append(xg)
 if not k.developability_proof['analyticIdentity']:
  # An interval witness of the original triple product proves incompatibility;
  # a finite residual alone remains a sampled observation, never an identity.
  nonzero=False
  for s in u[::max(1,len(u)//8)]:
   try:
    p=k.point(Interval(float(s)));r=dot(cross([x.value for x in p['bp']],[x.value for x in p['d']]),[x.value for x in p['dp']]);r=Interval.cast(r)
    if r.lo>0 or r.hi<0:nonzero=True;break
   except (ValueError,ZeroDivisionError,OverflowError):pass
  k.developability_proof=_status(False,nonzero)
 if k.branch=='tangent' and not k.tangent_proof['analyticIdentity']:k.tangent_proof=_status(False,k._witness('regression'))
 world=lambda grid,origin:[[list(origin+k.scale*np.asarray(p)) for p in row] for row in grid]
 return dict(family=RESULT_FAMILY,query=q,source=dict(definitionCell=CELLS[k.operation],function=FUNCTIONS[k.operation],canonicalBranch=k.branch,coneOriginalUnassignedBbCheck=k.operation=='cone',numericWolframOutAvailable=False,flatDevelopmentReturnedByOriginal=False,
              rulingParameterMeaning='signed-unit-ruling-length',crossParameterMeaning='source-base-parameter-in-arc-length-difference' if k.arc_required else 'signed-unit-ruling-length',generalBaseShiftFraction='(rawBPrime.dot(unitDPrime))/(unitDPrime.dot(unitDPrime))' if k.operation=='general' and k.branch!='cylinder' else None),
             certification=dict(cylinderBranchIdentity=k.cylinder_proof,apexIdentity=k.apex_proof,edgeOfRegressionIdentity=k.tangent_proof,developabilityIdentity=k.developability_proof,sourceDomain=domain,unitDirectorFiniteMaximumError=maximum_unit,finiteDevelopabilityMaximumRelativeResidual=maximum_develop,
              sameRuledSurfaceSetByFormula=True,sameFiniteRawPatch='not-asserted',integrationErrorIntervalCertified=False,sampledMeshExactFOLD=False,adoptableCreasePattern=False,motionVerified=False,selfCollisionVerified=False),
             normalization=dict(rawOrigin=k.raw_origin.tolist(),canonicalOrigin=k.canonical_origin.tolist(),scale=k.scale,rawDirectorScale=k.dscale),
             integration=None if not k.arc_required else dict(method='DOP853-arc-length',evaluations=k.integration_calls,relativeTolerance=2e-12,absoluteTolerance=2e-14,errorIntervalCertified=False),
             uValues=u.tolist(),rulingValues=ws.tolist(),crossParameterValues=vs.tolist(),samples=samples,
             rawGrid=world(raw_grid,k.raw_origin),canonicalGrid=world(canonical_grid,k.canonical_origin),crossGrid=world(cross_grid,k.canonical_origin),normalizedRawGrid=raw_grid,normalizedCanonicalGrid=canonical_grid,normalizedCrossGrid=cross_grid)
