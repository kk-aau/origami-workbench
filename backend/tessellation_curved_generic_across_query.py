"""Original AcrossRight source algebra, bounded AST and independent interval flags.

Left rulings are returned with their original amplitude.  No frame integration,
implicit root or source repair is involved.  An unresolved interval proof keeps
the complete requested patches; a pair mismatch is a read-only source result.
"""
import ast
import math
import numpy as np
from tessellation_curved_generic_linked_expression import Expression, Taylor, GenericLinkedError
from tessellation_curved_linked_common_interval import Interval

FAMILY='curved-across-right'
VARIANT='generic-native'
ROUNDING='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'
BUDGET=511
PRESET={'family':FAMILY,'variant':VARIANT,'mode':'both',
 'flatCurve':['s','s^2/4'],'flatLeftRuling':['0','1'],
 'spaceCurve':['Sin[s]','s^2/4','1-Cos[s]'],'spaceLeftRuling':['0','1','0'],
 'foldAngleExpression':'2 ArcTan[2 Sqrt[1+s^2/4]]',
 'parameterStart':.2,'parameterEnd':1.,'leftWidth':.15,'rightWidth':.15,'segments':32,'rulingSegments':8}

class AcrossError(GenericLinkedError):pass

def validate_curved_generic_across_query(data):
 if not isinstance(data,dict) or set(data)!=set(PRESET):
  raise AcrossError('input-contract','一般跨右侧输入须完整保留模式、原式和原域，且不含额外字段。')
 q={**data}
 if q['family']!=FAMILY or q['variant']!=VARIANT or q['mode'] not in ('2d','3d','both'):
  raise AcrossError('input-contract','AcrossRight 类型或模式无效。')
 for key,n in [('flatCurve',2),('flatLeftRuling',2),('spaceCurve',3),('spaceLeftRuling',3)]:
  if not isinstance(q[key],list) or len(q[key])!=n:raise AcrossError('input-contract','源曲线和左母线需完整2/3个标量表达式。')
  for text in q[key]:Expression(text,'s')
  q[key]=list(q[key])
 Expression(q['foldAngleExpression'],'s')
 for key in ('parameterStart','parameterEnd','leftWidth','rightWidth'):
  if type(q[key]) not in (int,float) or not math.isfinite(q[key]):raise AcrossError('input-contract','域和母线系数须为有限数。')
  q[key]=float(q[key])
 if not -10<=q['parameterStart']<q['parameterEnd']<=10 or not .01-1e-12<=q['parameterEnd']-q['parameterStart']<=12:
  raise AcrossError('input-contract','共同s域须在−10…10内，长度0.01–12。')
 if not 0<q['leftWidth']<=1e6 or not 0<q['rightWidth']<=1e6:
  raise AcrossError('input-contract','两侧母线系数上限须在0…10⁶内。')
 for key,low,high in [('segments',8,128),('rulingSegments',2,32)]:
  if type(q[key]) is not int or not low<=q[key]<=high:raise AcrossError('input-contract','显示纵向段须8–128，横向段须2–32。')
 return q

def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def cross2(a,b):return a[0]*b[1]-a[1]*b[0]
def scale(a,k):return [x*k for x in a]
def add(a,b):return [x+y for x,y in zip(a,b)]
def norm(a):return dot(a,a).sqrt()
def vals(a):return np.array([x.value for x in a],float)
def iv(x):return Interval.cast(x)
def nonzero(x):
 v=iv(x.value)
 if v.lo<=0<=v.hi:raise ValueError('source branch denominator includes zero')
 return 1 if v.lo>0 else -1

class AcrossKernel:
 def __init__(self,q):
  self.q=q;self.functions=[[Expression(x,'s') for x in q[key]] for key in ('flatCurve','spaceCurve')]
  self.left=[[Expression(x,'s') for x in q[key]] for key in ('flatLeftRuling','spaceLeftRuling')]
  self.gamma=Expression(q['foldAngleExpression'],'s')
  self.gamma_symbolic=None;self.half_tangent_sign=None
  # Literal Pi retains its original mathematical meaning at an exact pole.
  # Finite libm cos(pi/2) must not turn that undefined source into a proof.
  if q['mode']=='2d' and any(isinstance(n,ast.Name) and n.id=='pi' for n in ast.walk(self.gamma.tree)):
   try:
    import sympy as sp
    from tessellation_curved_matched_pair_query import symbolic_node,simplified,algebraic_budget
    if len(list(ast.walk(self.gamma.tree)))<=96 and algebraic_budget(self.gamma.tree)<=16:
     self.gamma_variable=sp.Symbol('s',real=True)
     self.gamma_symbolic=simplified(symbolic_node(self.gamma.tree,self.gamma_variable))
   except (ValueError,TypeError,OverflowError,ZeroDivisionError,RecursionError,sp.PolynomialError,NotImplementedError):pass
  self.active=[q['mode']!='3d',q['mode']!='2d'];s=Taylor.variable(q['parameterStart'],1)
  self.parts=[[(f.affine_parts(s) if self.active[i] else ([],Taylor.constant(0.,1))) for f in group] for i,group in enumerate(self.functions)]
  self.origins=[[math.fsum(offsets)+dynamic.value for offsets,dynamic in group] if self.active[i] else None for i,group in enumerate(self.parts)]
  at=0 if self.active[0] else 1
  self.length=math.hypot(*[p[1].c[1] for p in self.parts[at]])
  if not math.isfinite(self.length) or self.length<=0:raise AcrossError('speed-singularity','起点原生曲线速度为零或超出有限算术域。')
  self.branch=None

 def coords(self,i,s):
  out=[]
  for f,(offset0,dynamic0) in zip(self.functions[i],self.parts[i]):
   offsets,dynamic=f.affine_parts(s)
   out.append((dynamic-dynamic0.value+math.fsum(offsets+[-x for x in offset0]))/self.length)
  return out

 def point(self,argument):
  s=Taylor.variable(argument,4);p={'parameter':argument};frames={};branch={}
  for i in range(2):
   if not self.active[i]:continue
   c=self.coords(i,s);cp=[x.derivative() for x in c];speed=norm(cp)
   t=scale(cp,1/speed);left=[f(s)/self.length for f in self.left[i]]
   if i==0:
    l=[-t[1],t[0]];frames['flat']=(t,l)
    p['flat']={'c':c,'rL':left,'cPrime':cp,'rLPrime':[x.derivative() for x in left]}
   else:
    tp=[x.derivative() for x in t];N=scale(tp,1/norm(tp));B=cross(t,N)
    UL=scale(cross(t,left),1/norm(cross(t,left)));LL=cross(UL,t)
    C=dot(LL,N);S=dot(UL,N);UR=add(scale(N,-S),scale(B,C));LR=add(scale(N,C),scale(B,S))
    Up=[x.derivative() for x in UR];A=dot(Up,t);Q=dot(Up,LR);H=norm(Up)
    sign=nonzero(A);cos=sign*Q/H;sin=sign*A/H
    right=scale(add(scale(t,cos),scale(LR,-sin)),1/self.length)
    p['space']={'c':c,'rL':left,'rR':right,'cPrime':cp,'rLPrime':[x.derivative() for x in left],'rRPrime':[x.derivative() for x in right]}
    branch={'sign':sign,'cosine':cos,'sine':sin,'selector':A,'denominator':H}
  if self.q['mode']=='2d':
   c=p['flat'];t,l=frames['flat'];speed=norm(c['cPrime']);cpp=[x.derivative() for x in c['cPrime']]
   g=cross2(c['cPrime'],cpp)/(speed*speed);nonzero(g);nonzero(dot(l,c['rL']))
   if self.gamma_symbolic is not None and not isinstance(argument,Interval):
    import sympy as sp
    if sp.cos(self.gamma_symbolic.subs(self.gamma_variable,sp.Rational(str(argument)))/2)==0:
     raise AcrossError('fold-angle-pole','原γ的半角tan在该共同参数处为精确极点；不能用libm近似非零冒充可定义原源。')
   gamma=self.gamma(s);sign=nonzero(gamma);h=(gamma/2).tan();h_sign=nonzero(h)
   if self.half_tangent_sign is None and not isinstance(argument,Interval):self.half_tangent_sign=h_sign
   if self.half_tangent_sign is not None and self.half_tangent_sign!=h_sign:
    raise AcrossError('fold-angle-branch','半角tan符号在原域改变，必经极点、零值或不连续源；不跨越原右母线分支。')
   z=h*dot(t,c['rL'])/dot(l,c['rL'])-gamma.derivative()/g;D=(h*h+z*z).sqrt()
   cos=sign*z/D;sin=h_sign*h/D
   branch={'sign':sign,'cosine':cos,'sine':sin,'selector':gamma,'denominator':D}
  if self.active[0]:
   t,l=frames['flat'];right=scale(add(scale(t,cos),scale(l,-sin)),1/self.length)
   p['flat']['rR']=right;p['flat']['rRPrime']=[x.derivative() for x in right]
  p['branch']=branch
  if self.branch is not None and branch['sign']!=self.branch:raise AcrossError('branch-discontinuity','原sign分支在共同s域改变；不自动换支。')
  return p

 def finite(self,s):
  try:
   p=self.point(s)
   for side in ('flat','space'):
    if side in p and any(not np.isfinite(vals(v)).all() for v in p[side].values()):raise ValueError('nonfinite source jet')
   if any(not math.isfinite(x.value) for k,x in p['branch'].items() if k!='sign'):raise ValueError('nonfinite branch')
   return p
  except AcrossError:raise
  except (ValueError,OverflowError,ZeroDivisionError) as e:raise AcrossError('source-singularity','原曲线、左母线、折角或右分支在该共同参数处不可定义。') from e

 def row(self,s):
  p=self.finite(s);row={'s':s,'flat':None,'space':None,'branch':{k:(v if k=='sign' else v.value) for k,v in p['branch'].items()}}
  for i,side in enumerate(('flat','space')):
   if side not in p:continue
   fields={}
   for key,a in p[side].items():
    v=vals(a);world=v*self.length
    if key=='c':world=world+np.array(self.origins[i])
    fields[key]=world.tolist();fields['normalized'+key[0].upper()+key[1:]]=v.tolist()
   row[side]=fields
  return row,p

 def inspect(self,p):
  mismatch=devL=devR=frame=0.;areas=[]
  for side in ('flat','space'):
   if side not in p:continue
   a={k:vals(x) for k,x in p[side].items()};frame=max(frame,abs(np.linalg.norm(a['rR'])*self.length-1))
   for ruling,width in [('rL',self.q['leftWidth']),('rR',self.q['rightWidth'])]:
    base=np.cross(a['cPrime'],a[ruling]) if side=='space' else np.array([np.linalg.det(np.column_stack([a['cPrime'],a[ruling]]))])
    slope=np.cross(a[ruling+'Prime'],a[ruling]) if side=='space' else np.array([np.linalg.det(np.column_stack([a[ruling+'Prime'],a[ruling]]))])
    # A real affine-vector focus is independently located, not a display chord intersection.
    b=float(slope@slope)
    at=min(width,max(0.,-float(base@slope)/b)) if b else 0.
    area=np.linalg.norm(base+at*slope);den=np.linalg.norm(a['cPrime'])*np.linalg.norm(a[ruling])
    if side=='flat' and base[0]*(base[0]+width*slope[0])<0:
     # Existence follows from the affine scalar Jacobian and independently
     # outward-enclosed opposite endpoint signs at this exact source s.
     narrow=self.point(Interval(p['parameter']))[side]
     lo=iv(cross2(narrow['cPrime'],narrow[ruling]).value)
     hi=iv(cross2(add(narrow['cPrime'],scale(narrow[ruling+'Prime'],width)),narrow[ruling]).value)
     if lo.lo>0 and hi.hi<0 or lo.hi<0 and hi.lo>0:
      raise AcrossError('finite-band-focus','原有限二维母线系数域的雅可比端点严格异号，证明带内存在真实焦线；不缩窄输入域。')
    if area==0:
     raise AcrossError('finite-band-resolution','有限带面积在binary64中为零，无法分辨真实焦线与算术退化；不声明一般几何无效。')
    areas.append(area/max(1.,den))
    if side=='space':
     d=abs(float(base@a[ruling+'Prime']))/max(1.,np.linalg.norm(a['cPrime'])*np.linalg.norm(a[ruling])*np.linalg.norm(a[ruling+'Prime']))
     if ruling=='rL':devL=max(devL,d)
     else:devR=max(devR,d)
  if self.q['mode']=='both':
   for ruling,width in [('rL',self.q['leftWidth']),('rR',self.q['rightWidth'])]:
    for v in (0.,width/2,width):
     metrics=[]
     for side in ('flat','space'):
      a={k:vals(x) for k,x in p[side].items()};xs=a['cPrime']+v*a[ruling+'Prime'];rv=a[ruling]*self.length
      metrics.append(np.array([xs@xs,xs@rv,rv@rv]))
     mismatch=max(mismatch,float(np.max(np.abs(metrics[0]-metrics[1])))/max(1.,float(np.max(np.abs(metrics)))))
  return mismatch,devL,devR,frame,min(areas)

 def domain(self):
  q=self.q;a,b=q['parameterStart'],q['parameterEnd'];initial=self.finite(a);self.branch=initial['branch']['sign']
  axes={}
  for side in ('flat','space'):
   if side not in initial:continue
   x=initial[side]
   for key in ('rL','rR'):
    area=cross(x['cPrime'],x[key]) if side=='space' else [cross2(x['cPrime'],x[key])]
    raw=vals(area);axes[(side,key)]=raw/np.linalg.norm(raw)
  stack=[(a,b,0)];cells=[];count=0;unknown=False;minimum=math.inf;selector=math.inf
  while stack:
   left,right,depth=stack.pop();count+=1
   if count>BUDGET:unknown=True;break
   try:
    p=self.point(Interval(left,right));margin=math.inf
    for side in ('flat','space'):
     if side not in p:continue
     x=p[side]
     for key,width in [('rL',q['leftWidth']),('rR',q['rightWidth'])]:
      ds=add(x['cPrime'],scale(x[key+'Prime'],Interval(0.,width)))
      area=cross(ds,x[key]) if side=='space' else [cross2(ds,x[key])]
      bound=iv(dot(area,axes[(side,key)]).value).lo
      if bound<=0:raise ValueError('finite-band regularity enclosure unresolved')
      margin=min(margin,bound)
    select=iv(p['branch']['selector'].value)*self.branch
    if select.lo<=0:raise ValueError('branch sign enclosure unresolved')
    minimum=min(minimum,margin);selector=min(selector,select.lo);cells.append({'start':left,'end':right})
   except (ValueError,OverflowError,ZeroDivisionError):
    self.inspect(self.finite((left+right)/2))
    if depth>=16 or right-left<1e-8:unknown=True;continue
    mid=(left+right)/2;stack.extend([(mid,right,depth+1),(left,mid,depth+1)])
  certified=not unknown
  return {'certified':certified,'evaluations':min(count,BUDGET+1),'verifiedCells':len(cells),'intervals':cells,
   'minimumAreaProjectionLowerBound':minimum if certified else None,'minimumBranchSelectorLowerBound':selector if certified else None,
   'branchSign':self.branch,'roundingModel':ROUNDING,'method':'outward-Taylor/source-branch/affine-width-area-projection',
   'reason':None if certified else 'interval proof budget unresolved; complete original source domain retained',
   'coordinateNormalization':{'flatOrigin':self.origins[0],'spaceOrigin':self.origins[1],'scale':self.length}}

def query_curved_generic_across_right(data):
 q=validate_curved_generic_across_query(data)
 try:
  kernel=AcrossKernel(q);domain=kernel.domain();rows=[];grid=[];maxima=np.zeros(4);min_area=math.inf
  for s in np.linspace(q['parameterStart'],q['parameterEnd'],129):
   point=kernel.finite(float(s));report=kernel.inspect(point);maxima=np.maximum(maxima,report[:4]);min_area=min(min_area,report[4])
  for s in np.linspace(q['parameterStart'],q['parameterEnd'],q['segments']+1):
   row,p=kernel.row(float(s));rows.append(row);points=[]
   for side,width in [('left',q['leftWidth']),('right',q['rightWidth'])]:
    key='rL' if side=='left' else 'rR'
    for v in np.linspace(0.,width,q['rulingSegments']+1):
     g={'s':float(s),'side':side,'v':float(v),'flat':None,'space':None,'normalizedFlat':None,'normalizedSpace':None}
     for i,name in enumerate(('flat','space')):
      if name not in p:continue
      n=vals(p[name]['c'])+float(v)*vals(p[name][key]);g[name]=(np.array(kernel.origins[i])+kernel.length*n).tolist();g['normalized'+name.capitalize()]=n.tolist()
     points.append(g)
   grid.append(points)
 except AcrossError:raise
 except (ValueError,OverflowError,ZeroDivisionError) as e:raise AcrossError('source-domain','原源式超出有限算术域或标架无法定义。') from e
 paired=q['mode']=='both';metric=bool(maxima[0]<=2e-8) if paired else None
 return {'family':FAMILY,'query':q,'source':{'notebookCells':{'2d':[3983,3986],'3d':[3991,3994],'both':[3998,4001]}[q['mode']],
  'savedNumericalOut':False,'method':'whitelist-AST/Taylor/original-AcrossRight-algebra','interpolationContract':'direct-source-derivatives/not-Wolfram-FunctionInterpolationAlt',
  'leftAmplitudeContract':'original-rL-returned/only-T-cross-rrL-normalized','widthContract':'positive-coefficient-v/each-side-0-to-width'},
  'diagnostics':{'validationNodes':129,'maximumPairMetricDifference':float(maxima[0]) if paired else None,
   'maximumLeftDevelopabilityError':float(maxima[1]) if kernel.active[1] else None,'maximumRightDevelopabilityError':float(maxima[2]) if kernel.active[1] else None,
   'maximumRightUnitError':float(maxima[3]),'minimumSampleAreaRatio':min_area,'pairStatus':'finite-numerical' if metric else 'incompatible' if paired else 'not-applicable',
   'pairReason':None if metric or not paired else 'supplied left pair or source right pair has unequal EFG; original inputs retained',
   'parameterDomain':domain},
  'certification':{'finiteSourceReadbackVerified':True,'finitePairMetricVerified':metric,'fullIntervalRegularityCertified':domain['certified'],
   'continuousSourceBranchCertified':domain['certified'],'analyticPairIsometry':False,'fullIntervalPairIsometryCertified':False,
   'leftInputDevelopabilityVerifiedAtNodes':bool(maxima[1]<=2e-8) if kernel.active[1] else None,
   'planarPaperInjectivityCertified':False,'selfCollisionChecked':False,'continuousFoldPathChecked':False,'exactStraightCreaseFOLD':False,'adoptableCreasePattern':False},
  'sample':{'rows':rows,'grid':grid}}
