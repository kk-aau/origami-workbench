"""In[4019] literal nine-rule ConicSection2DSystem, default None simplification.

Independent closed parameter components are never joined through a pole. The
interval certificate is an engineering binary64 enclosure, not a Wolfram
symbolic-options or machine-checked real-arithmetic certificate.
"""
import math
import mpmath as mp
from tessellation_curved_generic_linked_expression import Taylor,GenericLinkedError
from tessellation_curved_generic_darboux import IntervalTaylor,ROUNDING
from tessellation_curved_linked_common_interval import Interval,down,up

FAMILY='conic-section-2d-native'
RESULT_FAMILY='origamica-conic-section-2d'
KEYS=('CurvedFold2D','DirectrixLeft2D','DirectorLeft2D','CrossCurveLeft2D','SecondCrossCurveLeft2D',
      'DirectrixRight2D','DirectorRight2D','CrossCurveRight2D','SecondCrossCurveRight2D')
POSITION_INDICES=(0,1,3,4,5,7,8)
BUDGET=1023
PRESET=dict(family=FAMILY,leftFocus=-2.5,rightFocus=-.75,leftCross=-1.2,rightCross=.9,
            parameterRanges=[[-.7,1.]],segments=48)

class GenericConicSectionError(GenericLinkedError):pass

def _focus(value,side):
 if isinstance(value,dict):
  if set(value)=={'infinity'} and type(value['infinity']) is int and value['infinity']==(-1 if side=='left' else 1):return value.copy()
  raise GenericConicSectionError('focus-contract','原左焦点只允许−∞，右焦点只允许+∞；使用显式Infinity标签。')
 if type(value) not in (int,float) or not math.isfinite(value) or value==0 or abs(value)>1e6:
  raise GenericConicSectionError('focus-contract','焦点须为非零有限实数（±10⁶内），或该侧允许的显式Infinity标签。')
 return float(value)

def validate_generic_conic_section_query(data):
 if not isinstance(data,dict) or data.get('family')!=FAMILY or set(data)!=set(PRESET):
  raise GenericConicSectionError('input-contract','需完整四个原光学参数、所有独立闭域与显示密度；未知字段不接受。')
 q=dict(data);q['leftFocus']=_focus(q['leftFocus'],'left');q['rightFocus']=_focus(q['rightFocus'],'right')
 for key in ('leftCross','rightCross'):
  if type(q[key]) not in (int,float) or not math.isfinite(q[key]) or abs(q[key])>1e6:
   raise GenericConicSectionError('input-contract','hL/hR须为±10⁶内的有限实数，不限制符号或顺序。')
  q[key]=float(q[key])
 ranges=q['parameterRanges']
 if not isinstance(ranges,list) or not 1<=len(ranges)<=4:raise GenericConicSectionError('input-contract','须给1–4个真正独立闭域；不自动剪域或桥接双支。')
 for pair in ranges:
  if not isinstance(pair,list) or len(pair)!=2 or any(type(x) not in (int,float) or not math.isfinite(x) for x in pair) or not -10<=pair[0]<pair[1]<=10 or not .01<=pair[1]-pair[0]<=12:
   raise GenericConicSectionError('input-contract','各参数闭域须递增、在−10…10内且跨度0.01–12。')
 if any(max(a[0],b[0])<=min(a[1],b[1]) for i,a in enumerate(ranges) for b in ranges[i+1:]):
  raise GenericConicSectionError('input-contract','独立闭域不能重叠；保输入域的索引和次序。')
 q['parameterRanges']=[[float(x) for x in pair] for pair in ranges]
 if type(q['segments']) is not int or not 8<=q['segments']<=128:raise GenericConicSectionError('input-contract','每域显示段数须为8–128。')
 return q

def _branch(q):
 l,r=q['leftFocus'],q['rightFocus']
 if isinstance(l,dict) and isinstance(r,dict):return 'line'
 if not isinstance(l,dict) and not isinstance(r,dict) and l==r:return 'circle'
 if isinstance(l,dict):return 'parabola-left'
 if isinstance(r,dict):return 'parabola-right'
 return 'ellipse' if (l>0)==(r>0) else 'degenerate-line' if l+r==0 else 'hyperbola'

def _scale(q,branch):
 values=[abs(q['leftCross']),abs(q['rightCross'])]+[abs(q[k]) for k in ('leftFocus','rightFocus') if not isinstance(q[k],dict)]
 if branch in ('line','parabola-left','parabola-right'):values += [abs(t) for pair in q['parameterRanges'] for t in pair]
 scale=max(values)
 if not math.isfinite(scale) or scale<=0:raise GenericConicSectionError('source-numerics','原源没有可用的有限几何尺度。')
 return scale

def _pole_enclosures(q,branch):
 if branch not in ('ellipse','hyperbola','degenerate-line'):return []
 poles=[]
 with mp.workdps(80):
  l,r=mp.mpf(q['leftFocus']),mp.mpf(q['rightFocus'])
  roots=[('literal-half-angle',mp.pi+2*k*mp.pi) for k in range(-3,3)]
  if (l>0)!=(r>0):
   angle=2*mp.atan2(mp.sqrt(abs(r)),mp.sqrt(abs(l)));roots += [('fold-denominator',sign*angle+2*k*mp.pi) for k in range(-3,3) for sign in (-1,1)]
  for kind,t in sorted(roots,key=lambda x:x[1]):
   if not -10<=t<=10:continue
   value=float(t);lo=math.nextafter(down(value),-math.inf);hi=math.nextafter(up(value),math.inf)
   for i,(a,b) in enumerate(q['parameterRanges']):
    if mp.mpf(a)<t<mp.mpf(b) and min(t-mp.mpf(a),mp.mpf(b)-t)>mp.mpf('1e-65'):
     raise GenericConicSectionError('source-pole',f'原第{i+1}闭域穿过{kind}真实极点[{lo:.17g},{hi:.17g}]；保原域拒绝，不剪域或连接双支。')
   poles.append(dict(kind=kind,parameterEnclosure=[lo,hi]))
 return poles

def _literal_rows(q,branch,scale,parameter):
 T=IntervalTaylor if isinstance(parameter,Interval) else Taylor;t=T.variable(parameter,1)
 zero=T.constant(0,1);hl=q['leftCross']/scale;hr=q['rightCross']/scale
 l=None if isinstance(q['leftFocus'],dict) else q['leftFocus']/scale;r=None if isinstance(q['rightFocus'],dict) else q['rightFocus']/scale
 sine,cosine=t.sincos();half_sine,half_cosine=(t/2).sincos()
 if branch=='line':
  y=t/scale;f=[zero,y];cl=el=[zero+hl,y];cr=er=[zero+hr,y];dl=dr=[zero-1,zero]
 elif branch=='circle':
  f=[2*l*half_sine*half_sine,-l*sine];cl=cr=[zero+l,zero];dl=dr=[-cosine,-sine]
  el=[l+(hl-l)*cosine,(hl-l)*sine];er=[l+(hr-l)*cosine,(hr-l)*sine]
 elif branch in ('parabola-left','parabola-right'):
  y=t/scale;a=r if branch=='parabola-left' else l;d=4*a*a+y*y
  f=[y*y/(4*a),y];h=hr if branch=='parabola-left' else hl
  finite_cross=[zero+a,zero];finite_d=[1-8*a*a/d,4*a*y/d];finite_second=[(4*a*a*h+(2*a-h)*y*y)/d,4*a*(a-h)*y/d]
  if branch=='parabola-left':cl=el=[zero+hl,y];dl=[zero-1,zero];cr=finite_cross;dr=finite_d;er=finite_second
  else:cr=er=[zero+hr,y];dr=[zero-1,zero];cl=finite_cross;dl=finite_d;el=finite_second
 else:
  # Equal real formulas, with the original denominators still evaluated and
  # their holes retained. No half-angle continuation or changed Simplification.
  denominator=2*l*half_sine*half_sine+2*r*half_cosine*half_cosine
  tangent=(t/2).tan();d=r*r+l*l*tangent*tangent
  f=[2*l*(l+r)*half_sine*half_sine/denominator,-2*l*r*sine/denominator]
  cl=[zero+l,zero];dl=[-cosine,-sine];el=[l+(hl-l)*cosine,(hl-l)*sine]
  cr=[zero+r,zero];dr=[1-2*r*r/d,-2*l*r*tangent/d]
  er=[-hr+2*r*(1+r*(hr-r)/d),2*l*r*(hr-r)*tangent/d]
 return [f,cl,dl,cl,el,cr,dr,cr,er]

def _norm_bounds(row):
 intervals=[Interval.cast(x) for x in row]
 low=[0. if x.lo<=0<=x.hi else min(abs(x.lo),abs(x.hi)) for x in intervals];high=[max(abs(x.lo),abs(x.hi)) for x in intervals]
 return [max(0.,down(math.hypot(*low))),up(math.hypot(*high))]

def _domain(q,branch,scale,poles):
 cells=[];unresolved=[];evaluations=0
 stack=[(i,*pair) for i,pair in reversed(list(enumerate(q['parameterRanges'])))]
 while stack:
  i,a,b=stack.pop();evaluations+=1
  if evaluations>BUDGET:unresolved.extend([dict(rangeIndex=j,start=x,end=y) for j,x,y in [(i,a,b),*stack]]);break
  try:
   rows=_literal_rows(q,branch,scale,Interval(a,b));bounds=[[[Interval.cast(x.value).lo,Interval.cast(x.value).hi] for x in row] for row in rows]
   speed=_norm_bounds([x.derivative().value for x in rows[0]])
   if any(not math.isfinite(x) for row in bounds for pair in row for x in pair) or not all(math.isfinite(x) for x in speed):raise ValueError('nonfinite hull')
   cells.append(dict(rangeIndex=i,start=a,end=b,normalizedRuleBounds=bounds,normalizedFoldSpeedBounds=speed))
  except (ValueError,OverflowError,ZeroDivisionError):
   mid=(a+b)/2
   if b-a<(q['parameterRanges'][i][1]-q['parameterRanges'][i][0])*2**-22 or mid==a or mid==b:
    unresolved.append(dict(rangeIndex=i,start=a,end=b));continue
   stack.extend(((i,mid,b),(i,a,mid)))
 complete=not unresolved;minimum=min((c['normalizedFoldSpeedBounds'][0] for c in cells),default=0.) if complete else None
 return dict(certified=complete,roundingModel=ROUNDING,evaluations=min(evaluations,BUDGET+1),verifiedCells=len(cells),cells=cells,unresolved=unresolved,
             minimumNormalizedFoldSpeedLowerBound=minimum,foldRegularity='verified' if complete and minimum>0 else 'unknown',
             reason=None if complete else 'complete original domains retained; interval subdivision budget unresolved')

def _residuals(q,branch,scale,rows,prime):
 f=rows[0];l=None if isinstance(q['leftFocus'],dict) else q['leftFocus']/scale;r=None if isinstance(q['rightFocus'],dict) else q['rightFocus']/scale
 x,y=f
 if branch=='line':implicit=abs(x)
 elif branch in ('parabola-left','parabola-right'):
  a=r if branch=='parabola-left' else l;terms=[4*a*x,-y*y];implicit=abs(math.fsum(terms))/math.fsum(abs(z) for z in terms) if any(terms) else 0.
 else:
  local=max(abs(l),abs(r),abs(x),abs(y));a,b,z,w=l/local,r/local,x/local,y/local
  terms=[4*a*b*z*z,-4*a*b*(a+b)*z,(a+b)**2*w*w];implicit=abs(math.fsum(terms))/math.fsum(abs(z) for z in terms) if any(terms) else 0.
 unit=collinear=0.
 for base,second,d in ((rows[1],rows[4],rows[2]),(rows[5],rows[8],rows[6])):
  unit=max(unit,abs(math.hypot(*d)-1));ray=[f[k]-base[k] for k in range(2)];other=[second[k]-base[k] for k in range(2)]
  for v in (ray,other):
   den=math.hypot(*v);value=abs(v[0]*d[1]-v[1]*d[0])/den if den else 0.;collinear=max(collinear,value)
 tangent_norm=math.hypot(*prime);t=[x/tangent_norm for x in prime] if tangent_norm else [0.,0.]
 projections=[sum(a*b for a,b in zip(t,rows[k])) for k in (2,6)]
 return implicit,unit,collinear,abs(projections[0]**2-projections[1]**2)

def query_generic_conic_section(data):
 q=validate_generic_conic_section_query(data);branch=_branch(q);scale=_scale(q,branch);poles=_pole_enclosures(q,branch)
 for i,(a,b) in enumerate(q['parameterRanges']):
  for pole in poles:
   lo,hi=pole['parameterEnclosure']
   if a<lo and hi<b:
    raise GenericConicSectionError('source-pole',f'原第{i+1}闭域穿过{pole["kind"]}真实极点[{lo:.17g},{hi:.17g}]；保原域拒绝，不剪域或连接双支。')
 components=[];maximum=[0.,0.,0.,0.]
 for i,(a,b) in enumerate(q['parameterRanges']):
  samples=[]
  for j in range(q['segments']+1):
   t=b if j==q['segments'] else a+(b-a)*j/q['segments']
   try:
    jets=_literal_rows(q,branch,scale,t);normalized=[[float(x.value) for x in row] for row in jets];derivatives=[[float(x.c[1]) for x in row] for row in jets]
    if not all(math.isfinite(x) for row in normalized+derivatives for x in row):raise ValueError('nonfinite source')
    world=[[x*scale if k in POSITION_INDICES else x for x in row] for k,row in enumerate(normalized)]
    world_prime=[[x*scale if k in POSITION_INDICES else x for x in row] for k,row in enumerate(derivatives)]
    if not all(math.isfinite(x) for row in world+world_prime for x in row):raise ValueError('nonfinite source units')
    residuals=_residuals(q,branch,scale,normalized,derivatives[0]);maximum=[max(x,y) for x,y in zip(maximum,residuals)]
    samples.append(dict(t=t,rules=world,derivatives=world_prime,normalizedRules=normalized,normalizedDerivatives=derivatives))
   except (ValueError,OverflowError,ZeroDivisionError) as exc:
    raise GenericConicSectionError('source-numerics',f'原第{i+1}域t={t:.17g}未能有限求值九规则；不替换焦点、分母或原无穷参数。') from exc
  components.append(dict(rangeIndex=i,parameterRange=[a,b],samples=samples))
 domain=_domain(q,branch,scale,poles)
 return dict(family=RESULT_FAMILY,query=q,source=dict(definitionCell='In[4019]',optionsCell='In[4018]',function='ConicSection2DSystem',
             ruleKeys=list(KEYS),branch=branch,simplification='None',unreachableRepeatedCircleConditionPreserved=True,
             numericWolframOutAvailable=False,halfAngleContinuationApplied=False,
             parameterMeaning='signed-length' if branch in ('line','parabola-left','parabola-right') else 'angle-radians'),
             normalization=dict(origin=[0.,0.],scale=scale),domain=domain,poleEnclosures=poles,components=components,
             diagnostics=dict(maximumRelativeImplicitConicResidual=maximum[0],maximumDirectorUnitError=maximum[1],
                              maximumRayCollinearityResidual=maximum[2],maximumSquaredOpticalProjectionResidual=maximum[3]),
             certification=dict(literalNineRulesEvaluated=True,independentRangesPreserved=True,finiteNumericalRulesVerified=True,
                                fullOriginalDomainsCertified=domain['certified'],selfCollisionVerified=False,motionVerified=False,
                                sampledMeshExactFOLD=False,adoptableCreasePattern=False))
