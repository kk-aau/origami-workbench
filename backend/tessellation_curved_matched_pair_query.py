"""Bounded numerical MatchCurvesPair / NMatchCurvesPair (In[3864]/[3867]).

The two source curves are given, not integrated. Frenet/Darboux algebra selects
the requested constant psi branch and constructs both real ruled patches.
Interval regularity, speed identity, and sufficient global paper injectivity
are separate claims; an unresolved sufficient proof retains the read-only data.
"""
import ast
import math

import numpy as np
import sympy as sp

from tessellation_curved_generic_linked_expression import Expression, GenericLinkedError, Taylor
from tessellation_curved_linked_common_interval import Interval

FAMILY='curved-matched-pair'
VARIANT='generic-native'
ROUNDING='binary64-outward-2ulp/libm-endpoints-2ulp-assumed'
CERTIFICATION_BUDGET=1023
SPEED_TOLERANCE=1e-9
PRESET={'family':FAMILY,'variant':VARIANT,
        'flatCurve':['2*cos(s/2)','2*sin(s/2)'],
        'spaceCurve':['cos(s)','sin(s)','1'],'psi':1,'sigma':1,
        'parameterStart':0.,'parameterEnd':math.pi,'transverseStart':-1.,'transverseEnd':1.,
        'segments':32,'rulingSegments':16}
NONCIRCULAR_PRESET={**PRESET,'flatCurve':['2-4*log(1+s**2/16)','8*atan(s/4)-s'],
        'spaceCurve':['0.5+0.5*cos(4*s/sqrt(5))','sin(4*s/sqrt(5))/sqrt(5)+s/5',
                      '1-sin(4*s/sqrt(5))/(2*sqrt(5))+2*s/5']}


class MatchedPairError(GenericLinkedError):
    pass


def validate_curved_matched_pair_query(data):
    if not isinstance(data,dict) or set(data)-set(PRESET):
        raise MatchedPairError('input-contract','匹配曲线须为仅含已支持字段的对象。')
    out={**PRESET,**data}
    if out['family']!=FAMILY or out['variant']!=VARIANT:
        raise MatchedPairError('input-contract','匹配曲线类型或变体无效。')
    for key,size in [('flatCurve',2),('spaceCurve',3)]:
        values=out[key]
        if not isinstance(values,list) or len(values)!=size:
            raise MatchedPairError('input-contract','平面/空间曲线须完整包含2/3个标量源表达式。')
        for source in values:Expression(source,'s')
        out[key]=list(values)
    for key in ('psi','sigma'):
        if type(out[key]) is not int or out[key] not in (-1,1):
            raise MatchedPairError('input-contract','ψ、σ须为固定的整数−1或+1。')
    for key in ('parameterStart','parameterEnd','transverseStart','transverseEnd'):
        value=out[key]
        if type(value) not in (int,float) or not math.isfinite(value):
            raise MatchedPairError('input-contract','共同参数与横向域端点须为有限数。')
        out[key]=float(value)
    a,b=out['parameterStart'],out['parameterEnd']
    if not -10<=a<b<=10 or not .01<=b-a<=12:
        raise MatchedPairError('input-contract','共同s域须在−10…10内，长度0.01–12。')
    c,d=out['transverseStart'],out['transverseEnd']
    if not -1e6<=c<d<=1e6:
        raise MatchedPairError('input-contract','横向域须递增并位于−10⁶…10⁶内。')
    for key,low,high in [('segments',8,128),('rulingSegments',2,64)]:
        if type(out[key]) is not int or not low<=out[key]<=high:
            raise MatchedPairError('input-contract','显示曲线段须8–128，横向段须2–64。')
    if out['rulingSegments']%2:
        raise MatchedPairError('input-contract','横向显示段数须为偶数。')
    return out


def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross2(a,b):return a[0]*b[1]-a[1]*b[0]
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def scale(a,k):return [x*k for x in a]
def add(a,b):return [x+y for x,y in zip(a,b)]
def value(a):return np.array([x.value for x in a],dtype=float)
def iv(x):return Interval.cast(x)
def magnitude(a):return dot(a,a).sqrt()


def algebraic_budget(node):
    if isinstance(node,ast.Constant):return 0
    if isinstance(node,ast.Name):return 1 if node.id=='s' else 0
    if isinstance(node,ast.UnaryOp):return algebraic_budget(node.operand)
    if isinstance(node,ast.Call):return max(1,algebraic_budget(node.args[0]))
    a=algebraic_budget(node.left)
    if isinstance(node.op,ast.Pow):return max(1,a)*max(1,abs(Expression._integer(node.right)))
    b=algebraic_budget(node.right)
    return a+b if isinstance(node.op,(ast.Mult,ast.Div)) else max(a,b)


def symbolic_node(node,variable):
    functions={'sin':sp.sin,'cos':sp.cos,'tan':sp.tan,'atan':sp.atan,'sqrt':sp.sqrt,'log':sp.log,'exp':sp.exp}
    if isinstance(node,ast.Constant):return sp.Rational(str(node.value))
    if isinstance(node,ast.Name):return variable if node.id=='s' else sp.pi if node.id=='pi' else sp.E
    if isinstance(node,ast.UnaryOp):return -symbolic_node(node.operand,variable) if isinstance(node.op,ast.USub) else symbolic_node(node.operand,variable)
    if isinstance(node,ast.Call):return functions[node.func.id](symbolic_node(node.args[0],variable))
    a=symbolic_node(node.left,variable)
    if isinstance(node.op,ast.Pow):return a**Expression._integer(node.right)
    b=symbolic_node(node.right,variable)
    if isinstance(node.op,ast.Add):return a+b
    if isinstance(node.op,ast.Sub):return a-b
    if isinstance(node.op,ast.Mult):return a*b
    return a/b


def simplified(expr):
    if sp.count_ops(expr)>320:raise ValueError('symbolic invariant budget')
    # Deterministic algebra plus only sin(a)^2+cos(a)^2=1. In particular
    # never expand a numeric harmonic or run an open-ended trig heuristic.
    def terms(x):
        if isinstance(x,sp.Add):return min(4097,sum(terms(a) for a in x.args))
        if isinstance(x,sp.Mul):
            result=1
            for a in x.args:result=min(4097,result*terms(a))
            return result
        if isinstance(x,sp.Pow) and x.exp.is_Integer:return min(4097,terms(x.base)**abs(int(x.exp)))
        return 1
    if terms(expr)>4096:raise ValueError('symbolic expansion term budget')
    result=sp.cancel(expr)
    arguments={f.args[0] for f in result.atoms(sp.sin,sp.cos)}
    replacements={};reverse={};pairs=[]
    for i,argument in enumerate(sorted(arguments,key=sp.default_sort_key)):
        sn,cs=sp.Dummy(f'sn{i}'),sp.Dummy(f'cs{i}')
        replacements[sp.sin(argument)]=sn;replacements[sp.cos(argument)]=cs
        reverse[sn]=sp.sin(argument);reverse[cs]=sp.cos(argument);pairs.append((sn,cs))
    numerator,denominator=sp.fraction(result.xreplace(replacements))
    for sn,cs in pairs:
        relation=sp.Poly(sn**2+cs**2-1,sn)
        numerator=sp.rem(sp.Poly(numerator,sn),relation).as_expr()
        denominator=sp.rem(sp.Poly(denominator,sn),relation).as_expr()
    if denominator==0:raise ValueError('undefined symbolic denominator')
    result=sp.cancel((numerator/denominator).xreplace(reverse))
    if sp.count_ops(result)>320:raise ValueError('symbolic invariant budget')
    return result


def invariant_expression(expr):
    """Translate generated invariant nodes back to the same scalar evaluator."""
    def number(n):return ast.Constant(value=int(n))
    def binary(op,a,b):return ast.BinOp(left=a,op=op,right=b)
    def call(name,a):return ast.Call(func=ast.Name(id=name,ctx=ast.Load()),args=[a],keywords=[])
    def convert(x):
        if isinstance(x,sp.Rational):
            return number(x.p) if x.q==1 else binary(ast.Div(),number(x.p),number(x.q))
        if x==sp.pi:return ast.Name(id='pi',ctx=ast.Load())
        if x==sp.E:return ast.Name(id='e',ctx=ast.Load())
        if isinstance(x,sp.Symbol):return ast.Name(id='s',ctx=ast.Load())
        if isinstance(x,(sp.Add,sp.Mul)):
            result=convert(x.args[0])
            for argument in x.args[1:]:result=binary(ast.Add() if isinstance(x,sp.Add) else ast.Mult(),result,convert(argument))
            return result
        if isinstance(x,sp.Pow):
            base,exponent=x.args
            if exponent.q==1:return binary(ast.Pow(),convert(base),number(exponent.p))
            if exponent.q==2:return binary(ast.Pow(),call('sqrt',convert(base)),number(exponent.p))
            raise ValueError('unsupported generated exponent')
        if x.func==sp.Abs:return call('sqrt',binary(ast.Pow(),convert(x.args[0]),number(2)))
        names={sp.sin:'sin',sp.cos:'cos',sp.tan:'tan',sp.atan:'atan',sp.log:'log',sp.exp:'exp'}
        if x.func in names:return call(names[x.func],convert(x.args[0]))
        raise ValueError('unsupported generated invariant')
    tree=convert(expr)
    if len(list(ast.walk(tree)))>1200:raise ValueError('invariant AST budget')
    result=object.__new__(Expression);result.tree=tree;result.variable='s';result.source='<derived-invariant>'
    return result


def analytic_speed_identity(curves):
    """Prove an identity from checked ASTs, never from samples or preset text.

    Construct SymPy nodes directly from the fixed whitelist; no sympify, eval,
    parsing callbacks or user-provided names. Bound derivative tree size and
    algebraic degree before rational cancellation and polynomial reduction by
    sin(a)^2 + cos(a)^2 = 1. No heuristic trig expansion is invoked.
    Failure is unknown, not evidence of a speed mismatch.
    """
    variable=sp.Symbol('s',real=True)
    functions={'sin':sp.sin,'cos':sp.cos,'tan':sp.tan,'atan':sp.atan,
               'sqrt':sp.sqrt,'log':sp.log,'exp':sp.exp}
    def convert(node):
        if isinstance(node,ast.Constant):return sp.Rational(str(node.value))
        if isinstance(node,ast.Name):return variable if node.id=='s' else sp.pi if node.id=='pi' else sp.E
        if isinstance(node,ast.UnaryOp):return -convert(node.operand) if isinstance(node.op,ast.USub) else convert(node.operand)
        if isinstance(node,ast.Call):return functions[node.func.id](convert(node.args[0]))
        a=convert(node.left)
        if isinstance(node.op,ast.Pow):return a**Expression._integer(node.right)
        b=convert(node.right)
        if isinstance(node.op,ast.Add):return a+b
        if isinstance(node.op,ast.Sub):return a-b
        if isinstance(node.op,ast.Mult):return a*b
        return a/b
    try:
        derivatives=[[f.derivative().tree for f in group] for group in curves]
        if sum(len(list(ast.walk(n))) for group in derivatives for n in group)>640:
            return False
        if any(algebraic_budget(n)>16 for group in derivatives for n in group):return False
        squares=[sum(convert(n)**2 for n in group) for group in derivatives]
        difference=squares[0]-squares[1]
        if sp.count_ops(difference)>320:return False
        return simplified(difference)==0
    except (ValueError,TypeError,ZeroDivisionError,RecursionError,OverflowError,sp.PolynomialError,NotImplementedError):
        return False


class MatchedKernel:
    def __init__(self,query):
        self.query=query
        self.curves=[[Expression(source,'s') for source in query[key]] for key in ('flatCurve','spaceCurve')]
        self.start=query['parameterStart']
        self.parts=[[fn.affine_parts(Taylor.variable(self.start,1)) for fn in group] for group in self.curves]
        self.origins=[np.array([math.fsum(offsets)+dynamic.value for offsets,dynamic in group]) for group in self.parts]
        first=[fn.derivative()(Taylor.constant(self.start,0)).value for fn in self.curves[0]]
        self.world_scale=math.hypot(*first)
        if not math.isfinite(self.world_scale) or self.world_scale<=0:
            raise MatchedPairError('speed-singularity','平面起点速度为0，无法定义匹配标架。')
        self.analytic_speed=bool(analytic_speed_identity(self.curves))
        self.invariants=None
        try:
            if any(algebraic_budget(f.tree)>16 for group in self.curves for f in group):
                raise ValueError('symbolic source degree budget')
            variable=sp.Symbol('s',real=True)
            coordinates=[[symbolic_node(f.tree,variable) for f in group] for group in self.curves]
            cp,ccp=[[sp.diff(f,variable) for f in group] for group in coordinates]
            cpp,ccpp=[[sp.diff(f,variable) for f in group] for group in (cp,ccp)]
            third=[sp.diff(f,variable) for f in ccpp]
            v2sq=simplified(dot(cp,cp));v3sq=simplified(dot(ccp,ccp))
            area=cross(ccp,ccpp);area2=simplified(dot(area,area))
            length=sp.Rational(str(self.world_scale))
            expressions=[v2sq/length**2,v3sq/length**2,
                         cross2(cp,cpp)*length/(v2sq**sp.Rational(3,2)),
                         area2*length**2/(v3sq**3),dot(area,third)*length/area2]
            self.invariants=[invariant_expression(simplified(expression)) for expression in expressions]
        except (ValueError,TypeError,ZeroDivisionError,RecursionError,OverflowError,sp.PolynomialError,NotImplementedError):pass

    def coordinates(self,index,s):
        result=[]
        for fn,(origin_offsets,origin_dynamic) in zip(self.curves[index],self.parts[index]):
            offsets,dynamic=fn.affine_parts(s)
            shift=math.fsum(offsets+[-x for x in origin_offsets])
            result.append((dynamic-origin_dynamic.value+shift)*(1/self.world_scale))
        return result

    def point(self,argument):
        s=Taylor.variable(argument,4)
        c,cc=[self.coordinates(i,s) for i in range(2)]
        cp=[x.derivative() for x in c];cpp=[x.derivative() for x in cp]
        ccp=[x.derivative() for x in cc];ccpp=[x.derivative() for x in ccp]
        if self.invariants:
            v2sq,v3sq,kl,ksq,tau=[f(s) for f in self.invariants]
            v2=v2sq.sqrt();v3=v3sq.sqrt()
        else:
            v2=magnitude(cp);v3=magnitude(ccp)
        if not isinstance(argument,Interval):
            relative=abs(v2.value*v2.value-v3.value*v3.value)/max(1.,v2.value*v2.value,v3.value*v3.value)
            if relative>2e-8:
                raise MatchedPairError('speed-mismatch','原同参数下两条源曲线速度不等；须显式重参数，不能自动换曲线。')
        t=scale(cp,1/v2);l=[-t[1],t[0]]
        T=scale(ccp,1/v3);area=cross(ccp,ccpp);area_length=magnitude(area)
        B=scale(area,1/area_length);N=cross(B,T)
        if self.invariants:k=ksq.sqrt()
        else:
            kl=cross2(cp,cpp)/(v2**3);k=area_length/(v3**3)
            third=[x.derivative() for x in ccpp];tau=dot(area,third)/dot(area,area)
        gap=k*k-kl*kl
        if not isinstance(argument,Interval) and gap.value<=0:
            raise MatchedPairError('curvature-gap','空间曲率须严格大于平面左曲率的绝对值；该分支已触0或无实数解。')
        C=kl/k;S=self.query['psi']*gap.sqrt()/k
        L=add(scale(N,C),scale(B,-S));U=add(scale(N,S),scale(B,C))
        # Exact Frenet identities avoid repeatedly differentiating an interval
        # normalized frame: U'=-v3*k*S*T+(eta'-v3*tau)*L.
        A=-v3*k*S;Q=-C.derivative()/S-v3*tau;H=(A*A+Q*Q).sqrt()
        av=iv(A.value)
        if av.lo<=0<=av.hi:
            raise ValueError('ruling tangent component cannot be bounded away from zero')
        sign=1 if av.lo>0 else -1
        p=-sign*Q/H;r=sign*A/H
        sigma=self.query['sigma']
        d=scale(add(scale(t,p),scale(l,r)),sigma)
        dd=scale(add(scale(T,p),scale(L,r)),sigma)
        return {'c':c,'cc':cc,'cPrime':cp,'ccPrime':ccp,'d':d,'dd':dd,
                'dPrime':[x.derivative() for x in d],'ddPrime':[x.derivative() for x in dd],
                'v2':v2,'v3':v3,'kl':kl,'k':k,'gap':gap,'H':H,
                'p':p,'r':r,'t':t,'T':T,'L':L,'U':U}

    def finite_point(self,s):
        try:return self.point(s)
        except MatchedPairError:raise
        except (ValueError,OverflowError,ZeroDivisionError) as error:
            raise MatchedPairError('frame-singularity','源曲线速度、Frenet标架或匹配母线在该共同参数处退化。') from error

    def regular_domain(self):
        a,b=self.query['parameterStart'],self.query['parameterEnd']
        w0,w1=[self.query[key]/self.world_scale for key in ('transverseStart','transverseEnd')]
        initial=self.finite_point(a);mid=(w0+w1)/2
        reference=cross2(add(initial['cPrime'],scale(initial['dPrime'],mid)),initial['d']).value
        if abs(reference)<1e-12:raise MatchedPairError('paper-singularity','有限纸带起点横向中部落在焦线上。')
        orientation=1 if reference>0 else -1
        axis0=value(initial['t']);axis1=orientation*np.array([-axis0[1],axis0[0]])
        stack=[(a,b,0)];evaluations=0;intervals=[];unresolved=False;paper=True
        minimum={key:math.inf for key in ('Speed','Curvature','CurvatureGap','UDerivative','Jacobian','PaperSymmetricDeterminant')}
        max_speed_difference=0.;max_metric_bound=0.
        while stack:
            left,right,depth=stack.pop();evaluations+=1
            if evaluations>CERTIFICATION_BUDGET:
                unresolved=True;break
            try:
                point=self.point(Interval(left,right))
                speed=min(iv(point[k].value).lo for k in ('v2','v3'))
                curvature=iv(point['k'].value).lo;gap=iv(point['gap'].value).lo;H=iv(point['H'].value).lo
                w=Interval(w0,w1)
                ds=add(point['cPrime'],scale(point['dPrime'],w))
                pp=iv(point['p'].derivative().value);rp=iv(point['r'].derivative().value)
                p=iv(point['p'].value);r=iv(point['r'].value)
                g=iv((point['v2']*point['kl']).value)
                jac=(self.query['sigma']*iv(point['v2'].value)*r+w*(r*pp-p*rp-g))*orientation
                if min(speed,curvature,gap,H,jac.lo)<=0:raise ValueError('regularity hull unresolved')
                x=iv(dot(ds,axis0).value);y=iv(dot(point['d'],axis1).value)
                off=(iv(dot(point['d'],axis0).value)+iv(dot(ds,axis1).value))/2
                determinant=x*y-off*off
                paper=paper and min(x.lo,y.lo,determinant.lo)>0
                vals={'Speed':speed,'Curvature':curvature,'CurvatureGap':gap,'UDerivative':H,
                      'Jacobian':jac.lo,'PaperSymmetricDeterminant':determinant.lo}
                for key,v in vals.items():minimum[key]=min(minimum[key],v)
                if not self.analytic_speed:
                    difference=iv((point['v2']*point['v2']-point['v3']*point['v3']).value)
                    bound=max(abs(difference.lo),abs(difference.hi))/max(1.,speed*speed)
                    max_speed_difference=max(max_speed_difference,bound)
                    # Factor E2-E3 and F2-F3 by speed difference; unlike
                    # subtracting two broad EFG hulls this retains cancellation.
                    speed_delta=difference/(iv(point['v2'].value)+iv(point['v3'].value))
                    pp=iv(point['p'].derivative().value);rp=iv(point['r'].derivative().value)
                    p=iv(point['p'].value);r=iv(point['r'].value);kl=iv(point['kl'].value)
                    vtotal=iv(point['v2'].value)+iv(point['v3'].value);sigma=self.query['sigma']
                    e=speed_delta*(vtotal*(1-2*sigma*w*r*kl+w*w*kl*kl)+2*sigma*w*pp+2*w*w*kl*(-r*pp+p*rp))
                    f=speed_delta*p
                    max_metric_bound=max(max_metric_bound,abs(e.lo),abs(e.hi),abs(f.lo),abs(f.hi))
                intervals.append({'start':left,'end':right})
            except (ValueError,OverflowError,ZeroDivisionError):
                # A real singularity or focus visible at the cell midpoint
                # remains an error. Otherwise subdivision may be conservative.
                point=self.finite_point((left+right)/2)
                endpoints=[orientation*cross2(add(point['cPrime'],scale(point['dPrime'],w)),point['d']).value for w in (w0,w1)]
                if min(endpoints)<=0:
                    raise MatchedPairError('paper-singularity','有限横向域穿过母线焦线或雅可比倒向；不缩窄原纸带。')
                if depth>=18 or right-left<1e-8:
                    unresolved=True;continue
                middle=(left+right)/2
                stack.extend([(middle,right,depth+1),(left,middle,depth+1)])
        certified=not unresolved
        if not certified:paper=False
        def lower(key):return minimum[key] if certified and math.isfinite(minimum[key]) else None
        domain={'certified':certified,'evaluations':min(evaluations,CERTIFICATION_BUDGET+1),
                'verifiedCells':len(intervals),'intervals':intervals,
                **{f'minimum{k}LowerBound':lower(k) for k in ('Speed','Curvature','CurvatureGap','UDerivative','Jacobian')},
                'jacobianOrientation':orientation,'roundingModel':ROUNDING,
                'reason':None if certified else 'interval regularity subdivision budget unresolved; original domain retained',
                'planarPaperInjective':paper,'minimumPaperSymmetricDeterminantLowerBound':lower('PaperSymmetricDeterminant'),
                'paperMethod':'positive-symmetric-Jacobian/common-rectangle','paperAxes':[axis0.tolist(),axis1.tolist()],
                'coordinateNormalization':{'flatOrigin':self.origins[0].tolist(),'spaceOrigin':self.origins[1].tolist(),'scale':self.world_scale}}
        numeric_speed=certified and max_speed_difference<=SPEED_TOLERANCE and max_metric_bound<=SPEED_TOLERANCE
        status='analytic' if self.analytic_speed else 'numerical' if numeric_speed else 'unknown'
        speed={'status':status,'method':'bounded-safe-symbolic' if self.analytic_speed else 'interval-relative-tolerance' if numeric_speed else 'interval-unresolved',
               'analyticIdentity':self.analytic_speed,'maximumRelativeSquareDifferenceUpperBound':0. if self.analytic_speed else max_speed_difference if certified else None,
               'tolerance':SPEED_TOLERANCE}
        return domain,speed,self.analytic_speed or numeric_speed

    def row(self,s):
        point=self.finite_point(s);result={'s':s}
        for key in ('c','d','cc','dd','cPrime','dPrime','ccPrime','ddPrime'):
            coordinate=key in ('c','cc');ruling=key in ('d','dd','dPrime','ddPrime')
            v=value(point[key]);normalized=v/self.world_scale if ruling else v
            world=v if ruling else v*self.world_scale
            if coordinate:world=world+self.origins[0 if key=='c' else 1]
            normalized_key='normalized'+{'c':'C','d':'D','cc':'CC','dd':'DD','cPrime':'CPrime','dPrime':'DPrime','ccPrime':'CCPrime','ddPrime':'DDPrime'}[key]
            result[key]=world.tolist();result[normalized_key]=normalized.tolist()
        return result,point


def query_curved_matched_pair(data):
    query=validate_curved_matched_pair_query(data)
    try:kernel=MatchedKernel(query)
    except MatchedPairError:raise
    except (ValueError,OverflowError,ZeroDivisionError) as error:
        raise MatchedPairError('source-domain','源曲线起点超出有限算术域或无法定义初始标架。') from error
    domain,speed,matching_bound=kernel.regular_domain()
    rows=[];grid=[];max_frame=max_metric=max_develop=max_speed=0.
    w_values=np.linspace(query['transverseStart'],query['transverseEnd'],query['rulingSegments']+1)
    def inspect(s,point):
        nonlocal max_frame,max_metric,max_develop,max_speed
        c,cc,d,dd,cp,ccp,dp,ddp=[value(point[k]) for k in ('c','cc','d','dd','cPrime','ccPrime','dPrime','ddPrime')]
        v2,v3=point['v2'].value,point['v3'].value
        speed_difference=abs(v2*v2-v3*v3)/max(1.,v2*v2,v3*v3)
        if speed_difference>2e-8:raise MatchedPairError('speed-mismatch','原同参数下两条源曲线速度不等；须显式重参数，不能自动换曲线。')
        max_speed=max(max_speed,abs(v2*v2-v3*v3))
        frame=np.column_stack([value(point[k]) for k in ('T','L','U')])
        max_frame=max(max_frame,float(np.max(np.abs(frame.T@frame-np.eye(3)))),abs(d@d-1),abs(dd@dd-1))
        max_develop=max(max_develop,abs(float(np.cross(ccp,dd)@ddp)))
        # J is affine in transverse parameter: endpoints certify the sampled
        # finite width; intervals above certify all common s values.
        for w in (w_values[0],w_values[-1]):
            jac=domain['jacobianOrientation']*float(np.linalg.det(np.column_stack((cp+w/kernel.world_scale*dp,d))))
            if jac<=1e-12:raise MatchedPairError('paper-singularity','原有限纸带的采样端点触焦线或发生倒向。')
        local_grid=[]
        for w in w_values:
            transverse=w/kernel.world_scale
            xs=cp+transverse*dp;ys=ccp+transverse*ddp
            max_metric=max(max_metric,abs(xs@xs-ys@ys),abs(xs@d-ys@dd),abs(d@d-dd@dd))
            flat=c+transverse*d;space=cc+transverse*dd
            local_grid.append({'s':s,'w':float(w),'flat':(kernel.origins[0]+kernel.world_scale*flat).tolist(),
                               'space':(kernel.origins[1]+kernel.world_scale*space).tolist(),
                               'normalizedFlat':flat.tolist(),'normalizedSpace':space.tolist()})
        return local_grid
    for s in np.linspace(query['parameterStart'],query['parameterEnd'],query['segments']+1):
        row,point=kernel.row(float(s));rows.append(row);grid.append(inspect(float(s),point))
    for s in np.linspace(query['parameterStart'],query['parameterEnd'],129):inspect(float(s),kernel.finite_point(float(s)))
    metric_verified=max_frame<=2e-7 and max_metric<=2e-7 and max_develop<=2e-7
    if not metric_verified:raise MatchedPairError('metric-validation','真实母线或第一基本形式的独立数值回读未通过。')
    return {'family':FAMILY,'query':query,
            'source':{'notebookCells':[3864,3867],'savedExampleCells':[3865,3868],'savedNumericalOut':False,
                      'method':'whitelist-AST/Taylor/Frenet-Darboux-ruling','parameterContract':'same-common-s/same-speed-required',
                      'interpolationContract':'source-derivatives/finite-numerical'},
            'diagnostics':{'validationNodes':129,'maximumFrameError':max_frame,'maximumMetricDifference':max_metric,
                           'maximumDevelopabilityError':max_develop,'maximumSpeedSquareDifference':max_speed,
                           'speedEquality':speed,'parameterDomain':domain},
            'certification':{'analyticSpeedEquality':kernel.analytic_speed,'finiteNumericalMetricVerified':metric_verified,
                             'numericalIsometryToleranceCertified':bool(matching_bound and domain['certified']),
                             'fullIntervalRegularityCertified':domain['certified'],
                             'analyticLocalIsometry':bool(kernel.analytic_speed and domain['certified']),
                             'planarPaperInjectivityCertified':domain['planarPaperInjective'],
                             'globalBoundaryInjectivityChecked':domain['planarPaperInjective'],
                             'originalSavedFormulaReplayed':False,'exactStraightCreaseFOLD':False,
                             'adoptableCreasePattern':False,'selfCollisionChecked':False,'continuousFoldPathChecked':False},
            'sample':{'rows':rows,'grid':grid}}
