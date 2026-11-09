"""Literal ten-source FoldSurfaceToCone/Cylinder numerical construction.

The symbolic Cone has Psi(s) because the original dd2i uses ff[s]. The
numerical Cone fixes Psi at ui and returns raw radial vectors. Neither this
source difference nor raw cylinder initial directors are repaired here.
"""
import ast,math
from functools import lru_cache
import numpy as np
import sympy as sp
from tessellation_curved_generic_darboux import Expression,Taylor,IntervalTaylor,GenericDarbouxError,dot,cross,times,values,magnitude,ROUNDING,METRIC_TOLERANCE
from tessellation_curved_reshape_special_generic import square,scalar_length,value_bounds
from tessellation_curved_matched_pair_query import symbolic_node,simplified,algebraic_budget
from tessellation_curved_linked_common_interval import Interval

CONE_FAMILY='surface-to-cone-generic-native';CYLINDER_FAMILY='surface-to-cylinder-generic-native';BUDGET=1023
COMMON={'sourceFlatBase':['s','s**2/4'],'sourceFlatDirector':['0','1'],'sourceSpaceBase':['sin(s)','s**2/4','1-cos(s)'],'sourceSpaceDirector':['0','1','0'],
 'literalMode':'raw-numerical','parameterStart':0.,'parameterEnd':1.,'transverseStart':.2,'transverseEnd':1.,'segments':32,'rulingSegments':16}
CONE_PRESET={**COMMON,'family':CONE_FAMILY,'initialParameter':0.,'flatApex':[0.,2.],'spaceApex':[0.,1.,0.]}
CYLINDER_PRESET={**COMMON,'family':CYLINDER_FAMILY,'flatReferencePoint':[0.,0.],'flatDirector':[0.,1.],'spaceReferencePoint':[0.,0.,0.],'spaceDirector':[0.,0.,1.]}
SOURCE_KEYS=('sourceFlatBase','sourceFlatDirector','sourceSpaceBase','sourceSpaceDirector')
STAGES=('sourceFlat','sourceSpace','targetFlat','targetSpace')
class FoldSurfaceError(GenericDarbouxError):pass
def norm_square(v):return sum(square(Interval.cast(x)) for x in v)
def det(a,b):return a[0]*b[1]-a[1]*b[0]
def sign(x):return 1 if x>0 else -1 if x<0 else 0
def abs_lower(x):
 x=Interval.cast(x);return 0. if x.lo<=0<=x.hi else min(abs(x.lo),abs(x.hi))
def validate(data,cone):
 preset=CONE_PRESET if cone else CYLINDER_PRESET
 if not isinstance(data,dict) or set(data)-set(preset):raise FoldSurfaceError('input-contract','十源表面折叠仅接受原数值合同字段。')
 q={**preset,**data}
 if q['family']!=preset['family'] or q['literalMode'] not in ('normalized-symbolic','raw-numerical'):raise FoldSurfaceError('input-contract','原函数类型或literalMode无效。')
 for key,dimension in zip(SOURCE_KEYS,(2,2,3,3)):
  a=q[key]
  if not isinstance(a,list) or len(a)!=dimension:raise FoldSurfaceError('input-contract','原源b1/d1二维、bb1/dd1三维，共十个安全标量。')
  for s in a:Expression(s,'s')
  q[key]=list(a)
 numeric=('parameterStart','parameterEnd','transverseStart','transverseEnd')+(('initialParameter',) if cone else ())
 for key in numeric:
  x=q[key]
  if type(x) not in (int,float) or not math.isfinite(x):raise FoldSurfaceError('input-contract','原参数与初值须为有限数。')
  q[key]=float(x)
 a,b=q['parameterStart'],q['parameterEnd']
 if not -10<=a<b<=10 or not .01<=b-a<=12 or cone and not a<=q['initialParameter']<=b:raise FoldSurfaceError('input-contract','s域须在−10…10，跨度.01–12且原ui在域内。')
 if not -1e6<=q['transverseStart']<q['transverseEnd']<=1e6:raise FoldSurfaceError('input-contract','原w域须递增且位于±10⁶。')
 for key,lo,hi in [('segments',8,128),('rulingSegments',2,64)]:
  if type(q[key]) is not int or not lo<=q[key]<=hi:raise FoldSurfaceError('input-contract','显示密度超出有限预算。')
 vectors=[('flatApex',2),('spaceApex',3)] if cone else [('flatReferencePoint',2),('flatDirector',2),('spaceReferencePoint',3),('spaceDirector',3)]
 for key,dimension in vectors:
  a=q[key]
  if not isinstance(a,list) or len(a)!=dimension or any(type(x) not in (int,float) or not math.isfinite(x) or abs(x)>1e12 for x in a):raise FoldSurfaceError('input-contract','原初值须为正确维数、组件≤10¹²的有限raw向量。')
  q[key]=[float(x) for x in a]
 return q

def checked_symbolic(curves):
 if sum(len(list(ast.walk(f.tree))) for row in curves for f in row)>1600 or any(algebraic_budget(f.tree)>32 for row in curves for f in row):raise ValueError('symbolic budget')
 s=sp.Symbol('s',real=True);return s,[[symbolic_node(f.tree,s) for f in row] for row in curves]
def source_pair_identity(curves):
 try:
  s,(b,d,bb,dd)=checked_symbolic(curves);bp,dp,bbp,ddp=[[sp.diff(x,s) for x in a] for a in (b,d,bb,dd)]
  differences=[dot(bp,bp)-dot(bbp,bbp),dot(bp,dp)-dot(bbp,ddp),dot(dp,dp)-dot(ddp,ddp),dot(bp,d)-dot(bbp,dd),dot(dp,d)-dot(ddp,dd),dot(d,d)-dot(dd,dd)]
  return all(simplified(x)==0 for x in differences)
 except (ValueError,TypeError,ZeroDivisionError,OverflowError,RecursionError,NotImplementedError,sp.PolynomialError):return False
def constant_zero_sign_identity(curves,q):
 try:
  s,(b,d,bb,dd)=checked_symbolic(curves)
  if not all(simplified(sp.diff(x,s))==0 for row in (b,d,bb,dd) for x in row):return False
  a=[sp.Rational(str(x))-y for x,y in zip(q['flatApex'],b)];aa=[sp.Rational(str(x))-y for x,y in zip(q['spaceApex'],bb)]
  v=(dot(a,a)-dot(aa,aa))/(2*(dot(a,d)-dot(aa,dd)))
  a=[x-v*y for x,y in zip(a,d)];aa=[x-v*y for x,y in zip(aa,dd)]
  delta=dot(d,a)/sp.sqrt(dot(a,a))-dot(dd,aa)/sp.sqrt(dot(aa,aa))
  return simplified(delta)==0
 except (ValueError,TypeError,ZeroDivisionError,OverflowError,RecursionError,NotImplementedError,sp.PolynomialError):return False

class FoldSurfaceKernel:
 def __init__(self,q,cone):
  self.query=q;self.cone=cone;self.symbolic=q['literalMode']=='normalized-symbolic';self.curves=[[Expression(x,'s') for x in q[key]] for key in SOURCE_KEYS]
  self.origins=[np.asarray(q['flatApex' if cone else 'flatReferencePoint']),np.asarray(q['spaceApex' if cone else 'spaceReferencePoint'])]
  magnitudes=[];speeds=[];span=q['parameterEnd']-q['parameterStart']
  for s in np.linspace(q['parameterStart'],q['parameterEnd'],9):
   variable=Taylor.variable(float(s),1)
   for row,origin in zip((self.curves[0],self.curves[2]),self.origins):
    jets=[]
    for f,anchor in zip(row,origin):
     offsets,dynamic=f.affine_parts(variable);jets.append(dynamic+math.fsum(offsets+[-float(anchor)]))
    magnitudes.append(math.hypot(*(x.value for x in jets)));speeds.append(math.hypot(*(x.c[1] for x in jets)))
  self.scale=max(max(magnitudes),max(speeds)*span) or 1.
  if not math.isfinite(self.scale):raise FoldSurfaceError('source-scale','原十源几何超出有限归一化预算。')
  self.analytic=source_pair_identity(self.curves);self.zero_sign=cone and self.symbolic and constant_zero_sign_identity(self.curves,q)
  self.ui=q['initialParameter'] if cone else None
  if cone:
   # Sign is discontinuous: changing the arithmetic by a similarity scale
   # can turn an exact literal zero into a tiny nonzero and select another
   # branch. Evaluate the original seed equation in physical coordinates,
   # retaining compensated anchor offsets; never use an epsilon Sign.
   point=self.source(self.ui,world=True);self.flat_seed=times(point['foldFlat'],-1/magnitude(point['foldFlat']));self.space_seed=times(point['foldSpace'],-1/magnitude(point['foldSpace']))
   self.d_ui=[x.value for x in point['sourceFlat']['d']];self.dd_ui=[x.value for x in point['sourceSpace']['d']]
   self.initial_argument=float(dot(self.d_ui,[x.value for x in self.flat_seed])-dot(self.dd_ui,[x.value for x in self.space_seed]));self.initial_sign=sign(self.initial_argument)
   ip=self.source(Interval(self.ui),world=True);fi=times(ip['foldFlat'],-1/magnitude(ip['foldFlat']));ffi=times(ip['foldSpace'],-1/magnitude(ip['foldSpace']))
   self.initial_argument_interval=dot(ip['sourceFlat']['d'],fi)-dot(ip['sourceSpace']['d'],ffi)
   self.symbolic_flat_argument_interval=dot(ip['sourceFlat']['d'],fi).value
   self.dd_ui_intervals=[x.value for x in ip['sourceSpace']['d']]
   self.unit_compatible=True;self.unit_residual=None
  else:
   self.unit_residual=max(abs(float(dot(q['flatDirector'],q['flatDirector']))-1),abs(float(dot(q['spaceDirector'],q['spaceDirector']))-1));self.unit_compatible=bool(self.unit_residual<=64*np.finfo(float).eps)
 def source(self,s,world=False):
  variable=(IntervalTaylor if isinstance(s,Interval) else Taylor).variable(s,2);vectors=[]
  divisor=1. if world else self.scale
  for index,row in enumerate(self.curves):
   if index%2==0:
    anchor=self.origins[index//2];items=[]
    for f,x in zip(row,anchor):
     offsets,dynamic=f.affine_parts(variable);items.append((dynamic+math.fsum(offsets+[-float(x)]))/divisor)
   else:items=[f(variable)/divisor for f in row]
   vectors.append(items)
  b,d,bb,dd=vectors
  if self.cone:
   denominator=2*(dot(times(b,-1),d)-dot(times(bb,-1),dd));v=(dot(b,b)-dot(bb,bb))/denominator
  else:
   denominator=dot(d,self.query['flatDirector'])-dot(dd,self.query['spaceDirector']);v=(-dot(b,self.query['flatDirector'])+dot(bb,self.query['spaceDirector']))/denominator
  f=[x+v*y for x,y in zip(b,d)];ff=[x+v*y for x,y in zip(bb,dd)]
  return {'sourceFlat':{'b':b,'d':d},'sourceSpace':{'b':bb,'d':dd},'foldFlat':f,'foldSpace':ff,'v':v,'denominator':denominator}
 @lru_cache(maxsize=4096)
 def point(self,s):return self.construct(float(s))
 def construct(self,s):
  p=self.source(s);argument=branch=None;defined=True
  if self.cone:
   if self.symbolic:
    original=self.source(s,world=True)
    unitspace=times(original['foldSpace'],-1/magnitude(original['foldSpace']))
    argument=(self.symbolic_flat_argument_interval-dot(unitspace,self.dd_ui_intervals).value) if isinstance(s,Interval) else dot(self.d_ui,[x.value for x in self.flat_seed])-dot(self.dd_ui,unitspace).value
    if isinstance(s,Interval):
     arg=Interval.cast(argument);branch=Interval(0.) if self.zero_sign else Interval(1.) if arg.lo>0 else Interval(-1.) if arg.hi<0 else Interval(-1.,1.);defined=self.zero_sign or abs_lower(arg)>0
    else:branch=0 if self.zero_sign else sign(argument);defined=branch!=0 or self.zero_sign
   else:
    argument=self.initial_argument_interval.value if isinstance(s,Interval) else self.initial_argument;branch=self.initial_sign
   directors=[times(times(p[key],1/magnitude(p[key])),-branch/self.scale) if self.symbolic else times(p[key],-branch) for key in ('foldFlat','foldSpace')]
   bases=[[x*0 for x in p[key]] for key in ('foldFlat','foldSpace')]
  else:
   directors=[[p['v'].constant(x/self.scale,2) for x in self.query[key]] for key in ('flatDirector','spaceDirector')]
   bases=[[x-dot(f,d)*y for x,y in zip(f,d)] for f,d in zip((p['foldFlat'],p['foldSpace']),(self.query['flatDirector'],self.query['spaceDirector']))]
  p.update({'targetFlat':{'b':bases[0],'d':directors[0]},'targetSpace':{'b':bases[1],'d':directors[1]},'argument':argument,'branch':branch,'defined':defined})
  for stage in STAGES:
   p[stage]['bp']=[x.derivative() for x in p[stage]['b']];p[stage]['dp']=[x.derivative() for x in p[stage]['d']]
  return p
 def area(self,stage,w):
  ds=[x+y*w for x,y in zip(stage['bp'],stage['dp'])];d=stage['d']
  components=[det(ds,d)] if len(d)==2 else cross(ds,d)
  return sum((square(Interval.cast(x.value)) for x in components),Interval(0.))
 def cell(self,a,b):
  p=self.construct(Interval(a,b));width=Interval(self.query['transverseStart'],self.query['transverseEnd']);factor=self.scale**(2 if self.cone else 1)
  c={'start':a,'end':b,'denominatorBounds':value_bounds(p['denominator'].value*factor),'offsetParameterBounds':value_bounds(p['v'].value),'flatRadiusBounds':None,'spaceRadiusBounds':None,'branchArgumentBounds':None,'branchSignBounds':None}
  if self.cone:
   c.update({'flatRadiusBounds':value_bounds(scalar_length([x.value*self.scale for x in p['foldFlat']])),'spaceRadiusBounds':value_bounds(scalar_length([x.value*self.scale for x in p['foldSpace']])),'branchArgumentBounds':value_bounds(p['argument']),'branchSignBounds':value_bounds(p['branch'])})
  for stage in STAGES:c[stage+'NormalizedAreaSquaredBounds']=None if stage.startswith('target') and not p['defined'] else value_bounds(self.area(p[stage],width))
  if any(not math.isfinite(x) for pair in c.values() if isinstance(pair,list) for x in pair):raise ValueError('interval arithmetic budget')
  return c
 def domain(self):
  q=self.query;stack=[(q['parameterStart'],q['parameterEnd'],0)];cells=[];unresolved=[];evaluations=0
  while stack:
   a,b,depth=stack.pop();evaluations+=1
   if evaluations>BUDGET:unresolved.extend([[a,b]]+[[x,y] for x,y,_ in stack]);break
   try:
    c=self.cell(a,b);uncertain=[stage for stage in STAGES if c[stage+'NormalizedAreaSquaredBounds'] is None or c[stage+'NormalizedAreaSquaredBounds'][0]<=0]
    if self.cone and self.symbolic and c['branchSignBounds']==[-1.,1.]:uncertain+=['branch']
    if uncertain and depth<10 and evaluations+len(stack)+2<BUDGET:
     midpoint=self.point((a+b)/2);refine=any(self.area(midpoint[stage],Interval(q['transverseStart'],q['transverseEnd'])).lo>0 for stage in uncertain if stage in STAGES and (not stage.startswith('target') or midpoint['defined']))
     if refine or 'branch' in uncertain:
      mid=(a+b)/2;stack.extend([(mid,b,depth+1),(a,mid,depth+1)]);continue
    cells.append(c)
   except (ValueError,ZeroDivisionError,OverflowError):
    self.point((a+b)/2)
    if depth>=18 or b-a<=1e-9:unresolved.append([a,b])
    else:mid=(a+b)/2;stack.extend([(mid,b,depth+1),(a,mid,depth+1)])
  cells.sort(key=lambda c:c['start']);unresolved.sort();certified=not unresolved
  branchverified=certified and (not self.cone or all(c['branchSignBounds'] in ([1.,1.],[-1.,-1.],[0.,0.]) for c in cells))
  if self.cone and not self.symbolic and self.initial_sign!=0 and abs_lower(self.initial_argument_interval.value)==0:branchverified=False
  branches=set(c['branchSignBounds'][0] for c in cells if c['branchSignBounds'])
  if self.cone and len(branches)>1:branchverified=False
  strips={}
  for stage in STAGES:
   bounds=[c[stage+'NormalizedAreaSquaredBounds'] for c in cells];ok=certified and all(x is not None and x[0]>0 for x in bounds)
   strips[stage]={'status':'verified' if ok else 'unknown','minimumAreaSquaredLowerBound':min(x[0] for x in bounds) if ok else None,'reason':None if ok else 'complete original strip area/derivatives unresolved; original domain retained'}
   if stage.startswith('target') and self.cone and (self.zero_sign or not self.symbolic and self.initial_sign==0 or q['transverseStart']<=0<=q['transverseEnd']):strips[stage]={'status':'degenerate','minimumAreaSquaredLowerBound':None,'reason':'literal zero director or cone apex lies in original width'}
  def minimum(field,absolute=False):
   data=[c[field] for c in cells];return min(abs_lower(Interval(*x)) if absolute else x[0] for x in data) if certified and data and all(x is not None for x in data) else None
  return {'certified':certified,'evaluations':evaluations,'verifiedCells':len(cells),'cells':cells,'unresolved':unresolved,'minimumAbsDenominatorLowerBound':minimum('denominatorBounds',True),'minimumFlatRadiusLowerBound':minimum('flatRadiusBounds'),'minimumSpaceRadiusLowerBound':minimum('spaceRadiusBounds'),'minimumAbsBranchArgumentLowerBound':minimum('branchArgumentBounds',True),'roundingModel':ROUNDING,'reason':None if certified else 'interval source/denominator/radius budget exhausted; original domain retained','signBranch':{'status':'constant-zero' if self.cone and (self.zero_sign or not self.symbolic and self.initial_sign==0) else 'verified' if branchverified else 'unknown','sign':next(iter(branches)) if branchverified and self.cone else None,'reason':None if branchverified else 'complete original symbolic sign branch not certified'},'strips':strips}
 def row(self,s,p):
  r={'s':s,'offsetParameter':p['v'].value,'offsetParameterDerivative':p['v'].c[1],'branchArgument':p['argument'],'branchSign':p['branch'],'targetJetsDefined':p['defined']}
  for stage in STAGES:
   origin=self.origins[stage.endswith('Space')];items={}
   for label,key in [('base','b'),('director','d'),('baseDerivative','bp'),('directorDerivative','dp')]:
    undefined=stage.startswith('target') and key=='dp' and not p['defined'];x=values(p[stage][key]) if not undefined else None
    items[label]=None if undefined else (x*self.scale+(origin if key=='b' else 0)).tolist();items['normalized'+label[0].upper()+label[1:]]=None if undefined else x.tolist()
   r[stage]=items
  for label,key in [('foldFlat','foldFlat'),('foldSpace','foldSpace'),('foldFlatDerivative','foldFlat'),('foldSpaceDerivative','foldSpace')]:
   x=values([x.derivative() for x in p[key]]) if label.endswith('Derivative') else values(p[key]);origin=self.origins[key=='foldSpace']
   r[label]=(x*self.scale+(origin if not label.endswith('Derivative') else 0)).tolist();r['normalized'+label[0].upper()+label[1:]]=x.tolist()
  return r

def metric(stage,w):
 b,d,dp=[values(stage[k]) for k in ('bp','d','dp')];ds=b+w*dp;return [float(ds@ds),float(ds@d),float(d@d)]
def metric_error(a,b):
 e,g=max(a[0],b[0]),max(a[2],b[2]);return max(abs(x-y)/max(z,np.finfo(float).tiny) for x,y,z in zip(a,b,[e,math.sqrt(e)*math.sqrt(g),g]))
def result(kernel,domain):
 q=kernel.query;shown=np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1);audit=sorted(set(shown)|set(np.linspace(q['parameterStart'],q['parameterEnd'],129)));widths=np.linspace(q['transverseStart'],q['transverseEnd'],q['rulingSegments']+1);audit_widths=sorted(set(widths)|{(q['transverseStart']+q['transverseEnd'])/2})
 left=right=fold_error=constraint=0.;defined_nodes=0;any_undefined=False
 for s in audit:
  p=kernel.point(float(s));f,ff=[values(p[k]) for k in ('foldFlat','foldSpace')];fp,ffp=[values([x.derivative() for x in p[k]]) for k in ('foldFlat','foldSpace')]
  fold_error=max(fold_error,abs(float(fp@fp-ffp@ffp))/max(float(fp@fp),float(ffp@ffp),np.finfo(float).tiny))
  if kernel.cone:constraint=max(constraint,abs(float(f@f-ff@ff))/max(float(f@f),float(ff@ff),np.finfo(float).tiny))
  else:
   a=float(f@np.asarray(q['flatDirector']));b=float(ff@np.asarray(q['spaceDirector']));constraint=max(constraint,abs(a-b)/max(np.linalg.norm(f)*np.linalg.norm(q['flatDirector']),np.linalg.norm(ff)*np.linalg.norm(q['spaceDirector']),np.finfo(float).tiny))
  any_undefined|=not p['defined'];defined_nodes+=int(p['defined'])
  for w in audit_widths:
   left=max(left,metric_error(metric(p['sourceFlat'],w),metric(p['sourceSpace'],w)))
   if p['defined']:right=max(right,metric_error(metric(p['targetFlat'],w),metric(p['targetSpace'],w)))
 rows=[];grid=[]
 for s in shown:
  p=kernel.point(float(s));rows.append(kernel.row(float(s),p));g={'s':float(s)}
  for stage in STAGES:
   base,d=values(p[stage]['b']),values(p[stage]['d']);points=[base+w*d for w in widths];origin=kernel.origins[stage.endswith('Space')]
   g[stage]={'points':[(x*kernel.scale+origin).tolist() for x in points],'normalizedPoints':[x.tolist() for x in points],'EFG':[metric(p[stage],w) for w in widths] if not stage.startswith('target') or p['defined'] else None}
  grid.append(g)
 formal=domain['certified'] and kernel.analytic and domain['signBranch']['status']=='verified' and kernel.unit_compatible
 cert={'finiteSourcePairMetricVerified':left<=METRIC_TOLERANCE,'finiteTargetPairMetricVerified':not any_undefined and right<=METRIC_TOLERANCE,'sourcePairMetricAnalytic':kernel.analytic,'sourceDefinitionCertified':domain['certified'],'signBranchCertified':domain['signBranch']['status'] in ('verified','constant-zero'),'initialDirectorsUnitCompatible':kernel.unit_compatible,'formalTargetPairMetricCertified':bool(formal),**{stage+'StripRegularityCertified':domain['strips'][stage]['status']=='verified' for stage in STAGES},**{key:False for key in ('globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern')}}
 if kernel.cone:initial={'parameter':kernel.ui,'flatApex':q['flatApex'],'spaceApex':q['spaceApex'],'flatSeedDirector':values(kernel.flat_seed).tolist(),'spaceSeedDirector':values(kernel.space_seed).tolist(),'branchArgumentAtInitial':kernel.initial_argument,'branchSignAtInitial':kernel.initial_sign}
 else:initial={key:q[key] for key in ('flatReferencePoint','flatDirector','spaceReferencePoint','spaceDirector')};initial.update({'unitDirectorResidual':kernel.unit_residual,'unitDirectorCompatibilityTolerance':64*np.finfo(float).eps,'unitDirectorsCompatible':kernel.unit_compatible})
 functions=['FoldSurfaceToCone','NFoldSurfaceToCone'] if kernel.cone else ['FoldSurfaceToCylinder','NFoldSurfaceToCylinder']
 return {'family':'origamica-generic-surface-to-cone' if kernel.cone else 'origamica-generic-surface-to-cylinder','query':q,'source':{'functions':functions,'definitionCells':['In[4046]','In[4049]'] if kernel.cone else ['In[4053]','In[4056]'],'selectedFunction':functions[0 if kernel.symbolic else 1],'method':'whitelist-AST/literal-ten-source-algebraic-formulas','initialArgumentOrder':['ui','b2i','bb2i'] if kernel.cone else ['p2i','d2i','pp2i','dd2i'],'directorConvention':'Psi(s)*unit(apex-fold)' if kernel.cone and kernel.symbolic else 'Psi(ui)*(apex-fold), no Normalize' if kernel.cone else 'raw d2i/dd2i; raw projection coefficient','signConvention':'symbolic dd2i uses ff[s]; Psi(s) preserved' if kernel.cone and kernel.symbolic else 'fixed original ui sign' if kernel.cone else 'no sign branch','interpolationReproduced':False,'symbolicObjectsReproduced':False,'wolframOptionsReproduced':False,'metricConvention':'normalized-s/world-w'},'normalization':{'flatOrigin':kernel.origins[0].tolist(),'spaceOrigin':kernel.origins[1].tolist(),'scale':kernel.scale},'initial':initial,'diagnostics':{'validationNodes':129,'targetDerivativeNodes':defined_nodes,'maximumSourcePairRelativeMetricDifference':left,'maximumTargetPairRelativeMetricDifference':None if any_undefined else right,'maximumFoldSpeedRelativeDifference':fold_error,'maximumConstraintRelativeResidual':constraint,'sourcePairMetricIdentity':{'analyticIdentity':kernel.analytic,'method':'bounded-safe-symbolic-six-EFG-coefficients' if kernel.analytic else 'finite-original-source-pair'},'symbolicZeroSignAnalytic':bool(kernel.zero_sign),'metricTolerance':METRIC_TOLERANCE},'certification':cert,'domain':domain,'sample':{'rows':rows},'grid':grid}

def query_fold_surface_generic(data,cone):
 q=validate(data,cone)
 try:
  kernel=FoldSurfaceKernel(q,cone);domain=kernel.domain()
  with np.errstate(over='ignore',invalid='ignore',divide='ignore'):r=result(kernel,domain)
  def finite(x):
   if isinstance(x,dict):return all(finite(v) for v in x.values())
   if isinstance(x,list):return all(finite(v) for v in x)
   return math.isfinite(x) if isinstance(x,(int,float,np.floating)) else True
  if not finite(r):raise FoldSurfaceError('arithmetic-budget','原表面折叠超出有限binary64源/EFG预算。')
  return r
 except GenericDarbouxError:raise
 except (ValueError,ZeroDivisionError,OverflowError) as e:raise FoldSurfaceError('source-domain','原十源除数或字面Normalize在实际求值点未定义；不修复原函数差异。') from e
def query_fold_surface_to_cone_generic(data):return query_fold_surface_generic(data,True)
def query_fold_surface_to_cylinder_generic(data):return query_fold_surface_generic(data,False)
